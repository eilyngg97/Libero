const { aplicarSession } = require('./financeTransaction');

const fallo = (mensaje) => Object.assign(new Error(mensaje), { status: 409 });
const centimos = (valor) => Math.round(valor * 100);

async function bloquearCampania(models, id, session, permitirCorreccion = false) {
  const estados = permitirCorreccion ? { $or: [{ estado: 'abierta' }, { estado: 'cerrada', 'cierre.tipo': 'automatico' }] }
    : { estado: 'abierta' };
  const actual = await models.CampaniaCobro.findOneAndUpdate({ _id: id, publicacion: { $exists: true }, ...estados },
    { $inc: { __v: 1 } }, { new: true, session }).select('+cierre').lean();
  if (!actual) throw fallo('La campana cambio o esta cerrada. Actualiza los datos antes de continuar.');
  return actual;
}

async function resumenCierre(models, campania, session) {
  const cargos = await aplicarSession(models.CargoCampania.find({ campania: campania._id })
    .select('alumno modalidad monto saldo_pendiente moneda estado retirado'), session).lean();
  const totales = campania.totales_cargos || campania.publicacion;
  if (!totales || cargos.length !== totales.participantes || new Set(cargos.map((cargo) => String(cargo.alumno))).size !== cargos.length
    || cargos.some((cargo) => cargo.moneda !== campania.moneda
      || !Number.isFinite(cargo.monto) || !Number.isFinite(cargo.saldo_pendiente)
      || cargo.monto < 0 || cargo.saldo_pendiente < 0 || cargo.saldo_pendiente > cargo.monto
      || ((cargo.modalidad === 'no_aplica' || cargo.retirado) && (cargo.monto !== 0 || cargo.saldo_pendiente !== 0)))
    || cargos.reduce((suma, cargo) => suma + centimos(cargo.monto), 0) !== centimos(totales.total_esperado)) {
    throw fallo('No se pudieron verificar los cargos para cerrar la campana.');
  }
  const exigibles = cargos.filter((cargo) => cargo.modalidad !== 'no_aplica' && !cargo.retirado && cargo.monto > 0);
  const saldo = exigibles.reduce((suma, cargo) => suma + centimos(cargo.saldo_pendiente), 0) / 100;
  const enRevision = Boolean(await aplicarSession(models.PagoCampania.findOne({ campania: campania._id, estado: 'en_revision' }), session).lean());
  return { saldo_pendiente: saldo, exigibles: exigibles.length, en_revision: enRevision,
    completa: exigibles.length > 0 && !enRevision && exigibles.every((cargo) => cargo.estado === 'pagado' && cargo.saldo_pendiente === 0) };
}

async function actualizarCierreAutomatico(models, ids, actor, session) {
  for (const id of [...new Set(ids.map(String))].sort()) {
    const campania = await aplicarSession(models.CampaniaCobro.findById(id).select('+cierre'), session).lean();
    if (!campania?.publicacion || !['abierta', 'cerrada'].includes(campania.estado)
      || (campania.estado === 'cerrada' && campania.cierre?.tipo !== 'automatico')) continue;
    const resumen = await resumenCierre(models, campania, session);
    const cerrar = campania.estado === 'abierta' && resumen.completa;
    const reabrir = campania.estado === 'cerrada' && resumen.saldo_pendiente > 0;
    if (!cerrar && !reabrir) continue;
    const evento = { tipo: cerrar ? 'automatico' : 'reapertura_por_correccion', fecha: new Date(),
      actor: { id: String(actor.id), rol: actor.rol }, saldo_pendiente: resumen.saldo_pendiente };
    const actualizada = await models.CampaniaCobro.findOneAndUpdate({ _id: campania._id, __v: campania.__v, estado: campania.estado }, {
      $set: { estado: cerrar ? 'cerrada' : 'abierta', actualizado_por: evento.actor, ...(cerrar ? { cierre: evento } : {}) },
      ...(!cerrar ? { $unset: { cierre: 1 } } : {}), $inc: { __v: 1 }, $push: { historial_cierres: evento }
    }, { new: true, session, runValidators: true }).lean();
    if (!actualizada) throw fallo('La campana cambio durante el cierre. Reintenta la misma operacion.');
  }
}

module.exports = { bloquearCampania, resumenCierre, actualizarCierreAutomatico };