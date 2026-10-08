const estadosPagables = new Set(['pendiente', 'retrasado', 'insolvente', 'abono']);
const { aplicarSession } = require('./financeTransaction');
const centavos = (valor) => Math.round(Number(valor || 0) * 100);
const alumnoId = (mensualidad) => String(mensualidad.id_alumno?._id || mensualidad.id_alumno);

function proyectarCreditoMensualidades(mensualidades, saldosPorAlumno) {
  const disponibles = new Map([...saldosPorAlumno].map(([id, monto]) => [String(id), Math.max(0, centavos(monto))]));
  const proyecciones = new Map();
  const ordenadas = [...mensualidades].sort((primera, segunda) => Number(primera.anio) - Number(segunda.anio)
    || Number(primera.mes) - Number(segunda.mes) || String(primera._id).localeCompare(String(segunda._id)));
  for (const mensualidad of ordenadas) {
    const pendiente = Math.max(0, centavos(mensualidad.saldo_pendiente ?? mensualidad.monto_esperado));
    const id = alumnoId(mensualidad);
    const disponible = disponibles.get(id) || 0;
    const aplicable = estadosPagables.has(String(mensualidad.estatus || '').toLowerCase())
      ? Math.min(disponible, pendiente) : 0;
    disponibles.set(id, disponible - aplicable);
    proyecciones.set(String(mensualidad._id), {
      saldo_a_favor_disponible: Math.max(0, centavos(saldosPorAlumno.get(id))) / 100,
      saldo_pendiente_antes_credito: pendiente / 100,
      credito_disponible: disponible / 100,
      credito_a_aplicar: aplicable / 100,
      saldo_pendiente: (pendiente - aplicable) / 100
    });
  }
  return mensualidades.map((mensualidad) => ({ ...mensualidad, ...proyecciones.get(String(mensualidad._id)) }));
}

async function cotizarCreditosAlumno(id, models, { session, prepararMensualidad } = {}) {
  const alumno = await aplicarSession(models.Alumno.findById(id), session);
  const saldo = Math.max(0, centavos(alumno?.saldo_a_favor_mensualidades)) / 100;
  if (!alumno || saldo <= 0) return { alumno, saldo, proyecciones: new Map() };
  const mensualidades = await aplicarSession(models.Mensualidad.find({ id_alumno: id,
    estatus: { $in: ['Pendiente', 'Retrasado', 'Insolvente', 'Abono'] } }).populate('id_alumno'), session);
  const pendientes = [];
  for (const mensualidad of mensualidades) {
    if (prepararMensualidad) await prepararMensualidad(mensualidad);
    const pagos = await aplicarSession(models.PagoDetalle.find({ id_mensualidad: mensualidad._id }), session);
    const totalPagado = pagos.reduce((total, pago) => total + centavos(pago.monto_pagado), 0);
    const raw = mensualidad.toObject ? mensualidad.toObject() : { ...mensualidad };
    pendientes.push({ ...raw, saldo_pendiente: Math.max(0, centavos(raw.monto_esperado) - totalPagado) / 100 });
  }
  const proyecciones = proyectarCreditoMensualidades(pendientes, new Map([[String(id), saldo]]));
  return { alumno, saldo, proyecciones: new Map(proyecciones.map((item) => [String(item._id), item])) };
}

async function aplicarCreditoMensualidad(mensualidad, cotizacion, { session, actor } = {}) {
  const credito = cotizacion.proyecciones.get(String(mensualidad._id))?.credito_a_aplicar || 0;
  if (credito <= 0) return 0;
  if (!session) throw Object.assign(new Error('Aplicar saldo a favor requiere una transaccion. No se guardaron cambios.'), { status: 503 });
  const alumno = cotizacion.alumno;
  const esperado = centavos(mensualidad.monto_esperado);
  const importe = centavos(credito);
  if (importe > centavos(alumno.saldo_a_favor_mensualidades) || importe > esperado) {
    throw Object.assign(new Error('El saldo a favor cambio. Actualiza la mensualidad.'), { status: 409 });
  }
  const anterior = { monto_esperado: mensualidad.monto_esperado, estatus: mensualidad.estatus,
    saldo_a_favor_generado: mensualidad.saldo_a_favor_generado };
  const recargo = centavos(mensualidad.recargo_aplicado_usd);
  const base = Math.max(0, esperado - recargo);
  if (mensualidad.monto_base == null) {
    mensualidad.monto_base = (base + centavos(mensualidad.credito_aplicado) + centavos(mensualidad.ajuste_extraordinario)) / 100;
  }
  mensualidad.credito_aplicado = (centavos(mensualidad.credito_aplicado) + importe) / 100;
  mensualidad.monto_esperado = (esperado - importe) / 100;
  mensualidad.monto_sin_recargo_usd = Math.max(0, base - importe) / 100;
  mensualidad.recargo_aplicado_usd = Math.min(recargo, esperado - importe) / 100;
  mensualidad.aplica_recargo = mensualidad.recargo_aplicado_usd > 0;
  mensualidad.monto_con_recargo_usd = mensualidad.monto_esperado;
  mensualidad.historial_ediciones = mensualidad.historial_ediciones || [];
  mensualidad.historial_ediciones.push({ accion: 'aplicacion_saldo_a_favor', fecha: new Date(),
    nota: `Saldo a favor aplicado: ${credito.toFixed(2)}`, actor_id: actor?.id, actor_rol: actor?.rol,
    actor_nombre: actor?.nombre, anterior, nuevo: { monto_esperado: mensualidad.monto_esperado,
      estatus: mensualidad.estatus, saldo_a_favor_generado: mensualidad.saldo_a_favor_generado } });
  alumno.saldo_a_favor_mensualidades = (centavos(alumno.saldo_a_favor_mensualidades) - importe) / 100;
  await alumno.save({ session });
  return credito;
}

module.exports = { proyectarCreditoMensualidades, cotizarCreditosAlumno, aplicarCreditoMensualidad };