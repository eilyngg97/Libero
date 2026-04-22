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

function resolveTenantId(req) {
	return String(req?.tenantId || process.env.DEFAULT_TENANT_ID || 'villasport')
		.trim()
		.toLowerCase();
}

function resolveUploadDirByField(req, fieldName) {
	const tenantId = resolveTenantId(req);
	const folder = (fieldName === 'certificado' || fieldName === 'certificados') ? 'reposos' : 'alumnos';
	const uploadDir = path.join(__dirname, '..', 'uploads', tenantId, folder);
	fs.mkdirSync(uploadDir, { recursive: true });
	return uploadDir;
}

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		return cb(null, resolveUploadDirByField(req, file.fieldname));
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
router.get('/estadisticas/inscritos-retirados', authMiddleware, rolMiddleware('admin'), alumnoController.getEstadisticasInscritosRetirados);
router.get('/numeros-franela/disponibilidad', authMiddleware, alumnoController.getDisponibilidadNumeroFranela);
router.post('/', authMiddleware, rolMiddleware('admin'), upload.fields([{ name: 'foto', maxCount: 1 }, { name: 'foto_cedula', maxCount: 1 }]), alumnoController.createAlumno);
router.get('/por-representante/:representanteId', authMiddleware, ensureRepresentanteOwnershipFromParam('representanteId'), alumnoController.getAlumnosPorRepresentante);
router.get('/:id/reposos', authMiddleware, rolMiddleware('admin'), alumnoController.getRepososAlumno);
router.post('/:id/reposos', authMiddleware, rolMiddleware('admin'), upload.fields([{ name: 'certificado', maxCount: 1 }, { name: 'certificados', maxCount: 10 }]), alumnoController.registrarReposoAlumno);
router.patch('/:id/reposos/:reposoId', authMiddleware, rolMiddleware('admin'), upload.fields([{ name: 'certificado', maxCount: 1 }, { name: 'certificados', maxCount: 10 }]), alumnoController.editarReposoAlumno);
router.patch('/:id/reposos/:reposoId/finalizar', authMiddleware, rolMiddleware('admin'), alumnoController.finalizarReposoIndefinido);
router.delete('/:id/reposos/:reposoId', authMiddleware, rolMiddleware('admin'), alumnoController.eliminarReposoAlumno);
router.get('/:id', authMiddleware, ensureAlumnoOwnershipFromParam('id'), alumnoController.getAlumnoById);
router.put('/:id', authMiddleware, ensureAlumnoOwnershipFromParam('id'), upload.fields([{ name: 'foto', maxCount: 1 }, { name: 'foto_cedula', maxCount: 1 }]), alumnoController.updateAlumno);
router.patch('/:id/baja', authMiddleware, rolMiddleware('admin'), alumnoController.darDeBajaAlumno);
router.patch('/:id/reactivar', authMiddleware, rolMiddleware('admin'), alumnoController.reactivarAlumno);
router.delete('/:id', authMiddleware, rolMiddleware('admin'), alumnoController.deleteAlumno);

module.exports = router;
