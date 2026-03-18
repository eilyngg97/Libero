#!/usr/bin/env node
const mongoose = require('mongoose');
const Mensualidad = require('../models/Mensualidad');
const { getMongoUri } = require('../config/secrets');
require('dotenv').config();

function parseArgs(argv) {
  const args = {
    anio: new Date().getFullYear(),
    apply: false,
    incluirExoneradas: false
  };

  for (const arg of argv) {
    if (arg === '--apply') {
      args.apply = true;
      continue;
    }

    if (arg === '--incluir-exoneradas') {
      args.incluirExoneradas = true;
      continue;
    }

    if (arg.startsWith('--anio=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isInteger(value) && value > 2000 && value < 3000) {
        args.anio = value;
      }
    }
  }

  return args;
}

function buildFiltro({ anio, incluirExoneradas }) {
  const filtro = {
    mes: 1,
    anio,
    estatus: {
      $ne: 'Pagado'
    }
  };

  if (!incluirExoneradas) {
    filtro.estatus = {
      $nin: ['Pagado', 'Exonerado', 'Exento por reposo']
    };
  }

  return filtro;
}

async function resumenPorEstatus(baseFiltro) {
  return Mensualidad.aggregate([
    { $match: baseFiltro },
    { $group: { _id: '$estatus', total: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const filtroBase = { mes: 1, anio: options.anio };
  const filtroActualizacion = buildFiltro(options);
  const modo = options.apply ? 'APPLY' : 'DRY-RUN';

  console.log(`\n[${modo}] Marcar mensualidades de enero como pagadas`);
  console.log(`- Año: ${options.anio}`);
  console.log(`- Incluir exoneradas/exentas: ${options.incluirExoneradas ? 'SI' : 'NO'}`);

  await mongoose.connect(getMongoUri());

  try {
    const totalEnero = await Mensualidad.countDocuments(filtroBase);
    const totalCandidatas = await Mensualidad.countDocuments(filtroActualizacion);
    const porEstatus = await resumenPorEstatus(filtroBase);

    console.log(`- Total mensualidades enero: ${totalEnero}`);
    console.log(`- Candidatas a cambiar: ${totalCandidatas}`);

    if (porEstatus.length > 0) {
      console.log('\nResumen actual por estatus:');
      for (const item of porEstatus) {
        console.log(`  - ${item._id || 'Sin estatus'}: ${item.total}`);
      }
    }

    if (!options.apply) {
      console.log('\nNo se aplicaron cambios. Ejecuta con --apply para confirmar.');
      return;
    }

    const result = await Mensualidad.updateMany(
      filtroActualizacion,
      { $set: { estatus: 'Pagado' } }
    );

    console.log(`\nMensualidades actualizadas a Pagado: ${result.modifiedCount}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error('Error al marcar mensualidades:', error.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});