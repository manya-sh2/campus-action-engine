const userService = require('../services/user.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const ApiError = require('../utils/ApiError');
function assertOwnProfile(req) {
  if (req.params.id !== String(req.user._id)) throw ApiError.forbidden('You can only access your own profile.');
}
const getUserById = asyncHandler(async (req, res) => {
  assertOwnProfile(req);
  sendSuccess(res, { data: await userService.findUserById(req.user._id) });
});
const updateUser = asyncHandler(async (req, res) => {
  assertOwnProfile(req);
  sendSuccess(res, { message: 'User updated', data: await userService.updateUserProfile(req.user._id, req.body) });
});
module.exports = { getUserById, updateUser };
