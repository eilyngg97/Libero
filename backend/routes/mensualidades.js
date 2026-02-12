const express = require('express');
const router = express.Router();
const mensualidadController = require('../controllers/mensualidadController');

// Generar mensualidades automáticamente
router.post('/generar', mensualidadController.generarMensualidadesMes);

// Registrar la primera mensualidad manualmente
router.post('/primera', mensualidadController.registrarPrimeraMensualidad);
// Actualizar retrasados (día 6)
router.post('/actualizar-retrasados', mensualidadController.actualizarRetrasados);
// Consultar mensualidades
router.get('/', mensualidadController.getMensualidades);
// Resumen por sede (mes en curso)
router.get('/resumen-por-sede', mensualidadController.getResumenMensualidadesPorSede);
// Confirmar mensualidad
router.patch('/:id/confirmar', mensualidadController.confirmarMensualidad);

module.exports = router;
