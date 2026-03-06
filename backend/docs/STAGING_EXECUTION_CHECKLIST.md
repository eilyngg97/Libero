# Staging Execution Checklist

Fecha: 2026-03-06
Objetivo: validar operacion real antes de salida a produccion.

## 1) Preflight
1. Configurar variables de entorno de staging.
2. Ejecutar:
```bash
npm run ops:preflight
```
3. Confirmar resultado sin errores.

## 2) Health y monitoreo base
1. Levantar backend en staging.
2. Verificar endpoint:
```bash
curl http://<staging-host>/health
```
3. Confirmar:
- `status: ok`
- `uptime_seconds > 0`
- memoria reportada (`rss`, `heap_used`, `heap_total`)

## 3) Backup y retencion
1. Ejecutar backup:
```bash
npm run backup:mongo
```
2. Validar carpeta en `BACKUP_DIR` con timestamp.
3. Confirmar retencion (elimina backups fuera de ventana).

## 4) Flujo critico funcional
1. Login.
2. Lectura de alumnos.
3. Registro de pago.
4. Generacion de constancia.

## 5) Simulacion de rollback
1. Seleccionar backup reciente.
2. Ejecutar restore en entorno controlado:
```bash
npm run restore:mongo
```
3. Revalidar flujo critico.

## 6) Criterio de pase
- Preflight OK.
- Health OK.
- Backup/retencion OK.
- Flujo funcional OK.
- Restore probado en staging OK.
