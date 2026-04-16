# Checklist Multi-Academia (Academia != Sede)

## Nota de enfoque
- Este checklist esta orientado al enfoque de una sola DB compartida con campo academia en modelos.
- Si se adopta enfoque de DB separada por academia, usar como guia principal: `backend/docs/MULTI_TENANT_DB_POR_ACADEMIA_RUNBOOK.md`.

## Contexto clave
- Academia = tenant (aislamiento de datos y permisos).
- Sede = sucursal interna de una academia.
- Una academia puede tener 1 o mas sedes.
- Ningun usuario debe ver, modificar ni exportar data de otra academia (salvo superadmin global, si se define).

## Fase 1: Base del dominio (Academia como tenant)
- [ ] Crear modelo `Academia` y seed inicial.
- [ ] Agregar `academia` obligatorio en `backend/models/Sede.js`.
- [ ] Agregar `academia` obligatorio en `backend/models/User.js`.
- [ ] Agregar `academia` obligatorio en `backend/models/Alumno.js`.
- [ ] Agregar `academia` obligatorio en `backend/models/Representante.js`.
- [ ] Agregar `academia` obligatorio en `backend/models/Mensualidad.js`.
- [ ] Agregar `academia` obligatorio en `backend/models/PagoDetalle.js`.
- [ ] Agregar `academia` obligatorio en `backend/models/UniformePedido.js`.
- [ ] Revisar y agregar `academia` en modelos restantes de negocio (`Aspirante`, `Uniforme`, `LandingAtletaFoto`, `Torneo`, `Partido`, `Reposo`, `Entrenador`).
- [ ] Definir indices compuestos por `academia` en colecciones criticas (consulta y unicidad).

## Fase 2: Auth y contexto de academia
- [ ] Incluir `academia` en JWT desde `backend/controllers/authController.js`.
- [ ] Leer `academia` del JWT en `backend/middleware/auth.js`.
- [ ] Crear/extender middleware para tener `req.academiaId` en toda request autenticada.
- [ ] Bloquear requests autenticadas sin `academiaId` valido.
- [ ] Mantener reglas por rol, pero siempre dentro de academia.

## Fase 3: Ownership + anti-fugas
- [ ] Extender `backend/middleware/ownership.js` para validar academia ademas de propiedad.
- [ ] Bloquear cruces entre academias (ejemplo: alumno academia A con sede academia B).
- [ ] Unificar respuesta de fuga (403 o 404) de forma consistente.

## Fase 4: Controladores backend (scoping obligatorio)
- [ ] Aplicar filtro por `academia` en `backend/controllers/alumnoController.js`.
- [ ] Aplicar filtro por `academia` en `backend/controllers/representanteController.js`.
- [ ] Aplicar filtro por `academia` en `backend/controllers/mensualidadController.js`.
- [ ] Aplicar filtro por `academia` en `backend/controllers/pagoDetalleController.js`.
- [ ] Aplicar filtro por `academia` en `backend/controllers/uniformeController.js`.
- [ ] Aplicar filtro por `academia` en `backend/controllers/uniformePedidoController.js`.
- [ ] Aplicar filtro por `academia` en `backend/controllers/sedeController.js`.
- [ ] Aplicar filtro por `academia` en `backend/controllers/aspiranteController.js`.
- [ ] Aplicar filtro por `academia` en `backend/controllers/conciliacionController.js`.
- [ ] Aplicar filtro por `academia` en `backend/controllers/cumpleanerosController.js`.
- [ ] Aplicar filtro por `academia` en `backend/controllers/constanciaController.js`.
- [ ] Aplicar filtro por `academia` en `backend/controllers/landingConfigController.js`.
- [ ] Aplicar filtro por `academia` en `backend/controllers/torneoController.js`.
- [ ] Aplicar filtro por `academia` en `backend/controllers/usuarioController.js`.
- [ ] Revisar `backend/controllers/alumnoCountController.js` para contar solo sedes de la academia activa.

## Fase 5: Rutas y middleware por endpoint
- [ ] Revisar `backend/routes/alumnos.js`.
- [ ] Revisar `backend/routes/representantes.js`.
- [ ] Revisar `backend/routes/mensualidades.js`.
- [ ] Revisar `backend/routes/pagos.js`.
- [ ] Revisar `backend/routes/sedes.js`.
- [ ] Revisar `backend/routes/uniformes.js`.
- [ ] Revisar `backend/routes/aspirantes.js`.
- [ ] Revisar `backend/routes/conciliacion.js`.
- [ ] Revisar `backend/routes/constancias.js`.
- [ ] Revisar `backend/routes/cumpleaneros.js`.
- [ ] Revisar `backend/routes/landing.js`.
- [ ] Revisar `backend/routes/torneos.js`.
- [ ] Revisar `backend/routes/usuarios.js`.
- [ ] Mantener `backend/routes/auth.js` como punto de emision del contexto de academia.

## Fase 6: Migracion de data existente
- [ ] Crear academia inicial (ejemplo: Libero).
- [ ] Migrar `sedes -> academia` primero.
- [ ] Migrar `users -> academia`.
- [ ] Migrar `alumnos` y `representantes` por relacion principal.
- [ ] Migrar `mensualidades` y `pagos` heredando academia por cadena relacional.
- [ ] Migrar `uniformes`, `pedidos`, `aspirantes`, `landing` segun relaciones disponibles.
- [ ] Resolver huerfanos y cruces invalidos en script de auditoria.
- [ ] Guardar reporte de migracion en `backend/docs`.

## Fase 7: Frontend (aislamiento visual y de requests)
- [ ] Guardar contexto de academia al login (contexto global frontend).
- [ ] Mostrar solo sedes de la academia activa.
- [ ] Asegurar que tablas/reportes no mezclen academias.
- [ ] Bloquear navegacion/acciones con IDs cruzados de otra academia.
- [ ] Revisar especialmente: `Alumnos`, `Representantes`, `Mensualidades`, `PagosAlumno`, `ConciliacionBancaria`, `SolicitudUniforme`.

## Fase 8: QA y pruebas anti-fuga
- [ ] Extender pruebas en `backend/tests/smoke.test.js` para academia A vs academia B.
- [ ] Probar lectura, edicion y eliminacion cruzada en endpoints sensibles.
- [ ] Probar reportes y conciliacion con data de 2 academias.
- [ ] Probar roles admin y usuario final con datasets separados.

## Fase 9: Despliegue sin downtime
- [ ] Release 1: agregar campos `academia` nullable + escritura dual.
- [ ] Correr migracion y auditoria.
- [ ] Release 2: activar filtros por academia en lectura/escritura.
- [ ] Release 3: hacer `academia` required + indices finales.
- [ ] Monitorear logs de 403/404 por intentos cruzados.

## Criterios de salida
- [ ] Cero documentos de negocio sin `academia`.
- [ ] Cero endpoints con fuga entre academias.
- [ ] Relacion `sede -> academia` consistente al 100%.
- [ ] Pruebas de aislamiento en verde.
