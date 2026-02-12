// Endpoint para obtener la cantidad de alumnos por sede
const Alumno = require('../models/Alumno');

async function getAlumnosCountBySede(req, res) {
  try {
    const counts = await Alumno.aggregate([
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
        $unwind: '$sedeInfo'
      },
      {
        $project: {
          _id: 1,
          count: 1,
          nombre: '$sedeInfo.nombre',
          direccion: '$sedeInfo.direccion'
        }
      }
    ]);
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener el conteo por sede' });
  }
}

module.exports = { getAlumnosCountBySede };
