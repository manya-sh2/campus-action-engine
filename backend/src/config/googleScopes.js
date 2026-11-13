const SCOPES = {
  IDENTITY: ['openid', 'email', 'profile'],
  GMAIL: ['https://www.googleapis.com/auth/gmail.readonly'],
  CLASSROOM: [
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.announcements.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  ],
};
const ALL_SCOPES = [...SCOPES.IDENTITY, ...SCOPES.GMAIL, ...SCOPES.CLASSROOM];
module.exports = { SCOPES, ALL_SCOPES };
