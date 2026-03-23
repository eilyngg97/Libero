const Alumno = require('../models/Alumno');
const Representante = require('../models/Representante');
const Mensualidad = require('../models/Mensualidad');
const PagoDetalle = require('../models/PagoDetalle');

function isEndUser(req) {
  return req.user?.rol === 'usuario';
}

async function userOwnsAlumno(userId, alumno) {
  if (!alumno) return false;
  if (alumno.usuario && String(alumno.usuario) === String(userId)) {
    return true;
  }
  if (!alumno.representante) {
    return false;
  }
  const representante = await Representante.findById(alumno.representante).select('usuario');
  return !!representante && String(representante.usuario) === String(userId);
}

exports.ensureAlumnoOwnershipFromParam = (paramName = 'id') => async (req, res, next) => {
  if (!isEndUser(req)) return next();

  const alumnoId = req.params[paramName];
  if (!alumnoId) return res.status(400).json({ error: 'id de alumno requerido' });

  const alumno = await Alumno.findById(alumnoId).select('usuario representante');
  if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

  const esPropio = await userOwnsAlumno(req.user.id, alumno);
  if (!esPropio) return res.status(403).json({ error: 'No tienes permiso para este alumno' });

  next();
};

exports.ensureAlumnoOwnershipFromBody = (fieldName = 'alumnoId') => async (req, res, next) => {
  if (!isEndUser(req)) return next();

  const alumnoId = req.body?.[fieldName];
  if (!alumnoId) return res.status(400).json({ error: `${fieldName} requerido` });

  const alumno = await Alumno.findById(alumnoId).select('usuario representante');
  if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

  const esPropio = await userOwnsAlumno(req.user.id, alumno);
  if (!esPropio) return res.status(403).json({ error: 'No tienes permiso para este alumno' });

  next();
};

exports.ensureRepresentanteOwnershipFromParam = (paramName = 'representanteId') => async (req, res, next) => {
  if (!isEndUser(req)) return next();

  const representanteId = req.params[paramName];
  if (!representanteId) return res.status(400).json({ error: 'representanteId requerido' });

  const representante = await Representante.findById(representanteId).select('usuario');
  if (!representante) return res.status(404).json({ error: 'Representante no encontrado' });

  if (String(representante.usuario) !== String(req.user.id)) {
    return res.status(403).json({ error: 'No tienes permiso para este representante' });
  }

  next();
};

exports.ensureMensualidadOwnershipFromBody = (fieldName = 'id_mensualidad') => async (req, res, next) => {
  if (!isEndUser(req)) return next();

  const mensualidadId = req.body?.[fieldName];
  if (!mensualidadId) return res.status(400).json({ error: `${fieldName} requerido` });

  const mensualidad = await Mensualidad.findById(mensualidadId).populate('id_alumno', 'usuario representante');
  if (!mensualidad || !mensualidad.id_alumno) {
    return res.status(404).json({ error: 'Mensualidad no encontrada' });
  }

  const esPropio = await userOwnsAlumno(req.user.id, mensualidad.id_alumno);
  if (!esPropio) return res.status(403).json({ error: 'No tienes permiso para esta mensualidad' });

  next();
};

exports.ensureMensualidadOwnershipFromParam = (paramName = 'id_mensualidad') => async (req, res, next) => {
  if (!isEndUser(req)) return next();

  const mensualidadId = req.params[paramName];
  if (!mensualidadId) return res.status(400).json({ error: 'id_mensualidad requerido' });

  const mensualidad = await Mensualidad.findById(mensualidadId).populate('id_alumno', 'usuario representante');
  if (!mensualidad || !mensualidad.id_alumno) {
    return res.status(404).json({ error: 'Mensualidad no encontrada' });
  }

  const esPropio = await userOwnsAlumno(req.user.id, mensualidad.id_alumno);
  if (!esPropio) return res.status(403).json({ error: 'No tienes permiso para esta mensualidad' });

  next();
};

exports.ensurePagoOwnershipFromParam = (paramName = 'id_pago') => async (req, res, next) => {
  if (!isEndUser(req)) return next();

  const pagoId = req.params[paramName];
  if (!pagoId) return res.status(400).json({ error: 'id_pago requerido' });

  const pago = await PagoDetalle.findById(pagoId).select('id_mensualidad');
  if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });

  const mensualidad = await Mensualidad.findById(pago.id_mensualidad).populate('id_alumno', 'usuario representante');
  if (!mensualidad || !mensualidad.id_alumno) {
    return res.status(404).json({ error: 'Mensualidad no encontrada' });
  }

  const esPropio = await userOwnsAlumno(req.user.id, mensualidad.id_alumno);
  if (!esPropio) return res.status(403).json({ error: 'No tienes permiso para este pago' });

  next();
};