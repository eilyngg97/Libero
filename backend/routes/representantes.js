const express = require('express');
const router = express.Router();
const Representante = require('../models/Representante');
const representanteController = require('../controllers/representanteController');
// Endpoint para autocompletar representantes por cédula (query param)
router.get('/', async (req, res) => {
  if (req.query.cedula) {
    try {
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
router.get('/buscar/cedula/:cedula', async (req, res) => {
  try {
    const representante = await Representante.findOne({ cedula: req.params.cedula });
    if (!representante) return res.status(404).json({ error: 'No se encontró representante con esa cédula' });
    res.json(representante);
  } catch (err) {
    res.status(500).json({ error: 'Error al buscar representante por cédula' });
  }
});

// Obtener representante por usuario
router.get('/por-usuario/:userId', async (req, res) => {
  try {
    const representante = await Representante.findOne({ usuario: req.params.userId });
    if (!representante) return res.status(404).json({ error: 'No se encontró representante para este usuario' });
    res.json(representante);
  } catch (err) {
    res.status(500).json({ error: 'Error al buscar representante' });
  }
});

// Obtener representante por ID
router.get('/:id', representanteController.getRepresentanteById);

// Listar todos los representantes
router.get('/', representanteController.getAllRepresentantes);

module.exports = router;
