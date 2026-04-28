const express = require('express');

const router = express.Router();
const configuracionController = require('../controllers/configuracionController');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');

router.get('/pagos', authMiddleware, configuracionController.getConfiguracionPagos);
router.get('/', authMiddleware, rolMiddleware('admin'), configuracionController.getConfiguracionAdmin);
router.put('/', authMiddleware, rolMiddleware('admin'), configuracionController.upsertConfiguracionAdmin);
router.patch('/', authMiddleware, rolMiddleware('admin'), configuracionController.patchConfiguracionAdmin);

module.exports = router;
