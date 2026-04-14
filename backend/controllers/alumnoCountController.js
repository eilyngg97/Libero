// Endpoint para obtener la cantidad de alumnos por sede
const Alumno = require('../models/Alumno');

async function getAlumnosCountBySede(req, res) {
  try {
    const counts = await Alumno.aggregate([
      {
        $match: {
          activo: { $ne: false },
          dado_de_baja: { $ne: true }
        }
      },
      {
        $group: {
          _id: '$sede',
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'sedes',
          localField: '_id',
          foreignField: '_id',
          as: 'sedeInfo'
        }
      },
      {
        $unwind: {
          path: '$sedeInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 1,
          count: 1,
          nombre: { $ifNull: ['$sedeInfo.nombre', 'Sin sede'] },
          direccion: { $ifNull: ['$sedeInfo.direccion', 'Sin direccion'] }
        }
      }
    ]);
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener el conteo por sede' });
  }
}

module.exports = { getAlumnosCountBySede };
