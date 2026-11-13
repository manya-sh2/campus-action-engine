const { google } = require('googleapis');
const oauthService = require('./oauth.service');
const translateGoogleError = require('../../utils/translateGoogleError');
const ApiError = require('../../utils/ApiError');
const mapInBatches = require('../../utils/mapInBatches');

// Gmail allows a limited number of requests per user per second, so message
// bodies are fetched a few at a time rather than all at once.
const FETCH_BATCH_SIZE = 10;

function decodeBase64Url(data) {
  if (!data) return '';
  return Buffer.from(data, 'base64').toString('utf8');
}

// Gmail message bodies come as a tree of MIME parts. Walk it to collect
// the plain-text and HTML bodies wherever they appear.
function extractBody(payload) {
  let text = '';
  let html = '';

  function walk(part) {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body && part.body.data) {
      text += decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
      html += decodeBase64Url(part.body.data);
    }
    if (Array.isArray(part.parts)) {
      part.parts.forEach(walk);
    }
  }

  walk(payload);

  // Single-part messages carry the body directly, not under `parts`.
  if (!text && !html && payload && payload.body && payload.body.data) {
    text = decodeBase64Url(payload.body.data);
  }

  return { text, html };
}

function extractAttachments(payload, acc = []) {
  if (!payload) return acc;

  if (payload.filename && payload.body && (payload.body.attachmentId || payload.body.size)) {
    acc.push({
      filename: payload.filename,
      mimeType: payload.mimeType,
      size: payload.body.size,
      attachmentId: payload.body.attachmentId,
    });
  }

  if (Array.isArray(payload.parts)) {
    payload.parts.forEach((p) => extractAttachments(p, acc));
  }

  return acc;
}

function getHeader(headers, name) {
  const header = (headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header ? header.value : undefined;
}

// Turns Gmail's raw message shape into something a future ingestion
// layer can consume directly, without embedding any priority/eligibility
// decisions here.
function normalizeMessage(raw) {
  const headers = raw.payload ? raw.payload.headers : [];
  const { text, html } = extractBody(raw.payload);

  return {
    id: raw.id,
    threadId: raw.threadId,
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    subject: getHeader(headers, 'Subject'),
    snippet: raw.snippet,
    body: { text, html },
    attachments: extractAttachments(raw.payload),
    receivedAt: raw.internalDate ? new Date(Number(raw.internalDate)).toISOString() : undefined,
    labelIds: raw.labelIds || [],
  };
}

/**
 * @param {string} userId - application user id (from req.user.id, never from request body)
 * @param {{ q?: string, maxResults?: number }} options
 */
async function getMessageBatch(userId, options = {}) {
  const maxResults = options.maxResults === undefined ? 50 : options.maxResults;
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100) throw ApiError.badRequest('maxResults must be between 1 and 100');
  if (options.q !== undefined && (typeof options.q !== 'string' || options.q.length > 500)) throw ApiError.badRequest('Invalid Gmail query');

  const client = await oauthService.getAuthorizedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth: client });

  try {
    const messageRefs = [];
    const seenIds = new Set();
    const seenPages = new Set();
    let pageToken;
    do {
      const { data } = await gmail.users.messages.list({
        userId: 'me', maxResults: maxResults - messageRefs.length,
        // An absent/empty query means no application-imposed date filter.
        ...(options.q?.trim() ? { q: options.q.trim() } : {}),
        ...(pageToken ? { pageToken } : {}),
      }, { timeout: 15000 });
      for (const ref of data.messages || []) {
        if (!seenIds.has(ref.id) && messageRefs.length < maxResults) {
          seenIds.add(ref.id);
          messageRefs.push(ref);
        }
      }
      pageToken = data.nextPageToken;
      if (pageToken && seenPages.has(pageToken)) throw ApiError.badGateway('Gmail returned a repeated page token. Please retry sync.');
      if (pageToken) seenPages.add(pageToken);
    } while (pageToken && messageRefs.length < maxResults);

    const messages = await mapInBatches(messageRefs, FETCH_BATCH_SIZE, async (ref) => {
      const { data } = await gmail.users.messages.get({ userId: 'me', id: ref.id, format: 'full' }, { timeout: 15000 });
      return normalizeMessage(data);
    });

    messages.sort((a, b) => (Date.parse(b.receivedAt) || 0) - (Date.parse(a.receivedAt) || 0) || a.id.localeCompare(b.id));
    return { messages, hasMore: Boolean(pageToken) };
  } catch (err) {
    throw translateGoogleError(err, 'Gmail');
  }
}

// Preserve the existing array response for GET /api/gmail/messages.
async function getMessages(userId, options = {}) {
  return (await getMessageBatch(userId, options)).messages;
}

async function getMessageById(userId, messageId) {

  const client = await oauthService.getAuthorizedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth: client });

  try {
    const { data } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
    return normalizeMessage(data);
  } catch (err) {
    throw translateGoogleError(err, 'Gmail');
  }
}

module.exports = { getMessages, getMessageBatch, getMessageById };
