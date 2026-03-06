#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getMongoUri } = require('../config/secrets');

const backupDir = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');

function resolveBackupPath() {
  const input = process.argv[2];
  if (input) {
    return path.isAbsolute(input) ? input : path.join(process.cwd(), input);
  }

  if (!fs.existsSync(backupDir)) {
    throw new Error(`No existe directorio de backups: ${backupDir}`);
  }

  const dirs = fs.readdirSync(backupDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(backupDir, d.name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (dirs.length === 0) {
    throw new Error('No hay backups disponibles para restaurar');
  }

  return dirs[0];
}

function run() {
  const mongoUri = getMongoUri();
  const sourcePath = resolveBackupPath();

  console.log(`Restaurando backup desde: ${sourcePath}`);
  const cmd = 'mongorestore';
  const args = ['--uri', mongoUri, '--drop', sourcePath];

  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }

  console.log('Restore completado correctamente');
}

run();
