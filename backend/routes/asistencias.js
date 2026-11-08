const express = require('express');
const { authMiddleware, permisoMiddleware } = require('../middleware/auth');
const controller = require('../controllers/asistenciaController');
const router = express.Router();

router.use(authMiddleware, permisoMiddleware('asistencias.view'));
router.get('/grupos', controller.grupos);
router.get('/atletas', permisoMiddleware('asistencias.manage'), controller.atletas);
router.post('/grupos', permisoMiddleware('asistencias.manage'), controller.guardarGrupo);
router.put('/grupos/:id', permisoMiddleware('asistencias.manage'), controller.guardarGrupo);
router.get('/sesiones', controller.sesiones);
router.get('/historial', controller.historial);
router.get('/lista/:grupo', controller.lista);
router.put('/lista/:grupo', permisoMiddleware('asistencias.manage'), controller.guardarLista);

module.exports = router;