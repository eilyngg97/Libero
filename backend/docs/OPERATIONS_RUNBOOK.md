# Operations Runbook

Fecha: 2026-03-06
Alcance: backup/retencion, monitoreo y rollback backend.

## 1) Backup MongoDB y retencion

### Requisitos
- `mongodump` y `mongorestore` instalados en el host.
- Variables en entorno:
  - `MONGO_URI_CURRENT` o `MONGO_URI`
  - `BACKUP_DIR` (default `./backups`)
  - `BACKUP_RETENTION_DAYS` (default `14`)

### Backup manual
```bash
npm run backup:mongo
```

### Restore manual
- Restaura el ultimo backup disponible:
```bash
npm run restore:mongo
```

- Restaura desde ruta especifica:
```bash
node scripts/mongoRestore.js ./backups/mongo-YYYYMMDD-HHMMSS
```

### Politica recomendada
- Frecuencia: diario (minimo).
- Retencion: 14-30 dias segun capacidad.
- Verificacion: prueba de restore en staging al menos 1 vez por semana.

## 2) Monitoreo y logs

### Cobertura implementada
- Latencia por request:
  - warning automatico para requests lentos (`MONITOR_LATENCY_WARN_MS`, default 1500ms).
- Errores 5xx:
  - log estructurado con metodo, ruta, status y duracion.
- Error handler global:
  - captura errores no controlados y responde 500.
- Health endpoint:
  - `GET /health` con `status`, `uptime_seconds`, y memoria (`rss`, `heap_used`, `heap_total`).

### Alertas recomendadas
- Error rate 5xx > 1% por 5 min.
- p95 latencia > 1500ms por 10 min.
- RSS > 80% del limite de memoria del contenedor/host.

## 3) Checklist de rollback

### Precondiciones
- Tener release anterior identificada (tag/commit/imagen).
- Tener backup reciente y verificable.

### Procedimiento
1. Confirmar incidente y ventana de rollback.
2. Detener despliegues en curso.
3. Revertir backend a version anterior (imagen/tag previo).
4. Si hubo cambios de datos incompatibles, restaurar backup:
   - `npm run restore:mongo` o ruta especifica.
5. Validar endpoints criticos:
   - `/health`
   - login
   - lectura alumnos
   - pagos
6. Comunicar estado y abrir analisis post-mortem.

### Criterio de exito
- API estable, 5xx en niveles normales.
- Flujo critico funcional.
- Datos consistentes segun muestreo funcional.
