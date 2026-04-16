const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

async function getTenantSedeModel(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);
  return getTenantModel(connection, 'Sede');
}

// Obtener todas las sedes
exports.getSedes = async (req, res) => {
  try {
    const Sede = await getTenantSedeModel(req);
    const sedes = await Sede.find();
    res.json(sedes);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener sedes' });
  }
};

// Crear una sede
exports.createSede = async (req, res) => {
  try {
    const Sede = await getTenantSedeModel(req);
    const sede = new Sede(req.body);
    await sede.save();
    res.status(201).json(sede);
  } catch (err) {
    res.status(400).json({ error: 'Error al crear sede', detalle: err.message });
  }
};

// Obtener una sede por ID
exports.getSedeById = async (req, res) => {
  try {
    const Sede = await getTenantSedeModel(req);
    const sede = await Sede.findById(req.params.id);
    if (!sede) return res.status(404).json({ error: 'Sede no encontrada' });
    res.json(sede);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener sede' });
  }
};

// Actualizar una sede
exports.updateSede = async (req, res) => {
  try {
    const Sede = await getTenantSedeModel(req);
    const sede = await Sede.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!sede) return res.status(404).json({ error: 'Sede no encontrada' });
    res.json(sede);
  } catch (err) {
    res.status(400).json({ error: 'Error al actualizar sede' });
  }
};

// Eliminar una sede
exports.deleteSede = async (req, res) => {
  try {
    const Sede = await getTenantSedeModel(req);
    const sede = await Sede.findByIdAndDelete(req.params.id);
    if (!sede) return res.status(404).json({ error: 'Sede no encontrada' });
    res.json({ message: 'Sede eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar sede' });
  }
};
