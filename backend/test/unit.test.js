const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractStructuredInfo, extractDeadline, extractEligibility, safeUrl } = require('../src/services/ingestion/extractor');
const { normalizeClassroomCourseWork, normalizeClassroomAnnouncement, normalizeGmailMessage } = require('../src/services/ingestion/normalizer');
const { evaluateEligibility } = require('../src/services/decision/eligibility.service');
const { runPipeline, ItemIgnoredError, scoreTask } = require('../src/services/decision/pipeline.service');
const { resolveDeadline } = require('../src/utils/timezone');
const validateUserInput = require('../src/utils/validateUserInput');
const { ALL_SCOPES } = require('../src/config/googleScopes');
const mapInBatches = require('../src/utils/mapInBatches');

const student = { branch: 'Mining', cgpa: 8.48, graduationYear: 2027, timezone: 'Asia/Kolkata', preferredCategories: ['internship'] };
const email = text => ({ source: 'gmail', sourceType: 'email', sourceId: '1', title: 'Internship application', text, occurredAt: new Date().toISOString() });

test('source dates survive Gmail and Classroom normalization and the pipeline', async () => {
  const receivedAt = new Date().toISOString();
  const records = [
    normalizeGmailMessage({ id: 'november', subject: 'Assignment', receivedAt }),
    normalizeClassroomCourseWork({ id: 'work', courseId: 'course', creationTime: '2026-08-26T10:00:00Z', updateTime: receivedAt }),
    normalizeClassroomAnnouncement({ id: 'notice', courseId: 'course', text: 'Room change', creationTime: receivedAt }),
  ];
  for (const item of records) {
    assert.equal((await runPipeline(item, student)).occurredAt.toISOString(), '2026-11-09T10:00:00.000Z');
  }
  for (const occurredAt of [undefined, null, 'invalid']) {
    assert.equal((await runPipeline({ ...records[0], occurredAt }, student)).occurredAt, null);
  }
});

test('extracts explicit facts and prioritizes a relevant opportunity', async () => {
  const candidate = await runPipeline(email('Apply now.\nEligible branches: Mining, CSE\nMinimum CGPA: 8\nGraduation year: 2027\nDeadline: 2099-12-20'), student);
  assert.equal(candidate.classification, 'ACTION_REQUIRED');
  assert.equal(candidate.category, 'internship');
  assert.equal(candidate.eligibilityStatus, 'eligible');
  assert.equal(candidate.importanceScore, 100);
  assert.equal(candidate.deadline.toISOString(), '2099-12-20T18:29:59.999Z');
});

test('irrelevant advertisements are ignored', async () => {
  await assert.rejects(runPipeline({ ...email('Shop now for a discount'), title: 'Weekend sale' }, student), ItemIgnoredError);
});

test('Gmail keeps only recent approved categories or Placement Cell sender emails', async t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-19T00:00:00.000Z'));
  const recent = '2026-11-15T10:00:00.000Z';
  const old = '2026-10-01T10:00:00.000Z';

  const internship = await runPipeline({
    ...email('Apply for this internship'),
    occurredAt: recent,
    title: 'Summer Internship Opportunity',
  }, student);
  assert.equal(internship.category, 'internship');

  const job = await runPipeline({
    ...email('Apply for this job'),
    occurredAt: recent,
    title: 'Graduate Job Opportunity',
  }, student);
  assert.equal(job.category, 'job');

  const placement = await runPipeline({
    ...email('Please read this important notice'),
    occurredAt: recent,
    from: 'Training & Placement Cell <tpo@example.edu>',
    title: 'Important Notice',
  }, student);
  assert.equal(placement.category, 'announcement');

  await assert.rejects(
    runPipeline({ ...email('Attend the workshop'), occurredAt: recent, title: 'Workshop' }, student),
    ItemIgnoredError
  );
  await assert.rejects(
    runPipeline({ ...email('Apply for this internship'), occurredAt: old }, student),
    ItemIgnoredError
  );
  await assert.rejects(
    runPipeline({ ...email('Submit your assignment. Due: 2020-01-01'), occurredAt: recent, title: 'Assignment' }, student),
    ItemIgnoredError
  );
});

test('missing profile information is unknown, never verified eligibility', () => {
  const result = evaluateEligibility({}, { eligibility: { branches: ['CSE'], minCgpa: 8, graduationYears: [2027] } });
  assert.equal(result.status, 'unknown'); assert.equal(result.eligible, null);
});

test('a definite mismatch takes precedence over incomplete profile data', () => {
  const result = evaluateEligibility(student, { eligibility: { branches: ['Civil'], minCgpa: 8, needsReview: true } });
  assert.equal(result.status, 'ineligible'); assert.equal(result.eligible, false);
});

test('branch aliases and unknown requirements are handled conservatively', () => {
  const parsed = extractEligibility('Eligible branches: Computer Science and Engineering\nMinimum CGPA: 7', []);
  assert.deepEqual(parsed.branches, ['CSE']);
  assert.equal(evaluateEligibility({ branch: 'CS', cgpa: 8 }, { eligibility: parsed }).status, 'eligible');
  const warnings = [];
  const unknown = extractEligibility('Eligible branches: Aerospace\nNo active backlogs', warnings);
  assert.equal(unknown.needsReview, true); assert.ok(warnings.length);
});

test('parses labelled ISO and named dates without using unrelated dates', () => {
  assert.equal(extractDeadline('Published: 2026-01-01\nDeadline: 20 December 2027', []), '2027-12-20');
  assert.equal(extractDeadline('Apply by December 20, 2027', []), '2027-12-20');
  assert.equal(extractDeadline('Deadline: 2027-12-20T10:15:00+05:30', []), '2027-12-20T04:45:00.000Z');
  assert.equal(extractDeadline('The event was announced on 2026-01-01', []), null);
});

test('invalid, relative and ambiguous deadlines are flagged instead of invented', () => {
  for (const input of ['2027-02-30', 'tomorrow', '03/04/2027', '2027-12-20 at 5 PM']) {
    const warnings = [];
    assert.equal(extractDeadline('Deadline: ' + input, warnings), null);
    assert.equal(warnings.length, 1);
  }
  assert.equal(resolveDeadline('2027-02-30', 'Asia/Kolkata'), null);
});

test('Classroom due time stays UTC, including omitted zero components', () => {
  const normalized = normalizeClassroomCourseWork({ id: '1', courseId: 'a', dueDate: { year: 2027, month: 12, day: 20 }, dueTime: { hours: 10, minutes: 30 } }, 'DBMS');
  assert.equal(normalized.deadline, '2027-12-20T10:30:00.000Z');
  const midnight = normalizeClassroomCourseWork({ id: '2', courseId: 'a', dueDate: { year: 2027, month: 12, day: 20 }, dueTime: {} });
  assert.equal(midnight.deadline, '2027-12-20T00:00:00.000Z');
});

test('Classroom IDs are unique across courses and record types', () => {
  const records = [normalizeClassroomCourseWork({ id: '1', courseId: 'a' }), normalizeClassroomCourseWork({ id: '1', courseId: 'b' }), normalizeClassroomAnnouncement({ id: '1', courseId: 'a' })];
  assert.equal(new Set(records.map(record => record.sourceId)).size, 3);
});

test('HTML-only Gmail bodies retain deadline text and are not rendered as markup', () => {
  const normalized = normalizeGmailMessage({ id: 'email', body: { html: '<p>Assignment</p><p>Deadline: 2027-12-20</p><script>attack()</script>' } });
  assert.ok(normalized.text.includes('Deadline: 2027-12-20'));
  assert.ok(!normalized.text.includes('attack'));
  assert.equal(extractStructuredInfo(normalized).deadline, '2027-12-20');
});

test('priority rises as deadlines approach and profile preferences affect relevance', t => {
  const task = { category: 'internship', eligibility: {}, deadline: '2027-12-20T00:00:00Z' };
  t.mock.method(Date, 'now', () => Date.parse('2027-11-01T00:00:00Z'));
  const early = scoreTask(task, student);
  t.mock.method(Date, 'now', () => Date.parse('2027-12-19T12:00:00Z'));
  const soon = scoreTask(task, student);
  assert.ok(soon.priorityScore > early.priorityScore);
  assert.equal(soon.priorityLevel, 'critical');
  assert.ok(scoreTask(task, { ...student, preferredCategories: [] }).importanceScore < soon.importanceScore);
});

test('overdue assignments are retained by the pipeline', async () => {
  const candidate = await runPipeline({ ...email('Submit your assignment.\nDue: 2020-01-01'), title: 'Assignment' }, student);
  assert.equal(candidate.urgencyScore, 100);
});

test('profile input rejects identity changes, operators and malformed values', () => {
  for (const payload of [{ email: 'other@example.edu' }, { googleId: 'another-id' }, { $set: { cgpa: 10 } }, { cgpa: '8' }, { timezone: 'not/a/timezone' }, { year: 1.5 }, null, []]) {
    assert.ok(validateUserInput(payload).length);
  }
  assert.deepEqual(validateUserInput({ cgpa: null, branch: null, preferredCategories: ['internship'] }), []);
});

test('only safe links and Gmail/Classroom read-only scopes are used', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('https://classroom.google.com/'), 'https://classroom.google.com/');
  assert.ok(!ALL_SCOPES.some(scope => scope.includes('drive') || scope.includes('modify')));
});

test('batched fetching keeps input order and never exceeds the batch size', async () => {
  let running = 0; let peak = 0;
  const results = await mapInBatches([1, 2, 3, 4, 5, 6, 7], 3, async n => {
    running += 1; peak = Math.max(peak, running);
    await new Promise(resolve => setTimeout(resolve, 5 * (8 - n)));
    running -= 1;
    return n * 10;
  });
  assert.deepEqual(results, [10, 20, 30, 40, 50, 60, 70]);
  assert.equal(peak, 3);
  assert.deepEqual(await mapInBatches([], 3, async n => n), []);
});
