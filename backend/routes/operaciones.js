const express = require('express');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');
const operacionController = require('../controllers/operacionController');

const router = express.Router();

router.get('/', authMiddleware, rolMiddleware('admin'), operacionController.listarOperaciones);

module.exports = router;