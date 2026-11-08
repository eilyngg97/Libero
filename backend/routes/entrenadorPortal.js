const router = require('express').Router();
const { authMiddleware, rolMiddleware } = require('../middleware/auth');
const portal = require('../controllers/entrenadorPortalController');
const asistencias = require('../controllers/asistenciaController');
const constancias = require('../controllers/constanciaController');

router.use(authMiddleware, rolMiddleware('entrenador'));
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/', portal.getPortal);
router.post('/constancias', constancias.generarConstancia);
router.get('/asistencias/grupos', asistencias.grupos);
router.get('/asistencias/sesiones', asistencias.sesiones);
router.get('/asistencias/lista/:grupo', asistencias.lista);
router.put('/asistencias/lista/:grupo', asistencias.guardarLista);
router.get('/asistencias/historial', asistencias.historial);

module.exports = router;