const { google } = require('googleapis');
const oauthService = require('./oauth.service');
const translateGoogleError = require('../../utils/translateGoogleError');
const ApiError = require('../../utils/ApiError');

function requireId(value, label) {
  if (typeof value !== 'string' || !/^[\w-]{1,100}$/.test(value)) throw ApiError.badRequest('Invalid ' + label);
}
// Read each page, including assignments created earlier than a week ago.
async function collect(list, field, params) {
  const result = [];
  let pageToken;
  do {
    const { data } = await list({ ...params, pageSize: 100, pageToken }, { timeout: 15000 });
    result.push(...(data[field] || []));
    pageToken = data.nextPageToken;
    if (pageToken && result.length >= 1000) throw ApiError.badRequest('This Classroom collection exceeds the 1000-record import limit.');
  } while (pageToken);
  return result;
}
async function getCourses(userId) {
  const client = await oauthService.getAuthorizedClient(userId);
  const api = google.classroom({ version: 'v1', auth: client });
  try {
    return await collect(api.courses.list.bind(api.courses), 'courses', { courseStates: ['ACTIVE'] });
  } catch (error) { throw translateGoogleError(error, 'Google Classroom'); }
}
async function getAnnouncements(userId, courseId) {
  requireId(courseId, 'courseId');
  const client = await oauthService.getAuthorizedClient(userId);
  const api = google.classroom({ version: 'v1', auth: client });
  try {
    return await collect(api.courses.announcements.list.bind(api.courses.announcements), 'announcements', { courseId, announcementStates: ['PUBLISHED'] });
  } catch (error) { throw translateGoogleError(error, 'Google Classroom'); }
}
async function getCourseWork(userId, courseId) {
  requireId(courseId, 'courseId');
  const client = await oauthService.getAuthorizedClient(userId);
  const api = google.classroom({ version: 'v1', auth: client });
  try {
    return await collect(api.courses.courseWork.list.bind(api.courses.courseWork), 'courseWork', { courseId, courseWorkStates: ['PUBLISHED'] });
  } catch (error) { throw translateGoogleError(error, 'Google Classroom'); }
}
async function getCourseWorkDetails(userId, courseId, courseWorkId) {
  requireId(courseId, 'courseId'); requireId(courseWorkId, 'courseWorkId');
  const client = await oauthService.getAuthorizedClient(userId);
  const api = google.classroom({ version: 'v1', auth: client });
  try {
    const { data } = await api.courses.courseWork.get({ courseId, id: courseWorkId }, { timeout: 15000 });
    return data;
  } catch (error) { throw translateGoogleError(error, 'Google Classroom'); }
}
module.exports = { getCourses, getAnnouncements, getCourseWork, getCourseWorkDetails };
