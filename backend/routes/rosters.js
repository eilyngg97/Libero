const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware, permisoMiddleware } = require('../middleware/auth');
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

router.get('/', authMiddleware, permisoMiddleware('rosters.view'), rosterController.listarRosters);
router.get('/eligible-students', authMiddleware, permisoMiddleware('rosters.view'), rosterController.obtenerEstudiantesElegibles);
router.post('/', authMiddleware, permisoMiddleware('rosters.manage'), rosterController.crearRoster);
router.patch('/:id/status', authMiddleware, permisoMiddleware('rosters.manage'), rosterController.actualizarEstatusRoster);
router.patch('/:id/jugadores', authMiddleware, permisoMiddleware('rosters.manage'), rosterController.actualizarJugadoresRoster);
router.patch('/:id/jugadores/:alumnoId/procedencia', authMiddleware, permisoMiddleware('rosters.manage'), rosterController.actualizarProcedenciaJugadorRoster);
router.post('/:id/prestamos', authMiddleware, permisoMiddleware('rosters.manage'), uploadRosterLogo.fields([
	{ name: 'foto', maxCount: 1 },
	{ name: 'foto_cedula', maxCount: 1 }
]), rosterController.agregarPrestamoRoster);
router.patch('/:id/prestamos/:prestamoId', authMiddleware, permisoMiddleware('rosters.manage'), uploadRosterLogo.fields([
	{ name: 'foto', maxCount: 1 },
	{ name: 'foto_cedula', maxCount: 1 }
]), rosterController.actualizarPrestamoRoster);
router.delete('/:id/prestamos/:prestamoId', authMiddleware, permisoMiddleware('rosters.manage'), rosterController.eliminarPrestamoRoster);
router.patch('/:id/jugadores/:alumnoId/estado', authMiddleware, permisoMiddleware('rosters.manage'), rosterController.actualizarEstadoJugadorRoster);
router.delete('/:id', authMiddleware, permisoMiddleware('rosters.manage'), rosterController.eliminarRoster);
router.get('/template', authMiddleware, permisoMiddleware('rosters.view'), rosterController.obtenerPlantillaRoster);
router.patch('/template', authMiddleware, permisoMiddleware('rosters.manage'), rosterController.actualizarPlantillaRoster);
router.post('/template/logos', authMiddleware, permisoMiddleware('rosters.manage'), uploadRosterLogo.single('logo'), rosterController.subirLogoPlantillaRoster);
router.get('/:id/documento', authMiddleware, permisoMiddleware('rosters.view'), rosterController.obtenerDocumentoRoster);
router.patch('/:id/documento', authMiddleware, permisoMiddleware('rosters.manage'), rosterController.actualizarDocumentoRoster);
router.post('/:id/documento/logos', authMiddleware, permisoMiddleware('rosters.manage'), uploadRosterLogo.single('logo'), rosterController.subirLogoDocumentoRoster);
router.get('/:id/pdf', authMiddleware, permisoMiddleware('rosters.view'), rosterController.exportarRosterPdf);
router.get('/:id/doc', authMiddleware, permisoMiddleware('rosters.view'), rosterController.exportarRosterDoc);

module.exports = router;
