const router = require('express').Router();
const { authMiddleware, rolMiddleware, superAdminMiddleware } = require('../middleware/auth');
const controller = require('../controllers/notificacionController');

router.use(authMiddleware, rolMiddleware('admin', 'super_admin'));
router.get('/', controller.getNotificaciones);
router.patch('/configuracion', superAdminMiddleware, controller.updateConfiguracion);

module.exports = router;
