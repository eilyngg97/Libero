const router = require('express').Router();
const constanciaController = require('../controllers/constanciaController');

// POST /api/constancias
router.post('/', constanciaController.generarConstancia);

module.exports = router;
