// Migra campos base64 (data URI) a archivos en disco local y guarda URL en MongoDB.
// Uso:
//   node scripts/migrar_media_base64_a_archivos.js --dry-run
//   node scripts/migrar_media_base64_a_archivos.js --apply

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Alumno = require('../models/Alumno');
const Reposo = require('../models/Reposo');
const { getMongoUri } = require('../config/secrets');
require('dotenv').config();

const args = process.argv.slice(2);
const applyChanges = args.includes('--apply');
const dryRun = !applyChanges;

const alumnosUploadDir = path.join(__dirname, '..', 'uploads', 'alumnos');
const repososUploadDir = path.join(__dirname, '..', 'uploads', 'reposos');

function ensureDirs() {
  fs.mkdirSync(alumnosUploadDir, { recursive: true });
  fs.mkdirSync(repososUploadDir, { recursive: true });
}

function parseDataUri(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1].trim().toLowerCase();
  const base64 = match[2].trim();
  if (!mime || !base64) return null;
  return { mime, base64 };
}

function extFromMime(mime) {
  const map = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/pdf': '.pdf'
  };
  return map[mime] || '.bin';
}

function buildFilename(prefix, docId, ext) {
  const stamp = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${docId}-${stamp}-${rand}${ext}`;
}

function writeBase64ToFile(dataUri, outDir, prefix, docId) {
  const parsed = parseDataUri(dataUri);
  if (!parsed) return null;

  const ext = extFromMime(parsed.mime);
  const filename = buildFilename(prefix, docId, ext);
  const absPath = path.join(outDir, filename);
  const buffer = Buffer.from(parsed.base64, 'base64');

  if (buffer.length === 0) {
    throw new Error('Buffer vacio al decodificar base64');
  }

  fs.writeFileSync(absPath, buffer);
  return filename;
}

async function migrarAlumnos() {
  const stats = {
    total: 0,
    conBase64Foto: 0,
    conBase64Cedula: 0,
    migrables: 0,
    actualizados: 0,
    errores: 0
  };

  const alumnos = await Alumno.find({
    $or: [
      { foto: /^data:/ },
      { foto_cedula: /^data:/ }
    ]
  }).select('_id foto foto_cedula');

  stats.total = alumnos.length;

  for (const alumno of alumnos) {
    try {
      const update = {};

      if (parseDataUri(alumno.foto)) {
        stats.conBase64Foto += 1;
        if (applyChanges) {
          const filename = writeBase64ToFile(alumno.foto, alumnosUploadDir, 'foto', alumno._id);
          update.foto = `/uploads/alumnos/${filename}`;
        }
      }

      if (parseDataUri(alumno.foto_cedula)) {
        stats.conBase64Cedula += 1;
        if (applyChanges) {
          const filename = writeBase64ToFile(alumno.foto_cedula, alumnosUploadDir, 'cedula', alumno._id);
          update.foto_cedula = `/uploads/alumnos/${filename}`;
        }
      }

      const tieneCamposBase64 = parseDataUri(alumno.foto) || parseDataUri(alumno.foto_cedula);
      if (tieneCamposBase64) {
        stats.migrables += 1;
      }

      if (Object.keys(update).length > 0) {
        if (applyChanges) {
          await Alumno.updateOne({ _id: alumno._id }, { $set: update });
          stats.actualizados += 1;
        }
      }
    } catch (err) {
      stats.errores += 1;
      console.error(`[ALUMNO] Error en ${alumno._id}: ${err.message}`);
    }
  }

  return stats;
}

async function migrarReposos() {
  const stats = {
    total: 0,
    conBase64Certificado: 0,
    migrables: 0,
    actualizados: 0,
    errores: 0
  };

  const reposos = await Reposo.find({ certificado: /^data:/ }).select('_id certificado');
  stats.total = reposos.length;

  for (const reposo of reposos) {
    try {
      if (!parseDataUri(reposo.certificado)) continue;

      stats.conBase64Certificado += 1;
      stats.migrables += 1;

      if (applyChanges) {
        const filename = writeBase64ToFile(reposo.certificado, repososUploadDir, 'certificado', reposo._id);
        await Reposo.updateOne(
          { _id: reposo._id },
          { $set: { certificado: `/uploads/reposos/${filename}` } }
        );
        stats.actualizados += 1;
      }
    } catch (err) {
      stats.errores += 1;
      console.error(`[REPOSO] Error en ${reposo._id}: ${err.message}`);
    }
  }

  return stats;
}

async function main() {
  const mode = dryRun ? 'DRY-RUN' : 'APPLY';
  console.log(`\n[${mode}] Migracion de media base64 -> archivos locales\n`);

  if (!dryRun) {
    ensureDirs();
  }

  const mongoUri = getMongoUri();
  await mongoose.connect(mongoUri);

  try {
    const alumnosStats = await migrarAlumnos();
    const repososStats = await migrarReposos();

    console.log('\nResumen alumnos:');
    console.log(`- Registros candidatos: ${alumnosStats.total}`);
    console.log(`- Con foto base64: ${alumnosStats.conBase64Foto}`);
    console.log(`- Con foto_cedula base64: ${alumnosStats.conBase64Cedula}`);
    console.log(`- Registros migrables: ${alumnosStats.migrables}`);
    console.log(`- Registros actualizados: ${alumnosStats.actualizados}`);
    console.log(`- Errores: ${alumnosStats.errores}`);

    console.log('\nResumen reposos:');
    console.log(`- Registros candidatos: ${repososStats.total}`);
    console.log(`- Con certificado base64: ${repososStats.conBase64Certificado}`);
    console.log(`- Registros migrables: ${repososStats.migrables}`);
    console.log(`- Registros actualizados: ${repososStats.actualizados}`);
    console.log(`- Errores: ${repososStats.errores}`);

    if (dryRun) {
      console.log('\nNo se escribieron archivos ni cambios en BD (modo simulacion).');
      console.log('Para aplicar cambios: node scripts/migrar_media_base64_a_archivos.js --apply');
    } else {
      console.log('\nMigracion aplicada. Se recomienda ejecutar backup y verificacion visual.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (err) => {
  console.error('Error en migracion:', err.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
