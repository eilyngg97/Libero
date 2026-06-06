require('dotenv').config();
const mongoose = require('mongoose');
const Mensualidad = require('../models/Mensualidad');
const { aplicarRecargoMensualidadSegunConfig } = require('../controllers/mensualidadController');

function parseArgs(argv) {
  const args = {
    apply: false,
    verbose: false,
    limit: null,
    mes: null,
    anio: null,
    alumnoId: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') args.apply = true;
    if (token === '--verbose') args.verbose = true;
    if (token.startsWith('--limit=')) args.limit = Number(token.split('=')[1]);
    if (token.startsWith('--mes=')) args.mes = Number(token.split('=')[1]);
    if (token.startsWith('--anio=')) args.anio = Number(token.split('=')[1]);
    if (token.startsWith('--alumno-id=')) args.alumnoId = token.split('=')[1];
  }

  return args;
}

function validarArgs(args) {
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit <= 0)) {
    throw new Error('Parametro --limit invalido. Debe ser un entero mayor a 0.');
  }

  if (args.mes !== null && (!Number.isInteger(args.mes) || args.mes < 1 || args.mes > 12)) {
    throw new Error('Parametro --mes invalido. Debe estar entre 1 y 12.');
  }

  if (args.anio !== null && (!Number.isInteger(args.anio) || args.anio < 2000)) {
    throw new Error('Parametro --anio invalido. Debe ser un anio valido.');
  }

  if (args.alumnoId && !mongoose.Types.ObjectId.isValid(args.alumnoId)) {
    throw new Error('Parametro --alumno-id invalido. Debe ser un ObjectId valido.');
  }
}

async function main() {
  const args = parseArgs(process.argv);
  validarArgs(args);

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('No se encontro MONGO_URI ni MONGODB_URI en variables de entorno.');
  }

  await mongoose.connect(mongoUri);

  const filtro = {
    estatus: { $in: ['Pendiente', 'Insolvente', 'Abono', 'En revision'] },
    monto_esperado: { $gt: 0 },
    $or: [
      { recargo_aplicado_usd: { $exists: false } },
      { recargo_aplicado_usd: { $lte: 0 } }
    ]
  };

  if (args.mes !== null) filtro.mes = args.mes;
  if (args.anio !== null) filtro.anio = args.anio;
  if (args.alumnoId) filtro.id_alumno = args.alumnoId;

  let query = Mensualidad.find(filtro).populate('id_alumno', 'tipo_mensualidad aplicar_recargo_mensualidad dia_limite_personalizado');

  if (args.limit !== null) {
    query = query.limit(args.limit);
  }

  const candidatas = await query;
  const hoy = new Date();

  console.log(`Candidatas encontradas: ${candidatas.length}`);

  if (candidatas.length === 0) {
    console.log('No hay mensualidades con recargo faltante que coincidan con el filtro.');
    await mongoose.disconnect();
    return;
  }

  let aplicadas = 0;
  let noAplicadas = 0;
  const detallesNoAplicadas = [];

  for (const mensualidad of candidatas) {
    const resultado = await aplicarRecargoMensualidadSegunConfig(mensualidad, {
      fechaReferencia: hoy,
      persistir: args.apply
    });

    if (resultado.aplicado) {
      aplicadas += 1;
      if (args.verbose) {
        console.log(`APLICADO: ${mensualidad._id} periodo=${mensualidad.mes}/${mensualidad.anio} alumno=${String(mensualidad.id_alumno?._id || mensualidad.id_alumno)} recargo=${mensualidad.recargo_aplicado_usd} fechaRecargo=${resultado.fechaRecargo}`);
      }
    } else {
      noAplicadas += 1;
      const motivo = Number(resultado.configCobro?.recargo_usd || 0) <= 0
        ? 'recargo_usd=0'
        : (resultado.fechaRecargo && hoy < new Date(resultado.fechaRecargo))
          ? 'fechaRecargo no alcanzada'
          : 'no elegible para recargo';

      detallesNoAplicadas.push({
        id: String(mensualidad._id),
        periodo: `${mensualidad.mes}/${mensualidad.anio}`,
        alumnoId: String(mensualidad.id_alumno?._id || mensualidad.id_alumno),
        estatus: mensualidad.estatus,
        monto_esperado: mensualidad.monto_esperado,
        recargo_aplicado_usd: mensualidad.recargo_aplicado_usd,
        fechaRecargo: resultado.fechaRecargo,
        motivo
      });

      if (args.verbose) {
        console.log(`NO APLICADO: ${mensualidad._id} motivo=${motivo} fechaRecargo=${resultado.fechaRecargo}`);
      }
    }
  }

  console.log('---');
  console.log(`Recargos aplicados: ${aplicadas}`);
  console.log(`No aplicados: ${noAplicadas}`);

  if (detallesNoAplicadas.length > 0) {
    console.log('Primeras entradas no aplicadas (hasta 20):');
    detallesNoAplicadas.slice(0, 20).forEach((item) => {
      console.log(`- ${item.id} alumno=${item.alumnoId} periodo=${item.periodo} estatus=${item.estatus} motivo=${item.motivo} fechaRecargo=${item.fechaRecargo}`);
    });
  }

  if (!args.apply) {
    console.log('Dry-run finalizado. Agrega --apply para aplicar los recargos en la base de datos.');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Error:', err.message || err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
