function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:p|div|br|li|tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : '');
}
function normalizeGmailMessage(message) {
  return {
    source: 'gmail', sourceId: message.id, sourceType: 'email',
    title: message.subject || '(no subject)',
    text: message.body?.text || htmlToText(message.body?.html) || message.snippet || '',
    from: message.from,
    link: message.id ? 'https://mail.google.com/mail/u/0/#inbox/' + encodeURIComponent(message.id) : null,
    occurredAt: message.receivedAt,
  };
}
function normalizeClassroomAnnouncement(item, courseName) {
  return {
    source: 'classroom', sourceId: item.courseId + ':announcement:' + item.id, sourceType: 'announcement',
    title: (courseName || 'Classroom') + ': ' + String(item.text || 'Announcement').split('\n')[0].slice(0, 160),
    text: item.text || '', from: courseName, courseId: item.courseId,
    link: item.alternateLink, occurredAt: item.updateTime || item.creationTime,
  };
}
function normalizeClassroomCourseWork(item, courseName) {
  let deadline = null;
  if (item.dueDate) {
    const { year, month, day } = item.dueDate;
    // Classroom's dueDate and dueTime are UTC, including omitted zero-valued components.
    const time = item.dueTime || {};
    deadline = new Date(Date.UTC(year, month - 1, day, time.hours || 0, time.minutes || 0, time.seconds || 0)).toISOString();
  }
  return {
    source: 'classroom', sourceId: item.courseId + ':courseWork:' + item.id, sourceType: 'courseWork',
    title: item.title || 'Classroom assignment', text: item.description || '',
    from: courseName, courseId: item.courseId, link: item.alternateLink,
    occurredAt: item.updateTime || item.creationTime, deadline,
  };
}
module.exports = { normalizeGmailMessage, normalizeClassroomAnnouncement, normalizeClassroomCourseWork, htmlToText };
