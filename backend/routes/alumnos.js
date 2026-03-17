const express = require('express');
const router = express.Router();
const alumnoCountController = require('../controllers/alumnoCountController');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');
const {
	ensureAlumnoOwnershipFromParam,
	ensureRepresentanteOwnershipFromParam
} = require('../middleware/ownership');
// Obtener cantidad de alumnos por sede
router.get('/count-by-sede', authMiddleware, rolMiddleware('admin'), alumnoCountController.getAlumnosCountBySede);
const alumnoController = require('../controllers/alumnoController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const alumnosUploadDir = path.join(__dirname, '..', 'uploads', 'alumnos');
const repososUploadDir = path.join(__dirname, '..', 'uploads', 'reposos');
fs.mkdirSync(alumnosUploadDir, { recursive: true });
fs.mkdirSync(repososUploadDir, { recursive: true });

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		if (file.fieldname === 'certificado') {
			return cb(null, repososUploadDir);
		}
		return cb(null, alumnosUploadDir);
	},
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname || '').toLowerCase();
		const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
		cb(null, name);
	}
});
const upload = multer({ storage });

// CRUD rutas para alumnos
router.get('/', authMiddleware, alumnoController.getAlumnos);
router.post('/', authMiddleware, rolMiddleware('admin'), upload.fields([{ name: 'foto', maxCount: 1 }, { name: 'foto_cedula', maxCount: 1 }]), alumnoController.createAlumno);
router.get('/por-representante/:representanteId', authMiddleware, ensureRepresentanteOwnershipFromParam('representanteId'), alumnoController.getAlumnosPorRepresentante);
router.get('/:id/reposos', authMiddleware, rolMiddleware('admin'), alumnoController.getRepososAlumno);
router.post('/:id/reposos', authMiddleware, rolMiddleware('admin'), upload.single('certificado'), alumnoController.registrarReposoAlumno);
router.get('/:id', authMiddleware, ensureAlumnoOwnershipFromParam('id'), alumnoController.getAlumnoById);
router.put('/:id', authMiddleware, ensureAlumnoOwnershipFromParam('id'), upload.fields([{ name: 'foto', maxCount: 1 }, { name: 'foto_cedula', maxCount: 1 }]), alumnoController.updateAlumno);
router.patch('/:id/baja', authMiddleware, rolMiddleware('admin'), alumnoController.darDeBajaAlumno);
router.patch('/:id/reactivar', authMiddleware, rolMiddleware('admin'), alumnoController.reactivarAlumno);
router.delete('/:id', authMiddleware, rolMiddleware('admin'), alumnoController.deleteAlumno);

module.exports = router;
