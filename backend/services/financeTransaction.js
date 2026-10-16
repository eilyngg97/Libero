function aplicarSession(query, session) {
  return session && typeof query?.session === 'function' ? query.session(session) : query;
}

async function ejecutarConTransaccion(Model, operacion, { obligatoria = false } = {}) {
  const noDisponible = () => {
    const error = new Error('Esta operacion requiere MongoDB con transacciones (replica set). No se guardaron cambios.');
    error.status = 503;
    return error;
  };
  if (!Model?.db || typeof Model.db.startSession !== 'function') {
    if (obligatoria) throw noDisponible();
    return operacion(null);
  }
  const session = await Model.db.startSession();
  try {
    let resultado;
    try {
      await session.withTransaction(async () => {
        resultado = await operacion(session);
      });
      return resultado;
    } catch (error) {
      const mensaje = String(error?.message || '');
      const sinTransacciones = mensaje.includes('Transaction numbers are only allowed on a replica set member or mongos')
        || mensaje.includes('Standalone servers do not support transactions');
      if (!sinTransacciones) throw error;
      if (obligatoria) throw noDisponible();
      return operacion(null);
    }
  } finally {
    await session.endSession().catch(() => {});
  }
}

module.exports = { aplicarSession, ejecutarConTransaccion };