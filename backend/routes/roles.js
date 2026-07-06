const express = require('express');
const router = express.Router();
const {
  getPermissionCatalog,
  listarRoles,
  crearRol,
  actualizarRol,
  eliminarRol,
  seedRolesBase
} = require('../controllers/roleController');
const { authMiddleware, permisoMiddleware } = require('../middleware/auth');

router.get('/catalogo-permisos', authMiddleware, permisoMiddleware('roles.manage'), getPermissionCatalog);
router.get('/', authMiddleware, permisoMiddleware('roles.manage'), listarRoles);
router.post('/', authMiddleware, permisoMiddleware('roles.manage'), crearRol);
router.put('/:id', authMiddleware, permisoMiddleware('roles.manage'), actualizarRol);
router.delete('/:id', authMiddleware, permisoMiddleware('roles.manage'), eliminarRol);
router.post('/seed-base', authMiddleware, permisoMiddleware('roles.manage'), seedRolesBase);

module.exports = router;