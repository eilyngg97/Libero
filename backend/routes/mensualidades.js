const express = require('express');
const router = express.Router();
const mensualidadController = require('../controllers/mensualidadController');
const { authMiddleware, permisoMiddleware } = require('../middleware/auth');
const { ensureAlumnoOwnershipFromBody } = require('../middleware/ownership');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');

function resolveTenantId(req) {
	return resolveRequestTenantId(req);
}

function resolveComprobanteUploadDir(req) {
	const uploadDir = path.join(__dirname, '..', 'uploads', resolveTenantId(req), 'comprobantes');
	fs.mkdirSync(uploadDir, { recursive: true });
	return uploadDir;
}

const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, resolveComprobanteUploadDir(req)),
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname || '').toLowerCase();
		const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
		cb(null, name);
	}
});

const upload = multer({ storage });

// Generar mensualidades automáticamente
router.post('/generar', authMiddleware, permisoMiddleware('mensualidades.manage'), mensualidadController.generarMensualidadesMes);

// Registrar la primera mensualidad manualmente
router.post('/primera', authMiddleware, permisoMiddleware('mensualidades.manage'), upload.single('comprobante'), mensualidadController.registrarPrimeraMensualidad);
// Crear mensualidad del mes siguiente para permitir pago adelantado
router.post('/adelantar', authMiddleware, ensureAlumnoOwnershipFromBody('id_alumno'), mensualidadController.adelantarMensualidadSiguiente);
// Actualizar retrasados (día 6)
router.post('/actualizar-retrasados', authMiddleware, permisoMiddleware('mensualidades.manage'), mensualidadController.actualizarRetrasados);
// Consultar mensualidades
router.get('/', authMiddleware, mensualidadController.getMensualidades);
// Resumen por sede (mes en curso)
router.get('/resumen-por-sede', authMiddleware, permisoMiddleware('mensualidades.view'), mensualidadController.getResumenMensualidadesPorSede);
// Dolares pagados por sede agrupados por mes del año
router.get('/dolares-pagados-por-sede', authMiddleware, permisoMiddleware('mensualidades.view'), mensualidadController.getDolaresPagadosPorSede);
// Ingresos totales por mes para el anio seleccionado
router.get('/ingresos-por-mes', authMiddleware, permisoMiddleware('mensualidades.view'), mensualidadController.getIngresosPorMes);
// Ingresos totales por sede para el anio seleccionado
router.get('/ingresos-por-sede', authMiddleware, permisoMiddleware('mensualidades.view'), mensualidadController.getIngresosPorSede);
// Vista previa del impacto de ajuste por sede y periodo
router.post('/ajuste-sede/preview', authMiddleware, permisoMiddleware('mensualidades.manage'), mensualidadController.previewAjusteExtraordinarioSede);
// Aplicar ajuste extraordinario por sede y periodo
router.post('/ajuste-sede', authMiddleware, permisoMiddleware('mensualidades.manage'), mensualidadController.aplicarAjusteExtraordinarioSede);
// Confirmar mensualidad
router.patch('/:id/confirmar', authMiddleware, permisoMiddleware('mensualidades.manage'), mensualidadController.confirmarMensualidad);
// Editar mensualidad individual (monto y/o estatus)
router.patch('/:id', authMiddleware, permisoMiddleware('mensualidades.manage'), mensualidadController.editarMensualidadIndividual);
// Eliminar mensualidad y sus pagos
router.delete('/:id', authMiddleware, permisoMiddleware('mensualidades.manage'), mensualidadController.eliminarMensualidad);

module.exports = router;
