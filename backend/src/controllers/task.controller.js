const syncService = require('../services/sync.service');
const taskService = require('../services/task.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const ApiError = require('../utils/ApiError');

const syncTasks = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (Array.isArray(body)) throw ApiError.badRequest('Expected an object');
  for (const field of ['includeGmail', 'includeClassroom']) {
    if (body[field] !== undefined && typeof body[field] !== 'boolean') throw ApiError.badRequest(field + ' must be boolean');
  }
  if (body.includeGmail === false && body.includeClassroom === false) throw ApiError.badRequest('Select at least one source');
  if (body.gmailQuery !== undefined && (typeof body.gmailQuery !== 'string' || body.gmailQuery.length > 500)) throw ApiError.badRequest('Invalid Gmail query');
  if (body.classroomCourseIds !== undefined &&
      (!Array.isArray(body.classroomCourseIds) || body.classroomCourseIds.length > 20 ||
       !body.classroomCourseIds.every(id => typeof id === 'string' && /^[\w-]{1,100}$/.test(id)))) {
    throw ApiError.badRequest('Provide at most 20 valid course IDs');
  }
  const summary = await syncService.syncUserTasks(req.user, {
    includeGmail: body.includeGmail !== false, includeClassroom: body.includeClassroom !== false,
    gmailQuery: body.gmailQuery,
    gmailMaxResults: taskService.integer(body.gmailMaxResults, 50, 1, 100, 'gmailMaxResults'),
    classroomCourseIds: body.classroomCourseIds,
  });
  sendSuccess(res, { message: summary.errors.length ? 'Sync finished with errors' : 'Sync complete', data: summary });
});
const listTasks = asyncHandler(async (req, res) => sendSuccess(res, { data: await taskService.listTasks(req.user, req.query) }));
const getHighPriorityTasks = asyncHandler(async (req, res) => sendSuccess(res, { data: await taskService.getHighPriorityTasks(req.user) }));
const getUpcomingDeadlines = asyncHandler(async (req, res) => sendSuccess(res, { data: await taskService.getUpcomingDeadlines(req.user) }));
const getTaskById = asyncHandler(async (req, res) => sendSuccess(res, { data: await taskService.getTaskById(req.user, req.params.taskId) }));
const updateTaskStatus = asyncHandler(async (req, res) => sendSuccess(res, {
  message: 'Task status updated', data: await taskService.updateTaskStatus(req.user._id, req.params.taskId, req.body?.status),
}));
module.exports = { syncTasks, listTasks, getHighPriorityTasks, getUpcomingDeadlines, getTaskById, updateTaskStatus };
