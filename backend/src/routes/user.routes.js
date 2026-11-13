const router = require('express').Router();
const controller = require('../controllers/user.controller');
const requireAuth = require('../middlewares/auth.middleware');
router.use(requireAuth);
router.get('/:id', controller.getUserById);
router.patch('/:id', controller.updateUser);
module.exports = router;
