const gmail = require('./google/gmail.service');
const classroom = require('./google/classroom.service');
const normalizer = require('./ingestion/normalizer');
const { runPipeline, ItemIgnoredError } = require('./decision/pipeline.service');
const { upsertTask } = require('./task.service');

async function syncUserTasks(user, options = {}) {
  const summary = { fetched: 0, created: 0, updated: 0, ignored: 0, failed: 0, errors: [], warnings: [] };
  const items = [];
  if (options.includeGmail !== false) {
    try {
      const limit = options.gmailMaxResults ?? 50;
      const { messages, hasMore } = await gmail.getMessageBatch(user.id, { q: options.gmailQuery, maxResults: limit });
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
  summary.fetched = items.length;
  for (const item of items) {
    try {
      const candidate = await runPipeline(item, user);
      const result = await upsertTask(user._id, candidate);
      summary[result.created ? 'created' : 'updated'] += 1;
    } catch (error) {
      if (error instanceof ItemIgnoredError) summary.ignored += 1;
      else {
        summary.failed += 1;
        summary.errors.push({ source: item.source, title: item.title, reason: error.message });
      }
    }
  }
  return summary;
}
module.exports = { syncUserTasks };
