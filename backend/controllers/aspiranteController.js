const Aspirante = require('../models/Aspirante');
const Alumno = require('../models/Alumno');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

async function getTenantAspiranteModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);

  return {
    Aspirante: getTenantModel(connection, 'Aspirante'),
    Alumno: getTenantModel(connection, 'Alumno')
  };
}

const nivelesValidos = new Set(['Principiante', 'Intermedio', 'Avanzado']);
const estadosValidos = new Set(['pendiente', 'contactado', 'inscrito', 'descartado']);

function normalizarTexto(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizarTelefono(value) {
  return String(value || '').replace(/\D/g, '');
}

function construirRegexTelefonoFlexible(telefonoNormalizado) {
  const escaped = telefonoNormalizado.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patron = escaped.split('').join('\\D*');
  return new RegExp(patron);
}

function mismaFechaCalendario(a, b) {
  if (!a || !b) return false;
  const fechaA = new Date(a);
  const fechaB = new Date(b);
  if (Number.isNaN(fechaA.getTime()) || Number.isNaN(fechaB.getTime())) return false;

  return (
    fechaA.getUTCFullYear() === fechaB.getUTCFullYear() &&
    fechaA.getUTCMonth() === fechaB.getUTCMonth() &&
    fechaA.getUTCDate() === fechaB.getUTCDate()
  );
}

exports.createAspirante = async (req, res) => {
  try {
    const {
      Aspirante: TenantAspirante,
      Alumno: TenantAlumno
    } = await getTenantAspiranteModels(req);

    const nombreCompleto = (req.body?.nombreCompleto || '').trim();
    const fechaNacimiento = req.body?.fechaNacimiento;
    const nivelExperiencia = (req.body?.nivelExperiencia || '').trim();
    const telefono = (req.body?.telefono || '').trim();

    if (!nombreCompleto || !fechaNacimiento || !nivelExperiencia || !telefono) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    if (!nivelesValidos.has(nivelExperiencia)) {
      return res.status(400).json({ error: 'Nivel de experiencia invalido.' });
    }

    const fecha = new Date(fechaNacimiento);
    if (Number.isNaN(fecha.getTime())) {
      return res.status(400).json({ error: 'Fecha de nacimiento invalida.' });
    }

    const telefonoNormalizado = normalizarTelefono(telefono);
    const nombreNormalizado = normalizarTexto(nombreCompleto);
    const regexTelefono = telefonoNormalizado
      ? construirRegexTelefonoFlexible(telefonoNormalizado)
      : null;

    const fechaInicio = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate(), 0, 0, 0, 0));
    const fechaFin = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate(), 23, 59, 59, 999));

    const condicionesCoincidencia = [{ fecha_nacimiento: { $gte: fechaInicio, $lte: fechaFin } }];
    if (regexTelefono) {
      condicionesCoincidencia.push({ telefono: { $regex: regexTelefono } });
    }

    const alumnosCoincidencia = await TenantAlumno.find({
      activo: { $ne: false },
      dado_de_baja: { $ne: true },
      $or: condicionesCoincidencia
    }).select('nombres apellidos telefono fecha_nacimiento');

    const existeAlumno = alumnosCoincidencia.some((alumno) => {
      const nombreAlumno = normalizarTexto(`${alumno.nombres || ''} ${alumno.apellidos || ''}`);
      const telefonoAlumno = normalizarTelefono(alumno.telefono);

      const coincideTelefono = telefonoNormalizado && telefonoAlumno && telefonoAlumno === telefonoNormalizado;
      const coincideNombreYFecha = nombreAlumno && nombreNormalizado && nombreAlumno === nombreNormalizado &&
        mismaFechaCalendario(alumno.fecha_nacimiento, fecha);

      return coincideTelefono || coincideNombreYFecha;
    });

    if (existeAlumno) {
      return res.status(409).json({
        error: 'Ya existe un alumno registrado con estos datos. Si necesitas actualizar informacion, contacta a la academia.'
      });
    }

    const aspirante = new TenantAspirante({
      nombreCompleto,
      fechaNacimiento: fecha,
      nivelExperiencia,
      telefono
    });

    await aspirante.save();

    return res.status(201).json({
      message: 'Solicitud registrada con exito.',
      aspirante
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error al registrar aspirante.' });
  }
};

exports.getAspirantes = async (req, res) => {
  try {
    const { Aspirante: TenantAspirante } = await getTenantAspiranteModels(req);
    const aspirantes = await TenantAspirante.find().sort({ createdAt: -1 });
    return res.json(aspirantes);
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener aspirantes.' });
  }
};

exports.updateEstadoAspirante = async (req, res) => {
  try {
    const { Aspirante: TenantAspirante } = await getTenantAspiranteModels(req);
    const estado = (req.body?.estado || '').trim().toLowerCase();
    if (!estadosValidos.has(estado)) {
      return res.status(400).json({ error: 'Estado invalido.' });
    }

    const aspirante = await TenantAspirante.findByIdAndUpdate(
      req.params.id,
      { estado },
      { new: true }
    );

    if (!aspirante) {
      return res.status(404).json({ error: 'Aspirante no encontrado.' });
    }

    return res.json({ message: 'Estado actualizado.', aspirante });
  } catch (err) {
    return res.status(500).json({ error: 'Error al actualizar estado del aspirante.' });
  }
};

exports.deleteAspirante = async (req, res) => {
  try {
    const { Aspirante: TenantAspirante } = await getTenantAspiranteModels(req);
    const aspirante = await TenantAspirante.findByIdAndDelete(req.params.id);

    if (!aspirante) {
      return res.status(404).json({ error: 'Aspirante no encontrado.' });
    }

    return res.json({ message: 'Aspirante eliminado correctamente.' });
  } catch (err) {
    return res.status(500).json({ error: 'Error al eliminar aspirante.' });
  }
};
