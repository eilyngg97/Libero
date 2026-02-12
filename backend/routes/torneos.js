const express = require('express');
const router = express.Router();
const Torneo = require('../models/Torneo');
const Partido = require('../models/Partido');

// GET /api/torneos
router.get('/', async (req, res) => {
  try {
    const torneos = await Torneo.find()
      .populate('partidos')
      .populate('convocados.alumno')
      .sort({ createdAt: -1 });
    res.json(torneos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener torneos', detalle: err.message });
  }
});

// GET /api/torneos/por-alumno/:alumnoId
router.get('/por-alumno/:alumnoId', async (req, res) => {
  try {
    const { alumnoId } = req.params;
    const torneos = await Torneo.find({ 'convocados.alumno': alumnoId })
      .select('nombre liga descripcion fecha_limite convocados')
      .sort({ createdAt: -1 });
    const data = torneos.map((t) => {
      const match = (t.convocados || []).find(c => String(c.alumno) === String(alumnoId));
      return {
        _id: t._id,
        nombre: t.nombre,
        liga: t.liga,
        descripcion: t.descripcion,
        fecha_limite: t.fecha_limite,
        estado: match?.estado || 'pendiente',
        respondido_en: match?.respondido_en || null
      };
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener torneos del alumno', detalle: err.message });
  }
});

// GET /api/torneos/:id
router.get('/:id', async (req, res) => {
  try {
    const torneo = await Torneo.findById(req.params.id)
      .populate('partidos')
      .populate('convocados.alumno');
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    res.json(torneo);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener torneo', detalle: err.message });
  }
});

// GET /api/torneos/:id/partidos
router.get('/:id/partidos', async (req, res) => {
  try {
    const torneo = await Torneo.findById(req.params.id).populate('partidos');
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    res.json(Array.isArray(torneo.partidos) ? torneo.partidos : []);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener partidos', detalle: err.message });
  }
});

// POST /api/torneos
router.post('/', async (req, res) => {
  try {
    const { nombre, liga, descripcion, fecha_limite, convocados } = req.body;
    if (!nombre || !liga) {
      return res.status(400).json({ error: 'Nombre y liga son obligatorios' });
    }
    const uniqueIds = Array.isArray(convocados)
      ? Array.from(new Set(convocados.filter(Boolean).map((id) => String(id))))
      : [];
    const convocadosList = uniqueIds.map((alumno) => ({ alumno }));
    const torneo = await Torneo.create({
      nombre,
      liga,
      descripcion,
      fecha_limite: fecha_limite || null,
      convocados: convocadosList
    });
    res.status(201).json(torneo);
  } catch (err) {
    res.status(400).json({ error: 'Error al crear torneo', detalle: err.message });
  }
});

// PUT /api/torneos/:id
router.put('/:id', async (req, res) => {
  try {
    const { nombre, liga, descripcion, fecha_limite, convocados } = req.body;
    const update = {};
    if (nombre !== undefined) update.nombre = nombre;
    if (liga !== undefined) update.liga = liga;
    if (descripcion !== undefined) update.descripcion = descripcion;
    if (fecha_limite !== undefined) update.fecha_limite = fecha_limite || null;

    let torneoActual = null;
    if (convocados !== undefined) {
      torneoActual = await Torneo.findById(req.params.id);
      if (!torneoActual) return res.status(404).json({ error: 'Torneo no encontrado' });
      const existentes = new Map(
        (torneoActual.convocados || []).map((c) => [String(c.alumno), c])
      );
      const nuevos = Array.isArray(convocados) ? convocados.filter(Boolean) : [];
      const uniqueNuevos = Array.from(new Set(nuevos.map((id) => String(id))));
      update.convocados = uniqueNuevos.map((alumnoId) => {
        const key = String(alumnoId);
        const prev = existentes.get(key);
        return {
          alumno: alumnoId,
          estado: prev?.estado || 'pendiente',
          respondido_en: prev?.respondido_en || null
        };
      });
    }

    const torneo = await Torneo.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('partidos')
      .populate('convocados.alumno');
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    res.json(torneo);
  } catch (err) {
    res.status(400).json({ error: 'Error al actualizar torneo', detalle: err.message });
  }
});

// PATCH /api/torneos/:id/convocados/:alumnoId
router.patch('/:id/convocados/:alumnoId', async (req, res) => {
  try {
    const { id, alumnoId } = req.params;
    const { estado } = req.body;
    if (!['aceptado', 'rechazado'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }
    const torneo = await Torneo.findById(id);
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (torneo.fecha_limite && new Date() > new Date(torneo.fecha_limite)) {
      return res.status(400).json({ error: 'La fecha límite ya pasó' });
    }
    const convocado = (torneo.convocados || []).find(c => String(c.alumno) === String(alumnoId));
    if (!convocado) return res.status(404).json({ error: 'Alumno no convocado' });
    convocado.estado = estado;
    convocado.respondido_en = new Date();
    await torneo.save();
    res.json({ message: 'Respuesta registrada', estado, respondido_en: convocado.respondido_en });
  } catch (err) {
    res.status(400).json({ error: 'Error al responder convocatoria', detalle: err.message });
  }
});

// POST /api/torneos/:id/partidos
router.post('/:id/partidos', async (req, res) => {
  try {
    const torneoId = req.params.id;
    const {
      nombre,
      descripcion,
      direccion,
      fecha,
      hora,
      monto,
      monto_inscripcion,
      monto_acompanante,
      entrenador,
      equipo_contrario,
      jugadores
    } = req.body;
    if (!nombre || !direccion || !fecha || !hora || !monto || !monto_inscripcion || !monto_acompanante || !entrenador || !equipo_contrario) {
      return res.status(400).json({ error: 'Faltan campos obligatorios del partido' });
    }
    const torneo = await Torneo.findById(torneoId);
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    const toNumber = (value) => (value === null || value === undefined || value === '' ? undefined : Number(value));
    const partido = await Partido.create({
      nombre,
      descripcion,
      direccion,
      fecha,
      hora,
      monto: toNumber(monto),
      monto_inscripcion: toNumber(monto_inscripcion),
      monto_acompanante: toNumber(monto_acompanante),
      entrenador,
      equipo_contrario,
      jugadores: Array.isArray(jugadores) ? jugadores : [],
      torneo: torneoId
    });
    await Torneo.findByIdAndUpdate(torneoId, { $push: { partidos: partido._id } });
    res.status(201).json(partido);
  } catch (err) {
    res.status(400).json({ error: 'Error al crear partido', detalle: err.message });
  }
});

module.exports = router;
