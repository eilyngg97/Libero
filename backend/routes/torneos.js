const express = require('express');
const router = express.Router();
const { authMiddleware, rolMiddleware } = require('../middleware/auth');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

async function getTenantTournamentModels(req) {
  const connection = await getTenantBusinessConnection(req.tenant || { tenantId: req.tenantId });
  return {
    Torneo: getTenantModel(connection, 'Torneo'),
    Partido: getTenantModel(connection, 'Partido'),
    Alumno: getTenantModel(connection, 'Alumno')
  };
}

// ...otros endpoints...

// DELETE /api/torneos/:id
router.delete('/:id', authMiddleware, rolMiddleware('admin'), async (req, res) => {
  try {
    const { Torneo, Partido } = await getTenantTournamentModels(req);
    const torneo = await Torneo.findById(req.params.id);
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    // Eliminar todos los partidos asociados a este torneo
    await Partido.deleteMany({ torneo: torneo._id });
    // Eliminar el torneo
    await torneo.deleteOne();
    res.json({ message: 'Torneo y partidos eliminados correctamente' });
  } catch (err) {
    res.status(400).json({ error: 'Error al eliminar torneo', detalle: err.message });
  }
});


// GET /api/torneos
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { Torneo } = await getTenantTournamentModels(req);
    const torneos = await Torneo.find()
      .populate({
        path: 'convocados.alumno',
        select: 'nombres apellidos foto categoria', // Selecciona solo los campos necesarios
      })
      .sort({ createdAt: -1 });
    res.json(torneos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener torneos', detalle: err.message });
  }
});

// GET /api/torneos/por-alumno/:alumnoId
router.get('/por-alumno/:alumnoId', authMiddleware, async (req, res) => {
  try {
    const { Torneo } = await getTenantTournamentModels(req);
    const { alumnoId } = req.params;
    const torneos = await Torneo.find({ 'convocados.alumno': alumnoId })
      .select('nombre descripcion fecha_limite convocados')
      .sort({ createdAt: -1 });
    const data = torneos.map((t) => {
      const match = (t.convocados || []).find(c => String(c.alumno) === String(alumnoId));
      return {
        _id: t._id,
        nombre: t.nombre,
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
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { Torneo } = await getTenantTournamentModels(req);
    const torneo = await Torneo.findById(req.params.id)
      .populate('convocados.alumno');
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    res.json(torneo);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener torneo', detalle: err.message });
  }
});

// POST /api/torneos
router.post('/', authMiddleware, rolMiddleware('admin'), async (req, res) => {
  try {
    const { Torneo, Alumno } = await getTenantTournamentModels(req);
    const { nombre, descripcion, fecha_limite, convocados } = req.body;
    if (!nombre) {
      return res.status(400).json({ error: 'Nombre es obligatorio' });
    }
    const uniqueIds = Array.isArray(convocados)
      ? Array.from(new Set(convocados.filter(Boolean).map((id) => String(id))))
      : [];

    // Obtener la categoría actual de cada alumno para guardarla como snapshot
    const alumnosDocs = await Alumno.find({ _id: { $in: uniqueIds } }, 'categoria');
    const mapCategorias = {};
    for (const al of alumnosDocs) {
      mapCategorias[String(al._id)] = al.categoria || '';
    }

    const convocadosList = uniqueIds.map((alumno) => ({ 
      alumno,
      categoria_snapshot: mapCategorias[alumno] || ''
    }));

    const torneo = await Torneo.create({
      nombre,
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
router.put('/:id', authMiddleware, rolMiddleware('admin'), async (req, res) => {
  try {
    const { Torneo, Alumno } = await getTenantTournamentModels(req);
    const { nombre, descripcion, fecha_limite, convocados } = req.body;
    const update = {};
    if (nombre !== undefined) update.nombre = nombre;
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
      
      const alumnosDocs = await Alumno.find({ _id: { $in: uniqueNuevos } }, 'categoria');
      const mapCategorias = {};
      for (const al of alumnosDocs) {
        mapCategorias[String(al._id)] = al.categoria || '';
      }

      update.convocados = uniqueNuevos.map((alumnoId) => {
        const key = String(alumnoId);
        const prev = existentes.get(key);
        // Si el alumno ya existía, podríamos mantener la categoría vieja,
        // pero por simplicidad se puede guardar el snapshot guardado previamente
        //  o se actualiza. Lo idóneo es mantener el que tenía para no alterar el pasado,
        // o si es un torneo actual, tomar el actual de "mapCategorias".
        return {
          alumno: alumnoId,
          categoria_snapshot: prev?.categoria_snapshot || mapCategorias[key] || '',
          estado: prev?.estado || 'pendiente',
          respondido_en: prev?.respondido_en || null
        };
      });
    }

    const torneo = await Torneo.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('convocados.alumno');
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
    res.json(torneo);
  } catch (err) {
    res.status(400).json({ error: 'Error al actualizar torneo', detalle: err.message });
  }
});

// PATCH /api/torneos/:id/convocados/:alumnoId
router.patch('/:id/convocados/:alumnoId', authMiddleware, async (req, res) => {
  try {
    const { Torneo } = await getTenantTournamentModels(req);
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

module.exports = router;
