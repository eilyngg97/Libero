const express = require('express');
const router = express.Router();
const alumnoCountController = require('../controllers/alumnoCountController');
const { authMiddleware, rolMiddleware, superAdminMiddleware, permisoMiddleware } = require('../middleware/auth');
const {
	ensureAlumnoOwnershipFromParam,
	ensureRepresentanteOwnershipFromParam
} = require('../middleware/ownership');
// Obtener cantidad de alumnos por sede
router.get('/count-by-sede', authMiddleware, permisoMiddleware('alumnos.view'), alumnoCountController.getAlumnosCountBySede);
const alumnoController = require('../controllers/alumnoController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');

function resolveTenantId(req) {
	return resolveRequestTenantId(req);
}

function resolveUploadDirByField(req, fieldName) {
	const tenantId = resolveTenantId(req);
	const folder = (fieldName === 'certificado' || fieldName === 'certificados')
		? 'reposos'
		: (fieldName === 'comprobante' ? 'comprobantes' : 'alumnos');
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

const importUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 8 * 1024 * 1024 },
	fileFilter: (req, file, cb) => {
		const ext = path.extname(String(file?.originalname || '')).toLowerCase();
		if (ext !== '.xlsx' && ext !== '.xls') {
			return cb(new Error('Formato no permitido. Usa .xlsx o .xls'));
		}
		return cb(null, true);
	}
});

// CRUD rutas para alumnos
router.get('/', authMiddleware, permisoMiddleware('alumnos.view'), alumnoController.getAlumnos);
router.get('/estadisticas/inscritos-retirados', authMiddleware, permisoMiddleware('alumnos.view'), alumnoController.getEstadisticasInscritosRetirados);
router.get('/numeros-franela/disponibilidad', authMiddleware, alumnoController.getDisponibilidadNumeroFranela);
router.get('/categoria-sugerida', authMiddleware, permisoMiddleware('alumnos.manage'), alumnoController.getCategoriaSugerida);
router.get('/asignar-categorias/preview', authMiddleware, rolMiddleware('admin'), alumnoController.previewAsignarCategoriasMasivamente);
router.post('/importar-excel', authMiddleware, superAdminMiddleware, importUpload.single('archivo'), alumnoController.importarAlumnosExcel);
router.post('/', authMiddleware, permisoMiddleware('alumnos.manage'), upload.fields([{ name: 'foto', maxCount: 1 }, { name: 'foto_cedula', maxCount: 1 }]), alumnoController.createAlumno);
router.get('/por-representante/:representanteId', authMiddleware, ensureRepresentanteOwnershipFromParam('representanteId'), alumnoController.getAlumnosPorRepresentante);
router.get('/:id/historial-estados', authMiddleware, ensureAlumnoOwnershipFromParam('id'), alumnoController.getHistorialEstadosAlumno);
router.get('/:id/reposos', authMiddleware, permisoMiddleware('alumnos.manage'), alumnoController.getRepososAlumno);
router.post('/:id/reposos', authMiddleware, permisoMiddleware('alumnos.manage'), upload.fields([{ name: 'certificado', maxCount: 1 }, { name: 'certificados', maxCount: 10 }]), alumnoController.registrarReposoAlumno);
router.patch('/:id/reposos/:reposoId', authMiddleware, permisoMiddleware('alumnos.manage'), upload.fields([{ name: 'certificado', maxCount: 1 }, { name: 'certificados', maxCount: 10 }]), alumnoController.editarReposoAlumno);
router.patch('/:id/reposos/:reposoId/finalizar', authMiddleware, permisoMiddleware('alumnos.manage'), alumnoController.finalizarReposoIndefinido);
router.delete('/:id/reposos/:reposoId', authMiddleware, permisoMiddleware('alumnos.manage'), alumnoController.eliminarReposoAlumno);

// Ruta para asignar categorias masivamente (debe ir antes de /:id)
router.put('/asignar-categorias', authMiddleware, rolMiddleware('admin'), alumnoController.asignarCategoriasMasivamente);

router.get('/:id/ficha-tecnica', authMiddleware, ensureAlumnoOwnershipFromParam('id'), alumnoController.descargarFichaTecnica);
router.get('/:id', authMiddleware, ensureAlumnoOwnershipFromParam('id'), alumnoController.getAlumnoById);
router.patch('/:id/requisitos-recaudos', authMiddleware, permisoMiddleware('alumnos.manage'), alumnoController.actualizarEstadoRequisitoRecaudoAlumno);
router.put('/:id', authMiddleware, ensureAlumnoOwnershipFromParam('id'), upload.fields([{ name: 'foto', maxCount: 1 }, { name: 'foto_cedula', maxCount: 1 }]), alumnoController.updateAlumno);
router.patch('/:id/baja', authMiddleware, permisoMiddleware('alumnos.manage'), alumnoController.darDeBajaAlumno);
router.patch('/:id/reactivar', authMiddleware, permisoMiddleware('alumnos.manage'), upload.single('comprobante'), alumnoController.reactivarAlumno);
router.delete('/:id', authMiddleware, permisoMiddleware('alumnos.manage'), alumnoController.deleteAlumno);

module.exports = router;
