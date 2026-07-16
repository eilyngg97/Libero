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
const ConstanciaSolicitud = require('../models/ConstanciaSolicitud');
const UniformePedido = require('../models/UniformePedido');
const Partido = require('../models/Partido');
const Torneo = require('../models/Torneo');
const PDFDocument = require('pdfkit');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantCoreConnection } = require('../config/tenantCoreConnection');
const { getTenantCoreModel } = require('../models/TenantCore');
const { getTenantModel } = require('../services/tenantModelService');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');
const { generarMensualidadesPendientesAlumno } = require('./mensualidadController');

const MONTO_TOLERANCIA_BS = 100;

const IMPORT_FIXED_FECHA_INICIO_COBRO = new Date(Date.UTC(2026, 6, 1, 12, 0, 0));
const IMPORT_FIXED_PERIODO_COBRO = { mes: 7, anio: 2026 };

async function getTenantAlumnoReadModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);

  // Registrar modelos referenciados para que populate funcione en la conexion tenant.
  const TenantRepresentante = getTenantModel(connection, 'Representante');
  const TenantSede = getTenantModel(connection, 'Sede');
  const TenantAlumno = getTenantModel(connection, 'Alumno');
  const TenantReposo = getTenantModel(connection, 'Reposo');
  const TenantHistorialEstadoAlumno = getTenantModel(connection, 'HistorialEstadoAlumno');
  const TenantConfig = getTenantModel(connection, 'TenantConfig');

  return {
    Alumno: TenantAlumno,
    Representante: TenantRepresentante,
    Sede: TenantSede,
    Reposo: TenantReposo,
    HistorialEstadoAlumno: TenantHistorialEstadoAlumno,
    TenantConfig
  };
}

async function getTenantAlumnoWriteModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);

  const getTenantModelOptional = (modelName) => {
    try {
      return getTenantModel(connection, modelName);
    } catch (error) {
      const message = String(error?.message || '');
      if (message.includes('Modelo tenant no registrado')) {
        return null;
      }
      throw error;
    }
  };

  return {
    Alumno: getTenantModel(connection, 'Alumno'),
    Representante: getTenantModel(connection, 'Representante'),
    User: getTenantModel(connection, 'User'),
    Sede: getTenantModel(connection, 'Sede'),
    Reposo: getTenantModel(connection, 'Reposo'),
    Role: getTenantModel(connection, 'Role'),
    Mensualidad: getTenantModel(connection, 'Mensualidad'),
    PagoDetalle: getTenantModel(connection, 'PagoDetalle'),
    TenantConfig: getTenantModel(connection, 'TenantConfig'),
    HistorialEstadoAlumno: getTenantModel(connection, 'HistorialEstadoAlumno'),
    ConstanciaSolicitud: getTenantModelOptional('ConstanciaSolicitud'),
    UniformePedido: getTenantModelOptional('UniformePedido'),
    Partido: getTenantModelOptional('Partido'),
    Torneo: getTenantModelOptional('Torneo')
  };
}

async function getUsuarioRoleId(RoleModel) {
  if (!RoleModel || typeof RoleModel.findOne !== 'function') return null;
  const roleUsuario = await RoleModel.findOne({ slug: 'usuario' }).select('_id');
  return roleUsuario?._id || null;
}

function buildUploadUrl(req, file, folder) {
  if (!file || !file.filename) return null;
  const tenantId = resolveRequestTenantId(req);
  return `/uploads/${tenantId}/${folder}/${file.filename}`;
}

function sanitizeRequisitoLabel(value = '') {
  return String(value || '').trim();
}

const CATEGORIA_CANONICA_POR_ALIAS = new Map([
  ['u9/iniciacion', 'U9/INICIACION'],
  ['u9', 'U9/INICIACION'],
  ['iniciacion', 'U9/INICIACION'],
  ['u11/formacion', 'U11/FORMACION'],
  ['u11', 'U11/FORMACION'],
  ['formacion', 'U11/FORMACION'],
  ['u13/mini', 'U13/MINI'],
  ['u13', 'U13/MINI'],
  ['mini', 'U13/MINI'],
  ['u15/infantil', 'U15/INFANTIL'],
  ['u15', 'U15/INFANTIL'],
  ['infantil', 'U15/INFANTIL'],
  ['u17/juvenil', 'U17/JUVENIL'],
  ['u17', 'U17/JUVENIL'],
  ['juvenil', 'U17/JUVENIL'],
  ['u19/juvenil libre', 'U19/JUVENIL LIBRE'],
  ['u19', 'U19/JUVENIL LIBRE'],
  ['juvenil libre', 'U19/JUVENIL LIBRE'],
  ['u21', 'U21'],
  ['u23/libre', 'U23/ LIBRE'],
  ['u23', 'U23/ LIBRE'],
  ['mayores/libre', 'MAYORES / LIBRE'],
  ['mayores libre', 'MAYORES / LIBRE'],
  ['mayores', 'MAYORES / LIBRE']
]);

function normalizarClaveCategoria(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarCategoria(valor) {
  const raw = String(valor || '').trim();
  if (!raw) return '';

  const categoriaCanonica = CATEGORIA_CANONICA_POR_ALIAS.get(normalizarClaveCategoria(raw));
  if (categoriaCanonica) return categoriaCanonica;

  return raw.toUpperCase();
}

function normalizarSexo(valor) {
  if (valor === undefined || valor === null) return undefined;
  const raw = String(valor).trim().toLowerCase();
  if (!raw) return undefined;

  if (raw === 'f' || raw === 'femenino' || raw === 'femenina') {
    return 'Femenino';
  }

  if (raw === 'm' || raw === 'masculino') {
    return 'Masculino';
  }

  return null;
}

function normalizarDivision(valor) {
  if (valor === undefined || valor === null) return undefined;
  const raw = String(valor).trim().toLowerCase();
  if (!raw) return undefined;

  if (raw === 'primer division' || raw === 'primera division' || raw === 'primera división' || raw === 'primer division') {
    return 'Primer division';
  }

  if (raw === 'segunda division' || raw === 'segunda división') {
    return 'Segunda division';
  }

  if (raw === 'tercera division' || raw === 'tercera división') {
    return 'Tercera division';
  }

  return null;
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

function normalizarDiaLimitePersonalizado(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return undefined;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1 || numero > 31) return NaN;
  return numero;
}

async function validarNumeroFranelaDisponible({ numeroFranela, categoria, sexo, excludeAlumnoId, AlumnoModel = Alumno }) {
  if (numeroFranela === undefined || numeroFranela === null || numeroFranela === '') return;

  if (!Number.isInteger(numeroFranela) || numeroFranela < 1 || numeroFranela > 100) {
    throw new Error('El nro de franela debe estar entre 1 y 100.');
  }

  const categoriaNormalizada = normalizarCategoria(categoria);
  if (!categoriaNormalizada) {
    throw new Error('La categoria es obligatoria para asignar nro de franela.');
  }

  const sexoNormalizado = normalizarSexo(sexo);
  if (!sexoNormalizado) {
    throw new Error('El sexo es obligatorio para asignar nro de franela.');
  }

  const filtro = {
    categoria: categoriaNormalizada,
    sexo: sexoNormalizado,
    numero_franela: numeroFranela,
    activo: { $ne: false },
    dado_de_baja: { $ne: true },
    $or: [
      { estado: { $exists: false } },
      { estado: { $not: /^baja$/i } }
    ]
  };

  if (excludeAlumnoId) {
    filtro._id = { $ne: excludeAlumnoId };
  }

  const alumnoExistente = await AlumnoModel.findOne(filtro).select('_id nombres apellidos sede categoria sexo numero_franela');
  if (alumnoExistente) {
    throw new Error(
      `El nro de franela ${numeroFranela} ya esta asignado en la categoria ${categoriaNormalizada} (${sexoNormalizado}) a ${alumnoExistente.nombres} ${alumnoExistente.apellidos}.`
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
  if (!raw) return null;
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

function esFechaDelAnioActual(fecha) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return false;
  return fecha.getUTCFullYear() === new Date().getUTCFullYear();
}

function getMensajeErrorFechaInicioCobroAnioActual() {
  const anioActual = new Date().getUTCFullYear();
  return `fecha_inicio_cobro debe pertenecer al año actual (${anioActual}).`;
}

function esMismaFechaUtc(a, b) {
  if (!(a instanceof Date) || Number.isNaN(a.getTime())) return false;
  if (!(b instanceof Date) || Number.isNaN(b.getTime())) return false;
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function normalizarDiaMes(value, fallback = 5) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.min(31, num));
}

function construirFinDeDiaCaracasPeriodo(anio, mes, dia) {
  const ultimoDiaMes = new Date(anio, mes, 0).getDate();
  const diaAjustado = Math.min(Math.max(1, Number(dia) || 1), ultimoDiaMes);
  const CARACAS_OFFSET_UTC_HOURS = 4;
  return new Date(Date.UTC(anio, mes - 1, diaAjustado, 23 + CARACAS_OFFSET_UTC_HOURS, 59, 59, 999));
}

async function obtenerDiaVencimientoCobro(models = {}) {
  try {
    const TenantConfigModel = models.TenantConfig;
    if (!TenantConfigModel) return 5;
    const config = await TenantConfigModel.findOne({ key: 'default' }).select('cobro.dia_vencimiento').lean();
    return normalizarDiaMes(config?.cobro?.dia_vencimiento, 5);
  } catch {
    return 5;
  }
}

function normalizarTextoPlano(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizarCedula(value) {
  const raw = String(value || '').trim();
  if (!raw || /^s\/?c$/i.test(raw)) return '';
  return raw.replace(/[^0-9A-Za-z-]/g, '');
}

function parseExcelDateInput(value) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      12,
      0,
      0
    ));
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, 12, 0, 0));
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return parseDateInput(raw);
}

function findColumnIndexByCandidates(headerRow, candidates) {
  if (!Array.isArray(headerRow)) return -1;
  const normalizedHeaders = headerRow.map((header) => normalizarTextoPlano(header));
  for (const candidate of candidates) {
    const normalizedCandidate = normalizarTextoPlano(candidate);
    const idx = normalizedHeaders.findIndex((h) => h === normalizedCandidate);
    if (idx >= 0) return idx;
  }
  return -1;
}

function findColumnIndexesByCandidates(headerRow, candidates) {
  if (!Array.isArray(headerRow)) return [];
  const normalizedHeaders = headerRow.map((header) => normalizarTextoPlano(header));
  const result = [];

  candidates.forEach((candidate) => {
    const normalizedCandidate = normalizarTextoPlano(candidate);
    normalizedHeaders.forEach((header, index) => {
      if (header === normalizedCandidate) {
        result.push(index);
      }
    });
  });

  return Array.from(new Set(result)).sort((a, b) => a - b);
}

function splitNombreCompleto(valor) {
  const full = String(valor || '').replace(/\s+/g, ' ').trim();
  if (!full) return { nombres: '', apellidos: '' };

  const parts = full.split(' ');
  if (parts.length === 1) {
    return { nombres: parts[0], apellidos: 'N/A' };
  }

  const apellidos = parts.slice(-1).join(' ');
  const nombres = parts.slice(0, -1).join(' ');
  return { nombres, apellidos };
}

function normalizarTelefonoPlano(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits;
}

function parseAlumnoExcelRows(fileBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('El archivo Excel no tiene hojas.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false
  });

  if (!rows.length) {
    throw new Error('El archivo Excel esta vacio.');
  }

  const maxHeaderScanRows = Math.min(20, rows.length);
  let headerRowIndex = -1;
  let headerRow = [];

  for (let i = 0; i < maxHeaderScanRows; i += 1) {
    const candidate = Array.isArray(rows[i]) ? rows[i] : [];
    const idxNombresTmp = findColumnIndexByCandidates(candidate, ['NOMBRES', 'NOMBRE', 'NOMBRES DEL ALUMNO']);
    const idxApellidosTmp = findColumnIndexByCandidates(candidate, ['APELLIDOS', 'APELLIDO']);
    if (idxNombresTmp >= 0 && idxApellidosTmp >= 0) {
      headerRowIndex = i;
      headerRow = candidate;
      break;
    }
  }

  if (headerRowIndex < 0) {
    const previewHeaders = (rows[0] || [])
      .map((h) => String(h || '').trim())
      .filter(Boolean)
      .slice(0, 12)
      .join(' | ');

    throw new Error(
      `No se encontraron columnas obligatorias del alumno (NOMBRES y APELLIDOS). Hoja: ${firstSheetName}. Encabezados detectados (fila 1): ${previewHeaders || 'sin datos'}`
    );
  }

  const idxNombres = findColumnIndexByCandidates(headerRow, ['NOMBRES', 'NOMBRE', 'NOMBRES DEL ALUMNO']);
  const idxApellidos = findColumnIndexByCandidates(headerRow, ['APELLIDOS', 'APELLIDO']);
  const idxRepresentante = findColumnIndexByCandidates(headerRow, ['REPRESENTANTE', 'NOMBRE REPRESENTANTE']);
  const fechaNacIndexes = findColumnIndexesByCandidates(headerRow, ['FECHA NAC', 'FECHA NACIMIENTO', 'FECHA DE NACIMIENTO']);

  const idxCedula = findColumnIndexByCandidates(headerRow, ['CEDULA ALUMNO', 'CEDULA ESTUDIANTE', 'CEDULA']);

  let idxRepCedula = findColumnIndexByCandidates(headerRow, ['CEDULA REPRESENTANTE', 'CEDULA DEL REPRESENTANTE']);

  const idxSexo = findColumnIndexByCandidates(headerRow, ['SEXO']);
  let idxFechaNac = findColumnIndexByCandidates(headerRow, ['FECHA NAC ALUMNO']);
  if (idxFechaNac < 0 && fechaNacIndexes.length > 0) {
    idxFechaNac = idxRepresentante >= 0
      ? (fechaNacIndexes.find((idx) => idx < idxRepresentante) ?? fechaNacIndexes[0])
      : fechaNacIndexes[0];
  }

  let idxRepFechaNac = findColumnIndexByCandidates(headerRow, ['FECHA NAC REPRESENTANTE']);
  if (idxRepFechaNac < 0 && fechaNacIndexes.length > 1) {
    idxRepFechaNac = idxRepresentante >= 0
      ? (fechaNacIndexes.find((idx) => idx > idxRepresentante) ?? fechaNacIndexes[fechaNacIndexes.length - 1])
      : fechaNacIndexes[1];
  }

  const idxFechaIngreso = findColumnIndexByCandidates(headerRow, ['FECHA INGRESO', 'FECHA DE INGRESO', 'INGRESO']);
  const idxClasif = findColumnIndexByCandidates(headerRow, ['CLASIF INTERNA', 'CLASIFICACION INTERNA', 'CATEGORIA']);
  const idxNumeroFranela = findColumnIndexByCandidates(headerRow, ['NRO DE FRANELA', 'NRO FRANELA', 'NUMERO FRANELA']);
  const idxDireccion = findColumnIndexByCandidates(headerRow, ['DIRECCION', 'DOMICILIO']);
  const idxRepTelefono = findColumnIndexByCandidates(headerRow, ['NRO DE TEL DEL REPRESENTANTE', 'TELEFONO REPRESENTANTE', 'TEL REPRESENTANTE', 'TELEFONO']);
  const idxRepCorreo = findColumnIndexByCandidates(headerRow, ['CORREO REPRESENTANTE', 'CORREO', 'EMAIL REPRESENTANTE', 'EMAIL']);
  const idxRepDireccion = findColumnIndexByCandidates(headerRow, ['DIRECCION REPRESENTANTE', 'DOMICILIO REPRESENTANTE']);

  if (idxNombres < 0 || idxApellidos < 0) {
    throw new Error('No se encontraron columnas obligatorias del alumno: NOMBRES y APELLIDOS.');
  }

  return rows.slice(headerRowIndex + 1).map((row, index) => {
    const nombres = String(row[idxNombres] || '').trim();
    const apellidos = String(row[idxApellidos] || '').trim();
    const cedula = idxCedula >= 0 ? normalizarCedula(row[idxCedula]) : '';
    const sexo = idxSexo >= 0 ? row[idxSexo] : '';
    const fecha_nacimiento = idxFechaNac >= 0 ? parseExcelDateInput(row[idxFechaNac]) : null;
    const fecha_inscripcion = idxFechaIngreso >= 0 ? parseExcelDateInput(row[idxFechaIngreso]) : null;
    const categoria = idxClasif >= 0 ? String(row[idxClasif] || '').trim() : '';
    const domicilio = idxDireccion >= 0 ? String(row[idxDireccion] || '').trim() : '';
    const numeroFranelaRaw = idxNumeroFranela >= 0 ? row[idxNumeroFranela] : '';
    const representanteRaw = idxRepresentante >= 0 ? String(row[idxRepresentante] || '').trim() : '';
    const repCedula = idxRepCedula >= 0 ? normalizarCedula(row[idxRepCedula]) : '';
    const repTelefono = idxRepTelefono >= 0 ? normalizarTelefonoPlano(row[idxRepTelefono]) : '';
    const repFechaNacimiento = idxRepFechaNac >= 0 ? parseExcelDateInput(row[idxRepFechaNac]) : null;
    const repCorreo = idxRepCorreo >= 0 ? String(row[idxRepCorreo] || '').trim() : '';
    const repDireccion = idxRepDireccion >= 0
      ? String(row[idxRepDireccion] || '').trim()
      : (domicilio || '');
    const repNombrePartes = splitNombreCompleto(representanteRaw);

    return {
      excelRow: headerRowIndex + index + 2,
      nombres,
      apellidos,
      cedula,
      sexo,
      fecha_nacimiento,
      fecha_inscripcion,
      categoria,
      domicilio,
      numero_franela: numeroFranelaRaw,
      representante_nombre_completo: representanteRaw,
      rep_nombres: repNombrePartes.nombres,
      rep_apellidos: repNombrePartes.apellidos,
      rep_cedula: repCedula,
      rep_telefono: repTelefono,
      rep_fecha_nacimiento: repFechaNacimiento,
      rep_correo: repCorreo,
      rep_direccion: repDireccion
    };
  });
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

function distribuirPagoReingresoEntreMensualidades({
  mensualidades = [],
  montoPagadoUsd = 0,
  montoPagadoBs,
  montoReingreso = 0,
  montoPrimeraMensualidad = 0
}) {
  const totalUsd = redondearMonto(Math.max(0, montoPagadoUsd || 0));
  const totalBs = Number.isFinite(Number(montoPagadoBs)) ? redondearMonto(montoPagadoBs) : undefined;
  let restanteUsd = totalUsd;
  let restanteBs = Number.isFinite(totalBs) ? totalBs : undefined;

  return mensualidades.map((item, index) => {
    const montoEsperadoUsd = redondearMonto(Math.max(0, Number(item?.montoEsperadoUsd) || 0));
    const montoAplicadoUsd = redondearMonto(Math.min(restanteUsd, montoEsperadoUsd));
    let montoAplicadoBs;

    if (Number.isFinite(totalBs) && totalUsd > 0) {
      if (index === mensualidades.length - 1) {
        montoAplicadoBs = redondearMonto(Math.max(0, restanteBs ?? 0));
      } else {
        montoAplicadoBs = redondearMonto((montoAplicadoUsd / totalUsd) * totalBs);
        restanteBs = redondearMonto((restanteBs ?? totalBs) - montoAplicadoBs);
      }
    }

    restanteUsd = redondearMonto(Math.max(0, restanteUsd - montoAplicadoUsd));

    const conceptosDetalle = index === 0
      ? distribuirPagoPorConceptos({
        montoPagadoUsd: montoAplicadoUsd,
        montoPagadoBs: montoAplicadoBs,
        montoReingreso,
        montoMensualidad: montoPrimeraMensualidad
      }).conceptosDetalle
      : [{
        tipo: 'MENSUALIDAD_REINGRESO',
        monto_esperado_usd: montoEsperadoUsd,
        monto_pagado_usd: montoAplicadoUsd,
        monto_esperado_bs: undefined,
        monto_pagado_bs: montoAplicadoBs
      }];

    return {
      ...item,
      montoAplicadoUsd,
      montoAplicadoBs,
      conceptosDetalle
    };
  });
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

  if (!AlumnoModel || typeof AlumnoModel.findById !== 'function') {
    return null;
  }

  const consultaAlumno = AlumnoModel.findById(alumnoId);
  if (!consultaAlumno) return null;

  const alumno = typeof consultaAlumno.select === 'function'
    ? await consultaAlumno.select('tipo_mensualidad').lean()
    : await Promise.resolve(consultaAlumno);
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

function obtenerPeriodoDesdeFecha(fecha) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return null;
  return {
    mes: fecha.getUTCMonth() + 1,
    anio: fecha.getUTCFullYear()
  };
}

function construirPeriodosEntre(inicio, fin) {
  const mesInicio = Number(inicio?.mes);
  const anioInicio = Number(inicio?.anio);
  const mesFin = Number(fin?.mes);
  const anioFin = Number(fin?.anio);

  if (!Number.isInteger(mesInicio) || !Number.isInteger(anioInicio) || !Number.isInteger(mesFin) || !Number.isInteger(anioFin)) {
    return [];
  }

  const periodos = [];
  let cursorMes = mesInicio;
  let cursorAnio = anioInicio;

  while (cursorAnio < anioFin || (cursorAnio === anioFin && cursorMes <= mesFin)) {
    periodos.push({ mes: cursorMes, anio: cursorAnio });
    cursorMes += 1;
    if (cursorMes > 12) {
      cursorMes = 1;
      cursorAnio += 1;
    }
  }

  return periodos;
}

function compararPeriodos(a, b) {
  const anioA = Number(a?.anio) || 0;
  const anioB = Number(b?.anio) || 0;
  if (anioA !== anioB) return anioA - anioB;

  const mesA = Number(a?.mes) || 0;
  const mesB = Number(b?.mes) || 0;
  return mesA - mesB;
}

function formatPeriodoTexto(periodo) {
  const mes = Number(periodo?.mes);
  const anio = Number(periodo?.anio);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(anio) || anio < 2000) {
    return '-';
  }

  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  return `${meses[mes - 1]} ${anio}`;
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
  const veniaExentoPorReposo = estatusAnteriorNormalizado === 'exento por reposo';
  const tipoMensualidadAlumno = await obtenerTipoMensualidadAlumnoDesdeMensualidad(mensualidad, models);
  const esBecado = esTipoMensualidadBecaCompleta(tipoMensualidadAlumno);

  if (esBecado && estatusActualNormalizado !== 'exento por reposo') {
    mensualidad.estatus = 'Becado';
  } else if (montoEsperado <= 0) {
    mensualidad.estatus = totalPagado > 0 ? 'En revision' : 'Pagado';
  } else if (totalPagado <= 0) {
    if (veniaExentoPorReposo) {
      mensualidad.estatus = 'Pendiente';
    } else {
      mensualidad.estatus = (esEstatusInsolvente(estatusAnteriorNormalizado) || estaVencida) ? 'Insolvente' : 'Pendiente';
    }
  } else if (cubreEsperadoConTolerancia) {
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

  const repososParcialesProrrateados = repososParcialesConsulta && typeof repososParcialesConsulta.sort === 'function'
    ? await repososParcialesConsulta.sort({ fecha_inicio: -1, createdAt: -1 })
    : (repososParcialesConsulta && typeof repososParcialesConsulta.lean === 'function'
      ? await repososParcialesConsulta.lean()
      : (Array.isArray(repososParcialesConsulta) ? repososParcialesConsulta : []));

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
  const consultaMensualidades = MensualidadModel.find({
    id_alumno: alumnoId,
    $or: [
      { anio: { $gt: inicioAnio } },
      { anio: inicioAnio, mes: { $gte: inicioMes } }
    ]
  });
  const mensualidades = consultaMensualidades && typeof consultaMensualidades.select === 'function'
    ? await consultaMensualidades.select('mes anio').lean()
    : (Array.isArray(consultaMensualidades) ? consultaMensualidades : []);

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

  const consultaMensualidades = MensualidadModel.find({
    id_alumno: alumnoId,
    $or: periodos.map((periodo) => ({ mes: periodo.mes, anio: periodo.anio }))
  });
  const mensualidades = consultaMensualidades && typeof consultaMensualidades.select === 'function'
    ? await consultaMensualidades.select('mes anio estatus').lean()
    : (Array.isArray(consultaMensualidades) ? consultaMensualidades : []);

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

  if (!AlumnoModel || typeof AlumnoModel.findById !== 'function') return;
  const consultaAlumno = AlumnoModel.findById(alumnoId);
  if (!consultaAlumno) return;

  const alumno = typeof consultaAlumno.select === 'function'
    ? await consultaAlumno.select('sede tipo_mensualidad monto_personalizado_valor')
    : await Promise.resolve(consultaAlumno);
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
  const diaVencimiento = await obtenerDiaVencimientoCobro(models);
  const fechaVencimiento = construirFinDeDiaCaracasPeriodo(anio, mes, diaVencimiento);
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

function applySession(query, session) {
  if (!session || !query || typeof query.session !== 'function') return query;
  return query.session(session);
}

async function eliminarUsuarioSiQuedaHuerfano(userId, models = {}, options = {}) {
  if (!userId) return;
  const { session } = options;

  const AlumnoModel = models.Alumno || Alumno;
  const RepresentanteModel = models.Representante || Representante;
  const UserModel = models.User || User;

  const [alumnoRelacionado, representanteRelacionado] = await Promise.all([
    applySession(AlumnoModel.findOne({ usuario: userId }), session).select('_id'),
    applySession(RepresentanteModel.findOne({ usuario: userId }), session).select('_id')
  ]);

  if (!alumnoRelacionado && !representanteRelacionado) {
    await applySession(UserModel.findByIdAndDelete(userId), session);
  }
}

async function sincronizarUsuarioPortalRepresentante({ representante, cedulaAnterior, cedulaNueva, nombres, apellidos, UserModel = User, RoleModel = null }) {
  if (!representante || !cedulaNueva) return;

  const nombreCompleto = `${String(nombres || '').trim()} ${String(apellidos || '').trim()}`.trim();
  let user = null;
  const usuarioRoleId = await getUsuarioRoleId(RoleModel);

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
        rol: 'usuario',
        roleId: usuarioRoleId
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

    const sexo = normalizarSexo(req.query.sexo);
    if (!sexo) {
      return res.status(400).json({ error: 'El sexo es obligatorio.' });
    }

    const filtro = {
      activo: { $ne: false },
      dado_de_baja: { $ne: true },
      numero_franela: { $gte: 1, $lte: 100 },
      categoria: { $regex: new RegExp(`^${escapeRegex(categoria)}$`, 'i') },
      sexo,
      $or: [
        { estado: { $exists: false } },
        { estado: { $not: /^baja$/i } }
      ]
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
      sexo,
      ocupados,
      disponibles,
      totalOcupados: ocupados.length,
      totalDisponibles: disponibles.length
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error al consultar disponibilidad de nro de franela' });
  }
};

exports.importarAlumnosExcel = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Debes adjuntar un archivo Excel en el campo archivo.' });
    }

    const sedeIdRaw = String(req.body?.sede || '').trim();
    if (!mongoose.Types.ObjectId.isValid(sedeIdRaw)) {
      return res.status(400).json({ error: 'Debes enviar una sede valida en el campo sede.' });
    }

    const {
      Alumno: TenantAlumno,
      Representante: TenantRepresentante,
      User: TenantUser,
      Role: TenantRole,
      Sede: TenantSede,
      Reposo: TenantReposo,
      Mensualidad: TenantMensualidad,
      PagoDetalle: TenantPagoDetalle,
      TenantConfig: TenantConfigModel
    } = await getTenantAlumnoWriteModels(req);
    const usuarioRoleId = await getUsuarioRoleId(TenantRole);
    const configCategoriasImport = await TenantConfigModel.findOne({ key: 'default' }).select('categorias').lean();
    const reglasCategoriasImport = normalizeReglasCategoriasSinFallback(configCategoriasImport?.categorias?.reglas || []);

    const sede = await TenantSede.findById(sedeIdRaw).select('_id nombre');
    if (!sede) {
      return res.status(404).json({ error: 'Sede no encontrada.' });
    }

    const dryRun = String(req.body?.dryRun || '').trim() === '1';

    const rows = parseAlumnoExcelRows(req.file.buffer);
    const created = [];
    const skipped = [];
    const errors = [];
    const seenCedulaInFile = new Set();

    for (const row of rows) {
      try {
        if (!row.nombres || !row.apellidos) {
          skipped.push({ fila: row.excelRow, motivo: 'Fila sin nombres/apellidos.' });
          continue;
        }

        const cedulaKey = row.cedula ? `${String(row.cedula).toLowerCase()}::${sedeIdRaw}` : '';
        if (cedulaKey && seenCedulaInFile.has(cedulaKey)) {
          skipped.push({ fila: row.excelRow, motivo: 'Cedula duplicada dentro del mismo archivo.' });
          continue;
        }
        if (cedulaKey) {
          seenCedulaInFile.add(cedulaKey);
        }

        if (row.cedula) {
          const existente = await TenantAlumno.findOne({ cedula: row.cedula, sede: sedeIdRaw }).select('_id');
          if (existente) {
            skipped.push({ fila: row.excelRow, motivo: 'Ya existe un alumno con esa cedula en esta sede.' });
            continue;
          }
        }

        const alumnoData = {
          nombres: row.nombres,
          apellidos: row.apellidos,
          sede: sedeIdRaw,
          fecha_inicio_cobro: new Date(IMPORT_FIXED_FECHA_INICIO_COBRO),
          fecha_inscripcion: row.fecha_inscripcion || undefined,
          fecha_nacimiento: row.fecha_nacimiento || undefined,
          cedula: row.cedula || undefined,
          domicilio: row.domicilio || undefined,
          sinRepresentante: true
        };

        const tieneDatosRepresentante = row.rep_cedula && row.rep_nombres && row.rep_apellidos;
        if (tieneDatosRepresentante) {
          if (!dryRun) {
            let representante = await TenantRepresentante.findOne({ cedula: row.rep_cedula });
            let user = await TenantUser.findOne({ email: row.rep_cedula });

            if (!user) {
              const password = await bcrypt.hash(row.rep_cedula, 10);
              user = new TenantUser({
                nombre: `${row.rep_nombres} ${row.rep_apellidos}`.trim(),
                email: row.rep_cedula,
                password,
                rol: 'usuario',
                roleId: usuarioRoleId
              });
              await user.save();
            }

            if (!representante) {
              representante = new TenantRepresentante({
                nombres: row.rep_nombres,
                apellidos: row.rep_apellidos,
                cedula: row.rep_cedula,
                telefono: row.rep_telefono || undefined,
                fecha_nacimiento: row.rep_fecha_nacimiento || undefined,
                correo: row.rep_correo || undefined,
                direccion: row.rep_direccion || undefined,
                usuario: user._id
              });
              await representante.save();
            } else {
              let updated = false;
              if (!representante.usuario) {
                representante.usuario = user._id;
                updated = true;
              }
              if (row.rep_telefono && !representante.telefono) {
                representante.telefono = row.rep_telefono;
                updated = true;
              }
              if (row.rep_fecha_nacimiento && !representante.fecha_nacimiento) {
                representante.fecha_nacimiento = row.rep_fecha_nacimiento;
                updated = true;
              }
              if (row.rep_correo && !representante.correo) {
                representante.correo = row.rep_correo;
                updated = true;
              }
              if (row.rep_direccion && !representante.direccion) {
                representante.direccion = row.rep_direccion;
                updated = true;
              }
              if (updated) {
                await representante.save();
              }
            }

            alumnoData.representante = representante._id;
            alumnoData.usuario = user._id;
            alumnoData.sinRepresentante = false;
            alumnoData.parentesco = row.parentesco || undefined;
          } else {
            alumnoData.sinRepresentante = false;
          }
        } else if (!dryRun && row.cedula) {
          let userAlumno = await TenantUser.findOne({ email: row.cedula });
          if (!userAlumno) {
            const passwordAlumno = await bcrypt.hash(row.cedula, 10);
            userAlumno = new TenantUser({
              nombre: `${row.nombres} ${row.apellidos}`.trim(),
              email: row.cedula,
              password: passwordAlumno,
              rol: 'usuario',
              roleId: usuarioRoleId
            });
            await userAlumno.save();
          }
          alumnoData.usuario = userAlumno._id;
        }

        const categoriaDesdeExcel = resolverCategoriaDesdeReglas(row.categoria, reglasCategoriasImport);
        const categoriaDesdeFecha = row.fecha_nacimiento
          ? getCategoriaPorFechaNacimiento(row.fecha_nacimiento, reglasCategoriasImport)
          : '';
        const categoriaFinal = categoriaDesdeExcel || categoriaDesdeFecha;
        if (categoriaFinal) {
          alumnoData.categoria = categoriaFinal;
        }

        const sexoNormalizado = normalizarSexo(row.sexo);
        if (sexoNormalizado === null) {
          skipped.push({ fila: row.excelRow, motivo: 'Sexo invalido. Debe ser Femenino o Masculino.' });
          continue;
        }
        if (sexoNormalizado) {
          alumnoData.sexo = sexoNormalizado;
        }

        const nroFranela = normalizarNumeroFranela(row.numero_franela);
        if (nroFranela !== undefined) {
          if (Number.isNaN(nroFranela)) {
            skipped.push({ fila: row.excelRow, motivo: 'Nro de franela invalido.' });
            continue;
          }
          alumnoData.numero_franela = nroFranela;
        }

        await validarNumeroFranelaDisponible({
          numeroFranela: alumnoData.numero_franela,
          categoria: alumnoData.categoria,
          sexo: alumnoData.sexo,
          AlumnoModel: TenantAlumno
        });

        if (!dryRun) {
          const alumno = new TenantAlumno(alumnoData);
          await alumno.save();

          try {
            await generarMensualidadesPendientesAlumno(alumno, {
              models: {
                Alumno: TenantAlumno,
                Mensualidad: TenantMensualidad,
                PagoDetalle: TenantPagoDetalle,
                Sede: TenantSede,
                Reposo: TenantReposo,
                TenantConfig: TenantConfigModel
              },
              periodoInicio: IMPORT_FIXED_PERIODO_COBRO,
              periodoFin: IMPORT_FIXED_PERIODO_COBRO,
              esInscripcionOverride: false
            });
          } catch (errMensualidad) {
            await alumno.deleteOne().catch(() => {});
            throw new Error(`No se pudo crear mensualidad inicial de julio 2026: ${errMensualidad.message}`);
          }

          created.push({
            fila: row.excelRow,
            id: alumno._id,
            nombres: alumno.nombres,
            apellidos: alumno.apellidos,
            representanteCreado: Boolean(alumno.representante)
          });
        } else {
          created.push({
            fila: row.excelRow,
            nombres: alumnoData.nombres,
            apellidos: alumnoData.apellidos,
            preview: true,
            representanteDetectado: Boolean(tieneDatosRepresentante)
          });
        }
      } catch (rowErr) {
        errors.push({ fila: row.excelRow, error: rowErr.message });
      }
    }

    return res.status(200).json({
      ok: true,
      dryRun,
      sede: { id: sede._id, nombre: sede.nombre },
      totalFilas: rows.length,
      creados: created.length,
      omitidos: skipped.length,
      conError: errors.length,
      detalle: {
        creados: created,
        omitidos: skipped,
        errores: errors
      }
    });
  } catch (err) {
    return res.status(400).json({ error: 'No se pudo importar el archivo.', detalle: err.message });
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
      Role: TenantRole,
      Sede: TenantSede,
      Reposo: TenantReposo,
      Mensualidad: TenantMensualidad,
      PagoDetalle: TenantPagoDetalle,
      TenantConfig: TenantConfigModel
    } = await getTenantAlumnoWriteModels(req);
    const usuarioRoleId = await getUsuarioRoleId(TenantRole);
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
    if (!esFechaDelAnioActual(fechaInicioCobro)) {
      return res.status(400).json({ error: getMensajeErrorFechaInicioCobroAnioActual() });
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
        nombres: String(req.body.rep_nombres || '').trim(),
        apellidos: String(req.body.rep_apellidos || '').trim(),
        cedula: String(req.body.rep_cedula || '').trim(),
        telefono: String(req.body.rep_telefono || '').trim(),
        fecha_nacimiento: parseDateInput(req.body.rep_fecha_nacimiento),
        correo: String(req.body.rep_correo || '').trim(),
        direccion: String(req.body.rep_direccion || req.body.rep_domicilio || '').trim()
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
          rol: 'usuario',
          roleId: usuarioRoleId
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
            rol: 'usuario',
            roleId: usuarioRoleId
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
    if (Object.prototype.hasOwnProperty.call(alumnoData, 'division')) {
      const divisionNormalizada = normalizarDivision(alumnoData.division);
      if (divisionNormalizada === null) {
        return res.status(400).json({ error: 'El campo division debe ser Primer division, Segunda division o Tercera division.' });
      }
      if (divisionNormalizada === undefined) {
        delete alumnoData.division;
      } else {
        alumnoData.division = divisionNormalizada;
      }
    }
    if (Object.prototype.hasOwnProperty.call(alumnoData, 'sexo')) {
      const sexoNormalizado = normalizarSexo(alumnoData.sexo);
      if (sexoNormalizado === null) {
        return res.status(400).json({ error: 'El campo sexo debe ser Femenino o Masculino.' });
      }
      if (sexoNormalizado === undefined) {
        delete alumnoData.sexo;
      } else {
        alumnoData.sexo = sexoNormalizado;
      }
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
      sexo: alumnoData.sexo,
      AlumnoModel: TenantAlumno
    });
    if (alumnoData.habilitar_pago_cuotas !== undefined) {
      alumnoData.habilitar_pago_cuotas = alumnoData.habilitar_pago_cuotas === true || alumnoData.habilitar_pago_cuotas === 'true';
    }
    if (alumnoData.aplicar_recargo_mensualidad !== undefined) {
      alumnoData.aplicar_recargo_mensualidad =
        alumnoData.aplicar_recargo_mensualidad === true || alumnoData.aplicar_recargo_mensualidad === 'true';
    }
    if (Object.prototype.hasOwnProperty.call(alumnoData, 'dia_limite_personalizado')) {
      const diaLimite = normalizarDiaLimitePersonalizado(alumnoData.dia_limite_personalizado);
      if (Number.isNaN(diaLimite)) {
        return res.status(400).json({ error: 'dia_limite_personalizado debe ser un numero entero entre 1 y 31.' });
      }
      if (diaLimite === undefined) {
        delete alumnoData.dia_limite_personalizado;
      } else {
        alumnoData.dia_limite_personalizado = diaLimite;
      }
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

    const tipoMensualidadNuevo = String(alumnoData.tipo_mensualidad || '').toLowerCase();
    if (tipoMensualidadNuevo === 'monto_personalizado') {
      const montoPersonalizado = Number(alumnoData.monto_personalizado_valor);
      if (!Number.isFinite(montoPersonalizado) || montoPersonalizado <= 0) {
        return res.status(400).json({ error: 'monto_personalizado_valor debe ser mayor a 0 cuando tipo_mensualidad es monto_personalizado.' });
      }
      alumnoData.monto_personalizado_valor = redondearMonto(montoPersonalizado);
    } else {
      delete alumnoData.monto_personalizado_valor;
    }

    // Eliminar los campos de representante del body para evitar duplicidad
    delete alumnoData.rep_nombres;
    delete alumnoData.rep_apellidos;
    delete alumnoData.rep_cedula;
    delete alumnoData.rep_parentesco;
    delete alumnoData.rep_telefono;
    delete alumnoData.rep_domicilio;
    delete alumnoData.rep_fecha_nacimiento;
    delete alumnoData.rep_correo;
    delete alumnoData.rep_direccion;

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

function formatFechaFicha(fechaRaw) {
  if (!fechaRaw) return '-';

  if (fechaRaw instanceof Date) {
    if (Number.isNaN(fechaRaw.getTime())) return '-';
    const dia = String(fechaRaw.getUTCDate()).padStart(2, '0');
    const mes = String(fechaRaw.getUTCMonth() + 1).padStart(2, '0');
    const anio = fechaRaw.getUTCFullYear();
    return `${dia}/${mes}/${anio}`;
  }

  const raw = String(fechaRaw).trim();
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
  }

  const fecha = new Date(raw);
  if (Number.isNaN(fecha.getTime())) return '-';
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const anio = fecha.getUTCFullYear();
  return `${dia}/${mes}/${anio}`;
}

function calcularEdadFicha(fechaRaw) {
  if (!fechaRaw) return '-';
  const fecha = new Date(fechaRaw);
  if (Number.isNaN(fecha.getTime())) return '-';

  const hoy = new Date();
  let edad = hoy.getFullYear() - fecha.getFullYear();
  const mes = hoy.getMonth() - fecha.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < fecha.getDate())) edad -= 1;
  return String(Math.max(edad, 0));
}

function mapUploadUrlToLocalPath(url = '') {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl.startsWith('/uploads/')) return null;
  const relativePath = cleanUrl.replace(/^\/+/, '');
  return path.join(__dirname, '..', relativePath);
}

async function getBrandingFichaTecnica(req) {
  try {
    const tenantId = String(resolveRequestTenantId(req) || req?.tenant?.tenantId || '').trim().toLowerCase();
    if (!tenantId) {
      return { logoPath: null, academyName: '' };
    }

    const coreConnection = await getTenantCoreConnection();
    const TenantCore = getTenantCoreModel(coreConnection);
    const tenant = await TenantCore.findOne({ tenantId }).select('nombre branding.logoUrl branding.displayName').lean();

    return {
      logoPath: mapUploadUrlToLocalPath(tenant?.branding?.logoUrl),
      academyName: String(tenant?.branding?.displayName || tenant?.nombre || '').trim()
    };
  } catch (_) {
    return { logoPath: null, academyName: '' };
  }
}

function renderEncabezadoFichaTecnica(doc, {
  institucionNombre = 'ESCUELA DE VOLEIBOL',
  subtitulo = '',
  sedeNombre = '-',
  logoPath = null,
  academyName = ''
} = {}) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const logoBoxSize = 68;
  const logoY = 30;
  const fallbackLogoPath = path.join(__dirname, '../assets/logo.png');

  let logoRendered = false;
  const drawLogo = (targetPath) => {
    if (!targetPath) return false;
    doc.image(targetPath, left, logoY, { fit: [logoBoxSize, logoBoxSize], align: 'center', valign: 'center' });
    return true;
  };

  try {
    logoRendered = drawLogo(logoPath);
  } catch (_) {
    logoRendered = false;
  }

  if (!logoRendered) {
    try {
      drawLogo(fallbackLogoPath);
    } catch (_) {
      // Continuar sin logo si falla fallback.
    }
  }

  const textX = left + logoBoxSize + 12;
  const textWidth = right - textX;
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#111827').text(
    String(institucionNombre || 'ESCUELA DE VOLEIBOL').trim(),
    textX,
    logoY + 2,
    { width: textWidth, align: 'center' }
  );

  if (subtitulo) {
    doc.font('Helvetica').fontSize(11).fillColor('#374151').text(String(subtitulo).trim(), textX, doc.y + 1, {
      width: textWidth,
      align: 'center'
    });
  }

  if (academyName) {
    doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text(String(academyName).trim(), textX, doc.y + 1, {
      width: textWidth,
      align: 'center'
    });
  }

  doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text(`SEDE "${String(sedeNombre || '-').trim().toUpperCase()}"`, textX, doc.y + 1, {
    width: textWidth,
    align: 'center'
  });

  doc.moveTo(left, Math.max(doc.y + 8, logoY + logoBoxSize + 8)).lineTo(right, Math.max(doc.y + 8, logoY + logoBoxSize + 8)).strokeColor('#e5e7eb').lineWidth(1).stroke();
  doc.y = Math.max(doc.y + 12, logoY + logoBoxSize + 14);
}

function drawDatoFicha(doc, label, value, x, y, width) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151').text(String(label || ''), x, y, { width });
  doc.font('Helvetica').fontSize(10).fillColor('#111827').text(String(value || '-'), x, y + 11, { width });
}

function normalizeFichaValue(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '-') {
    return {
      text: 'No registrado',
      muted: true
    };
  }

  return {
    text,
    muted: false
  };
}

function drawFichaFieldCell(doc, field, x, y, width) {
  const label = String(field?.label || '').trim();
  const meta = normalizeFichaValue(field?.value);

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#475569').text(label, x + 8, y + 7, {
    width: width - 16,
    align: 'left'
  });

  doc
    .font(meta.muted ? 'Helvetica-Oblique' : 'Helvetica')
    .fontSize(10)
    .fillColor(meta.muted ? '#94a3b8' : '#0f172a')
    .text(meta.text, x + 8, y + 19, {
      width: width - 16,
      align: 'left'
    });
}

function estimateFichaFieldHeight(doc, field, width) {
  const meta = normalizeFichaValue(field?.value);
  const labelHeight = doc.font('Helvetica-Bold').fontSize(8.5).heightOfString(String(field?.label || ''), {
    width: Math.max(20, width - 16)
  });
  const valueHeight = doc.font(meta.muted ? 'Helvetica-Oblique' : 'Helvetica').fontSize(10).heightOfString(meta.text, {
    width: Math.max(20, width - 16)
  });
  return labelHeight + valueHeight + 18;
}

function drawFichaSectionGrid(doc, {
  x,
  y,
  width,
  title,
  rows,
  columns = 3,
  gap = 8,
  minRowHeight = 44
}) {
  const headerBandHeight = 12;
  const titleTopOffset = 17;
  const contentTopOffset = 40;
  const colWidth = (width - (columns - 1) * gap) / columns;
  let cursorY = y + contentTopOffset;

  doc.save();
  doc.fillColor('#f8fafc').strokeColor('#e2e8f0').lineWidth(1).rect(x, y, width, headerBandHeight).fillAndStroke();
  doc.restore();
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor('#0f172a')
    .text(String(title || '').trim(), x + 10, y + titleTopOffset, {
      width: width - 20,
      align: 'left'
    });

  rows.forEach((row) => {
    const safeRow = Array.isArray(row) ? row.filter(Boolean) : [];
    if (!safeRow.length) return;

    let rowHeight = minRowHeight;
    let colPointer = 0;
    safeRow.forEach((field) => {
      const colSpan = Math.max(1, Math.min(columns, Number(field?.colSpan) || 1));
      if (colPointer + colSpan > columns) colPointer = 0;
      const fieldWidth = colSpan * colWidth + (colSpan - 1) * gap;
      const estimated = estimateFichaFieldHeight(doc, field, fieldWidth);
      rowHeight = Math.max(rowHeight, estimated + 8);
      colPointer += colSpan;
      if (colPointer >= columns) colPointer = 0;
    });

    colPointer = 0;
    safeRow.forEach((field) => {
      let colSpan = Math.max(1, Math.min(columns, Number(field?.colSpan) || 1));
      if (colPointer + colSpan > columns) {
        colPointer = 0;
      }
      if (colPointer + colSpan > columns) {
        colSpan = columns - colPointer;
      }

      const cellX = x + colPointer * (colWidth + gap);
      const cellWidth = colSpan * colWidth + (colSpan - 1) * gap;

      doc
        .save()
        .lineWidth(0.8)
        .strokeColor('#e2e8f0')
        .fillColor('#ffffff')
        .rect(cellX, cursorY, cellWidth, rowHeight)
        .fillAndStroke()
        .restore();

      drawFichaFieldCell(doc, field, cellX, cursorY, cellWidth);
      colPointer += colSpan;
    });

    cursorY += rowHeight + gap;
  });

  const sectionHeight = cursorY - y + 2;
  doc.save().lineWidth(1).strokeColor('#cbd5e1').rect(x, y, width, sectionHeight).stroke().restore();
  return y + sectionHeight;
}

function buildFichaFilename(alumno = {}) {
  const nombre = `${String(alumno?.nombres || '').trim()}_${String(alumno?.apellidos || '').trim()}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();

  return `ficha_tecnica_${nombre || 'atleta'}.pdf`;
}

exports.descargarFichaTecnica = async (req, res) => {
  try {
    const { Alumno: TenantAlumno, TenantConfig } = await getTenantAlumnoReadModels(req);
    const alumno = await TenantAlumno.findById(req.params.id).populate('representante').populate('sede').lean();

    if (!alumno) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const config = await TenantConfig.findOne({ key: 'default' }).select('constancias').lean();
    const institucionNombre = String(config?.constancias?.institucion_nombre || 'ESCUELA DE VOLEIBOL').trim();
    const subtitulo = String(config?.constancias?.subtitulo || '').trim();
    const sedeNombre = String(alumno?.sede?.nombre || '-').trim();
    const representante = alumno?.representante && typeof alumno.representante === 'object' ? alumno.representante : null;
    const atletaFotoPath = mapUploadUrlToLocalPath(alumno?.foto);
    const branding = await getBrandingFichaTecnica(req);

    const doc = new PDFDocument({ margin: 45, size: 'A4' });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${buildFichaFilename(alumno)}`);
      res.send(pdfData);
    });

    renderEncabezadoFichaTecnica(doc, {
      institucionNombre,
      subtitulo,
      sedeNombre,
      logoPath: branding.logoPath,
      academyName: branding.academyName
    });

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text('FICHA TÉCNICA DEL ATLETA', doc.page.margins.left, doc.y, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: 'center'
    });
    doc.moveDown(0.9);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const topY = doc.y;
    const photoBoxWidth = 118;
    const photoBoxHeight = 142;
    const photoX = right - photoBoxWidth;
    const photoY = topY;

    doc.rect(photoX, photoY, photoBoxWidth, photoBoxHeight).lineWidth(1).strokeColor('#cbd5e1').stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280').text('FOTO DEL ATLETA', photoX, photoY + 4, {
      width: photoBoxWidth,
      align: 'center'
    });

    if (atletaFotoPath) {
      try {
        doc.image(atletaFotoPath, photoX + 6, photoY + 18, {
          fit: [photoBoxWidth - 12, photoBoxHeight - 24],
          align: 'center',
          valign: 'center'
        });
      } catch (_) {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#9ca3af').text('No registrado', photoX, photoY + photoBoxHeight / 2 - 5, {
          width: photoBoxWidth,
          align: 'center'
        });
      }
    } else {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#9ca3af').text('No registrado', photoX, photoY + photoBoxHeight / 2 - 5, {
        width: photoBoxWidth,
        align: 'center'
      });
    }

    const sectionGap = 16;
    const atletaSectionWidth = (photoX - left) - sectionGap;
    const atletaEndY = drawFichaSectionGrid(doc, {
      x: left,
      y: topY,
      width: atletaSectionWidth,
      title: 'DATOS DEL ATLETA',
      columns: 2,
      rows: [
        [
          { label: 'Nombres', value: alumno?.nombres },
          { label: 'Apellidos', value: alumno?.apellidos }
        ],
        [
          { label: 'Cédula', value: alumno?.cedula },
          { label: 'Fecha de nacimiento', value: formatFechaFicha(alumno?.fecha_nacimiento) },
        ],
        [
          { label: 'Edad', value: `${calcularEdadFicha(alumno?.fecha_nacimiento)} años` },
          { label: 'Teléfono', value: alumno?.telefono }
        ],
        [
          { label: 'Fecha de ingreso', value: formatFechaFicha(alumno?.fecha_inscripcion) },
          { label: 'Dirección', value: alumno?.domicilio }
        ]
      ]
    });

    const repStartY = Math.max(photoY + photoBoxHeight + 18, atletaEndY + 16);
    drawFichaSectionGrid(doc, {
      x: left,
      y: repStartY,
      width: right - left,
      title: 'DATOS DEL REPRESENTANTE',
      columns: 2,
      rows: [
        [
          { label: 'Nombres', value: representante?.nombres },
          { label: 'Apellidos', value: representante?.apellidos }
        ],
        [
          { label: 'Cédula', value: representante?.cedula },
          { label: 'Fecha de nacimiento', value: formatFechaFicha(representante?.fecha_nacimiento) },
        ],
        [
          { label: 'Teléfono', value: representante?.telefono },
          { label: 'Correo', value: representante?.correo }
        ],
        [
          { label: 'Parentesco', value: alumno?.parentesco },
          { label: 'Dirección', value: representante?.direccion || representante?.domicilio }
        ]
      ]
    });

    doc.end();
  } catch (err) {
    console.error('Error al generar ficha técnica del atleta:', err);
    res.status(500).json({ error: 'Error al generar ficha técnica del atleta' });
  }
};

// Obtener un alumno por ID
exports.getAlumnoById = async (req, res) => {
  try {
    const { Alumno: TenantAlumno, TenantConfig } = await getTenantAlumnoReadModels(req);
    const alumno = await TenantAlumno.findById(req.params.id).populate('representante').populate('sede');
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const config = await TenantConfig.findOne().select('requisitos_recaudos').lean();
    const requisitosCatalogo = Array.isArray(config?.requisitos_recaudos)
      ? config.requisitos_recaudos.map((item) => sanitizeRequisitoLabel(item)).filter(Boolean)
      : [];

    const estadoRaw = Array.isArray(alumno.requisitos_recaudos_estado)
      ? alumno.requisitos_recaudos_estado
      : [];

    const estadoMap = new Map();
    estadoRaw.forEach((item) => {
      const requisito = sanitizeRequisitoLabel(item?.requisito);
      if (!requisito || estadoMap.has(requisito)) return;
      estadoMap.set(requisito, {
        requisito,
        cumplido: Boolean(item?.cumplido),
        updated_at: item?.updated_at || null,
        updated_by: item?.updated_by || null
      });
    });

    const checklist = requisitosCatalogo.map((requisito) => {
      const estado = estadoMap.get(requisito);
      return {
        requisito,
        cumplido: Boolean(estado?.cumplido),
        updated_at: estado?.updated_at || null,
        updated_by: estado?.updated_by || null
      };
    });

    const alumnoObj = alumno.toObject();
    alumnoObj.requisitos_catalogo = requisitosCatalogo;
    alumnoObj.requisitos_checklist = checklist;

    res.json(alumnoObj);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener alumno' });
  }
};

exports.actualizarEstadoRequisitoRecaudoAlumno = async (req, res) => {
  try {
    const {
      Alumno: TenantAlumno,
      TenantConfig
    } = await getTenantAlumnoWriteModels(req);

    const requisito = sanitizeRequisitoLabel(req.body?.requisito);
    if (!requisito) {
      return res.status(400).json({ error: 'El requisito es obligatorio' });
    }

    const cumplido = Boolean(req.body?.cumplido);

    const [alumno, config] = await Promise.all([
      TenantAlumno.findById(req.params.id),
      TenantConfig.findOne().select('requisitos_recaudos')
    ]);

    if (!alumno) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const requisitosCatalogo = Array.isArray(config?.requisitos_recaudos)
      ? config.requisitos_recaudos.map((item) => sanitizeRequisitoLabel(item)).filter(Boolean)
      : [];

    if (!requisitosCatalogo.includes(requisito)) {
      return res.status(400).json({ error: 'El requisito no pertenece al catalogo de la academia' });
    }

    const estado = Array.isArray(alumno.requisitos_recaudos_estado)
      ? alumno.requisitos_recaudos_estado
      : [];

    const idx = estado.findIndex((item) => sanitizeRequisitoLabel(item?.requisito) === requisito);
    const payload = {
      requisito,
      cumplido,
      updated_at: new Date(),
      updated_by: req.user?.id || null
    };

    if (idx >= 0) {
      estado[idx] = { ...estado[idx], ...payload };
    } else {
      estado.push(payload);
    }

    alumno.requisitos_recaudos_estado = estado;
    await alumno.save();

    return res.json({
      message: 'Estado del requisito actualizado',
      requisito,
      cumplido,
      requisitos_recaudos_estado: alumno.requisitos_recaudos_estado
    });
  } catch (err) {
    console.error('[actualizarEstadoRequisitoRecaudoAlumno] Error:', err);
    // Log extra info útil para depuración
    try {
      console.error('Request body:', req.body);
      console.error('Request params:', req.params);
      if (typeof req.user !== 'undefined') {
        console.error('Request user:', req.user);
      }
    } catch (logErr) {
      console.error('Error al loguear info extra:', logErr);
    }
    return res.status(500).json({ error: 'Error al actualizar requisito del alumno', detalle: err.message });
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
      Role: TenantRole,
      Sede: TenantSede,
      Mensualidad: TenantMensualidad,
      PagoDetalle: TenantPagoDetalle,
      Reposo: TenantReposo,
      TenantConfig: TenantConfigModel
    } = tenantModels;

    const alumnoActual = await TenantAlumno.findById(req.params.id).select('_id categoria sexo numero_franela nombres apellidos cedula usuario representante fecha_inicio_cobro tipo_mensualidad monto_personalizado_valor');
    if (!alumnoActual) return res.status(404).json({ error: 'Alumno no encontrado' });

    let updateData = { ...req.body };
    const rolUsuario = String(req.user?.rol || '').trim().toLowerCase();
    const esAdmin = rolUsuario === 'admin' || rolUsuario === 'super_admin';
    let fechaInicioCobroCambio = false;

    if (!esAdmin && Object.prototype.hasOwnProperty.call(updateData, 'division')) {
      delete updateData.division;
    }

    if (req.body.fecha_inicio_cobro !== undefined) {
      const fechaInicioCobro = parseDateInput(req.body.fecha_inicio_cobro);
      if (!fechaInicioCobro) {
        return res.status(400).json({ error: 'fecha_inicio_cobro es obligatoria y debe ser valida.' });
      }
      if (!esFechaDelAnioActual(fechaInicioCobro)) {
        return res.status(400).json({ error: getMensajeErrorFechaInicioCobroAnioActual() });
      }
      fechaInicioCobroCambio = !esMismaFechaUtc(fechaInicioCobro, alumnoActual.fecha_inicio_cobro);
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
    const repFechaNacimientoInput = req.body.rep_fecha_nacimiento !== undefined
      ? parseDateInput(req.body.rep_fecha_nacimiento)
      : undefined;
    const repCorreoInput = req.body.rep_correo !== undefined ? String(req.body.rep_correo || '').trim() : undefined;
    const repDireccionInput = req.body.rep_direccion !== undefined
      ? String(req.body.rep_direccion || '').trim()
      : repDomicilioInput;

    const hayCambiosRepresentante =
      repNombresInput !== undefined ||
      repApellidosInput !== undefined ||
      repCedulaInput !== undefined ||
      repTelefonoInput !== undefined ||
      repDomicilioInput !== undefined ||
      repFechaNacimientoInput !== undefined ||
      repCorreoInput !== undefined ||
      repDireccionInput !== undefined;

    delete updateData.rep_nombres;
    delete updateData.rep_apellidos;
    delete updateData.rep_cedula;
    delete updateData.rep_telefono;
    delete updateData.rep_domicilio;
    delete updateData.rep_fecha_nacimiento;
    delete updateData.rep_correo;
    delete updateData.rep_direccion;

    if (hayCambiosRepresentante) {
      let representanteObjetivoId = updateData.representante !== undefined
        ? updateData.representante
        : alumnoActual.representante;

      let representanteActual = null;
      if (representanteObjetivoId) {
        representanteActual = await TenantRepresentante.findById(representanteObjetivoId);
        if (!representanteActual) {
          return res.status(404).json({ error: 'Representante no encontrado para actualizar sus datos.' });
        }
      }

      const cedulaAnteriorRepresentante = representanteActual
        ? String(representanteActual.cedula || '').trim()
        : '';
      const cedulaNuevaRepresentante = repCedulaInput !== undefined ? repCedulaInput : cedulaAnteriorRepresentante;
      const nombresNuevosRepresentante = repNombresInput !== undefined
        ? repNombresInput
        : String(representanteActual?.nombres || '').trim();
      const apellidosNuevosRepresentante = repApellidosInput !== undefined
        ? repApellidosInput
        : String(representanteActual?.apellidos || '').trim();

      if (!cedulaNuevaRepresentante || !nombresNuevosRepresentante || !apellidosNuevosRepresentante) {
        return res.status(400).json({ error: 'Nombre, apellido y cedula del representante son obligatorios.' });
      }

      if (!representanteActual) {
        const representanteExistente = await TenantRepresentante.findOne({ cedula: cedulaNuevaRepresentante });
        if (representanteExistente) {
          representanteActual = representanteExistente;
        } else {
          representanteActual = new TenantRepresentante({
            nombres: nombresNuevosRepresentante,
            apellidos: apellidosNuevosRepresentante,
            cedula: cedulaNuevaRepresentante,
            telefono: repTelefonoInput || undefined,
            fecha_nacimiento: repFechaNacimientoInput || undefined,
            correo: repCorreoInput || undefined,
            direccion: repDireccionInput || undefined
          });
        }

        if (!representanteActual.usuario && alumnoActual.usuario) {
          representanteActual.usuario = alumnoActual.usuario;
        }

        const cedulaAnteriorParaCredenciales = alumnoActual.usuario
          ? String(alumnoActual.cedula || '').trim()
          : cedulaAnteriorRepresentante;

        await sincronizarUsuarioPortalRepresentante({
          representante: representanteActual,
          cedulaAnterior: cedulaAnteriorParaCredenciales,
          cedulaNueva: cedulaNuevaRepresentante,
          nombres: nombresNuevosRepresentante,
          apellidos: apellidosNuevosRepresentante,
          UserModel: TenantUser,
          RoleModel: TenantRole
        });

        if (repTelefonoInput !== undefined) representanteActual.telefono = repTelefonoInput;
        if (repFechaNacimientoInput !== undefined) representanteActual.fecha_nacimiento = repFechaNacimientoInput;
        if (repCorreoInput !== undefined) representanteActual.correo = repCorreoInput;
        if (repDireccionInput !== undefined) representanteActual.direccion = repDireccionInput;

        await representanteActual.save();
        updateData.representante = representanteActual._id;
        updateData.sinRepresentante = false;
      } else {
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
        if (repFechaNacimientoInput !== undefined) {
          representanteActual.fecha_nacimiento = repFechaNacimientoInput;
        }
        if (repCorreoInput !== undefined) {
          representanteActual.correo = repCorreoInput;
        }
        if (repDireccionInput !== undefined) {
          representanteActual.direccion = repDireccionInput;
        }

        await sincronizarUsuarioPortalRepresentante({
          representante: representanteActual,
          cedulaAnterior: cedulaAnteriorRepresentante,
          cedulaNueva: cedulaNuevaRepresentante,
          nombres: nombresNuevosRepresentante,
          apellidos: apellidosNuevosRepresentante,
          UserModel: TenantUser,
          RoleModel: TenantRole
        });
        await representanteActual.save();
        updateData.sinRepresentante = false;
      }
    }

    if (req.body.cedula !== undefined) {
      updateData.cedula = String(req.body.cedula || '').trim();
    }
    if (updateData.categoria !== undefined) {
      updateData.categoria = normalizarCategoria(updateData.categoria);
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'division')) {
      const divisionNormalizada = normalizarDivision(updateData.division);
      if (divisionNormalizada === null) {
        return res.status(400).json({ error: 'El campo division debe ser Primer division, Segunda division o Tercera division.' });
      }
      updateData.division = divisionNormalizada || null;
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'sexo')) {
      const sexoNormalizado = normalizarSexo(updateData.sexo);
      if (sexoNormalizado === null) {
        return res.status(400).json({ error: 'El campo sexo debe ser Femenino o Masculino.' });
      }
      updateData.sexo = sexoNormalizado || null;
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'numero_franela')) {
      const nro = normalizarNumeroFranela(updateData.numero_franela);
      updateData.numero_franela = nro === undefined ? null : nro;
    }
    const cambiaNumeroOCategoriaOSexo = updateData.numero_franela !== undefined || updateData.categoria !== undefined || updateData.sexo !== undefined;
    if (cambiaNumeroOCategoriaOSexo) {
      const categoriaObjetivo = updateData.categoria !== undefined
        ? updateData.categoria
        : alumnoActual.categoria;
      const numeroObjetivo = updateData.numero_franela !== undefined
        ? updateData.numero_franela
        : alumnoActual.numero_franela;
      const sexoObjetivo = updateData.sexo !== undefined
        ? updateData.sexo
        : alumnoActual.sexo;

      await validarNumeroFranelaDisponible({
        numeroFranela: numeroObjetivo,
        categoria: categoriaObjetivo,
        sexo: sexoObjetivo,
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
    if (Object.prototype.hasOwnProperty.call(updateData, 'dia_limite_personalizado')) {
      const diaLimite = normalizarDiaLimitePersonalizado(updateData.dia_limite_personalizado);
      if (Number.isNaN(diaLimite)) {
        return res.status(400).json({ error: 'dia_limite_personalizado debe ser un numero entero entre 1 y 31.' });
      }
      updateData.dia_limite_personalizado = diaLimite === undefined ? null : diaLimite;
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

    const tipoMensualidadObjetivo = String(
      updateData.tipo_mensualidad !== undefined ? updateData.tipo_mensualidad : alumnoActual.tipo_mensualidad
    || '').toLowerCase();

    if (tipoMensualidadObjetivo === 'monto_personalizado') {
      const montoPersonalizadoObjetivo = Number(
        updateData.monto_personalizado_valor !== undefined
          ? updateData.monto_personalizado_valor
          : alumnoActual.monto_personalizado_valor
      );

      if (!Number.isFinite(montoPersonalizadoObjetivo) || montoPersonalizadoObjetivo <= 0) {
        return res.status(400).json({ error: 'monto_personalizado_valor debe ser mayor a 0 cuando tipo_mensualidad es monto_personalizado.' });
      }

      if (updateData.monto_personalizado_valor !== undefined) {
        updateData.monto_personalizado_valor = redondearMonto(montoPersonalizadoObjetivo);
      }
    } else if (Object.prototype.hasOwnProperty.call(updateData, 'monto_personalizado_valor')) {
      updateData.monto_personalizado_valor = null;
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
      const usuarioRoleId = await getUsuarioRoleId(TenantRole);
      let user = await TenantUser.findOne({ email: cedulaObjetivo });
      if (!user) {
        const password = await bcrypt.hash(cedulaObjetivo, 10);
        user = new TenantUser({
          nombre: `${nombresObjetivo} ${apellidosObjetivo}`.trim(),
          email: cedulaObjetivo,
          password,
          rol: 'usuario',
          roleId: usuarioRoleId
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
      const montoBaseActualizado = await resolverMontoBaseAlumno(alumno, {
        Sede: TenantSede
      });

      const mensualidadesAlumno = await TenantMensualidad.find({
        id_alumno: alumno._id
      });
      const estatusRecalculables = new Set([
        'pendiente',
        'insolvente',
        'retrasado',
        'exonerado',
        'becado'
      ]);
      const mensualidadesPendientes = mensualidadesAlumno.filter((mensualidad) =>
        estatusRecalculables.has(normalizarEstatusTexto(mensualidad?.estatus))
      );

      for (const mensualidad of mensualidadesPendientes) {
        const creditoAplicado = redondearMonto(mensualidad.credito_aplicado || 0);
        const ajusteExtraordinario = redondearMonto(mensualidad.ajuste_extraordinario || 0);
        const montoSinRecargo = redondearMonto(
          Math.max(0, montoBaseActualizado - creditoAplicado - ajusteExtraordinario)
        );
        const recargoAplicado = redondearMonto(mensualidad.recargo_aplicado_usd || 0);

        mensualidad.monto_base = redondearMonto(montoBaseActualizado);
        mensualidad.monto_sin_recargo_usd = montoSinRecargo;
        mensualidad.monto_con_recargo_usd = redondearMonto(montoSinRecargo + recargoAplicado);
        mensualidad.monto_esperado = redondearMonto(montoSinRecargo + recargoAplicado);

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

    if (fechaInicioCobroCambio) {
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
  let session = null;
  try {
    const {
      Alumno: TenantAlumno,
      Representante: TenantRepresentante,
      User: TenantUser,
      Mensualidad: TenantMensualidad,
      PagoDetalle: TenantPagoDetalle,
      Reposo: TenantReposo,
      HistorialEstadoAlumno: TenantHistorialEstadoAlumno,
      ConstanciaSolicitud: TenantConstanciaSolicitud,
      UniformePedido: TenantUniformePedido,
      Partido: TenantPartido,
      Torneo: TenantTorneo
    } = await getTenantAlumnoWriteModels(req);

    if (TenantAlumno?.db && typeof TenantAlumno.db.startSession === 'function') {
      session = await TenantAlumno.db.startSession();
    }

    const eliminarEnCascada = async () => {
      const alumno = await applySession(TenantAlumno.findByIdAndDelete(req.params.id), session);
      if (!alumno) {
        const notFoundError = new Error('Alumno no encontrado');
        notFoundError.statusCode = 404;
        throw notFoundError;
      }

      const consultaMensualidades = applySession(TenantMensualidad.find({ id_alumno: alumno._id }), session);
      let mensualidades = [];
      if (consultaMensualidades && typeof consultaMensualidades.select === 'function') {
        const seleccion = await consultaMensualidades.select('_id');
        mensualidades = seleccion && typeof seleccion.lean === 'function'
          ? await seleccion.lean()
          : seleccion;
      } else {
        mensualidades = await consultaMensualidades;
      }

      if (!Array.isArray(mensualidades)) {
        mensualidades = [];
      }

      const mensualidadIds = (mensualidades || []).map((item) => item?._id).filter(Boolean);

      if (mensualidadIds.length > 0) {
        if (typeof TenantPagoDetalle?.deleteMany === 'function') {
          await applySession(
            TenantPagoDetalle.deleteMany({ id_mensualidad: { $in: mensualidadIds } }),
            session
          );
        }
      }

      const cleanupOps = [];

      if (typeof TenantMensualidad?.deleteMany === 'function') {
        cleanupOps.push(applySession(TenantMensualidad.deleteMany({ id_alumno: alumno._id }), session));
      }
      if (typeof TenantReposo?.deleteMany === 'function') {
        cleanupOps.push(applySession(TenantReposo.deleteMany({ id_alumno: alumno._id }), session));
      }
      if (typeof TenantHistorialEstadoAlumno?.deleteMany === 'function') {
        cleanupOps.push(applySession(TenantHistorialEstadoAlumno.deleteMany({ id_alumno: alumno._id }), session));
      }
      if (typeof TenantConstanciaSolicitud?.deleteMany === 'function') {
        cleanupOps.push(applySession(
          TenantConstanciaSolicitud.deleteMany({
            $or: [
              { alumno: alumno._id },
              { alumno_ids: alumno._id }
            ]
          }),
          session
        ));
      }
      if (typeof TenantUniformePedido?.deleteMany === 'function') {
        cleanupOps.push(applySession(TenantUniformePedido.deleteMany({ alumno: alumno._id }), session));
      }
      if (typeof TenantPartido?.updateMany === 'function') {
        cleanupOps.push(applySession(
          TenantPartido.updateMany(
            { 'convocados.alumno': alumno._id },
            { $pull: { convocados: { alumno: alumno._id } } }
          ),
          session
        ));
      }
      if (typeof TenantTorneo?.updateMany === 'function') {
        cleanupOps.push(applySession(
          TenantTorneo.updateMany(
            { 'convocados.alumno': alumno._id },
            { $pull: { convocados: { alumno: alumno._id } } }
          ),
          session
        ));
      }

      await Promise.all(cleanupOps);

      if (alumno.representante) {
        const otroAlumnoConRepresentante = await applySession(
          TenantAlumno.findOne({
            representante: alumno.representante,
            _id: { $ne: alumno._id }
          }),
          session
        ).select('_id');

        if (!otroAlumnoConRepresentante) {
          const representante = await applySession(
            TenantRepresentante.findByIdAndDelete(alumno.representante),
            session
          );

          if (representante?.usuario) {
            await eliminarUsuarioSiQuedaHuerfano(
              representante.usuario,
              {
                Alumno: TenantAlumno,
                Representante: TenantRepresentante,
                User: TenantUser
              },
              { session }
            );
          }
        }
      }

      if (alumno.usuario) {
        await eliminarUsuarioSiQuedaHuerfano(
          alumno.usuario,
          {
            Alumno: TenantAlumno,
            Representante: TenantRepresentante,
            User: TenantUser
          },
          { session }
        );
      }
    };

    if (session && typeof session.withTransaction === 'function') {
      try {
        await session.withTransaction(eliminarEnCascada);
      } catch (txError) {
        const msg = String(txError?.message || '');
        const txNoSoportada =
          msg.includes('Transaction numbers are only allowed on a replica set member or mongos') ||
          msg.includes('Standalone servers do not support transactions');

        if (!txNoSoportada) {
          throw txError;
        }

        // Fallback para entornos locales con Mongo standalone sin soporte de transacciones.
        await eliminarEnCascada();
      }
    } else {
      await eliminarEnCascada();
    }

    res.json({ message: 'Alumno eliminado' });
  } catch (err) {
    if (err?.statusCode === 404) {
      return res.status(404).json({ error: err.message });
    }
    console.error('Error al eliminar alumno:', {
      alumnoId: req.params?.id,
      name: err?.name,
      message: err?.message
    });
    res.status(500).json({ error: 'Error al eliminar alumno' });
  } finally {
    if (session && typeof session.endSession === 'function') {
      await session.endSession();
    }
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

// Anular una baja accidental sin generar reingreso ni cobros
exports.anularBajaAlumno = async (req, res) => {
  try {
    const {
      Alumno: TenantAlumno,
      Mensualidad: TenantMensualidad,
      HistorialEstadoAlumno: TenantHistorialEstadoAlumno
    } = await getTenantAlumnoWriteModels(req);

    const alumnoActual = await TenantAlumno.findById(req.params.id).select('_id activo dado_de_baja estado fecha_baja motivo_baja numero_franela');
    if (!alumnoActual) return res.status(404).json({ error: 'Alumno no encontrado' });
    if (alumnoActual.activo !== false && alumnoActual.dado_de_baja !== true) {
      return res.status(400).json({ error: 'El alumno ya se encuentra activo.' });
    }

    if (!alumnoActual.fecha_baja) {
      return res.status(409).json({
        error: 'La baja no tiene una fecha válida. Debes usar el proceso de reingreso.',
        code: 'REINGRESO_REQUIRED'
      });
    }

    const fechaBaja = new Date(alumnoActual.fecha_baja);
    const fechaActual = new Date();
    const mismoMesYAnio = fechaBaja.getMonth() === fechaActual.getMonth() && fechaBaja.getFullYear() === fechaActual.getFullYear();
    if (!mismoMesYAnio) {
      return res.status(409).json({
        error: 'Solo puedes deshacer la baja en el mismo mes en que ocurrió. Debes usar reingreso.',
        code: 'REINGRESO_REQUIRED'
      });
    }

    const mensualidadDelMes = await TenantMensualidad.findOne({
      id_alumno: alumnoActual._id,
      mes: fechaBaja.getMonth() + 1,
      anio: fechaBaja.getFullYear()
    }).select('_id estatus mes anio');

    if (!mensualidadDelMes) {
      return res.status(409).json({
        error: 'No existe la mensualidad generada de ese mes. Debes usar reingreso.',
        code: 'REINGRESO_REQUIRED'
      });
    }

    const fechaAnulacion = new Date();
    const alumno = await TenantAlumno.findByIdAndUpdate(
      req.params.id,
      {
        activo: true,
        dado_de_baja: false,
        estado: 'Activo',
        $unset: {
          fecha_baja: '',
          motivo_baja: ''
        }
      },
      { new: true }
    );

    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    await TenantHistorialEstadoAlumno.create({
      id_alumno: alumno._id,
      tipo_movimiento: 'REACTIVACION',
      fecha_evento: fechaAnulacion,
      motivo: 'Baja anulada sin reingreso',
      actor_id: req.user?.id || undefined,
      metadata: {
        estado_resultante: 'Activo',
        anula_movimiento: 'BAJA',
        tipo_operacion: 'ANULACION_BAJA'
      }
    });

    res.json({ message: 'Baja anulada. El alumno fue restaurado sin generar reingreso.', alumno });
  } catch (err) {
    res.status(400).json({ error: 'Error al anular la baja del alumno' });
  }
};

// Reactivar un alumno (revertir baja)
exports.reactivarAlumno = async (req, res) => {
  try {
    const {
      Alumno: TenantAlumno,
      Sede: TenantSede,
      Mensualidad: TenantMensualidad,
      PagoDetalle: TenantPagoDetalle,
      HistorialEstadoAlumno: TenantHistorialEstadoAlumno,
      TenantConfig: TenantConfigModel
    } = await getTenantAlumnoWriteModels(req);

    const alumnoActual = await TenantAlumno.findById(req.params.id).populate('sede');
    if (!alumnoActual) return res.status(404).json({ error: 'Alumno no encontrado' });
    if (alumnoActual.activo !== false && alumnoActual.dado_de_baja !== true) {
      return res.status(400).json({ error: 'El alumno ya se encuentra activo.' });
    }

    const montoReingreso = normalizarMontoOpcional(req.body?.monto_reingreso);
    const montoPrimeraMensualidad = normalizarMontoOpcional(
      req.body?.monto_primera_mensualidad !== undefined
        ? req.body?.monto_primera_mensualidad
        : req.body?.monto_mensualidad
    );
    const montoPagadoUsd = normalizarMontoOpcional(req.body?.monto_pagado);
    const montoPagadoBs = normalizarMontoBsOpcional(req.body?.monto_pagado_bs);
    const montoEsperadoBs = normalizarMontoBsOpcional(req.body?.monto_esperado_bs);
    const metodoPago = String(req.body?.metodo_pago || '').trim();
    const referencia = String(req.body?.referencia || '').trim();
    const comentarioReingreso = String(req.body?.comentario_reingreso || '').trim();
    const fechaPago = parseDateInput(req.body?.fecha_pago) || new Date();
    const fechaReingreso = parseDateInput(req.body?.fecha_reingreso);

    if (!fechaReingreso) {
      return res.status(400).json({ error: 'fecha_reingreso es requerida y debe ser valida.' });
    }

    if (!Number.isFinite(montoReingreso) || montoReingreso <= 0) {
      return res.status(400).json({ error: 'monto_reingreso invalido' });
    }
    if (!Number.isFinite(montoPrimeraMensualidad) || montoPrimeraMensualidad <= 0) {
      return res.status(400).json({ error: 'monto_primera_mensualidad invalido' });
    }
    const totalEsperado = redondearMonto(montoReingreso + montoPrimeraMensualidad);
    const totalPagado = redondearMonto(Math.max(0, montoPagadoUsd || 0));
    const tienePago = totalPagado > 0;

    if (tienePago && !metodoPago) {
      return res.status(400).json({ error: 'metodo_pago es requerido cuando monto_pagado es mayor a 0' });
    }
    if (tienePago && metodoRequiereReferencia(metodoPago) && !/^[0-9]{6,}$/.test(referencia)) {
      return res.status(400).json({ error: 'La referencia de pago debe tener minimo 6 digitos.' });
    }
    const periodoReingreso = obtenerPeriodoDesdeFecha(fechaReingreso);
    const periodoActual = getPeriodoZonaCaracas();

    if (!periodoReingreso) {
      return res.status(400).json({ error: 'No se pudo resolver el periodo de reingreso.' });
    }
    if (
      periodoReingreso.anio > periodoActual.anio ||
      (periodoReingreso.anio === periodoActual.anio && periodoReingreso.mes > periodoActual.mes)
    ) {
      return res.status(400).json({ error: 'La fecha de reingreso no puede estar en un periodo futuro.' });
    }

    const periodosObjetivo = construirPeriodosEntre(periodoReingreso, periodoActual);
    if (!periodosObjetivo.length) {
      return res.status(400).json({ error: 'No hay periodos validos para generar mensualidades.' });
    }

    const ultimaMensualidadGenerada = await TenantMensualidad.findOne({
      id_alumno: alumnoActual._id
    })
      .sort({ anio: -1, mes: -1, createdAt: -1 })
      .select('mes anio')
      .lean();

    if (ultimaMensualidadGenerada && compararPeriodos(periodoReingreso, ultimaMensualidadGenerada) <= 0) {
      return res.status(409).json({
        error: `La fecha de reingreso debe estar despues de la ultima mensualidad generada (${formatPeriodoTexto(ultimaMensualidadGenerada)}).`
      });
    }

    const mensualidadInicioExistente = await TenantMensualidad.findOne({
      id_alumno: alumnoActual._id,
      mes: periodoReingreso.mes,
      anio: periodoReingreso.anio
    });

    if (mensualidadInicioExistente) {
      return res.status(409).json({
        error: 'Ya existe una mensualidad en el periodo de reingreso seleccionado.'
      });
    }

    const condicionesPeriodos = periodosObjetivo.map((periodo) => ({ mes: periodo.mes, anio: periodo.anio }));
    const mensualidadesExistentes = await TenantMensualidad.find({
      id_alumno: alumnoActual._id,
      $or: condicionesPeriodos
    })
      .select('_id mes anio')
      .lean();
    const existentesSet = new Set(
      mensualidadesExistentes.map((item) => `${Number(item?.anio)}-${Number(item?.mes)}`)
    );

    const diaVencimiento = await obtenerDiaVencimientoCobro({ TenantConfig: TenantConfigModel });
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

    const montoBaseAlumno = await resolverMontoBaseAlumno(alumnoActual, {
      Sede: TenantSede
    });

    const mensualidadesGeneradas = [];
    let mensualidadPrimerPeriodo = null;

    for (const periodo of periodosObjetivo) {
      const keyPeriodo = `${periodo.anio}-${periodo.mes}`;
      if (existentesSet.has(keyPeriodo)) continue;

      const esPrimerPeriodo =
        periodo.mes === periodoReingreso.mes &&
        periodo.anio === periodoReingreso.anio;

      const fechaVencimientoPeriodo = construirFinDeDiaCaracasPeriodo(periodo.anio, periodo.mes, diaVencimiento);
      const montoEsperadoPeriodo = esPrimerPeriodo ? totalEsperado : montoBaseAlumno;
      const estatusPeriodoInicial = esPrimerPeriodo ? estatusInicial : 'Pendiente';

      const mensualidadCreada = await TenantMensualidad.create({
        id_alumno: alumnoActual._id,
        mes: periodo.mes,
        anio: periodo.anio,
        monto_base: montoEsperadoPeriodo,
        credito_aplicado: 0,
        ajuste_extraordinario: 0,
        saldo_a_favor_generado: 0,
        monto_esperado: montoEsperadoPeriodo,
        monto_reingreso: esPrimerPeriodo ? montoReingreso : undefined,
        monto_mensualidad_reingreso: esPrimerPeriodo ? montoPrimeraMensualidad : undefined,
        tipo_registro_inicial: esPrimerPeriodo ? 'reingreso' : undefined,
        monto_equivalente_bs: esPrimerPeriodo ? montoEsperadoBs : undefined,
        fecha_pago: (esPrimerPeriodo && tienePago) ? fechaPago : undefined,
        metodo_pago: (esPrimerPeriodo && tienePago) ? metodoPago : undefined,
        referencia: (esPrimerPeriodo && tienePago) ? (referencia || undefined) : undefined,
        comprobante_url: esPrimerPeriodo ? comprobanteUrl : undefined,
        fecha_vencimiento: fechaVencimientoPeriodo,
        estatus: estatusPeriodoInicial
      });

      if (esPrimerPeriodo) {
        mensualidadPrimerPeriodo = mensualidadCreada;
      }

      await recalcularMensualidadPorPagos(mensualidadCreada, estatusPeriodoInicial, {
        Alumno: TenantAlumno,
        Mensualidad: TenantMensualidad,
        PagoDetalle: TenantPagoDetalle
      });

      mensualidadesGeneradas.push(mensualidadCreada);
    }

    if (!mensualidadPrimerPeriodo) {
      return res.status(409).json({ error: 'No se pudo generar la mensualidad del periodo de reingreso.' });
    }

    let pagoRegistrado = null;
    const pagosRegistrados = [];
    if (totalPagado > 0) {
      const asignacionesPago = distribuirPagoReingresoEntreMensualidades({
        mensualidades: mensualidadesGeneradas.map((mensualidad) => ({
          mensualidad,
          montoEsperadoUsd: Number(mensualidad?.monto_esperado) || 0
        })),
        montoPagadoUsd: totalPagado,
        montoPagadoBs,
        montoReingreso,
        montoPrimeraMensualidad
      });

      for (let index = 0; index < asignacionesPago.length; index += 1) {
        const asignacion = asignacionesPago[index];
        if (!asignacion || asignacion.montoAplicadoUsd <= 0) continue;

        const mensualidadDestino = asignacion.mensualidad;
        const pagoCreado = await TenantPagoDetalle.create({
          id_mensualidad: mensualidadDestino._id,
          concepto: index === 0 ? 'Reingreso alumno' : 'Mensualidad reingreso',
          origen: 'reactivacion',
          conceptos_detalle: asignacion.conceptosDetalle,
          monto_pagado: asignacion.montoAplicadoUsd,
          monto_pagado_bs: asignacion.montoAplicadoBs,
          monto_esperado_usd: Number(mensualidadDestino?.monto_esperado) || 0,
          monto_esperado_bs: index === 0 ? montoEsperadoBs : undefined,
          fecha_pago: fechaPago,
          metodo_pago: metodoPago,
          referencia: referencia || 'reingreso',
          comprobante_url: comprobanteUrl
        });

        pagosRegistrados.push(pagoCreado);

        await recalcularMensualidadPorPagos(mensualidadDestino, index === 0 ? estatusInicial : 'Pendiente', {
          Alumno: TenantAlumno,
          Mensualidad: TenantMensualidad,
          PagoDetalle: TenantPagoDetalle
        });
      }

      pagoRegistrado = pagosRegistrados[0] || null;
    }

    const numeroFranelaAnterior = alumnoActual.numero_franela ?? null;

    const alumno = await TenantAlumno.findByIdAndUpdate(
      req.params.id,
      {
        activo: true,
        dado_de_baja: false,
        estado: 'Activo',
        numero_franela: null
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
        monto_mensualidad: montoPrimeraMensualidad,
        monto_primera_mensualidad_reingreso: montoPrimeraMensualidad,
        monto_total_esperado: totalEsperado,
        monto_total_pagado: totalPagado,
        fecha_reingreso: fechaReingreso,
        metodo_pago: metodoPago,
        referencia: referencia || undefined,
        mensualidad_id: mensualidadPrimerPeriodo?._id,
        mensualidades_generadas: mensualidadesGeneradas.map((item) => ({
          id: item?._id,
          mes: item?.mes,
          anio: item?.anio
        })),
        pagos_generados: pagosRegistrados.map((item) => ({
          id: item?._id,
          id_mensualidad: item?.id_mensualidad,
          monto_pagado: item?.monto_pagado,
          monto_pagado_bs: item?.monto_pagado_bs
        })),
        pago_id: pagoRegistrado?._id || undefined,
        numero_franela_anterior: numeroFranelaAnterior,
        requiere_reasignacion_franela: true
      }
    });

    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
    res.json({
      message: 'Alumno reactivado y reingreso registrado. Debes reasignar el nro de franela.',
      alumno,
      mensualidad: mensualidadPrimerPeriodo,
      mensualidades_generadas: mensualidadesGeneradas,
      pago: pagoRegistrado,
      pagos: pagosRegistrados,
      requiere_reasignacion_franela: true,
      numero_franela_anterior: numeroFranelaAnterior
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

// ======================= ASIGNACION MASIVA DE CATEGORIAS =======================
const REGLAS_CATEGORIA_DEFAULT = [
  { etiqueta: 'U9/INICIACION', anio_nacimiento_desde: 2017, anio_nacimiento_hasta: null, orden: 1 },
  { etiqueta: 'U11/FORMACION', anio_nacimiento_desde: 2015, anio_nacimiento_hasta: 2016, orden: 2 },
  { etiqueta: 'U13/MINI', anio_nacimiento_desde: 2013, anio_nacimiento_hasta: 2014, orden: 3 },
  { etiqueta: 'U15/INFANTIL', anio_nacimiento_desde: 2011, anio_nacimiento_hasta: 2012, orden: 4 },
  { etiqueta: 'U17/JUVENIL', anio_nacimiento_desde: 2009, anio_nacimiento_hasta: 2010, orden: 5 },
  { etiqueta: 'U19/JUVENIL LIBRE', anio_nacimiento_desde: 2007, anio_nacimiento_hasta: 2008, orden: 6 },
  { etiqueta: 'U21', anio_nacimiento_desde: 2005, anio_nacimiento_hasta: 2006, orden: 7 },
  { etiqueta: 'MAYORES / LIBRE', anio_nacimiento_desde: null, anio_nacimiento_hasta: 2004, orden: 8 }
];

function getAnioNacimientoFromFecha(fechaNacimiento) {
  if (!fechaNacimiento) return '';

  let nacimiento = null;

  if (fechaNacimiento instanceof Date && !Number.isNaN(fechaNacimiento.getTime())) {
    nacimiento = fechaNacimiento;
  } else {
    const raw = String(fechaNacimiento).trim();
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      nacimiento = parsed;
    }
  }

  if (!nacimiento || Number.isNaN(nacimiento.getTime())) return null;

  return nacimiento.getFullYear();
}

function parseOptionalYear(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function normalizeReglasCategorias(reglas) {
  const source = Array.isArray(reglas) && reglas.length > 0 ? reglas : REGLAS_CATEGORIA_DEFAULT;

  return source
    .map((item, index) => ({
      etiqueta: String(item?.etiqueta || '').trim(),
      anio_nacimiento_desde: parseOptionalYear(item?.anio_nacimiento_desde),
      anio_nacimiento_hasta: parseOptionalYear(item?.anio_nacimiento_hasta),
      orden: Number.isFinite(Number(item?.orden)) ? Number(item.orden) : (index + 1)
    }))
    .filter((item) => item.etiqueta !== '')
    .sort((a, b) => a.orden - b.orden);
}

function normalizeReglasCategoriasSinFallback(reglas) {
  if (!Array.isArray(reglas) || reglas.length === 0) {
    return [];
  }

  return reglas
    .map((item, index) => ({
      etiqueta: String(item?.etiqueta || '').trim(),
      anio_nacimiento_desde: parseOptionalYear(item?.anio_nacimiento_desde),
      anio_nacimiento_hasta: parseOptionalYear(item?.anio_nacimiento_hasta),
      orden: Number.isFinite(Number(item?.orden)) ? Number(item.orden) : (index + 1)
    }))
    .filter((item) => item.etiqueta !== '')
    .sort((a, b) => a.orden - b.orden);
}

function normalizarCategoriaImportacion(valor) {
  return normalizarClaveCategoria(valor);
}

function resolverCategoriaDesdeReglas(valor, reglasCategorias = []) {
  const categoriaNormalizada = normalizarCategoriaImportacion(valor);
  if (!categoriaNormalizada) return '';

  const reglaCoincidente = reglasCategorias.find((regla) => normalizarCategoriaImportacion(regla.etiqueta) === categoriaNormalizada);
  return reglaCoincidente?.etiqueta || '';
}

async function getCategoriasConfigTenant(TenantConfigModel) {
  const configCategorias = await TenantConfigModel.findOne({ key: 'default' }).select('categorias').lean();
  const disciplina = String(configCategorias?.categorias?.disciplina || 'voleibol').trim().toLowerCase() || 'voleibol';
  const reglasCategorias = normalizeReglasCategorias(configCategorias?.categorias?.reglas || REGLAS_CATEGORIA_DEFAULT);
  const categoriasDisponibles = reglasCategorias.map((item) => item.etiqueta).filter(Boolean);

  return {
    disciplina,
    reglasCategorias,
    categoriasDisponibles
  };
}

function getCategoriaPorFechaNacimiento(fechaNacimiento, reglas) {
  const anioNacimiento = getAnioNacimientoFromFecha(fechaNacimiento);
  if (!Number.isFinite(anioNacimiento)) return '';

  const reglasOrdenadas = normalizeReglasCategorias(reglas);
  for (const regla of reglasOrdenadas) {
    const cumpleDesde = regla.anio_nacimiento_desde === null || anioNacimiento >= regla.anio_nacimiento_desde;
    const cumpleHasta = regla.anio_nacimiento_hasta === null || anioNacimiento <= regla.anio_nacimiento_hasta;
    if (cumpleDesde && cumpleHasta) {
      return regla.etiqueta;
    }
  }

  return '';
}

exports.getCategoriaSugerida = async (req, res) => {
  try {
    const { TenantConfig } = await getTenantAlumnoWriteModels(req);
    const { disciplina, reglasCategorias, categoriasDisponibles } = await getCategoriasConfigTenant(TenantConfig);

    const fechaNacimiento = req.query.fecha_nacimiento || req.query.fechaNacimiento || '';
    const categoriaSugerida = fechaNacimiento
      ? getCategoriaPorFechaNacimiento(fechaNacimiento, reglasCategorias)
      : '';

    return res.json({
      disciplina,
      categoria_sugerida: categoriaSugerida,
      categorias_disponibles: categoriasDisponibles
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error al sugerir categoria.', detalle: err.message });
  }
};

exports.previewAsignarCategoriasMasivamente = async (req, res) => {
  try {
    const { Alumno: TenantAlumno, TenantConfig } = await getTenantAlumnoWriteModels(req);
    const { disciplina, reglasCategorias } = await getCategoriasConfigTenant(TenantConfig);

    const alumnos = await TenantAlumno.find({
      activo: { $ne: false },
      dado_de_baja: { $ne: true }
    }).select('_id nombres apellidos categoria fecha_nacimiento');

    let evaluados = 0;
    let conFechaNacimiento = 0;
    let sinFechaNacimiento = 0;
    let cambiosEstimados = 0;
    const muestraCambios = [];

    for (const alumno of alumnos) {
      evaluados += 1;
      if (!alumno.fecha_nacimiento) {
        sinFechaNacimiento += 1;
        continue;
      }

      conFechaNacimiento += 1;
      const categoriaSugerida = getCategoriaPorFechaNacimiento(alumno.fecha_nacimiento, reglasCategorias);
      const categoriaActual = String(alumno.categoria || '').trim();

      if (categoriaSugerida && categoriaSugerida !== categoriaActual) {
        cambiosEstimados += 1;
        if (muestraCambios.length < 30) {
          muestraCambios.push({
            id: alumno._id,
            alumno: `${String(alumno.nombres || '').trim()} ${String(alumno.apellidos || '').trim()}`.trim(),
            fecha_nacimiento: alumno.fecha_nacimiento,
            categoria_actual: categoriaActual,
            categoria_sugerida: categoriaSugerida
          });
        }
      }
    }

    return res.json({
      disciplina,
      evaluados,
      con_fecha_nacimiento: conFechaNacimiento,
      sin_fecha_nacimiento: sinFechaNacimiento,
      cambios_estimados: cambiosEstimados,
      muestra_cambios: muestraCambios
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error al generar preview de asignacion de categorias.', detalle: err.message });
  }
};

exports.asignarCategoriasMasivamente = async (req, res) => {
  try {
    const { Alumno: TenantAlumno, TenantConfig } = await getTenantAlumnoWriteModels(req);
    const { reglasCategorias } = await getCategoriasConfigTenant(TenantConfig);

    const alumnos = await TenantAlumno.find({ 
      activo: { $ne: false }, 
      dado_de_baja: { $ne: true } 
    }).select('_id categoria fecha_nacimiento');
    const operaciones = [];
    
    for (const alumno of alumnos) {
      if (alumno.fecha_nacimiento) {
        const nuevaCat = getCategoriaPorFechaNacimiento(alumno.fecha_nacimiento, reglasCategorias);
        const categoriaActual = String(alumno.categoria || '').trim();
        if (nuevaCat && categoriaActual !== nuevaCat) {
          operaciones.push({
            updateOne: {
              filter: { _id: alumno._id },
              update: { $set: { categoria: nuevaCat } }
            }
          });
        }
      }
    }

    let actualizados = 0;
    if (operaciones.length > 0) {
      const resultado = await TenantAlumno.bulkWrite(operaciones, { ordered: false });
      actualizados = Number(resultado.modifiedCount || 0);
    }
    
    return res.json({ 
      message: `Categorías asignadas correctamente. Se actualizaron ${actualizados} alumno(s).` 
    });
  } catch (err) {
    console.error('Error en asignarCategoriasMasivamente:', err);
    return res.status(500).json({ error: 'Error del servidor al asignar categorias masivamente', detalle: err.message });
  }
};
