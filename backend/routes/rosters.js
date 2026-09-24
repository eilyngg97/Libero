const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');
const rosterController = require('../controllers/rosterController');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');

const router = express.Router();

const rosterLogoStorage = multer.diskStorage({
	destination: (req, file, cb) => {
		const tenantId = resolveRequestTenantId(req);
		const uploadDir = path.join(__dirname, '..', 'uploads', tenantId, 'rosters');
		fs.mkdirSync(uploadDir, { recursive: true });
		cb(null, uploadDir);
	},
	filename: (req, file, cb) => {
		const extension = path.extname(file.originalname || '').toLowerCase();
		cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
	}
});

const uploadRosterLogo = multer({
	storage: rosterLogoStorage,
	fileFilter: (req, file, cb) => {
		if ((file.mimetype || '').startsWith('image/')) return cb(null, true);
		return cb(new Error('Solo se permiten imagenes para los logos del roster.'));
	},
	limits: { fileSize: 5 * 1024 * 1024 }
});

router.get('/', authMiddleware, rolMiddleware('admin'), rosterController.listarRosters);
router.get('/eligible-students', authMiddleware, rolMiddleware('admin'), rosterController.obtenerEstudiantesElegibles);
router.post('/', authMiddleware, rolMiddleware('admin'), rosterController.crearRoster);
router.patch('/:id/status', authMiddleware, rolMiddleware('admin'), rosterController.actualizarEstatusRoster);
router.patch('/:id/jugadores', authMiddleware, rolMiddleware('admin'), rosterController.actualizarJugadoresRoster);
router.post('/:id/prestamos', authMiddleware, rolMiddleware('admin'), uploadRosterLogo.fields([
	{ name: 'foto', maxCount: 1 },
	{ name: 'foto_cedula', maxCount: 1 }
]), rosterController.agregarPrestamoRoster);
router.patch('/:id/prestamos/:prestamoId', authMiddleware, rolMiddleware('admin'), uploadRosterLogo.fields([
	{ name: 'foto', maxCount: 1 },
	{ name: 'foto_cedula', maxCount: 1 }
]), rosterController.actualizarPrestamoRoster);
router.delete('/:id/prestamos/:prestamoId', authMiddleware, rolMiddleware('admin'), rosterController.eliminarPrestamoRoster);
router.patch('/:id/jugadores/:alumnoId/estado', authMiddleware, rolMiddleware('admin'), rosterController.actualizarEstadoJugadorRoster);
router.delete('/:id', authMiddleware, rolMiddleware('admin'), rosterController.eliminarRoster);
router.get('/template', authMiddleware, rolMiddleware('admin'), rosterController.obtenerPlantillaRoster);
router.patch('/template', authMiddleware, rolMiddleware('admin'), rosterController.actualizarPlantillaRoster);
router.post('/template/logos', authMiddleware, rolMiddleware('admin'), uploadRosterLogo.single('logo'), rosterController.subirLogoPlantillaRoster);
router.get('/:id/documento', authMiddleware, rolMiddleware('admin'), rosterController.obtenerDocumentoRoster);
router.patch('/:id/documento', authMiddleware, rolMiddleware('admin'), rosterController.actualizarDocumentoRoster);
router.post('/:id/documento/logos', authMiddleware, rolMiddleware('admin'), uploadRosterLogo.single('logo'), rosterController.subirLogoDocumentoRoster);
router.get('/:id/pdf', authMiddleware, rolMiddleware('admin'), rosterController.exportarRosterPdf);
router.get('/:id/doc', authMiddleware, rolMiddleware('admin'), rosterController.exportarRosterDoc);

module.exports = router;
