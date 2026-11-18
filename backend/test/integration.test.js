// Uses a disposable real MongoDB process, never the database from backend/.env.
process.env.TOKEN_ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('hex');
process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, mkdir } = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/User');
const Task = require('../src/models/Task');
const Session = require('../src/models/Session');
const auth = require('../src/services/auth.service');
const { runPipeline } = require('../src/services/decision/pipeline.service');
const { upsertTask } = require('../src/services/task.service');
const sample = require('./fixtures');
const oauth = require('../src/services/google/oauth.service');
const gmail = require('../src/services/google/gmail.service');
const classroom = require('../src/services/google/classroom.service');
const GoogleConnection = require('../src/models/GoogleConnection');

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('REST and MongoDB end-to-end regression suite', { timeout: 90000 }, async t => {
  const port = await freePort();
  const root = path.resolve(__dirname, '../tmp');
  await mkdir(root, { recursive: true });
  const dbpath = await mkdtemp(path.join(root, 'mongo-test-'));
  const binary = process.env.MONGOD_BINARY || (process.platform === 'win32' ? 'C:\\Program Files\\MongoDB\\Server\\8.3\\bin\\mongod.exe' : 'mongod');
  const mongo = spawn(binary, ['--dbpath', dbpath, '--port', String(port), '--bind_ip', '127.0.0.1'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  mongo.stdout.on('data', chunk => { output += chunk; });
  mongo.stderr.on('data', chunk => { output += chunk; });
  let spawnError;
  mongo.on('error', error => { spawnError = error; });
  t.after(async () => {
    await mongoose.disconnect();
    if (mongo.pid && mongo.exitCode === null) {
      const exited = new Promise(resolve => mongo.once('exit', resolve));
      mongo.kill();
      await exited;
    }
  });
  for (let attempt = 0; attempt < 60 && !output.includes('Waiting for connections'); attempt++) {
    if (spawnError) throw spawnError;
    if (mongo.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(output.includes('Waiting for connections'), output.slice(-2000));
  await mongoose.connect('mongodb://127.0.0.1:' + port + '/cae_test');
  await Promise.all([User.init(), Task.init(), Session.init()]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function request(route, { method = 'GET', cookie, body, origin } = {}) {
    const response = await fetch(base + route, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
    return { status: response.status, data, headers: response.headers };
  }
  // Google responses are substituted only inside this test process.
  t.mock.method(oauth, 'exchangeCodeForTokens', async () => ({ access_token: 'test-access', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600000, scope: 'openid email profile' }));
  t.mock.method(oauth, 'getGoogleProfile', async () => ({ googleId: 'google-test-student', email: 'student@example.edu', name: 'Test Student' }));
  t.mock.method(gmail, 'getMessageBatch', async () => ({ messages: sample.gmailMessages, hasMore: false }));
  t.mock.method(classroom, 'getCourses', async () => sample.classroomCourses);
  t.mock.method(classroom, 'getAnnouncements', async (_userId, courseId) => sample.classroomAnnouncements.filter(item => item.courseId === courseId));
  t.mock.method(classroom, 'getCourseWork', async (_userId, courseId) => sample.classroomCourseWork.filter(item => item.courseId === courseId));
  let cookie, owner, assignment;
  await t.test('protected routes require login and removed routes do not exist', async () => {
    for (const route of ['/api/tasks', '/api/gmail/messages', '/api/classroom/courses']) assert.equal((await request(route)).status, 401);
    for (const route of ['/mcp', '/api/drive/files']) assert.equal((await request(route)).status, 404);
    assert.equal((await request('/api/users', { method: 'POST', body: { email: 'x@example.edu' } })).status, 401);
  });
  await t.test('removed demo endpoints cannot create a session', async () => {
    assert.equal((await request('/api/auth/sample', { method: 'POST', body: {} })).status, 404);
    assert.equal((await request('/api/auth/config')).status, 404);
  });
  await t.test('OAuth rejects invalid state before exchanging a code', async () => {
    const result = await request('/api/auth/google/callback?code=test&state=wrong', { cookie: 'cae_oauth_state=expected' });
    assert.equal(result.status, 302);
    assert.ok(result.headers.get('location').includes('invalid_state'));
    assert.equal(oauth.exchangeCodeForTokens.mock.calls.length, 0);
  });
  await t.test('a failed Google sign-in returns to the app with a message and no session', async () => {
    oauth.exchangeCodeForTokens.mock.mockImplementationOnce(async () => { throw new Error('simulated Google outage'); });
    const result = await request('/api/auth/google/callback?code=test&state=expected', { cookie: 'cae_oauth_state=expected' });
    assert.equal(result.status, 302);
    assert.ok(result.headers.get('location').includes('googleAuthError='));
    assert.ok(!result.headers.get('location').includes('simulated'));
    assert.ok(!(result.headers.getSetCookie().some(value => value.startsWith('cae_session='))));
  });
  await t.test('OAuth callback creates an encrypted connection and hashed session', async () => {
    const result = await request('/api/auth/google/callback?code=test&state=expected', { cookie: 'cae_oauth_state=expected' });
    assert.equal(result.status, 302);
    const sessionCookie = result.headers.getSetCookie().find(value => value.startsWith('cae_session='));
    cookie = sessionCookie.split(';')[0];
    assert.ok(sessionCookie.includes('HttpOnly'));
    const me = await request('/api/auth/me', { cookie });
    assert.equal(me.data.data.email, 'student@example.edu');
    owner = await User.findById(me.data.data._id);
    const session = await Session.findOne({ userId: owner._id });
    assert.notEqual(session.tokenHash, cookie.split('=')[1]);
    const connection = await GoogleConnection.findOne({ userId: owner._id }).select('+accessToken +refreshToken');
    assert.notEqual(connection.accessToken, 'test-access');
    assert.equal(require('../src/utils/crypto').decrypt(connection.refreshToken), 'test-refresh');
    await request('/api/users/' + owner.id, { method: 'PATCH', cookie, body: { branch: 'Mining', cgpa: 8.5, graduationYear: 2027, preferredCategories: ['internship'] } });
    owner = await User.findById(owner.id);
  });
  await t.test('legacy non-Google sessions are rejected', async () => {
    const legacy = await User.create({ name: 'Legacy fixture', email: 'legacy@example.edu' });
    const session = await auth.createSession(legacy.id);
    assert.equal((await request('/api/auth/me', { cookie: 'cae_session=' + session.rawToken })).status, 401);
  });
  await t.test('imports both sources, ignores advertisements and filters ineligible opportunities', async () => {
    const result = await request('/api/tasks/sync', { method: 'POST', cookie, body: {} });
    assert.equal(result.status, 200);
    assert.deepEqual({ ...result.data.data, warnings: [] }, { fetched: 6, created: 4, updated: 0, ignored: 2, failed: 0, errors: [], warnings: [] });
    const visible = await request('/api/tasks', { cookie });
    assert.equal(visible.data.data.pagination.total, 4);
    const all = await request('/api/tasks?includeIneligible=true', { cookie });
    assert.equal(all.data.data.pagination.total, 4);
    assignment = await Task.findOne({ userId: owner._id, category: 'assignment' });
  });
  await t.test('re-sync is idempotent, updates deadlines and preserves completion', async () => {
    await request('/api/tasks/' + assignment.id + '/status', { method: 'PATCH', cookie, body: { status: 'completed' } });
    const oldTime = assignment.deadline.getTime();
    const original = sample.classroomCourseWork[0].dueDate;
    sample.classroomCourseWork[0].dueDate = { year: 2099, month: 12, day: 20 };
    try {
      const result = await request('/api/tasks/sync', { method: 'POST', cookie, body: {} });
      assert.equal(result.data.data.created, 0); assert.equal(result.data.data.updated, 4);
      const updated = await Task.findById(assignment._id);
      assert.equal(updated.status, 'completed'); assert.notEqual(updated.deadline.getTime(), oldTime);
      assert.equal(await Task.countDocuments({ userId: owner._id }), 4);
      const high = await request('/api/tasks/priority/high', { cookie });
      assert.ok(!high.data.data.some(task => task._id === assignment.id));
    } finally { sample.classroomCourseWork[0].dueDate = original; }
  });
  await t.test('Gmail sync keeps only recent allowed categories and Placement Cell emails', async () => {
    const student = await User.create({ name: 'Gmail filter test', email: 'gmail-filter@example.edu', googleId: 'gmail-filter-test-id' });
    const session = await auth.createSession(student._id);
    const testCookie = 'cae_session=' + session.rawToken;
    const now = Date.now();
    const recent = new Date(now - 5 * 86400000).toISOString();
    const old = new Date(now - 40 * 86400000).toISOString();
    const messages = [
      { id: 'recent-internship', subject: 'Software Internship Opportunity', from: 'Careers <careers@example.edu>', body: { text: 'Apply now. Deadline: 2099-12-20' }, receivedAt: recent },
      { id: 'recent-job', subject: 'Graduate Job Opportunity', from: 'Recruitment <jobs@example.edu>', body: { text: 'Apply for this job.' }, receivedAt: recent },
      { id: 'placement-notice', subject: 'Important Notice', from: 'Training & Placement Cell <tpo@example.edu>', body: { text: 'Please read this important notice.' }, receivedAt: recent },
      { id: 'expired-exam', subject: 'Examination Notice', from: 'Academic Office <office@example.edu>', body: { text: 'Examination details. Deadline: 2020-01-01' }, receivedAt: recent },
      { id: 'old-assignment', subject: 'Assignment', body: { text: 'Submit this assignment. Deadline: 2099-12-20' }, receivedAt: old },
      { id: 'newsletter', subject: 'Weekly Newsletter', body: { text: 'General campus updates.' }, receivedAt: recent },
    ];

    const oldSavedTask = await runPipeline({
      source: 'gmail', sourceType: 'email', sourceId: 'already-saved-old-mail',
      title: 'Internship Application', text: 'Apply now',
      occurredAt: recent,
    }, student);
    await upsertTask(student._id, oldSavedTask);
    await Task.updateOne(
      { userId: student._id, source: 'gmail', sourceId: 'already-saved-old-mail' },
      { $set: { occurredAt: new Date(old) } }
    );

    gmail.getMessageBatch.mock.mockImplementationOnce(async (_id, options) => {
      assert.equal(options.q, 'newer_than:30d');
      assert.equal(options.maxResults, 50);
      return { messages, hasMore: false };
    });
    classroom.getCourses.mock.mockImplementationOnce(async () => []);

    const result = await request('/api/tasks/sync', { method: 'POST', cookie: testCookie, body: {} });
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.data, {
      fetched: 6, created: 3, updated: 0, ignored: 3, failed: 0, errors: [], warnings: [],
    });

    const stored = await Task.find({ userId: student._id, source: 'gmail' }).sort({ sourceId: 1 });
    assert.deepEqual(stored.map(task => task.sourceId), ['placement-notice', 'recent-internship', 'recent-job']);
    assert.ok(stored.every(task => ['internship', 'job', 'announcement'].includes(task.category)));
  });
  await t.test('concurrent imports cannot create duplicate tasks', async () => {
    const candidate = await runPipeline({ source: 'gmail', sourceType: 'email', sourceId: 'race', title: 'Assignment', text: 'Submit assignment', occurredAt: new Date().toISOString() }, owner);
    await Promise.all(Array.from({ length: 5 }, () => upsertTask(owner._id, candidate)));
    assert.equal(await Task.countDocuments({ userId: owner._id, sourceId: 'race' }), 1);
  });
  await t.test('overdue work is visible and pagination is stable', async () => {
    await Task.updateOne({ _id: assignment._id }, { $set: { status: 'pending', deadline: new Date('2020-01-01') } });
    const list = await request('/api/tasks?category=assignment', { cookie });
    const overdue = list.data.data.tasks.find(task => task._id === assignment.id);
    assert.equal(overdue.urgencyScore, 100);
    const upcoming = await request('/api/tasks/deadlines/upcoming', { cookie });
    assert.ok(!upcoming.data.data.some(task => task._id === assignment.id));
    const first = await request('/api/tasks?limit=1&page=1', { cookie });
    const second = await request('/api/tasks?limit=1&page=2', { cookie });
    assert.notEqual(first.data.data.tasks[0]._id, second.data.data.tasks[0]._id);
  });
  await t.test('profile changes immediately re-evaluate saved opportunities', async () => {
    const result = await request('/api/users/' + owner.id, { method: 'PATCH', cookie, body: { branch: 'Civil' } });
    assert.equal(result.status, 200);
    const list = await request('/api/tasks', { cookie });
    assert.ok(!list.data.data.tasks.some(task => task.category === 'internship'));
  });
  await t.test('another user cannot read or mutate the owner data', async () => {
    const other = await User.create({ name: 'Other', email: 'other@example.edu', googleId: 'other-test-google-id' });
    const session = await auth.createSession(other._id);
    const otherCookie = 'cae_session=' + session.rawToken;
    assert.equal((await request('/api/tasks/' + assignment.id, { cookie: otherCookie })).status, 404);
    assert.equal((await request('/api/tasks/' + assignment.id + '/status', { method: 'PATCH', cookie: otherCookie, body: { status: 'completed', userId: owner.id } })).status, 404);
    assert.equal((await request('/api/users/' + owner.id, { cookie: otherCookie })).status, 403);
    assert.equal((await request('/api/tasks?userId=' + owner.id, { cookie: otherCookie })).data.data.pagination.total, 0);
  });
  await t.test('malformed inputs and identity takeover attempts fail', async () => {
    for (const body of [{ email: 'other@example.edu' }, { googleId: 'hijack' }, { $set: { cgpa: 10 } }]) {
      assert.equal((await request('/api/users/' + owner.id, { method: 'PATCH', cookie, body })).status, 400);
    }
    for (const query of ['status[$ne]=completed&status=x', 'page=1.5', 'limit=Infinity', 'priorityLevel=anything']) {
      assert.equal((await request('/api/tasks?' + query, { cookie })).status, 400);
    }
    assert.equal((await request('/api/tasks/sync', { method: 'POST', cookie, body: { includeGmail: 'false' } })).status, 400);
    assert.equal((await request('/api/auth/logout', { method: 'POST', cookie, origin: 'https://untrusted.example' })).status, 403);
  });
  await t.test('expired sessions and logout invalidate access', async () => {
    const expired = await auth.createSession(owner._id);
    await Session.updateOne({ userId: owner._id, tokenHash: require('crypto').createHash('sha256').update(expired.rawToken).digest('hex') }, { expiresAt: new Date(0) });
    assert.equal((await request('/api/auth/me', { cookie: 'cae_session=' + expired.rawToken })).status, 401);
    assert.equal((await request('/api/auth/logout', { method: 'POST', cookie })).status, 200);
    assert.equal((await request('/api/auth/me', { cookie })).status, 401);
  });
});
