const express = require('express');
const router = express.Router();
const entrenadorController = require('../controllers/entrenadorController');
const { authMiddleware, rolMiddleware, permisoMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');

function resolveTenantId(req) {
	return resolveRequestTenantId(req);
}

function resolveEntrenadorUploadDir(req, file) {
	const subfolder = file?.fieldname === 'certificaciones' ? 'certificaciones' : '';
	const uploadDir = path.join(__dirname, '..', 'uploads', resolveTenantId(req), 'entrenadores', subfolder);
	fs.mkdirSync(uploadDir, { recursive: true });
	return uploadDir;
}

const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, resolveEntrenadorUploadDir(req, file)),
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname || '').toLowerCase();
		const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
		cb(null, name);
	}
});

const upload = multer({
	storage,
	fileFilter: (req, file, cb) => {
		if (file.fieldname === 'certificaciones') {
			const isPdf = path.extname(file.originalname || '').toLowerCase() === '.pdf';
			if (!isPdf) {
				return cb(new Error('Solo se permiten archivos PDF para certificaciones'));
			}
		}

		cb(null, true);
	}
});

router.get('/', authMiddleware, rolMiddleware('admin'), entrenadorController.listarEntrenadores);
router.get('/actividades-pendientes-nomina', authMiddleware, rolMiddleware('admin'), entrenadorController.listarActividadesPendientesNomina);
router.get('/staff-por-sede/:sedeId', authMiddleware, rolMiddleware('admin'), entrenadorController.listarStaffPorSede);
router.post('/:id/pagos', authMiddleware, rolMiddleware('admin'), upload.single('comprobante'), entrenadorController.registrarPagoNominaEntrenador);
router.patch('/:id/vincular-sede', authMiddleware, rolMiddleware('admin'), entrenadorController.vincularEntrenadorASede);
router.patch('/:id/desvincular-sede', authMiddleware, rolMiddleware('admin'), entrenadorController.desvincularEntrenadorDeSede);
router.patch('/:id/estado', authMiddleware, rolMiddleware('admin'), entrenadorController.actualizarEstadoEntrenador);
router.delete('/:id', authMiddleware, rolMiddleware('admin'), entrenadorController.eliminarEntrenador);
router.patch(
	'/:id',
	authMiddleware,
	rolMiddleware('admin'),
	upload.fields([
		{ name: 'foto', maxCount: 1 },
		{ name: 'certificaciones', maxCount: 10 }
	]),
	entrenadorController.editarEntrenador
);
router.post(
	'/',
	authMiddleware,
	rolMiddleware('admin'),
	upload.fields([
		{ name: 'foto', maxCount: 1 },
		{ name: 'certificaciones', maxCount: 10 }
	]),
	entrenadorController.crearEntrenador
);

module.exports = router;
