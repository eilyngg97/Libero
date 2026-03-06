# Release Checklist V1

Estado general: Completo (pendiente ejecucion operativa de migracion Vite)
Fecha: 2026-03-06

## 1) Seguridad de API y control de acceso
- [x] Proteger rutas criticas con `authMiddleware`.
- [x] Restringir operaciones administrativas con `rolMiddleware('admin')`.
- [x] Proteger lecturas sensibles de pagos/representantes.
- [x] Validar ownership por recurso (usuario solo puede consultar/modificar su propio alumno).

## 2) Seguridad de infraestructura
- [x] Restringir CORS por variable `CORS_ORIGINS`.
- [x] Agregar rate limiting para `/api/auth/login` y endpoints de escritura.
- [x] Definir rotacion/gestion segura de `JWT_SECRET` y `MONGO_URI` en entorno productivo.

## 3) Calidad y pruebas
- [x] Corregir suite de tests frontend (polyfill `TextEncoder/TextDecoder`).
- [x] Actualizar test base (`App.test.js`) al flujo real.
- [x] Verificar `npm test` en CI mode.
- [x] Verificar `npm run build`.
- [x] Agregar smoke tests backend (login, lectura de alumnos, registro pago, generar constancia).

## 4) Dependencias y vulnerabilidades
- [x] Eliminar dependencia directa vulnerable `xlsx` en frontend.
- [x] Migrar exportaciones a CSV (`Dashboard`, `Mensualidades`, `TablaAlumnos`).
- [x] Ejecutar `npm audit fix` en frontend.
- [x] Reducir alertas restantes asociadas a `react-scripts` legado (plan de migracion: Vite o CRA modernizado).

## 5) Operacion y despliegue
- [x] Definir variables de entorno de produccion (`backend/.env` no debe versionarse).
- [x] Configurar backup de MongoDB y retencion.
- [x] Configurar monitoreo/logs (errores 5xx, latencia, uso de memoria).
- [x] Checklist de rollback (version anterior + DB backup).

## Resultado actual
- Bloqueadores iniciales de seguridad: ownership por recurso implementado.
- Build y tests frontend: OK.
- Smoke tests backend: OK (`login`, `alumnos`, `pagos`, `constancias`).
- Runbook de secretos: `backend/docs/SECRET_ROTATION_RUNBOOK.md`.
- Runbook operativo: `backend/docs/OPERATIONS_RUNBOOK.md`.
- Plan de migracion frontend: `my-react-app/MIGRATION_PLAN_VITE.md`.
- Riesgo principal pendiente: ejecutar la migracion a Vite y validarla en staging.

## Criterio de salida a produccion
Se recomienda salida cuando todos los items esten en `[x]`, en especial:
1. Ownership por recurso implementado.
2. Rate limiting en login y escrituras.
3. Plan claro para vulnerabilidades restantes del toolchain.
