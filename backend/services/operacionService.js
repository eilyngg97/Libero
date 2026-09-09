const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('./tenantModelService');

function getActor(req) {
  const user = req?.user || {};
  return {
    actor_id: user.id || user._id || null,
    actor_nombre: String(user.nombre || user.name || user.email || '').trim()
  };
}

async function registrarOperacion(req, data) {
  try {
    const tenantConfig = req.tenant || { tenantId: req.tenantId };
    const connection = await getTenantBusinessConnection(tenantConfig);
    const Operacion = getTenantModel(connection, 'Operacion');
    if (typeof Operacion?.create !== 'function') return null;
    return await Operacion.create({ ...data, ...getActor(req) });
  } catch (error) {
    console.error('No se pudo registrar la operacion:', error.message);
    return null;
  }
}

module.exports = { registrarOperacion };