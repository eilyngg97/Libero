const express = require('express');
const router = express.Router();
const { login, selectRolActivo } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', login);
router.post('/select-role', authMiddleware, selectRolActivo);

module.exports = router;
