const router = require('express').Router();
const constanciaController = require('../controllers/constanciaController');
const constanciaSolicitudController = require('../controllers/constanciaSolicitudController');
const { authMiddleware, rolMiddleware, permisoMiddleware } = require('../middleware/auth');
const { ensureAlumnoOwnershipFromBody } = require('../middleware/ownership');

// POST /api/constancias
router.post('/', authMiddleware, ensureAlumnoOwnershipFromBody('alumnoId'), constanciaController.generarConstancia);

// Solicitudes de constancias (usuario -> admin) para tenant Esporta.
router.post('/solicitudes', authMiddleware, ensureAlumnoOwnershipFromBody('alumnoId'), constanciaSolicitudController.crearSolicitudConstancia);
router.get('/solicitudes/mias', authMiddleware, rolMiddleware('usuario'), constanciaSolicitudController.getMisSolicitudesConstancia);
router.get('/solicitudes', authMiddleware, permisoMiddleware('solicitudes_constancias.view'), constanciaSolicitudController.getSolicitudesConstancia);
router.patch('/solicitudes/:id', authMiddleware, permisoMiddleware('solicitudes_constancias.manage'), constanciaSolicitudController.actualizarSolicitudConstancia);
router.post('/solicitudes/:id/generar', authMiddleware, permisoMiddleware('solicitudes_constancias.manage'), constanciaSolicitudController.generarConstanciaDesdeSolicitud);

module.exports = router;
