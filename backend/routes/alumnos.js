const express = require('express');
const router = express.Router();
const alumnoCountController = require('../controllers/alumnoCountController');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');
// Obtener cantidad de alumnos por sede
router.get('/count-by-sede', authMiddleware, rolMiddleware('admin'), alumnoCountController.getAlumnosCountBySede);
const alumnoController = require('../controllers/alumnoController');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage });

// CRUD rutas para alumnos
router.get('/', authMiddleware, alumnoController.getAlumnos);
router.post('/', authMiddleware, rolMiddleware('admin'), upload.fields([{ name: 'foto', maxCount: 1 }, { name: 'foto_cedula', maxCount: 1 }]), alumnoController.createAlumno);
router.get('/por-representante/:representanteId', authMiddleware, alumnoController.getAlumnosPorRepresentante);
router.get('/:id/reposos', authMiddleware, rolMiddleware('admin'), alumnoController.getRepososAlumno);
router.post('/:id/reposos', authMiddleware, rolMiddleware('admin'), upload.single('certificado'), alumnoController.registrarReposoAlumno);
router.get('/:id', authMiddleware, alumnoController.getAlumnoById);
router.put('/:id', authMiddleware, upload.fields([{ name: 'foto', maxCount: 1 }, { name: 'foto_cedula', maxCount: 1 }]), alumnoController.updateAlumno);
router.patch('/:id/baja', authMiddleware, rolMiddleware('admin'), alumnoController.darDeBajaAlumno);
router.patch('/:id/reactivar', authMiddleware, rolMiddleware('admin'), alumnoController.reactivarAlumno);
router.delete('/:id', authMiddleware, rolMiddleware('admin'), alumnoController.deleteAlumno);

module.exports = router;
