const { aplicarSession } = require('./financeTransaction');
const { createHash } = require('crypto');

const fallo = (status, message) => Object.assign(new Error(message), { status });
const centimos = (monto) => Math.round(monto * 100);

async function actualizarCargo(models, cargo, monto, session) {
  const saldo = (centimos(cargo.saldo_pendiente) - centimos(monto)) / 100;
  if (saldo < 0 || (!cargo.permitir_abonos && saldo !== 0)) throw fallo(409, 'El pago supera el saldo o la campana no permite abonos.');
  const guardado = await models.CargoCampania.findOneAndUpdate({ _id: cargo._id, __v: cargo.__v,
    saldo_pendiente: cargo.saldo_pendiente, estado: cargo.estado }, { $set: { saldo_pendiente: saldo,
    estado: saldo === 0 ? 'pagado' : 'abono' }, $inc: { __v: 1 } }, { new: true, runValidators: true, session }).lean();
  if (!guardado) throw fallo(409, 'El cargo cambio. Revisa su saldo antes de registrar el pago.');
  return guardado;
}

function revisionPagoCampania(pago) {
  return createHash('sha256').update(JSON.stringify({
    id: String(pago._id), campania: String(pago.campania?._id || pago.campania), cargo: String(pago.cargo?._id || pago.cargo),
    moneda: pago.moneda, monto: pago.monto_pagado, monto_bs: pago.monto_pagado_bs,
    fecha: pago.fecha_pago, metodo: pago.metodo_pago, referencia: pago.referencia,
    telefono: pago.telefono_pago || '', cedula: pago.cedula_titular || '',
    ...(pago.agrupacion ? { agrupacion: pago.agrupacion } : {})
  })).digest('hex');
}

function validarGrupoCampania(pagos) {
  const primero = pagos[0];
  const grupo = primero?.agrupacion;
  if (!grupo || pagos.length < 2 || pagos.length !== grupo.cargos.length || pagos.filter((pago) => pago.es_principal_grupo).length !== 1
    || new Set(pagos.map((pago) => String(pago.cargo?._id || pago.cargo))).size !== pagos.length
    || pagos.some((pago) => JSON.stringify(pago.agrupacion) !== JSON.stringify(grupo)
      || !grupo.cargos.some((cargo) => String(cargo) === String(pago.cargo?._id || pago.cargo))
      || ['moneda', 'fecha_pago', 'metodo_pago', 'referencia', 'telefono_pago', 'cedula_titular', 'comprobante_url']
        .some((campo) => (pago[campo] || '') !== (primero[campo] || ''))
      || !['en_revision', 'confirmado'].includes(pago.estado))
    || pagos.reduce((suma, pago) => suma + centimos(pago.monto_pagado), 0) !== centimos(grupo.monto_total)
    || (grupo.monto_total_bs == null ? pagos.some((pago) => pago.monto_pagado_bs != null)
      : pagos.some((pago) => !(pago.monto_pagado_bs > 0))
        || pagos.reduce((suma, pago) => suma + centimos(pago.monto_pagado_bs), 0) !== centimos(grupo.monto_total_bs))) {
    throw fallo(409, 'El pago agrupado cambio o esta incompleto. Consulta el historial.');
  }
}

function revisionTransferenciaCampania(pagos) {
  if (!pagos[0]?.agrupacion) return revisionPagoCampania(pagos[0]);
  return createHash('sha256').update(JSON.stringify([...pagos].sort((primero, segundo) => String(primero._id).localeCompare(String(segundo._id)))
    .map(revisionPagoCampania))).digest('hex');
}

function agruparPagosCampania(pagos) {
  const grupos = new Map();
  for (const pago of pagos) {
    const clave = pago.agrupacion?.id || String(pago._id);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(pago);
  }
  return [...grupos.values()].filter((grupo) => {
    if (!grupo[0].agrupacion) return true;
    try { validarGrupoCampania(grupo); return true; } catch (_) { return false; }
  }).map((grupo) => ({ pagos: grupo, pago: [...grupo].sort((primero, segundo) => String(primero._id).localeCompare(String(segundo._id)))[0],
    revision: revisionTransferenciaCampania(grupo) }));
}

async function confirmarPagoCampania(models, opciones, session) {
  const { campaniaId, cargoId, pagoId, revision } = opciones;
  const seleccionado = await aplicarSession(models.PagoCampania.findOne({ _id: pagoId, cargo: cargoId, campania: campaniaId }), session).lean();
  if (!seleccionado) throw fallo(404, 'El pago no existe en este cargo.');
  if (!seleccionado.agrupacion) return confirmarAsignacion(models, opciones, session);
  const pagos = await aplicarSession(models.PagoCampania.find({ 'agrupacion.id': seleccionado.agrupacion.id }).sort({ _id: 1 }), session).lean();
  validarGrupoCampania(pagos);
  if (revision !== undefined && (revision !== revisionTransferenciaCampania(pagos) || !(seleccionado.agrupacion.monto_total_bs > 0))) {
    throw fallo(409, 'El pago agrupado cambio desde la conciliacion. Procesa nuevamente el archivo.');
  }
  let resultado;
  let confirmados = 0;
  const confirmaciones = [];
  for (const pago of pagos) {
    const respuesta = await confirmarAsignacion(models, { ...opciones, campaniaId: pago.campania,
      cargoId: pago.cargo, pagoId: pago._id, revision: undefined }, session);
    if (!respuesta.repetida) confirmados += 1;
    if (String(pago._id) === String(pagoId)) resultado = respuesta;
    confirmaciones.push(respuesta.pago);
  }
  return { ...resultado, pagos: confirmaciones, repetida: confirmados === 0, confirmados };
}

async function confirmarAsignacion(models, { campaniaId, cargoId, pagoId, actor, revision }, session) {
  if (!actor?.id || !['admin', 'super_admin'].includes(actor.rol)) throw fallo(403, 'Solo administracion puede confirmar pagos de campanas.');
  const campania = await aplicarSession(models.CampaniaCobro.findById(campaniaId), session).lean();
  if (!campania) throw fallo(404, 'La campana no existe en esta academia.');
  if (!campania.publicacion || campania.estado !== 'abierta') throw fallo(409, 'La campana no admite pagos.');
  let cargo = await aplicarSession(models.CargoCampania.findOne({ _id: cargoId, campania: campaniaId }), session).lean();
  if (!cargo) throw fallo(404, 'El cargo no existe en esta campana.');
  const pago = await aplicarSession(models.PagoCampania.findOne({ _id: pagoId, cargo: cargo._id, campania: campaniaId }), session).lean();
  if (!pago) throw fallo(404, 'El pago no existe en este cargo.');
  if (revision !== undefined && (revisionPagoCampania(pago) !== revision || !(pago.monto_pagado_bs > 0))) {
    throw fallo(409, 'El pago cambio desde la conciliacion. Procesa nuevamente el archivo.');
  }
  if (pago.estado === 'eliminado') throw fallo(409, 'El pago fue eliminado. Consulta el historial.');
  if (pago.estado === 'confirmado') return { cargo, pago, repetida: true };
  if (cargo.modalidad === 'no_aplica' || pago.moneda !== cargo.moneda) throw fallo(409, 'El cargo no admite la confirmacion.');
  cargo = await actualizarCargo(models, cargo, pago.monto_pagado, session);
  const confirmado = await models.PagoCampania.findOneAndUpdate({ _id: pago._id, estado: 'en_revision' }, {
    $set: { estado: 'confirmado', confirmado_por: { id: actor.id, rol: actor.rol }, confirmado_en: new Date() }
  }, { new: true, runValidators: true, session }).lean();
  if (!confirmado) throw fallo(409, 'El pago cambio. Consulta el historial.');
  return { cargo, pago: confirmado, repetida: false };
}

module.exports = { actualizarCargo, confirmarPagoCampania, revisionPagoCampania, agruparPagosCampania, validarGrupoCampania };