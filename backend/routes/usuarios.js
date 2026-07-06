const express = require('express');
const router = express.Router();
const {
  listarUsuarios,
  crearUsuario,
  actualizarRolUsuario
} = require('../controllers/usuarioController');
const { authMiddleware, permisoMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, permisoMiddleware('usuarios.manage'), listarUsuarios);

router.post('/', authMiddleware, permisoMiddleware('usuarios.manage'), crearUsuario);

router.patch('/:id/rol', authMiddleware, permisoMiddleware('usuarios.manage'), actualizarRolUsuario);

module.exports = router;
