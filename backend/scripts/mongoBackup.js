#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getMongoUri } = require('../config/secrets');

const backupDir = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 14);

function timestamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanupOldBackups(dir, days) {
  const cutoffMs = Date.now() - (days * 24 * 60 * 60 * 1000);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(dir, entry.name);
    const stat = fs.statSync(fullPath);
    if (stat.mtimeMs < cutoffMs) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`Backup eliminado por retencion: ${fullPath}`);
    }
  }
}

function run() {
  const mongoUri = getMongoUri();
  ensureDir(backupDir);
  const outDir = path.join(backupDir, `mongo-${timestamp()}`);

  const cmd = 'mongodump';
  const args = ['--uri', mongoUri, '--out', outDir];

  console.log(`Ejecutando backup en: ${outDir}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }

  if (!fs.existsSync(outDir)) {
    console.error('Backup fallido: mongodump no genero directorio de salida');
    process.exit(1);
  }

  const generatedEntries = fs.readdirSync(outDir);
  if (generatedEntries.length === 0) {
    console.error('Backup fallido: directorio de salida vacio, sin artefactos de dump');
    process.exit(1);
  }

  cleanupOldBackups(backupDir, retentionDays);
  console.log('Backup completado correctamente');
}

run();
