#!/usr/bin/env node
const { spawnSync } = require('child_process');
const { getMongoUri, getJwtSigningSecret, getJwtVerificationSecrets } = require('../config/secrets');

function checkCommand(bin) {
  const result = spawnSync(bin, ['--version'], { shell: true, stdio: 'pipe' });
  return result.status === 0;
}

function maskUri(uri) {
  if (!uri) return '';
  return uri.replace(/:\/\/([^@]+)@/, '://***:***@');
}

function main() {
  const issues = [];

  try {
    const jwtSigning = getJwtSigningSecret();
    const jwtVerifying = getJwtVerificationSecrets();
    console.log(`[OK] JWT signing secret loaded (len=${jwtSigning.length})`);
    console.log(`[OK] JWT verification secrets loaded (count=${jwtVerifying.length})`);
  } catch (err) {
    issues.push(`[FAIL] JWT config: ${err.message}`);
  }

  try {
    const mongoUri = getMongoUri();
    console.log(`[OK] Mongo URI loaded: ${maskUri(mongoUri)}`);
  } catch (err) {
    issues.push(`[FAIL] Mongo config: ${err.message}`);
  }

  if (checkCommand('mongodump')) {
    console.log('[OK] mongodump disponible');
  } else {
    issues.push('[FAIL] mongodump no esta disponible en PATH');
  }

  if (checkCommand('mongorestore')) {
    console.log('[OK] mongorestore disponible');
  } else {
    issues.push('[FAIL] mongorestore no esta disponible en PATH');
  }

  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 14);
  if (!Number.isFinite(retentionDays) || retentionDays < 1) {
    issues.push('[FAIL] BACKUP_RETENTION_DAYS invalido (debe ser >= 1)');
  } else {
    console.log(`[OK] BACKUP_RETENTION_DAYS=${retentionDays}`);
  }

  if (issues.length > 0) {
    console.error('\nPreflight con errores:');
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log('\nPreflight operativo completado correctamente');
}

main();
