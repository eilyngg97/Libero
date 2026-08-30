const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');

function trimValue(value) {
  return String(value || '').trim();
}

function normalizeLowerTrim(value) {
  return trimValue(value).toLowerCase();
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveDuplicateMessage(err) {
  const keyPattern = err?.keyPattern || {};
  const keyValue = err?.keyValue || {};
  const dupField = Object.keys(keyPattern)[0] || Object.keys(keyValue)[0] || '';
  const rawMessage = String(err?.message || '');

  if (dupField === 'cedula' || /cedula_1/i.test(rawMessage)) {
    return 'Ya existe un entrenador con esa cedula';
  }

  if (dupField === 'email' || /email_1/i.test(rawMessage)) {
    return 'Ya existe un usuario con esa cedula en el sistema';
  }

  if (dupField === 'correo' || /academia_1_correo_1/i.test(rawMessage) || /correo_1/i.test(rawMessage)) {
    return 'Ya existe un entrenador con ese correo en esta academia';
  }

  if (dupField) {
    return `Registro duplicado en el campo: ${dupField}`;
  }

  return 'Registro duplicado detectado';
}

function buildUploadUrl(req, file, folder) {
  if (!file || !file.filename) return null;
  const tenantId = resolveRequestTenantId(req);
  return `/uploads/${tenantId}/${folder}/${file.filename}`;
}

function normalizeCertificacionUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('/entrenadores/certificaciones/')) return url;
  if (url.includes('/entrenadores/contratos/')) return url;
  if (url.includes('/entrenadores/')) {
    return url.replace('/entrenadores/', '/entrenadores/certificaciones/');
  }
  return url;
}

function normalizeContratoUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('/entrenadores/contratos/')) return url;
  if (url.includes('/entrenadores/certificaciones/')) return url;
  if (url.includes('/entrenadores/')) {
    return url.replace('/entrenadores/', '/entrenadores/contratos/');
  }
  return url;
}

function normalizeEntrenadorMedia(entrenador) {
  if (!entrenador) return entrenador;
  if (Array.isArray(entrenador.certificaciones)) {
    entrenador.certificaciones = entrenador.certificaciones.map(normalizeCertificacionUrl);
  }
  if (Array.isArray(entrenador.contratos)) {
    entrenador.contratos = entrenador.contratos.map(normalizeContratoUrl);
  }
  return entrenador;
}

function parseTallaUniforme(rawValue) {
  if (!rawValue) return {};
  if (typeof rawValue === 'object') return rawValue;

  try {
    const parsed = JSON.parse(String(rawValue));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function parseStringArray(rawValue) {
  if (!rawValue) return [];

  if (Array.isArray(rawValue)) {
    return rawValue
      .map((item) => trimValue(item))
      .filter(Boolean);
  }

  if (typeof rawValue === 'string') {
    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => trimValue(item))
          .filter(Boolean);
      }
    } catch (_) {
      return rawValue
        .split(',')
        .map((item) => trimValue(item))
        .filter(Boolean);
    }
  }

  return [];
}

function parsePaymentConfig(rawValue) {
  if (!rawValue) {
    return {
      monto_base_usd: 0,
      frecuencia_pago: '',
      metodos: [],
      pago_movil: {},
      transferencia: {}
    };
  }

  if (typeof rawValue === 'object') {
    return {
      monto_base_usd: rawValue.monto_base_usd,
      frecuencia_pago: rawValue.frecuencia_pago,
      metodos: parseStringArray(rawValue.metodos),
      pago_movil: rawValue.pago_movil || {},
      transferencia: rawValue.transferencia || {}
    };
  }

  try {
    const parsed = JSON.parse(String(rawValue));
    return {
      monto_base_usd: parsed?.monto_base_usd,
      frecuencia_pago: parsed?.frecuencia_pago,
      metodos: parseStringArray(parsed?.metodos),
      pago_movil: parsed?.pago_movil || {},
      transferencia: parsed?.transferencia || {}
    };
  } catch (_) {
    return {
      monto_base_usd: 0,
      frecuencia_pago: '',
      metodos: [],
      pago_movil: {},
      transferencia: {}
    };
  }
}

function normalizeFrecuenciaPago(value) {
  const raw = trimValue(value).toLowerCase();
  if (!raw) return '';
  if (['quincenal', 'semanal', 'por_sesion'].includes(raw)) return raw;
  return null;
}

function parseMontoBaseUsd(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Number(numeric.toFixed(2));
}

function round2(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(2));
}

function normalizeCurrency(value) {
  return String(value || '').trim().toUpperCase() === 'VES' ? 'VES' : 'USD';
}

function normalizeMetodoPago(value) {
  const raw = trimValue(value).toLowerCase();
  if (['transferencia', 'pago_movil', 'zelle', 'efectivo'].includes(raw)) return raw;
  return '';
}

function getPenultimateDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate() - 1;
}

function getIsoWeekKey(date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function resolvePeriodoClave({ frecuenciaPago, fechaPago }) {
  const year = fechaPago.getFullYear();
  const month = String(fechaPago.getMonth() + 1).padStart(2, '0');
  const day = fechaPago.getDate();

  if (frecuenciaPago === 'quincenal') {
    const quincena = day <= 14 ? 'q1' : 'q2';
    return `${year}-${month}-${quincena}`;
  }

  if (frecuenciaPago === 'semanal') {
    return getIsoWeekKey(fechaPago);
  }

  return `${year}-${month}`;
}

function resolvePeriodoClaveFromPeriodoTexto({ frecuenciaPago, periodo, fechaPago }) {
  const rawPeriodo = normalizeLowerTrim(periodo);
  if (!rawPeriodo || !(fechaPago instanceof Date) || Number.isNaN(fechaPago.getTime())) {
    return '';
  }

  const year = fechaPago.getFullYear();
  const month = String(fechaPago.getMonth() + 1).padStart(2, '0');

  if (frecuenciaPago === 'quincenal') {
    if (rawPeriodo.includes('1ra') || rawPeriodo.includes('primera') || rawPeriodo.includes('q1')) {
      return `${year}-${month}-q1`;
    }
    if (rawPeriodo.includes('2da') || rawPeriodo.includes('segunda') || rawPeriodo.includes('q2')) {
      return `${year}-${month}-q2`;
    }
  }

  if (frecuenciaPago === 'mensual') {
    return `${year}-${month}`;
  }

  return '';
}

function resolvePagoPeriodoClaveForMatch({ pago, frecuenciaPagoFallback }) {
  const explicitKey = trimValue(pago?.periodo_clave);
  if (explicitKey) return explicitKey;

  const frecuenciaPago = normalizeFrecuenciaPago(pago?.frecuencia_pago) || frecuenciaPagoFallback || 'mensual';
  const fechaPago = pago?.fecha_pago ? new Date(pago.fecha_pago) : null;
  if (!(fechaPago instanceof Date) || Number.isNaN(fechaPago.getTime())) return '';

  const fromLabel = resolvePeriodoClaveFromPeriodoTexto({
    frecuenciaPago,
    periodo: pago?.periodo,
    fechaPago
  });
  if (fromLabel) return fromLabel;

  return resolvePeriodoClave({ frecuenciaPago, fechaPago });
}

function getMontoBaseMensualUsd(entrenador = {}) {
  const raw = entrenador?.pago_config?.monto_base_usd;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return round2(numeric);
}

function getDivisorFrecuencia(frecuenciaPago) {
  if (frecuenciaPago === 'quincenal') return 2;
  if (frecuenciaPago === 'semanal') return 4;
  return 1;
}

function cloneDate(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function formatPeriodoMensualKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatPeriodoQuincenalKey(date, quincena) {
  return `${formatPeriodoMensualKey(date)}-${quincena}`;
}

function resolvePeriodoPendienteNomina({ frecuenciaPago, fechaBase }) {
  const base = cloneDate(fechaBase);
  const day = base.getDate();

  if (frecuenciaPago === 'semanal') {
    const dueDate = cloneDate(base);
    const diffToFriday = 5 - dueDate.getDay();
    dueDate.setDate(dueDate.getDate() + diffToFriday);
    if (base < dueDate) {
      dueDate.setDate(dueDate.getDate() - 7);
    }

    return {
      periodoClave: getIsoWeekKey(dueDate),
      fechaAviso: dueDate
    };
  }

  if (frecuenciaPago === 'quincenal') {
    const penultimoDiaMesActual = getPenultimateDayOfMonth(base.getFullYear(), base.getMonth());
    if (day >= penultimoDiaMesActual) {
      return {
        periodoClave: formatPeriodoQuincenalKey(base, 'q2'),
        fechaAviso: new Date(base.getFullYear(), base.getMonth(), penultimoDiaMesActual)
      };
    }

    if (day >= 14) {
      return {
        periodoClave: formatPeriodoQuincenalKey(base, 'q1'),
        fechaAviso: new Date(base.getFullYear(), base.getMonth(), 14)
      };
    }

    const mesAnterior = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    const penultimoMesAnterior = getPenultimateDayOfMonth(mesAnterior.getFullYear(), mesAnterior.getMonth());
    return {
      periodoClave: formatPeriodoQuincenalKey(mesAnterior, 'q2'),
      fechaAviso: new Date(mesAnterior.getFullYear(), mesAnterior.getMonth(), penultimoMesAnterior)
    };
  }

  // mensual (y fallback)
  const penultimoDiaMesActual = getPenultimateDayOfMonth(base.getFullYear(), base.getMonth());
  if (day >= penultimoDiaMesActual) {
    return {
      periodoClave: formatPeriodoMensualKey(base),
      fechaAviso: new Date(base.getFullYear(), base.getMonth(), penultimoDiaMesActual)
    };
  }

  const mesAnterior = new Date(base.getFullYear(), base.getMonth() - 1, 1);
  const penultimoMesAnterior = getPenultimateDayOfMonth(mesAnterior.getFullYear(), mesAnterior.getMonth());
  return {
    periodoClave: formatPeriodoMensualKey(mesAnterior),
    fechaAviso: new Date(mesAnterior.getFullYear(), mesAnterior.getMonth(), penultimoMesAnterior)
  };
}

function formatFechaCorta(fecha) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return '';
  return fecha.toISOString().slice(0, 10);
}

function buildComprobantePagoUrl(req, file) {
  if (!file || !file.filename) return '';
  const tenantId = resolveRequestTenantId(req);
  return `/uploads/${tenantId}/entrenadores/${file.filename}`;
}

function buildLegacyDatosBancarios(pagoConfig = {}) {
  const bloques = [];

  if (pagoConfig.metodos.includes('pago_movil')) {
    const banco = trimValue(pagoConfig.pago_movil?.banco);
    const telefono = trimValue(pagoConfig.pago_movil?.telefono);
    const cedula = trimValue(pagoConfig.pago_movil?.cedula);
    const partes = [banco, telefono, cedula].filter(Boolean);
    if (partes.length) {
      bloques.push(`Pago movil: ${partes.join(' | ')}`);
    }
  }

  if (pagoConfig.metodos.includes('transferencia')) {
    const banco = trimValue(pagoConfig.transferencia?.banco);
    const tipoCuenta = trimValue(pagoConfig.transferencia?.tipo_cuenta);
    const numeroCuenta = trimValue(pagoConfig.transferencia?.numero_cuenta);
    const titular = trimValue(pagoConfig.transferencia?.titular);
    const cedula = trimValue(pagoConfig.transferencia?.cedula);
    const partes = [banco, tipoCuenta, numeroCuenta, titular, cedula].filter(Boolean);
    if (partes.length) {
      bloques.push(`Transferencia: ${partes.join(' | ')}`);
    }
  }

  return bloques.join(' ; ');
}

async function getTenantEntrenadorModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);

  return {
    Entrenador: getTenantModel(connection, 'Entrenador'),
    User: getTenantModel(connection, 'User')
  };
}

function buildEntrenadorPayload(body = {}) {
  const tallaUniformeRaw = parseTallaUniforme(body.talla_uniforme);
  const certificaciones = parseStringArray(body.certificaciones_existentes);
  const contratos = parseStringArray(body.contratos_existentes);
  const sedesStaff = parseStringArray(body.sedes_staff)
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const pagoConfigRaw = parsePaymentConfig(body.pago_config);
  const frecuenciaPago = normalizeFrecuenciaPago(pagoConfigRaw.frecuencia_pago);
  const pagoConfig = {
    monto_base_usd: parseMontoBaseUsd(pagoConfigRaw.monto_base_usd),
    frecuencia_pago: frecuenciaPago || 'quincenal',
    metodos: parseStringArray(pagoConfigRaw.metodos).filter((metodo) => ['pago_movil', 'transferencia'].includes(metodo)),
    pago_movil: {
      banco: trimValue(pagoConfigRaw.pago_movil?.banco),
      telefono: trimValue(pagoConfigRaw.pago_movil?.telefono),
      cedula: trimValue(pagoConfigRaw.pago_movil?.cedula)
    },
    transferencia: {
      banco: trimValue(pagoConfigRaw.transferencia?.banco),
      tipo_cuenta: trimValue(pagoConfigRaw.transferencia?.tipo_cuenta),
      numero_cuenta: trimValue(pagoConfigRaw.transferencia?.numero_cuenta),
      titular: trimValue(pagoConfigRaw.transferencia?.titular),
      cedula: trimValue(pagoConfigRaw.transferencia?.cedula)
    }
  };

  return {
    nombre: trimValue(body.nombre),
    apellido: trimValue(body.apellido),
    direccion: trimValue(body.direccion),
    cedula: trimValue(body.cedula),
    fecha_nacimiento: body.fecha_nacimiento || undefined,
    telefono: trimValue(body.telefono),
    correo: normalizeLowerTrim(body.correo),
    foto: '',
    especialidad: trimValue(body.especialidad),
    nivel_instruccion: trimValue(body.nivel_instruccion),
    experiencia_previa: trimValue(body.experiencia_previa),
    certificaciones,
    contratos,
    talla_uniforme: {
      franela: trimValue(tallaUniformeRaw?.franela),
      short: trimValue(tallaUniformeRaw?.short),
      mono: trimValue(tallaUniformeRaw?.mono)
    },
    tipo_contrato: trimValue(body.tipo_contrato) || undefined,
    pago_config: pagoConfig,
    datos_bancarios: buildLegacyDatosBancarios(pagoConfig) || trimValue(body.datos_bancarios),
    fecha_ingreso: body.fecha_ingreso || undefined,
    sedes_staff: sedesStaff,
    estado: 'activo'
  };
}

exports.listarEntrenadores = async (req, res) => {
  try {
    const { Entrenador } = await getTenantEntrenadorModels(req);
    const entrenadores = await Entrenador.find().sort({ createdAt: -1 }).lean();
    const sanitizados = entrenadores.map(normalizeEntrenadorMedia);
    return res.json(sanitizados);
  } catch (err) {
    return res.status(500).json({ error: 'No se pudieron listar los entrenadores' });
  }
};

exports.listarStaffPorSede = async (req, res) => {
  try {
    const { Entrenador } = await getTenantEntrenadorModels(req);
    const sedeId = String(req.params.sedeId || '').trim();

    if (!mongoose.Types.ObjectId.isValid(sedeId)) {
      return res.status(400).json({ error: 'Sede invalida' });
    }

    const sedeObjectId = new mongoose.Types.ObjectId(sedeId);
    const entrenadores = await Entrenador.find().sort({ nombre: 1, apellido: 1 }).lean();

    const data = entrenadores.map((entrenador) => {
      const normalizado = normalizeEntrenadorMedia(entrenador);
      const sedesStaff = Array.isArray(normalizado.sedes_staff) ? normalizado.sedes_staff : [];
      const vinculado = sedesStaff.some((id) => String(id) === String(sedeObjectId));
      return {
        ...normalizado,
        vinculado,
        sedes_staff_count: sedesStaff.length
      };
    });

    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo listar el staff por sede' });
  }
};

exports.vincularEntrenadorASede = async (req, res) => {
  try {
    const { Entrenador } = await getTenantEntrenadorModels(req);
    const entrenadorId = String(req.params.id || '').trim();
    const sedeId = String(req.body?.id_sede || '').trim();

    if (!mongoose.Types.ObjectId.isValid(entrenadorId) || !mongoose.Types.ObjectId.isValid(sedeId)) {
      return res.status(400).json({ error: 'Entrenador o sede invalida' });
    }

    const entrenador = await Entrenador.findByIdAndUpdate(
      entrenadorId,
      { $addToSet: { sedes_staff: new mongoose.Types.ObjectId(sedeId) } },
      { new: true }
    ).lean();

    if (!entrenador) return res.status(404).json({ error: 'Entrenador no encontrado' });
    return res.json({ mensaje: 'Entrenador vinculado a la sede', entrenador });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo vincular el entrenador a la sede' });
  }
};

exports.desvincularEntrenadorDeSede = async (req, res) => {
  try {
    const { Entrenador } = await getTenantEntrenadorModels(req);
    const entrenadorId = String(req.params.id || '').trim();
    const sedeId = String(req.body?.id_sede || '').trim();

    if (!mongoose.Types.ObjectId.isValid(entrenadorId) || !mongoose.Types.ObjectId.isValid(sedeId)) {
      return res.status(400).json({ error: 'Entrenador o sede invalida' });
    }

    const entrenador = await Entrenador.findByIdAndUpdate(
      entrenadorId,
      { $pull: { sedes_staff: new mongoose.Types.ObjectId(sedeId) } },
      { new: true }
    ).lean();

    if (!entrenador) return res.status(404).json({ error: 'Entrenador no encontrado' });
    return res.json({ mensaje: 'Entrenador desvinculado de la sede', entrenador });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo desvincular el entrenador de la sede' });
  }
};

exports.editarEntrenador = async (req, res) => {
  try {
    const { Entrenador } = await getTenantEntrenadorModels(req);
    const entrenadorId = String(req.params.id || '').trim();

    if (!mongoose.Types.ObjectId.isValid(entrenadorId)) {
      return res.status(400).json({ error: 'Entrenador invalido' });
    }

    const entrenadorActual = await Entrenador.findById(entrenadorId).lean();
    if (!entrenadorActual) {
      return res.status(404).json({ error: 'Entrenador no encontrado' });
    }

    const fotoFile = Array.isArray(req.files?.foto) ? req.files.foto[0] : null;
    const certificacionesFiles = Array.isArray(req.files?.certificaciones) ? req.files.certificaciones : [];
    const contratosFiles = Array.isArray(req.files?.contratos) ? req.files.contratos : [];

    const update = {};

    if (Object.prototype.hasOwnProperty.call(req.body, 'nombre')) update.nombre = trimValue(req.body.nombre);
    if (Object.prototype.hasOwnProperty.call(req.body, 'apellido')) update.apellido = trimValue(req.body.apellido);
    if (Object.prototype.hasOwnProperty.call(req.body, 'direccion')) update.direccion = trimValue(req.body.direccion);
    if (Object.prototype.hasOwnProperty.call(req.body, 'telefono')) update.telefono = trimValue(req.body.telefono);
    if (Object.prototype.hasOwnProperty.call(req.body, 'correo')) update.correo = normalizeLowerTrim(req.body.correo);
    if (Object.prototype.hasOwnProperty.call(req.body, 'especialidad')) update.especialidad = trimValue(req.body.especialidad);
    if (Object.prototype.hasOwnProperty.call(req.body, 'nivel_instruccion')) update.nivel_instruccion = trimValue(req.body.nivel_instruccion);
    if (Object.prototype.hasOwnProperty.call(req.body, 'experiencia_previa')) update.experiencia_previa = trimValue(req.body.experiencia_previa);
    if (Object.prototype.hasOwnProperty.call(req.body, 'datos_bancarios')) update.datos_bancarios = trimValue(req.body.datos_bancarios);

    if (Object.prototype.hasOwnProperty.call(req.body, 'fecha_nacimiento')) {
      update.fecha_nacimiento = req.body.fecha_nacimiento || undefined;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'fecha_ingreso')) {
      update.fecha_ingreso = req.body.fecha_ingreso || undefined;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'tipo_contrato')) {
      const tipoContrato = trimValue(req.body.tipo_contrato);
      if (tipoContrato && !['fijo', 'por_horas', 'honorarios_profesionales'].includes(tipoContrato)) {
        return res.status(400).json({ error: 'Tipo de contrato invalido' });
      }
      update.tipo_contrato = tipoContrato || undefined;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'sedes_staff')) {
      update.sedes_staff = parseStringArray(req.body.sedes_staff)
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'pago_config')) {
      const pagoConfigRaw = parsePaymentConfig(req.body.pago_config);
      const frecuenciaPago = normalizeFrecuenciaPago(pagoConfigRaw.frecuencia_pago);
      if (frecuenciaPago === null) {
        return res.status(400).json({ error: 'Frecuencia de pago invalida' });
      }
      const pagoConfig = {
        monto_base_usd: parseMontoBaseUsd(pagoConfigRaw.monto_base_usd),
        frecuencia_pago: frecuenciaPago || 'quincenal',
        metodos: parseStringArray(pagoConfigRaw.metodos).filter((metodo) => ['pago_movil', 'transferencia'].includes(metodo)),
        pago_movil: {
          banco: trimValue(pagoConfigRaw.pago_movil?.banco),
          telefono: trimValue(pagoConfigRaw.pago_movil?.telefono),
          cedula: trimValue(pagoConfigRaw.pago_movil?.cedula)
        },
        transferencia: {
          banco: trimValue(pagoConfigRaw.transferencia?.banco),
          tipo_cuenta: trimValue(pagoConfigRaw.transferencia?.tipo_cuenta),
          numero_cuenta: trimValue(pagoConfigRaw.transferencia?.numero_cuenta),
          titular: trimValue(pagoConfigRaw.transferencia?.titular),
          cedula: trimValue(pagoConfigRaw.transferencia?.cedula)
        }
      };

      update.pago_config = pagoConfig;
      update.datos_bancarios = buildLegacyDatosBancarios(pagoConfig) || trimValue(req.body.datos_bancarios);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'talla_uniforme')) {
      const tallaUniformeRaw = parseTallaUniforme(req.body.talla_uniforme);
      update.talla_uniforme = {
        franela: trimValue(tallaUniformeRaw?.franela),
        short: trimValue(tallaUniformeRaw?.short),
        mono: trimValue(tallaUniformeRaw?.mono)
      };
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'cedula')) {
      const nuevaCedula = trimValue(req.body.cedula);
      if (!nuevaCedula) {
        return res.status(400).json({ error: 'La cedula no puede quedar vacia' });
      }
      if (nuevaCedula !== entrenadorActual.cedula) {
        const cedulaRegex = new RegExp(`^\\s*${escapeRegex(nuevaCedula)}\\s*$`, 'i');
        const duplicado = await Entrenador.findOne({
          _id: { $ne: entrenadorId },
          $or: [{ cedula: nuevaCedula }, { cedula: cedulaRegex }]
        }).lean();
        if (duplicado) {
          return res.status(409).json({ error: 'Ya existe un entrenador con esa cedula' });
        }
      }
      update.cedula = nuevaCedula;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'certificaciones_existentes') || certificacionesFiles.length) {
      const certificacionesExistentes = Object.prototype.hasOwnProperty.call(req.body, 'certificaciones_existentes')
        ? parseStringArray(req.body.certificaciones_existentes)
        : (Array.isArray(entrenadorActual.certificaciones) ? entrenadorActual.certificaciones : []);

      const nuevasCertificaciones = certificacionesFiles
        .map((file) => buildUploadUrl(req, file, 'entrenadores/certificaciones'))
        .filter(Boolean);

      update.certificaciones = [...certificacionesExistentes, ...nuevasCertificaciones].map(normalizeCertificacionUrl);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'contratos_existentes') || contratosFiles.length) {
      const contratosExistentes = Object.prototype.hasOwnProperty.call(req.body, 'contratos_existentes')
        ? parseStringArray(req.body.contratos_existentes)
        : (Array.isArray(entrenadorActual.contratos) ? entrenadorActual.contratos : []);

      const nuevosContratos = contratosFiles
        .map((file) => buildUploadUrl(req, file, 'entrenadores/contratos'))
        .filter(Boolean);

      update.contratos = [...contratosExistentes, ...nuevosContratos].map(normalizeContratoUrl);
    }

    if (fotoFile) {
      update.foto = buildUploadUrl(req, fotoFile, 'entrenadores') || entrenadorActual.foto || '';
    }

    const entrenador = await Entrenador.findByIdAndUpdate(entrenadorId, update, {
      new: true,
      runValidators: true
    }).lean();

    return res.json({ entrenador: normalizeEntrenadorMedia(entrenador), mensaje: 'Perfil de entrenador actualizado' });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: resolveDuplicateMessage(err) });
    }

    if (err?.name === 'ValidationError' || err?.name === 'CastError') {
      return res.status(400).json({ error: 'Datos invalidos para editar el entrenador', detalle: err.message });
    }

    console.error('[editarEntrenador] Error:', err);
    return res.status(500).json({ error: 'No se pudo editar el entrenador' });
  }
};

exports.actualizarEstadoEntrenador = async (req, res) => {
  try {
    const { Entrenador } = await getTenantEntrenadorModels(req);
    const entrenadorId = String(req.params.id || '').trim();
    const nuevoEstado = normalizeLowerTrim(req.body?.estado);

    if (!mongoose.Types.ObjectId.isValid(entrenadorId)) {
      return res.status(400).json({ error: 'Entrenador invalido' });
    }

    if (!['activo', 'inactivo'].includes(nuevoEstado)) {
      return res.status(400).json({ error: 'Estado invalido. Debe ser activo o inactivo' });
    }

    const entrenador = await Entrenador.findByIdAndUpdate(
      entrenadorId,
      { estado: nuevoEstado },
      { new: true, runValidators: true }
    ).lean();

    if (!entrenador) {
      return res.status(404).json({ error: 'Entrenador no encontrado' });
    }

    return res.json({
      mensaje: `Entrenador marcado como ${nuevoEstado}`,
      entrenador
    });
  } catch (err) {
    if (err?.name === 'ValidationError' || err?.name === 'CastError') {
      return res.status(400).json({ error: 'Datos invalidos para actualizar estado', detalle: err.message });
    }

    console.error('[actualizarEstadoEntrenador] Error:', err);
    return res.status(500).json({ error: 'No se pudo actualizar el estado del entrenador' });
  }
};

exports.eliminarEntrenador = async (req, res) => {
  try {
    const { Entrenador } = await getTenantEntrenadorModels(req);
    const entrenadorId = String(req.params.id || '').trim();

    if (!mongoose.Types.ObjectId.isValid(entrenadorId)) {
      return res.status(400).json({ error: 'Entrenador invalido' });
    }

    const eliminado = await Entrenador.findByIdAndDelete(entrenadorId).lean();
    if (!eliminado) {
      return res.status(404).json({ error: 'Entrenador no encontrado' });
    }

    return res.json({
      mensaje: 'Entrenador eliminado definitivamente',
      entrenador: eliminado
    });
  } catch (err) {
    console.error('[eliminarEntrenador] Error:', err);
    return res.status(500).json({ error: 'No se pudo eliminar el entrenador' });
  }
};

exports.crearEntrenador = async (req, res) => {
  try {
    const { Entrenador, User } = await getTenantEntrenadorModels(req);
    const payload = buildEntrenadorPayload(req.body);

    const fotoFile = Array.isArray(req.files?.foto) ? req.files.foto[0] : req.file;
    const certificacionesFiles = Array.isArray(req.files?.certificaciones) ? req.files.certificaciones : [];
    const contratosFiles = Array.isArray(req.files?.contratos) ? req.files.contratos : [];

    if (fotoFile) {
      payload.foto = buildUploadUrl(req, fotoFile, 'entrenadores') || '';
    }

    if (certificacionesFiles.length) {
      payload.certificaciones = [
        ...payload.certificaciones,
        ...certificacionesFiles
          .map((file) => buildUploadUrl(req, file, 'entrenadores/certificaciones'))
          .filter(Boolean)
      ].map(normalizeCertificacionUrl);
    }

    if (contratosFiles.length) {
      payload.contratos = [
        ...payload.contratos,
        ...contratosFiles
          .map((file) => buildUploadUrl(req, file, 'entrenadores/contratos'))
          .filter(Boolean)
      ].map(normalizeContratoUrl);
    }

    if (!payload.nombre || !payload.apellido || !payload.cedula) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: nombre, apellido y cedula' });
    }

    if (!payload.correo) {
      payload.correo = `${normalizeLowerTrim(payload.cedula)}@entrenador.local`;
    }

    const tipoContratoValido = !payload.tipo_contrato || ['fijo', 'por_horas', 'honorarios_profesionales'].includes(payload.tipo_contrato);
    if (!tipoContratoValido) {
      return res.status(400).json({ error: 'Tipo de contrato invalido' });
    }

    const cedulaRegex = new RegExp(`^\\s*${escapeRegex(payload.cedula)}\\s*$`, 'i');
    const entrenadorExistente = await Entrenador.findOne({
      $or: [{ cedula: payload.cedula }, { cedula: cedulaRegex }]
    });
    if (entrenadorExistente) {
      return res.status(409).json({ error: 'Ya existe un entrenador con esa cedula' });
    }

    const userLoginId = normalizeLowerTrim(payload.cedula);
    const emailRegex = new RegExp(`^\\s*${escapeRegex(userLoginId)}\\s*$`, 'i');
    let user = await User.findOne({
      $or: [{ email: userLoginId }, { email: emailRegex }]
    });

    if (!user) {
      const password = await bcrypt.hash(payload.cedula, 10);
      user = await User.create({
        nombre: `${payload.nombre} ${payload.apellido}`.trim(),
        email: userLoginId,
        password,
        rol: 'entrenador',
        roles: ['entrenador']
      });
    } else {
      const rolesActuales = Array.isArray(user.roles)
        ? user.roles.map((item) => normalizeLowerTrim(item)).filter(Boolean)
        : [];
      const rolLegacy = normalizeLowerTrim(user.rol);
      const rolesFusionados = Array.from(new Set([...rolesActuales, rolLegacy, 'entrenador'].filter(Boolean)));
      user.roles = rolesFusionados;
      if (!user.rol) {
        user.rol = rolesFusionados[0] || 'usuario';
      }
      if (!user.nombre) {
        user.nombre = `${payload.nombre} ${payload.apellido}`.trim();
      }
      await user.save();
    }

    const entrenador = await Entrenador.create({
      ...payload,
      usuario: user._id
    });

    const entrenadorObj = entrenador.toObject ? entrenador.toObject() : entrenador;

    return res.status(201).json({
      entrenador: normalizeEntrenadorMedia(entrenadorObj),
      usuario: {
        id: user._id,
        email: user.email,
        rol: user.rol,
        roles: Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : [user.rol]
      },
      mensaje: 'Entrenador creado. Usuario portal actualizado con rol entrenador y contraseña inicial igual a la cedula si fue un usuario nuevo.'
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: resolveDuplicateMessage(err) });
    }

    if (err?.name === 'ValidationError' || err?.name === 'CastError') {
      return res.status(400).json({ error: 'Datos invalidos para crear el entrenador', detalle: err.message });
    }

    console.error('[crearEntrenador] Error:', err);
    return res.status(500).json({ error: 'No se pudo crear el entrenador' });
  }
};

exports.registrarPagoNominaEntrenador = async (req, res) => {
  try {
    const { Entrenador } = await getTenantEntrenadorModels(req);
    const entrenadorId = String(req.params.id || '').trim();

    if (!mongoose.Types.ObjectId.isValid(entrenadorId)) {
      return res.status(400).json({ error: 'Entrenador invalido' });
    }

    const entrenador = await Entrenador.findById(entrenadorId);
    if (!entrenador) {
      return res.status(404).json({ error: 'Entrenador no encontrado' });
    }

    const fechaPago = req.body?.fecha_pago ? new Date(req.body.fecha_pago) : new Date();
    if (Number.isNaN(fechaPago.getTime())) {
      return res.status(400).json({ error: 'Fecha de pago invalida' });
    }

    const frecuenciaPago = normalizeFrecuenciaPago(entrenador?.pago_config?.frecuencia_pago) || 'mensual';
    const montoBaseMensualUsd = getMontoBaseMensualUsd(entrenador);
    const divisorFrecuencia = getDivisorFrecuencia(frecuenciaPago);
    const montoBasePeriodoUsd = round2(montoBaseMensualUsd / divisorFrecuencia);
    const monedaSeleccionada = normalizeCurrency(req.body?.moneda);
    const tasaBcv = round2(req.body?.tasa_bcv);
    const montoBaseUsdEntrada = Number(req.body?.monto_base_usd);
    const montoBaseVesEntrada = Number(req.body?.monto_base_ves);
    const montoTotalUsdEntrada = Number(req.body?.monto_total_usd);
    const montoTotalVesEntrada = Number(req.body?.monto_total_ves);

    if (monedaSeleccionada === 'VES' && (!Number.isFinite(tasaBcv) || tasaBcv <= 0)) {
      return res.status(400).json({ error: 'Se requiere tasa BCV valida para pagos en VES' });
    }

    const montoBasePago = round2(req.body?.monto_base);
    const bono = round2(req.body?.bono_ajuste);
    const deduccion = round2(req.body?.deduccion);
    const montoTotalSeleccionado = round2(Math.max(0, montoBasePago + bono - deduccion));

    const montoTotalUsd = Number.isFinite(montoTotalUsdEntrada) && montoTotalUsdEntrada >= 0
      ? round2(montoTotalUsdEntrada)
      : (monedaSeleccionada === 'USD'
        ? montoTotalSeleccionado
        : round2(montoTotalSeleccionado / tasaBcv));
    const montoTotalVes = Number.isFinite(montoTotalVesEntrada) && montoTotalVesEntrada >= 0
      ? round2(montoTotalVesEntrada)
      : (monedaSeleccionada === 'VES'
        ? montoTotalSeleccionado
        : round2(montoTotalSeleccionado * tasaBcv));

    const montoBasePagoUsd = Number.isFinite(montoBaseUsdEntrada) && montoBaseUsdEntrada >= 0
      ? round2(montoBaseUsdEntrada)
      : (monedaSeleccionada === 'USD'
        ? montoBasePago
        : round2(montoBasePago / tasaBcv));
    const montoBasePagoVes = Number.isFinite(montoBaseVesEntrada) && montoBaseVesEntrada >= 0
      ? round2(montoBaseVesEntrada)
      : (monedaSeleccionada === 'VES'
        ? montoBasePago
        : round2(montoBasePago * tasaBcv));

    if (montoTotalUsd <= 0 && montoTotalVes <= 0) {
      return res.status(400).json({ error: 'Se requiere el monto del pago en USD o VES' });
    }

    if (monedaSeleccionada === 'USD' && (!Number.isFinite(montoTotalVesEntrada) || montoTotalVesEntrada < 0)) {
      return res.status(400).json({ error: 'Se requiere el monto equivalente en Bs para este pago' });
    }

    if (monedaSeleccionada === 'VES' && (!Number.isFinite(montoTotalUsdEntrada) || montoTotalUsdEntrada < 0)) {
      return res.status(400).json({ error: 'Se requiere el monto equivalente en USD para este pago' });
    }

    const bonoUsd = monedaSeleccionada === 'USD' ? bono : round2(bono / tasaBcv);
    const bonoVes = monedaSeleccionada === 'VES' ? bono : round2(bono * tasaBcv);
    const deduccionUsd = monedaSeleccionada === 'USD' ? deduccion : round2(deduccion / tasaBcv);
    const deduccionVes = monedaSeleccionada === 'VES' ? deduccion : round2(deduccion * tasaBcv);

    const periodoTexto = trimValue(req.body?.periodo);
    const periodoClaveRequest = trimValue(req.body?.periodo_clave);
    const periodoClaveInferidaPorTexto = resolvePeriodoClaveFromPeriodoTexto({
      frecuenciaPago,
      periodo: periodoTexto,
      fechaPago
    });
    const periodoClave = periodoClaveRequest || periodoClaveInferidaPorTexto || resolvePeriodoClave({ frecuenciaPago, fechaPago });
    const pagoPayload = {
      fecha_pago: fechaPago,
      periodo: periodoTexto,
      periodo_clave: periodoClave,
      frecuencia_pago: frecuenciaPago,
      moneda_seleccionada: monedaSeleccionada,
      tasa_bcv: tasaBcv,
      monto_base_mensual_usd: montoBaseMensualUsd,
      monto_base_periodo_usd: montoBasePeriodoUsd,
      monto_base_pago_usd: montoBasePagoUsd,
      monto_base_pago_ves: montoBasePagoVes,
      bono_usd: bonoUsd,
      bono_ves: bonoVes,
      deduccion_usd: deduccionUsd,
      deduccion_ves: deduccionVes,
      monto_total_usd: montoTotalUsd,
      monto_total_ves: montoTotalVes,
      metodo_pago: normalizeMetodoPago(req.body?.metodo_pago),
      referencia: trimValue(req.body?.referencia),
      comprobante_url: buildComprobantePagoUrl(req, req.file),
      observacion: trimValue(req.body?.observacion),
      registrado_por: req.user?.id || req.user?._id || undefined
    };

    entrenador.pagos_nomina = Array.isArray(entrenador.pagos_nomina) ? entrenador.pagos_nomina : [];
    entrenador.pagos_nomina.push(pagoPayload);
    await entrenador.save();

    const ultimoPago = entrenador.pagos_nomina[entrenador.pagos_nomina.length - 1];

    return res.status(201).json({
      mensaje: 'Pago de nomina registrado correctamente',
      pago: ultimoPago
    });
  } catch (err) {
    if (err?.name === 'ValidationError' || err?.name === 'CastError') {
      return res.status(400).json({ error: 'Datos invalidos para registrar pago', detalle: err.message });
    }
    console.error('[registrarPagoNominaEntrenador] Error:', err);
    return res.status(500).json({ error: 'No se pudo registrar el pago de nomina' });
  }
};

exports.listarActividadesPendientesNomina = async (req, res) => {
  try {
    const { Entrenador } = await getTenantEntrenadorModels(req);
    const fechaBase = req.query?.fecha ? new Date(req.query.fecha) : new Date();
    if (Number.isNaN(fechaBase.getTime())) {
      return res.status(400).json({ error: 'Fecha invalida para generar actividades' });
    }

    const entrenadores = await Entrenador.find({ estado: { $ne: 'inactivo' } })
      .select('nombre apellido fecha_ingreso pago_config pagos_nomina estado')
      .lean();

    const actividades = entrenadores.reduce((acc, entrenador) => {
      const frecuenciaPago = normalizeFrecuenciaPago(entrenador?.pago_config?.frecuencia_pago) || 'mensual';
      const periodoPendiente = resolvePeriodoPendienteNomina({ frecuenciaPago, fechaBase });
      const periodoClavePendiente = trimValue(periodoPendiente?.periodoClave);
      const fechaAviso = periodoPendiente?.fechaAviso instanceof Date && !Number.isNaN(periodoPendiente.fechaAviso.getTime())
        ? periodoPendiente.fechaAviso
        : fechaBase;

      const fechaIngreso = entrenador?.fecha_ingreso ? new Date(entrenador.fecha_ingreso) : null;
      if (fechaIngreso instanceof Date && !Number.isNaN(fechaIngreso.getTime())) {
        const ingresoDia = cloneDate(fechaIngreso);
        if (fechaAviso < ingresoDia) {
          return acc;
        }
      }

      if (!periodoClavePendiente) return acc;

      const pagosNomina = Array.isArray(entrenador?.pagos_nomina) ? entrenador.pagos_nomina : [];
      const pagoYaRegistrado = pagosNomina.some((pago) => {
        const pagoPeriodoClave = resolvePagoPeriodoClaveForMatch({ pago, frecuenciaPagoFallback: frecuenciaPago });
        return pagoPeriodoClave === periodoClavePendiente;
      });
      if (pagoYaRegistrado) return acc;

      acc.push({
        entrenadorId: entrenador._id,
        entrenadorNombre: `${trimValue(entrenador.nombre)} ${trimValue(entrenador.apellido)}`.trim(),
        actividad: 'Pago de nomina',
        frecuencia_pago: frecuenciaPago,
        fecha_aviso: formatFechaCorta(fechaAviso),
        periodo_clave: periodoClavePendiente,
        monto_base_periodo_usd: round2(getMontoBaseMensualUsd(entrenador) / getDivisorFrecuencia(frecuenciaPago)),
        estado: 'pendiente'
      });

      return acc;
    }, []);

    return res.json({
      fecha: formatFechaCorta(fechaBase),
      total: actividades.length,
      actividades
    });
  } catch (err) {
    console.error('[listarActividadesPendientesNomina] Error:', err);
    return res.status(500).json({ error: 'No se pudieron generar actividades pendientes de nomina' });
  }
};
