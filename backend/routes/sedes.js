const express = require('express');
const router = express.Router();
const sedeController = require('../controllers/sedeController');
const { authMiddleware, permisoMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, permisoMiddleware('sedes.view'), sedeController.getSedes);
router.post('/', authMiddleware, permisoMiddleware('sedes.manage'), sedeController.createSede);
router.get('/:id', authMiddleware, permisoMiddleware('sedes.view'), sedeController.getSedeById);
router.put('/:id', authMiddleware, permisoMiddleware('sedes.manage'), sedeController.updateSede);
router.delete('/:id', authMiddleware, permisoMiddleware('sedes.manage'), sedeController.deleteSede);

module.exports = router;
