const { ordenarPagos, obtenerCoberturaMensualidad } = require('./monthlyPaymentCoverage');

const id = (value) => String(value?._id || value || '');
const importe = (value) => Math.round((Number(value) || 0) * 100);
const nombre = (value) => `${value?.nombres || ''} ${value?.apellidos || ''}`.trim();

function fechaCalendarioPago(value) {
  const fecha = new Date(value);
  if (!value || Number.isNaN(fecha.getTime())) return null;
  const medianocheUTC = fecha.getUTCHours() === 0 && fecha.getUTCMinutes() === 0
    && fecha.getUTCSeconds() === 0 && fecha.getUTCMilliseconds() === 0;
  return new Date(fecha.getTime() - (medianocheUTC ? 0 : 4 * 3600000)).toISOString().slice(0, 10);
}

function resolverPeriodoReporte(query = {}, ahora = new Date()) {
  const mes = Number(query.mes);
  const anio = Number(query.anio);
  const actual = fechaCalendarioPago(ahora);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    throw Object.assign(new Error('Selecciona un mes y un anio validos.'), { status: 400 });
  }
  const prefijo = `${anio}-${String(mes).padStart(2, '0')}`;
  if (prefijo > actual.slice(0, 7)) throw Object.assign(new Error('No se permiten periodos futuros.'), { status: 400 });
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const desde = query.desde || `${prefijo}-01`;
  const hasta = query.hasta || `${prefijo}-${ultimoDia}`;
  for (const fecha of [desde, hasta]) {
    if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)
      || !fecha.startsWith(`${prefijo}-`) || Number(fecha.slice(8)) < 1 || Number(fecha.slice(8)) > ultimoDia) {
      throw Object.assign(new Error('El rango de fechas debe estar dentro del mes seleccionado.'), { status: 400 });
    }
  }
  if (desde > hasta) throw Object.assign(new Error('La fecha inicial no puede superar la final.'), { status: 400 });
  return { mes, anio, desde, hasta,
    inicioConsulta: new Date(`${desde}T00:00:00.000Z`),
    finConsulta: new Date(Date.UTC(anio, mes - 1, Number(hasta.slice(8)) + 1, 4)) };
}

function estadoPago(pago, cuota) {
  const grupo = pago.id_pago_agrupado;
  if (grupo) {
    if (['Rechazado', 'Anulado'].includes(grupo.estado)) return null;
    return grupo.estado === 'Conciliado' ? 'Confirmado' : 'En revision';
  }
  if (cuota.pago_en_revision === true) return 'En revision';
  if (cuota.pago_en_revision === false) return 'Confirmado';
  return ['Pagado', 'Abono', 'Insolvente', 'Retrasado'].includes(cuota.estatus) ? 'Confirmado' : 'En revision';
}

function construirReportePagos({ alumnos = [], mensualidades = [], pagos = [], periodo, sede }) {
  const cuotas = new Map(mensualidades.map((cuota) => [id(cuota), cuota]));
  const pagosPorCuota = new Map();
  const transferencias = new Map();
  const dentroSede = (alumno) => !sede || id(alumno?.sede) === String(sede);
  const alumnosReporte = new Map(alumnos.filter(dentroSede).map((alumno) => [id(alumno), alumno]));

  for (const pago of pagos) {
    const cuota = cuotas.get(id(pago.id_mensualidad));
    if (!cuota || importe(pago.monto_pagado) <= 0) continue;
    const alumno = cuota.id_alumno;
    if (!alumno?._id || !dentroSede(alumno)) continue;
    alumnosReporte.set(id(alumno), alumno);
    const estado = estadoPago(pago, cuota);
    if (!estado) continue;
    const fecha = fechaCalendarioPago(pago.id_pago_agrupado?.fecha_pago || pago.fecha_pago);
    if (!fecha) continue;
    const evidencia = { ...pago, fecha_pago: fecha, estado_reporte: estado };
    const lista = pagosPorCuota.get(id(cuota)) || [];
    lista.push(evidencia);
    pagosPorCuota.set(id(cuota), lista);
    if (fecha < periodo.desde || fecha > periodo.hasta) continue;
    const clave = pago.id_pago_agrupado ? `grupo:${id(pago.id_pago_agrupado)}` : `pago:${id(pago)}`;
    if (!transferencias.has(clave)) {
      transferencias.set(clave, { id: clave, agrupado: !!pago.id_pago_agrupado,
        codigo: pago.id_pago_agrupado?.codigo || '', fecha, estado,
        metodo: pago.id_pago_agrupado?.metodo_pago || pago.metodo_pago,
        referencia: pago.id_pago_agrupado?.referencia || pago.referencia || '',
        monto: 0, asignaciones: [] });
    }
    const transferencia = transferencias.get(clave);
    transferencia.monto += importe(pago.monto_pagado);
    transferencia.asignaciones.push({ id_alumno: id(alumno), alumno: nombre(alumno),
      representante: nombre(alumno.representante), sede: alumno.sede?.nombre || '',
      mes: cuota.mes, anio: cuota.anio, monto: importe(pago.monto_pagado) / 100 });
  }

  const registros = [...transferencias.values()].map((item) => ({ ...item, monto: item.monto / 100 }))
    .sort((primero, segundo) => segundo.fecha.localeCompare(primero.fecha) || primero.id.localeCompare(segundo.id));
  const alumnosConPago = new Set(registros.flatMap((item) => item.asignaciones.map((asignacion) => asignacion.id_alumno)));
  const resumen = { pagos: registros.length, alumnos: alumnosConPago.size, confirmados: 0, en_revision: 0,
    total_confirmado: 0, total_en_revision: 0 };
  for (const registro of registros) {
    const confirmado = registro.estado === 'Confirmado';
    resumen[confirmado ? 'confirmados' : 'en_revision'] += 1;
    resumen[confirmado ? 'total_confirmado' : 'total_en_revision'] += importe(registro.monto);
  }
  resumen.total_confirmado /= 100;
  resumen.total_en_revision /= 100;

  const periodosHabito = new Map();
  const observaciones = new Map();
  for (const cuota of mensualidades) {
    const alumno = cuota.id_alumno;
    if (!alumno?._id || !dentroSede(alumno)
      || cuota.es_inscripcion || cuota.tipo_registro_inicial || Number(cuota.credito_aplicado) > 0
      || Number(cuota.credito_en_revision) > 0 || ['Becado', 'Exonerado', 'Exento por reposo'].includes(cuota.estatus)
      || importe(cuota.monto_esperado) <= 0) continue;
    const confirmados = ordenarPagos((pagosPorCuota.get(id(cuota)) || [])
      .filter((pago) => pago.estado_reporte === 'Confirmado'));
    const acumulados = [];
    let completada;
    for (const pago of confirmados) {
      acumulados.push(pago);
      if (obtenerCoberturaMensualidad(cuota.monto_esperado, acumulados).cubreEsperadoConTolerancia) {
        completada = pago.fecha_pago;
        break;
      }
    }
    if (!completada) continue;
    periodosHabito.set(`${cuota.anio}-${cuota.mes}`, { mes: cuota.mes, anio: cuota.anio });
    const dia = Number(completada.slice(8));
    const periodoCuota = `${cuota.anio}-${String(cuota.mes).padStart(2, '0')}`;
    const franja = completada.slice(0, 7) < periodoCuota ? 'anticipado'
      : completada.slice(0, 7) > periodoCuota ? 'atrasado'
        : dia <= 5 ? '1_5' : dia <= 15 ? '6_15' : '16_fin';
    const muestras = observaciones.get(id(alumno)) || [];
    muestras.push({ mes: cuota.mes, anio: cuota.anio, fecha_completada: completada, franja });
    observaciones.set(id(alumno), muestras);
  }

  const habitos = [...alumnosReporte.values()].map((alumno) => {
    const muestras = (observaciones.get(id(alumno)) || []).sort((primero, segundo) => primero.anio - segundo.anio || primero.mes - segundo.mes);
    const conteos = new Map();
    for (const muestra of muestras) conteos.set(muestra.franja, (conteos.get(muestra.franja) || 0) + 1);
    const frecuencias = [...conteos.entries()].sort((primero, segundo) => segundo[1] - primero[1]);
    const predominante = frecuencias[0];
    const franjasFrecuentes = frecuencias.filter((frecuencia) => frecuencia[1] === predominante?.[1])
      .map((frecuencia) => frecuencia[0]);
    const franjaFrecuente = franjasFrecuentes.length === 1 ? franjasFrecuentes[0] : null;
    const franja = muestras.length < 2 ? 'insuficiente'
      : predominante[1] >= 2 && predominante[1] > muestras.length / 2 ? predominante[0] : 'sin_patron';
    return { id_alumno: id(alumno), alumno: nombre(alumno), representante: nombre(alumno.representante),
      franja, franja_frecuente: franjaFrecuente, franjas_frecuentes: franjasFrecuentes,
      coincidencias: predominante?.[1] || 0, meses_observados: muestras.length, muestras };
  }).sort((primero, segundo) => primero.alumno.localeCompare(segundo.alumno, 'es'));
  return { periodo: { mes: periodo.mes, anio: periodo.anio, desde: periodo.desde, hasta: periodo.hasta },
    periodos_habito: [...periodosHabito.values()].sort((primero, segundo) => primero.anio - segundo.anio || primero.mes - segundo.mes),
    resumen, pagos: registros, habitos };
}

module.exports = { fechaCalendarioPago, resolverPeriodoReporte, construirReportePagos };