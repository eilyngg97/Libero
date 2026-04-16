// Migra campos base64 (data URI) a archivos en disco local y guarda URL en MongoDB.
// Uso:
//   node scripts/migrar_media_base64_a_archivos.js --dry-run
//   node scripts/migrar_media_base64_a_archivos.js --apply
//   node scripts/migrar_media_base64_a_archivos.js --dry-run --tenant-id villasport
//   node scripts/migrar_media_base64_a_archivos.js --apply --all-tenants

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getTenantBusinessConnection, getBusinessDbUriFromTenant } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { listActiveTenants } = require('../services/tenantResolverService');
const { getMongoUri } = require('../config/secrets');
require('dotenv').config();

const args = process.argv.slice(2);
const applyChanges = args.includes('--apply');
const dryRun = !applyChanges;
const allTenants = args.includes('--all-tenants');

function getArgValue(flag) {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) return null;
  return String(value).trim();
}

const tenantIdArg = getArgValue('--tenant-id');
const targetTenantId = tenantIdArg
  ? tenantIdArg.toLowerCase()
  : String(process.env.DEFAULT_TENANT_ID || 'villasport').trim().toLowerCase();

function resolveTenantUploadDirs(tenantId) {
  return {
    alumnosUploadDir: path.join(__dirname, '..', 'uploads', tenantId, 'alumnos'),
    repososUploadDir: path.join(__dirname, '..', 'uploads', tenantId, 'reposos')
  };
}

function ensureDirs(tenantId) {
  const { alumnosUploadDir, repososUploadDir } = resolveTenantUploadDirs(tenantId);
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

async function migrarAlumnos({ AlumnoModel, tenantId }) {
  const { alumnosUploadDir } = resolveTenantUploadDirs(tenantId);
  const stats = {
    total: 0,
    conBase64Foto: 0,
    conBase64Cedula: 0,
    migrables: 0,
    actualizados: 0,
    errores: 0
  };

  const alumnos = await AlumnoModel.find({
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
          update.foto = `/uploads/${tenantId}/alumnos/${filename}`;
        }
      }

      if (parseDataUri(alumno.foto_cedula)) {
        stats.conBase64Cedula += 1;
        if (applyChanges) {
          const filename = writeBase64ToFile(alumno.foto_cedula, alumnosUploadDir, 'cedula', alumno._id);
          update.foto_cedula = `/uploads/${tenantId}/alumnos/${filename}`;
        }
      }

      const tieneCamposBase64 = parseDataUri(alumno.foto) || parseDataUri(alumno.foto_cedula);
      if (tieneCamposBase64) {
        stats.migrables += 1;
      }

      if (Object.keys(update).length > 0) {
        if (applyChanges) {
          await AlumnoModel.updateOne({ _id: alumno._id }, { $set: update });
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

async function migrarReposos({ ReposoModel, tenantId }) {
  const { repososUploadDir } = resolveTenantUploadDirs(tenantId);
  const stats = {
    total: 0,
    conBase64Certificado: 0,
    migrables: 0,
    actualizados: 0,
    errores: 0
  };

  const reposos = await ReposoModel.find({ certificado: /^data:/ }).select('_id certificado');
  stats.total = reposos.length;

  for (const reposo of reposos) {
    try {
      if (!parseDataUri(reposo.certificado)) continue;

      stats.conBase64Certificado += 1;
      stats.migrables += 1;

      if (applyChanges) {
        const filename = writeBase64ToFile(reposo.certificado, repososUploadDir, 'certificado', reposo._id);
        await ReposoModel.updateOne(
          { _id: reposo._id },
          { $set: { certificado: `/uploads/${tenantId}/reposos/${filename}` } }
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

async function resolveTargetTenants() {
  if (allTenants) {
    const tenants = await listActiveTenants();
    if (tenants.length === 0) {
      throw new Error('No hay tenants activos para procesar.');
    }
    return tenants;
  }

  if (tenantIdArg) {
    const tenants = await listActiveTenants();
    const byId = tenants.find((tenant) => String(tenant.tenantId).toLowerCase() === targetTenantId);
    if (byId) return [byId];
  }

  return [
    {
      tenantId: targetTenantId,
      dbUri: process.env.DEFAULT_TENANT_DB_URI || getMongoUri()
    }
  ];
}

async function procesarTenant(tenant) {
  const tenantConfig = {
    tenantId: String(tenant.tenantId || targetTenantId).trim().toLowerCase(),
    dbUri: tenant.dbUri || getBusinessDbUriFromTenant(tenant)
  };

  if (!dryRun) {
    ensureDirs(tenantConfig.tenantId);
  }

  const connection = await getTenantBusinessConnection(tenantConfig);
  const AlumnoModel = getTenantModel(connection, 'Alumno');
  const ReposoModel = getTenantModel(connection, 'Reposo');

  const alumnosStats = await migrarAlumnos({ AlumnoModel, tenantId: tenantConfig.tenantId });
  const repososStats = await migrarReposos({ ReposoModel, tenantId: tenantConfig.tenantId });

  return {
    tenantId: tenantConfig.tenantId,
    alumnosStats,
    repososStats
  };
}

async function main() {
  const mode = dryRun ? 'DRY-RUN' : 'APPLY';
  console.log(`\n[${mode}] Migracion de media base64 -> archivos locales por tenant\n`);

  const targetTenants = await resolveTargetTenants();
  const resultados = [];

  for (const tenant of targetTenants) {
    console.log(`\nProcesando tenant: ${tenant.tenantId}`);
    const resultado = await procesarTenant(tenant);
    resultados.push(resultado);

    console.log('\nResumen alumnos:');
    console.log(`- Registros candidatos: ${resultado.alumnosStats.total}`);
    console.log(`- Con foto base64: ${resultado.alumnosStats.conBase64Foto}`);
    console.log(`- Con foto_cedula base64: ${resultado.alumnosStats.conBase64Cedula}`);
    console.log(`- Registros migrables: ${resultado.alumnosStats.migrables}`);
    console.log(`- Registros actualizados: ${resultado.alumnosStats.actualizados}`);
    console.log(`- Errores: ${resultado.alumnosStats.errores}`);

    console.log('\nResumen reposos:');
    console.log(`- Registros candidatos: ${resultado.repososStats.total}`);
    console.log(`- Con certificado base64: ${resultado.repososStats.conBase64Certificado}`);
    console.log(`- Registros migrables: ${resultado.repososStats.migrables}`);
    console.log(`- Registros actualizados: ${resultado.repososStats.actualizados}`);
    console.log(`- Errores: ${resultado.repososStats.errores}`);
  }

  if (dryRun) {
    console.log('\nNo se escribieron archivos ni cambios en BD (modo simulacion).');
    console.log('Para aplicar cambios: node scripts/migrar_media_base64_a_archivos.js --apply [--tenant-id villasport|--all-tenants]');
  } else {
    console.log('\nMigracion aplicada. Se recomienda ejecutar backup y verificacion visual.');
  }
}

main().catch((err) => {
  console.error('Error en migracion:', err.message);
  process.exit(1);
});
