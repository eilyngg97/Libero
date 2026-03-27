const express = require('express');
const router = express.Router();
const aspiranteController = require('../controllers/aspiranteController');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');

router.post('/', aspiranteController.createAspirante);
router.get('/', authMiddleware, rolMiddleware('admin'), aspiranteController.getAspirantes);
router.patch('/:id/estado', authMiddleware, rolMiddleware('admin'), aspiranteController.updateEstadoAspirante);
router.delete('/:id', authMiddleware, rolMiddleware('admin'), aspiranteController.deleteAspirante);

module.exports = router;
