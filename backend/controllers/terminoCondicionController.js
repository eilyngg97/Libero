const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

async function getTenantModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);
  return {
    TenantTerminoCondicion: getTenantModel(connection, 'TerminoCondicion'),
    TenantTerminoAceptacion: getTenantModel(connection, 'TerminoAceptacion'),
    TenantUser: getTenantModel(connection, 'User'),
    TenantAlumno: getTenantModel(connection, 'Alumno'),
    TenantRepresentante: getTenantModel(connection, 'Representante')
  };
}

function sanitizeNota(value = '') {
  return String(value || '').trim();
}

function getFileAbsolutePathFromUploadUrl(archivoUrl = '') {
  const cleanUrl = String(archivoUrl || '').trim();
  if (!cleanUrl.startsWith('/uploads/')) return null;

  const relativePart = cleanUrl.replace(/^\/uploads\//, '');
  return path.join(__dirname, '..', 'uploads', relativePart);
}

async function setLatestAsVigente(TenantTerminoCondicion) {
  const latest = await TenantTerminoCondicion.findOne().sort({ version: -1, createdAt: -1 });
  if (!latest) return;

  await TenantTerminoCondicion.updateMany(
    { _id: { $ne: latest._id }, vigente: true },
    { $set: { vigente: false } }
  );

  if (!latest.vigente) {
    latest.vigente = true;
    await latest.save();
  }
}

exports.listarTerminos = async (req, res) => {
  try {
    const { TenantTerminoCondicion, TenantTerminoAceptacion } = await getTenantModels(req);
    const role = String(req.user?.rol || '').toLowerCase();

    if (role === 'admin' || role === 'super_admin') {
      const terminos = await TenantTerminoCondicion.find().sort({ version: -1, createdAt: -1 });

      const acceptanceSummary = await TenantTerminoAceptacion.aggregate([
        {
          $group: {
            _id: '$termino_id',
            total: { $sum: 1 }
          }
        }
      ]);

      const acceptanceMap = new Map(
        acceptanceSummary.map((item) => [String(item._id), Number(item.total || 0)])
      );

      const enriched = terminos.map((termino) => {
        const asObj = termino.toObject();
        asObj.total_aceptaciones = acceptanceMap.get(String(termino._id)) || 0;
        return asObj;
      });

      const vigente = enriched.find((item) => item.vigente) || null;
      return res.json({ vigente, documentos: enriched });
    }

    const vigente = await TenantTerminoCondicion.findOne({ vigente: true }).sort({ version: -1, createdAt: -1 });
    if (!vigente) {
      return res.json({ termino: null, aceptado: false, aceptacion: null });
    }

    const aceptacion = await TenantTerminoAceptacion.findOne({
      termino_id: vigente._id,
      user_id: req.user?.id
    }).sort({ accepted_at: -1 });

    return res.json({
      termino: vigente,
      aceptado: Boolean(aceptacion),
      aceptacion: aceptacion || null
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener terminos y condiciones' });
  }
};

exports.crearTermino = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Debe adjuntar un archivo' });
    }

    const { TenantTerminoCondicion } = await getTenantModels(req);
    const ultimo = await TenantTerminoCondicion.findOne().sort({ version: -1, createdAt: -1 });
    const version = Number(ultimo?.version || 0) + 1;

    await TenantTerminoCondicion.updateMany({ vigente: true }, { $set: { vigente: false } });

    const termino = new TenantTerminoCondicion({
      nota: sanitizeNota(req.body?.nota),
      archivo_url: req.file.publicUrl,
      nombre_archivo: req.file.originalname || req.file.filename,
      tipo_mime: req.file.mimetype || '',
      tamano_bytes: Number(req.file.size || 0),
      version,
      vigente: true,
      created_by: req.user?.id || null
    });

    await termino.save();
    return res.status(201).json(termino);
  } catch (err) {
    return res.status(500).json({ error: 'Error al crear terminos y condiciones' });
  }
};

exports.eliminarTermino = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Id invalido' });
    }

    const { TenantTerminoCondicion, TenantTerminoAceptacion } = await getTenantModels(req);
    const termino = await TenantTerminoCondicion.findByIdAndDelete(id);
    if (!termino) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    await TenantTerminoAceptacion.deleteMany({ termino_id: termino._id });

    const absolutePath = getFileAbsolutePathFromUploadUrl(termino.archivo_url);
    if (absolutePath && fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }

    if (termino.vigente) {
      await setLatestAsVigente(TenantTerminoCondicion);
    }

    return res.json({ message: 'Documento eliminado' });
  } catch (err) {
    return res.status(500).json({ error: 'Error al eliminar documento' });
  }
};

exports.listarEstadoAceptacionesTermino = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Id invalido' });
    }

    const {
      TenantTerminoCondicion,
      TenantTerminoAceptacion,
      TenantUser,
      TenantAlumno,
      TenantRepresentante
    } = await getTenantModels(req);

    const termino = await TenantTerminoCondicion.findById(id).select('_id version vigente');
    if (!termino) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    const usuarios = await TenantUser.find({ rol: 'usuario' })
      .select('_id nombre email createdAt')
      .sort({ nombre: 1, email: 1 })
      .lean();

    const usuarioIds = usuarios.map((item) => item._id);

    const [aceptaciones, representantesConUsuario, alumnos] = await Promise.all([
      TenantTerminoAceptacion.find({ termino_id: termino._id, user_id: { $in: usuarioIds } })
        .select('_id user_id accepted_at createdAt')
        .sort({ accepted_at: -1, createdAt: -1 })
        .lean(),
      TenantRepresentante.find({ usuario: { $in: usuarioIds } })
        .select('_id usuario')
        .lean(),
      TenantAlumno.find({
        activo: { $ne: false },
        dado_de_baja: { $ne: true }
      })
        .select('_id usuario representante nombres apellidos')
        .sort({ nombres: 1, apellidos: 1 })
        .lean()
    ]);

    const aceptacionesPorUsuario = new Map();
    aceptaciones.forEach((item) => {
      const userId = String(item?.user_id || '');
      if (!userId || aceptacionesPorUsuario.has(userId)) return;
      aceptacionesPorUsuario.set(userId, item);
    });

    const usuariosPorId = new Map(
      usuarios.map((usuario) => [String(usuario._id), usuario])
    );

    const representanteUsuarioPorId = new Map(
      representantesConUsuario
        .filter((item) => item?._id && item?.usuario)
        .map((item) => [String(item._id), String(item.usuario)])
    );

    const aceptados = [];
    const pendientes = [];
    const sinUsuario = [];

    alumnos.forEach((alumno) => {
      const alumnoUserId = String(alumno?.usuario || '').trim();
      const representanteId = String(alumno?.representante || '').trim();
      const representanteUserId = representanteUsuarioPorId.get(representanteId) || '';
      const userId = usuariosPorId.has(alumnoUserId)
        ? alumnoUserId
        : (usuariosPorId.has(representanteUserId) ? representanteUserId : '');

      const nombreAlumno = String(`${alumno?.nombres || ''} ${alumno?.apellidos || ''}`).trim() || 'Sin nombre';

      if (!userId) {
        sinUsuario.push({
          alumno_id: alumno._id,
          alumno_nombre: nombreAlumno,
          user_id: null,
          usuario_nombre: '',
          email: ''
        });
        return;
      }

      const usuario = usuariosPorId.get(userId) || null;
      const aceptacion = aceptacionesPorUsuario.get(userId);

      const base = {
        alumno_id: alumno._id,
        alumno_nombre: nombreAlumno,
        user_id: userId,
        usuario_nombre: String(usuario?.nombre || '').trim(),
        email: String(usuario?.email || '').trim()
      };

      if (aceptacion) {
        aceptados.push({
          ...base,
          accepted_at: aceptacion.accepted_at || aceptacion.createdAt || null,
          aceptacion_id: aceptacion._id
        });
        return;
      }

      pendientes.push(base);
    });
    const totalAlumnosObjetivo = alumnos.length;

    return res.json({
      termino_id: termino._id,
      version: termino.version,
      vigente: Boolean(termino.vigente),
      total_alumnos: totalAlumnosObjetivo,
      total_usuarios: usuarios.length,
      total_aceptados: aceptados.length,
      total_pendientes: pendientes.length,
      total_sin_usuario: sinUsuario.length,
      aceptados,
      pendientes,
      sin_usuario: sinUsuario
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener el estado de aceptaciones del documento' });
  }
};

exports.aceptarTerminoVigente = async (req, res) => {
  try {
    const { TenantTerminoCondicion, TenantTerminoAceptacion } = await getTenantModels(req);
    const terminoIdBody = String(req.body?.termino_id || '').trim();

    let termino = null;
    if (terminoIdBody && mongoose.Types.ObjectId.isValid(terminoIdBody)) {
      termino = await TenantTerminoCondicion.findById(terminoIdBody);
    } else {
      termino = await TenantTerminoCondicion.findOne({ vigente: true }).sort({ version: -1, createdAt: -1 });
    }

    if (!termino) {
      return res.status(404).json({ error: 'No hay terminos vigentes para aceptar' });
    }

    const existing = await TenantTerminoAceptacion.findOne({
      termino_id: termino._id,
      user_id: req.user?.id
    });

    if (existing) {
      return res.json({
        message: 'Los terminos de esta version ya fueron aceptados',
        aceptado: true,
        aceptacion: existing
      });
    }

    const aceptacion = new TenantTerminoAceptacion({
      termino_id: termino._id,
      user_id: req.user?.id,
      accepted_at: new Date(),
      accepted_ip: String(req.ip || ''),
      accepted_user_agent: String(req.get('user-agent') || '')
    });

    await aceptacion.save();

    return res.status(201).json({
      message: 'Terminos y condiciones aceptados correctamente',
      aceptado: true,
      aceptacion
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.json({
        message: 'Los terminos de esta version ya fueron aceptados',
        aceptado: true
      });
    }
    return res.status(500).json({ error: 'Error al aceptar terminos y condiciones' });
  }
};