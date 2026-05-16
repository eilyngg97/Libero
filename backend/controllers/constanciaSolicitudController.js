const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');
const constanciaController = require('./constanciaController');

const TIPOS_VALIDOS = new Set(['simple', 'retiro', 'horario_entrenamiento', 'listado_alumnos', 'asistencia']);
const ESTADOS_VALIDOS = new Set(['pendiente', 'en_revision', 'completada', 'rechazada']);

function normalizarTipoConstancia(tipo = '') {
  const normalizado = String(tipo || '').trim().toLowerCase();
  if (normalizado === 'horario') return 'horario_entrenamiento';
  if (TIPOS_VALIDOS.has(normalizado)) return normalizado;
  return 'simple';
}

function normalizarFechaISO(fechaRaw = '') {
  const value = String(fechaRaw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  return value;
}

function normalizarPayloadSolicitud(body = {}, tipo = 'simple') {
  const payload = {
    asistenciaPara: String(body?.asistenciaPara || 'atleta').trim().toLowerCase() === 'representante' ? 'representante' : 'atleta',
    eventoFecha: String(body?.eventoFecha || '').trim(),
    eventoHoraDesde: String(body?.eventoHoraDesde || '').trim(),
    eventoHoraHasta: String(body?.eventoHoraHasta || '').trim(),
    eventoMotivo: String(body?.eventoMotivo || '').trim(),
    asistenciaTiempo: String(body?.asistenciaTiempo || 'pasado').trim().toLowerCase() === 'futuro' ? 'futuro' : 'pasado',
    diasEntrenamiento: Array.isArray(body?.diasEntrenamiento)
      ? body.diasEntrenamiento.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    horaInicio: String(body?.horaInicio || '').trim(),
    horaFin: String(body?.horaFin || '').trim()
  };

  if (tipo === 'horario_entrenamiento') {
    if (!payload.diasEntrenamiento.length || !payload.horaInicio || !payload.horaFin) {
      throw new Error('Debes indicar dias y horario para la constancia de entrenamiento.');
    }
  }

  if (tipo === 'asistencia') {
    if (!payload.eventoFecha || !payload.eventoHoraDesde || !payload.eventoHoraHasta) {
      throw new Error('Debes indicar fecha y horario para la constancia de asistencia.');
    }
  }

  return payload;
}

async function getTenantSolicitudModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);
  return {
    ConstanciaSolicitud: getTenantModel(connection, 'ConstanciaSolicitud')
  };
}

exports.crearSolicitudConstancia = async (req, res) => {
  try {
    const tenantId = String(resolveRequestTenantId(req) || '').trim().toLowerCase();
    const rol = String(req.user?.rol || '').trim().toLowerCase();
    if (!(tenantId === 'esporta' && rol === 'usuario')) {
      return res.status(403).json({ error: 'Este flujo de solicitudes aplica solo para usuarios del tenant Esporta.' });
    }

    const tipo = normalizarTipoConstancia(req.body?.tipo);
    if (tipo === 'retiro' || tipo === 'listado_alumnos') {
      return res.status(403).json({ error: 'Este tipo de constancia solo puede gestionarlo un administrador.' });
    }

    const fechaEmision = normalizarFechaISO(req.body?.fechaEmision);
    if (!fechaEmision) {
      return res.status(400).json({ error: 'Debes indicar una fecha de emision valida (YYYY-MM-DD).' });
    }

    const alumnoId = String(req.body?.alumnoId || '').trim();
    if (!alumnoId) {
      return res.status(400).json({ error: 'alumnoId requerido' });
    }

    const payload = normalizarPayloadSolicitud(req.body, tipo);
    const { ConstanciaSolicitud } = await getTenantSolicitudModels(req);

    const solicitud = await ConstanciaSolicitud.create({
      alumno: alumnoId,
      solicitado_por: req.user?.id,
      tipo,
      fecha_emision: fechaEmision,
      payload,
      estado: 'pendiente'
    });

    return res.status(201).json({ message: 'Solicitud de constancia registrada.', solicitud });
  } catch (err) {
    return res.status(400).json({ error: 'No se pudo registrar la solicitud.', detalle: err.message });
  }
};

exports.getMisSolicitudesConstancia = async (req, res) => {
  try {
    const { ConstanciaSolicitud } = await getTenantSolicitudModels(req);
    const filtro = { solicitado_por: req.user?.id };
    const alumnoId = String(req.query?.alumnoId || '').trim();
    if (alumnoId) {
      filtro.alumno = alumnoId;
    }

    const solicitudes = await ConstanciaSolicitud.find(filtro)
      .populate('alumno', 'nombres apellidos cedula categoria sede')
      .sort({ createdAt: -1 })
      .lean();

    return res.json(solicitudes);
  } catch (err) {
    return res.status(500).json({ error: 'No se pudieron cargar tus solicitudes de constancia.' });
  }
};

exports.getSolicitudesConstancia = async (req, res) => {
  try {
    const { ConstanciaSolicitud } = await getTenantSolicitudModels(req);
    const estado = String(req.query?.estado || '').trim().toLowerCase();
    const filtro = {};
    if (estado && ESTADOS_VALIDOS.has(estado)) {
      filtro.estado = estado;
    }

    const solicitudes = await ConstanciaSolicitud.find(filtro)
      .populate('alumno', 'nombres apellidos cedula categoria sede')
      .populate('solicitado_por', 'nombre email')
      .populate('atendido_por', 'nombre email')
      .sort({ createdAt: -1 })
      .lean();

    return res.json(solicitudes);
  } catch (err) {
    return res.status(500).json({ error: 'No se pudieron cargar las solicitudes de constancia.' });
  }
};

exports.actualizarSolicitudConstancia = async (req, res) => {
  try {
    const { ConstanciaSolicitud } = await getTenantSolicitudModels(req);
    const solicitud = await ConstanciaSolicitud.findById(req.params.id);
    if (!solicitud) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }

    if (req.body?.estado !== undefined) {
      const estado = String(req.body.estado || '').trim().toLowerCase();
      if (!ESTADOS_VALIDOS.has(estado)) {
        return res.status(400).json({ error: 'Estado de solicitud invalido.' });
      }
      solicitud.estado = estado;
      solicitud.atendido_por = req.user?.id;
      solicitud.atendido_en = new Date();
    }

    if (req.body?.notaAdmin !== undefined) {
      solicitud.nota_admin = String(req.body.notaAdmin || '').trim();
      solicitud.atendido_por = req.user?.id;
      solicitud.atendido_en = new Date();
    }

    if (req.body?.fechaEmision !== undefined) {
      const fecha = normalizarFechaISO(req.body.fechaEmision);
      if (!fecha) {
        return res.status(400).json({ error: 'Fecha de emision invalida.' });
      }
      solicitud.fecha_emision = fecha;
    }

    const payloadActualizado = {
      ...solicitud.payload,
      ...(req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {})
    };
    solicitud.payload = normalizarPayloadSolicitud(payloadActualizado, solicitud.tipo);

    await solicitud.save();

    const solicitudActualizada = await ConstanciaSolicitud.findById(solicitud._id)
      .populate('alumno', 'nombres apellidos cedula categoria sede')
      .populate('solicitado_por', 'nombre email')
      .populate('atendido_por', 'nombre email')
      .lean();

    return res.json({ message: 'Solicitud actualizada.', solicitud: solicitudActualizada });
  } catch (err) {
    return res.status(400).json({ error: 'No se pudo actualizar la solicitud.', detalle: err.message });
  }
};

exports.generarConstanciaDesdeSolicitud = async (req, res) => {
  try {
    const { ConstanciaSolicitud } = await getTenantSolicitudModels(req);
    const solicitud = await ConstanciaSolicitud.findById(req.params.id);
    if (!solicitud) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }

    solicitud.estado = 'en_revision';
    solicitud.atendido_por = req.user?.id;
    solicitud.atendido_en = new Date();
    await solicitud.save();

    req.body = {
      alumnoId: String(solicitud.alumno),
      alumnoIds: Array.isArray(solicitud.alumno_ids) ? solicitud.alumno_ids.map((id) => String(id)) : [],
      tipo: solicitud.tipo,
      fechaEmision: solicitud.fecha_emision,
      asistenciaPara: solicitud.payload?.asistenciaPara || 'atleta',
      eventoFecha: solicitud.payload?.eventoFecha || '',
      eventoHoraDesde: solicitud.payload?.eventoHoraDesde || '',
      eventoHoraHasta: solicitud.payload?.eventoHoraHasta || '',
      eventoMotivo: solicitud.payload?.eventoMotivo || '',
      asistenciaTiempo: solicitud.payload?.asistenciaTiempo || 'pasado',
      diasEntrenamiento: Array.isArray(solicitud.payload?.diasEntrenamiento) ? solicitud.payload.diasEntrenamiento : [],
      horaInicio: solicitud.payload?.horaInicio || '',
      horaFin: solicitud.payload?.horaFin || ''
    };

    res.on('finish', async () => {
      try {
        if (res.statusCode < 400) {
          await ConstanciaSolicitud.findByIdAndUpdate(solicitud._id, {
            $set: {
              estado: 'completada',
              atendido_por: req.user?.id,
              atendido_en: new Date()
            }
          });
        }
      } catch (_) {
        // No interrumpir la respuesta al cliente si falla el update de estado.
      }
    });

    return constanciaController.generarConstancia(req, res);
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo generar la constancia desde la solicitud.', detalle: err.message });
  }
};