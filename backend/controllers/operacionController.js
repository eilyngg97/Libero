const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

exports.listarOperaciones = async (req, res) => {
  try {
    const tenantConfig = req.tenant || { tenantId: req.tenantId };
    const connection = await getTenantBusinessConnection(tenantConfig);
    const Operacion = getTenantModel(connection, 'Operacion');
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
    const filter = {};

    if (req.query.tipo) filter.tipo = String(req.query.tipo).trim();

    const [operaciones, total] = await Promise.all([
      Operacion.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Operacion.countDocuments(filter)
    ]);

    return res.json({ operaciones, total, page, limit });
  } catch (error) {
    return res.status(500).json({ error: 'No se pudo obtener el historial de operaciones' });
  }
};