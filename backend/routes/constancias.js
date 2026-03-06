const router = require('express').Router();
const constanciaController = require('../controllers/constanciaController');
const { authMiddleware } = require('../middleware/auth');
const { ensureAlumnoOwnershipFromBody } = require('../middleware/ownership');

// POST /api/constancias
router.post('/', authMiddleware, ensureAlumnoOwnershipFromBody('alumnoId'), constanciaController.generarConstancia);

module.exports = router;
