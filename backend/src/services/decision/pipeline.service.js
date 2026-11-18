const { extractStructuredInfo, safeUrl, isPlacementCellSender } = require('../ingestion/extractor');
const { evaluateEligibility } = require('./eligibility.service');
const { scoreImportance } = require('./importance.service');
const { scoreUrgency } = require('./urgency.service');
const { computePriority } = require('./priority.service');
const { resolveDeadline } = require('../../utils/timezone');

const OPPORTUNITY_CATEGORIES = new Set(['job', 'internship', 'scholarship', 'event', 'registration']);
const ALLOWED_CATEGORIES = new Set(['internship', 'job', 'exam', 'assignment']);
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
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

  if (item.source === 'gmail' || item.source === 'classroom') {
    const sourceDate = item.occurredAt ? new Date(item.occurredAt) : null;
    const cutoff = Date.now() - LOOKBACK_MS;
    if (!sourceDate || !Number.isFinite(sourceDate.getTime()) || sourceDate.getTime() < cutoff) {
      throw new ItemIgnoredError('Record is not within the last 30 days.');
    }
    const isAllowedCategory = ALLOWED_CATEGORIES.has(raw.category);
    const isPlacementCellEmail = item.source === 'gmail' && isPlacementCellSender(item.from);
    if (!isAllowedCategory && !isPlacementCellEmail) {
      throw new ItemIgnoredError('Record is outside the selected categories.');
    }
  }

  // Reject expired deadlines from both Gmail and Classroom before priority scoring.
  const parsedDeadline = resolveDeadline(raw.deadline, user && user.timezone);
  if ((item.source === 'gmail' || item.source === 'classroom') &&
      parsedDeadline && parsedDeadline.getTime() < Date.now()) {
    throw new ItemIgnoredError('Record deadline has already passed.');
  }

  // Keep the existing rule-based scoring for every item that passes the filter.
  const scores = scoreTask(raw, user);

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
