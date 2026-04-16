const Uniforme = require('../models/Uniforme');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

async function getTenantUniformeModel(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);
  return getTenantModel(connection, 'Uniforme');
}

exports.getUniformes = async (req, res) => {
  try {
    const TenantUniforme = await getTenantUniformeModel(req);
    const uniformes = await TenantUniforme.find();
    res.json(uniformes);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener uniformes' });
  }
};

exports.createUniforme = async (req, res) => {
  try {
    const TenantUniforme = await getTenantUniformeModel(req);
    const { prenda, precio } = req.body;
    const uniforme = new TenantUniforme({ prenda, precio });
    await uniforme.save();
    res.status(201).json(uniforme);
  } catch (err) {
    res.status(400).json({ error: 'Error al crear uniforme' });
  }
};

exports.updateUniforme = async (req, res) => {
  try {
    const TenantUniforme = await getTenantUniformeModel(req);
    const { id } = req.params;
    const { prenda, precio } = req.body;
    const uniforme = await TenantUniforme.findByIdAndUpdate(id, { prenda, precio }, { new: true });
    if (!uniforme) return res.status(404).json({ error: 'Uniforme no encontrado' });
    res.json(uniforme);
  } catch (err) {
    res.status(400).json({ error: 'Error al actualizar uniforme' });
  }
};

exports.deleteUniforme = async (req, res) => {
  try {
    const TenantUniforme = await getTenantUniformeModel(req);
    const { id } = req.params;
    const uniforme = await TenantUniforme.findByIdAndDelete(id);
    if (!uniforme) return res.status(404).json({ error: 'Uniforme no encontrado' });
    res.json({ message: 'Uniforme eliminado' });
  } catch (err) {
    res.status(400).json({ error: 'Error al eliminar uniforme' });
  }
};
