const express = require('express');
const router = express.Router();
const representanteController = require('../controllers/representanteController');
const { authMiddleware } = require('../middleware/auth');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

const getTenantRepresentanteModel = async (req) => {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);
  return getTenantModel(connection, 'Representante');
};
// Endpoint para autocompletar representantes por cédula (query param)
router.get('/', authMiddleware, async (req, res) => {
  if (req.query.cedula) {
    try {
      const Representante = await getTenantRepresentanteModel(req);
      // Búsqueda parcial, insensible a mayúsculas
      const reps = await Representante.find({ cedula: { $regex: req.query.cedula, $options: 'i' } });
      return res.json(reps);
    } catch (err) {
      return res.status(500).json({ error: 'Error al buscar representantes por cédula' });
    }
  }
  // Si no hay query param, continuar con el controlador normal
  return representanteController.getAllRepresentantes(req, res);
});

// Buscar representante por cédula
router.get('/buscar/cedula/:cedula', authMiddleware, async (req, res) => {
  try {
    const Representante = await getTenantRepresentanteModel(req);
    const representante = await Representante.findOne({ cedula: req.params.cedula });
    if (!representante) return res.status(404).json({ error: 'No se encontró representante con esa cédula' });
    res.json(representante);
  } catch (err) {
    res.status(500).json({ error: 'Error al buscar representante por cédula' });
  }
});

// Obtener representante por usuario
router.get('/por-usuario/:userId', authMiddleware, async (req, res) => {
  try {
    const Representante = await getTenantRepresentanteModel(req);
    if (req.user?.rol === 'usuario' && String(req.user.id) !== String(req.params.userId)) {
      return res.status(403).json({ error: 'No tienes permiso para consultar este usuario' });
    }

    const representante = await Representante.findOne({ usuario: req.params.userId });
    if (!representante) return res.status(200).json(null);
    res.json(representante);
  } catch (err) {
    res.status(500).json({ error: 'Error al buscar representante' });
  }
});

// Obtener representante por ID
router.get('/:id', authMiddleware, representanteController.getRepresentanteById);

module.exports = router;
