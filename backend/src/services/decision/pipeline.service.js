const { extractStructuredInfo, safeUrl, isPlacementCellSender } = require('../ingestion/extractor');
const { evaluateEligibility } = require('./eligibility.service');
const { scoreImportance } = require('./importance.service');
const { scoreUrgency } = require('./urgency.service');
const { computePriority } = require('./priority.service');

const OPPORTUNITY_CATEGORIES = new Set(['job', 'internship', 'scholarship', 'event', 'registration']);
const GMAIL_ALLOWED_CATEGORIES = new Set(['internship', 'job', 'exam', 'assignment']);
const GMAIL_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
class ItemIgnoredError extends Error {
  constructor(reason) { super(reason); this.name = 'ItemIgnoredError'; }
}
function scoreTask(extraction, user) {
  const eligibility = evaluateEligibility(user, extraction);
  const importance = scoreImportance({ user, extraction, eligibilityResult: eligibility });
  const urgency = scoreUrgency({ extraction: { ...extraction, deadline: extraction.deadline instanceof Date ? extraction.deadline.toISOString() : extraction.deadline }, user });
  const priority = computePriority({ importance, urgency });
  return {
    isEligible: eligibility.eligible,
    eligibilityStatus: eligibility.status,
    eligibilityReasons: eligibility.reasons,
    importanceScore: importance.score,
    urgencyScore: urgency.score,
    priorityScore: priority.score,
    priorityLevel: priority.level,
    priorityReasons: priority.reasons,
    deadline: urgency.deadline,
  };
}
async function runPipeline(item, user) {
  const raw = extractStructuredInfo(item);
  if (raw.classification === 'IGNORE') throw new ItemIgnoredError(raw.ignoreReason);

  if (item.source === 'gmail') {
    const receivedAt = item.occurredAt ? new Date(item.occurredAt) : null;
    const cutoff = Date.now() - GMAIL_LOOKBACK_MS;
    if (!receivedAt || !Number.isFinite(receivedAt.getTime()) || receivedAt.getTime() < cutoff) {
      throw new ItemIgnoredError('Email was not received within the last 30 days.');
    }
    if (!GMAIL_ALLOWED_CATEGORIES.has(raw.category) && !isPlacementCellSender(item.from)) {
      throw new ItemIgnoredError('Email is outside the selected categories.');
    }
  }

  // Keep the existing rule-based scoring for every item that passes the filter.
  const scores = scoreTask(raw, user);
  if (item.source === 'gmail' && scores.deadline && scores.deadline.getTime() < Date.now()) {
    throw new ItemIgnoredError('Email deadline has already passed.');
  }

  // Store recognizable opportunities even when currently ineligible. Default feeds
  // filter them out; a profile correction can make them visible without re-importing.
  const { ignoreReason, ...facts } = raw;
  const occurredAt = item.occurredAt ? new Date(item.occurredAt) : null;
  return {
    ...facts,
    source: item.source, sourceId: item.sourceId, sourceType: item.sourceType,
    sourceLink: safeUrl(item.link), courseId: item.courseId || '',
    occurredAt: occurredAt && Number.isFinite(occurredAt.getTime()) ? occurredAt : null,
    ...scores,
  };
}
module.exports = { runPipeline, scoreTask, ItemIgnoredError, OPPORTUNITY_CATEGORIES };
