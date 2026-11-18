const gmail = require('./google/gmail.service');
const classroom = require('./google/classroom.service');
const normalizer = require('./ingestion/normalizer');
const { runPipeline, ItemIgnoredError } = require('./decision/pipeline.service');
const { upsertTask } = require('./task.service');
const Task = require('../models/Task');
const { isPlacementCellSender } = require('./ingestion/extractor');

const ALLOWED_TASK_CATEGORIES = ['internship', 'job', 'exam', 'assignment'];
const DAY_MS = 24 * 60 * 60 * 1000;

async function syncUserTasks(user, options = {}) {
  const summary = { fetched: 0, created: 0, updated: 0, ignored: 0, failed: 0, errors: [], warnings: [] };
  const items = [];
  if (options.includeGmail !== false) {
    try {
      const limit = options.gmailMaxResults ?? 50;
      // Keep the Gmail import limited to messages received in the last 30 days.
      const query = ['newer_than:30d', options.gmailQuery].filter(Boolean).join(' ');
      const { messages, hasMore } = await gmail.getMessageBatch(user.id, { q: query, maxResults: limit });
      items.push(...messages.map(normalizer.normalizeGmailMessage));
      if (hasMore) summary.warnings.push(`Imported ${messages.length} Gmail messages (limit ${limit}). More messages match this query; they were not fetched in this sync. This is an import limit, not a sync failure.`);
    } catch (error) { summary.errors.push({ source: 'gmail', reason: error.message }); }
  }
  if (options.includeClassroom !== false) {
    try {
      const courses = await classroom.getCourses(user.id);
      let selected = courses;
      if (options.classroomCourseIds?.length) {
        const ids = new Set(options.classroomCourseIds);
        selected = courses.filter(course => ids.has(course.id));
      }
      // Bounded imports are explicit to the user rather than silently incomplete.
      if (selected.length > 20) summary.warnings.push('Imported the first 20 courses. Select course IDs to import additional courses.');
      for (const course of selected.slice(0, 20)) {
        for (const [type, fetch, normalize] of [
          ['announcements', classroom.getAnnouncements, normalizer.normalizeClassroomAnnouncement],
          ['coursework', classroom.getCourseWork, normalizer.normalizeClassroomCourseWork],
        ]) {
          try {
            const records = await fetch(user.id, course.id);
            items.push(...records.map(record => normalize(record, course.name)));
          } catch (error) { summary.errors.push({ source: 'classroom', courseId: course.id, type, reason: error.message }); }
        }
      }
    } catch (error) { summary.errors.push({ source: 'classroom', reason: error.message }); }
  }

  // Remove previously saved Gmail and Classroom tasks that no longer match
  // the common 30-day, category and deadline rules. Other sources are untouched.
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 30 * DAY_MS);
    const savedTasks = await Task.find({
      userId: user._id,
      source: { $in: ['gmail', 'classroom'] },
    }).select('_id source occurredAt deadline category organization').lean();

    const staleTaskIds = savedTasks.filter(task => {
      const sourceDate = task.occurredAt ? new Date(task.occurredAt) : null;
      const isRecent = sourceDate && Number.isFinite(sourceDate.getTime()) && sourceDate >= cutoff;
      const deadlineIsActive = !task.deadline || new Date(task.deadline) >= now;
      const categoryIsAllowed = ALLOWED_TASK_CATEGORIES.includes(task.category) ||
        (task.source === 'gmail' && isPlacementCellSender(task.organization));
      return !isRecent || !deadlineIsActive || !categoryIsAllowed;
    }).map(task => task._id);

    if (staleTaskIds.length) {
      await Task.deleteMany({
        userId: user._id,
        source: { $in: ['gmail', 'classroom'] },
        _id: { $in: staleTaskIds },
      });
    }
  } catch (error) {
    summary.errors.push({ source: 'cleanup', reason: error.message });
  }

  summary.fetched = items.length;
  for (const item of items) {
    try {
      const candidate = await runPipeline(item, user);
      const result = await upsertTask(user._id, candidate);
      summary[result.created ? 'created' : 'updated'] += 1;
    } catch (error) {
      if (error instanceof ItemIgnoredError) {
        summary.ignored += 1;
        // Remove an older copy if this source record no longer passes the filter.
        if (item.source === 'gmail' || item.source === 'classroom') {
          try {
            await Task.deleteOne({ userId: user._id, source: item.source, sourceId: item.sourceId });
          } catch (deleteError) {
            summary.failed += 1;
            summary.errors.push({ source: item.source, title: item.title, reason: deleteError.message });
          }
        }
      } else {
        summary.failed += 1;
        summary.errors.push({ source: item.source, title: item.title, reason: error.message });
      }
    }
  }
  return summary;
}
module.exports = { syncUserTasks };
