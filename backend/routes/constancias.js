const router = require('express').Router();
const constanciaController = require('../controllers/constanciaController');
const { authMiddleware } = require('../middleware/auth');

// POST /api/constancias
router.post('/', authMiddleware, constanciaController.generarConstancia);

module.exports = router;
