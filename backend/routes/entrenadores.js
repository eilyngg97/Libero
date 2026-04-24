const express = require('express');
const router = express.Router();
const entrenadorController = require('../controllers/entrenadorController');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');
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

router.get('/', authMiddleware, rolMiddleware('admin'), entrenadorController.listarEntrenadores);
router.get('/staff-por-sede/:sedeId', authMiddleware, rolMiddleware('admin'), entrenadorController.listarStaffPorSede);
router.patch('/:id/vincular-sede', authMiddleware, rolMiddleware('admin'), entrenadorController.vincularEntrenadorASede);
router.patch('/:id/desvincular-sede', authMiddleware, rolMiddleware('admin'), entrenadorController.desvincularEntrenadorDeSede);
router.post('/', authMiddleware, rolMiddleware('admin'), upload.single('foto'), entrenadorController.crearEntrenador);

module.exports = router;
