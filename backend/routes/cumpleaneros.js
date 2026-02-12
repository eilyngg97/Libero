const express = require('express');
const router = express.Router();
const cumpleanerosController = require('../controllers/cumpleanerosController');

// Ruta para obtener los alumnos que cumplen años este mes
router.get('/mes', cumpleanerosController.getCumpleanerosMes);

module.exports = router;
