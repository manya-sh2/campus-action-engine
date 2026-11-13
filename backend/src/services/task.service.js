const Task = require('../models/Task');
const ApiError = require('../utils/ApiError');
const { scoreTask, OPPORTUNITY_CATEGORIES } = require('./decision/pipeline.service');

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'dismissed'];
const CATEGORIES = ['job', 'internship', 'assignment', 'exam', 'event', 'scholarship', 'registration', 'announcement', 'other'];
const LEVELS = ['critical', 'high', 'medium', 'low'];
const SORT_FIELDS = ['occurredAt', 'priorityScore', 'urgencyScore', 'importanceScore', 'deadline', 'createdAt'];

// Atomic insert-or-update: re-sync updates source facts, never the user's status.
async function upsertTask(userId, candidate) {
  const filter = { userId, source: candidate.source, sourceId: candidate.sourceId };
  const { status, userId: ignoredOwner, ...facts } = candidate;
  try {
    const result = await Task.updateOne(filter,
      { $set: { ...facts, userId }, $setOnInsert: { status: 'pending' } },
      { upsert: true, runValidators: true });
    return { created: result.upsertedCount === 1 };
  } catch (error) {
    if (error.code !== 11000) throw error;
    await Task.updateOne(filter, { $set: { ...facts, userId } }, { runValidators: true });
    return { created: false };
  }
}

// Re-evaluate this user's saved facts on reads: profile changes and time passage
// take effect before filtering, sorting and pagination. Writes are batched.
async function refreshScores(user) {
  const cursor = Task.find({ userId: user._id }).cursor();
  let operations = [];
  for await (const task of cursor) {
    const scores = scoreTask(task.toObject(), user);
    const changed = Object.entries(scores).some(([key, value]) =>
      JSON.stringify(task[key]) !== JSON.stringify(value));
    if (changed) operations.push({
      updateOne: { filter: { _id: task._id, userId: user._id }, update: { $set: scores } },
    });
    if (operations.length === 100) {
      await Task.bulkWrite(operations);
      operations = [];
    }
  }
  if (operations.length) await Task.bulkWrite(operations);
}

function integer(value, fallback, min, max, name) {
  if (value === undefined) return fallback;
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') throw ApiError.badRequest(name + ' must be an integer.');
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw ApiError.badRequest(name + ' is out of range.');
  return number;
}
function oneOf(value, values, name) {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !values.includes(value)) throw ApiError.badRequest('Invalid ' + name);
  return value;
}
function buildFilter(userId, options) {
  const filter = { userId };
  if (options.includeIneligible !== undefined && !['true', 'false'].includes(options.includeIneligible)) {
    throw ApiError.badRequest('includeIneligible must be true or false');
  }
  if (options.includeIneligible !== 'true') {
    filter.$or = [
      { category: { $nin: [...OPPORTUNITY_CATEGORIES] } },
      { eligibilityStatus: { $ne: 'ineligible' } },
    ];
  }
  for (const [key, allowed] of [['status', VALID_STATUSES], ['category', CATEGORIES], ['priorityLevel', LEVELS]]) {
    const value = oneOf(options[key], allowed, key);
    if (value) filter[key] = value;
  }
  if (options.minPriority !== undefined) filter.priorityScore = { $gte: integer(options.minPriority, 0, 0, 100, 'minPriority') };
  return filter;
}
async function listTasks(user, options = {}) {
  const page = integer(options.page, 1, 1, 100000, 'page');
  const limit = integer(options.limit, 20, 1, 100, 'limit');
  const sortBy = oneOf(options.sortBy, SORT_FIELDS, 'sortBy') || 'occurredAt';
  const sortOrder = oneOf(options.sortOrder, ['asc', 'desc'], 'sortOrder') || 'desc';
  const filter = buildFilter(user._id, options);
  await refreshScores(user);
  const direction = sortOrder === 'asc' ? 1 : -1;
  // Compute the fallback BEFORE sorting/pagination, so legacy tasks without a
  // source date are interleaved by import date instead of grouped at the end.
  // Aggregation does not cast match values automatically like find() does.
  const taskQuery = sortBy === 'occurredAt'
    ? Task.aggregate([
      { $match: { ...filter, userId: Task.schema.path('userId').cast(user._id) } },
      { $addFields: { _sortDate: { $ifNull: ['$occurredAt', '$createdAt'] } } },
      { $sort: { _sortDate: direction, _id: 1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: { _sortDate: 0 } },
    ])
    : Task.find(filter).sort({ [sortBy]: direction, _id: 1 }).skip((page - 1) * limit).limit(limit);
  const [tasks, total] = await Promise.all([
    taskQuery,
    Task.countDocuments(filter),
  ]);
  return { tasks, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
async function getHighPriorityTasks(user) {
  await refreshScores(user);
  return Task.find({
    ...buildFilter(user._id, {}),
    status: { $in: ['pending', 'in_progress'] },
    priorityLevel: { $in: ['critical', 'high'] },
  }).sort({ priorityScore: -1, _id: 1 }).limit(100);
}
async function getUpcomingDeadlines(user) {
  await refreshScores(user);
  return Task.find({
    ...buildFilter(user._id, {}),
    status: { $in: ['pending', 'in_progress'] },
    deadline: { $gt: new Date(), $lte: new Date(Date.now() + 14 * 86400000) },
  }).sort({ deadline: 1, _id: 1 }).limit(100);
}
async function getTaskById(user, taskId) {
  const task = await Task.findOne({ _id: taskId, userId: user._id });
  if (!task) throw ApiError.notFound('Task not found');
  return Object.assign(task, scoreTask(task.toObject(), user));
}
async function updateTaskStatus(userId, taskId, status) {
  if (!VALID_STATUSES.includes(status)) throw ApiError.badRequest('Invalid task status');
  const task = await Task.findOneAndUpdate({ _id: taskId, userId }, { $set: { status } }, { new: true, runValidators: true });
  if (!task) throw ApiError.notFound('Task not found');
  return task;
}
module.exports = { upsertTask, listTasks, getHighPriorityTasks, getUpcomingDeadlines, getTaskById, updateTaskStatus, refreshScores, integer };
