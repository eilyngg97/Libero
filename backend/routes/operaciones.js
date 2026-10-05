const express = require('express');
const { authMiddleware, permisoMiddleware } = require('../middleware/auth');
const operacionController = require('../controllers/operacionController');

const router = express.Router();

router.get('/', authMiddleware, permisoMiddleware('operaciones.view'), operacionController.listarOperaciones);

module.exports = router;