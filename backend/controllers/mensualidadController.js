const Mensualidad = require('../models/Mensualidad');
const Alumno = require('../models/Alumno');
const Sede = require('../models/Sede');
const Reposo = require('../models/Reposo');
const PagoDetalle = require('../models/PagoDetalle');
const Representante = require('../models/Representante');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

async function getTenantMensualidadModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);

  const TenantRepresentante = getTenantModel(connection, 'Representante');
  const TenantAlumno = getTenantModel(connection, 'Alumno');
  const TenantMensualidad = getTenantModel(connection, 'Mensualidad');
  const TenantPagoDetalle = getTenantModel(connection, 'PagoDetalle');
  const TenantSede = getTenantModel(connection, 'Sede');
  const TenantReposo = getTenantModel(connection, 'Reposo');

  return {
    Representante: TenantRepresentante,
    Alumno: TenantAlumno,
    Mensualidad: TenantMensualidad,
    PagoDetalle: TenantPagoDetalle,
    Sede: TenantSede,
    Reposo: TenantReposo,
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
    Reposo: models.Reposo || Reposo
  };
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

function normalizarFechaOpcional(valor) {
  if (!valor) return undefined;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return undefined;
  return fecha;
}

function resolveTenantId(req) {
  return String(req?.tenantId || process.env.DEFAULT_TENANT_ID || 'villasport')
    .trim()
    .toLowerCase();
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

function obtenerFechaVencimientoPeriodo(mes, anio) {
  return new Date(anio, mes - 1, 5, 23, 59, 59);
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

  const alumno = await AlumnoModel.findById(alumnoId).select('tipo_mensualidad').lean();
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
    montoBaseManual,
    estatusManual,
    fechaVencimientoManual,
    crearPagoSiPagado = false,
    referenciaPago = 'primera-mensualidad',
    metadataInscripcion
  } = {}
) {
  const {
    Mensualidad: MensualidadModel,
    PagoDetalle: PagoDetalleModel
  } = resolveMensualidadModels(models);

  const existente = await MensualidadModel.findOne({
    id_alumno: alumno._id,
    mes: periodo.mes,
    anio: periodo.anio
  }).populate('id_alumno');

  if (existente) {
    return { mensualidad: existente, creada: false, pagoRegistrado: false };
  }

  const fechaVencimiento = fechaVencimientoManual || obtenerFechaVencimientoPeriodo(periodo.mes, periodo.anio);
  const tieneMontoManual = montoBaseManual !== undefined && montoBaseManual !== null;
  const montoBase = tieneMontoManual
    ? redondearMonto(montoBaseManual)
    : await resolverMontoBaseAlumno(alumno, models);

  let monto = montoBase;
  let creditoAplicado = 0;
  let estatus = estatusManual || obtenerEstatusPendientePorVencimiento(fechaVencimiento);

  const reglaReposo = await obtenerReglaReposoParaPeriodo(alumno._id, periodo.mes, periodo.anio, models);
  if (reglaReposo === 'EXENTO_POR_REPOSO') {
    monto = 0;
    estatus = 'Exento por reposo';
  } else if (esTipoMensualidadBecaCompleta(alumno.tipo_mensualidad)) {
    monto = 0;
    estatus = 'Becado';
  } else {
    const credito = await consumirSaldoAFavor(alumno, montoBase);
    creditoAplicado = credito.creditoAplicado;
    monto = credito.montoEsperado;
  }

  const mensualidad = await MensualidadModel.create({
    id_alumno: alumno._id,
    mes: periodo.mes,
    anio: periodo.anio,
    monto_base: montoBase,
    credito_aplicado: creditoAplicado,
    ajuste_extraordinario: 0,
    saldo_a_favor_generado: 0,
    monto_esperado: monto,
    fecha_vencimiento: fechaVencimiento,
    estatus,
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
    monto > 0
  ) {
    const montoPagoInicial = estatusNormalizado === 'pagado'
      ? monto
      : redondearMonto(metadataInscripcion?.montoPagadoUsd || 0);

    if (montoPagoInicial > 0) {
    await PagoDetalleModel.create({
      id_mensualidad: mensualidad._id,
      monto_pagado: montoPagoInicial,
      monto_pagado_bs: metadataInscripcion?.montoPagadoBs,
      monto_esperado_usd: monto,
      monto_esperado_bs: metadataInscripcion?.montoEsperadoBs,
      fecha_pago: metadataInscripcion?.fechaPago || new Date(),
      metodo_pago: metadataInscripcion?.metodoPago || 'Registro inicial admin',
      referencia: metadataInscripcion?.referencia || referenciaPago,
      comprobante_url: metadataInscripcion?.comprobanteUrl
    });
    pagoRegistrado = true;
    }
  }

  const mensualidadPopulada = await MensualidadModel.findById(mensualidad._id).populate('id_alumno');
  return { mensualidad: mensualidadPopulada, creada: true, pagoRegistrado };
}

async function generarMensualidadesPendientesAlumno(
  alumno,
  {
    models = {},
    periodoInicio,
    periodoFin,
    overridePeriodoActual,
    crearPagoSiPagado = false,
    referenciaPago = 'primera-mensualidad'
  } = {}
) {
  const periodoActual = periodoFin || getPeriodoZonaCaracas();
  const periodoInicial = periodoInicio || obtenerPeriodoDesdeFecha(alumno.fecha_inscripcion, periodoActual);
  const periodos = listarPeriodosEntrePeriodos(periodoInicial, periodoActual);
  const resultados = [];

  for (const periodo of periodos) {
    const esPeriodoOverride =
      overridePeriodoActual &&
      periodo.mes === overridePeriodoActual.mes &&
      periodo.anio === overridePeriodoActual.anio;

    resultados.push(
      await crearMensualidadParaPeriodo(alumno, periodo, {
        models,
        montoBaseManual: esPeriodoOverride ? overridePeriodoActual.montoBaseManual : undefined,
        estatusManual: esPeriodoOverride ? overridePeriodoActual.estatusManual : undefined,
        fechaVencimientoManual: esPeriodoOverride ? overridePeriodoActual.fechaVencimientoManual : undefined,
        metadataInscripcion: esPeriodoOverride ? overridePeriodoActual.metadataInscripcion : undefined,
        crearPagoSiPagado: esPeriodoOverride ? crearPagoSiPagado : false,
        referenciaPago
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
    preservarInsolventeSinPagosCuandoMontoCero = false
  } = {}
) {
  const {
    PagoDetalle: PagoDetalleModel,
    Alumno: AlumnoModel
  } = resolveMensualidadModels(models);

  const pagos = await PagoDetalleModel.find({ id_mensualidad: mensualidad._id });
  const tienePagosRegistrados = pagos.length > 0;
  const totalPagado = redondearMonto(
    pagos.reduce((acc, pago) => acc + (Number(pago.monto_pagado) || 0), 0)
  );
  const montoEsperado = redondearMonto(mensualidad.monto_esperado || 0);
  const saldoGeneradoPrevio = redondearMonto(mensualidad.saldo_a_favor_generado || 0);
  const saldoGeneradoNuevo = redondearMonto(Math.max(0, totalPagado - montoEsperado));
  const deltaSaldo = redondearMonto(saldoGeneradoNuevo - saldoGeneradoPrevio);

  if (deltaSaldo !== 0) {
    const alumnoDoc = await AlumnoModel.findById(mensualidad.id_alumno?._id || mensualidad.id_alumno);
    if (alumnoDoc) {
      const saldoActual = redondearMonto(alumnoDoc.saldo_a_favor_mensualidades || 0);
      const saldoResultante = redondearMonto(saldoActual + deltaSaldo);

      if (saldoResultante < 0) {
        throw new Error('El saldo a favor de esta mensualidad ya fue consumido en meses posteriores.');
      }

      alumnoDoc.saldo_a_favor_mensualidades = saldoResultante;
      await alumnoDoc.save();
    }
  }

  mensualidad.saldo_a_favor_generado = saldoGeneradoNuevo;

  const requiereRevisionPagoCompleto = estatusAnterior === 'En revision' || actorRol === 'usuario';
  const estatusAnteriorNormalizado = String(estatusAnterior || '').toLowerCase();
  const estaVencida = mensualidad.fecha_vencimiento ? new Date(mensualidad.fecha_vencimiento) < new Date() : false;
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
    mensualidad.estatus = (esEstatusInsolvente(estatusAnteriorNormalizado) || estaVencida) ? 'Insolvente' : 'Pendiente';
  } else if (totalPagado >= montoEsperado) {
    mensualidad.estatus = requiereRevisionPagoCompleto ? 'En revision' : 'Pagado';
  } else {
    mensualidad.estatus = 'Abono';
  }

  await mensualidad.save();

  return {
    totalPagado,
    restante: redondearMonto(Math.max(0, montoEsperado - totalPagado)),
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
    return 'EXENTO_POR_REPOSO';
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
    return 'EXENTO_POR_REPOSO';
  }

  return 'NORMAL';
}

async function obtenerObjetivoAjustePorSede({ id_sede, mesNumero, anioNumero }, models = {}) {
  const {
    Alumno: AlumnoModel,
    Mensualidad: MensualidadModel
  } = resolveMensualidadModels(models);

  const alumnos = await AlumnoModel.find({
    sede: id_sede,
    activo: { $ne: false },
    dado_de_baja: { $ne: true },
    $or: [
      { tipo_mensualidad: 'monto_sede' },
      { tipo_mensualidad: { $exists: false } }
    ]
  }).select('_id saldo_a_favor_mensualidades');

  if (alumnos.length === 0) {
    return { alumnos: [], mensualidades: [] };
  }

  const mensualidades = await MensualidadModel.find({
    id_alumno: { $in: alumnos.map((alumno) => alumno._id) },
    mes: mesNumero,
    anio: anioNumero
  });

  return { alumnos, mensualidades };
}

function esMensualidadOmitidaAjusteSede(mensualidad) {
  const estatusActual = String(mensualidad.estatus || '').toLowerCase();
  if (estatusActual === 'exonerado' || estatusActual === 'exento por reposo') {
    return true;
  }

  const montoBase = obtenerMontoBaseMensualidad(mensualidad);
  return montoBase <= 0;
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
  const alumnos = await AlumnoModel.find({
    activo: { $ne: false },
    dado_de_baja: { $ne: true }
  });
  let creadas = 0;

  for (const alumno of alumnos) {
    const resultados = await generarMensualidadesPendientesAlumno(alumno, {
      models: options.models,
      periodoFin: periodoActual
    });
    creadas += resultados.filter((resultado) => resultado.creada).length;
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

async function actualizarRetrasadosCore({ force = false, models = {} } = {}) {
  const { Mensualidad: MensualidadModel } = resolveMensualidadModels(models);
  const hoy = new Date();
  if (!force && hoy.getDate() !== 6) return 0;
  const mes = hoy.getMonth() + 1;
  const anio = hoy.getFullYear();
  const result = await MensualidadModel.updateMany(
    { mes, anio, estatus: 'Pendiente', fecha_vencimiento: { $lt: hoy } },
    { $set: { estatus: 'Insolvente' } }
  );
  return result.modifiedCount;
}

// Registrar la primera mensualidad manualmente
exports.registrarPrimeraMensualidad = async (req, res) => {
  try {
    const {
      Alumno: TenantAlumno,
      Mensualidad: TenantMensualidad,
      PagoDetalle: TenantPagoDetalle,
      Sede: TenantSede,
      Reposo: TenantReposo
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
    const resultados = await generarMensualidadesPendientesAlumno(alumno, {
      models: {
        Alumno: TenantAlumno,
        Mensualidad: TenantMensualidad,
        PagoDetalle: TenantPagoDetalle,
        Sede: TenantSede,
        Reposo: TenantReposo
      },
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
      Reposo: TenantReposo
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

    const { mes, anio } = obtenerMesSiguiente(new Date());
    const existente = await TenantMensualidad.findOne({ id_alumno, mes, anio }).populate('id_alumno');
    if (existente) {
      return res.json({
        message: 'La mensualidad del mes siguiente ya existe',
        mensualidad: existente,
        creada: false
      });
    }

    const montoBase = await resolverMontoBaseAlumno(alumno, { Sede: TenantSede });
    let monto = montoBase;
    let creditoAplicado = 0;
    let estatus = 'Pendiente';

    const reglaReposo = await obtenerReglaReposoParaPeriodo(alumno._id, mes, anio, { Reposo: TenantReposo });
    if (reglaReposo === 'EXENTO_POR_REPOSO') {
      monto = 0;
      estatus = 'Exento por reposo';
    } else if (esTipoMensualidadBecaCompleta(alumno.tipo_mensualidad)) {
      monto = 0;
      estatus = 'Becado';
    } else {
      const credito = await consumirSaldoAFavor(alumno, montoBase);
      creditoAplicado = credito.creditoAplicado;
      monto = credito.montoEsperado;
    }

    const mensualidad = await TenantMensualidad.create({
      id_alumno,
      mes,
      anio,
      monto_base: montoBase,
      credito_aplicado: creditoAplicado,
      ajuste_extraordinario: 0,
      saldo_a_favor_generado: 0,
      monto_esperado: monto,
      fecha_vencimiento: obtenerFechaVencimientoPeriodo(mes, anio),
      estatus
    });

    const mensualidadPopulada = await TenantMensualidad.findById(mensualidad._id).populate('id_alumno');
    return res.status(201).json({
      message: 'Mensualidad del mes siguiente creada correctamente',
      mensualidad: mensualidadPopulada,
      creada: true
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Actualizar mensualidades a 'Retrasado' el día 6 si siguen en 'Pendiente'
exports.actualizarRetrasados = async (req, res) => {
  try {
    const tenantModels = await getTenantMensualidadModels(req);
    const actualizadas = await actualizarRetrasadosCore({ models: tenantModels });
    if (!actualizadas) return res.json({ message: 'Solo se ejecuta el día 6' });
    res.json({ message: `Mensualidades actualizadas a Insolvente: ${actualizadas}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.generarMensualidadesMesCore = generarMensualidadesMesCore;
exports.actualizarRetrasadosCore = actualizarRetrasadosCore;

exports.previewAjusteExtraordinarioSede = async (req, res) => {
  try {
    const tenantModels = await getTenantMensualidadModels(req);
    const { id_sede, mes, anio, nuevo_monto } = req.body;

    if (!id_sede || !mes || !anio || nuevo_monto === undefined || nuevo_monto === null || nuevo_monto === '') {
      return res.status(400).json({ error: 'id_sede, mes, anio y nuevo_monto son requeridos' });
    }

    const mesNumero = Number(mes);
    const anioNumero = Number(anio);
    const nuevoMonto = redondearMonto(nuevo_monto);

    if (!Number.isInteger(mesNumero) || mesNumero < 1 || mesNumero > 12) {
      return res.status(400).json({ error: 'Mes inválido' });
    }

    if (!Number.isInteger(anioNumero) || anioNumero < 2000) {
      return res.status(400).json({ error: 'Año inválido' });
    }

    if (nuevoMonto < 0) {
      return res.status(400).json({ error: 'El nuevo monto no puede ser negativo' });
    }

    const { alumnos, mensualidades } = await obtenerObjetivoAjustePorSede({ id_sede, mesNumero, anioNumero }, tenantModels);

    if (alumnos.length === 0) {
      return res.status(404).json({ error: 'No hay alumnos activos con monto por sede en esta sede' });
    }

    if (mensualidades.length === 0) {
      return res.status(404).json({ error: 'No hay mensualidades generadas para esa sede en el periodo indicado' });
    }

    const preview = generarVistaPreviaAjusteSede(mensualidades, nuevoMonto);

    return res.json({
      message: 'Vista previa generada correctamente',
      total_mensualidades_evaluadas: mensualidades.length,
      ...preview,
      nuevo_monto: nuevoMonto,
      mes: mesNumero,
      anio: anioNumero
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.aplicarAjusteExtraordinarioSede = async (req, res) => {
  try {
    const tenantModels = await getTenantMensualidadModels(req);
    const { id_sede, mes, anio, nuevo_monto, descripcion } = req.body;

    if (!id_sede || !mes || !anio || nuevo_monto === undefined || nuevo_monto === null || nuevo_monto === '') {
      return res.status(400).json({ error: 'id_sede, mes, anio y nuevo_monto son requeridos' });
    }

    const mesNumero = Number(mes);
    const anioNumero = Number(anio);
    const nuevoMonto = redondearMonto(nuevo_monto);

    if (!Number.isInteger(mesNumero) || mesNumero < 1 || mesNumero > 12) {
      return res.status(400).json({ error: 'Mes inválido' });
    }

    if (!Number.isInteger(anioNumero) || anioNumero < 2000) {
      return res.status(400).json({ error: 'Año inválido' });
    }

    if (nuevoMonto < 0) {
      return res.status(400).json({ error: 'El nuevo monto no puede ser negativo' });
    }

    const { alumnos, mensualidades } = await obtenerObjetivoAjustePorSede({ id_sede, mesNumero, anioNumero }, tenantModels);

    if (alumnos.length === 0) {
      return res.status(404).json({ error: 'No hay alumnos activos con monto por sede en esta sede' });
    }

    const alumnoMap = new Map(alumnos.map((alumno) => [String(alumno._id), alumno]));

    if (mensualidades.length === 0) {
      return res.status(404).json({ error: 'No hay mensualidades generadas para esa sede en el periodo indicado' });
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
    let omitidas = 0;
    let saldoTotalGenerado = 0;
    let alumnosConSaldoAFavor = 0;

    for (const mensualidad of mensualidades) {
      if (esMensualidadOmitidaAjusteSede(mensualidad)) {
        omitidas += 1;
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

      const resultado = await recalcularMensualidadPorPagos(mensualidad, {
        models: tenantModels,
        actorRol: 'admin',
        estatusAnterior: mensualidad.estatus,
        preservarPagadoSinPagos: true,
        preservarInsolventeSinPagosCuandoMontoCero: true
      });

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

    res.json({
      message: 'Ajuste extraordinario aplicado correctamente',
      mensualidades_actualizadas: actualizadas,
      mensualidades_omitidas: omitidas,
      alumnos_con_saldo_a_favor: alumnosConSaldoAFavor,
      saldo_total_generado: saldoTotalGenerado,
      nuevo_monto: nuevoMonto,
      mes: mesNumero,
      anio: anioNumero
    });
  } catch (err) {
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

      raw.total_pagado = totalPagado;
      raw.saldo_pendiente = saldoPendiente;
      raw.monto_total = redondearMonto(raw.monto_esperado || 0);

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
        $match: {
          'alumno.activo': { $ne: false },
          'alumno.dado_de_baja': { $ne: true }
        }
      },
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
    const { Mensualidad: TenantMensualidad } = await getTenantMensualidadModels(req);
    const hoy = new Date();
    const mes = req.query.mes ? Number(req.query.mes) : hoy.getMonth() + 1;
    const anio = req.query.anio ? Number(req.query.anio) : hoy.getFullYear();

    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      return res.status(400).json({ error: 'Mes inválido' });
    }
    if (!Number.isInteger(anio) || anio < 2000) {
      return res.status(400).json({ error: 'Año inválido' });
    }

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
        $match: {
          'alumno.activo': { $ne: false },
          'alumno.dado_de_baja': { $ne: true }
        }
      },
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
        $lookup: {
          from: 'pagodetalles',
          let: { mensualidadId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$id_mensualidad', '$$mensualidadId'] }
              }
            },
            {
              $group: {
                _id: null,
                total_pagado: { $sum: { $ifNull: ['$monto_pagado', 0] } }
              }
            }
          ],
          as: 'pagos'
        }
      },
      {
        $addFields: {
          total_pagado_mensualidad: {
            $ifNull: [{ $arrayElemAt: ['$pagos.total_pagado', 0] }, 0]
          }
        }
      },
      {
        $group: {
          _id: {
            sedeId: '$sede._id',
            sedeNombre: '$sede.nombre'
          },
          monto_pagado: { $sum: '$total_pagado_mensualidad' }
        }
      },
      {
        $project: {
          _id: 0,
          sedeId: '$_id.sedeId',
          sedeNombre: { $ifNull: ['$_id.sedeNombre', 'Sin sede'] },
          monto_pagado: 1
        }
      },
      { $sort: { sedeNombre: 1 } }
    ];

    const data = await TenantMensualidad.aggregate(pipeline);
    const sedes = data.map((item) => ({
      sedeId: item.sedeId,
      sedeNombre: item.sedeNombre,
      monto_pagado: redondearMonto(item.monto_pagado)
    }));

    return res.json({ mes, anio, sedes });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
