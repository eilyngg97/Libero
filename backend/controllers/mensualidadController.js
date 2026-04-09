const Mensualidad = require('../models/Mensualidad');
const Alumno = require('../models/Alumno');
const Sede = require('../models/Sede');
const Reposo = require('../models/Reposo');

async function obtenerReglaReposoParaPeriodo(alumnoId, mes, anio) {
  const inicioMes = new Date(anio, mes - 1, 1, 0, 0, 0, 0);
  const finMes = new Date(anio, mes, 0, 23, 59, 59, 999);

  const reposoIndefinido = await Reposo.findOne({
    id_alumno: alumnoId,
    tipo: 'Indefinido',
    fecha_inicio: { $lte: finMes }
  }).sort({ fecha_inicio: -1 });

  if (reposoIndefinido) {
    return 'EXENTO_POR_REPOSO';
  }

  const reposoTotal = await Reposo.findOne({
    id_alumno: alumnoId,
    tipo: 'Total',
    fecha_inicio: { $gte: inicioMes, $lte: finMes }
  }).sort({ fecha_inicio: -1 });

  if (reposoTotal) {
    return 'EXENTO_POR_REPOSO';
  }

  return 'NORMAL';
}

async function generarMensualidadesMesCore() {
  const hoy = new Date();
  const mes = hoy.getMonth() + 1;
  const anio = hoy.getFullYear();
  const fecha_vencimiento = new Date(anio, mes - 1, 5, 23, 59, 59); // Día 5 del mes actual
  const alumnos = await Alumno.find({});
  let creadas = 0;

  for (const alumno of alumnos) {
    const existe = await Mensualidad.findOne({ id_alumno: alumno._id, mes, anio });
    if (!existe) {
      let monto = 0;
      let estatus = 'Pendiente';
      if (alumno.tipo_mensualidad === 'monto_sede' || !alumno.tipo_mensualidad) {
        let sedeId = alumno.sede && alumno.sede._id ? alumno.sede._id : alumno.sede;
        const sede = await Sede.findById(sedeId);
        monto = sede && sede.costo ? sede.costo : 0;
      } else if (alumno.tipo_mensualidad === 'monto_personalizado') {
        monto = alumno.monto_personalizado_valor || 0;
      } else if (alumno.tipo_mensualidad === 'beca_completa') {
        monto = 0;
      }

      const reglaReposo = await obtenerReglaReposoParaPeriodo(alumno._id, mes, anio);
      if (reglaReposo === 'EXENTO_POR_REPOSO') {
        monto = 0;
        estatus = 'Exento por reposo';
      }

      await Mensualidad.create({
        id_alumno: alumno._id,
        mes,
        anio,
        monto_esperado: monto,
        fecha_vencimiento,
        estatus
      });
      creadas++;
    }
  }

  return creadas;
}

async function actualizarRetrasadosCore({ force = false } = {}) {
  const hoy = new Date();
  if (!force && hoy.getDate() !== 6) return 0;
  const mes = hoy.getMonth() + 1;
  const anio = hoy.getFullYear();
  const result = await Mensualidad.updateMany(
    { mes, anio, estatus: 'Pendiente', fecha_vencimiento: { $lt: hoy } },
    { $set: { estatus: 'Retrasado' } }
  );
  return result.modifiedCount;
}

// Registrar la primera mensualidad manualmente
exports.registrarPrimeraMensualidad = async (req, res) => {
  try {
    const { id_alumno, monto_esperado, fecha_vencimiento, estatus } = req.body;
    if (!id_alumno || !monto_esperado) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }
    const hoy = new Date();
    const mes = hoy.getMonth() + 1;
    const anio = hoy.getFullYear();
    const existe = await Mensualidad.findOne({ id_alumno, mes, anio });
    if (existe) {
      return res.status(400).json({ error: 'Ya existe una mensualidad para este alumno este mes' });
    }

    const reglaReposo = await obtenerReglaReposoParaPeriodo(id_alumno, mes, anio);
    const estatusFinal = reglaReposo === 'EXENTO_POR_REPOSO' ? 'Exento por reposo' : (estatus || 'Pendiente');
    const montoFinal = reglaReposo === 'EXENTO_POR_REPOSO' ? 0 : monto_esperado;

    const mensualidad = await Mensualidad.create({
      id_alumno,
      mes,
      anio,
      monto_esperado: montoFinal,
      fecha_vencimiento: fecha_vencimiento || new Date(anio, mes - 1, 5, 23, 59, 59),
      estatus: estatusFinal
    });
    res.json(mensualidad);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Generar mensualidades automáticamente para todos los alumnos activos
exports.generarMensualidadesMes = async (req, res) => {
  try {
    const creadas = await generarMensualidadesMesCore();
    res.json({ message: `Mensualidades generadas: ${creadas}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Actualizar mensualidades a 'Retrasado' el día 6 si siguen en 'Pendiente'
exports.actualizarRetrasados = async (req, res) => {
  try {
    const actualizadas = await actualizarRetrasadosCore();
    if (!actualizadas) return res.json({ message: 'Solo se ejecuta el día 6' });
    res.json({ message: `Mensualidades actualizadas a Retrasado: ${actualizadas}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.generarMensualidadesMesCore = generarMensualidadesMesCore;
exports.actualizarRetrasadosCore = actualizarRetrasadosCore;

// Consultar mensualidades (por sede, alumno, mes, año)
exports.getMensualidades = async (req, res) => {
  try {
    const filtro = {};
    if (req.query.id_alumno) filtro.id_alumno = req.query.id_alumno;
    if (req.query.mes) filtro.mes = Number(req.query.mes);
    if (req.query.anio) filtro.anio = Number(req.query.anio);
    // Si se quiere filtrar por sede, buscar alumnos de esa sede
      if (req.query.id_sede) {
        console.log('Tipo de req.query.id_sede:', typeof req.query.id_sede, 'Valor:', req.query.id_sede);
        const mongoose = require('mongoose');
        let idSede;
        try {
          idSede = new mongoose.Types.ObjectId(req.query.id_sede);
        } catch (e) {
          console.log('Error al convertir id_sede:', e);
          return res.status(400).json({ error: 'id_sede inválido' });
        }
        const alumnos = await Alumno.find({ sede: idSede });
        filtro.id_alumno = { $in: alumnos.map(a => a._id) };
      }
    const mensualidades = await Mensualidad.find(filtro).populate('id_alumno');
    res.json(mensualidades);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Confirmar mensualidad en revisión
exports.confirmarMensualidad = async (req, res) => {
  try {
    const mensualidad = await Mensualidad.findById(req.params.id);
    if (!mensualidad) return res.status(404).json({ error: 'Mensualidad no encontrada' });
    mensualidad.estatus = 'Pagado';
    await mensualidad.save();
    res.json({ message: 'Mensualidad confirmada', mensualidad });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Resumen de mensualidades por sede (mes en curso por defecto)
exports.getResumenMensualidadesPorSede = async (req, res) => {
  try {
    const hoy = new Date();
    const mes = req.query.mes ? Number(req.query.mes) : hoy.getMonth() + 1;
    const anio = req.query.anio ? Number(req.query.anio) : hoy.getFullYear();

    const pipeline = [
      { $match: { mes, anio } },
      {
        $lookup: {
          from: 'alumnos',
          localField: 'id_alumno',
          foreignField: '_id',
          as: 'alumno'
        }
      },
      { $unwind: '$alumno' },
      {
        $lookup: {
          from: 'sedes',
          localField: 'alumno.sede',
          foreignField: '_id',
          as: 'sede'
        }
      },
      { $unwind: { path: '$sede', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            sedeId: '$sede._id',
            sedeNombre: '$sede.nombre',
            estatus: '$estatus'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: { sedeId: '$_id.sedeId', sedeNombre: '$_id.sedeNombre' },
          estatuses: { $push: { estatus: '$_id.estatus', count: '$count' } },
          total: { $sum: '$count' }
        }
      },
      {
        $project: {
          _id: 0,
          sedeId: '$_id.sedeId',
          sedeNombre: '$_id.sedeNombre',
          estatuses: 1,
          total: 1
        }
      }
    ];

    const data = await Mensualidad.aggregate(pipeline);
    const estados = ['pagado', 'pendiente', 'retrasado', 'en revision', 'exonerado', 'abono', 'exento por reposo'];
    const resultado = data.map(item => {
      const conteos = {};
      estados.forEach(e => { conteos[e] = 0; });
      item.estatuses.forEach(e => {
        const key = String(e.estatus || '').toLowerCase();
        if (conteos[key] !== undefined) conteos[key] = e.count;
      });
      return {
        sedeId: item.sedeId,
        sedeNombre: item.sedeNombre || 'Sin sede',
        total: item.total,
        ...conteos
      };
    });

    res.json({ mes, anio, sedes: resultado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
