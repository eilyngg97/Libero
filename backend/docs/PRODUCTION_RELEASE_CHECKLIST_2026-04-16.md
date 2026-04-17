# Production Release Checklist

Fecha base: 2026-04-16
Alcance: salida a produccion de la version multi-tenant DB por academia ya validada en local/staging-prep.

## Referencias obligatorias
- Evidencia de ejecucion previa: backend/docs/STAGING_EXECUTION_REPORT_2026-04-16.md
- Runbook multi-tenant: backend/docs/MULTI_TENANT_DB_POR_ACADEMIA_RUNBOOK.md
- Runbook operativo: backend/docs/OPERATIONS_RUNBOOK.md
- Onboarding de tenants: backend/docs/PRODUCCION_ONBOARDING_TENANT_RUNBOOK.md

## Criterio de entrada
- Backend con cambios aprobados y tag/commit identificado.
- Frontend build confirmado para la version a desplegar.
- Backup y restore verificados para:
  - tenant principal gestion_deportiva
  - tenant B gestion_deportiva_pruebas
  - core libero_core
- QA multi-tenant A/B en verde.
- Ventana de despliegue aprobada.
- Responsable tecnico y responsable funcional disponibles.

## 1. Preparacion inmediata antes del release
1. Confirmar commit exacto a desplegar.
2. Confirmar variables de entorno productivas vigentes:
   - MULTI_TENANT_MODE
   - CORE_MONGO_URI_CURRENT
   - DEFAULT_TENANT_ID
   - DEFAULT_TENANT_DB_URI
   - REQUIRE_TENANT_IN_TOKEN
   - ALLOW_DEFAULT_TENANT_FALLBACK
   - CORS_ORIGINS
   - JWT_SECRET
3. Confirmar acceso a herramientas en host:
   - mongodump
   - mongorestore
   - pm2 o mecanismo de proceso equivalente
4. Ejecutar backup manual de produccion antes del despliegue.
5. Registrar nombre/ruta del backup generado.
6. Verificar endpoint de salud actual antes del cambio.

## 2. Despliegue backend
1. Publicar codigo backend en el host productivo.
2. Instalar dependencias si aplica.
3. Reiniciar proceso backend.
4. Validar carga limpia del proceso.
5. Validar que no aparezcan errores de arranque relacionados con tenant resolution, conexiones Mongo o rate limit.

## 3. Despliegue frontend
1. Generar build final del frontend correspondiente al release.
2. Publicar build en el host o bucket configurado.
3. Limpiar cache operativo si el entorno lo requiere.
4. Abrir la URL publica y validar carga inicial.

## 4. Smoke test post-release
1. GET /health responde status ok.
2. Login admin tenant principal: OK.
3. GET /api/tenant/context en host esperado: tenant correcto.
4. Listado de alumnos tenant principal: OK.
5. Consulta de mensualidades tenant principal: OK.
6. Registro de pago de prueba controlado o verificacion segura de flujo de pagos: OK.
7. Generacion de constancia: OK.
8. Validar que un token de tenant no opere contra host de otro tenant.
9. Validar acceso de archivos uploads bajo tenant correcto.

## 5. Validacion multi-tenant en produccion
1. Confirmar tenant principal resolviendo contra su DB dedicada.
2. Si tenant B esta habilitado en produccion, repetir:
   - login
   - contexto tenant
   - lectura de alumnos
   - lectura de mensualidades
3. Confirmar ausencia de mezcla de datos entre tenants en al menos dos endpoints criticos.
4. Revisar logs iniciales con tenantId presente.

## 6. Monitoreo de estabilizacion
1. Monitorear 30 minutos intensivos despues de liberar.
2. Revisar:
   - errores 5xx
   - latencia elevada
   - reinicios de proceso
   - errores de job por tenant
3. Monitorear nuevamente a las 2 horas.
4. Mantener observacion 24 a 48 horas segun el runbook multi-tenant.

## 7. Criterio de exito
- Health estable.
- Login y flujo critico operativos.
- Cero evidencia de lectura cruzada entre tenants.
- Sin errores de arranque ni warnings operativos nuevos relevantes.
- Logs tenant-aware funcionando.

## 8. Rollback
Ejecutar rollback inmediato si ocurre cualquiera de estos casos:
- fallo de login generalizado
- errores 5xx sostenidos
- tenant resuelto contra DB incorrecta
- evidencia de mezcla de datos entre tenants
- fallo critico en pagos o conciliacion

Secuencia de rollback:
1. Detener nuevos despliegues.
2. Restaurar backend a la version anterior.
3. Restaurar frontend anterior si aplica.
4. Restaurar backup de Mongo solo si hubo cambio de datos incompatible o inconsistencia confirmada.
5. Revalidar health, login, alumnos y pagos.

## 9. Cierre del release
1. Registrar hora de inicio y hora de cierre.
2. Registrar commit liberado.
3. Registrar responsable que ejecuto el release.
4. Registrar incidencias encontradas y mitigacion.
5. Adjuntar ruta del backup pre-release.
6. Marcar release como estable despues de la ventana de observacion.