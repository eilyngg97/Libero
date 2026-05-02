const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const configuracionController = require('../controllers/configuracionController');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');

function resolveTenantId(req) {
	return resolveRequestTenantId(req);
}

const logoStorage = multer.diskStorage({
	destination: (req, file, cb) => {
		const tenantId = resolveTenantId(req);
		const uploadDir = path.join(__dirname, '..', 'uploads', tenantId, 'branding');
		fs.mkdirSync(uploadDir, { recursive: true });
		cb(null, uploadDir);
	},
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname || '').toLowerCase();
		const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
		cb(null, name);
	}
});

const uploadLogo = multer({
	storage: logoStorage,
	fileFilter: (req, file, cb) => {
		if ((file.mimetype || '').startsWith('image/')) {
			cb(null, true);
			return;
		}
		cb(new Error('Solo se permiten imagenes para el logo.'));
	},
	limits: { fileSize: 5 * 1024 * 1024 }
});

const uploadLogosConstancias = multer({
	storage: logoStorage,
	fileFilter: (req, file, cb) => {
		if ((file.mimetype || '').startsWith('image/')) {
			cb(null, true);
			return;
		}
		cb(new Error('Solo se permiten imagenes para logos de constancias.'));
	},
	limits: { fileSize: 5 * 1024 * 1024, files: 3 }
});

router.get('/pagos', authMiddleware, configuracionController.getConfiguracionPagos);
router.get('/', authMiddleware, rolMiddleware('admin'), configuracionController.getConfiguracionAdmin);
router.put('/', authMiddleware, rolMiddleware('admin'), configuracionController.upsertConfiguracionAdmin);
router.patch('/', authMiddleware, rolMiddleware('admin'), configuracionController.patchConfiguracionAdmin);
router.post('/logo', authMiddleware, rolMiddleware('admin'), uploadLogo.single('logo'), configuracionController.subirLogoAcademia);
router.post('/constancias/logos', authMiddleware, rolMiddleware('admin'), uploadLogosConstancias.array('logos', 3), configuracionController.subirLogosConstancias);
router.patch('/cambiar-clave', authMiddleware, configuracionController.cambiarClaveUsuario);

module.exports = router;
