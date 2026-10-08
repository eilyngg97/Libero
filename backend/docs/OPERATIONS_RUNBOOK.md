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

## 4) Edicion segura de pagos agrupados

- Consulta y edicion admiten al rol `usuario` solo si el representante del grupo pertenece a su cuenta, dentro del tenant de la peticion. Otros roles requieren `mensualidades.manage`. La edicion exige un grupo `En revision`; un usuario puede consultar su grupo conciliado, pero no modificarlo.
- La propiedad se verifica antes de aceptar un comprobante y se revalida junto a todas las mensualidades dentro de la transaccion. Un grupo ajeno devuelve `403`, sin revelar el desglose ni guardar cambios.
- En `Mis pagos`, el detalle presenta el total realmente transferido en Bs y moneda configurada, la distribucion por atleta y el importe asignado al alumno actual. `Editar pago agrupado` abre el editor completo; las asignaciones agrupadas no ofrecen eliminacion individual. El retiro de recargos sigue reservado a `mensualidades.manage`.
- `GET /api/pagos/agrupado/:id` entrega cabecera, todas las asignaciones, `version` y `transacciones_disponibles`.
- `GET /api/pagos/agrupado/:id/tasa?fecha=YYYY-MM-DD` tiene la misma proteccion de propiedad/permisos. Entrega `tasa`, `fecha_pago`, `fecha_tasa` y `moneda` (USD/EUR segun configuracion del tenant). Usa el historico oficial de DolarAPI; si no hay publicacion ese dia, toma la ultima anterior, nunca una posterior. Sin tasa verificable devuelve `503`, sin inventar una tasa ni usar la actual como fallback.
- `PATCH /api/pagos/agrupado/:id` recibe los datos comunes, `monto_total`, `monto_total_bs`, la `version` consultada y `asignaciones` (JSON con `id_pago` y `monto_pagado`). El comprobante es opcional: JPG, PNG, WebP o PDF, maximo 10 MB.
- Cambiar Bs o fecha recalcula el equivalente por atleta y el total convertido; los equivalentes son de solo lectura. Mantiene la proporcion de las asignaciones originales, repartiendo centavos de forma determinista tanto en Bs como en moneda configurada. El servidor consulta y verifica la tasa, el total convertido y todas las proporciones; no acepta una tasa deducida de Bs/USD enviados por el cliente.
- No permite agregar/quitar atletas ni mensualidades. Cada asignacion convertida debe cubrir el saldo vigente. Un exceso respaldado por los Bs transferidos y la tasa oficial genera saldo propio de cada atleta; una reduccion falla si implica recuperar saldo que ya fue consumido. No se pueden inventar excedentes manipulando asignaciones o tasas. La suma de asignaciones y el reparto en Bs conservan todos los centavos.
- Conserva la precision de la tasa oficial en `tasa_aplicada` y en el calculo del importe esperado en Bs. El historial registra tasa, fecha de publicacion y moneda. Ejemplo: 50000 Bs a 873.867 Bs/USD equivalen a 57.22 USD; con reparto original igual, cada atleta recibe 28.61 USD. Si cada cuota es 19 USD, el excedente es 9.61 USD por atleta.
- Cabecera, detalles, mensualidades, saldos e historial `ediciones` se guardan en una unica transaccion. Un fallo revierte todos los cambios; una version desactualizada devuelve `409` y exige recargar el editor.
- Los comprobantes anteriores se conservan porque forman parte del historial. Si falla la edicion, se elimina el archivo nuevo y se conserva el anterior.

### Requisito de MongoDB

La edicion, el retiro de recargo agrupado y el rechazo del grupo no usan fallback sin transacciones: necesitan un replica set (incluso de un solo nodo) o un cluster sharded. En standalone devuelven `503`, sin modificar pagos. La confirmacion conserva su compatibilidad anterior con standalone; con replica set usa transacciones y detecta cambios concurrentes.

Antes de habilitar en un entorno:

1. Realizar un backup verificado y acordar la ventana de mantenimiento.
2. Configurar e inicializar el replica set segun la instalacion del servidor, conservando autenticacion y aislamiento de red. No exponer MongoDB publicamente.
3. Ajustar las URI de las bases de cada tenant con el replica set correspondiente y reiniciar el backend.
4. Comprobar que `db.adminCommand({ hello: 1 })` informa `setName` y que el GET del grupo devuelve `transacciones_disponibles: true`.
5. En staging, editar un grupo de prueba y verificar el total de la cabecera contra la suma de sus detalles, estados `En revision`, historial y conciliacion como una sola transferencia. Probar tambien una version desactualizada y un fallo de guardado.

La conversion de standalone a replica set no se realiza automaticamente desde la aplicacion.

### Retiro de recargos de todo el grupo

- `PATCH /api/pagos/agrupado/:id/retirar-recargos` requiere `mensualidades.manage`, `version` del grupo y `mensualidades`: todas las asignaciones del GET con `{ id_mensualidad, version }` (version tomada de `version_mensualidad`). Admite grupos `En revision` y `Conciliado`.
- Retira todos los recargos vigentes de las mensualidades vinculadas al grupo, no solo el de la atleta cuya ficha se abrio. Las mensualidades sin recargo permanecen intactas. La confirmacion enumera las atletas afectadas.
- Conserva el total transferido, su equivalente en Bs y los importes pagados de todas las atletas. El excedente incrementa el saldo a favor propio de cada atleta, sin duplicarlo.
- Actualiza todas las mensualidades afectadas, sus saldos, importes esperados de los detalles e historial del grupo en una transaccion obligatoria. Una version desactualizada de cualquier mensualidad, una lista parcial, un recargo invalido o un fallo de guardado revierte/bloquea todo el retiro.
- La respuesta incluye `mensualidades`, `mensualidades_actualizadas`, `atletas_actualizadas`, `recargo_retirado` y el total `saldo_a_favor_incrementado`. Si ya no hay recargos, devuelve `409` sin generar nuevos saldos ni historial.
- La ruta anterior `/agrupado/:id/mensualidades/:id_mensualidad/retirar-recargo` conserva la comprobacion de pertenencia de la mensualidad, pero tiene el mismo alcance grupal y exige las versiones de todas. No permite un retiro individual.
- El endpoint individual de mensualidades rechaza cambios de monto esperado cuando existe una asignacion agrupada. No debe utilizarse como alternativa al endpoint seguro.
- La edicion posterior del grupo permite conservar el excedente existente. Reducirlo solo es posible si el credito no fue consumido.
- Rechazar el grupo revierte tambien los saldos generados. Si un saldo ya fue utilizado, devuelve `409` y conserva el grupo, detalles y mensualidades completos.

## 5) Credito en mensualidades ya creadas

- `GET /api/mensualidades` calcula el credito disponible contra todas las deudas pagables de cada atleta, de la mas antigua a la mas reciente, incluso cuando se filtra un mes. No consume credito ni crea pagos al consultar. Devuelve `credito_a_aplicar`, `saldo_pendiente_antes_credito`, `saldo_pendiente` neto y `saldo_a_favor_disponible` vigente.
- Un excedente nuevo de septiembre reduce inmediatamente el importe cotizado de octubre aunque octubre ya existiera. Ejemplo: cuota de 19 USD y creditos de 1.03 / 1.02 USD producen restantes de 17.97 / 17.98 USD y una transferencia agrupada de 35.95 USD.
- El registro individual y agrupado consume el credito dentro de la misma transaccion que el pago y la mensualidad. El cliente confirma `credito_a_aplicar` por mensualidad; si cambio, el servidor devuelve `409` sin gastar saldo ni registrar dinero. Cuando hay credito no admite fallback standalone: requiere replica set y devuelve `503` si no hay transacciones.
- El credito reduce la deuda y se audita en `credito_aplicado` e historial de la mensualidad; no incrementa efectivo transferido ni genera un `PagoDetalle` ficticio. El saldo visible sigue disponible hasta confirmar su consumo.
- Si el credito cubre toda la cuota, `POST /api/pagos/credito` recibe `{ id_mensualidad, credito_a_aplicar }` y permite al propietario cubrirla sin transferencia. El pago agrupado solo selecciona cuotas con transferencia positiva; una cuota cubierta totalmente se resuelve desde su detalle.
- Crear una cuota futura no consume credito mientras exista una deuda pagable anterior. Consultar nuevamente o volver a enfocar Mis pagos obtiene los importes vigentes. Un saldo consumido no puede recuperarse reduciendo el excedente del pago origen.
- Prueba Mongo optativa: en PowerShell, establecer `$env:RUN_MONGO_CREDIT_TESTS = '1'` y ejecutar desde backend `npx jest --config '{\"testEnvironment\":\"node\"}' --runInBand --runTestsByPath tests/monthlyCredit.mongo.test.js`. Usa exclusivamente una base temporal `libero_qa_credit_*` en `127.0.0.1:27017` con replica set `rs0` y la elimina al terminar. Verifica efectivo, rollback al fallar la segunda cuota y solicitudes concurrentes. Desactivar despues con `Remove-Item Env:RUN_MONGO_CREDIT_TESTS`. No ejecutarla contra produccion.
