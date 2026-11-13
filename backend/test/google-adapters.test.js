const { test } = require('node:test');
const assert = require('node:assert/strict');
const { google } = require('googleapis');
const oauth = require('../src/services/google/oauth.service');
const classroom = require('../src/services/google/classroom.service');
const gmail = require('../src/services/google/gmail.service');

test('Classroom adapter paginates published assignments and keeps old creation dates', async t => {
  t.mock.method(oauth, 'getAuthorizedClient', async id => { assert.equal(id, 'owner'); return {}; });
  const calls = [];
  t.mock.method(google, 'classroom', () => ({ courses: { courseWork: { list: async params => {
    calls.push(params);
    assert.deepEqual(params.courseWorkStates, ['PUBLISHED']);
    return params.pageToken
      ? { data: { courseWork: [{ id: 'second', creationTime: '2020-01-01' }] } }
      : { data: { courseWork: [{ id: 'first', dueTime: { hours: 10 } }], nextPageToken: 'page2' } };
  } } } }));
  const records = await classroom.getCourseWork('owner', 'course1');
  assert.equal(calls.length, 2);
  assert.equal(records.length, 2);
  assert.deepEqual(records[0].dueTime, { hours: 10 });
});

test('Gmail adapter uses the authenticated mailbox and decodes MIME bodies', async t => {
  t.mock.method(oauth, 'getAuthorizedClient', async id => { assert.equal(id, 'owner'); return {}; });
  t.mock.method(google, 'gmail', () => ({ users: { messages: {
    list: async params => {
      assert.equal(params.userId, 'me'); assert.equal(params.maxResults, 50); assert.ok(!('q' in params));
      return { data: { messages: [{ id: 'message1' }] } };
    },
    get: async params => {
      assert.equal(params.userId, 'me'); assert.equal(params.format, 'full');
      return { data: { id: params.id, payload: { headers: [{ name: 'Subject', value: 'Assignment' }], parts: [{ mimeType: 'text/plain', body: { data: Buffer.from('Due: 2027-12-20').toString('base64url') } }] } } };
    },
  } } }));
  const records = await gmail.getMessages('owner');
  assert.equal(records[0].subject, 'Assignment'); assert.equal(records[0].body.text, 'Due: 2027-12-20');
});

test('Gmail fills short pages up to the limit, deduplicates IDs and sorts source dates newest first', async t => {
  t.mock.method(oauth, 'getAuthorizedClient', async () => ({}));
  const listCalls = [], getCalls = [];
  const dates = { august: '2026-08-26T10:00:00Z', november: '2026-11-09T10:00:00Z', october: '2026-10-31T10:00:00Z' };
  t.mock.method(google, 'gmail', () => ({ users: { messages: {
    list: async params => {
      listCalls.push(params);
      assert.equal(params.q, 'after:2026/11/01');
      return params.pageToken
        ? { data: { messages: [{ id: 'august' }, { id: 'november' }, { id: 'october' }], nextPageToken: 'more' } }
        : { data: { messages: [{ id: 'august' }], nextPageToken: 'page2' } };
    },
    get: async ({ id }) => { getCalls.push(id); return { data: { id, internalDate: String(Date.parse(dates[id])) } }; },
  } } }));
  const result = await gmail.getMessageBatch('owner', { q: 'after:2026/11/01', maxResults: 3 });
  assert.deepEqual(result.messages.map(m => m.id), ['november', 'october', 'august']);
  assert.equal(result.messages[0].receivedAt, '2026-11-09T10:00:00.000Z');
  assert.deepEqual(listCalls.map(c => c.maxResults), [3, 2]);
  assert.equal(listCalls[1].pageToken, 'page2');
  assert.equal(new Set(getCalls).size, 3);
  assert.equal(getCalls.length, 3);
  assert.equal(result.hasMore, true);
});

test('Gmail default imports 50 messages in bounded batches and detects a real next page', async t => {
  t.mock.method(oauth, 'getAuthorizedClient', async () => ({}));
  let hasMore = false, running = 0, peak = 0;
  t.mock.method(google, 'gmail', () => ({ users: { messages: {
    list: async params => {
      assert.equal(params.maxResults, 50);
      assert.ok(!('q' in params));
      return { data: { messages: Array.from({ length: 50 }, (_, i) => ({ id: String(i) })), ...(hasMore ? { nextPageToken: 'more' } : {}) } };
    },
    get: async ({ id }) => {
      running++; peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, 1));
      running--;
      return { data: { id, internalDate: String(Date.parse('2026-11-01') + Number(id) * 86400000) } };
    },
  } } }));
  const exact = await gmail.getMessageBatch('owner', { q: '   ' });
  assert.equal(exact.messages.length, 50);
  assert.equal(exact.messages[0].id, '49');
  assert.equal(exact.hasMore, false);
  assert.ok(peak <= 10);
  hasMore = true;
  assert.equal((await gmail.getMessageBatch('owner')).hasMore, true);
});

test('OAuth URL asks only for Gmail and Classroom access and includes state', () => {
  const url = new URL(oauth.getAuthUrl('test-state'));
  assert.equal(url.searchParams.get('state'), 'test-state');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.ok(url.searchParams.get('scope').includes('gmail.readonly'));
  assert.ok(!url.searchParams.get('scope').includes('drive'));
});
