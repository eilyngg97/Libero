// Obtener alumnos por representante
exports.getAlumnosPorRepresentante = async (req, res) => {
  try {
    const { Alumno: TenantAlumno, Representante: TenantRepresentante } = await getTenantAlumnoReadModels(req);
    const esUsuarioFinal = req.user?.rol === 'usuario';
    let alumnos = [];
    const incluirBajas = req.query.incluirBajas === '1';
    const filtroBajas = incluirBajas ? {} : { activo: { $ne: false } };

    if (esUsuarioFinal) {
      const representantes = await TenantRepresentante.find({ usuario: req.user.id }).select('_id');
      const representanteIds = representantes.map((r) => r._id);
      const filtroPropio = [{ usuario: req.user.id }];
      if (representanteIds.length > 0) {
        filtroPropio.push({ representante: { $in: representanteIds } });
      }

      let queryUsuario = TenantAlumno.find({ ...filtroBajas, $or: filtroPropio });
      if (req.query.populateSede === '1') {
        queryUsuario = queryUsuario.populate('sede');
      }
      const propios = await queryUsuario;
      return res.json(propios);
    }

    if (req.params.representanteId && req.params.representanteId !== 'null') {
      let query = TenantAlumno.find({ representante: req.params.representanteId, ...filtroBajas });
      if (req.query.populateSede === '1') {
        query = query.populate('sede');
      }
      alumnos = await query;
    }
    // Si no hay alumnos asociados a representante, buscar por usuario
    if ((!alumnos || alumnos.length === 0) && req.query.usuarioId) {
      let query2 = TenantAlumno.find({ usuario: req.query.usuarioId, ...filtroBajas });
      if (req.query.populateSede === '1') {
        query2 = query2.populate('sede');
      }
      alumnos = await query2;
    }
    res.json(alumnos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener alumnos por representante/usuario' });
  }
};

const Alumno = require('../models/Alumno');
const Representante = require('../models/Representante');
const User = require('../models/User');
const Mensualidad = require('../models/Mensualidad');
const Sede = require('../models/Sede');
const Reposo = require('../models/Reposo');
const PagoDetalle = require('../models/PagoDetalle');
const HistorialEstadoAlumno = require('../models/HistorialEstadoAlumno');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');
const { generarMensualidadesPendientesAlumno } = require('./mensualidadController');

async function getTenantAlumnoReadModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);

  // Registrar modelos referenciados para que populate funcione en la conexion tenant.
  const TenantRepresentante = getTenantModel(connection, 'Representante');
  const TenantSede = getTenantModel(connection, 'Sede');
  const TenantAlumno = getTenantModel(connection, 'Alumno');
  const TenantReposo = getTenantModel(connection, 'Reposo');
  const TenantHistorialEstadoAlumno = getTenantModel(connection, 'HistorialEstadoAlumno');

  return {
    Alumno: TenantAlumno,
    Representante: TenantRepresentante,
    Sede: TenantSede,
    Reposo: TenantReposo,
    HistorialEstadoAlumno: TenantHistorialEstadoAlumno
  };
}

async function getTenantAlumnoWriteModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);

  return {
    Alumno: getTenantModel(connection, 'Alumno'),
    Representante: getTenantModel(connection, 'Representante'),
    User: getTenantModel(connection, 'User'),
    Sede: getTenantModel(connection, 'Sede'),
    Reposo: getTenantModel(connection, 'Reposo'),
    Mensualidad: getTenantModel(connection, 'Mensualidad'),
    PagoDetalle: getTenantModel(connection, 'PagoDetalle'),
    TenantConfig: getTenantModel(connection, 'TenantConfig'),
    HistorialEstadoAlumno: getTenantModel(connection, 'HistorialEstadoAlumno')
  };
}

function buildUploadUrl(req, file, folder) {
  if (!file || !file.filename) return null;
  const tenantId = resolveRequestTenantId(req);
  return `/uploads/${tenantId}/${folder}/${file.filename}`;
}

function normalizarCategoria(valor) {
  return String(valor || '').trim().toUpperCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizarNumeroFranela(valor) {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const nro = Number(valor);
  if (Number.isNaN(nro)) return NaN;
  return nro;
}

async function validarNumeroFranelaDisponible({ numeroFranela, categoria, excludeAlumnoId, AlumnoModel = Alumno }) {
  if (numeroFranela === undefined || numeroFranela === null || numeroFranela === '') return;

  if (!Number.isInteger(numeroFranela) || numeroFranela < 1 || numeroFranela > 100) {
    throw new Error('El nro de franela debe estar entre 1 y 100.');
  }

  const categoriaNormalizada = normalizarCategoria(categoria);
  if (!categoriaNormalizada) {
    throw new Error('La categoria es obligatoria para asignar nro de franela.');
  }

  const filtro = {
    categoria: categoriaNormalizada,
    numero_franela: numeroFranela,
    activo: { $ne: false }
  };

  if (excludeAlumnoId) {
    filtro._id = { $ne: excludeAlumnoId };
  }

  const alumnoExistente = await AlumnoModel.findOne(filtro).select('_id nombres apellidos sede categoria numero_franela');
  if (alumnoExistente) {
    throw new Error(
      `El nro de franela ${numeroFranela} ya esta asignado en la categoria ${categoriaNormalizada} a ${alumnoExistente.nombres} ${alumnoExistente.apellidos}.`
    );
  }
}

function normalizarTipoReposo(tipo) {
  const valor = String(tipo || '').trim().toLowerCase();
  if (valor === 'indefinido') return 'Indefinido';
  if (valor === 'total') return 'Total';
  if (valor === 'parcial') return 'Parcial';
  return null;
}

function normalizarModalidadCobroParcial(modalidad) {
  const valor = String(modalidad || '').trim().toLowerCase();
  if (!valor || valor === 'normal') return 'Normal';
  if (valor === 'prorrateado' || valor === 'prorrateo') return 'Prorrateado';
  return null;
}

function parseDateInput(value) {
  const raw = String(value || '').trim();
  const matchIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (matchIso) {
    const year = Number(matchIso[1]);
    const month = Number(matchIso[2]);
    const day = Number(matchIso[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getPeriodoFromInput(rawValue, parsedDate) {
  const raw = String(rawValue || '').trim();
  const matchIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (matchIso) {
    return {
      mes: Number(matchIso[2]),
      anio: Number(matchIso[1])
    };
  }

  if (parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime())) {
    return {
      mes: parsedDate.getUTCMonth() + 1,
      anio: parsedDate.getUTCFullYear()
    };
  }

  const now = new Date();
  return {
    mes: now.getUTCMonth() + 1,
    anio: now.getUTCFullYear()
  };
}

function redondearMonto(valor) {
  return Number((Number(valor) || 0).toFixed(2));
}

function normalizarMontoOpcional(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return undefined;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return undefined;
  return redondearMonto(numero);
}

function normalizarMontoBsOpcional(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return undefined;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) return undefined;
  return redondearMonto(numero);
}

function metodoRequiereReferencia(metodoPago) {
  const normalizado = String(metodoPago || '').trim().toLowerCase();
  return normalizado === 'pago movil' || normalizado === 'transferencia';
}

function distribuirPagoPorConceptos({
  montoPagadoUsd = 0,
  montoPagadoBs,
  montoReingreso = 0,
  montoMensualidad = 0
}) {
  const pagoUsd = redondearMonto(Math.max(0, montoPagadoUsd || 0));
  const totalEsperadoUsd = redondearMonto((montoReingreso || 0) + (montoMensualidad || 0));
  const pagoBs = Number.isFinite(Number(montoPagadoBs)) ? redondearMonto(montoPagadoBs) : undefined;

  const pagoReingresoUsd = redondearMonto(Math.min(montoReingreso || 0, pagoUsd));
  const pagoMensualidadUsd = redondearMonto(Math.max(0, pagoUsd - pagoReingresoUsd));

  const asignarBs = (montoPagadoConceptoUsd) => {
    if (!Number.isFinite(pagoBs) || pagoUsd <= 0) return undefined;
    return redondearMonto((montoPagadoConceptoUsd / pagoUsd) * pagoBs);
  };

  const reingresoBs = asignarBs(pagoReingresoUsd);
  const mensualidadBs = Number.isFinite(pagoBs)
    ? redondearMonto((pagoBs || 0) - (reingresoBs || 0))
    : undefined;

  return {
    totalEsperadoUsd,
    conceptosDetalle: [
      {
        tipo: 'REINGRESO',
        monto_esperado_usd: redondearMonto(montoReingreso || 0),
        monto_pagado_usd: pagoReingresoUsd,
        monto_esperado_bs: Number.isFinite(pagoBs) && totalEsperadoUsd > 0
          ? redondearMonto(((montoReingreso || 0) / totalEsperadoUsd) * pagoBs)
          : undefined,
        monto_pagado_bs: reingresoBs
      },
      {
        tipo: 'MENSUALIDAD_REINGRESO',
        monto_esperado_usd: redondearMonto(montoMensualidad || 0),
        monto_pagado_usd: pagoMensualidadUsd,
        monto_esperado_bs: Number.isFinite(pagoBs) && totalEsperadoUsd > 0
          ? redondearMonto(((montoMensualidad || 0) / totalEsperadoUsd) * pagoBs)
          : undefined,
        monto_pagado_bs: mensualidadBs
      }
    ]
  };
}

function normalizarMontoParcialPersonalizado(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) return null;
  return redondearMonto(numero);
}

function normalizarListaCertificados(reposo = {}) {
  const lista = [];
  if (Array.isArray(reposo.certificados)) {
    lista.push(...reposo.certificados);
  }
  if (reposo.certificado) {
    lista.push(reposo.certificado);
  }

  const unicos = [];
  const vistos = new Set();
  lista.forEach((item) => {
    const valor = String(item || '').trim();
    if (!valor || vistos.has(valor)) return;
    vistos.add(valor);
    unicos.push(valor);
  });
  return unicos;
}

function extraerArchivosCertificados(req) {
  const archivos = [];
  if (Array.isArray(req?.files?.certificados)) {
    archivos.push(...req.files.certificados);
  }
  if (Array.isArray(req?.files?.certificado)) {
    archivos.push(...req.files.certificado);
  }
  if (req?.file) {
    archivos.push(req.file);
  }
  return archivos;
}

function esEstatusInsolvente(estatus) {
  const normalizado = String(estatus || '').toLowerCase();
  return normalizado === 'retrasado' || normalizado === 'insolvente';
}

function normalizarEstatusTexto(estatus) {
  return String(estatus || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function esEstatusPermitidoParaReposoConImpactoMonto(estatus, { permitirExentoPorReposo = false } = {}) {
  const key = normalizarEstatusTexto(estatus);
  if (key === 'pendiente' || key === 'insolvente' || key === 'retrasado') return true;
  if (permitirExentoPorReposo && key === 'exento por reposo') return true;
  return false;
}

function esTipoMensualidadBecaCompleta(tipoMensualidad) {
  return String(tipoMensualidad || '').toLowerCase() === 'beca_completa';
}

async function obtenerTipoMensualidadAlumnoDesdeMensualidad(mensualidad, models = {}) {
  const AlumnoModel = models.Alumno || Alumno;
  const tipoDesdePopulate = mensualidad?.id_alumno?.tipo_mensualidad;
  if (tipoDesdePopulate !== undefined) {
    return tipoDesdePopulate;
  }

  const alumnoId = mensualidad?.id_alumno?._id || mensualidad?.id_alumno;
  if (!alumnoId) return null;

  const alumno = await AlumnoModel.findById(alumnoId).select('tipo_mensualidad').lean();
  return alumno?.tipo_mensualidad || null;
}

function buildPeriodoKey(mes, anio) {
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

function getPeriodoZonaCaracas() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(now);

  const monthPart = parts.find((p) => p.type === 'month');
  const yearPart = parts.find((p) => p.type === 'year');

  return {
    mes: Number(monthPart?.value || now.getUTCMonth() + 1),
    anio: Number(yearPart?.value || now.getUTCFullYear())
  };
}

async function resolverMontoBaseAlumno(alumno, models = {}) {
  const SedeModel = models.Sede || Sede;
  if (alumno.tipo_mensualidad === 'monto_sede' || !alumno.tipo_mensualidad) {
    const sedeId = alumno.sede && alumno.sede._id ? alumno.sede._id : alumno.sede;
    const sede = await SedeModel.findById(sedeId).select('costo');
    return redondearMonto(sede && sede.costo ? sede.costo : 0);
  }

  if (alumno.tipo_mensualidad === 'monto_personalizado') {
    return redondearMonto(alumno.monto_personalizado_valor || 0);
  }

  return 0;
}

async function recalcularMensualidadPorPagos(mensualidad, estatusAnterior = null, models = {}) {
  const PagoDetalleModel = models.PagoDetalle || PagoDetalle;
  const AlumnoModel = models.Alumno || Alumno;
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

  const estatusAnteriorNormalizado = String(estatusAnterior || '').toLowerCase();
  const estaVencida = mensualidad.fecha_vencimiento ? new Date(mensualidad.fecha_vencimiento) < new Date() : false;
  const estatusActualNormalizado = String(mensualidad.estatus || '').toLowerCase();
  const tipoMensualidadAlumno = await obtenerTipoMensualidadAlumnoDesdeMensualidad(mensualidad, models);
  const esBecado = esTipoMensualidadBecaCompleta(tipoMensualidadAlumno);

  if (esBecado && estatusActualNormalizado !== 'exento por reposo') {
    mensualidad.estatus = 'Becado';
  } else if (montoEsperado <= 0) {
    mensualidad.estatus = totalPagado > 0 ? 'En revision' : 'Pagado';
  } else if (totalPagado <= 0) {
    mensualidad.estatus = (esEstatusInsolvente(estatusAnteriorNormalizado) || estaVencida) ? 'Insolvente' : 'Pendiente';
  } else if (totalPagado >= montoEsperado) {
    mensualidad.estatus = 'Pagado';
  } else {
    mensualidad.estatus = 'Abono';
  }

  await mensualidad.save();
}

async function obtenerReglaReposoParaPeriodo(alumnoId, mes, anio, models = {}) {
  const ReposoModel = models.Reposo || Reposo;
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

  const repososParcialesProrrateados = await ReposoModel.find({
    id_alumno: alumnoId,
    estado: { $ne: 'Inactivo' },
    tipo: 'Parcial',
    modalidad_cobro_parcial: 'Prorrateado',
    fecha_inicio: { $lte: finMes },
    $or: [
      { fecha_fin: null },
      { fecha_fin: { $gte: inicioMes } }
    ]
  }).select('fecha_inicio fecha_fin monto_parcial_personalizado').sort({ fecha_inicio: -1, createdAt: -1 });

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

async function listarPeriodosAfectadosPorReposo(alumnoId, reposo, models = {}) {
  const MensualidadModel = models.Mensualidad || Mensualidad;
  if (!reposo || !reposo.fecha_inicio) return [];

  const tipo = normalizarTipoReposo(reposo.tipo);
  if (!tipo) return [];

  if (tipo === 'Parcial') {
    const modalidad = normalizarModalidadCobroParcial(reposo.modalidad_cobro_parcial);
    if (modalidad !== 'Prorrateado') return [];
    return listarPeriodosEntreFechas(reposo.fecha_inicio, reposo.fecha_fin || reposo.fecha_inicio);
  }

  if (tipo === 'Total') {
    return listarPeriodosEntreFechas(reposo.fecha_inicio, reposo.fecha_fin || reposo.fecha_inicio);
  }

  if (reposo.fecha_fin) {
    return listarPeriodosEntreFechas(reposo.fecha_inicio, reposo.fecha_fin);
  }

  const inicioMes = reposo.fecha_inicio.getUTCMonth() + 1;
  const inicioAnio = reposo.fecha_inicio.getUTCFullYear();
  const mensualidades = await MensualidadModel.find({
    id_alumno: alumnoId,
    $or: [
      { anio: { $gt: inicioAnio } },
      { anio: inicioAnio, mes: { $gte: inicioMes } }
    ]
  }).select('mes anio').lean();

  const periodosMap = new Map();
  periodosMap.set(buildPeriodoKey(inicioMes, inicioAnio), { mes: inicioMes, anio: inicioAnio });
  mensualidades.forEach((mensualidad) => {
    periodosMap.set(buildPeriodoKey(mensualidad.mes, mensualidad.anio), {
      mes: mensualidad.mes,
      anio: mensualidad.anio
    });
  });

  return Array.from(periodosMap.values());
}

async function validarMensualidadesParaReposoConImpactoMonto(alumnoId, reposo, models = {}, options = {}) {
  const MensualidadModel = models.Mensualidad || Mensualidad;
  if (!reposo || !alumnoId) return;

  const estadoReposo = String(reposo.estado || 'Activo').trim().toLowerCase();
  if (estadoReposo === 'inactivo') return;

  const tipo = normalizarTipoReposo(reposo.tipo);
  const modalidad = normalizarModalidadCobroParcial(reposo.modalidad_cobro_parcial);
  const impactaMonto = tipo === 'Total' || (tipo === 'Parcial' && modalidad === 'Prorrateado');
  if (!impactaMonto) return;

  const periodos = await listarPeriodosAfectadosPorReposo(alumnoId, reposo, models);
  if (!periodos.length) return;

  const mensualidades = await MensualidadModel.find({
    id_alumno: alumnoId,
    $or: periodos.map((periodo) => ({ mes: periodo.mes, anio: periodo.anio }))
  }).select('mes anio estatus').lean();

  if (!mensualidades.length) return;

  const invalidas = mensualidades.filter((mensualidad) =>
    !esEstatusPermitidoParaReposoConImpactoMonto(mensualidad.estatus, {
      permitirExentoPorReposo: options.permitirExentoPorReposo === true
    })
  );

  if (!invalidas.length) return;

  const detalle = invalidas
    .map((m) => `${String(m.mes).padStart(2, '0')}/${m.anio} (${m.estatus || 'Sin estatus'})`)
    .join(', ');

  throw new Error(
    `No se puede aplicar reposo ${tipo === 'Total' ? 'total' : 'parcial prorrateado'} porque hay mensualidades afectadas que no estan en Pendiente o Insolvente: ${detalle}.`
  );
}

async function sincronizarMensualidadesAfectadasPorReposos(alumnoId, periodos, models = {}) {
  const AlumnoModel = models.Alumno || Alumno;
  const MensualidadModel = models.Mensualidad || Mensualidad;
  if (!Array.isArray(periodos) || periodos.length === 0) return;

  const alumno = await AlumnoModel.findById(alumnoId).select('sede tipo_mensualidad monto_personalizado_valor');
  if (!alumno) return;

  const periodosUnicos = Array.from(
    new Map(periodos.map((periodo) => [buildPeriodoKey(periodo.mes, periodo.anio), periodo])).values()
  );

  for (const periodo of periodosUnicos) {
    const reglaReposo = await obtenerReglaReposoParaPeriodo(alumnoId, periodo.mes, periodo.anio, models);
    let mensualidad = await MensualidadModel.findOne({ id_alumno: alumnoId, mes: periodo.mes, anio: periodo.anio });

    if (reglaReposo.tipo === 'EXENTO_POR_REPOSO') {
      await upsertMensualidadExentaPorReposo(alumnoId, periodo.mes, periodo.anio, models);
      continue;
    }

    if (!mensualidad) continue;

    const estatusActual = String(mensualidad.estatus || '').toLowerCase();
    if (['pagado', 'exonerado', 'becado'].includes(estatusActual)) continue;

    const montoBaseNormal = await resolverMontoBaseAlumno(alumno, models);
    const montoBase = reglaReposo.tipo === 'PRORRATEO_PARCIAL'
      ? redondearMonto(
          Number.isFinite(Number(reglaReposo.montoPersonalizado))
            ? reglaReposo.montoPersonalizado
            : montoBaseNormal
        )
      : redondearMonto(montoBaseNormal);

    mensualidad.monto_base = montoBase;
    mensualidad.credito_aplicado = redondearMonto(mensualidad.credito_aplicado || 0);
    mensualidad.ajuste_extraordinario = redondearMonto(mensualidad.ajuste_extraordinario || 0);
    mensualidad.monto_esperado = redondearMonto(
      Math.max(0, montoBase - mensualidad.credito_aplicado - mensualidad.ajuste_extraordinario)
    );

    await recalcularMensualidadPorPagos(mensualidad, estatusActual || 'Exento por reposo', models);
  }
}

function listarPeriodosEntreFechas(inicioDate, finDate) {
  const inicio = new Date(Date.UTC(inicioDate.getUTCFullYear(), inicioDate.getUTCMonth(), 1, 12, 0, 0));
  const fin = new Date(Date.UTC(finDate.getUTCFullYear(), finDate.getUTCMonth(), 1, 12, 0, 0));
  const periodos = [];

  const cursor = new Date(inicio);
  while (cursor <= fin) {
    periodos.push({
      mes: cursor.getUTCMonth() + 1,
      anio: cursor.getUTCFullYear()
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return periodos;
}

async function aplicarReposoTotalPorPeriodo(alumnoId, fechaInicio, fechaFin = null, models = {}) {
  if (!(fechaInicio instanceof Date) || Number.isNaN(fechaInicio.getTime())) return;

  const fechaFinal = fechaFin instanceof Date && !Number.isNaN(fechaFin.getTime())
    ? fechaFin
    : fechaInicio;

  const periodos = listarPeriodosEntreFechas(fechaInicio, fechaFinal);
  for (const periodo of periodos) {
    await upsertMensualidadExentaPorReposo(alumnoId, periodo.mes, periodo.anio, models);
  }
}

async function upsertMensualidadExentaPorReposo(alumnoId, mes, anio, models = {}) {
  const MensualidadModel = models.Mensualidad || Mensualidad;
  const fechaVencimiento = new Date(anio, mes - 1, 5, 23, 59, 59);
  await MensualidadModel.findOneAndUpdate(
    { id_alumno: alumnoId, mes, anio, estatus: { $ne: 'Pagado' } },
    {
      $set: {
        monto_esperado: 0,
        estatus: 'Exento por reposo',
        fecha_vencimiento: fechaVencimiento
      }
    },
    {
      upsert: true,
      setDefaultsOnInsert: true,
      new: true
    }
  );
}

async function eliminarUsuarioSiQuedaHuerfano(userId, models = {}) {
  if (!userId) return;

  const AlumnoModel = models.Alumno || Alumno;
  const RepresentanteModel = models.Representante || Representante;
  const UserModel = models.User || User;

  const [alumnoRelacionado, representanteRelacionado] = await Promise.all([
    AlumnoModel.findOne({ usuario: userId }).select('_id'),
    RepresentanteModel.findOne({ usuario: userId }).select('_id')
  ]);

  if (!alumnoRelacionado && !representanteRelacionado) {
    await UserModel.findByIdAndDelete(userId);
  }
}

async function sincronizarUsuarioPortalRepresentante({ representante, cedulaAnterior, cedulaNueva, nombres, apellidos, UserModel = User }) {
  if (!representante || !cedulaNueva) return;

  const nombreCompleto = `${String(nombres || '').trim()} ${String(apellidos || '').trim()}`.trim();
  let user = null;

  if (representante.usuario) {
    user = await UserModel.findById(representante.usuario);
  }

  if (!user) {
    user = await UserModel.findOne({ email: cedulaNueva });
    if (!user) {
      const password = await bcrypt.hash(cedulaNueva, 10);
      user = new UserModel({
        nombre: nombreCompleto,
        email: cedulaNueva,
        password,
        rol: 'usuario'
      });
      await user.save();
    }
    representante.usuario = user._id;
    await representante.save();
    return;
  }

  if (String(user.email || '').trim() !== cedulaNueva) {
    const userConCedulaNueva = await UserModel.findOne({ email: cedulaNueva }).select('_id');
    if (userConCedulaNueva && String(userConCedulaNueva._id) !== String(user._id)) {
      throw new Error('Ya existe un usuario de portal con esa cedula de representante.');
    }

    const cedulaVieja = String(cedulaAnterior || '').trim();
    if (cedulaVieja) {
      const passwordEraCedulaAnterior = await bcrypt.compare(cedulaVieja, user.password);
      if (passwordEraCedulaAnterior) {
        user.password = await bcrypt.hash(cedulaNueva, 10);
      }
    }

    user.email = cedulaNueva;
  }

  if (nombreCompleto) {
    user.nombre = nombreCompleto;
  }
  await user.save();
}

// Obtener todos los alumnos
exports.getAlumnos = async (req, res) => {
  try {
    const {
      Alumno: TenantAlumno,
      Representante: TenantRepresentante,
      Reposo: TenantReposo
    } = await getTenantAlumnoReadModels(req);

    const incluirBajas = req.query.incluirBajas === '1';
    const filtro = incluirBajas ? {} : { activo: { $ne: false } };

    if (req.user?.rol === 'usuario') {
      const representantes = await TenantRepresentante.find({ usuario: req.user.id }).select('_id');
      const representanteIds = representantes.map((r) => r._id);
      const filtroPropio = [{ usuario: req.user.id }];
      if (representanteIds.length > 0) {
        filtroPropio.push({ representante: { $in: representanteIds } });
      }
      filtro.$or = filtroPropio;
    }

    if (req.query.cedula) {
      filtro.cedula = req.query.cedula;
    }
    if (req.query.sede) {
      filtro.sede = req.query.sede;
    }
    const alumnos = await TenantAlumno.find(filtro).populate('representante').populate('sede').lean();

    const alumnoIds = alumnos.map((alumno) => alumno._id);
    const ahora = new Date();
    const repososActivos = alumnoIds.length > 0
      ? await TenantReposo.find({
          id_alumno: { $in: alumnoIds },
          estado: 'Activo',
          fecha_inicio: { $lte: ahora },
          $or: [{ fecha_fin: null }, { fecha_fin: { $gte: ahora } }]
        }).select('id_alumno').lean()
      : [];

    const alumnosConReposoActivo = new Set(
      repososActivos.map((reposo) => String(reposo.id_alumno))
    );

    const resultado = alumnos.map((alumno) => ({
      ...alumno,
      tiene_reposo_activo: alumnosConReposoActivo.has(String(alumno._id))
    }));

    console.log('Alumnos obtenidos:', resultado);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener alumnos' });
  }
};

exports.getEstadisticasInscritosRetirados = async (req, res) => {
  try {
    const { Alumno: TenantAlumno } = await getTenantAlumnoReadModels(req);

    const anioInput = Number(req.query.anio);
    const anioActual = new Date().getUTCFullYear();
    const anio = Number.isInteger(anioInput) ? anioInput : anioActual;

    if (anio < 2000 || anio > 3000) {
      return res.status(400).json({ error: 'El anio es invalido.' });
    }

    const idSede = String(req.query.id_sede || '').trim();
    if (idSede && idSede !== 'all' && !mongoose.Types.ObjectId.isValid(idSede)) {
      return res.status(400).json({ error: 'La sede es invalida.' });
    }

    const filtroSede = idSede && idSede !== 'all'
      ? { sede: new mongoose.Types.ObjectId(idSede) }
      : {};

    const inicioAnio = new Date(Date.UTC(anio, 0, 1, 0, 0, 0, 0));
    const finAnio = new Date(Date.UTC(anio + 1, 0, 1, 0, 0, 0, 0));

    const [inscritos, retirados] = await Promise.all([
      TenantAlumno.find({
        ...filtroSede,
        fecha_inscripcion: { $gte: inicioAnio, $lt: finAnio }
      })
        .select('nombres apellidos foto sede categoria fecha_inscripcion')
        .populate('sede', 'nombre')
        .lean(),
      TenantAlumno.find({
        ...filtroSede,
        fecha_baja: { $gte: inicioAnio, $lt: finAnio }
      })
        .select('nombres apellidos foto sede categoria fecha_baja')
        .populate('sede', 'nombre')
        .lean()
    ]);

    const meses = Array.from({ length: 12 }, (_, index) => ({
      mes: index + 1,
      inscritos: 0,
      retirados: 0,
      detalle: {
        inscritos: [],
        retirados: []
      }
    }));

    const normalizarAlumno = (alumno) => ({
      _id: alumno._id,
      nombres: alumno.nombres || '',
      apellidos: alumno.apellidos || '',
      foto: alumno.foto || '',
      categoria: alumno.categoria || '-',
      sede: alumno?.sede?.nombre || 'Sin sede'
    });

    inscritos.forEach((alumno) => {
      const fecha = new Date(alumno.fecha_inscripcion);
      if (Number.isNaN(fecha.getTime())) return;
      const mesIndex = fecha.getUTCMonth();
      if (mesIndex < 0 || mesIndex > 11) return;

      meses[mesIndex].inscritos += 1;
      meses[mesIndex].detalle.inscritos.push(normalizarAlumno(alumno));
    });

    retirados.forEach((alumno) => {
      const fecha = new Date(alumno.fecha_baja);
      if (Number.isNaN(fecha.getTime())) return;
      const mesIndex = fecha.getUTCMonth();
      if (mesIndex < 0 || mesIndex > 11) return;

      meses[mesIndex].retirados += 1;
      meses[mesIndex].detalle.retirados.push(normalizarAlumno(alumno));
    });

    return res.json({
      anio,
      meses,
      totales: {
        inscritos: inscritos.length,
        retirados: retirados.length
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener estadisticas de alumnos.' });
  }
};

exports.getDisponibilidadNumeroFranela = async (req, res) => {
  try {
    const { Alumno: TenantAlumno } = await getTenantAlumnoReadModels(req);
    const categoria = normalizarCategoria(req.query.categoria);
    if (!categoria) {
      return res.status(400).json({ error: 'La categoria es obligatoria.' });
    }

    const filtro = {
      activo: { $ne: false },
      numero_franela: { $gte: 1, $lte: 100 },
      categoria: { $regex: new RegExp(`^${escapeRegex(categoria)}$`, 'i') }
    };

    const excludeAlumnoId = req.query.excludeAlumnoId;
    if (excludeAlumnoId && mongoose.Types.ObjectId.isValid(excludeAlumnoId)) {
      filtro._id = { $ne: excludeAlumnoId };
    }

    const alumnos = await TenantAlumno.find(filtro).select('numero_franela').lean();
    const ocupadosSet = new Set();

    alumnos.forEach((alumno) => {
      const nro = Number(alumno.numero_franela);
      if (Number.isInteger(nro) && nro >= 1 && nro <= 100) {
        ocupadosSet.add(nro);
      }
    });

    const ocupados = Array.from(ocupadosSet).sort((a, b) => a - b);
    const disponibles = [];
    for (let i = 1; i <= 100; i += 1) {
      if (!ocupadosSet.has(i)) disponibles.push(i);
    }

    return res.json({
      categoria,
      ocupados,
      disponibles,
      totalOcupados: ocupados.length,
      totalDisponibles: disponibles.length
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error al consultar disponibilidad de nro de franela' });
  }
};


// Crear un alumno con representante y usuario
exports.createAlumno = async (req, res) => {
    console.log('BODY recibido:', req.body);
    console.log('FILE recibido:', req.file);
  try {
    const {
      Alumno: TenantAlumno,
      Representante: TenantRepresentante,
      User: TenantUser,
      Sede: TenantSede,
      Reposo: TenantReposo,
      Mensualidad: TenantMensualidad,
      PagoDetalle: TenantPagoDetalle,
      TenantConfig: TenantConfigModel
    } = await getTenantAlumnoWriteModels(req);
    let sedeId = req.body.sede;
    if (typeof sedeId === 'string') {
      try {
        const parsed = JSON.parse(sedeId);
        sedeId = parsed._id || sedeId;
      } catch {
        // Si no es JSON, se asume que es el id directamente
      }
    }

    const fechaInicioCobro = parseDateInput(req.body.fecha_inicio_cobro);
    if (!fechaInicioCobro) {
      return res.status(400).json({ error: 'fecha_inicio_cobro es obligatoria y debe ser valida.' });
    }

    const cedula = (req.body.cedula || '').trim();
    if (cedula && sedeId) {
      const existente = await TenantAlumno.findOne({ cedula, sede: sedeId });
      if (existente) {
        return res.status(409).json({ error: 'Ya existe un alumno con esa cedula en esta sede.' });
      }
    }
    // Permitir crear alumno sin representante si no se envían datos de representante
    let representante = null;
    let user = null;
    const tieneDatosRepresentante = req.body.rep_cedula && req.body.rep_nombres && req.body.rep_apellidos;
    if (tieneDatosRepresentante) {
      // Validar campos obligatorios de representante
      const requiredRepFields = [
        'rep_nombres', 'rep_apellidos', 'rep_cedula'
      ];
      const missingRepFields = requiredRepFields.filter(f => !req.body[f] || req.body[f].trim() === '');
      if (missingRepFields.length > 0) {
        return res.status(400).json({ error: 'Faltan campos obligatorios del representante', detalle: missingRepFields });
      }
      const repData = {
        nombres: req.body.rep_nombres,
        apellidos: req.body.rep_apellidos,
        cedula: req.body.rep_cedula,
        telefono: req.body.rep_telefono,
        domicilio: req.body.rep_domicilio || ''
      };
      representante = await TenantRepresentante.findOne({ cedula: repData.cedula });
      user = await TenantUser.findOne({ email: repData.cedula });
      // Si no existe el usuario, crearlo
      if (!user) {
        const password = await bcrypt.hash(repData.cedula, 10);
        user = new TenantUser({
          nombre: repData.nombres + ' ' + repData.apellidos,
          email: repData.cedula, // ahora el email es la cédula
          password,
          rol: 'usuario'
        });
        await user.save();
      }
      // Si no existe el representante, crearlo y asociar el usuario
      if (!representante) {
        representante = new TenantRepresentante({ ...repData, usuario: user._id });
        await representante.save();
      } else if (!representante.usuario) {
        // Si el representante existe pero no tiene usuario asociado, actualizarlo
        representante.usuario = user._id;
        await representante.save();
      }
    } else {
      // Si no hay datos de representante, crear usuario con la cédula del alumno y asociar al alumno
      if (req.body.cedula && req.body.nombres && req.body.apellidos) {
        user = await TenantUser.findOne({ email: req.body.cedula });
        if (!user) {
          const password = await bcrypt.hash(req.body.cedula, 10);
          user = new TenantUser({
            nombre: req.body.nombres + ' ' + req.body.apellidos,
            email: req.body.cedula,
            password,
            rol: 'usuario'
          });
          await user.save();
        }
      }
      

    }



    // 3. Crear alumno con referencia al representante
    const alumnoData = {
      ...req.body,
      fecha_inicio_cobro: fechaInicioCobro,
      sede: sedeId,
      representante: representante ? representante._id : undefined,
      usuario: user ? user._id : undefined,
      cedula
    };
    if (alumnoData.categoria !== undefined) {
      alumnoData.categoria = normalizarCategoria(alumnoData.categoria);
    }
    if (Object.prototype.hasOwnProperty.call(alumnoData, 'numero_franela')) {
      const nro = normalizarNumeroFranela(alumnoData.numero_franela);
      if (nro === undefined) {
        delete alumnoData.numero_franela;
      } else {
        alumnoData.numero_franela = nro;
      }
    }
    await validarNumeroFranelaDisponible({
      numeroFranela: alumnoData.numero_franela,
      categoria: alumnoData.categoria,
      AlumnoModel: TenantAlumno
    });
    if (alumnoData.habilitar_pago_cuotas !== undefined) {
      alumnoData.habilitar_pago_cuotas = alumnoData.habilitar_pago_cuotas === true || alumnoData.habilitar_pago_cuotas === 'true';
    }
    if (alumnoData.aplicar_recargo_mensualidad !== undefined) {
      alumnoData.aplicar_recargo_mensualidad =
        alumnoData.aplicar_recargo_mensualidad === true || alumnoData.aplicar_recargo_mensualidad === 'true';
    }
    if (alumnoData.etiquetas) {
      if (typeof alumnoData.etiquetas === 'string') {
        try {
          alumnoData.etiquetas = JSON.parse(alumnoData.etiquetas);
        } catch {
          alumnoData.etiquetas = [alumnoData.etiquetas];
        }
      }
      if (!Array.isArray(alumnoData.etiquetas)) {
        alumnoData.etiquetas = [];
      }
    }
    // Eliminar los campos de representante del body para evitar duplicidad
    delete alumnoData.rep_nombres;
    delete alumnoData.rep_apellidos;
    delete alumnoData.rep_cedula;
    delete alumnoData.rep_parentesco;
    delete alumnoData.rep_telefono;
    delete alumnoData.rep_domicilio;

    // Si hay archivo de foto, guardar solo la URL pública
    if (req.files && req.files['foto'] && req.files['foto'][0]) {
      const fotoFile = req.files['foto'][0];
      alumnoData.foto = buildUploadUrl(req, fotoFile, 'alumnos');
    }
    // Si hay archivo de foto_cedula, guardar solo la URL pública
    if (req.files && req.files['foto_cedula'] && req.files['foto_cedula'][0]) {
      const cedulaFile = req.files['foto_cedula'][0];
      alumnoData.foto_cedula = buildUploadUrl(req, cedulaFile, 'alumnos');
    }

    const alumno = new TenantAlumno(alumnoData);
    await alumno.save();

    if (esTipoMensualidadBecaCompleta(alumno.tipo_mensualidad)) {
      try {
        await generarMensualidadesPendientesAlumno(alumno, {
          models: {
            Alumno: TenantAlumno,
            Mensualidad: TenantMensualidad,
            PagoDetalle: TenantPagoDetalle,
            Sede: TenantSede,
            Reposo: TenantReposo,
            TenantConfig: TenantConfigModel
          }
        });
      } catch (errGeneracionBeca) {
        await alumno.deleteOne().catch(() => {});
        throw new Error(`No se pudo generar mensualidades inmediatas para alumno becado: ${errGeneracionBeca.message}`);
      }
    }

    res.status(201).json(alumno);
  } catch (err) {
    console.error('Error al crear alumno:', err);
    res.status(400).json({ error: 'Error al crear alumno', detalle: err.message });
  }
};

// Obtener un alumno por ID
exports.getAlumnoById = async (req, res) => {
  try {
    const { Alumno: TenantAlumno } = await getTenantAlumnoReadModels(req);
    const alumno = await TenantAlumno.findById(req.params.id).populate('representante').populate('sede');
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
    res.json(alumno);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener alumno' });
  }
};

// Actualizar un alumno
exports.updateAlumno = async (req, res) => {
  try {
    const tenantModels = await getTenantAlumnoWriteModels(req);
    const {
      Alumno: TenantAlumno,
      Representante: TenantRepresentante,
      User: TenantUser,
      Sede: TenantSede,
      Mensualidad: TenantMensualidad,
      PagoDetalle: TenantPagoDetalle,
      Reposo: TenantReposo
    } = tenantModels;

    const alumnoActual = await TenantAlumno.findById(req.params.id).select('_id categoria numero_franela nombres apellidos cedula usuario representante');
    if (!alumnoActual) return res.status(404).json({ error: 'Alumno no encontrado' });

    let updateData = { ...req.body };

    if (req.body.fecha_inicio_cobro !== undefined) {
      const fechaInicioCobro = parseDateInput(req.body.fecha_inicio_cobro);
      if (!fechaInicioCobro) {
        return res.status(400).json({ error: 'fecha_inicio_cobro es obligatoria y debe ser valida.' });
      }
      updateData.fecha_inicio_cobro = fechaInicioCobro;
    }

    let sedeId = updateData.sede;
    if (typeof sedeId === 'string') {
      try {
        const parsed = JSON.parse(sedeId);
        sedeId = parsed._id || sedeId;
      } catch {
        // Si no es JSON, se asume que es el id directamente
      }
    }
    updateData.sede = sedeId;
    const repNombresInput = req.body.rep_nombres !== undefined ? String(req.body.rep_nombres || '').trim() : undefined;
    const repApellidosInput = req.body.rep_apellidos !== undefined ? String(req.body.rep_apellidos || '').trim() : undefined;
    const repCedulaInput = req.body.rep_cedula !== undefined ? String(req.body.rep_cedula || '').trim() : undefined;
    const repTelefonoInput = req.body.rep_telefono !== undefined ? String(req.body.rep_telefono || '').trim() : undefined;
    const repDomicilioInput = req.body.rep_domicilio !== undefined ? String(req.body.rep_domicilio || '').trim() : undefined;

    const hayCambiosRepresentante =
      repNombresInput !== undefined ||
      repApellidosInput !== undefined ||
      repCedulaInput !== undefined ||
      repTelefonoInput !== undefined ||
      repDomicilioInput !== undefined;

    delete updateData.rep_nombres;
    delete updateData.rep_apellidos;
    delete updateData.rep_cedula;
    delete updateData.rep_telefono;
    delete updateData.rep_domicilio;

    if (hayCambiosRepresentante) {
      const representanteObjetivoId = updateData.representante !== undefined
        ? updateData.representante
        : alumnoActual.representante;

      if (!representanteObjetivoId) {
        return res.status(400).json({ error: 'No se puede actualizar datos de representante porque el alumno no tiene representante asociado.' });
      }

      const representanteActual = await TenantRepresentante.findById(representanteObjetivoId);
      if (!representanteActual) {
        return res.status(404).json({ error: 'Representante no encontrado para actualizar sus datos.' });
      }

      const cedulaAnteriorRepresentante = String(representanteActual.cedula || '').trim();
      const cedulaNuevaRepresentante = repCedulaInput !== undefined ? repCedulaInput : cedulaAnteriorRepresentante;
      const nombresNuevosRepresentante = repNombresInput !== undefined ? repNombresInput : String(representanteActual.nombres || '').trim();
      const apellidosNuevosRepresentante = repApellidosInput !== undefined ? repApellidosInput : String(representanteActual.apellidos || '').trim();

      if (!cedulaNuevaRepresentante || !nombresNuevosRepresentante || !apellidosNuevosRepresentante) {
        return res.status(400).json({ error: 'Nombre, apellido y cedula del representante son obligatorios.' });
      }

      if (cedulaNuevaRepresentante !== cedulaAnteriorRepresentante) {
        const representanteDuplicado = await TenantRepresentante.findOne({
          cedula: cedulaNuevaRepresentante,
          _id: { $ne: representanteActual._id }
        }).select('_id');

        if (representanteDuplicado) {
          return res.status(409).json({ error: 'Ya existe otro representante con esa cedula.' });
        }
      }

      representanteActual.nombres = nombresNuevosRepresentante;
      representanteActual.apellidos = apellidosNuevosRepresentante;
      representanteActual.cedula = cedulaNuevaRepresentante;
      if (repTelefonoInput !== undefined) {
        representanteActual.telefono = repTelefonoInput;
      }
      if (repDomicilioInput !== undefined) {
        representanteActual.domicilio = repDomicilioInput;
      }
      await sincronizarUsuarioPortalRepresentante({
        representante: representanteActual,
        cedulaAnterior: cedulaAnteriorRepresentante,
        cedulaNueva: cedulaNuevaRepresentante,
        nombres: nombresNuevosRepresentante,
        apellidos: apellidosNuevosRepresentante,
        UserModel: TenantUser
      });
      await representanteActual.save();
    }

    if (req.body.cedula !== undefined) {
      updateData.cedula = String(req.body.cedula || '').trim();
    }
    if (updateData.categoria !== undefined) {
      updateData.categoria = normalizarCategoria(updateData.categoria);
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'numero_franela')) {
      const nro = normalizarNumeroFranela(updateData.numero_franela);
      updateData.numero_franela = nro === undefined ? null : nro;
    }
    const cambiaNumeroOCategoria = updateData.numero_franela !== undefined || updateData.categoria !== undefined;
    if (cambiaNumeroOCategoria) {
      const categoriaObjetivo = updateData.categoria !== undefined
        ? updateData.categoria
        : alumnoActual.categoria;
      const numeroObjetivo = updateData.numero_franela !== undefined
        ? updateData.numero_franela
        : alumnoActual.numero_franela;

      await validarNumeroFranelaDisponible({
        numeroFranela: numeroObjetivo,
        categoria: categoriaObjetivo,
        excludeAlumnoId: alumnoActual._id,
        AlumnoModel: TenantAlumno
      });
    }
    if (updateData.habilitar_pago_cuotas !== undefined) {
      updateData.habilitar_pago_cuotas = updateData.habilitar_pago_cuotas === true || updateData.habilitar_pago_cuotas === 'true';
    }
    if (updateData.aplicar_recargo_mensualidad !== undefined) {
      updateData.aplicar_recargo_mensualidad =
        updateData.aplicar_recargo_mensualidad === true || updateData.aplicar_recargo_mensualidad === 'true';
    }
    if (updateData.etiquetas) {
      if (typeof updateData.etiquetas === 'string') {
        try {
          updateData.etiquetas = JSON.parse(updateData.etiquetas);
        } catch {
          updateData.etiquetas = [updateData.etiquetas];
        }
      }
      if (!Array.isArray(updateData.etiquetas)) {
        updateData.etiquetas = [];
      }
    }
    // Si hay archivo de foto, guardar solo la URL pública
    if (req.files && req.files['foto'] && req.files['foto'][0]) {
      const fotoFile = req.files['foto'][0];
      updateData.foto = buildUploadUrl(req, fotoFile, 'alumnos');
    }
    // Si hay archivo de foto_cedula, guardar solo la URL pública
    if (req.files && req.files['foto_cedula'] && req.files['foto_cedula'][0]) {
      const cedulaFile = req.files['foto_cedula'][0];
      updateData.foto_cedula = buildUploadUrl(req, cedulaFile, 'alumnos');
    }

    const cedulaObjetivo = updateData.cedula !== undefined
      ? String(updateData.cedula || '').trim()
      : String(alumnoActual.cedula || '').trim();
    const nombresObjetivo = String(updateData.nombres ?? alumnoActual.nombres ?? '').trim();
    const apellidosObjetivo = String(updateData.apellidos ?? alumnoActual.apellidos ?? '').trim();
    const representanteObjetivo = updateData.representante !== undefined
      ? updateData.representante
      : alumnoActual.representante;
    const usuarioObjetivo = updateData.usuario !== undefined
      ? updateData.usuario
      : alumnoActual.usuario;

    const sinRepresentante = !representanteObjetivo;
    const sinUsuario = !usuarioObjetivo;

    // Si el alumno no tiene representante, al completar cédula en edición se crea su usuario de portal.
    if (sinRepresentante && sinUsuario && cedulaObjetivo && nombresObjetivo && apellidosObjetivo) {
      let user = await TenantUser.findOne({ email: cedulaObjetivo });
      if (!user) {
        const password = await bcrypt.hash(cedulaObjetivo, 10);
        user = new TenantUser({
          nombre: `${nombresObjetivo} ${apellidosObjetivo}`.trim(),
          email: cedulaObjetivo,
          password,
          rol: 'usuario'
        });
        await user.save();
      }
      updateData.usuario = user._id;
    }

    const alumno = await TenantAlumno.findByIdAndUpdate(req.params.id, updateData, { new: true });
    const debeRecalcularMonto =
      updateData.tipo_mensualidad !== undefined ||
      updateData.monto_personalizado_valor !== undefined ||
      updateData.sede !== undefined;
    if (debeRecalcularMonto) {
      const { mes, anio } = getPeriodoZonaCaracas();
      let monto = 0;
      if (alumno.tipo_mensualidad === 'monto_sede' || !alumno.tipo_mensualidad) {
        const sede = await TenantSede.findById(alumno.sede);
        monto = sede && sede.costo ? sede.costo : 0;
      } else if (alumno.tipo_mensualidad === 'monto_personalizado') {
        monto = alumno.monto_personalizado_valor || 0;
      } else if (alumno.tipo_mensualidad === 'beca_completa') {
        monto = 0;
      }
      const mensualidadesPeriodo = await TenantMensualidad.find({
        id_alumno: alumno._id,
        mes,
        anio,
        estatus: { $nin: ['Pagado', 'Exonerado', 'Exento por reposo'] }
      });

      for (const mensualidad of mensualidadesPeriodo) {
        mensualidad.monto_esperado = redondearMonto(monto);
        const estatusAnteriorMensualidad = mensualidad.estatus;
        await recalcularMensualidadPorPagos(mensualidad, estatusAnteriorMensualidad, {
          Alumno: TenantAlumno,
          Representante: TenantRepresentante,
          User: TenantUser,
          Sede: TenantSede,
          Mensualidad: TenantMensualidad,
          PagoDetalle: TenantPagoDetalle,
          Reposo: TenantReposo
        });
      }
    }
    res.json(alumno);
  } catch (err) {
    console.error('Error al actualizar alumno:', {
      alumnoId: req.params.id,
      name: err?.name,
      message: err?.message,
      code: err?.code
    });
    res.status(400).json({
      error: 'Error al actualizar alumno',
      detalle: err?.message || 'Error desconocido al actualizar alumno',
      tipo: err?.name || 'Error'
    });
  }
};

// Eliminar un alumno
exports.deleteAlumno = async (req, res) => {
  try {
    const { Alumno: TenantAlumno, Representante: TenantRepresentante, User: TenantUser } = await getTenantAlumnoWriteModels(req);
    const alumno = await TenantAlumno.findByIdAndDelete(req.params.id);
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    if (alumno.representante) {
      const otroAlumnoConRepresentante = await TenantAlumno.findOne({ representante: alumno.representante }).select('_id');

      if (!otroAlumnoConRepresentante) {
        const representante = await TenantRepresentante.findByIdAndDelete(alumno.representante);
        if (representante?.usuario) {
          await eliminarUsuarioSiQuedaHuerfano(representante.usuario, {
            Alumno: TenantAlumno,
            Representante: TenantRepresentante,
            User: TenantUser
          });
        }
      }
    }

    if (alumno.usuario) {
      await eliminarUsuarioSiQuedaHuerfano(alumno.usuario, {
        Alumno: TenantAlumno,
        Representante: TenantRepresentante,
        User: TenantUser
      });
    }

    res.json({ message: 'Alumno eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar alumno' });
  }
};

// Dar de baja un alumno (baja lógica)
exports.darDeBajaAlumno = async (req, res) => {
  try {
    const {
      Alumno: TenantAlumno,
      HistorialEstadoAlumno: TenantHistorialEstadoAlumno
    } = await getTenantAlumnoWriteModels(req);
    const { motivo_baja } = req.body || {};
    const fechaBaja = new Date();
    const alumno = await TenantAlumno.findByIdAndUpdate(
      req.params.id,
      {
        activo: false,
        dado_de_baja: true,
        estado: 'Baja',
        fecha_baja: fechaBaja,
        ...(motivo_baja ? { motivo_baja } : {})
      },
      { new: true }
    );
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    await TenantHistorialEstadoAlumno.create({
      id_alumno: alumno._id,
      tipo_movimiento: 'BAJA',
      fecha_evento: fechaBaja,
      motivo: motivo_baja ? String(motivo_baja).trim() : undefined,
      actor_id: req.user?.id || undefined,
      metadata: {
        estado_resultante: 'Baja'
      }
    });

    res.json({ message: 'Alumno dado de baja', alumno });
  } catch (err) {
    res.status(400).json({ error: 'Error al dar de baja al alumno' });
  }
};

// Reactivar un alumno (revertir baja)
exports.reactivarAlumno = async (req, res) => {
  try {
    const {
      Alumno: TenantAlumno,
      Mensualidad: TenantMensualidad,
      PagoDetalle: TenantPagoDetalle,
      HistorialEstadoAlumno: TenantHistorialEstadoAlumno
    } = await getTenantAlumnoWriteModels(req);

    const alumnoActual = await TenantAlumno.findById(req.params.id).populate('sede');
    if (!alumnoActual) return res.status(404).json({ error: 'Alumno no encontrado' });
    if (alumnoActual.activo !== false && alumnoActual.dado_de_baja !== true) {
      return res.status(400).json({ error: 'El alumno ya se encuentra activo.' });
    }

    const montoReingreso = normalizarMontoOpcional(req.body?.monto_reingreso);
    const montoMensualidad = normalizarMontoOpcional(req.body?.monto_mensualidad);
    const montoPagadoUsd = normalizarMontoOpcional(req.body?.monto_pagado);
    const montoPagadoBs = normalizarMontoBsOpcional(req.body?.monto_pagado_bs);
    const montoEsperadoBs = normalizarMontoBsOpcional(req.body?.monto_esperado_bs);
    const metodoPago = String(req.body?.metodo_pago || '').trim();
    const referencia = String(req.body?.referencia || '').trim();
    const comentarioReingreso = String(req.body?.comentario_reingreso || '').trim();
    const fechaPago = parseDateInput(req.body?.fecha_pago) || new Date();

    if (!Number.isFinite(montoReingreso) || montoReingreso <= 0) {
      return res.status(400).json({ error: 'monto_reingreso invalido' });
    }
    if (!Number.isFinite(montoMensualidad) || montoMensualidad <= 0) {
      return res.status(400).json({ error: 'monto_mensualidad invalido' });
    }
    if (!metodoPago) {
      return res.status(400).json({ error: 'metodo_pago es requerido' });
    }
    if (metodoRequiereReferencia(metodoPago) && !/^[0-9]{6,}$/.test(referencia)) {
      return res.status(400).json({ error: 'La referencia de pago debe tener minimo 6 digitos.' });
    }

    const totalEsperado = redondearMonto(montoReingreso + montoMensualidad);
    const totalPagado = redondearMonto(Math.max(0, montoPagadoUsd || 0));
    const { mes, anio } = getPeriodoZonaCaracas();

    const mensualidadExistente = await TenantMensualidad.findOne({
      id_alumno: alumnoActual._id,
      mes,
      anio
    });

    if (mensualidadExistente) {
      return res.status(409).json({
        error: 'Ya existe una mensualidad para el periodo actual. No se puede registrar reingreso duplicado.'
      });
    }

    const fechaVencimiento = new Date(anio, mes - 1, 5, 23, 59, 59);
    const estatusSolicitado = String(req.body?.estatus || '').trim();
    let estatusInicial = estatusSolicitado || 'Pendiente';
    if (totalPagado > 0 && totalPagado < totalEsperado) {
      estatusInicial = 'Abono';
    } else if (totalPagado >= totalEsperado) {
      estatusInicial = 'Pagado';
    }

    const comprobanteUrl = req.file
      ? `/uploads/${resolveRequestTenantId(req)}/comprobantes/${req.file.filename}`
      : undefined;

    const mensualidad = await TenantMensualidad.create({
      id_alumno: alumnoActual._id,
      mes,
      anio,
      monto_base: totalEsperado,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      saldo_a_favor_generado: 0,
      monto_esperado: totalEsperado,
      monto_reingreso: montoReingreso,
      monto_mensualidad_reingreso: montoMensualidad,
      tipo_registro_inicial: 'reingreso',
      monto_equivalente_bs: montoEsperadoBs,
      fecha_pago: fechaPago,
      metodo_pago: metodoPago,
      referencia: referencia || undefined,
      comprobante_url: comprobanteUrl,
      fecha_vencimiento: fechaVencimiento,
      estatus: estatusInicial
    });

    let pagoRegistrado = null;
    if (totalPagado > 0) {
      const distribucion = distribuirPagoPorConceptos({
        montoPagadoUsd: totalPagado,
        montoPagadoBs,
        montoReingreso,
        montoMensualidad
      });

      pagoRegistrado = await TenantPagoDetalle.create({
        id_mensualidad: mensualidad._id,
        concepto: 'Reingreso alumno',
        origen: 'reactivacion',
        conceptos_detalle: distribucion.conceptosDetalle,
        monto_pagado: totalPagado,
        monto_pagado_bs: montoPagadoBs,
        monto_esperado_usd: totalEsperado,
        monto_esperado_bs: montoEsperadoBs,
        fecha_pago: fechaPago,
        metodo_pago: metodoPago,
        referencia: referencia || 'reingreso',
        comprobante_url: comprobanteUrl
      });
    }

    await recalcularMensualidadPorPagos(mensualidad, estatusInicial, {
      Alumno: TenantAlumno,
      Mensualidad: TenantMensualidad,
      PagoDetalle: TenantPagoDetalle
    });

    const alumno = await TenantAlumno.findByIdAndUpdate(
      req.params.id,
      {
        activo: true,
        dado_de_baja: false,
        estado: 'Activo'
      },
      { new: true }
    );

    await TenantHistorialEstadoAlumno.create({
      id_alumno: alumno._id,
      tipo_movimiento: 'REINGRESO',
      fecha_evento: new Date(),
      motivo: 'Reingreso administrativo',
      comentario: comentarioReingreso || undefined,
      actor_id: req.user?.id || undefined,
      metadata: {
        monto_reingreso: montoReingreso,
        monto_mensualidad: montoMensualidad,
        monto_total_esperado: totalEsperado,
        monto_total_pagado: totalPagado,
        metodo_pago: metodoPago,
        referencia: referencia || undefined,
        mensualidad_id: mensualidad?._id,
        pago_id: pagoRegistrado?._id || undefined
      }
    });

    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
    res.json({
      message: 'Alumno reactivado y reingreso registrado',
      alumno,
      mensualidad,
      pago: pagoRegistrado
    });
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Error al reactivar al alumno' });
  }
};

// Listar historial de estados (bajas y reingresos) de un alumno
exports.getHistorialEstadosAlumno = async (req, res) => {
  try {
    const {
      Alumno: TenantAlumno,
      HistorialEstadoAlumno: TenantHistorialEstadoAlumno
    } = await getTenantAlumnoReadModels(req);

    const alumno = await TenantAlumno.findById(req.params.id).select('_id');
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const historial = await TenantHistorialEstadoAlumno.find({
      id_alumno: alumno._id,
      tipo_movimiento: { $in: ['BAJA', 'REINGRESO', 'REACTIVACION'] }
    })
      .select('tipo_movimiento fecha_evento motivo comentario metadata createdAt')
      .sort({ fecha_evento: -1, createdAt: -1 })
      .lean();

    return res.json(historial);
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener historial de estados del alumno' });
  }
};

// Listar historial de reposos de un alumno
exports.getRepososAlumno = async (req, res) => {
  try {
    const { Alumno: TenantAlumno, Reposo: TenantReposo } = await getTenantAlumnoWriteModels(req);
    const alumno = await TenantAlumno.findById(req.params.id);
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const reposos = await TenantReposo.find({ id_alumno: alumno._id }).sort({ fecha_inicio: -1, createdAt: -1 });
    const repososNormalizados = reposos.map((reposoDoc) => {
      const reposo = reposoDoc.toObject ? reposoDoc.toObject() : reposoDoc;
      const tipo = normalizarTipoReposo(reposo.tipo) || reposo.tipo;
      const montoProrrateo = normalizarMontoParcialPersonalizado(reposo.monto_parcial_personalizado);

      let modalidad = normalizarModalidadCobroParcial(reposo.modalidad_cobro_parcial);
      if (tipo === 'Parcial' && !modalidad && montoProrrateo !== null) {
        modalidad = 'Prorrateado';
      }

      return {
        ...reposo,
        tipo,
        modalidad_cobro_parcial: tipo === 'Parcial' ? (modalidad || 'Normal') : 'Normal',
        monto_parcial_personalizado: tipo === 'Parcial' ? montoProrrateo : null,
        certificados: normalizarListaCertificados(reposo),
        certificado: reposo.certificado || null
      };
    });

    res.json(repososNormalizados);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener reposos del alumno' });
  }
};

// Registrar reposo y aplicar lógica de mensualidad según tipo
exports.registrarReposoAlumno = async (req, res) => {
  try {
    const tenantModels = await getTenantAlumnoWriteModels(req);
    const {
      Alumno: TenantAlumno,
      Reposo: TenantReposo,
      Mensualidad: TenantMensualidad,
      Sede: TenantSede,
      PagoDetalle: TenantPagoDetalle
    } = tenantModels;
    const alumno = await TenantAlumno.findById(req.params.id);
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const fecha_inicio_raw = req.body.fecha_inicio || req.body.fechaInicio;
    const tipo_raw = req.body.tipo;

    if (!fecha_inicio_raw || !tipo_raw) {
      return res.status(400).json({ error: 'Los campos obligatorios son fecha_inicio y tipo' });
    }

    const tipo = normalizarTipoReposo(tipo_raw);
    if (!tipo) {
      return res.status(400).json({ error: 'Tipo de reposo inválido. Valores permitidos: Indefinido, Total, Parcial' });
    }

    const modalidadCobroParcial = tipo === 'Parcial'
      ? normalizarModalidadCobroParcial(req.body.modalidad_cobro_parcial || req.body.modalidadCobroParcial)
      : 'Normal';

    if (!modalidadCobroParcial) {
      return res.status(400).json({ error: 'modalidad_cobro_parcial inválida. Valores permitidos: Normal, Prorrateado' });
    }

    const montoParcialRaw = req.body.monto_parcial_personalizado ?? req.body.montoParcialPersonalizado;
    const montoParcialPersonalizado = tipo === 'Parcial' && modalidadCobroParcial === 'Prorrateado'
      ? normalizarMontoParcialPersonalizado(montoParcialRaw)
      : null;

    if (
      tipo === 'Parcial' &&
      modalidadCobroParcial === 'Prorrateado' &&
      (montoParcialRaw === undefined || montoParcialRaw === null || String(montoParcialRaw).trim() === '')
    ) {
      return res.status(400).json({ error: 'monto_parcial_personalizado es obligatorio para reposo parcial prorrateado.' });
    }

    if (
      tipo === 'Parcial' &&
      modalidadCobroParcial === 'Prorrateado' &&
      montoParcialRaw !== undefined &&
      montoParcialRaw !== null &&
      String(montoParcialRaw).trim() !== '' &&
      montoParcialPersonalizado === null
    ) {
      return res.status(400).json({ error: 'monto_parcial_personalizado inválido. Debe ser un número mayor o igual a 0.' });
    }

    const fecha_inicio = parseDateInput(fecha_inicio_raw);
    if (!fecha_inicio) {
      return res.status(400).json({ error: 'fecha_inicio inválida' });
    }

    let fecha_fin = null;
    if (req.body.fecha_fin || req.body.fechaFin) {
      fecha_fin = parseDateInput(req.body.fecha_fin || req.body.fechaFin);
      if (!fecha_fin) {
        return res.status(400).json({ error: 'fecha_fin inválida' });
      }
      if (fecha_fin.getTime() < fecha_inicio.getTime()) {
        return res.status(400).json({ error: 'fecha_fin no puede ser anterior a fecha_inicio' });
      }
    }

    try {
      await validarMensualidadesParaReposoConImpactoMonto(
        alumno._id,
        {
          tipo,
          modalidad_cobro_parcial: modalidadCobroParcial,
          fecha_inicio,
          fecha_fin,
          estado: 'Activo'
        },
        tenantModels
      );
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    let certificados = normalizarListaCertificados({
      certificados: Array.isArray(req.body?.certificados) ? req.body.certificados : [],
      certificado: req.body?.certificado || null
    });

    const archivosCertificados = extraerArchivosCertificados(req);
    if (archivosCertificados.length > 0) {
      const nuevos = archivosCertificados.map((file) => buildUploadUrl(req, file, 'reposos'));
      certificados = normalizarListaCertificados({ certificados: [...certificados, ...nuevos] });
    }

    const reposo = await TenantReposo.create({
      id_alumno: alumno._id,
      fecha_inicio,
      fecha_fin,
      tipo,
      modalidad_cobro_parcial: modalidadCobroParcial,
      monto_parcial_personalizado: montoParcialPersonalizado,
      motivo: req.body.motivo || '',
      certificados,
      certificado: certificados[0] || null,
      estado: 'Activo'
    });

    const { mes: mesInicio, anio: anioInicio } = getPeriodoFromInput(fecha_inicio_raw, fecha_inicio);

    if (tipo === 'Total') {
      await aplicarReposoTotalPorPeriodo(alumno._id, fecha_inicio, fecha_fin, tenantModels);
    }

    if (tipo === 'Indefinido') {
      if (fecha_fin) {
        await aplicarReposoTotalPorPeriodo(alumno._id, fecha_inicio, fecha_fin, tenantModels);
      } else {
        await TenantMensualidad.updateMany(
          {
            id_alumno: alumno._id,
            estatus: { $ne: 'Pagado' },
            $or: [
              { anio: { $gt: anioInicio } },
              { anio: anioInicio, mes: { $gte: mesInicio } }
            ]
          },
          {
            $set: {
              monto_esperado: 0,
              estatus: 'Exento por reposo'
            }
          }
        );

        await upsertMensualidadExentaPorReposo(alumno._id, mesInicio, anioInicio, tenantModels);
      }
    }

    if (tipo === 'Parcial' && modalidadCobroParcial === 'Prorrateado') {
      const periodosAfectados = await listarPeriodosAfectadosPorReposo(alumno._id, reposo, tenantModels);
      await sincronizarMensualidadesAfectadasPorReposos(alumno._id, periodosAfectados, tenantModels);
    }

    res.status(201).json({ message: 'Reposo registrado', reposo });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar reposo', detalle: err.message });
  }
};

// Editar reposo de un alumno
exports.editarReposoAlumno = async (req, res) => {
  try {
    const tenantModels = await getTenantAlumnoWriteModels(req);
    const {
      Alumno: TenantAlumno,
      Reposo: TenantReposo
    } = tenantModels;
    const alumno = await TenantAlumno.findById(req.params.id).select('_id');
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const reposo = await TenantReposo.findOne({ _id: req.params.reposoId, id_alumno: alumno._id });
    if (!reposo) return res.status(404).json({ error: 'Reposo no encontrado' });

    const reposoAnterior = {
      tipo: reposo.tipo,
      fecha_inicio: reposo.fecha_inicio,
      fecha_fin: reposo.fecha_fin,
      modalidad_cobro_parcial: reposo.modalidad_cobro_parcial,
      monto_parcial_personalizado: reposo.monto_parcial_personalizado,
      certificados: normalizarListaCertificados(reposo)
    };

    const fecha_inicio_raw = req.body.fecha_inicio || req.body.fechaInicio;
    const fecha_fin_raw = req.body.fecha_fin || req.body.fechaFin;

    if (fecha_inicio_raw !== undefined) {
      const fechaInicio = parseDateInput(fecha_inicio_raw);
      if (!fechaInicio) return res.status(400).json({ error: 'fecha_inicio inválida' });
      if (reposo.fecha_fin && fechaInicio.getTime() > reposo.fecha_fin.getTime()) {
        return res.status(400).json({ error: 'fecha_inicio no puede ser posterior a fecha_fin' });
      }
      reposo.fecha_inicio = fechaInicio;
    }

    if (fecha_fin_raw !== undefined) {
      const raw = String(fecha_fin_raw || '').trim();
      if (raw === '') {
        reposo.fecha_fin = null;
      } else {
        const fechaFin = parseDateInput(raw);
        if (!fechaFin) return res.status(400).json({ error: 'fecha_fin inválida' });
        if (reposo.fecha_inicio && fechaFin.getTime() < reposo.fecha_inicio.getTime()) {
          return res.status(400).json({ error: 'fecha_fin no puede ser anterior a fecha_inicio' });
        }
        reposo.fecha_fin = fechaFin;
      }
    }

    if (req.body.tipo !== undefined) {
      const tipo = normalizarTipoReposo(req.body.tipo);
      if (!tipo) {
        return res.status(400).json({ error: 'Tipo de reposo inválido. Valores permitidos: Indefinido, Total, Parcial' });
      }
      reposo.tipo = tipo;
    }

    if (req.body.modalidad_cobro_parcial !== undefined || req.body.modalidadCobroParcial !== undefined || reposo.tipo === 'Parcial') {
      const modalidad = normalizarModalidadCobroParcial(req.body.modalidad_cobro_parcial || req.body.modalidadCobroParcial || reposo.modalidad_cobro_parcial);
      if (!modalidad) {
        return res.status(400).json({ error: 'modalidad_cobro_parcial inválida. Valores permitidos: Normal, Prorrateado' });
      }
      reposo.modalidad_cobro_parcial = reposo.tipo === 'Parcial' ? modalidad : 'Normal';
    } else if (reposo.tipo !== 'Parcial') {
      reposo.modalidad_cobro_parcial = 'Normal';
    }

    if (reposo.tipo === 'Parcial' && reposo.modalidad_cobro_parcial === 'Prorrateado') {
      const montoParcialRaw = req.body.monto_parcial_personalizado ?? req.body.montoParcialPersonalizado;
      if (
        montoParcialRaw !== undefined &&
        montoParcialRaw !== null &&
        String(montoParcialRaw).trim() === ''
      ) {
        return res.status(400).json({ error: 'monto_parcial_personalizado es obligatorio para reposo parcial prorrateado.' });
      }

      const montoParcialPersonalizado = normalizarMontoParcialPersonalizado(
        montoParcialRaw !== undefined ? montoParcialRaw : reposo.monto_parcial_personalizado
      );

      if (montoParcialPersonalizado === null) {
        return res.status(400).json({ error: 'monto_parcial_personalizado es obligatorio para reposo parcial prorrateado.' });
      }

      if (
        montoParcialRaw !== undefined &&
        montoParcialRaw !== null &&
        String(montoParcialRaw).trim() !== '' &&
        montoParcialPersonalizado === null
      ) {
        return res.status(400).json({ error: 'monto_parcial_personalizado inválido. Debe ser un número mayor o igual a 0.' });
      }

      reposo.monto_parcial_personalizado = normalizarMontoParcialPersonalizado(
        montoParcialPersonalizado
      );
    } else {
      reposo.monto_parcial_personalizado = null;
    }

    if (req.body.motivo !== undefined) {
      reposo.motivo = req.body.motivo || '';
    }

    if (req.body.estado !== undefined) {
      reposo.estado = req.body.estado || 'Activo';
    }

    if (reposo.estado === 'Finalizado' && !reposo.fecha_fin) {
      return res.status(400).json({ error: 'Debes indicar una fecha_fin para finalizar el reposo.' });
    }

    try {
      await validarMensualidadesParaReposoConImpactoMonto(
        alumno._id,
        reposo,
        tenantModels,
        { permitirExentoPorReposo: true }
      );
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    let certificadosActuales = normalizarListaCertificados(reposo);
    const eliminarRaw = req.body.eliminar_certificados || req.body.eliminarCertificados;
    if (eliminarRaw !== undefined && eliminarRaw !== null && String(eliminarRaw).trim() !== '') {
      let eliminarLista = [];
      try {
        const parsed = typeof eliminarRaw === 'string' ? JSON.parse(eliminarRaw) : eliminarRaw;
        if (Array.isArray(parsed)) {
          eliminarLista = parsed.map((item) => String(item || '').trim()).filter(Boolean);
        }
      } catch {
        eliminarLista = String(eliminarRaw)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      }

      if (eliminarLista.length > 0) {
        const eliminarSet = new Set(eliminarLista);
        certificadosActuales = certificadosActuales.filter((url) => !eliminarSet.has(url));
      }
    }

    const archivosCertificados = extraerArchivosCertificados(req);
    if (archivosCertificados.length > 0) {
      const nuevos = archivosCertificados.map((file) => buildUploadUrl(req, file, 'reposos'));
      certificadosActuales = normalizarListaCertificados({ certificados: [...certificadosActuales, ...nuevos] });
    }

    reposo.certificados = certificadosActuales;
    reposo.certificado = certificadosActuales[0] || null;

    await reposo.save();

    const periodosPrevios = await listarPeriodosAfectadosPorReposo(alumno._id, reposoAnterior, tenantModels);
    const periodosNuevos = await listarPeriodosAfectadosPorReposo(alumno._id, reposo, tenantModels);
    await sincronizarMensualidadesAfectadasPorReposos(alumno._id, [...periodosPrevios, ...periodosNuevos], tenantModels);

    return res.json({ message: 'Reposo actualizado', reposo });
  } catch (err) {
    return res.status(500).json({ error: 'Error al actualizar reposo', detalle: err.message });
  }
};

exports.finalizarReposoIndefinido = async (req, res) => {
  try {
    const tenantModels = await getTenantAlumnoWriteModels(req);
    const {
      Alumno: TenantAlumno,
      Reposo: TenantReposo
    } = tenantModels;
    const alumno = await TenantAlumno.findById(req.params.id).select('_id');
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const reposo = await TenantReposo.findOne({ _id: req.params.reposoId, id_alumno: alumno._id });
    if (!reposo) return res.status(404).json({ error: 'Reposo no encontrado' });
    if (reposo.tipo !== 'Indefinido') {
      return res.status(400).json({ error: 'Solo los reposos indefinidos se pueden finalizar con esta acción.' });
    }

    const fecha_fin_raw = req.body.fecha_fin || req.body.fechaFin;
    if (!fecha_fin_raw) {
      return res.status(400).json({ error: 'La fecha_fin es obligatoria para finalizar el reposo.' });
    }

    const fecha_fin = parseDateInput(fecha_fin_raw);
    if (!fecha_fin) {
      return res.status(400).json({ error: 'fecha_fin inválida' });
    }
    if (fecha_fin.getTime() < reposo.fecha_inicio.getTime()) {
      return res.status(400).json({ error: 'fecha_fin no puede ser anterior a fecha_inicio' });
    }

    const reposoAnterior = {
      tipo: reposo.tipo,
      fecha_inicio: reposo.fecha_inicio,
      fecha_fin: reposo.fecha_fin,
      modalidad_cobro_parcial: reposo.modalidad_cobro_parcial,
      monto_parcial_personalizado: reposo.monto_parcial_personalizado
    };

    reposo.fecha_fin = fecha_fin;
    reposo.estado = 'Finalizado';
    await reposo.save();

    const periodosPrevios = await listarPeriodosAfectadosPorReposo(alumno._id, reposoAnterior, tenantModels);
    const periodosNuevos = await listarPeriodosAfectadosPorReposo(alumno._id, reposo, tenantModels);
    await sincronizarMensualidadesAfectadasPorReposos(alumno._id, [...periodosPrevios, ...periodosNuevos], tenantModels);

    return res.json({ message: 'Reposo finalizado', reposo });
  } catch (err) {
    return res.status(500).json({ error: 'Error al finalizar reposo', detalle: err.message });
  }
};

// Eliminar reposo de un alumno
exports.eliminarReposoAlumno = async (req, res) => {
  try {
    const tenantModels = await getTenantAlumnoWriteModels(req);
    const {
      Alumno: TenantAlumno,
      Reposo: TenantReposo
    } = tenantModels;
    const alumno = await TenantAlumno.findById(req.params.id).select('_id');
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const reposo = await TenantReposo.findOneAndDelete({ _id: req.params.reposoId, id_alumno: alumno._id });
    if (!reposo) return res.status(404).json({ error: 'Reposo no encontrado' });

    const periodosAfectados = await listarPeriodosAfectadosPorReposo(alumno._id, reposo, tenantModels);
    await sincronizarMensualidadesAfectadasPorReposos(alumno._id, periodosAfectados, tenantModels);

    return res.json({ message: 'Reposo eliminado' });
  } catch (err) {
    return res.status(500).json({ error: 'Error al eliminar reposo', detalle: err.message });
  }
};
