// Automated test fixtures only. Application code never imports this file.
const now = Date.now();
const daysFromNow = days => new Date(now + days * 86400000);
const isoDay = days => daysFromNow(days).toISOString().slice(0, 10);
const gmailMessages = [
  {
    id: 'test-internship', subject: 'Summer software internship applications',
    from: 'Campus Careers <careers@example.edu>',
    body: { text: 'Apply for the software internship.\nEligible branches: Mining, CSE, IT\nMinimum CGPA: 7.0\nGraduation year: 2027\nDeadline: ' + isoDay(3) },
    receivedAt: new Date(now).toISOString(),
  },
  {
    id: 'test-ineligible', subject: 'Civil engineering scholarship',
    from: 'Scholarships <funding@example.edu>',
    body: { text: 'Apply for the scholarship.\nEligible branches: Civil\nMinimum CGPA: 8\nDeadline: ' + isoDay(10) },
  },
  {
    id: 'test-exam', subject: 'Exam schedule change',
    from: 'Academic Office <office@example.edu>',
    body: { text: 'The exam room has changed to Hall B. Read the revised timetable before attending.' },
  },
  { id: 'test-promo', subject: 'Weekend sale: discount coupon', body: { text: 'Shop now.' } },
];
const due = daysFromNow(2);
const classroomCourses = [{ id: 'test-course', name: 'Database Management Systems', courseState: 'ACTIVE' }];
const classroomAnnouncements = [{
  id: 'test-announcement', courseId: 'test-course',
  text: 'Class cancelled tomorrow. The revised timetable will be shared in class.',
  alternateLink: 'https://classroom.google.com/', state: 'PUBLISHED',
}];
const classroomCourseWork = [{
  id: 'test-assignment', courseId: 'test-course', title: 'SQL joins assignment',
  description: 'Complete the exercises on inner joins and grouping. Submit your solutions in Classroom.',
  dueDate: { year: due.getUTCFullYear(), month: due.getUTCMonth() + 1, day: due.getUTCDate() },
  dueTime: { hours: due.getUTCHours(), minutes: due.getUTCMinutes() },
  alternateLink: 'https://classroom.google.com/', state: 'PUBLISHED', workType: 'ASSIGNMENT',
}];
module.exports = { gmailMessages, classroomCourses, classroomAnnouncements, classroomCourseWork };
