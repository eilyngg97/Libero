# Staging Execution Report

Fecha: 2026-04-16
Entorno: local/staging-prep

## Ejecutado
1. Backup real de la DB tenant principal gestion_deportiva.
2. Restore controlado de gestion_deportiva sobre gestion_deportiva_restore_validation.
3. Verificacion de conteos restaurados para tenant principal.
4. QA multi-tenant A/B completo.
5. Backup real de la DB tenant B gestion_deportiva_pruebas.
6. Restore controlado de gestion_deportiva_pruebas sobre gestion_deportiva_pruebas_restore_validation.
7. Verificacion de conteos restaurados para tenant B.
8. Backup real de la DB core libero_core.
9. Restore controlado de libero_core sobre libero_core_restore_validation.
10. Verificacion de conteos restaurados para core.
11. Ajuste de rate limiting en backend/app.js para usar generacion de clave IPv6-safe.
12. Nueva corrida de QA multi-tenant A/B post-parche.

## Resultado
- Backup y restore tenant principal: OK.
  - Conteos verificados: alumnos 203, mensualidads 801, pagodetalles 236, users 195, representantes 189, sedes 4.
- Backup y restore tenant B: OK.
  - Conteos verificados: alumnos 5, mensualidads 5, pagodetalles 6, users 6, representantes 5, sedes 1.
- Backup y restore core: OK.
  - Conteos verificados: tenants 2.
- QA multi-tenant A/B: OK.
  - Validaciones: CRUD tenant A, aislamiento A/B en sedes, alumnos, mensualidades, pagos, conciliacion, reportes y bloqueo de token/host mismatch.
- Rate limiter IPv6-safe: OK.
  - Cambio aplicado: uso de ipKeyGenerator en la clave tenant-aware del limiter.
  - Verificacion: carga limpia de backend/app.js y nueva corrida QA A/B en OK sin evidencia de ERR_ERL_KEY_GEN_IPV6 ni ValidationError asociados al limiter.

## Mejoras aplicadas en esta ejecucion
- backend/app.js ahora usa ipKeyGenerator de express-rate-limit para evitar bypass y warnings por IPv6 en el keyGenerator personalizado.

## Limpieza realizada
- Eliminadas DB temporales de validacion:
  - gestion_deportiva_restore_validation
  - gestion_deportiva_pruebas_restore_validation
  - libero_core_restore_validation
- Eliminados artefactos transitorios de backup y logs del arbol versionado.

## Estado
- Preparacion operativa multi-tenant por academia: lista.
- Evidencia de backup, restore y QA: completa.
- Recomendacion: GO para despliegue cuando se decida ventana de salida.