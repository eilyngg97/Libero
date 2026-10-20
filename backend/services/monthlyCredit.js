const estadosPagables = new Set(['pendiente', 'retrasado', 'insolvente', 'abono']);
const { aplicarSession } = require('./financeTransaction');
const { obtenerCoberturaMensualidad } = require('./monthlyPaymentCoverage');
const centavos = (valor) => Math.round(Number(valor || 0) * 100);
const alumnoId = (mensualidad) => String(mensualidad.id_alumno?._id || mensualidad.id_alumno);

function tomarCredito(disponibles, monto) {
  let restante = centavos(monto);
  const origenes = [];
  for (const fuente of disponibles) {
    const aplicado = Math.min(restante, fuente.disponible);
    if (aplicado <= 0) continue;
    fuente.disponible -= aplicado;
    restante -= aplicado;
    origenes.push({ id_mensualidad: fuente.id_mensualidad, monto: aplicado / 100,
      provisional: fuente.provisional });
  }
  if (restante > 0) throw Object.assign(new Error('El saldo a favor cambio. Actualiza las mensualidades.'), { status: 409 });
  return origenes;
}

function reconstruirCredito(mensualidades, saldoActual = 0) {
  const ordenadas = [...mensualidades].sort((primera, segunda) => Number(primera.anio) - Number(segunda.anio)
    || Number(primera.mes) - Number(segunda.mes) || String(primera._id).localeCompare(String(segunda._id)));
  const disponibles = [];
  const movimientos = new Map();
  const saldoInicial = Math.max(0, centavos(saldoActual) + ordenadas.reduce((total, item) => total
    + centavos(item.credito_aplicado) - centavos(item.saldo_a_favor_generado), 0));
  if (saldoInicial > 0) disponibles.push({ disponible: saldoInicial, provisional: false });
  for (const mensualidad of ordenadas) {
    const importe = centavos(mensualidad.credito_aplicado);
    let origenes;
    if (mensualidad.credito_origenes?.length) {
      origenes = mensualidad.credito_origenes.map((origen) => {
        const fuente = disponibles.find((item) => String(item.id_mensualidad) === String(origen.id_mensualidad));
        const disponible = fuente || disponibles.find((item) => !item.id_mensualidad && item.disponible >= centavos(origen.monto));
        if (disponible) disponible.disponible -= centavos(origen.monto);
        return { id_mensualidad: origen.id_mensualidad, monto: origen.monto,
          provisional: fuente?.provisional !== false };
      });
    } else {
      const faltante = importe - disponibles.reduce((total, item) => total + Math.max(0, item.disponible), 0);
      if (faltante > 0) disponibles.push({ disponible: faltante, provisional: true });
      origenes = tomarCredito(disponibles, importe / 100);
    }
    const provisional = origenes.reduce((total, origen) => total + (origen.provisional ? centavos(origen.monto) : 0), 0);
    const generado = centavos(mensualidad.saldo_a_favor_generado);
    if (generado > 0) disponibles.push({ id_mensualidad: mensualidad._id, disponible: generado,
      provisional: (mensualidad.pago_en_revision ?? (mensualidad.estatus === 'En revision'
        && !mensualidad.credito_en_revision)) || provisional > 0 });
    movimientos.set(String(mensualidad._id), { credito_origenes: origenes, credito_en_revision: provisional / 100,
      saldo_a_favor_restante: disponibles.reduce((total, item) => total + Math.max(0, item.disponible), 0) / 100,
      saldo_a_favor_provisional: disponibles.reduce((total, item) => total + (item.provisional ? Math.max(0, item.disponible) : 0), 0) / 100 });
  }
  return { disponibles, movimientos, mensualidades: ordenadas };
}

async function obtenerTrazabilidadCredito(id, models, { session, saldoActual = 0, mensualidad } = {}) {
  const mensualidades = await aplicarSession(models.Mensualidad.find({ id_alumno: id }), session);
  const vigentes = mensualidad ? mensualidades.filter((item) => String(item._id) !== String(mensualidad._id)).concat(mensualidad) : mensualidades;
  return reconstruirCredito(vigentes, saldoActual);
}

async function actualizarRevisionCredito(mensualidad, models, { session } = {}) {
  if (!centavos(mensualidad.credito_aplicado)) return 0;
  const trazabilidad = await obtenerTrazabilidadCredito(alumnoId(mensualidad), models, { session, mensualidad });
  const movimiento = trazabilidad.movimientos.get(String(mensualidad._id));
  mensualidad.credito_origenes = movimiento.credito_origenes;
  mensualidad.credito_en_revision = movimiento.credito_en_revision;
  return movimiento.credito_en_revision;
}

function estadoConCredito(mensualidad, pagos) {
  const cobertura = obtenerCoberturaMensualidad(mensualidad.monto_esperado, pagos);
  if (mensualidad.credito_en_revision > 0 || (mensualidad.pago_en_revision && cobertura.totalPagado > 0)) return 'En revision';
  if (cobertura.montoEsperado <= 0 || cobertura.cubreEsperadoConTolerancia) return 'Pagado';
  if (cobertura.totalPagado > 0 || mensualidad.credito_aplicado > 0) return 'Abono';
  return new Date(mensualidad.fecha_vencimiento) < new Date() ? 'Insolvente' : 'Pendiente';
}

async function sincronizarCreditoAlumno(id, models, { session } = {}) {
  const alumno = await aplicarSession(models.Alumno.findById(id), session);
  const trazabilidad = await obtenerTrazabilidadCredito(id, models, { session,
    saldoActual: alumno?.saldo_a_favor_mensualidades || 0 });
  for (const mensualidad of trazabilidad.mensualidades) {
    if (!centavos(mensualidad.credito_aplicado)) continue;
    const pagos = await aplicarSession(models.PagoDetalle.find({ id_mensualidad: mensualidad._id }), session);
    mensualidad.pago_en_revision = mensualidad.pago_en_revision
      ?? (mensualidad.estatus === 'En revision' && pagos.length > 0);
    await actualizarRevisionCredito(mensualidad, models, { session });
    mensualidad.saldo_a_favor_restante = trazabilidad.movimientos.get(String(mensualidad._id)).saldo_a_favor_restante;
    if (!['Exonerado', 'Becado', 'Exento por reposo'].includes(mensualidad.estatus)) {
      mensualidad.estatus = estadoConCredito(mensualidad, pagos);
    }
    await mensualidad.save(session ? { session } : undefined);
  }
}

async function liberarCreditoOrigen(origen, saldoGeneradoNuevo, models, { session } = {}) {
  const id = alumnoId(origen);
  const alumno = await aplicarSession(models.Alumno.findById(id), session);
  const trazabilidad = await obtenerTrazabilidadCredito(id, models, { session,
    saldoActual: alumno?.saldo_a_favor_mensualidades || 0, mensualidad: origen });
  const aplicaciones = trazabilidad.mensualidades.filter((mensualidad) => String(mensualidad._id) !== String(origen._id))
    .map((mensualidad) => ({ mensualidad, movimiento: trazabilidad.movimientos.get(String(mensualidad._id)) }));
  const consumido = aplicaciones.reduce((total, item) => total + item.movimiento.credito_origenes
    .filter((fuente) => String(fuente.id_mensualidad) === String(origen._id))
    .reduce((suma, fuente) => suma + centavos(fuente.monto), 0), 0);
  let retirar = Math.max(0, consumido - centavos(saldoGeneradoNuevo));
  if (!retirar) return;
  if (!session) throw Object.assign(new Error('Retirar credito consumido requiere una transaccion. No se guardaron cambios.'), { status: 503 });
  for (const { mensualidad, movimiento } of aplicaciones) {
    if (mensualidad.credito_aplicado > 0 && !mensualidad.credito_origenes?.length) {
      mensualidad.credito_origenes = movimiento.credito_origenes;
      await mensualidad.save({ session });
    }
  }
  for (const { mensualidad, movimiento } of aplicaciones.reverse()) {
    if (retirar <= 0) break;
    const usado = movimiento.credito_origenes.filter((fuente) => String(fuente.id_mensualidad) === String(origen._id))
      .reduce((total, fuente) => total + centavos(fuente.monto), 0);
    const importe = Math.min(retirar, usado);
    if (!importe) continue;
    let pendiente = importe;
    mensualidad.credito_origenes = movimiento.credito_origenes.map((fuente) => {
      if (String(fuente.id_mensualidad) !== String(origen._id)) return fuente;
      const descuento = Math.min(pendiente, centavos(fuente.monto));
      pendiente -= descuento;
      return { ...fuente, monto: (centavos(fuente.monto) - descuento) / 100 };
    }).filter((fuente) => fuente.monto > 0);
    mensualidad.credito_aplicado = (centavos(mensualidad.credito_aplicado) - importe) / 100;
    const baseAnterior = centavos(mensualidad.monto_sin_recargo_usd);
    const baseNueva = Math.max(0, centavos(mensualidad.monto_base) - centavos(mensualidad.ajuste_extraordinario)
      - centavos(mensualidad.credito_aplicado));
    const restaurarBase = Math.min(importe, Math.max(0, baseNueva - baseAnterior));
    mensualidad.monto_sin_recargo_usd = (baseAnterior + restaurarBase) / 100;
    mensualidad.recargo_aplicado_usd = (centavos(mensualidad.recargo_aplicado_usd) + importe - restaurarBase) / 100;
    mensualidad.aplica_recargo = mensualidad.recargo_aplicado_usd > 0;
    mensualidad.monto_esperado = (centavos(mensualidad.monto_esperado) + importe) / 100;
    mensualidad.monto_con_recargo_usd = mensualidad.monto_esperado;
    const pagos = await aplicarSession(models.PagoDetalle.find({ id_mensualidad: mensualidad._id }), session);
    mensualidad.pago_en_revision = mensualidad.pago_en_revision ?? (mensualidad.estatus === 'En revision' && pagos.length > 0);
    const cobertura = obtenerCoberturaMensualidad(mensualidad.monto_esperado, pagos);
    const generado = Math.max(0, centavos(cobertura.totalPagado) - centavos(cobertura.montoEsperado)) / 100;
    if (generado < Number(mensualidad.saldo_a_favor_generado || 0)) {
      await liberarCreditoOrigen(mensualidad, generado, models, { session });
    }
    const vigente = await aplicarSession(models.Alumno.findById(id), session);
    vigente.saldo_a_favor_mensualidades = (centavos(vigente.saldo_a_favor_mensualidades) + importe
      + centavos(generado) - centavos(mensualidad.saldo_a_favor_generado)) / 100;
    if (vigente.saldo_a_favor_mensualidades < 0) throw Object.assign(new Error('No se pudo reconstruir el credito de origen.'), { status: 409 });
    await vigente.save({ session });
    mensualidad.saldo_a_favor_generado = generado;
    await actualizarRevisionCredito(mensualidad, models, { session });
    if (!mensualidad.credito_aplicado) mensualidad.credito_en_revision = 0;
    mensualidad.estatus = estadoConCredito(mensualidad, pagos);
    mensualidad.historial_ediciones = mensualidad.historial_ediciones || [];
    mensualidad.historial_ediciones.push({ accion: 'retiro_credito_origen', fecha: new Date(),
      nota: `Credito retirado por anulacion del pago de origen: ${(importe / 100).toFixed(2)}` });
    await mensualidad.save({ session });
    retirar -= importe;
  }
}

function proyectarCreditoMensualidades(mensualidades, saldosPorAlumno) {
  const disponibles = new Map([...saldosPorAlumno].map(([id, monto]) => [String(id), Math.max(0, centavos(monto))]));
  const proyecciones = new Map();
  const ordenadas = [...mensualidades].sort((primera, segunda) => Number(primera.anio) - Number(segunda.anio)
    || Number(primera.mes) - Number(segunda.mes) || String(primera._id).localeCompare(String(segunda._id)));
  for (const mensualidad of ordenadas) {
    const pendiente = Math.max(0, centavos(mensualidad.saldo_pendiente ?? mensualidad.monto_esperado));
    const id = alumnoId(mensualidad);
    const disponible = disponibles.get(id) || 0;
    const estado = String(mensualidad.estatus || '').toLowerCase();
    const puedeAplicar = estadosPagables.has(estado) || (estado === 'en revision' && mensualidad.credito_en_revision > 0);
    const aplicable = puedeAplicar
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
    estatus: { $in: ['Pendiente', 'Retrasado', 'Insolvente', 'Abono', 'En revision'] } }).populate('id_alumno'), session);
  const pendientes = [];
  for (const mensualidad of mensualidades) {
    if (prepararMensualidad) await prepararMensualidad(mensualidad);
    const pagos = await aplicarSession(models.PagoDetalle.find({ id_mensualidad: mensualidad._id }), session);
    const totalPagado = pagos.reduce((total, pago) => total + centavos(pago.monto_pagado), 0);
    const raw = mensualidad.toObject ? mensualidad.toObject() : { ...mensualidad };
    pendientes.push({ ...raw, saldo_pendiente: Math.max(0, centavos(raw.monto_esperado) - totalPagado) / 100 });
  }
  const proyecciones = proyectarCreditoMensualidades(pendientes, new Map([[String(id), saldo]]));
  const trazabilidad = await obtenerTrazabilidadCredito(id, models, { session, saldoActual: saldo });
  return { alumno, saldo, disponibles: trazabilidad.disponibles,
    proyecciones: new Map(proyecciones.map((item) => [String(item._id), item])) };
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
  const origenes = tomarCredito(cotizacion.disponibles || [{ disponible: centavos(alumno.saldo_a_favor_mensualidades), provisional: false }], credito);
  mensualidad.credito_origenes = [...(mensualidad.credito_origenes || []), ...origenes];
  mensualidad.credito_en_revision = (centavos(mensualidad.credito_en_revision)
    + origenes.reduce((total, origen) => total + (origen.provisional ? centavos(origen.monto) : 0), 0)) / 100;
  mensualidad.saldo_a_favor_restante = (centavos(alumno.saldo_a_favor_mensualidades) - importe) / 100;
  mensualidad.historial_ediciones = mensualidad.historial_ediciones || [];
  mensualidad.historial_ediciones.push({ accion: 'aplicacion_saldo_a_favor', fecha: new Date(),
    nota: `Saldo a favor aplicado: ${credito.toFixed(2)}`, actor_id: actor?.id, actor_rol: actor?.rol,
    actor_nombre: actor?.nombre, anterior, nuevo: { monto_esperado: mensualidad.monto_esperado,
      estatus: mensualidad.estatus, saldo_a_favor_generado: mensualidad.saldo_a_favor_generado } });
  alumno.saldo_a_favor_mensualidades = (centavos(alumno.saldo_a_favor_mensualidades) - importe) / 100;
  await alumno.save({ session });
  return credito;
}

module.exports = { proyectarCreditoMensualidades, cotizarCreditosAlumno, aplicarCreditoMensualidad,
  reconstruirCredito, obtenerTrazabilidadCredito, tomarCredito, actualizarRevisionCredito, sincronizarCreditoAlumno,
  liberarCreditoOrigen };