# Runbook Multi-Tenant DB por Academia

## Objetivo
Implementar multi-tenant con backend y frontend unicos, pero con una base de datos distinta por academia.

## Documento relacionado
- Alta de tenants en produccion: `backend/docs/PRODUCCION_ONBOARDING_TENANT_RUNBOOK.md`

## Alcance
- Un solo deploy de backend.
- Un solo deploy de frontend.
- Una DB core de control (tenants).
- Una DB de negocio por academia.

## Variables de entorno iniciales
- MULTI_TENANT_MODE=true|false
- CORE_MONGO_URI_CURRENT (o CORE_MONGO_URI)
- DEFAULT_TENANT_ID=villasport
- DEFAULT_TENANT_NAME=Villasport
- DEFAULT_TENANT_DOMAINS=localhost,villasport.tudominio.com
- DEFAULT_TENANT_DB_URI=<mongodb-uri-tenant-inicial>
- ALLOW_DEFAULT_TENANT_FALLBACK=true|false
- REQUIRE_TENANT_IN_TOKEN=true|false
- ENABLE_SUBDOMAIN_TENANT_LOOKUP=true|false

## Ejecucion inicial (tenant unico actual: villasport)
1. Configurar variables (backend/.env):
  - MULTI_TENANT_MODE=true
  - CORE_MONGO_URI_CURRENT=<uri-db-core>
  - DEFAULT_TENANT_ID=villasport
  - DEFAULT_TENANT_NAME=Villasport
  - DEFAULT_TENANT_DOMAINS=localhost,villasport.tudominio.com
  - DEFAULT_TENANT_DB_URI=<uri-db-villasport>
  - ALLOW_DEFAULT_TENANT_FALLBACK=true
2. Registrar tenant inicial:
  - npm run tenant:seed:core
3. Levantar backend:
  - npm run dev
4. Verificar resolver tenant:
  - GET /api/tenant/context
  - Debe responder tenantId=villasport
5. Probar login y revisar token:
  - El JWT debe incluir tenantId=villasport

## Comandos utiles de QA tenant
- Crear/actualizar tenant por CLI:
  - `node scripts/seedTenantCore.js --tenant-id villasport --tenant-name "Villasport" --domains villasport.localhost --db-uri <uri-db-villasport>`
  - `node scripts/seedTenantCore.js --tenant-id pruebas --tenant-name "Pruebas" --domains pruebas.localhost --db-uri <uri-db-pruebas>`
- Migrar media por tenant:
  - `node scripts/migrar_media_base64_a_archivos.js --dry-run --tenant-id tenant-a`
  - `node scripts/migrar_media_base64_a_archivos.js --apply --all-tenants`
- Ejecutar QA A/B completo:
  - `npm run qa:multi-tenant`
- Inicializar colecciones base y admin de QA en un tenant:
  - `npm run tenant:init-db -- --tenant-id pruebas --with-admin`

## Arquitectura objetivo
- Tenant resolver: identifica academia por host (subdominio o dominio).
- Tenant registry (DB core): guarda mapeo host -> tenant -> dbUri.
- Connection manager: abre/cacha conexiones por tenant.
- Model registry por conexion: evita modelos globales amarrados a una sola DB.
- Auth tenant-aware: valida que el tenant del token coincida con el tenant resuelto.
- Jobs tenant-aware: cron corre por tenant.
- Storage por tenant: rutas separadas por tenant.

## Fase 0 - Decisiones iniciales (bloqueante)
- [ ] Definir identificador de tenant (subdominio o dominio custom).
- [ ] Definir nombre canonico de tenantId.
- [ ] Definir politica de usuarios (globales o por tenant).
- [ ] Definir politica de backups por tenant.
- [ ] Definir limites de conexiones por tenant.

## Fase 1 - DB core y registro de tenants
- [x] Crear DB core (ejemplo: libero_core).
- [x] Crear coleccion tenants con campos minimos:
  - [x] tenantId
  - [x] nombre
  - [x] estado (active, suspended)
  - [x] domains[]
  - [x] dbUri
  - [x] createdAt, updatedAt
- [x] Crear seed de tenant inicial (academia actual).
- [x] Crear indice unico en domains y tenantId.

## Fase 2 - Resolucion de tenant por request
- [x] Crear middleware tenantResolver.
- [x] Leer host real desde cabeceras confiables (proxy aware).
- [x] Buscar tenant activo en DB core.
- [x] Guardar en request: req.tenantId, req.tenantConfig.
- [x] Rechazar request si no hay tenant valido.

## Fase 3 - Connection manager por tenant
- [x] Crear modulo de conexiones con cache en memoria.
- [x] Clave de cache: tenantId.
- [x] Reusar conexion existente si esta activa.
- [x] Abrir nueva conexion si no existe.
- [x] Configurar maximo de conexiones activas y eviction policy.
- [x] Agregar metricas basicas (hits, misses, open, close).

## Fase 4 - Modelos por conexion
- [x] Refactorizar carga de modelos para usar la conexion tenant.
- [x] Evitar mongoose.model global para entidades de negocio.
- [x] Exponer helper getTenantModels(req) o equivalente.
- [x] Validar que cada controlador use modelos tenant-scoped.

## Fase 5 - Auth y autorizacion tenant-aware
- [x] Incluir tenantId en JWT.
- [x] Al autenticar, validar tenant del usuario.
- [x] En cada request autenticada, validar tenant del token == tenant resuelto por host.
- [x] Rechazar mismatch con 403.

## Fase 6 - Jobs y procesos batch
- [x] Crear iterador de tenants activos desde DB core.
- [x] Ejecutar cada job por tenant (mensualidades, conciliacion, reportes).
- [x] Registrar logs por tenant para trazabilidad.
- [x] Definir limites de concurrencia para jobs.

## Fase 7 - Storage y archivos
- [x] Estructurar uploads por tenant (ejemplo: uploads/{tenantId}/...).
- [x] Ajustar lectura/descarga para respetar tenant activo.
- [x] Revisar migradores de media para tenant path.

## Fase 8 - Observabilidad y seguridad
- [x] Incluir tenantId en logs de backend.
- [x] Incluir tenantId en trazas de errores.
- [x] Agregar rate limit por tenant.
- [x] Dashboard de salud por tenant (errores, latencia, jobs).

## Fase 9 - QA multi-tenant
- [x] Crear dos tenants de prueba (A=villasport y B=pruebas).
- [x] Validar aislamiento total CRUD A vs B.
- [x] Validar endpoints criticos (alumnos, mensualidades, pagos, conciliacion).
- [x] Validar que reportes no mezclen data.
- [x] Validar mismatch token/host.

## Fase 10 - Despliegue
- [ ] Publicar DB core y seed tenant inicial.
- [ ] Activar tenantResolver + connection manager.
- [ ] Activar auth tenant-aware.
- [ ] Activar jobs tenant-aware.
- [ ] Monitorear 24-48h con logs por tenant.

## Checklist de salida
- [ ] Tenant inicial funcionando en su DB dedicada.
- [ ] Cero lectura cruzada entre tenants en pruebas.
- [ ] Jobs ejecutando por tenant sin errores.
- [ ] Backups por tenant probados con restore.
- [ ] Runbooks operativos actualizados.

## Riesgos y mitigacion
- Riesgo: fuga de datos por modelos globales.
  - Mitigacion: modelos por conexion + pruebas cruzadas obligatorias.
- Riesgo: explosion de conexiones.
  - Mitigacion: cache con limite + TTL + eviction.
- Riesgo: complejidad de operaciones.
  - Mitigacion: scripts estandar para onboarding, backup y restore.

## Notas para este proyecto
- Ya existe una sola academia productiva. Esto permite implementar el esquema final sin migracion historica de multiples academias.
- Recomendado: crear desde ya tenant inicial en DB separada y operar todo con patron tenant-aware.

## Progreso de implementacion actual
- [x] tenantResolver por host integrado en `/api`.
- [x] Tenant core model + servicio de resolucion host -> tenant.
- [x] Auth tenant-aware: JWT incluye `tenantId` y valida mismatch token/host.
- [x] Connection manager tenant-aware para DB de negocio.
- [x] Connection manager con metricas basicas de cache/conexiones (`hits`, `misses`, `open`, `close`, `errors`, `evictions`).
- [x] Modulo Sedes migrado a modelos tenant-scoped.
- [x] Modulo Representantes migrado a modelos tenant-scoped.
- [x] Ownership middleware migrado a modelos tenant-scoped.
- [x] Modulo Conteo de Alumnos por sede migrado a tenant-scoped.
- [x] Endpoints de lectura de Alumnos migrados (`getAlumnos`, `getAlumnoById`, `getAlumnosPorRepresentante`, `getDisponibilidadNumeroFranela`).
- [x] Endpoints de escritura simple de Alumnos migrados (`createAlumno`, `deleteAlumno`, `darDeBajaAlumno`, `reactivarAlumno`, `getRepososAlumno`).
- [x] Endpoints complejos de Alumnos migrados (`updateAlumno`, reposos con impacto en mensualidades).
- [x] Modulo Alumnos completado en tenant-scoped.
- [x] Modulo Pagos migrado a tenant-scoped.
- [x] Endpoints principales de Mensualidades migrados (`getMensualidades`, `confirmarMensualidad`).
- [x] Operaciones complejas de Mensualidades migradas (`registrarPrimeraMensualidad`, `generarMensualidadesMes`, `adelantarMensualidadSiguiente`, `actualizarRetrasados`, ajustes y resumenes agregados).
- [x] Modulo Conciliacion migrado a tenant-scoped.
- [x] Modulo Constancias migrado a tenant-scoped.
- [x] Modulo Cumpleaneros migrado a tenant-scoped.
- [x] Modulo Aspirantes migrado a tenant-scoped.
- [x] Modulo Uniformes migrado a tenant-scoped.
- [x] Modulo Pedidos de Uniforme migrado a tenant-scoped.
- [x] Modulo Usuarios migrado a tenant-scoped.
- [x] Modulo Landing Config migrado a tenant-scoped.
- [x] Cron principal de Mensualidades adaptado para ejecutarse tenant por tenant desde DB core.
- [x] Job tenant-aware de conciliacion/reportes (catch-up + cron diario) integrado en `server.js`.
- [x] Limite de concurrencia de jobs por tenant configurable (`TENANT_JOBS_CONCURRENCY`).
- [x] Controladores actuales del backend migrados a tenant-scoped.
- [x] Uploads tenant-aware en Uniformes/Pedidos y Landing (`uploads/{tenantId}/...`).
- [x] Descarga de archivos protegida por tenant activo en `/uploads` (host -> tenant, bloqueo cross-tenant y compatibilidad legacy del tenant por defecto).
- [x] Migrador `migrar_media_base64_a_archivos.js` actualizado a tenant-aware (`--tenant-id` y `--all-tenants`) con rutas `uploads/{tenantId}/...`.
- [x] Logs y errores backend con tenantId.
- [x] Rate limit tenant-aware (`tenantId + IP`) en auth y escrituras.
- [x] Dashboard de salud tenant-aware en `/api/tenant/health` (admin) con metricas de requests y jobs por tenant.
- [x] Script `seedTenantCore.js` extendido para crear tenants de QA por CLI (`--tenant-id`, `--tenant-name`, `--domains`, `--db-uri`, `--estado`).
- [x] Script `initTenantDb.js` para materializar colecciones de negocio por tenant y crear admin de QA opcional.
- [x] Definicion de tenants QA: A=`villasport`, B=`pruebas`.
- [x] Tenants QA creados en DB core: `villasport` -> `mongodb://localhost:27017/gestion_deportiva`, `pruebas` -> `mongodb://localhost:27017/gestion_deportiva_pruebas`.
- [x] Bateria QA A/B ejecutada con exito (`scripts/qa_multi_tenant_ab.js`): CRUD aislado, endpoints criticos, reportes sin mezcla y mismatch token/host.
- [x] Completar reportes complementarios avanzados en modo tenant-aware (KPIs adicionales y alertas).

## KPIs y alertas avanzadas (tenant health)
- Endpoint: `GET /api/tenant/health` (admin).
- Incluye por tenant:
  - `kpis.request4xxRatePct`
  - `kpis.request5xxRatePct`
  - `kpis.requestSlowRatePct`
  - `kpis.requestAvgLatencyMs`
  - `kpis.jobFailureRatePct`
  - `healthScore` (0-100)
  - `alerts[]` (warning/critical)
- Umbrales configurables por entorno:
  - `HEALTH_ALERT_5XX_WARN_PCT`
  - `HEALTH_ALERT_5XX_CRITICAL_PCT`
  - `HEALTH_ALERT_SLOW_WARN_PCT`
  - `HEALTH_ALERT_SLOW_CRITICAL_PCT`
  - `HEALTH_ALERT_AVG_LAT_WARN_MS`
  - `HEALTH_ALERT_AVG_LAT_CRITICAL_MS`
  - `HEALTH_ALERT_JOB_FAIL_WARN_PCT`
  - `HEALTH_ALERT_JOB_FAIL_CRITICAL_PCT`
