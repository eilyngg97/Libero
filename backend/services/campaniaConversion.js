const { createHash } = require('crypto');
const { aplicarSession } = require('./financeTransaction');
const { cantidadCargos, datosCoberturaFamiliar, agruparCargosPorRepresentante, totalesCargos } = require('./campaniaBilling');

const fallo = (mensaje) => Object.assign(new Error(mensaje), { status: 409 });

async function prepararConversion(models, campania, session = null) {
  if (campania.estado !== 'abierta' || !campania.publicacion || (campania.unidad_cobro || 'atleta') !== 'atleta') {
    throw fallo('Solo puedes convertir una campana abierta con cobro por atleta.');
  }
  const pagos = await aplicarSession(models.Pago.find({ campania: campania._id }).sort({ _id: 1 }), session).lean();
  const anteriores = await aplicarSession(models.Cargo.find({ campania: campania._id }).select('+nota_interna')
    .sort({ alumno: 1 }), session).lean();
  const vigentes = campania.totales_cargos || campania.publicacion;
  const participantes = new Set(campania.participantes.map(String));
  if (!anteriores.length || anteriores.length !== cantidadCargos(vigentes) || anteriores.length !== participantes.size
    || new Set(anteriores.map((cargo) => String(cargo.alumno))).size !== anteriores.length
    || anteriores.some((cargo) => !participantes.has(String(cargo.alumno)) || cargo.moneda !== campania.moneda
      || (cargo.tipo_cobro && cargo.tipo_cobro !== 'atleta') || !Number.isFinite(cargo.monto) || cargo.monto < 0
      || !Number.isFinite(cargo.saldo_pendiente) || cargo.saldo_pendiente < 0 || cargo.saldo_pendiente > cargo.monto
      || (cargo.modalidad === 'no_aplica' ? cargo.monto !== 0 || cargo.estado !== 'no_aplica'
        : !(cargo.monto > 0) || cargo.estado !== (cargo.saldo_pendiente === 0 ? 'pagado'
          : cargo.saldo_pendiente === cargo.monto ? 'pendiente' : 'abono'))
      || (cargo.retirado && cargo.modalidad !== 'no_aplica'))
    || anteriores.reduce((total, cargo) => total + Math.round(cargo.monto * 100), 0) !== Math.round(vigentes.total_esperado * 100)) {
    throw fallo('No se pudieron verificar los cargos originales y sus saldos. No se puede convertir.');
  }
  const porCargo = new Map(anteriores.map((cargo) => [String(cargo._id), []]));
  for (const pago of pagos) {
    if (!porCargo.has(String(pago.cargo)) || !['confirmado', 'en_revision', 'eliminado'].includes(pago.estado)
      || !Number.isFinite(pago.monto_pagado) || pago.monto_pagado <= 0 || pago.moneda !== campania.moneda) {
      throw fallo('No se pudieron verificar los pagos existentes. No se puede convertir.');
    }
    porCargo.get(String(pago.cargo)).push(pago);
  }
  for (const cargo of anteriores) {
    const registros = porCargo.get(String(cargo._id));
    const confirmado = registros.filter((pago) => pago.estado === 'confirmado')
      .reduce((total, pago) => total + Math.round(pago.monto_pagado * 100), 0);
    const reservado = registros.filter((pago) => pago.estado === 'en_revision')
      .reduce((total, pago) => total + Math.round(pago.monto_pagado * 100), 0);
    if (confirmado + Math.round(cargo.saldo_pendiente * 100) !== Math.round(cargo.monto * 100)
      || reservado > Math.round(cargo.saldo_pendiente * 100)) throw fallo('Los pagos y saldos no coinciden. No se puede convertir.');
  }
  const atletas = await aplicarSession(models.Alumno.find({ _id: { $in: [...participantes] } })
    .select('representante').populate('representante', 'nombres apellidos'), session).lean();
  const porId = new Map(atletas.map((atleta) => [String(atleta._id), atleta]));
  const individuales = anteriores.map((cargo) => ({
    _id: String(cargo._id), alumno: String(cargo.alumno), nombres: cargo.nombres, apellidos: cargo.apellidos,
    categoria: cargo.categoria, sede: { _id: String(cargo.sede), nombre: cargo.nombre_sede },
    modalidad: cargo.modalidad, monto: cargo.monto, retirado: cargo.retirado === true,
    saldo_pendiente: cargo.saldo_pendiente, estado: cargo.estado,
    nota_interna: cargo.nota_interna || '', representante: porId.get(String(cargo.alumno))?.representante || null,
    incidencias: porId.has(String(cargo.alumno)) ? [] : ['El atleta ya no esta disponible. Revisa sus datos antes de convertir.']
  }));
  const grupos = new Map();
  for (const fila of individuales) {
    const clave = fila.representante ? `representante:${fila.representante._id}` : `alumno:${fila.alumno}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(fila);
  }
  const filas = [];
  const preservar = (grupo, motivo) => {
    for (const { representante, ...fila } of grupo) filas.push({ ...fila, tipo_cobro: 'atleta',
      preservado_conversion: true, motivo_conservacion: motivo,
      representante_excepcion: representante ? String(representante._id) : null,
      nombre_representante: representante ? [representante.nombres, representante.apellidos].filter(Boolean).join(' ') : '',
      incidencias: [] });
  };
  for (const grupo of grupos.values()) {
    const conPagos = grupo.filter((fila) => porCargo.get(fila._id).length > 0);
    const agrupada = agruparCargosPorRepresentante(grupo)[0];
    if (conPagos.length) {
      const fuente = conPagos[0];
      if (grupo.length === 1) {
        const registros = porCargo.get(fuente._id);
        const motivos = [];
        if (registros.some((pago) => pago.estado === 'en_revision')) motivos.push('pagos en revision');
        if (registros.some((pago) => pago.estado === 'eliminado')) motivos.push('pagos eliminados en su historial');
        if (registros.some((pago) => pago.estado === 'confirmado')) {
          motivos.push(fuente.estado === 'abono' ? 'abonos confirmados' : 'pagos confirmados');
        }
        preservar(grupo, `Cargo individual conservado sin cambios: tiene ${motivos.join(' y ')}. Solo corresponde a este atleta.${
          agrupada.incidencias.length ? ` ${agrupada.incidencias.join(' ')}` : ''}`);
        continue;
      }
      const cubreFamilia = conPagos.length === 1 && fuente.estado === 'pagado' && !fuente.retirado
        && porCargo.get(fuente._id).every((pago) => pago.estado === 'confirmado')
        && Boolean(fuente.representante) && !agrupada.incidencias.length;
      if (!cubreFamilia) {
        preservar(grupo, 'Familia conservada para revision: hay pagos parciales, en revision/eliminados, varios cargos con pagos o condiciones distintas.');
        continue;
      }
      preservar([fuente], 'Cargo pagado conservado sin modificaciones; su pago confirmado cubre a los hermanos indicados.');
      for (const { representante, ...fila } of grupo.filter((item) => item._id !== fuente._id)) {
        filas.push({ ...fila, ...datosCoberturaFamiliar(fila, fuente, representante) });
      }
    } else if (agrupada.incidencias.length) {
      preservar(grupo, `${grupo.length === 1 ? 'Cargo individual conservado para revision' : 'Familia conservada para revision'}: ${agrupada.incidencias.join(' ')}`);
    } else filas.push(agrupada);
  }
  const totales = { ...totalesCargos(filas, true),
    pendientes: filas.filter((fila) => fila.monto === null).length,
    con_observaciones: filas.filter((fila) => fila.incidencias.length).length,
    subtotal_calculado: filas.reduce((total, fila) => total + Math.round((fila.monto || 0) * 100), 0) / 100 };
  const revision = createHash('sha256').update(JSON.stringify({ version: campania.__v,
    cargos: anteriores, pagos, filas, totales })).digest('hex');
  return { anteriores, filas, totales, revision,
    antes: { cobros: anteriores.length, total_esperado: vigentes.total_esperado } };
}

module.exports = { prepararConversion };
