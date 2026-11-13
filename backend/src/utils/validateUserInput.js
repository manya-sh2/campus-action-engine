const EDITABLE_FIELDS = ['name', 'branch', 'year', 'graduationYear', 'cgpa', 'preferredCategories', 'timezone'];
const CATEGORIES = ['job', 'internship', 'assignment', 'exam', 'event', 'scholarship', 'registration', 'announcement'];
function validateUserInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ['Expected a profile object'];
  const errors = [];
  for (const key of Object.keys(body)) if (!EDITABLE_FIELDS.includes(key)) errors.push('Cannot update field: ' + key);
  for (const field of ['name', 'branch', 'timezone']) {
    if (!(field in body)) continue;
    if (field === 'branch' && body[field] === null) continue;
    if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > 100) errors.push('Invalid ' + field);
  }
  for (const [field, min, max] of [['year', 1, 6], ['graduationYear', 2000, 2100], ['cgpa', 0, 10]]) {
    if (!(field in body) || body[field] === null) continue;
    if (typeof body[field] !== 'number' || !Number.isFinite(body[field]) ||
        body[field] < min || body[field] > max || (field !== 'cgpa' && !Number.isInteger(body[field]))) errors.push('Invalid ' + field);
  }
  if ('preferredCategories' in body && (!Array.isArray(body.preferredCategories) || body.preferredCategories.length > CATEGORIES.length ||
      !body.preferredCategories.every(value => CATEGORIES.includes(value)))) errors.push('Invalid preferredCategories');
  if (typeof body.timezone === 'string') {
    try { new Intl.DateTimeFormat('en-US', { timeZone: body.timezone }); }
    catch { errors.push('Invalid timezone'); }
  }
  return errors;
}
module.exports = validateUserInput;
