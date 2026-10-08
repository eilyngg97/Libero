const historicos = new Map();

function errorTasa(status, message) {
  return Object.assign(new Error(message), { status });
}

async function obtenerTasaPagoPorFecha(fecha, moneda = 'USD') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) || !Number.isFinite(new Date(fecha).getTime())
    || new Date(fecha).toISOString().slice(0, 10) !== fecha) {
    throw errorTasa(400, 'Fecha de pago invalida.');
  }
  const divisa = moneda === 'EUR' ? 'EUR' : 'USD';
  let cache = historicos.get(divisa);
  if (!cache || Date.now() - cache.fecha > 300000) {
    try {
      const respuesta = await fetch(`https://ve.dolarapi.com/v1/historicos/${divisa === 'EUR' ? 'euros' : 'dolares'}/oficial`, {
        signal: AbortSignal.timeout(8000)
      });
      if (!respuesta.ok) throw new Error('Historico no disponible');
      const datos = await respuesta.json();
      if (!Array.isArray(datos)) throw new Error('Historico invalido');
      cache = { fecha: Date.now(), datos };
      historicos.set(divisa, cache);
    } catch (_) {
      throw errorTasa(503, 'No se pudo consultar la tasa oficial de la fecha de pago. Intenta nuevamente.');
    }
  }
  const vigente = cache.datos.filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item?.fecha || '') && item.fecha <= fecha
    && Number.isFinite(Number(item.promedio)) && Number(item.promedio) > 0)
    .sort((primera, segunda) => segunda.fecha.localeCompare(primera.fecha))[0];
  if (!vigente) throw errorTasa(503, 'No hay una tasa oficial disponible para la fecha de pago seleccionada.');
  return { tasa: Number(vigente.promedio), fecha_tasa: vigente.fecha, moneda: divisa };
}

module.exports = { obtenerTasaPagoPorFecha };