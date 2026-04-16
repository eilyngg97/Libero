const mongoose = require('mongoose');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

async function getTenantOwnershipModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);

  const Representante = getTenantModel(connection, 'Representante');
  const Alumno = getTenantModel(connection, 'Alumno');
  const Mensualidad = getTenantModel(connection, 'Mensualidad');
  const PagoDetalle = getTenantModel(connection, 'PagoDetalle');

  return {
    Representante,
    Alumno,
    Mensualidad,
    PagoDetalle
  };
}

function isEndUser(req) {
  return req.user?.rol === 'usuario';
}

async function userOwnsAlumno(userId, alumno, RepresentanteModel) {
  if (!alumno) return false;
  if (alumno.usuario && String(alumno.usuario) === String(userId)) {
    return true;
  }
  if (!alumno.representante) {
    return false;
  }
  const representante = await RepresentanteModel.findById(alumno.representante).select('usuario');
  return !!representante && String(representante.usuario) === String(userId);
}

exports.ensureAlumnoOwnershipFromParam = (paramName = 'id') => async (req, res, next) => {
  if (!isEndUser(req)) return next();

  const { Alumno, Representante } = await getTenantOwnershipModels(req);
  const alumnoId = req.params[paramName];
  if (!alumnoId) return res.status(400).json({ error: 'id de alumno requerido' });

  const alumno = await Alumno.findById(alumnoId).select('usuario representante');
  if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

  const esPropio = await userOwnsAlumno(req.user.id, alumno, Representante);
  if (!esPropio) return res.status(403).json({ error: 'No tienes permiso para este alumno' });

  next();
};

exports.ensureAlumnoOwnershipFromBody = (fieldName = 'alumnoId') => async (req, res, next) => {
  if (!isEndUser(req)) return next();

  const { Alumno, Representante } = await getTenantOwnershipModels(req);
  const alumnoId = req.body?.[fieldName];
  if (!alumnoId) return res.status(400).json({ error: `${fieldName} requerido` });

  const alumno = await Alumno.findById(alumnoId).select('usuario representante');
  if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

  const esPropio = await userOwnsAlumno(req.user.id, alumno, Representante);
  if (!esPropio) return res.status(403).json({ error: 'No tienes permiso para este alumno' });

  next();
};

exports.ensureRepresentanteOwnershipFromParam = (paramName = 'representanteId') => async (req, res, next) => {
  if (!isEndUser(req)) return next();

  try {
    const { Representante } = await getTenantOwnershipModels(req);
    const representanteId = req.params[paramName];
    if (!representanteId || representanteId === 'null' || representanteId === 'undefined') {
      return next();
    }

    if (!mongoose.Types.ObjectId.isValid(representanteId)) {
      return res.status(400).json({ error: 'representanteId invalido' });
    }

    const representante = await Representante.findById(representanteId).select('usuario');
    if (!representante) return res.status(404).json({ error: 'Representante no encontrado' });

    if (String(representante.usuario) !== String(req.user.id)) {
      return res.status(403).json({ error: 'No tienes permiso para este representante' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ error: 'Error validando propiedad del representante' });
  }
};

exports.ensureMensualidadOwnershipFromBody = (fieldName = 'id_mensualidad') => async (req, res, next) => {
  if (!isEndUser(req)) return next();

  const { Mensualidad, Representante } = await getTenantOwnershipModels(req);
  const mensualidadId = req.body?.[fieldName];
  if (!mensualidadId) return res.status(400).json({ error: `${fieldName} requerido` });

  const mensualidad = await Mensualidad.findById(mensualidadId).populate('id_alumno', 'usuario representante');
  if (!mensualidad || !mensualidad.id_alumno) {
    return res.status(404).json({ error: 'Mensualidad no encontrada' });
  }

  const esPropio = await userOwnsAlumno(req.user.id, mensualidad.id_alumno, Representante);
  if (!esPropio) return res.status(403).json({ error: 'No tienes permiso para esta mensualidad' });

  next();
};

exports.ensureMensualidadOwnershipFromParam = (paramName = 'id_mensualidad') => async (req, res, next) => {
  if (!isEndUser(req)) return next();

  const { Mensualidad, Representante } = await getTenantOwnershipModels(req);
  const mensualidadId = req.params[paramName];
  if (!mensualidadId) return res.status(400).json({ error: 'id_mensualidad requerido' });

  const mensualidad = await Mensualidad.findById(mensualidadId).populate('id_alumno', 'usuario representante');
  if (!mensualidad || !mensualidad.id_alumno) {
    return res.status(404).json({ error: 'Mensualidad no encontrada' });
  }

  const esPropio = await userOwnsAlumno(req.user.id, mensualidad.id_alumno, Representante);
  if (!esPropio) return res.status(403).json({ error: 'No tienes permiso para esta mensualidad' });

  next();
};

exports.ensurePagoOwnershipFromParam = (paramName = 'id_pago') => async (req, res, next) => {
  if (!isEndUser(req)) return next();

  const { PagoDetalle, Mensualidad, Representante } = await getTenantOwnershipModels(req);
  const pagoId = req.params[paramName];
  if (!pagoId) return res.status(400).json({ error: 'id_pago requerido' });

  const pago = await PagoDetalle.findById(pagoId).select('id_mensualidad');
  if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });

  const mensualidad = await Mensualidad.findById(pago.id_mensualidad).populate('id_alumno', 'usuario representante');
  if (!mensualidad || !mensualidad.id_alumno) {
    return res.status(404).json({ error: 'Mensualidad no encontrada' });
  }

  const esPropio = await userOwnsAlumno(req.user.id, mensualidad.id_alumno, Representante);
  if (!esPropio) return res.status(403).json({ error: 'No tienes permiso para este pago' });

  next();
};