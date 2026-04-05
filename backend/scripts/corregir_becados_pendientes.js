#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');
const Mensualidad = require('../models/Mensualidad');
const Alumno = require('../models/Alumno');
const { getMongoUri } = require('../config/secrets');

function parseArgs(argv) {
  const args = {
    apply: false,
    mes: null,
    anio: null,
    allStatuses: false
  };

  for (const arg of argv) {
    if (arg === '--apply') {
      args.apply = true;
      continue;
    }

    if (arg === '--all-statuses') {
      args.allStatuses = true;
      continue;
    }

    if (arg.startsWith('--mes=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isInteger(value) && value >= 1 && value <= 12) {
        args.mes = value;
      }
    }

    if (arg.startsWith('--anio=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isInteger(value) && value >= 2000) {
        args.anio = value;
      }
    }
  }

  return args;
}

function buildFiltroMensualidades(args, alumnoIds) {
  const filtro = {
    id_alumno: { $in: alumnoIds },
    monto_esperado: { $lte: 0 }
  };

  filtro.estatus = args.allStatuses
    ? { $in: ['Pendiente', 'Insolvente', 'Retrasado', 'Abono', 'En revision'] }
    : 'Pendiente';

  if (args.mes !== null) filtro.mes = args.mes;
  if (args.anio !== null) filtro.anio = args.anio;

  return filtro;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const modo = args.apply ? 'APPLY' : 'DRY-RUN';

  console.log(`\n[${modo}] Corregir mensualidades de alumnos becados`);
  console.log(`- Filtro estatus: ${args.allStatuses ? 'Pendiente/Insolvente/Retrasado/Abono/En revision' : 'Pendiente'}`);
  if (args.mes !== null) console.log(`- Mes: ${args.mes}`);
  if (args.anio !== null) console.log(`- Año: ${args.anio}`);

  await mongoose.connect(getMongoUri());

  try {
    const alumnosBecados = await Alumno.find({
      tipo_mensualidad: 'beca_completa',
      activo: { $ne: false },
      dado_de_baja: { $ne: true }
    }).select('_id').lean();

    if (alumnosBecados.length === 0) {
      console.log('No se encontraron alumnos becados activos.');
      return;
    }

    const alumnoIds = alumnosBecados.map((a) => a._id);
    const filtro = buildFiltroMensualidades(args, alumnoIds);

    const candidatas = await Mensualidad.find(filtro)
      .select('_id id_alumno mes anio estatus monto_esperado')
      .lean();

    console.log(`- Alumnos becados evaluados: ${alumnosBecados.length}`);
    console.log(`- Mensualidades candidatas: ${candidatas.length}`);

    if (candidatas.length > 0) {
      console.log('Muestra (max 20):');
      candidatas.slice(0, 20).forEach((m) => {
        console.log(`  - ${m._id} alumno=${m.id_alumno} periodo=${m.mes}/${m.anio} estatus=${m.estatus} monto=${m.monto_esperado}`);
      });
    }

    if (!args.apply) {
      console.log('\nNo se aplicaron cambios. Usa --apply para confirmar.');
      return;
    }

    if (candidatas.length === 0) {
      console.log('No hay cambios por aplicar.');
      return;
    }

    const result = await Mensualidad.updateMany(
      { _id: { $in: candidatas.map((m) => m._id) } },
      { $set: { estatus: 'Becado' } }
    );

    console.log(`Mensualidades actualizadas a Becado: ${result.modifiedCount}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error('Error al corregir mensualidades becadas:', error.message);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // no-op
  }
  process.exit(1);
});
