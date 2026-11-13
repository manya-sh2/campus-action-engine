const { extractStructuredInfo, safeUrl } = require('../ingestion/extractor');
const { evaluateEligibility } = require('./eligibility.service');
const { scoreImportance } = require('./importance.service');
const { scoreUrgency } = require('./urgency.service');
const { computePriority } = require('./priority.service');

const OPPORTUNITY_CATEGORIES = new Set(['job', 'internship', 'scholarship', 'event', 'registration']);
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
  // Store recognizable opportunities even when currently ineligible. Default feeds
  // filter them out; a profile correction can make them visible without re-importing.
  const { ignoreReason, ...facts } = raw;
  const occurredAt = item.occurredAt ? new Date(item.occurredAt) : null;
  return {
    ...facts,
    source: item.source, sourceId: item.sourceId, sourceType: item.sourceType,
    sourceLink: safeUrl(item.link), courseId: item.courseId || '',
    occurredAt: occurredAt && Number.isFinite(occurredAt.getTime()) ? occurredAt : null,
    ...scoreTask(raw, user),
  };
}
module.exports = { runPipeline, scoreTask, ItemIgnoredError, OPPORTUNITY_CATEGORIES };
