const Aspirante = require('../models/Aspirante');

const nivelesValidos = new Set(['Principiante', 'Intermedio', 'Avanzado']);
const estadosValidos = new Set(['pendiente', 'contactado', 'inscrito', 'descartado']);

exports.createAspirante = async (req, res) => {
  try {
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

    const aspirante = new Aspirante({
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
    const aspirantes = await Aspirante.find().sort({ createdAt: -1 });
    return res.json(aspirantes);
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener aspirantes.' });
  }
};

exports.updateEstadoAspirante = async (req, res) => {
  try {
    const estado = (req.body?.estado || '').trim().toLowerCase();
    if (!estadosValidos.has(estado)) {
      return res.status(400).json({ error: 'Estado invalido.' });
    }

    const aspirante = await Aspirante.findByIdAndUpdate(
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
