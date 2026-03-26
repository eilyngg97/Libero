const express = require('express');
const router = express.Router();
const mensualidadController = require('../controllers/mensualidadController');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');
const { ensureAlumnoOwnershipFromBody } = require('../middleware/ownership');

// Generar mensualidades automáticamente
router.post('/generar', authMiddleware, rolMiddleware('admin'), mensualidadController.generarMensualidadesMes);

// Registrar la primera mensualidad manualmente
router.post('/primera', authMiddleware, rolMiddleware('admin'), mensualidadController.registrarPrimeraMensualidad);
// Crear mensualidad del mes siguiente para permitir pago adelantado
router.post('/adelantar', authMiddleware, ensureAlumnoOwnershipFromBody('id_alumno'), mensualidadController.adelantarMensualidadSiguiente);
// Actualizar retrasados (día 6)
router.post('/actualizar-retrasados', authMiddleware, rolMiddleware('admin'), mensualidadController.actualizarRetrasados);
// Consultar mensualidades
router.get('/', authMiddleware, mensualidadController.getMensualidades);
// Resumen por sede (mes en curso)
router.get('/resumen-por-sede', authMiddleware, rolMiddleware('admin'), mensualidadController.getResumenMensualidadesPorSede);
// Vista previa del impacto de ajuste por sede y periodo
router.post('/ajuste-sede/preview', authMiddleware, rolMiddleware('admin'), mensualidadController.previewAjusteExtraordinarioSede);
// Aplicar ajuste extraordinario por sede y periodo
router.post('/ajuste-sede', authMiddleware, rolMiddleware('admin'), mensualidadController.aplicarAjusteExtraordinarioSede);
// Confirmar mensualidad
router.patch('/:id/confirmar', authMiddleware, rolMiddleware('admin'), mensualidadController.confirmarMensualidad);

module.exports = router;
