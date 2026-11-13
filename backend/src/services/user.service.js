const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const validateUserInput = require('../utils/validateUserInput');

async function findUserById(id) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}
async function updateUserProfile(id, updates) {
  const errors = validateUserInput(updates);
  if (errors.length) throw ApiError.badRequest('Validation failed', errors);
  const user = await User.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}
module.exports = { findUserById, updateUserProfile };
