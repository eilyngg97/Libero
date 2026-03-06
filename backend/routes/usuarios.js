const express = require('express');
const router = express.Router();
const { crearUsuario } = require('../controllers/usuarioController');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');

// GET /api/usuarios (ejemplo)
router.get('/', authMiddleware, rolMiddleware('admin'), (req, res) => {
  res.json({ msg: 'Lista de usuarios (implementación pendiente)' });
});

// POST /api/usuarios (solo admin)
router.post('/', authMiddleware, rolMiddleware('admin'), crearUsuario);

module.exports = router;
