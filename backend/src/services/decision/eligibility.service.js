const { canonicalBranch } = require('../ingestion/branches');

function evaluateEligibility(user, extraction) {
  const criteria = extraction.eligibility || {};
  const reasons = [];
  let mismatch = false;
  let unknown = Boolean(criteria.needsReview);
  const hasCriteria = Boolean(criteria.branches?.length || criteria.minCgpa != null || criteria.graduationYears?.length || criteria.needsReview);
  function check(present, passes, label) {
    if (!present) { unknown = true; reasons.push(label + ': complete your profile to check.'); }
    else if (!passes) { mismatch = true; reasons.push(label + ': requirement not met.'); }
    else reasons.push(label + ': requirement met.');
  }
  if (criteria.branches?.length) {
    check(Boolean(user.branch), criteria.branches.map(canonicalBranch).includes(canonicalBranch(user.branch)),
      'Branch (' + criteria.branches.join(', ') + ')');
  }
  if (criteria.minCgpa != null) {
    check(typeof user.cgpa === 'number', user.cgpa >= criteria.minCgpa, 'Minimum CGPA ' + criteria.minCgpa);
  }
  if (criteria.graduationYears?.length) {
    check(Boolean(user.graduationYear), criteria.graduationYears.includes(user.graduationYear),
      'Graduation year (' + criteria.graduationYears.join(', ') + ')');
  }
  if (criteria.needsReview) reasons.push('Review additional eligibility conditions in the original.');
  if (!hasCriteria) reasons.push('No explicit eligibility requirements detected; verify the original before applying.');
  const status = mismatch ? 'ineligible' : unknown ? 'unknown' : 'eligible';
  return { status, eligible: mismatch ? false : unknown ? null : true, hasCriteria, reasons };
}
module.exports = { evaluateEligibility };
