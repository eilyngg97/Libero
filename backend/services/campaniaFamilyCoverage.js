const { createHash } = require('crypto');
const { aplicarSession } = require('./financeTransaction');
const { alumnosCargo, totalesCargos, fotoAtleta } = require('./campaniaBilling');

const fallo = (mensaje) => Object.assign(new Error(mensaje), { status: 409 });
const centimos = (valor) => Math.round(valor * 100);
const cargoPublico = (cargo) => ({
  _id: String(cargo._id), alumno: String(cargo.alumno), nombres: cargo.nombres,
  apellidos: cargo.apellidos || '', monto: cargo.monto, saldo_pendiente: cargo.saldo_pendiente,
  estado: cargo.estado, modalidad: cargo.modalidad, version: cargo.__v,
  categoria: cargo.categoria || '', sede: { _id: String(cargo.sede), nombre: cargo.nombre_sede }
});

async function prepararCoberturaFamiliar(models, campania, cargoId, session = null) {
  if (campania.estado !== 'abierta' || !campania.publicacion || campania.unidad_cobro !== 'representante') {
    throw fallo('Solo puedes aplicar cobertura en una campana abierta por representante.');
  }
  const excepciones = campania.excepciones_cobro || [];
  const excepcion = excepciones.find((item) => String(item.cargo) === String(cargoId));
  if (!excepcion?.representante) throw fallo('El cargo no pertenece a una familia conservada de la conversion.');
  const anteriores = await aplicarSession(models.Cargo.find({ campania: campania._id })
    .select('+nota_interna').sort({ _id: 1 }), session).lean();
  const fuente = anteriores.find((cargo) => String(cargo._id) === String(cargoId));
  if (!fuente) throw Object.assign(new Error('El cargo no existe en esta campana.'), { status: 404 });
  const totales = totalesCargos(anteriores, true);
  const participantes = anteriores.flatMap(alumnosCargo);
  const seleccionados = new Set(campania.participantes.map(String));
  if (!campania.totales_cargos || Object.entries(totales).some(([key, valor]) => valor !== (campania.totales_cargos[key] ?? 0))
    || participantes.length !== seleccionados.size || new Set(participantes).size !== participantes.length
    || participantes.some((id) => !seleccionados.has(id))
    || anteriores.some((cargo) => cargo.moneda !== campania.moneda || !Number.isFinite(cargo.monto)
      || !Number.isFinite(cargo.saldo_pendiente) || cargo.monto < 0 || cargo.saldo_pendiente < 0
      || cargo.saldo_pendiente > cargo.monto)) throw fallo('No se pudieron verificar los cargos y totales de la campana.');
  const idsFamilia = excepciones.filter((item) => String(item.representante) === String(excepcion.representante))
    .map((item) => String(item.cargo));
  const familia = anteriores.filter((cargo) => idsFamilia.includes(String(cargo._id)));
  if (new Set(idsFamilia).size !== idsFamilia.length || familia.length !== idsFamilia.length || familia.length < 2) {
    throw fallo('No hay hermanos conservados pendientes para cubrir con este pago.');
  }
  if (anteriores.some((cargo) => String(cargo.representante_cobro || '') === String(excepcion.representante)
    || String(cargo.cobertura_familiar?.cargo || '') === String(cargoId))) {
    throw fallo('Este representante ya tiene un cobro familiar o cobertura aplicada. Actualiza sus cargos.');
  }
  const atletas = await aplicarSession(models.Alumno.find({ _id: { $in: familia.map((cargo) => cargo.alumno) } })
    .select('representante').sort({ _id: 1 }), session).lean();
  const representante = await aplicarSession(models.Representante.findById(excepcion.representante)
    .select('nombres apellidos'), session).lean();
  if (!representante || atletas.length !== familia.length
    || atletas.some((atleta) => String(atleta.representante || '') !== String(excepcion.representante))) {
    throw fallo('Los atletas ya no comparten el representante registrado al convertir. Revisa sus datos.');
  }
  if (familia.some((cargo) => (cargo.tipo_cobro || 'atleta') !== 'atleta'
    || cargo.atletas_cubiertos?.length || cargo.cobertura_familiar || cargo.retirado)
    || !['pagado', 'abono'].includes(fuente.estado) || fuente.monto <= 0
    || (fuente.estado === 'pagado' ? fuente.saldo_pendiente !== 0
      : fuente.saldo_pendiente <= 0 || fuente.saldo_pendiente >= fuente.monto || !fuente.permitir_abonos)
    || !['general', 'personalizado'].includes(fuente.modalidad)) {
    throw fallo('El cargo de origen debe tener un pago o abono confirmado, con saldo coherente, sin retiros ni cobertura previa.');
  }
  const pagos = await aplicarSession(models.Pago.find({ campania: campania._id,
    cargo: { $in: familia.map((cargo) => cargo._id) } }).sort({ _id: 1 }), session).lean();
  const pagosFuente = pagos.filter((pago) => String(pago.cargo) === String(cargoId));
  const confirmados = pagosFuente.filter((pago) => pago.estado === 'confirmado');
  if (pagosFuente.some((pago) => !['confirmado', 'eliminado'].includes(pago.estado))
    || !confirmados.length || confirmados.some((pago) => pago.moneda !== fuente.moneda
      || !Number.isFinite(pago.monto_pagado) || pago.monto_pagado <= 0)
    || confirmados.reduce((total, pago) => total + centimos(pago.monto_pagado), 0)
      + centimos(fuente.saldo_pendiente) !== centimos(fuente.monto)) {
    throw fallo('El saldo pagado del origen no coincide con sus pagos confirmados o tiene pagos activos en revision. Los pagos eliminados no cuentan como deuda ni pago vigente.');
  }
  const hermanos = familia.filter((cargo) => String(cargo._id) !== String(cargoId));
  if (pagos.some((pago) => String(pago.cargo) !== String(cargoId))) {
    throw fallo('Hay hermanos con historial de pagos, incluidos abonos, en revision o eliminados. No se puede aplicar cobertura.');
  }
  if (hermanos.some((cargo) => cargo.estado !== 'pendiente' || cargo.saldo_pendiente !== cargo.monto
    || cargo.monto !== fuente.monto || cargo.modalidad !== fuente.modalidad)) {
    throw fallo('Todos los hermanos deben estar pendientes y tener el mismo importe y condicion que el cargo de origen.');
  }
  const datosFamilia = {
    tipo_cobro: 'representante', representante_cobro: representante._id,
    nombre_representante: [representante.nombres, representante.apellidos].filter(Boolean).join(' '),
    atletas_cubiertos: [fuente, ...hermanos].map((cargo) => fotoAtleta({
      ...cargo, sede: { _id: cargo.sede, nombre: cargo.nombre_sede }
    }))
  };
  const idsHermanos = new Set(hermanos.map((cargo) => String(cargo._id)));
  const despues = totalesCargos(anteriores.filter((cargo) => !idsHermanos.has(String(cargo._id)))
    .map((cargo) => String(cargo._id) === String(cargoId) ? { ...cargo, ...datosFamilia } : cargo), true);
  const revision = createHash('sha256').update(JSON.stringify({ version: campania.__v, cargo: String(cargoId),
    anteriores, excepciones, atletas, representante, pagos, despues })).digest('hex');
  return { anteriores, familia, datosFamilia, fuente: cargoPublico(fuente), hermanos: hermanos.map(cargoPublico),
    representante: { _id: String(representante._id), nombre: [representante.nombres, representante.apellidos].filter(Boolean).join(' ') },
    antes: totales, despues, revision };
}

module.exports = { prepararCoberturaFamiliar };
