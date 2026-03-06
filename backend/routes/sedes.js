const express = require('express');
const router = express.Router();
const sedeController = require('../controllers/sedeController');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, sedeController.getSedes);
router.post('/', authMiddleware, rolMiddleware('admin'), sedeController.createSede);
router.get('/:id', authMiddleware, sedeController.getSedeById);
router.put('/:id', authMiddleware, rolMiddleware('admin'), sedeController.updateSede);
router.delete('/:id', authMiddleware, rolMiddleware('admin'), sedeController.deleteSede);

module.exports = router;
