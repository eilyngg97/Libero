const express = require('express');
const router = express.Router();
const aspiranteController = require('../controllers/aspiranteController');
const { authMiddleware, permisoMiddleware } = require('../middleware/auth');

router.post('/', aspiranteController.createAspirante);
router.get('/', authMiddleware, permisoMiddleware('aspirantes.view'), aspiranteController.getAspirantes);
router.patch('/:id/estado', authMiddleware, permisoMiddleware('aspirantes.manage'), aspiranteController.updateEstadoAspirante);
router.delete('/:id', authMiddleware, permisoMiddleware('aspirantes.manage'), aspiranteController.deleteAspirante);

module.exports = router;
