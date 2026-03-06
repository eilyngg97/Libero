const express = require('express');
const router = express.Router();
const cumpleanerosController = require('../controllers/cumpleanerosController');
const { authMiddleware } = require('../middleware/auth');

// Ruta para obtener los alumnos que cumplen años este mes
router.get('/mes', authMiddleware, cumpleanerosController.getCumpleanerosMes);

module.exports = router;
