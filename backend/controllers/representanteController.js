exports.getAllRepresentantes = async (req, res) => {
  try {
    const representantes = await require('../models/Representante').find();
    res.json(representantes);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener representantes', detalle: err.message });
  }
};
const Representante = require('../models/Representante');
const mongoose = require('mongoose');

exports.getRepresentanteById = async (req, res) => {
    console.log('Buscando con ID:', req);
  try {
    let representante = null;
    // Intentar buscar por ObjectId y por string
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      representante = await Representante.findById(req.params.id);
    }
    if (!representante) {
      representante = await Representante.findOne({ _id: req.params.id });
    }
    if (!representante) return res.status(404).json({ error: 'Representante no encontrado' });
    res.json(representante);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener representante', detalle: err.message });
  }
};
