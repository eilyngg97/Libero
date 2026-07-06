const Mensualidad = require('../models/Mensualidad');
const Alumno = require('../models/Alumno');
const Sede = require('../models/Sede');
const Reposo = require('../models/Reposo');
const PagoDetalle = require('../models/PagoDetalle');
const TenantConfig = require('../models/TenantConfig');
const Representante = require('../models/Representante');
const mongoose = require('mongoose');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');

const MONTO_TOLERANCIA_BS = 100;
const SALDO_A_FAVOR_CONSUMIDO_ERROR = 'El saldo a favor de esta mensualidad ya fue consumido en meses posteriores.';

function esErrorSaldoAFavorConsumido(err) {
  return String(err?.message || '').trim() === SALDO_A_FAVOR_CONSUMIDO_ERROR;
}

async function getTenantMensualidadModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);

  const TenantRepresentante = getTenantModel(connection, 'Representante');
  const TenantAlumno = getTenantModel(connection, 'Alumno');
  const TenantMensualidad = getTenantModel(connection, 'Mensualidad');
  const TenantPagoDetalle = getTenantModel(connection, 'PagoDetalle');
  const TenantSede = getTenantModel(connection, 'Sede');
  const TenantReposo = getTenantModel(connection, 'Reposo');
  const TenantConfigModel = getTenantModel(connection, 'TenantConfig');

  return {
    Representante: TenantRepresentante,
    Alumno: TenantAlumno,
    Mensualidad: TenantMensualidad,
    PagoDetalle: TenantPagoDetalle,
    Sede: TenantSede,
    Reposo: TenantReposo,
    TenantConfig: TenantConfigModel,
    connection
  };
}

function resolveMensualidadModels(models = {}) {
  return {
    Representante: models.Representante || Representante,
    Alumno: models.Alumno || Alumno,
    Mensualidad: models.Mensualidad || Mensualidad,
    PagoDetalle: models.PagoDetalle || PagoDetalle,
    Sede: models.Sede || Sede,
    Reposo: models.Reposo || Reposo,
    TenantConfig: models.TenantConfig || TenantConfig
  };
}

function normalizarDiaMes(valor, fallback) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1 || numero > 31) {
    return fallback;
  }
  return numero;
}

function normalizarConfigCobro(rawCobro = {}) {
  return {
    dia_cobro: normalizarDiaMes(rawCobro?.dia_cobro, 1),
    dia_vencimiento: normalizarDiaMes(rawCobro?.dia_vencimiento, 5),
    dias_gracia: Math.max(0, Math.min(31, Number(rawCobro?.dias_gracia) || 0)),
    recargo_usd: redondearMonto(Math.max(0, Number(rawCobro?.recargo_usd) || 0))
  };
}

async function obtenerConfigCobro(models = {}) {
  const { TenantConfig: TenantConfigModel } = resolveMensualidadModels(models);
  const config = await TenantConfigModel.findOne({ key: 'default' }).select('cobro').lean();
  return normalizarConfigCobro(config?.cobro || {});
}

function construirFechaPeriodoConDia(mes, anio, dia, { finDelDia = false } = {}) {
  const ultimoDiaMes = new Date(anio, mes, 0).getDate();
  const diaAjustado = Math.min(Math.max(1, Number(dia) || 1), ultimoDiaMes);
  const CARACAS_OFFSET_UTC_HOURS = 4;

  return new Date(Date.UTC(
    anio,
    mes - 1,
    diaAjustado,
    (finDelDia ? 23 : 0) + CARACAS_OFFSET_UTC_HOURS,
    finDelDia ? 59 : 0,
    finDelDia ? 59 : 0,
    finDelDia ? 999 : 0
  ));
}

function redondearMonto(valor) {
  return Number((Number(valor) || 0).toFixed(2));
}

function normalizarMontoOpcional(valor) {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return undefined;
  return redondearMonto(numero);
}

function normalizarNotaEdicion(valor) {
  return String(valor || '').trim();
}

function construirSnapshotEdicionMensualidad(mensualidad) {
  return {
    monto_esperado: redondearMonto(mensualidad?.monto_esperado || 0),
    estatus: String(mensualidad?.estatus || ''),
    ajuste_extraordinario: redondearMonto(mensualidad?.ajuste_extraordinario || 0),
    ajuste_descripcion: String(mensualidad?.ajuste_descripcion || ''),
    saldo_a_favor_generado: redondearMonto(mensualidad?.saldo_a_favor_generado || 0)
  };
}

function registrarHistorialEdicionMensualidad(mensualidad, req, { accion, nota, anterior, nuevo }) {
  mensualidad.historial_ediciones = Array.isArray(mensualidad.historial_ediciones)
    ? mensualidad.historial_ediciones
    : [];

  mensualidad.historial_ediciones.push({
    fecha: new Date(),
    accion: accion || 'edicion_manual',
    nota,
    actor_id: req.user?.id || undefined,
    actor_nombre: req.user?.nombre || req.user?.email || '',
    actor_rol: req.user?.rol || '',
    anterior,
    nuevo
  });
}

function normalizarFechaOpcional(valor) {
  if (!valor) return undefined;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return undefined;
  return fecha;
}

function resolveTenantId(req) {
  return resolveRequestTenantId(req);
}

function getPeriodoZonaCaracas(fechaBase = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(fechaBase);

  const monthPart = parts.find((part) => part.type === 'month');
  const yearPart = parts.find((part) => part.type === 'year');

  return {
    mes: Number(monthPart?.value || fechaBase.getUTCMonth() + 1),
    anio: Number(yearPart?.value || fechaBase.getUTCFullYear())
  };
}

function buildPeriodoMatchStage(mes, anio) {
  return {
    $match: {
      $expr: {
        $and: [
          {
            $eq: [
              { $convert: { input: '$mes', to: 'int', onError: null, onNull: null } },
              mes
            ]
          },
          {
            $eq: [
              { $convert: { input: '$anio', to: 'int', onError: null, onNull: null } },
              anio
            ]
          }
        ]
      }
    }
  };
}

function obtenerPeriodoDesdeFecha(fecha, periodoFallback = getPeriodoZonaCaracas()) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) {
    return periodoFallback;
  }

  return {
    mes: fecha.getUTCMonth() + 1,
    anio: fecha.getUTCFullYear()
  };
}

function obtenerPeriodoInicioCobroAlumno(alumno, periodoFallback = getPeriodoZonaCaracas()) {
  const fechaInicioCobro = alumno?.fecha_inicio_cobro;
  if (fechaInicioCobro instanceof Date && !Number.isNaN(fechaInicioCobro.getTime())) {
    return obtenerPeriodoDesdeFecha(fechaInicioCobro, periodoFallback);
  }

  const fechaInscripcion = alumno?.fecha_inscripcion;
  if (fechaInscripcion instanceof Date && !Number.isNaN(fechaInscripcion.getTime())) {
    return obtenerPeriodoDesdeFecha(fechaInscripcion, periodoFallback);
  }

  return periodoFallback;
}

function obtenerPeriodoInscripcionAlumno(alumno) {
  const fechaInscripcion = alumno?.fecha_inscripcion;
  if (!(fechaInscripcion instanceof Date) || Number.isNaN(fechaInscripcion.getTime())) {
    return null;
  }

  return {
    mes: fechaInscripcion.getUTCMonth() + 1,
    anio: fechaInscripcion.getUTCFullYear()
  };
}

function esPeriodoInscripcionAlumno(alumno, periodo) {
  const periodoInscripcion = obtenerPeriodoInscripcionAlumno(alumno);
  if (!periodoInscripcion || !periodo) return false;

  return (
    Number(periodo?.mes) === Number(periodoInscripcion.mes) &&
    Number(periodo?.anio) === Number(periodoInscripcion.anio)
  );
}

function compararPeriodos(a, b) {
  if (a.anio !== b.anio) return a.anio - b.anio;
  return a.mes - b.mes;
}

function listarPeriodosEntrePeriodos(inicio, fin) {
  if (!inicio || !fin || compararPeriodos(inicio, fin) > 0) {
    return [];
  }

  const cursor = new Date(Date.UTC(inicio.anio, inicio.mes - 1, 1, 12, 0, 0));
  const finDate = new Date(Date.UTC(fin.anio, fin.mes - 1, 1, 12, 0, 0));
  const periodos = [];

  while (cursor <= finDate) {
    periodos.push({
      mes: cursor.getUTCMonth() + 1,
      anio: cursor.getUTCFullYear()
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return periodos;
}

function obtenerFechaVencimientoPeriodo(mes, anio, diaVencimiento = 5) {
  return construirFechaPeriodoConDia(mes, anio, diaVencimiento, { finDelDia: true });
}

function obtenerFechaRecargoPeriodo(mes, anio, cobroConfig) {
  const fechaVencimiento = obtenerFechaVencimientoPeriodo(mes, anio, cobroConfig?.dia_vencimiento);
  const fechaRecargo = new Date(fechaVencimiento);
  fechaRecargo.setUTCDate(fechaRecargo.getUTCDate() + (Number(cobroConfig?.dias_gracia) || 0));
  return fechaRecargo;
}

function obtenerFechaRecargoAlumnoPeriodo(mes, anio, cobroConfig, alumno) {
  const diaPersonalizado = normalizarDiaMes(alumno?.dia_limite_personalizado, null);
  if (diaPersonalizado) {
    return construirFechaPeriodoConDia(mes, anio, diaPersonalizado, { finDelDia: true });
  }

  return obtenerFechaRecargoPeriodo(mes, anio, cobroConfig);
}

function obtenerFechaCortePagoAlumnoMensualidad(mensualidad, alumno = null) {
  const diaPersonalizado = normalizarDiaMes(
    alumno?.dia_limite_personalizado ?? mensualidad?.id_alumno?.dia_limite_personalizado,
    null
  );
  const mesPeriodo = Number(mensualidad?.mes);
  const anioPeriodo = Number(mensualidad?.anio);

  if (
    diaPersonalizado &&
    Number.isInteger(mesPeriodo) &&
    mesPeriodo >= 1 &&
    mesPeriodo <= 12 &&
    Number.isInteger(anioPeriodo) &&
    anioPeriodo > 1900
  ) {
    return construirFechaPeriodoConDia(mesPeriodo, anioPeriodo, diaPersonalizado, { finDelDia: true });
  }

  const fechaVencimiento = mensualidad?.fecha_vencimiento ? new Date(mensualidad.fecha_vencimiento) : null;
  if (!fechaVencimiento || Number.isNaN(fechaVencimiento.getTime())) {
    return null;
  }

  return fechaVencimiento;
}

async function obtenerFechaCortePagoAlumnoMensualidadAsync(mensualidad, models = {}) {
  const fechaDesdeDocumento = obtenerFechaCortePagoAlumnoMensualidad(mensualidad, mensualidad?.id_alumno);
  if (fechaDesdeDocumento) {
    return fechaDesdeDocumento;
  }

  try {
    const alumno = await obtenerAlumnoParaRecargo(mensualidad, models);
    return obtenerFechaCortePagoAlumnoMensualidad(mensualidad, alumno);
  } catch (_error) {
    return obtenerFechaCortePagoAlumnoMensualidad(mensualidad, null);
  }
}

function obtenerEstatusPendientePorVencimiento(fechaVencimiento) {
  return fechaVencimiento < new Date() ? 'Insolvente' : 'Pendiente';
}

function esEstatusInsolvente(estatus) {
  const normalizado = String(estatus || '').toLowerCase();
  return normalizado === 'retrasado' || normalizado === 'insolvente';
}

function normalizarEstatusKey(estatus) {
  return String(estatus || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function esEstatusIngresoConfirmado(estatus) {
  const normalizado = normalizarEstatusKey(estatus);
  return normalizado === 'pagado' || normalizado === 'abono';
}

function obtenerComponentesMensualidad(mensualidad = {}) {
  const montoInscripcion = Number(mensualidad?.monto_inscripcion);
  const montoReingreso = Number(mensualidad?.monto_reingreso);
  const montoPrimeraMensualidad = Number(mensualidad?.monto_primera_mensualidad);
  const montoMensualidadReingreso = Number(mensualidad?.monto_mensualidad_reingreso);
  const montoEsperado = Number(mensualidad?.monto_esperado);

  const componenteInscripcion = Number.isFinite(montoInscripcion) && montoInscripcion > 0
    ? redondearMonto(montoInscripcion)
    : (Number.isFinite(montoReingreso) && montoReingreso > 0 ? redondearMonto(montoReingreso) : 0);

  let componenteMensualidad = 0;
  if (Number.isFinite(montoPrimeraMensualidad) && montoPrimeraMensualidad >= 0) {
    componenteMensualidad = redondearMonto(montoPrimeraMensualidad);
  } else if (Number.isFinite(montoMensualidadReingreso) && montoMensualidadReingreso >= 0) {
    componenteMensualidad = redondearMonto(montoMensualidadReingreso);
  } else if (Number.isFinite(montoEsperado) && montoEsperado >= 0) {
    componenteMensualidad = redondearMonto(montoEsperado);
  }

  const esMixto = componenteInscripcion > 0 && componenteMensualidad > 0;

  return {
    componenteInscripcion,
    componenteMensualidad,
    esMixto
  };
}

function distribuirPagoPorConcepto(totalPagado, componentes = {}) {
  const total = redondearMonto(totalPagado || 0);
  const componenteInscripcion = redondearMonto(componentes.componenteInscripcion || 0);
  const pagadoInscripcion = redondearMonto(Math.min(total, Math.max(0, componenteInscripcion)));
  const pagadoMensualidad = redondearMonto(Math.max(0, total - pagadoInscripcion));

  return {
    pagadoInscripcion,
    pagadoMensualidad,
    pagadoTotal: total
  };
}

function esTipoMensualidadBecaCompleta(tipoMensualidad) {
  return String(tipoMensualidad || '').toLowerCase() === 'beca_completa';
}

async function obtenerTipoMensualidadAlumnoDesdeMensualidad(mensualidad, models = {}) {
  const { Alumno: AlumnoModel } = resolveMensualidadModels(models);
  const tipoDesdePopulate = mensualidad?.id_alumno?.tipo_mensualidad;
  if (tipoDesdePopulate !== undefined) {
    return tipoDesdePopulate;
  }

  const alumnoId = mensualidad?.id_alumno?._id || mensualidad?.id_alumno;
  if (!alumnoId) return null;

  if (!AlumnoModel || typeof AlumnoModel.findById !== 'function') {
    return null;
  }

  const consultaAlumno = AlumnoModel.findById(alumnoId);
  if (!consultaAlumno) return null;

  let alumno;
  if (typeof consultaAlumno.select === 'function') {
    const consultaSeleccionada = consultaAlumno.select('tipo_mensualidad');
    alumno = typeof consultaSeleccionada?.lean === 'function'
      ? await consultaSeleccionada.lean()
      : await consultaSeleccionada;
  } else if (typeof consultaAlumno.lean === 'function') {
    alumno = await consultaAlumno.lean();
  } else {
    alumno = await Promise.resolve(consultaAlumno);
  }

  return alumno?.tipo_mensualidad || null;
}

function obtenerMontoBaseMensualidad(mensualidad) {
  if (mensualidad?.monto_base !== undefined && mensualidad?.monto_base !== null) {
    return redondearMonto(mensualidad.monto_base);
  }

  return redondearMonto(
    (Number(mensualidad?.monto_esperado) || 0) +
    (Number(mensualidad?.credito_aplicado) || 0) +
    (Number(mensualidad?.ajuste_extraordinario) || 0)
  );
}

async function obtenerAlumnoParaRecargo(mensualidad, models = {}) {
  const { Alumno: AlumnoModel } = resolveMensualidadModels(models);
  const alumnoPopulate = mensualidad?.id_alumno;
  if (alumnoPopulate && typeof alumnoPopulate === 'object' && alumnoPopulate._id) {
    return alumnoPopulate;
  }
  const alumnoId = alumnoPopulate?._id || alumnoPopulate || mensualidad?.id_alumno;
  if (!alumnoId) return null;
  if (!AlumnoModel || typeof AlumnoModel.findById !== 'function') {
    return null;
  }

  const consultaAlumno = AlumnoModel.findById(alumnoId);
  if (!consultaAlumno) return null;

  if (typeof consultaAlumno.select === 'function') {
    const consultaSeleccionada = consultaAlumno
      .select('tipo_mensualidad aplicar_recargo_mensualidad dia_limite_personalizado fecha_inicio_cobro fecha_inscripcion');
    return typeof consultaSeleccionada?.lean === 'function'
      ? consultaSeleccionada.lean()
      : consultaSeleccionada;
  }

  if (typeof consultaAlumno.lean === 'function') {
    return consultaAlumno.lean();
  }

  return Promise.resolve(consultaAlumno);
}

function calcularSnapshotRecargo({
  montoSinRecargo,
  recargoUsd,
  aplicaRecargo
}) {
  const base = redondearMonto(Math.max(0, Number(montoSinRecargo) || 0));
  const recargo = aplicaRecargo ? redondearMonto(Math.max(0, Number(recargoUsd) || 0)) : 0;
  const total = redondearMonto(base + recargo);

  return {
    montoSinRecargoUsd: base,
    recargoAplicadoUsd: recargo,
    montoConRecargoUsd: total,
    montoEsperado: total
  };
}

async function aplicarRecargoMensualidadSegunConfig(
  mensualidad,
  {
    models = {},
    cobroConfig,
    fechaReferencia = new Date(),
    persistir = true
  } = {}
) {
  if (!mensualidad) {
    return { aplicado: false };
  }

  const configCobro = cobroConfig || await obtenerConfigCobro(models);
  const alumno = await obtenerAlumnoParaRecargo(mensualidad, models);

  // Regla de negocio: la mensualidad inicial de inscripción no lleva recargo.
  if (mensualidad.es_inscripcion) {
    return {
      aplicado: false,
      configCobro,
      fechaRecargo: null
    };
  }

  const esPeriodoInscripcion = esPeriodoInscripcionAlumno(alumno, {
    mes: mensualidad?.mes,
    anio: mensualidad?.anio
  });

  if (esPeriodoInscripcion) {
    return {
      aplicado: false,
      configCobro,
      fechaRecargo: null
    };
  }

  const aplicaRecargoAlumno = alumno?.aplicar_recargo_mensualidad !== false;
  const esBecado = esTipoMensualidadBecaCompleta(alumno?.tipo_mensualidad);
  const estatusActual = String(mensualidad.estatus || '').toLowerCase();

  const elegibleEstatus = ['pendiente', 'insolvente', 'retrasado', 'abono', 'en revision'];
  const montoActual = redondearMonto(mensualidad.monto_esperado || 0);
  const montoSinRecargoActual = redondearMonto(
    mensualidad.monto_sin_recargo_usd !== undefined && mensualidad.monto_sin_recargo_usd !== null
      ? mensualidad.monto_sin_recargo_usd
      : montoActual
  );

  const fechaRecargo = obtenerFechaRecargoAlumnoPeriodo(mensualidad.mes, mensualidad.anio, configCobro, alumno);
  const correspondePorFecha = fechaReferencia >= fechaRecargo;
  const correspondeRecargo =
    aplicaRecargoAlumno &&
    !esBecado &&
    elegibleEstatus.includes(estatusActual) &&
    montoSinRecargoActual > 0 &&
    (Number(configCobro.recargo_usd) || 0) > 0 &&
    correspondePorFecha;

  if (!correspondeRecargo) {
    return {
      aplicado: false,
      configCobro,
      fechaRecargo
    };
  }

  const snapshot = calcularSnapshotRecargo({
    montoSinRecargo: montoSinRecargoActual,
    recargoUsd: configCobro.recargo_usd,
    aplicaRecargo: true
  });

  if (Number(mensualidad.recargo_aplicado_usd || 0) > 0) {
    return {
      aplicado: false,
      configCobro,
      fechaRecargo,
      snapshot
    };
  }

  mensualidad.aplica_recargo = true;
  mensualidad.monto_sin_recargo_usd = snapshot.montoSinRecargoUsd;
  mensualidad.recargo_aplicado_usd = snapshot.recargoAplicadoUsd;
  mensualidad.monto_con_recargo_usd = snapshot.montoConRecargoUsd;
  mensualidad.monto_esperado = snapshot.montoEsperado;
  mensualidad.fecha_aplicacion_recargo = new Date();

  if (persistir) {
    await mensualidad.save();
  }

  return {
    aplicado: true,
    configCobro,
    fechaRecargo,
    snapshot
  };
}

async function resolverMontoBaseAlumno(alumno, models = {}) {
  const { Sede: SedeModel } = resolveMensualidadModels(models);
  if (alumno.tipo_mensualidad === 'monto_sede' || !alumno.tipo_mensualidad) {
    const sedeId = alumno.sede && alumno.sede._id ? alumno.sede._id : alumno.sede;
    const sede = await SedeModel.findById(sedeId);
    return redondearMonto(sede && sede.costo ? sede.costo : 0);
  }

  if (alumno.tipo_mensualidad === 'monto_personalizado') {
    return redondearMonto(alumno.monto_personalizado_valor || 0);
  }

  return 0;
}

async function consumirSaldoAFavor(alumno, montoBase) {
  const saldoDisponible = redondearMonto(alumno?.saldo_a_favor_mensualidades || 0);
  if (saldoDisponible <= 0 || montoBase <= 0) {
    return { creditoAplicado: 0, montoEsperado: redondearMonto(montoBase) };
  }

  const creditoAplicado = redondearMonto(Math.min(saldoDisponible, montoBase));
  alumno.saldo_a_favor_mensualidades = redondearMonto(saldoDisponible - creditoAplicado);
  await alumno.save();

  return {
    creditoAplicado,
    montoEsperado: redondearMonto(montoBase - creditoAplicado)
  };
}

async function crearMensualidadParaPeriodo(
  alumno,
  periodo,
  {
    models = {},
    cobroConfig,
    montoBaseManual,
    estatusManual,
    fechaVencimientoManual,
    crearPagoSiPagado = false,
    referenciaPago = 'primera-mensualidad',
    metadataInscripcion,
    esInscripcion = false
  } = {}
) {
  const {
    Mensualidad: MensualidadModel,
    PagoDetalle: PagoDetalleModel
  } = resolveMensualidadModels(models);

  const configCobro = cobroConfig || await obtenerConfigCobro(models);

  const consultaExistente = MensualidadModel.findOne({
    id_alumno: alumno._id,
    mes: periodo.mes,
    anio: periodo.anio
  });
  const existente = typeof consultaExistente?.populate === 'function'
    ? await consultaExistente.populate('id_alumno')
    : await Promise.resolve(consultaExistente);

  if (existente) {
    return { mensualidad: existente, creada: false, pagoRegistrado: false };
  }

  const fechaVencimiento = fechaVencimientoManual || obtenerFechaVencimientoPeriodo(periodo.mes, periodo.anio, configCobro?.dia_vencimiento);
  const tieneMontoManual = montoBaseManual !== undefined && montoBaseManual !== null;
  const montoBaseOriginal = tieneMontoManual
    ? redondearMonto(montoBaseManual)
    : await resolverMontoBaseAlumno(alumno, models);
  let montoBase = montoBaseOriginal;

  let monto = montoBase;
  let creditoAplicado = 0;
  let estatus = estatusManual || obtenerEstatusPendientePorVencimiento(fechaVencimiento);

  const reglaReposo = await obtenerReglaReposoParaPeriodo(alumno._id, periodo.mes, periodo.anio, models);
  if (reglaReposo.tipo === 'EXENTO_POR_REPOSO') {
    monto = 0;
    estatus = 'Exento por reposo';
  } else if (reglaReposo.tipo === 'PRORRATEO_PARCIAL') {
    montoBase = redondearMonto(
      Number.isFinite(Number(reglaReposo.montoPersonalizado))
        ? reglaReposo.montoPersonalizado
        : montoBaseOriginal
    );
    const credito = await consumirSaldoAFavor(alumno, montoBase);
    creditoAplicado = credito.creditoAplicado;
    monto = credito.montoEsperado;
  } else if (esTipoMensualidadBecaCompleta(alumno.tipo_mensualidad)) {
    monto = 0;
    estatus = 'Becado';
  } else {
    const credito = await consumirSaldoAFavor(alumno, montoBase);
    creditoAplicado = credito.creditoAplicado;
    monto = credito.montoEsperado;
  }

  let aplicaRecargo = false;
  if (!esInscripcion) {
    const aplicaRecargoAlumno = alumno?.aplicar_recargo_mensualidad !== false;
    const fechaRecargo = obtenerFechaRecargoAlumnoPeriodo(periodo.mes, periodo.anio, configCobro, alumno);
    aplicaRecargo =
      aplicaRecargoAlumno &&
      !esTipoMensualidadBecaCompleta(alumno?.tipo_mensualidad) &&
      monto > 0 &&
      new Date() >= fechaRecargo;
  }
  const snapshotRecargo = calcularSnapshotRecargo({
    montoSinRecargo: monto,
    recargoUsd: configCobro?.recargo_usd,
    aplicaRecargo
  });

  const mensualidad = await MensualidadModel.create({
    id_alumno: alumno._id,
    mes: periodo.mes,
    anio: periodo.anio,
    monto_base: montoBase,
    credito_aplicado: creditoAplicado,
    ajuste_extraordinario: 0,
    saldo_a_favor_generado: 0,
    aplica_recargo: snapshotRecargo.recargoAplicadoUsd > 0,
    monto_sin_recargo_usd: snapshotRecargo.montoSinRecargoUsd,
    recargo_aplicado_usd: snapshotRecargo.recargoAplicadoUsd,
    monto_con_recargo_usd: snapshotRecargo.montoConRecargoUsd,
    fecha_aplicacion_recargo: snapshotRecargo.recargoAplicadoUsd > 0 ? new Date() : undefined,
    monto_esperado: snapshotRecargo.montoEsperado,
    fecha_vencimiento: fechaVencimiento,
    estatus,
    ...(esInscripcion ? { es_inscripcion: true } : {}),
    ...(metadataInscripcion && {
      monto_inscripcion: metadataInscripcion.montoInscripcion,
      monto_primera_mensualidad: metadataInscripcion.montoPrimeraMensualidad,
      monto_equivalente_bs: metadataInscripcion.montoEquivalenteBs,
      fecha_pago: metadataInscripcion.fechaPago,
      metodo_pago: metadataInscripcion.metodoPago,
      referencia: metadataInscripcion.referencia,
      comprobante_url: metadataInscripcion.comprobanteUrl
    })
  });

  let pagoRegistrado = false;
  const estatusNormalizado = String(estatus || '').toLowerCase();
  if (
    crearPagoSiPagado &&
    (estatusNormalizado === 'pagado' || estatusNormalizado === 'abono') &&
    snapshotRecargo.montoEsperado > 0
  ) {
    const montoPagoInicial = estatusNormalizado === 'pagado'
      ? snapshotRecargo.montoEsperado
      : redondearMonto(metadataInscripcion?.montoPagadoUsd || 0);

    if (montoPagoInicial > 0) {
    await PagoDetalleModel.create({
      id_mensualidad: mensualidad._id,
      monto_pagado: montoPagoInicial,
      monto_pagado_bs: metadataInscripcion?.montoPagadoBs,
      monto_esperado_usd: snapshotRecargo.montoEsperado,
      monto_esperado_bs: metadataInscripcion?.montoEsperadoBs,
      fecha_pago: metadataInscripcion?.fechaPago || new Date(),
      metodo_pago: metadataInscripcion?.metodoPago || 'Registro inicial admin',
      referencia: metadataInscripcion?.referencia || referenciaPago,
      comprobante_url: metadataInscripcion?.comprobanteUrl
    });
    pagoRegistrado = true;
    }
  }

  const consultaMensualidadCreada = MensualidadModel.findById(mensualidad._id);
  const mensualidadPopulada = typeof consultaMensualidadCreada?.populate === 'function'
    ? await consultaMensualidadCreada.populate('id_alumno')
    : await Promise.resolve(consultaMensualidadCreada || mensualidad);
  return { mensualidad: mensualidadPopulada, creada: true, pagoRegistrado };
}

async function generarMensualidadesPendientesAlumno(
  alumno,
  {
    models = {},
    cobroConfig,
    periodoInicio,
    periodoFin,
    overridePeriodoActual,
    crearPagoSiPagado = false,
    referenciaPago = 'primera-mensualidad'
  } = {}
) {
  const periodoActual = periodoFin || getPeriodoZonaCaracas();
  const periodoInicial = periodoInicio || obtenerPeriodoInicioCobroAlumno(alumno, periodoActual);
  const periodos = listarPeriodosEntrePeriodos(periodoInicial, periodoActual);
  const resultados = [];

  for (const periodo of periodos) {
    const esPeriodoOverride =
      overridePeriodoActual &&
      periodo.mes === overridePeriodoActual.mes &&
      periodo.anio === overridePeriodoActual.anio;
    const esInscripcion = esPeriodoInscripcionAlumno(alumno, periodo);

    resultados.push(
      await crearMensualidadParaPeriodo(alumno, periodo, {
        models,
        cobroConfig,
        montoBaseManual: esPeriodoOverride ? overridePeriodoActual.montoBaseManual : undefined,
        estatusManual: esPeriodoOverride ? overridePeriodoActual.estatusManual : undefined,
        fechaVencimientoManual: esPeriodoOverride ? overridePeriodoActual.fechaVencimientoManual : undefined,
        metadataInscripcion: esPeriodoOverride ? overridePeriodoActual.metadataInscripcion : undefined,
        crearPagoSiPagado: esPeriodoOverride ? crearPagoSiPagado : false,
        referenciaPago,
        esInscripcion
      })
    );
  }

  return resultados;
}

async function recalcularMensualidadPorPagos(
  mensualidad,
  {
    models = {},
    actorRol = 'admin',
    estatusAnterior = null,
    preservarPagadoSinPagos = false,
    preservarInsolventeSinPagosCuandoMontoCero = false,
    omitirRecargoAutomatico = false
  } = {}
) {
  const {
    PagoDetalle: PagoDetalleModel,
    Alumno: AlumnoModel
  } = resolveMensualidadModels(models);

  if (!omitirRecargoAutomatico) {
    await aplicarRecargoMensualidadSegunConfig(mensualidad, {
      models,
      persistir: false
    });
  }

  const pagos = await PagoDetalleModel.find({ id_mensualidad: mensualidad._id });
  const tienePagosRegistrados = pagos.length > 0;
  const pagosOrdenados = [...pagos].sort((a, b) => {
    const fechaA = new Date(a.fecha_pago || a.createdAt || 0).getTime();
    const fechaB = new Date(b.fecha_pago || b.createdAt || 0).getTime();
    if (fechaA !== fechaB) return fechaA - fechaB;

    const creadoA = new Date(a.createdAt || 0).getTime();
    const creadoB = new Date(b.createdAt || 0).getTime();
    return creadoA - creadoB;
  });
  const pagoRecienteConTasa = [...pagosOrdenados].reverse().find((pago) => {
    const montoUsd = Number(pago?.monto_pagado);
    const montoBs = Number(pago?.monto_pagado_bs);
    return Number.isFinite(montoUsd) && montoUsd > 0 && Number.isFinite(montoBs) && montoBs > 0;
  });
  const tasaReferencia = pagoRecienteConTasa
    ? (Number(pagoRecienteConTasa.monto_pagado_bs) / Number(pagoRecienteConTasa.monto_pagado))
    : 0;
  const toleranciaUsdLiquidacion = Number.isFinite(tasaReferencia) && tasaReferencia > 0
    ? redondearMonto(MONTO_TOLERANCIA_BS / tasaReferencia)
    : 0;
  const totalPagado = redondearMonto(
    pagos.reduce((acc, pago) => acc + (Number(pago.monto_pagado) || 0), 0)
  );
  const montoEsperado = redondearMonto(mensualidad.monto_esperado || 0);
  const montoEsperadoConTolerancia = redondearMonto(Math.max(0, montoEsperado - toleranciaUsdLiquidacion));
  const cubreEsperadoConTolerancia = totalPagado >= montoEsperadoConTolerancia;
  const saldoGeneradoPrevio = redondearMonto(mensualidad.saldo_a_favor_generado || 0);
  const saldoGeneradoNuevo = redondearMonto(Math.max(0, totalPagado - montoEsperado));
  const deltaSaldo = redondearMonto(saldoGeneradoNuevo - saldoGeneradoPrevio);

  if (deltaSaldo !== 0) {
    const alumnoId = mensualidad.id_alumno?._id || mensualidad.id_alumno;
    let alumnoDoc = null;
    if (AlumnoModel && typeof AlumnoModel.findById === 'function' && alumnoId) {
      const consultaAlumno = AlumnoModel.findById(alumnoId);
      if (consultaAlumno) {
        if (typeof consultaAlumno.select === 'function') {
          alumnoDoc = await consultaAlumno.select('saldo_a_favor_mensualidades');
        } else {
          alumnoDoc = await Promise.resolve(consultaAlumno);
        }
      }
    }
    if (alumnoDoc) {
      const saldoActual = redondearMonto(alumnoDoc.saldo_a_favor_mensualidades || 0);
      const saldoResultante = redondearMonto(saldoActual + deltaSaldo);

      if (saldoResultante < 0) {
        throw new Error(SALDO_A_FAVOR_CONSUMIDO_ERROR);
      }

      alumnoDoc.saldo_a_favor_mensualidades = saldoResultante;
      if (typeof alumnoDoc.save === 'function') {
        await alumnoDoc.save();
      } else if (AlumnoModel && typeof AlumnoModel.findByIdAndUpdate === 'function') {
        await AlumnoModel.findByIdAndUpdate(alumnoId, {
          $set: { saldo_a_favor_mensualidades: saldoResultante }
        });
      }
    }
  }

  mensualidad.saldo_a_favor_generado = saldoGeneradoNuevo;

  const requiereRevisionPagoCompleto = estatusAnterior === 'En revision' || actorRol === 'usuario';
  const estatusAnteriorNormalizado = String(estatusAnterior || '').toLowerCase();
  const fechaCortePago = await obtenerFechaCortePagoAlumnoMensualidadAsync(mensualidad, models);
  const estaVencida = fechaCortePago ? fechaCortePago < new Date() : false;
  const debePreservarPagadoManual =
    preservarPagadoSinPagos &&
    !tienePagosRegistrados &&
    totalPagado <= 0 &&
    estatusAnteriorNormalizado === 'pagado';

  const debePreservarInsolventeSinPagos =
    preservarInsolventeSinPagosCuandoMontoCero &&
    !tienePagosRegistrados &&
    totalPagado <= 0 &&
    montoEsperado <= 0 &&
    esEstatusInsolvente(estatusAnteriorNormalizado);

  const estatusActualNormalizado = String(mensualidad.estatus || '').toLowerCase();
  const tipoMensualidadAlumno = await obtenerTipoMensualidadAlumnoDesdeMensualidad(mensualidad, models);
  const esBecado = esTipoMensualidadBecaCompleta(tipoMensualidadAlumno);

  if (debePreservarPagadoManual) {
    mensualidad.estatus = 'Pagado';
  } else if (debePreservarInsolventeSinPagos) {
    mensualidad.estatus = 'Insolvente';
  } else if (esBecado && estatusActualNormalizado !== 'exento por reposo') {
    mensualidad.estatus = 'Becado';
  } else
  if (montoEsperado <= 0) {
    mensualidad.estatus = requiereRevisionPagoCompleto && totalPagado > 0 ? 'En revision' : 'Pagado';
  } else if (totalPagado <= 0) {
    mensualidad.estatus = estaVencida ? 'Insolvente' : 'Pendiente';
  } else if (cubreEsperadoConTolerancia) {
    mensualidad.estatus = requiereRevisionPagoCompleto ? 'En revision' : 'Pagado';
  } else {
    mensualidad.estatus = 'Abono';
  }

  await mensualidad.save();

  return {
    totalPagado,
    restante: cubreEsperadoConTolerancia
      ? 0
      : redondearMonto(Math.max(0, montoEsperado - totalPagado)),
    estatus: mensualidad.estatus,
    saldoAFavorGenerado: saldoGeneradoNuevo
  };
}

async function obtenerReglaReposoParaPeriodo(alumnoId, mes, anio, models = {}) {
  const { Reposo: ReposoModel } = resolveMensualidadModels(models);
  const inicioMes = new Date(Date.UTC(anio, mes - 1, 1, 0, 0, 0, 0));
  const finMes = new Date(Date.UTC(anio, mes, 0, 23, 59, 59, 999));

  const reposoIndefinido = await ReposoModel.findOne({
    id_alumno: alumnoId,
    estado: { $ne: 'Inactivo' },
    tipo: 'Indefinido',
    fecha_inicio: { $lte: finMes },
    $or: [
      { fecha_fin: null },
      { fecha_fin: { $gte: inicioMes } }
    ]
  }).sort({ fecha_inicio: -1 });

  if (reposoIndefinido) {
    return { tipo: 'EXENTO_POR_REPOSO', montoPersonalizado: null };
  }

  const reposoTotal = await ReposoModel.findOne({
    id_alumno: alumnoId,
    estado: { $ne: 'Inactivo' },
    tipo: 'Total',
    $or: [
      {
        fecha_fin: { $ne: null, $gte: inicioMes },
        fecha_inicio: { $lte: finMes }
      },
      {
        fecha_fin: null,
        fecha_inicio: { $gte: inicioMes, $lte: finMes }
      }
    ]
  }).sort({ fecha_inicio: -1 });

  if (reposoTotal) {
    return { tipo: 'EXENTO_POR_REPOSO', montoPersonalizado: null };
  }

  const repososParcialesConsulta = ReposoModel.find({
    id_alumno: alumnoId,
    estado: { $ne: 'Inactivo' },
    tipo: 'Parcial',
    modalidad_cobro_parcial: 'Prorrateado',
    fecha_inicio: { $lte: finMes },
    $or: [
      { fecha_fin: null },
      { fecha_fin: { $gte: inicioMes } }
    ]
  }).select('fecha_inicio fecha_fin monto_parcial_personalizado');

  const repososParcialesProrrateados = typeof repososParcialesConsulta?.sort === 'function'
    ? await repososParcialesConsulta.sort({ fecha_inicio: -1, createdAt: -1 })
    : (typeof repososParcialesConsulta?.lean === 'function'
      ? await repososParcialesConsulta.lean()
      : await Promise.resolve(repososParcialesConsulta));

  if (!repososParcialesProrrateados.length) {
    return { tipo: 'NORMAL', montoPersonalizado: null };
  }

  const reposoConMontoPersonalizado = repososParcialesProrrateados.find((reposo) =>
    Number.isFinite(Number(reposo?.monto_parcial_personalizado))
  );

  if (!reposoConMontoPersonalizado) {
    return { tipo: 'NORMAL', montoPersonalizado: null };
  }

  return {
    tipo: 'PRORRATEO_PARCIAL',
    montoPersonalizado: redondearMonto(reposoConMontoPersonalizado.monto_parcial_personalizado)
  };
}

async function obtenerObjetivoAjustePorSede({ id_sede, mesNumero, anioNumero, tipo = 'mensualidades' }, models = {}) {
  const {
    Alumno: AlumnoModel,
    Mensualidad: MensualidadModel
  } = resolveMensualidadModels(models);

  const filtroAlumnos = {
    sede: id_sede,
    activo: { $ne: false },
    dado_de_baja: { $ne: true }
  };

  if (tipo !== 'inscripciones') {
    filtroAlumnos.$or = [
      { tipo_mensualidad: 'monto_sede' },
      { tipo_mensualidad: { $exists: false } }
    ];
  }

  const alumnos = await AlumnoModel.find(filtroAlumnos).select('_id nombres apellidos cedula saldo_a_favor_mensualidades');

  if (alumnos.length === 0) {
    return { alumnos: [], mensualidades: [] };
  }

  const mensualidadesBase = await MensualidadModel.find({
    id_alumno: { $in: alumnos.map((alumno) => alumno._id) },
    mes: mesNumero,
    anio: anioNumero
  });

  const mensualidades = tipo === 'inscripciones'
    ? mensualidadesBase.filter((mensualidad) => {
      const componentes = obtenerComponentesMensualidad(mensualidad);
      return Number(componentes?.componenteInscripcion || 0) > 0;
    })
    : mensualidadesBase;

  return { alumnos, mensualidades };
}

function obtenerMotivoOmitirAjusteSede(mensualidad) {
  const estatusActual = String(mensualidad?.estatus || '').toLowerCase();
  if (estatusActual === 'exonerado') {
    return {
      code: 'NO_APLICABLE_EXONERADO',
      message: 'Mensualidad exonerada'
    };
  }

  if (estatusActual === 'exento por reposo') {
    return {
      code: 'NO_APLICABLE_REPOSO',
      message: 'Mensualidad exenta por reposo'
    };
  }

  const montoBase = obtenerMontoBaseMensualidad(mensualidad);
  if (montoBase <= 0) {
    return {
      code: 'NO_APLICABLE_MONTO_BASE_CERO',
      message: 'Monto base no ajustable'
    };
  }

  return null;
}

function construirDetalleOmitidaAjusteSede(mensualidad, alumnoMap, motivo) {
  const alumnoRef = mensualidad?.id_alumno;
  const alumnoId = String(alumnoRef?._id || alumnoRef || '');
  const alumnoInfo = alumnoMap.get(alumnoId);
  const nombres = String(alumnoRef?.nombres || alumnoInfo?.nombres || '').trim();
  const apellidos = String(alumnoRef?.apellidos || alumnoInfo?.apellidos || '').trim();
  const nombreCompleto = `${nombres} ${apellidos}`.trim();

  return {
    mensualidad_id: String(mensualidad?._id || ''),
    alumno_id: alumnoId,
    alumno_nombre: nombreCompleto || 'Alumno sin nombre',
    alumno_cedula: String(alumnoRef?.cedula || alumnoInfo?.cedula || ''),
    estatus: String(mensualidad?.estatus || ''),
    motivo_code: String(motivo?.code || ''),
    motivo: String(motivo?.message || 'Omitida por regla de negocio')
  };
}

function esMensualidadOmitidaAjusteSede(mensualidad) {
  return Boolean(obtenerMotivoOmitirAjusteSede(mensualidad));
}

function generarVistaPreviaAjusteSede(mensualidades, nuevoMonto) {
  let actualizables = 0;
  let omitidas = 0;
  let noCompatibles = 0;
  let montoBaseMinimo = null;

  for (const mensualidad of mensualidades) {
    if (esMensualidadOmitidaAjusteSede(mensualidad)) {
      omitidas += 1;
      continue;
    }

    const montoBase = obtenerMontoBaseMensualidad(mensualidad);
    if (nuevoMonto > montoBase) {
      noCompatibles += 1;
      if (montoBaseMinimo === null || montoBase < montoBaseMinimo) {
        montoBaseMinimo = montoBase;
      }
      continue;
    }

    actualizables += 1;
  }

  return {
    mensualidades_actualizables: actualizables,
    mensualidades_omitidas: omitidas,
    mensualidades_no_compatibles: noCompatibles,
    monto_base_minimo_compatible: montoBaseMinimo
  };
}

async function generarMensualidadesMesCore(options = {}) {
  const { Alumno: AlumnoModel } = resolveMensualidadModels(options.models);
  const periodoActual = getPeriodoZonaCaracas();
  const configCobro = await obtenerConfigCobro(options.models);
  const alumnos = await AlumnoModel.find({
    activo: { $ne: false },
    dado_de_baja: { $ne: true }
  });
  let creadas = 0;

  for (const alumno of alumnos) {
    try {
      const resultados = await generarMensualidadesPendientesAlumno(alumno, {
        models: options.models,
        cobroConfig: configCobro,
        periodoFin: periodoActual
      });
      creadas += resultados.filter((resultado) => resultado.creada).length;
    } catch (err) {
      console.error('Alumno omitido en generacion de mensualidades:', {
        alumnoId: alumno?._id,
        activo: alumno?.activo,
        dado_de_baja: alumno?.dado_de_baja,
        fecha_inicio_cobro: alumno?.fecha_inicio_cobro,
        fecha_inscripcion: alumno?.fecha_inscripcion,
        message: err?.message
      });
    }
  }

  return creadas;
}

function obtenerMesSiguiente(fechaBase = new Date()) {
  const base = new Date(fechaBase);
  const siguiente = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return {
    mes: siguiente.getMonth() + 1,
    anio: siguiente.getFullYear()
  };
}

function obtenerPeriodoSiguiente(periodoBase) {
  const mesBase = Number(periodoBase?.mes);
  const anioBase = Number(periodoBase?.anio);

  if (!Number.isInteger(mesBase) || !Number.isInteger(anioBase)) {
    return obtenerMesSiguiente(new Date());
  }

  const siguiente = new Date(anioBase, mesBase, 1);
  return {
    mes: siguiente.getMonth() + 1,
    anio: siguiente.getFullYear()
  };
}

async function obtenerPeriodoAdelantoDesdeUltimaMensualidad(idAlumno, MensualidadModel = Mensualidad) {
  const estadosLiquidados = ['Pagado', 'En revision', 'Exonerado', 'Exento por reposo', 'Becado'];
  const ultimaMensualidadLiquidada = await MensualidadModel.findOne({
    id_alumno: idAlumno,
    estatus: { $in: estadosLiquidados }
  })
    .select('mes anio')
    .sort({ anio: -1, mes: -1, createdAt: -1 });

  if (!ultimaMensualidadLiquidada) {
    return obtenerMesSiguiente(new Date());
  }

  return obtenerPeriodoSiguiente(ultimaMensualidadLiquidada);
}

async function actualizarRetrasadosCore({ force = false, models = {} } = {}) {
  const {
    Mensualidad: MensualidadModel
  } = resolveMensualidadModels(models);

  const hoy = new Date();
  const candidatasInsolvencia = await MensualidadModel.find({
    estatus: { $in: ['Pendiente', 'Insolvente'] },
    monto_esperado: { $gt: 0 }
  })
    .select('_id id_alumno fecha_vencimiento mes anio')
    .populate({
      path: 'id_alumno',
      select: 'dia_limite_personalizado'
    });

  const idsInsolventes = candidatasInsolvencia
    .filter((mensualidad) => {
      if (String(mensualidad?.estatus || '').toLowerCase() !== 'pendiente') return false;
      const fechaCortePago = obtenerFechaCortePagoAlumnoMensualidad(mensualidad, mensualidad?.id_alumno);
      return fechaCortePago ? fechaCortePago < hoy : false;
    })
    .map((mensualidad) => mensualidad._id);

  const idsPendientes = candidatasInsolvencia
    .filter((mensualidad) => {
      if (String(mensualidad?.estatus || '').toLowerCase() !== 'insolvente') return false;
      const fechaCortePago = obtenerFechaCortePagoAlumnoMensualidad(mensualidad, mensualidad?.id_alumno);
      return fechaCortePago ? fechaCortePago >= hoy : false;
    })
    .map((mensualidad) => mensualidad._id);

  let mensualidadesInsolventes = 0;
  if (idsInsolventes.length > 0) {
    const result = await MensualidadModel.updateMany(
      { _id: { $in: idsInsolventes } },
      { $set: { estatus: 'Insolvente' } }
    );
    mensualidadesInsolventes = result.modifiedCount || 0;
  }

  let mensualidadesRegresadasPendiente = 0;
  if (idsPendientes.length > 0) {
    const resultPendiente = await MensualidadModel.updateMany(
      { _id: { $in: idsPendientes } },
      { $set: { estatus: 'Pendiente' } }
    );
    mensualidadesRegresadasPendiente = resultPendiente.modifiedCount || 0;
  }

  const candidatasRecargo = await MensualidadModel.find({
    estatus: { $in: ['Pendiente', 'Insolvente', 'Abono', 'En revision'] },
    monto_esperado: { $gt: 0 },
    $or: [
      { recargo_aplicado_usd: { $exists: false } },
      { recargo_aplicado_usd: { $lte: 0 } }
    ]
  }).populate({
    path: 'id_alumno',
    select: 'tipo_mensualidad aplicar_recargo_mensualidad dia_limite_personalizado'
  });

  let recargosAplicados = 0;
  for (const mensualidad of candidatasRecargo) {
    const resultado = await aplicarRecargoMensualidadSegunConfig(mensualidad, {
      models,
      fechaReferencia: hoy,
      persistir: true
    });
    if (resultado.aplicado) {
      recargosAplicados += 1;
    }
  }

  return mensualidadesInsolventes + mensualidadesRegresadasPendiente + recargosAplicados;
}

// Registrar la primera mensualidad manualmente
exports.registrarPrimeraMensualidad = async (req, res) => {
  try {
    const {
      Alumno: TenantAlumno,
      Mensualidad: TenantMensualidad,
      PagoDetalle: TenantPagoDetalle,
      Sede: TenantSede,
      Reposo: TenantReposo,
      TenantConfig: TenantConfigModel
    } = await getTenantMensualidadModels(req);
    const {
      es_registro_alumno,
      id_alumno,
      monto_esperado,
      monto_inscripcion,
      monto_primera_mensualidad,
      monto_equivalente_bs,
      monto_esperado_bs,
      monto_pagado,
      monto_pagado_bs,
      fecha_vencimiento,
      fecha_pago,
      metodo_pago,
      referencia,
      estatus
    } = req.body;

    const esRegistroAlumno = es_registro_alumno === true || String(es_registro_alumno || '').toLowerCase() === 'true';
    const montoEsperadoBase = normalizarMontoOpcional(monto_esperado);
    const montoInscripcionNormalizado = normalizarMontoOpcional(monto_inscripcion);
    const montoPrimeraMensualidadNormalizado = normalizarMontoOpcional(monto_primera_mensualidad);
    const montoEquivalenteBsNormalizado = normalizarMontoOpcional(monto_equivalente_bs);
    const montoEsperadoBsBase = normalizarMontoOpcional(monto_esperado_bs);

    const montoEsperado = esRegistroAlumno && (montoInscripcionNormalizado !== undefined || montoPrimeraMensualidadNormalizado !== undefined)
      ? redondearMonto((montoInscripcionNormalizado || 0) + (montoPrimeraMensualidadNormalizado || 0))
      : montoEsperadoBase;

    const montoEsperadoBsNormalizado = esRegistroAlumno
      ? (montoEquivalenteBsNormalizado ?? montoEsperadoBsBase)
      : montoEsperadoBsBase;

    if (!id_alumno || !monto_esperado) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }
    if (!Number.isFinite(montoEsperado) || montoEsperado <= 0) {
      return res.status(400).json({ error: 'monto_esperado invalido' });
    }
    const alumno = await TenantAlumno.findById(id_alumno);
    if (!alumno) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    if (alumno.activo === false || alumno.dado_de_baja === true) {
      return res.status(400).json({ error: 'No se puede registrar mensualidades para un alumno inactivo o dado de baja' });
    }

    const estatusSolicitado = String(estatus || '').trim();
    const estatusPrimeraMensualidad = alumno.habilitar_pago_cuotas === true
      ? 'Abono'
      : (estatusSolicitado || undefined);
    const comprobanteUrl = req.file
      ? `/uploads/${resolveTenantId(req)}/comprobantes/${req.file.filename}`
      : undefined;
    const montoPagadoUsd = normalizarMontoOpcional(monto_pagado);
    if (alumno.habilitar_pago_cuotas === true) {
      if (!Number.isFinite(montoPagadoUsd) || montoPagadoUsd <= 0) {
        return res.status(400).json({ error: 'monto_pagado es requerido para pagos en cuotas' });
      }
    }

    const metadataInscripcion = {
      montoInscripcion: montoInscripcionNormalizado,
      montoPrimeraMensualidad: montoPrimeraMensualidadNormalizado,
      montoEquivalenteBs: montoEquivalenteBsNormalizado,
      montoEsperadoBs: montoEsperadoBsNormalizado,
      montoPagadoUsd,
      montoPagadoBs: normalizarMontoOpcional(monto_pagado_bs),
      fechaPago: normalizarFechaOpcional(fecha_pago),
      metodoPago: metodo_pago ? String(metodo_pago).trim() : undefined,
      referencia: referencia ? String(referencia).trim() : undefined,
      comprobanteUrl
    };

    const periodoActual = getPeriodoZonaCaracas();
    const configCobro = await obtenerConfigCobro({ TenantConfig: TenantConfigModel });
    const resultados = await generarMensualidadesPendientesAlumno(alumno, {
      models: {
        Alumno: TenantAlumno,
        Mensualidad: TenantMensualidad,
        PagoDetalle: TenantPagoDetalle,
        Sede: TenantSede,
        Reposo: TenantReposo,
        TenantConfig: TenantConfigModel
      },
      cobroConfig: configCobro,
      periodoFin: periodoActual,
      overridePeriodoActual: {
        mes: periodoActual.mes,
        anio: periodoActual.anio,
        montoBaseManual: montoEsperado,
        estatusManual: estatusPrimeraMensualidad,
        fechaVencimientoManual: fecha_vencimiento,
        metadataInscripcion
      },
      crearPagoSiPagado: true,
      referenciaPago: 'primera-mensualidad'
    });

    const creadas = resultados.filter((resultado) => resultado.creada).length;
    const mensualidadActual = resultados.find(
      (resultado) =>
        resultado.mensualidad &&
        resultado.mensualidad.mes === periodoActual.mes &&
        resultado.mensualidad.anio === periodoActual.anio
    );

    return res.json({
      message: `Mensualidades procesadas: ${creadas}`,
      mensualidad: mensualidadActual?.mensualidad || null,
      mensualidades_creadas: creadas,
      mensualidades: resultados.map((resultado) => resultado.mensualidad).filter(Boolean)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Generar mensualidades automáticamente para todos los alumnos activos
exports.generarMensualidadesMes = async (req, res) => {
  try {
    const tenantModels = await getTenantMensualidadModels(req);
    const creadas = await generarMensualidadesMesCore({ models: tenantModels });
    res.json({ message: `Mensualidades generadas: ${creadas}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.adelantarMensualidadSiguiente = async (req, res) => {
  try {
    const {
      Alumno: TenantAlumno,
      Mensualidad: TenantMensualidad,
      Sede: TenantSede,
      Reposo: TenantReposo,
      TenantConfig: TenantConfigModel
    } = await getTenantMensualidadModels(req);
    const { id_alumno } = req.body;
    if (!id_alumno) {
      return res.status(400).json({ error: 'id_alumno es requerido' });
    }

    const alumno = await TenantAlumno.findById(id_alumno);
    if (!alumno) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    if (alumno.activo === false || alumno.dado_de_baja === true) {
      return res.status(400).json({ error: 'No se puede adelantar mensualidad para un alumno inactivo o dado de baja' });
    }

    if (esTipoMensualidadBecaCompleta(alumno.tipo_mensualidad)) {
      return res.status(400).json({ error: 'No se puede adelantar mensualidad para alumnos con beca completa' });
    }

    const { mes, anio } = await obtenerPeriodoAdelantoDesdeUltimaMensualidad(id_alumno, TenantMensualidad);
    const existente = await TenantMensualidad.findOne({ id_alumno, mes, anio }).populate('id_alumno');
    if (existente) {
      return res.json({
        message: 'La mensualidad del mes siguiente ya existe',
        mensualidad: existente,
        creada: false
      });
    }

    const configCobro = await obtenerConfigCobro({ TenantConfig: TenantConfigModel });
    const { mensualidad: mensualidadPopulada } = await crearMensualidadParaPeriodo(
      alumno,
      { mes, anio },
      {
        models: {
          Alumno: TenantAlumno,
          Mensualidad: TenantMensualidad,
          Sede: TenantSede,
          Reposo: TenantReposo,
          TenantConfig: TenantConfigModel
        },
        cobroConfig: configCobro
      }
    );

    return res.status(201).json({
      message: 'Mensualidad del mes siguiente creada correctamente',
      mensualidad: mensualidadPopulada,
      creada: true
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Actualizar mensualidades vencidas a Insolvente y aplicar recargo cuando corresponda.
exports.actualizarRetrasados = async (req, res) => {
  try {
    const tenantModels = await getTenantMensualidadModels(req);
    const actualizadas = await actualizarRetrasadosCore({ models: tenantModels });
    if (!actualizadas) return res.json({ message: 'No hubo mensualidades pendientes por actualizar.' });
    res.json({ message: `Mensualidades ajustadas (insolvente/recargo): ${actualizadas}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.generarMensualidadesMesCore = generarMensualidadesMesCore;
exports.actualizarRetrasadosCore = actualizarRetrasadosCore;
exports.generarMensualidadesPendientesAlumno = generarMensualidadesPendientesAlumno;
exports.aplicarRecargoMensualidadSegunConfig = aplicarRecargoMensualidadSegunConfig;

exports.previewAjusteExtraordinarioSede = async (req, res) => {
  try {
    const tenantModels = await getTenantMensualidadModels(req);
    const { id_sede, mes, anio, nuevo_monto, tipo } = req.body;

    if (!id_sede || !mes || !anio || nuevo_monto === undefined || nuevo_monto === null || nuevo_monto === '') {
      return res.status(400).json({ error: 'id_sede, mes, anio y nuevo_monto son requeridos' });
    }

    const mesNumero = Number(mes);
    const anioNumero = Number(anio);
    const nuevoMonto = redondearMonto(nuevo_monto);
    const tipoAjuste = String(tipo || 'mensualidades').toLowerCase();

    if (!Number.isInteger(mesNumero) || mesNumero < 1 || mesNumero > 12) {
      return res.status(400).json({ error: 'Mes inválido' });
    }

    if (!Number.isInteger(anioNumero) || anioNumero < 2000) {
      return res.status(400).json({ error: 'Año inválido' });
    }

    if (nuevoMonto < 0) {
      return res.status(400).json({ error: 'El nuevo monto no puede ser negativo' });
    }

    if (!['mensualidades', 'inscripciones'].includes(tipoAjuste)) {
      return res.status(400).json({ error: 'Tipo de ajuste inválido. Usa mensualidades o inscripciones.' });
    }

    const { alumnos, mensualidades } = await obtenerObjetivoAjustePorSede({ id_sede, mesNumero, anioNumero, tipo: tipoAjuste }, tenantModels);

    if (alumnos.length === 0) {
      return res.status(404).json({
        error: tipoAjuste === 'inscripciones'
          ? 'No hay alumnos activos en esta sede'
          : 'No hay alumnos activos con monto por sede en esta sede'
      });
    }

    if (mensualidades.length === 0) {
      return res.status(404).json({
        error: tipoAjuste === 'inscripciones'
          ? 'No hay inscripciones generadas para esa sede en el periodo indicado'
          : 'No hay mensualidades generadas para esa sede en el periodo indicado'
      });
    }

    const preview = generarVistaPreviaAjusteSede(mensualidades, nuevoMonto);

    return res.json({
      message: 'Vista previa generada correctamente',
      total_mensualidades_evaluadas: mensualidades.length,
      ...preview,
      nuevo_monto: nuevoMonto,
      mes: mesNumero,
      anio: anioNumero,
      tipo: tipoAjuste
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.aplicarAjusteExtraordinarioSede = async (req, res) => {
  try {
    const tenantModels = await getTenantMensualidadModels(req);
    const { id_sede, mes, anio, nuevo_monto, descripcion, tipo } = req.body;

    if (!id_sede || !mes || !anio || nuevo_monto === undefined || nuevo_monto === null || nuevo_monto === '') {
      return res.status(400).json({ error: 'id_sede, mes, anio y nuevo_monto son requeridos' });
    }

    const mesNumero = Number(mes);
    const anioNumero = Number(anio);
    const nuevoMonto = redondearMonto(nuevo_monto);
    const tipoAjuste = String(tipo || 'mensualidades').toLowerCase();

    if (!Number.isInteger(mesNumero) || mesNumero < 1 || mesNumero > 12) {
      return res.status(400).json({ error: 'Mes inválido' });
    }

    if (!Number.isInteger(anioNumero) || anioNumero < 2000) {
      return res.status(400).json({ error: 'Año inválido' });
    }

    if (nuevoMonto < 0) {
      return res.status(400).json({ error: 'El nuevo monto no puede ser negativo' });
    }

    if (!['mensualidades', 'inscripciones'].includes(tipoAjuste)) {
      return res.status(400).json({ error: 'Tipo de ajuste inválido. Usa mensualidades o inscripciones.' });
    }

    const { alumnos, mensualidades } = await obtenerObjetivoAjustePorSede({ id_sede, mesNumero, anioNumero, tipo: tipoAjuste }, tenantModels);

    if (alumnos.length === 0) {
      return res.status(404).json({
        error: tipoAjuste === 'inscripciones'
          ? 'No hay alumnos activos en esta sede'
          : 'No hay alumnos activos con monto por sede en esta sede'
      });
    }

    const alumnoMap = new Map(alumnos.map((alumno) => [String(alumno._id), alumno]));

    if (mensualidades.length === 0) {
      return res.status(404).json({
        error: tipoAjuste === 'inscripciones'
          ? 'No hay inscripciones generadas para esa sede en el periodo indicado'
          : 'No hay mensualidades generadas para esa sede en el periodo indicado'
      });
    }

    const preview = generarVistaPreviaAjusteSede(mensualidades, nuevoMonto);
    if (preview.mensualidades_no_compatibles > 0) {
      return res.status(400).json({
        error: 'El nuevo monto excede el monto base de una o más mensualidades del periodo',
        mensualidades_no_compatibles: preview.mensualidades_no_compatibles,
        monto_base_minimo_compatible: preview.monto_base_minimo_compatible
      });
    }

    let actualizadas = 0;
    let omitidasNoAplicables = 0;
    let omitidasConflictoSaldo = 0;
    let saldoTotalGenerado = 0;
    let alumnosConSaldoAFavor = 0;
    const omitidasDetalle = [];

    for (const mensualidad of mensualidades) {
      const motivoNoAplicable = obtenerMotivoOmitirAjusteSede(mensualidad);
      if (motivoNoAplicable) {
        omitidasNoAplicables += 1;
        omitidasDetalle.push(
          construirDetalleOmitidaAjusteSede(mensualidad, alumnoMap, motivoNoAplicable)
        );
        continue;
      }

      const montoBase = obtenerMontoBaseMensualidad(mensualidad);

      mensualidad.monto_base = montoBase;
      mensualidad.ajuste_extraordinario = redondearMonto(montoBase - nuevoMonto);
      mensualidad.ajuste_descripcion = descripcion ? String(descripcion).trim() : 'Ajuste extraordinario por sede';
      mensualidad.ajuste_fecha = new Date();
      mensualidad.monto_esperado = redondearMonto(
        Math.max(0, montoBase - (Number(mensualidad.credito_aplicado) || 0) - mensualidad.ajuste_extraordinario)
      );

      let resultado;
      try {
        resultado = await recalcularMensualidadPorPagos(mensualidad, {
          models: tenantModels,
          actorRol: 'admin',
          estatusAnterior: mensualidad.estatus,
          preservarPagadoSinPagos: true,
          preservarInsolventeSinPagosCuandoMontoCero: true
        });
      } catch (errorAjuste) {
        if (esErrorSaldoAFavorConsumido(errorAjuste)) {
          omitidasConflictoSaldo += 1;
          omitidasDetalle.push(
            construirDetalleOmitidaAjusteSede(mensualidad, alumnoMap, {
              code: 'SALDO_A_FAVOR_CONSUMIDO',
              message: 'Saldo a favor consumido en meses posteriores'
            })
          );
          continue;
        }
        throw errorAjuste;
      }

      actualizadas += 1;
      saldoTotalGenerado = redondearMonto(saldoTotalGenerado + resultado.saldoAFavorGenerado);

      if (resultado.saldoAFavorGenerado > 0) {
        const alumno = alumnoMap.get(String(mensualidad.id_alumno));
        if (alumno) {
          alumnosConSaldoAFavor += 1;
          alumnoMap.delete(String(mensualidad.id_alumno));
        }
      }
    }

    const omitidasTotales = omitidasNoAplicables + omitidasConflictoSaldo;
    const fueParcial = omitidasTotales > 0;

    res.json({
      message: fueParcial
        ? 'Ajuste extraordinario aplicado parcialmente'
        : 'Ajuste extraordinario aplicado correctamente',
      mensualidades_actualizadas: actualizadas,
      mensualidades_omitidas: omitidasTotales,
      mensualidades_omitidas_no_aplicables: omitidasNoAplicables,
      mensualidades_omitidas_conflicto_saldo: omitidasConflictoSaldo,
      mensualidades_omitidas_detalle: omitidasDetalle,
      alumnos_con_saldo_a_favor: alumnosConSaldoAFavor,
      saldo_total_generado: saldoTotalGenerado,
      nuevo_monto: nuevoMonto,
      mes: mesNumero,
      anio: anioNumero,
      tipo: tipoAjuste,
      resumen_ajuste: {
        procesadas_total: mensualidades.length,
        correctas: actualizadas,
        omitidas_total: omitidasTotales,
        omitidas_no_aplicables: omitidasNoAplicables,
        omitidas_conflicto_saldo: omitidasConflictoSaldo,
        omitidas_detalle: omitidasDetalle
      }
    });
  } catch (err) {
    if (esErrorSaldoAFavorConsumido(err)) {
      return res.status(409).json({
        error: err.message,
        code: 'SALDO_A_FAVOR_CONSUMIDO'
      });
    }

    res.status(500).json({ error: err.message });
  }
};

// Consultar mensualidades (por sede, alumno, mes, año)
exports.getMensualidades = async (req, res) => {
  try {
    const {
      Representante: TenantRepresentante,
      Alumno: TenantAlumno,
      Mensualidad: TenantMensualidad,
      PagoDetalle: TenantPagoDetalle
    } = await getTenantMensualidadModels(req);

    const filtro = {};
    let ownedAlumnoIds = null;

    if (req.user?.rol === 'usuario') {
      const representantes = await TenantRepresentante.find({ usuario: req.user.id }).select('_id');
      const representanteIds = representantes.map((r) => r._id);
      const filtroPropio = [{ usuario: req.user.id }];
      if (representanteIds.length > 0) {
        filtroPropio.push({ representante: { $in: representanteIds } });
      }

      const alumnosPropios = await TenantAlumno.find({ $or: filtroPropio }).select('_id');
      ownedAlumnoIds = alumnosPropios.map((a) => String(a._id));
      if (ownedAlumnoIds.length === 0) {
        return res.json([]);
      }
    }

    if (req.query.id_alumno) filtro.id_alumno = req.query.id_alumno;
    if (req.query.mes) filtro.mes = Number(req.query.mes);
    if (req.query.anio) filtro.anio = Number(req.query.anio);
    // Si se quiere filtrar por sede, buscar alumnos de esa sede
      if (req.query.id_sede) {
        console.log('Tipo de req.query.id_sede:', typeof req.query.id_sede, 'Valor:', req.query.id_sede);
        const mongoose = require('mongoose');
        let idSede;
        try {
          idSede = new mongoose.Types.ObjectId(req.query.id_sede);
        } catch (e) {
          console.log('Error al convertir id_sede:', e);
          return res.status(400).json({ error: 'id_sede inválido' });
        }
        const alumnos = await TenantAlumno.find({ sede: idSede });
        filtro.id_alumno = { $in: alumnos.map(a => a._id) };
      }

    if (ownedAlumnoIds) {
      if (!filtro.id_alumno) {
        filtro.id_alumno = { $in: ownedAlumnoIds };
      } else if (typeof filtro.id_alumno === 'string') {
        if (!ownedAlumnoIds.includes(String(filtro.id_alumno))) {
          return res.json([]);
        }
      } else if (filtro.id_alumno.$in) {
        const permitidos = filtro.id_alumno.$in
          .map((id) => String(id))
          .filter((id) => ownedAlumnoIds.includes(id));

        if (permitidos.length === 0) {
          return res.json([]);
        }
        filtro.id_alumno = { $in: permitidos };
      }
    }

    const mensualidades = await TenantMensualidad.find(filtro).populate({
      path: 'id_alumno',
      populate: {
        path: 'representante',
        select: 'nombres apellidos'
      }
    });

    const mensualidadIds = mensualidades.map((m) => m._id);
    const pagosPorMensualidad = mensualidadIds.length > 0
      ? await TenantPagoDetalle.aggregate([
          { $match: { id_mensualidad: { $in: mensualidadIds } } },
          {
            $group: {
              _id: '$id_mensualidad',
              total_pagado: { $sum: { $ifNull: ['$monto_pagado', 0] } }
            }
          }
        ])
      : [];

    const totalPagadoMap = new Map(
      pagosPorMensualidad.map((item) => [String(item._id), redondearMonto(item.total_pagado)])
    );

    // Compatibilidad: data histórica con "Retrasado" se expone como "Insolvente".
    const mensualidadesCompat = mensualidades.map((m) => {
      const raw = m.toObject ? m.toObject() : m;
      const totalPagado = totalPagadoMap.get(String(raw._id)) || 0;
      const saldoPendiente = redondearMonto(Math.max(0, (Number(raw.monto_esperado) || 0) - totalPagado));
      const componentes = obtenerComponentesMensualidad(raw);

      raw.total_pagado = totalPagado;
      raw.saldo_pendiente = saldoPendiente;
      raw.monto_total = redondearMonto(raw.monto_esperado || 0);
      raw.monto_mensualidad_visual = componentes.componenteMensualidad;
      raw.monto_inscripcion_visual = componentes.componenteInscripcion;
      raw.es_pago_mixto = componentes.esMixto;

      if (esEstatusInsolvente(raw.estatus)) {
        raw.estatus = 'Insolvente';
      }
      return raw;
    });

    res.json(mensualidadesCompat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getInscripciones = async (req, res) => {
  try {
    const {
      Representante: TenantRepresentante,
      Alumno: TenantAlumno,
      Mensualidad: TenantMensualidad,
      PagoDetalle: TenantPagoDetalle
    } = await getTenantMensualidadModels(req);

    const filtro = {};
    let ownedAlumnoIds = null;

    if (req.user?.rol === 'usuario') {
      const representantes = await TenantRepresentante.find({ usuario: req.user.id }).select('_id');
      const representanteIds = representantes.map((r) => r._id);
      const filtroPropio = [{ usuario: req.user.id }];
      if (representanteIds.length > 0) {
        filtroPropio.push({ representante: { $in: representanteIds } });
      }

      const alumnosPropios = await TenantAlumno.find({ $or: filtroPropio }).select('_id');
      ownedAlumnoIds = alumnosPropios.map((a) => String(a._id));
      if (ownedAlumnoIds.length === 0) {
        return res.json([]);
      }
    }

    if (req.query.id_alumno) filtro.id_alumno = req.query.id_alumno;
    if (req.query.mes) filtro.mes = Number(req.query.mes);
    if (req.query.anio) filtro.anio = Number(req.query.anio);
    if (req.query.id_sede) {
      let idSede;
      try {
        idSede = new mongoose.Types.ObjectId(req.query.id_sede);
      } catch (_) {
        return res.status(400).json({ error: 'id_sede inválido' });
      }
      const alumnos = await TenantAlumno.find({ sede: idSede });
      filtro.id_alumno = { $in: alumnos.map((a) => a._id) };
    }

    if (ownedAlumnoIds) {
      if (!filtro.id_alumno) {
        filtro.id_alumno = { $in: ownedAlumnoIds };
      } else if (typeof filtro.id_alumno === 'string') {
        if (!ownedAlumnoIds.includes(String(filtro.id_alumno))) {
          return res.json([]);
        }
      } else if (filtro.id_alumno.$in) {
        const permitidos = filtro.id_alumno.$in
          .map((id) => String(id))
          .filter((id) => ownedAlumnoIds.includes(id));

        if (permitidos.length === 0) {
          return res.json([]);
        }
        filtro.id_alumno = { $in: permitidos };
      }
    }

    const mensualidades = await TenantMensualidad.find(filtro).populate({
      path: 'id_alumno',
      populate: {
        path: 'representante',
        select: 'nombres apellidos'
      }
    });

    const mensualidadIds = mensualidades.map((m) => m._id);
    const pagosPorMensualidad = mensualidadIds.length > 0
      ? await TenantPagoDetalle.aggregate([
          { $match: { id_mensualidad: { $in: mensualidadIds } } },
          {
            $group: {
              _id: '$id_mensualidad',
              total_pagado: { $sum: { $ifNull: ['$monto_pagado', 0] } }
            }
          }
        ])
      : [];

    const totalPagadoMap = new Map(
      pagosPorMensualidad.map((item) => [String(item._id), redondearMonto(item.total_pagado)])
    );

    const inscripciones = mensualidades
      .map((m) => {
        const raw = m.toObject ? m.toObject() : m;
        const totalPagado = totalPagadoMap.get(String(raw._id)) || 0;
        const componentes = obtenerComponentesMensualidad(raw);
        const reparto = distribuirPagoPorConcepto(totalPagado, componentes);

        raw.total_pagado = totalPagado;
        raw.total_pagado_inscripcion = reparto.pagadoInscripcion;
        raw.total_pagado_mensualidad = reparto.pagadoMensualidad;
        raw.monto_mensualidad_visual = componentes.componenteMensualidad;
        raw.monto_inscripcion_visual = componentes.componenteInscripcion;
        raw.es_pago_mixto = componentes.esMixto;
        raw.monto_total = redondearMonto(raw.monto_esperado || 0);
        raw.saldo_pendiente = redondearMonto(Math.max(0, (Number(raw.monto_esperado) || 0) - totalPagado));

        if (esEstatusInsolvente(raw.estatus)) {
          raw.estatus = 'Insolvente';
        }

        return raw;
      })
      .filter((m) => Number(m.monto_inscripcion_visual || 0) > 0);

    return res.json(inscripciones);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Confirmar mensualidad en revisión
exports.confirmarMensualidad = async (req, res) => {
  try {
    const { Mensualidad: TenantMensualidad } = await getTenantMensualidadModels(req);
    const mensualidad = await TenantMensualidad.findById(req.params.id);
    if (!mensualidad) return res.status(404).json({ error: 'Mensualidad no encontrada' });
    mensualidad.estatus = 'Pagado';
    await mensualidad.save();
    res.json({ message: 'Mensualidad confirmada', mensualidad });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Editar una mensualidad individual sin afectar periodos anteriores o posteriores.
exports.editarMensualidadIndividual = async (req, res) => {
  try {
    const tenantModels = await getTenantMensualidadModels(req);
    const {
      Mensualidad: TenantMensualidad,
      Alumno: TenantAlumno,
      PagoDetalle: TenantPagoDetalle
    } = tenantModels;

    const mensualidad = await TenantMensualidad.findById(req.params.id);
    if (!mensualidad) {
      return res.status(404).json({ error: 'Mensualidad no encontrada' });
    }

    const montoEsperadoInput = req.body?.monto_esperado;
    const estatusInput = req.body?.estatus;
    const notaEdicion = normalizarNotaEdicion(req.body?.nota);

    const montoEsperadoNormalizado = normalizarMontoOpcional(montoEsperadoInput);
    const estatusNormalizado = typeof estatusInput === 'string' ? estatusInput.trim().toLowerCase() : '';
    const snapshotAnterior = construirSnapshotEdicionMensualidad(mensualidad);

    if (
      montoEsperadoInput !== undefined &&
      montoEsperadoInput !== null &&
      montoEsperadoInput !== '' &&
      montoEsperadoNormalizado === undefined
    ) {
      return res.status(400).json({ error: 'monto_esperado inválido' });
    }

    if (
      montoEsperadoNormalizado === undefined &&
      !estatusNormalizado
    ) {
      return res.status(400).json({ error: 'Debes enviar monto_esperado o estatus para editar' });
    }

    if (!notaEdicion) {
      return res.status(400).json({ error: 'Debes indicar una nota con el motivo del cambio' });
    }

    if (montoEsperadoNormalizado !== undefined) {
      if (montoEsperadoNormalizado < 0) {
        return res.status(400).json({ error: 'El monto_esperado no puede ser negativo' });
      }

      // Politica: mantener el monto base de esta mensualidad y ajustar solo su ajuste_extraordinario.
      const montoBaseActual = obtenerMontoBaseMensualidad(mensualidad);
      const creditoAplicado = redondearMonto(mensualidad.credito_aplicado || 0);

      mensualidad.monto_base = montoBaseActual;
      mensualidad.ajuste_extraordinario = redondearMonto(montoBaseActual - creditoAplicado - montoEsperadoNormalizado);
      mensualidad.monto_esperado = montoEsperadoNormalizado;
      mensualidad.monto_sin_recargo_usd = montoEsperadoNormalizado;
      mensualidad.recargo_aplicado_usd = 0;
      mensualidad.monto_con_recargo_usd = montoEsperadoNormalizado;
      mensualidad.aplica_recargo = false;
      mensualidad.fecha_aplicacion_recargo = null;
      mensualidad.ajuste_descripcion = 'Ajuste manual individual de mensualidad';
      mensualidad.ajuste_fecha = new Date();
    }

    if (estatusNormalizado === 'exonerado') {
      const pagos = await TenantPagoDetalle.find({ id_mensualidad: mensualidad._id }).select('monto_pagado');
      const totalPagado = redondearMonto(
        pagos.reduce((acc, pago) => acc + (Number(pago.monto_pagado) || 0), 0)
      );
      const saldoGeneradoPrevio = redondearMonto(mensualidad.saldo_a_favor_generado || 0);
      const saldoGeneradoNuevo = redondearMonto(Math.max(0, totalPagado));
      const deltaSaldo = redondearMonto(saldoGeneradoNuevo - saldoGeneradoPrevio);

      if (deltaSaldo !== 0) {
        const alumnoId = mensualidad.id_alumno?._id || mensualidad.id_alumno;
        const alumnoDoc = await TenantAlumno.findById(alumnoId).select('saldo_a_favor_mensualidades');
        if (alumnoDoc) {
          const saldoActual = redondearMonto(alumnoDoc.saldo_a_favor_mensualidades || 0);
          const saldoResultante = redondearMonto(saldoActual + deltaSaldo);
          if (saldoResultante < 0) {
            return res.status(400).json({
              error: 'No se puede exonerar porque el saldo a favor previo de esta mensualidad ya fue consumido.'
            });
          }
          await TenantAlumno.findByIdAndUpdate(alumnoId, {
            $set: { saldo_a_favor_mensualidades: saldoResultante }
          });
        }
      }

      const montoBaseActual = obtenerMontoBaseMensualidad(mensualidad);
      const creditoAplicado = redondearMonto(mensualidad.credito_aplicado || 0);

      mensualidad.monto_base = montoBaseActual;
      mensualidad.ajuste_extraordinario = redondearMonto(montoBaseActual - creditoAplicado);
      mensualidad.monto_esperado = 0;
      mensualidad.monto_sin_recargo_usd = 0;
      mensualidad.recargo_aplicado_usd = 0;
      mensualidad.monto_con_recargo_usd = 0;
      mensualidad.aplica_recargo = false;
      mensualidad.saldo_a_favor_generado = saldoGeneradoNuevo;
      mensualidad.fecha_aplicacion_recargo = null;
      mensualidad.estatus = 'Exonerado';
      mensualidad.ajuste_descripcion = 'Exoneracion manual individual de mensualidad';
      mensualidad.ajuste_fecha = new Date();
      registrarHistorialEdicionMensualidad(mensualidad, req, {
        accion: 'exoneracion_manual',
        nota: notaEdicion,
        anterior: snapshotAnterior,
        nuevo: construirSnapshotEdicionMensualidad(mensualidad)
      });
      await mensualidad.save();

      return res.json({
        message: 'Mensualidad exonerada correctamente',
        saldo_a_favor_generado: saldoGeneradoNuevo,
        mensualidad
      });
    }

    if (estatusNormalizado && estatusNormalizado !== 'exonerado') {
      return res.status(400).json({ error: 'El único cambio manual de estatus permitido es a Exonerado' });
    }

    const resultado = await recalcularMensualidadPorPagos(mensualidad, {
      models: tenantModels,
      actorRol: req.user?.rol || 'admin',
      estatusAnterior: mensualidad.estatus,
      preservarPagadoSinPagos: true,
      preservarInsolventeSinPagosCuandoMontoCero: true,
      omitirRecargoAutomatico: montoEsperadoNormalizado !== undefined
    });

    registrarHistorialEdicionMensualidad(mensualidad, req, {
      accion: 'edicion_manual',
      nota: notaEdicion,
      anterior: snapshotAnterior,
      nuevo: construirSnapshotEdicionMensualidad(mensualidad)
    });
    await mensualidad.save();

    return res.json({
      message: 'Mensualidad actualizada correctamente',
      mensualidad,
      resumen: resultado
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Eliminar mensualidad y sus pagos asociados
exports.eliminarMensualidad = async (req, res) => {
  try {
    const {
      Mensualidad: TenantMensualidad,
      PagoDetalle: TenantPagoDetalle
    } = await getTenantMensualidadModels(req);

    const mensualidad = await TenantMensualidad.findById(req.params.id);
    if (!mensualidad) {
      return res.status(404).json({ error: 'Mensualidad no encontrada' });
    }

    await TenantPagoDetalle.deleteMany({ id_mensualidad: mensualidad._id });
    await mensualidad.deleteOne();

    res.json({ message: 'Mensualidad eliminada correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Resumen de mensualidades por sede (mes en curso por defecto)
exports.getResumenMensualidadesPorSede = async (req, res) => {
  try {
    const { Mensualidad: TenantMensualidad } = await getTenantMensualidadModels(req);
    const hoy = new Date();
    const mes = req.query.mes ? Number(req.query.mes) : hoy.getMonth() + 1;
    const anio = req.query.anio ? Number(req.query.anio) : hoy.getFullYear();

    const pipeline = [
      buildPeriodoMatchStage(mes, anio),
      {
        $lookup: {
          from: 'alumnos',
          localField: 'id_alumno',
          foreignField: '_id',
          as: 'alumno'
        }
      },
      { $unwind: '$alumno' },
      {
        $lookup: {
          from: 'sedes',
          localField: 'alumno.sede',
          foreignField: '_id',
          as: 'sede'
        }
      },
      { $unwind: { path: '$sede', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            sedeId: '$sede._id',
            sedeNombre: '$sede.nombre',
            estatus: '$estatus'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: { sedeId: '$_id.sedeId', sedeNombre: '$_id.sedeNombre' },
          estatuses: { $push: { estatus: '$_id.estatus', count: '$count' } },
          total: { $sum: '$count' }
        }
      },
      {
        $project: {
          _id: 0,
          sedeId: '$_id.sedeId',
          sedeNombre: '$_id.sedeNombre',
          estatuses: 1,
          total: 1
        }
      }
    ];

    const data = await TenantMensualidad.aggregate(pipeline);
    const estados = ['pagado', 'pendiente', 'insolvente', 'retrasado', 'en revision', 'exonerado', 'abono', 'exento por reposo', 'becado'];
    const resultado = data.map(item => {
      const conteos = {};
      estados.forEach(e => { conteos[e] = 0; });
      item.estatuses.forEach(e => {
        const key = normalizarEstatusKey(e.estatus);
        if (conteos[key] !== undefined) conteos[key] = e.count;
      });

      // Compatibilidad: sumar data histórica "retrasado" al bucket "insolvente".
      conteos.insolvente = (conteos.insolvente || 0) + (conteos.retrasado || 0);

      return {
        sedeId: item.sedeId,
        sedeNombre: item.sedeNombre || 'Sin sede',
        total: item.total,
        ...conteos
      };
    });

    res.json({ mes, anio, sedes: resultado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Dolares pagados por sede para el mes/anio seleccionado
exports.getDolaresPagadosPorSede = async (req, res) => {
  try {
    const {
      PagoDetalle: TenantPagoDetalle,
      Mensualidad: TenantMensualidad,
      Alumno: TenantAlumno,
      Sede: TenantSede
    } = await getTenantMensualidadModels(req);
    const hoy = new Date();
    const mes = req.query.mes ? Number(req.query.mes) : hoy.getMonth() + 1;
    const anio = req.query.anio ? Number(req.query.anio) : hoy.getFullYear();
    const tipo = String(req.query.tipo || 'mensualidades').trim().toLowerCase();

    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      return res.status(400).json({ error: 'Mes inválido' });
    }
    if (!Number.isInteger(anio) || anio < 2000) {
      return res.status(400).json({ error: 'Año inválido' });
    }
    if (!['total', 'mensualidades', 'inscripciones'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido. Usa total, mensualidades o inscripciones.' });
    }

    const inicioMes = new Date(Date.UTC(anio, mes - 1, 1, 0, 0, 0, 0));
    const finMes = new Date(Date.UTC(anio, mes, 1, 0, 0, 0, 0));

    const pagos = await TenantPagoDetalle.find({
      $or: [
        { fecha_pago: { $gte: inicioMes, $lt: finMes } },
        {
          fecha_pago: { $in: [null, undefined] },
          createdAt: { $gte: inicioMes, $lt: finMes }
        }
      ]
    })
      .select('id_mensualidad monto_pagado fecha_pago createdAt')
      .lean();

    const mensualidadIdsPagos = Array.from(
      new Set(pagos.map((pago) => String(pago.id_mensualidad || '')).filter(Boolean))
    );

    const mensualidadesPagos = mensualidadIdsPagos.length > 0
      ? await TenantMensualidad.find({ _id: { $in: mensualidadIdsPagos } })
        .select('_id id_alumno estatus monto_esperado monto_inscripcion monto_reingreso monto_primera_mensualidad monto_mensualidad_reingreso')
        .lean()
      : [];

    const mensualidadMap = new Map(
      mensualidadesPagos.map((mensualidad) => [String(mensualidad._id), mensualidad])
    );

    const alumnoIdsPagos = Array.from(
      new Set(mensualidadesPagos.map((item) => String(item.id_alumno || '')).filter(Boolean))
    );

    let alumnoToSede = new Map();
    if (alumnoIdsPagos.length > 0) {
      const alumnos = await TenantAlumno
        .find({ _id: { $in: alumnoIdsPagos } })
        .select('_id sede')
        .lean();
      alumnoToSede = new Map(alumnos.map((alumno) => [String(alumno._id), String(alumno.sede || '')]));
    }

    const pagosOrdenados = pagos
      .map((pago) => {
        const fechaReferencia = pago?.fecha_pago ? new Date(pago.fecha_pago) : new Date(pago.createdAt || 0);
        return { ...pago, __fechaReferencia: fechaReferencia };
      })
      .filter((pago) => !Number.isNaN(pago.__fechaReferencia?.getTime?.()))
      .sort((a, b) => a.__fechaReferencia.getTime() - b.__fechaReferencia.getTime());

    const acumuladoSede = new Map();
    const idsMensualidadesConPago = new Set();
    const saldoInscripcionPorMensualidad = new Map();

    for (const pago of pagosOrdenados) {
      const mensualidadId = String(pago.id_mensualidad || '');
      const mensualidad = mensualidadMap.get(mensualidadId);
      if (!mensualidad) continue;
      if (!esEstatusIngresoConfirmado(mensualidad.estatus)) continue;

      const sedeId = alumnoToSede.get(String(mensualidad.id_alumno || '')) || '';
      const montoPagado = redondearMonto(Number(pago?.monto_pagado) || 0);
      const componentes = obtenerComponentesMensualidad(mensualidad);
      const saldoInscripcionActual = saldoInscripcionPorMensualidad.has(mensualidadId)
        ? Number(saldoInscripcionPorMensualidad.get(mensualidadId) || 0)
        : Number(componentes.componenteInscripcion || 0);
      const montoInscripcionPago = redondearMonto(Math.min(montoPagado, Math.max(0, saldoInscripcionActual)));
      const montoMensualidadPago = redondearMonto(Math.max(0, montoPagado - montoInscripcionPago));

      saldoInscripcionPorMensualidad.set(
        mensualidadId,
        redondearMonto(Math.max(0, saldoInscripcionActual - montoInscripcionPago))
      );

      const valor = tipo === 'inscripciones'
        ? montoInscripcionPago
        : (tipo === 'total' ? montoPagado : montoMensualidadPago);

      const previo = acumuladoSede.get(sedeId) || 0;
      acumuladoSede.set(sedeId, redondearMonto(previo + valor));
      idsMensualidadesConPago.add(mensualidadId);
    }

    const mensualidadesLegacy = await TenantMensualidad.find({
      fecha_pago: { $gte: inicioMes, $lt: finMes }
    })
      .select('_id id_alumno estatus fecha_pago monto_esperado monto_inscripcion monto_reingreso monto_primera_mensualidad monto_mensualidad_reingreso')
      .lean();

    const alumnoIdsLegacy = Array.from(
      new Set(mensualidadesLegacy.map((item) => String(item.id_alumno || '')).filter(Boolean))
    );

    if (alumnoIdsLegacy.length > 0) {
      const alumnosLegacy = await TenantAlumno
        .find({ _id: { $in: alumnoIdsLegacy } })
        .select('_id sede')
        .lean();
      for (const alumno of alumnosLegacy) {
        if (!alumnoToSede.has(String(alumno._id))) {
          alumnoToSede.set(String(alumno._id), String(alumno.sede || ''));
        }
      }
    }

    for (const mensualidad of mensualidadesLegacy) {
      const mensualidadId = String(mensualidad._id || '');
      if (idsMensualidadesConPago.has(mensualidadId)) continue;
      if (!esEstatusIngresoConfirmado(mensualidad.estatus)) continue;

      const sedeId = alumnoToSede.get(String(mensualidad.id_alumno || '')) || '';
      const componentes = obtenerComponentesMensualidad(mensualidad);
      const totalComponentes = redondearMonto(componentes.componenteInscripcion + componentes.componenteMensualidad);
      const totalLegacy = totalComponentes > 0
        ? totalComponentes
        : redondearMonto(Number(mensualidad?.monto_esperado) || 0);

      const valor = tipo === 'inscripciones'
        ? componentes.componenteInscripcion
        : (tipo === 'total' ? totalLegacy : componentes.componenteMensualidad);

      const previo = acumuladoSede.get(sedeId) || 0;
      acumuladoSede.set(sedeId, redondearMonto(previo + valor));
    }

    const sedeIds = [...acumuladoSede.keys()].filter(Boolean);
    const sedesDocs = sedeIds.length > 0
      ? await TenantSede.find({ _id: { $in: sedeIds } }).select('_id nombre').lean()
      : [];
    const nombreSedeMap = new Map(sedesDocs.map((sede) => [String(sede._id), sede.nombre || 'Sin sede']));

    const sedes = [...acumuladoSede.entries()]
      .map(([sedeId, monto]) => ({
        sedeId: sedeId || null,
        sedeNombre: nombreSedeMap.get(sedeId) || 'Sin sede',
        monto_pagado: redondearMonto(monto)
      }))
      .sort((a, b) => String(a.sedeNombre || '').localeCompare(String(b.sedeNombre || ''), 'es', { sensitivity: 'base' }));

    return res.json({ mes, anio, tipo, sedes });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Ingresos totales por mes para el anio seleccionado
exports.getIngresosPorMes = async (req, res) => {
  try {
    const {
      PagoDetalle: TenantPagoDetalle,
      Mensualidad: TenantMensualidad,
      Alumno: TenantAlumno
    } = await getTenantMensualidadModels(req);
    const hoy = new Date();
    const anio = req.query.anio ? Number(req.query.anio) : hoy.getFullYear();
    const tipo = String(req.query.tipo || 'total').trim().toLowerCase();

    if (!Number.isInteger(anio) || anio < 2000) {
      return res.status(400).json({ error: 'Año inválido' });
    }

    if (!['total', 'mensualidades', 'inscripciones'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido. Usa total, mensualidades o inscripciones.' });
    }

    const idSede = String(req.query.id_sede || '').trim();
    if (idSede && idSede !== 'all' && !mongoose.Types.ObjectId.isValid(idSede)) {
      return res.status(400).json({ error: 'Sede inválida' });
    }

    const inicioAnio = new Date(Date.UTC(anio, 0, 1, 0, 0, 0, 0));
    const finAnio = new Date(Date.UTC(anio + 1, 0, 1, 0, 0, 0, 0));

    const pagos = await TenantPagoDetalle.find({
      $or: [
        { fecha_pago: { $gte: inicioAnio, $lt: finAnio } },
        {
          fecha_pago: { $in: [null, undefined] },
          createdAt: { $gte: inicioAnio, $lt: finAnio }
        }
      ]
    })
      .select('id_mensualidad monto_pagado fecha_pago createdAt')
      .lean();

    const mensualidadIdsPagos = Array.from(
      new Set(pagos.map((pago) => String(pago.id_mensualidad || '')).filter(Boolean))
    );

    const mensualidadesPagos = mensualidadIdsPagos.length > 0
      ? await TenantMensualidad.find({ _id: { $in: mensualidadIdsPagos } })
        .select('_id id_alumno estatus monto_esperado monto_inscripcion monto_reingreso monto_primera_mensualidad monto_mensualidad_reingreso')
        .lean()
      : [];

    const mensualidadMap = new Map(
      mensualidadesPagos.map((mensualidad) => [String(mensualidad._id), mensualidad])
    );

    let alumnoIds = Array.from(
      new Set(mensualidadesPagos.map((item) => String(item.id_alumno || '')).filter(Boolean))
    );

    let alumnosMap = new Map();
    if (alumnoIds.length > 0) {
      const alumnos = await TenantAlumno
        .find({ _id: { $in: alumnoIds } })
        .select('_id sede')
        .lean();
      alumnosMap = new Map(alumnos.map((alumno) => [String(alumno._id), String(alumno.sede || '')]));
    }

    const sedeFiltro = idSede && idSede !== 'all' ? String(idSede) : null;
    const acumuladoMes = new Map();
    const idsMensualidadesConPago = new Set();
    const saldoInscripcionPorMensualidad = new Map();

    const pagosOrdenados = pagos
      .map((pago) => {
        const fechaReferencia = pago?.fecha_pago ? new Date(pago.fecha_pago) : new Date(pago.createdAt || 0);
        return {
          ...pago,
          __fechaReferencia: fechaReferencia
        };
      })
      .filter((pago) => !Number.isNaN(pago.__fechaReferencia?.getTime?.()))
      .sort((a, b) => a.__fechaReferencia.getTime() - b.__fechaReferencia.getTime());

    for (const pago of pagosOrdenados) {
      const mensualidadId = String(pago.id_mensualidad || '');
      const mensualidad = mensualidadMap.get(mensualidadId);
      if (!mensualidad) continue;
      if (!esEstatusIngresoConfirmado(mensualidad.estatus)) continue;

      const alumnoId = String(mensualidad.id_alumno || '');
      const sedeAlumno = alumnosMap.get(alumnoId) || '';
      if (sedeFiltro && sedeAlumno !== sedeFiltro) continue;

      const fechaReferencia = pago.__fechaReferencia;
      const mes = fechaReferencia.getUTCMonth() + 1;
      if (mes < 1 || mes > 12) continue;

      const montoPagado = redondearMonto(Number(pago?.monto_pagado) || 0);
      const componentes = obtenerComponentesMensualidad(mensualidad);
      const saldoInscripcionActual = saldoInscripcionPorMensualidad.has(mensualidadId)
        ? Number(saldoInscripcionPorMensualidad.get(mensualidadId) || 0)
        : Number(componentes.componenteInscripcion || 0);
      const montoInscripcionPago = redondearMonto(Math.min(montoPagado, Math.max(0, saldoInscripcionActual)));
      const montoMensualidadPago = redondearMonto(Math.max(0, montoPagado - montoInscripcionPago));
      saldoInscripcionPorMensualidad.set(
        mensualidadId,
        redondearMonto(Math.max(0, saldoInscripcionActual - montoInscripcionPago))
      );

      const monto = tipo === 'mensualidades'
        ? montoMensualidadPago
        : (tipo === 'inscripciones' ? montoInscripcionPago : montoPagado);

      const previo = acumuladoMes.get(mes) || 0;
      acumuladoMes.set(mes, redondearMonto(previo + monto));
      idsMensualidadesConPago.add(mensualidadId);
    }

    const mensualidadesLegacy = await TenantMensualidad.find({
      fecha_pago: { $gte: inicioAnio, $lt: finAnio }
    })
      .select('_id id_alumno estatus fecha_pago monto_esperado monto_inscripcion monto_reingreso monto_primera_mensualidad monto_mensualidad_reingreso')
      .lean();

    const alumnoIdsLegacy = Array.from(
      new Set(mensualidadesLegacy.map((item) => String(item.id_alumno || '')).filter(Boolean))
    );

    if (alumnoIdsLegacy.length > 0) {
      const alumnosLegacy = await TenantAlumno
        .find({ _id: { $in: alumnoIdsLegacy } })
        .select('_id sede')
        .lean();
      for (const alumno of alumnosLegacy) {
        if (!alumnosMap.has(String(alumno._id))) {
          alumnosMap.set(String(alumno._id), String(alumno.sede || ''));
        }
      }
    }

    for (const mensualidad of mensualidadesLegacy) {
      const mensualidadId = String(mensualidad._id || '');
      if (idsMensualidadesConPago.has(mensualidadId)) continue;
      if (!esEstatusIngresoConfirmado(mensualidad.estatus)) continue;

      const alumnoId = String(mensualidad.id_alumno || '');
      const sedeAlumno = alumnosMap.get(alumnoId) || '';
      if (sedeFiltro && sedeAlumno !== sedeFiltro) continue;

      const fechaPagoLegacy = new Date(mensualidad.fecha_pago || 0);
      if (Number.isNaN(fechaPagoLegacy.getTime())) continue;
      const mes = fechaPagoLegacy.getUTCMonth() + 1;
      if (mes < 1 || mes > 12) continue;

      const componentes = obtenerComponentesMensualidad(mensualidad);
      const totalComponentes = redondearMonto(componentes.componenteInscripcion + componentes.componenteMensualidad);
      const totalLegacy = totalComponentes > 0
        ? totalComponentes
        : redondearMonto(Number(mensualidad?.monto_esperado) || 0);

      const monto = tipo === 'mensualidades'
        ? componentes.componenteMensualidad
        : (tipo === 'inscripciones' ? componentes.componenteInscripcion : totalLegacy);

      const previo = acumuladoMes.get(mes) || 0;
      acumuladoMes.set(mes, redondearMonto(previo + monto));
    }

    const meses = Array.from({ length: 12 }, (_, index) => {
      const mes = index + 1;
      return {
        mes,
        total_pagado: redondearMonto(acumuladoMes.get(mes) || 0)
      };
    });

    const totalAnual = redondearMonto(
      meses.reduce((acc, item) => acc + (Number(item.total_pagado) || 0), 0)
    );

    return res.json({ anio, tipo, meses, total_anual: totalAnual });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Ingresos totales por sede para el anio seleccionado
exports.getIngresosPorSede = async (req, res) => {
  try {
    const {
      PagoDetalle: TenantPagoDetalle,
      Mensualidad: TenantMensualidad,
      Alumno: TenantAlumno,
      Sede: TenantSede
    } = await getTenantMensualidadModels(req);
    const hoy = new Date();
    const anio = req.query.anio ? Number(req.query.anio) : hoy.getFullYear();

    if (!Number.isInteger(anio) || anio < 2000) {
      return res.status(400).json({ error: 'Año inválido' });
    }

    const inicioAnio = new Date(Date.UTC(anio, 0, 1, 0, 0, 0, 0));
    const finAnio = new Date(Date.UTC(anio + 1, 0, 1, 0, 0, 0, 0));

    const pagos = await TenantPagoDetalle.find({
      $or: [
        { fecha_pago: { $gte: inicioAnio, $lt: finAnio } },
        {
          fecha_pago: { $in: [null, undefined] },
          createdAt: { $gte: inicioAnio, $lt: finAnio }
        }
      ]
    }).select('id_mensualidad monto_pagado').lean();

    if (pagos.length === 0) {
      return res.json({ anio, sedes: [], total_anual: 0 });
    }

    const mensualidadIds = Array.from(
      new Set(pagos.map((pago) => String(pago.id_mensualidad)).filter(Boolean))
    );

    const mensualidades = await TenantMensualidad.find({
      _id: { $in: mensualidadIds }
    }).select('_id id_alumno').lean();

    const mensualidadToAlumno = new Map(
      mensualidades.map((item) => [String(item._id), String(item.id_alumno || '')])
    );

    const alumnoIds = Array.from(
      new Set(mensualidades.map((item) => String(item.id_alumno || '')).filter(Boolean))
    );

    const alumnos = await TenantAlumno.find({
      _id: { $in: alumnoIds }
    }).select('_id sede').lean();

    const alumnoToSede = new Map(
      alumnos.map((item) => [String(item._id), String(item.sede || '')])
    );

    const sedeIds = Array.from(
      new Set(alumnos.map((item) => String(item.sede || '')).filter(Boolean))
    );

    const sedesDocs = await TenantSede.find({
      _id: { $in: sedeIds }
    }).select('_id nombre').lean();

    const sedeNombreMap = new Map(
      sedesDocs.map((item) => [String(item._id), item.nombre || 'Sin sede'])
    );

    const acumuladoPorSede = new Map();
    for (const pago of pagos) {
      const mensualidadId = String(pago.id_mensualidad || '');
      const alumnoId = mensualidadToAlumno.get(mensualidadId);
      const sedeId = alumnoToSede.get(String(alumnoId || ''));
      const key = sedeId || 'sin-sede';
      const nombre = sedeId ? (sedeNombreMap.get(sedeId) || 'Sin sede') : 'Sin sede';
      const monto = redondearMonto(pago.monto_pagado || 0);

      const previo = acumuladoPorSede.get(key) || { sedeId: sedeId || null, sedeNombre: nombre, total_pagado: 0 };
      previo.total_pagado = redondearMonto(previo.total_pagado + monto);
      acumuladoPorSede.set(key, previo);
    }

    const sedes = Array.from(acumuladoPorSede.values()).sort((a, b) => b.total_pagado - a.total_pagado);
    const totalAnual = redondearMonto(sedes.reduce((acc, item) => acc + (Number(item.total_pagado) || 0), 0));

    return res.json({ anio, sedes, total_anual: totalAnual });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
