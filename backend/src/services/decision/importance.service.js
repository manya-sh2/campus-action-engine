const CATEGORY_SCORES = {
  assignment: 60, exam: 60, scholarship: 45, internship: 45, job: 45,
  registration: 45, event: 25, announcement: 30, other: 15,
};
function scoreImportance({ user, extraction, eligibilityResult }) {
  const eligibilityScore = eligibilityResult.status === 'eligible' ? 40 : eligibilityResult.status === 'unknown' ? 20 : 0;
  const preferred = (user.preferredCategories || []).includes(extraction.category);
  const categoryScore = preferred ? 60 : (CATEGORY_SCORES[extraction.category] || 15);
  return {
    score: eligibilityScore + categoryScore,
    reasons: [
      'Eligibility ' + eligibilityResult.status + ' (+' + eligibilityScore + ')',
      (preferred ? 'Preferred category ' : 'Category ') + extraction.category + ' (+' + categoryScore + ')',
    ],
  };
}
module.exports = { scoreImportance };
