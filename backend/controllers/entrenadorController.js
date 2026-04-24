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
    talla_uniforme: {
      franela: trimValue(tallaUniformeRaw?.franela),
      short: trimValue(tallaUniformeRaw?.short),
      mono: trimValue(tallaUniformeRaw?.mono)
    },
    tipo_contrato: trimValue(body.tipo_contrato) || undefined,
    datos_bancarios: trimValue(body.datos_bancarios),
    fecha_ingreso: body.fecha_ingreso || undefined,
    estado: 'activo'
  };
}

exports.listarEntrenadores = async (req, res) => {
  try {
    const { Entrenador } = await getTenantEntrenadorModels(req);
    const entrenadores = await Entrenador.find().sort({ createdAt: -1 }).lean();
    return res.json(entrenadores);
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
      const sedesStaff = Array.isArray(entrenador.sedes_staff) ? entrenador.sedes_staff : [];
      const vinculado = sedesStaff.some((id) => String(id) === String(sedeObjectId));
      return {
        ...entrenador,
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

exports.crearEntrenador = async (req, res) => {
  try {
    const { Entrenador, User } = await getTenantEntrenadorModels(req);
    const payload = buildEntrenadorPayload(req.body);

    if (req.file) {
      payload.foto = buildUploadUrl(req, req.file, 'entrenadores') || '';
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
    if (user && user.rol !== 'entrenador') {
      return res.status(409).json({ error: 'La cedula ya esta asociada a un usuario con otro rol' });
    }

    if (!user) {
      const password = await bcrypt.hash(payload.cedula, 10);
      user = await User.create({
        nombre: `${payload.nombre} ${payload.apellido}`.trim(),
        email: userLoginId,
        password,
        rol: 'entrenador'
      });
    }

    const entrenador = await Entrenador.create({
      ...payload,
      usuario: user._id
    });

    return res.status(201).json({
      entrenador,
      usuario: {
        id: user._id,
        email: user.email,
        rol: user.rol
      },
      mensaje: 'Entrenador creado. Se genero usuario rol entrenador con contraseña inicial igual a la cedula.'
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
