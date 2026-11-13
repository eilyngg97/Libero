const express = require('express');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');
const controller = require('../controllers/campaniaCobroController');

const router = express.Router();
router.use(authMiddleware, rolMiddleware('admin', 'super_admin'));
router.get('/opciones', controller.opciones);
router.get('/', controller.listar);
router.post('/', controller.crear);
router.get('/:id/participantes', controller.participantes);
router.get('/:id/resumen', controller.resumen);
router.get('/:id/cargos', controller.cargos);
router.post('/:id/publicar', controller.publicar);
router.put('/:id/participantes', controller.guardarParticipantes);
router.patch('/:id', controller.editar);
router.delete('/:id', controller.eliminar);

module.exports = router;