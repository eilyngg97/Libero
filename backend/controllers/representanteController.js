const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const mongoose = require('mongoose');

async function getTenantRepresentanteModel(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);
  return getTenantModel(connection, 'Representante');
}

exports.getAllRepresentantes = async (req, res) => {
  try {
    const Representante = await getTenantRepresentanteModel(req);
    const representantes = await Representante.find();
    res.json(representantes);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener representantes', detalle: err.message });
  }
};

exports.getRepresentanteById = async (req, res) => {
  try {
    const Representante = await getTenantRepresentanteModel(req);
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
