const { aliases } = require('./branches');

const CATEGORY_RULES = [
  ['scholarship', /\b(scholarship|fellowship)\b/i],
  ['internship', /\binternships?\b/i],
  ['job', /\b(jobs?|placement|recruitment|hiring)\b/i],
  ['exam', /\b(exams?|examinations?|quizzes|midterms?|endsem)\b/i],
  ['assignment', /\b(assignments?|homework|lab report|problem set)\b/i],
  ['registration', /\b(course registration|semester registration|enrolment|enrollment)\b/i],
  ['event', /\b(workshop|seminar|hackathon|competition|campus event)\b/i],
  ['announcement', /\b(timetable|schedule change|class cancelled|class canceled|room change|academic notice|results published)\b/i],
];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Recognize common names used by a college placement office in the sender field.
function isPlacementCellSender(sender) {
  return /\b(?:training\s*(?:and|&)\s*placement|placement(?:\s*(?:cell|office|team))?|tpo|tnp|t\s*&\s*p)\b/i.test(String(sender || ''));
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Only labelled, unambiguous dates are accepted. Never guess a year or timezone.
function extractDeadline(text, warnings) {
  const line = text.match(/\b(?:deadline|due date|due|last date|apply by|register by|submit by)\s*(?:is|on|:|-)?\s*([^\n;]+)/i);
  if (!line) return null;
  const value = line[1].trim();
  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  let year, month, day, tail;
  if (match) {
    [, year, month, day, tail] = match;
  } else {
    match = value.match(/^(\d{1,2})\s+([a-z]+)\s*,?\s*(\d{4})(.*)$/i);
    if (match) {
      day = match[1]; month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1; year = match[3]; tail = match[4];
    } else {
      match = value.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})(.*)$/i);
      if (match) {
        month = MONTHS.indexOf(match[1].slice(0, 3).toLowerCase()) + 1; day = match[2]; year = match[3]; tail = match[4];
      }
    }
  }
  if (!match || !validDate(Number(year), Number(month), Number(day))) {
    warnings.push('Deadline format was not recognized. Check the original message.');
    return null;
  }
  const dateOnly = [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
  if (/\d{1,2}:\d{2}|\d\s*(am|pm)\b|^T/i.test(tail)) {
    const timestamp = value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})(?=$|\s|[.,])/i);
    if (timestamp && !Number.isNaN(Date.parse(timestamp[0]))) return new Date(timestamp[0]).toISOString();
    warnings.push('Deadline time needs review. Use the original message for the exact time.');
    return null;
  }
  return dateOnly;
}

function extractEligibility(text, warnings) {
  const criteria = { branches: [], minCgpa: null, graduationYears: [], needsReview: false };
  const branchLine = text.match(/(?:^|[\n;])\s*(?:eligible\s+)?branches?\s*:\s*([^\n;]+)/i);
  if (branchLine && !/^(all|any)(?:\s+branches)?\s*\.?$/i.test(branchLine[1].trim())) {
    const branchText = branchLine[1].replace(/\.$/, '').trim();
    const parts = aliases[branchText.toLowerCase()] ? [branchText] : branchText.split(/\s*(?:,|\/|\band\b|\bor\b|&)\s*/i);
    for (const part of parts) {
      const branch = aliases[part.toLowerCase().trim()];
      if (branch) criteria.branches.push(branch);
      else criteria.needsReview = true;
    }
    // A partially recognized allow-list cannot prove a branch mismatch.
    if (criteria.needsReview) criteria.branches = [];
  }
  const cgpa = text.match(/\b(?:minimum|min\.?)\s*cgpa\s*[:=]?\s*(\d+(?:\.\d+)?)/i) ||
    text.match(/\bcgpa\s*(?:>=|≥|:|of|minimum)\s*(\d+(?:\.\d+)?)/i) ||
    text.match(/\bcgpa\s+(\d+(?:\.\d+)?)\s*\+/i);
  if (cgpa && Number(cgpa[1]) >= 0 && Number(cgpa[1]) <= 10) criteria.minCgpa = Number(cgpa[1]);
  const years = text.match(/\b(?:graduation years?|graduating(?: in)?|batch(?:es)?(?: of)?)\s*:?\s*((?:20\d{2})(?:\s*(?:,|\/|or|and)\s*20\d{2})*)/i);
  if (years) criteria.graduationYears = [...new Set(years[1].match(/20\d{2}/g).map(Number))];
  if ((/\bcgpa\b/i.test(text) && criteria.minCgpa === null) ||
      (/\b(eligible|eligibility|branches|only)\b/i.test(text) && !branchLine && !/\b(?:all|any) branches\b/i.test(text)) ||
      (/\b(graduating|batch)\b/i.test(text) && !years) ||
      /\b(no (?:active )?backlogs?|citizenship|nationality|only female|only male)\b/i.test(text)) {
    criteria.needsReview = true;
  }
  if (criteria.needsReview) warnings.push('Some eligibility conditions need manual review in the original message.');
  return criteria;
}

function extractStructuredInfo(item) {
  const title = String(item.title || 'Academic update').trim().slice(0, 300);
  const text = String(item.text || '').slice(0, 30000);
  const combined = title + '\n' + text;
  const warnings = [];
  const isCourseWork = item.sourceType === 'courseWork';
  const placementCellEmail = item.source === 'gmail' && isPlacementCellSender(item.from);
  let category = isCourseWork ? 'assignment' : (CATEGORY_RULES.find(([, pattern]) => pattern.test(combined)) || ['other'])[0];
  if (placementCellEmail && category === 'other') category = 'announcement';
  const marketing = /\b(sale|discount|coupon|newsletter|digest|unsubscribe from offers)\b/i.test(title);
  const relevant = isCourseWork || placementCellEmail || (!marketing && (category !== 'other' || item.source === 'classroom'));
  const informationalChange = /\b(cancelled|canceled|schedule change|room change|results published)\b/i.test(combined);
  const action = !informationalChange && (isCourseWork || /\b(apply|register|submit|complete|attend|pay|upload|fill)\b/i.test(combined) ||
    ['assignment', 'exam', 'registration'].includes(category));
  const deadline = item.deadline !== undefined ? item.deadline : extractDeadline(combined, warnings);
  const eligibility = extractEligibility(combined, warnings);
  return {
    classification: relevant ? (action ? 'ACTION_REQUIRED' : 'IMPORTANT_INFORMATION') : 'IGNORE',
    ignoreReason: relevant ? null : 'No academic task or update matched the supported rules',
    title,
    category: category === 'other' && item.source === 'classroom' ? 'announcement' : category,
    description: text.replace(/\s+/g, ' ').trim().slice(0, 600),
    organization: item.from || null,
    deadline,
    eligibility,
    parsingWarnings: warnings,
    actionRequired: action ? 'Review and take action' : 'Read update',
    actionUrl: safeUrl(item.link),
  };
}
module.exports = { extractStructuredInfo, extractDeadline, extractEligibility, safeUrl, isPlacementCellSender };
