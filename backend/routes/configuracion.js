const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const configuracionController = require('../controllers/configuracionController');
const { authMiddleware, permisoMiddleware } = require('../middleware/auth');
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

const uploadMembreteConstancias = multer({
	storage: logoStorage,
	fileFilter: (req, file, cb) => {
		if (['image/png', 'image/jpeg'].includes(file.mimetype || '')) {
			cb(null, true);
			return;
		}
		cb(new Error('El membrete debe ser una imagen PNG o JPG.'));
	},
	limits: { fileSize: 10 * 1024 * 1024 }
});

router.get('/pagos', authMiddleware, configuracionController.getConfiguracionPagos);
router.get('/', authMiddleware, permisoMiddleware('configuracion.view'), configuracionController.getConfiguracionAdmin);
router.put('/', authMiddleware, permisoMiddleware('configuracion.manage'), configuracionController.upsertConfiguracionAdmin);
router.patch('/', authMiddleware, permisoMiddleware('configuracion.manage'), configuracionController.patchConfiguracionAdmin);
router.post('/logo', authMiddleware, permisoMiddleware('configuracion.manage'), uploadLogo.single('logo'), configuracionController.subirLogoAcademia);
router.post('/constancias/logos', authMiddleware, permisoMiddleware('configuracion.manage'), uploadLogosConstancias.array('logos', 3), configuracionController.subirLogosConstancias);
router.post('/constancias/membrete', authMiddleware, permisoMiddleware('configuracion.manage'), uploadMembreteConstancias.single('membrete'), configuracionController.subirMembreteConstancias);
router.delete('/constancias/membrete', authMiddleware, permisoMiddleware('configuracion.manage'), configuracionController.eliminarMembreteConstancias);
router.post('/constancias/retiro/logos', authMiddleware, permisoMiddleware('configuracion.manage'), uploadLogosConstancias.array('logos', 3), configuracionController.subirLogosConstanciaRetiro);
router.patch('/cambiar-clave', authMiddleware, configuracionController.cambiarClaveUsuario);

module.exports = router;
