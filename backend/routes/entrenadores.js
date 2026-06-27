const express = require('express');
const router = express.Router();
const entrenadorController = require('../controllers/entrenadorController');
const { authMiddleware, permisoMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');

function resolveTenantId(req) {
	return resolveRequestTenantId(req);
}

function resolveEntrenadorUploadDir(req) {
	const uploadDir = path.join(__dirname, '..', 'uploads', resolveTenantId(req), 'entrenadores');
	fs.mkdirSync(uploadDir, { recursive: true });
	return uploadDir;
}

const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, resolveEntrenadorUploadDir(req)),
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname || '').toLowerCase();
		const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
		cb(null, name);
	}
});

const upload = multer({ storage });

router.get('/', authMiddleware, permisoMiddleware('entrenadores.view'), entrenadorController.listarEntrenadores);
router.get('/staff-por-sede/:sedeId', authMiddleware, permisoMiddleware('entrenadores.view'), entrenadorController.listarStaffPorSede);
router.patch('/:id/vincular-sede', authMiddleware, permisoMiddleware('entrenadores.manage'), entrenadorController.vincularEntrenadorASede);
router.patch('/:id/desvincular-sede', authMiddleware, permisoMiddleware('entrenadores.manage'), entrenadorController.desvincularEntrenadorDeSede);
router.post('/', authMiddleware, permisoMiddleware('entrenadores.manage'), upload.single('foto'), entrenadorController.crearEntrenador);

module.exports = router;
