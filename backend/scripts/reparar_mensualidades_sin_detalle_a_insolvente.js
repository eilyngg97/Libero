require('dotenv').config();
const mongoose = require('mongoose');
const Mensualidad = require('../models/Mensualidad');
const PagoDetalle = require('../models/PagoDetalle');
const Alumno = require('../models/Alumno');
const Sede = require('../models/Sede');

function escapeRegex(texto) {
  return String(texto || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseArgs(argv) {
  const args = {
    apply: false,
    mes: null,
    anio: null,
    includeZero: false,
    allStatuses: false,
    sedeId: null,
    sedeNombre: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') args.apply = true;
    if (token === '--include-zero') args.includeZero = true;
    if (token === '--all-statuses') args.allStatuses = true;

    if (token.startsWith('--mes=')) args.mes = Number(token.split('=')[1]);
    if (token.startsWith('--anio=')) args.anio = Number(token.split('=')[1]);
    if (token.startsWith('--sede-id=')) args.sedeId = token.split('=')[1];
    if (token.startsWith('--sede-nombre=')) args.sedeNombre = token.split('=')[1];
  }

  return args;
}

function validarArgs(args) {
  if (args.mes !== null && (!Number.isInteger(args.mes) || args.mes < 1 || args.mes > 12)) {
    throw new Error('Parametro --mes invalido. Debe estar entre 1 y 12.');
  }

  if (args.anio !== null && (!Number.isInteger(args.anio) || args.anio < 2000)) {
    throw new Error('Parametro --anio invalido.');
  }

  if (args.sedeId && !mongoose.Types.ObjectId.isValid(args.sedeId)) {
    throw new Error('Parametro --sede-id invalido.');
  }
}

async function main() {
  const args = parseArgs(process.argv);
  validarArgs(args);

  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('No se encontro MONGODB_URI ni MONGO_URI en variables de entorno.');
  }

  await mongoose.connect(mongoUri);

  let sedeIds = null;
  if (args.sedeId || args.sedeNombre) {
    if (args.sedeId) {
      sedeIds = [new mongoose.Types.ObjectId(args.sedeId)];
    } else {
      const sedes = await Sede.find({
        nombre: { $regex: new RegExp(`^${escapeRegex(args.sedeNombre)}$`, 'i') }
      }).select('_id nombre').lean();

      if (sedes.length === 0) {
        throw new Error(`No existe una sede con nombre "${args.sedeNombre}".`);
      }

      sedeIds = sedes.map((sede) => sede._id);
      console.log(`Sede(s) objetivo: ${sedes.map((s) => s.nombre).join(', ')}`);
    }
  }

  const estatusObjetivo = args.allStatuses
    ? { $nin: ['Exonerado', 'Exento por reposo', 'Insolvente', 'Retrasado'] }
    : { $in: ['Pagado', 'En revision'] };

  const filtro = { estatus: estatusObjetivo };

  if (!args.includeZero) {
    filtro.monto_esperado = { $gt: 0 };
  }
  if (args.mes !== null) filtro.mes = args.mes;
  if (args.anio !== null) filtro.anio = args.anio;

  if (sedeIds) {
    const alumnosSede = await Alumno.find({ sede: { $in: sedeIds } }).select('_id').lean();
    if (alumnosSede.length === 0) {
      console.log('No hay alumnos asociados a la sede indicada.');
      await mongoose.disconnect();
      return;
    }
    filtro.id_alumno = { $in: alumnosSede.map((a) => a._id) };
  }

  const candidatas = await Mensualidad.find(filtro)
    .select('_id id_alumno mes anio estatus monto_esperado')
    .lean();

  if (candidatas.length === 0) {
    console.log('No se encontraron mensualidades candidatas con ese filtro.');
    await mongoose.disconnect();
    return;
  }

  const ids = candidatas.map((m) => m._id);
  const pagos = await PagoDetalle.aggregate([
    { $match: { id_mensualidad: { $in: ids } } },
    { $group: { _id: '$id_mensualidad', total: { $sum: 1 } } }
  ]);

  const pagosMap = new Map(pagos.map((p) => [String(p._id), p.total]));

  const reparar = candidatas.filter((m) => {
    const total = pagosMap.get(String(m._id)) || 0;
    return total === 0;
  });

  console.log(`Candidatas evaluadas: ${candidatas.length}`);
  console.log(`Mensualidades sin detalle de pago: ${reparar.length}`);

  if (reparar.length > 0) {
    console.log('Muestra (max 20):');
    reparar.slice(0, 20).forEach((m) => {
      console.log(`- ${m._id} alumno=${m.id_alumno} periodo=${m.mes}/${m.anio} estatus=${m.estatus} monto=${m.monto_esperado}`);
    });
  }

  if (!args.apply) {
    console.log('Dry-run finalizado. Usa --apply para ejecutar cambios.');
    await mongoose.disconnect();
    return;
  }

  if (reparar.length === 0) {
    console.log('No hay cambios por aplicar.');
    await mongoose.disconnect();
    return;
  }

  const result = await Mensualidad.updateMany(
    { _id: { $in: reparar.map((m) => m._id) } },
    { $set: { estatus: 'Insolvente' } }
  );

  console.log(`Actualizadas a Insolvente: ${result.modifiedCount}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Error:', err.message);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // no-op
  }
  process.exit(1);
});
