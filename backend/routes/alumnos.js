const express = require('express');
const router = express.Router();
const alumnoCountController = require('../controllers/alumnoCountController');
// Obtener cantidad de alumnos por sede
router.get('/count-by-sede', alumnoCountController.getAlumnosCountBySede);
const alumnoController = require('../controllers/alumnoController');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage });

// CRUD rutas para alumnos
router.get('/', alumnoController.getAlumnos);
router.post('/', upload.fields([{ name: 'foto', maxCount: 1 }, { name: 'foto_cedula', maxCount: 1 }]), alumnoController.createAlumno);
router.get('/por-representante/:representanteId', alumnoController.getAlumnosPorRepresentante);
router.get('/:id/reposos', alumnoController.getRepososAlumno);
router.post('/:id/reposos', upload.single('certificado'), alumnoController.registrarReposoAlumno);
router.get('/:id', alumnoController.getAlumnoById);
router.put('/:id', upload.fields([{ name: 'foto', maxCount: 1 }, { name: 'foto_cedula', maxCount: 1 }]), alumnoController.updateAlumno);
router.patch('/:id/baja', alumnoController.darDeBajaAlumno);
router.patch('/:id/reactivar', alumnoController.reactivarAlumno);
router.delete('/:id', alumnoController.deleteAlumno);

module.exports = router;
