# Secret Rotation Runbook (JWT_SECRET, MONGO_URI)

Fecha: 2026-03-06
Alcance: backend Node/Express

## Objetivo
Permitir rotacion segura de secretos sin downtime y con rollback controlado.

## Variables soportadas
- `JWT_SECRET_CURRENT`: secreto activo para firmar nuevos tokens.
- `JWT_SECRET_PREVIOUS`: secreto previo para validar tokens emitidos antes de la rotacion.
- `JWT_SECRET`: fallback legacy (si no se define `JWT_SECRET_CURRENT`).
- `MONGO_URI_CURRENT`: URI activa para conexion Mongo.
- `MONGO_URI`: fallback legacy (si no se define `MONGO_URI_CURRENT`).
- `MONGO_URI_PREVIOUS`: referencia operativa para rollback (no usada por la app en runtime).

## Comportamiento implementado
- Firma JWT: siempre con `JWT_SECRET_CURRENT` (o `JWT_SECRET` si no existe current).
- Verificacion JWT: intenta en este orden:
  1. `JWT_SECRET_CURRENT`
  2. `JWT_SECRET`
  3. `JWT_SECRET_PREVIOUS`
- Conexion Mongo: usa `MONGO_URI_CURRENT` (o `MONGO_URI` si no existe current).

## Rotacion de JWT sin downtime
1. Generar nuevo secreto fuerte (minimo 32 bytes aleatorios).
2. Configurar en entorno:
   - `JWT_SECRET_PREVIOUS=<secreto_actual>`
   - `JWT_SECRET_CURRENT=<secreto_nuevo>`
3. Desplegar backend.
4. Validar:
   - Login nuevo emite token valido.
   - Tokens previos siguen siendo aceptados.
5. Esperar al menos `expiresIn` maximo de tokens (actual: 8h) + margen operativo.
6. Retirar `JWT_SECRET_PREVIOUS` en siguiente despliegue.

## Rotacion de MONGO_URI
Nota: cambiar de URI normalmente requiere reconnect/redeploy. No hay dual-read en runtime.

1. Preparar nueva instancia/cluster y sincronizacion de datos.
2. Definir:
   - `MONGO_URI_PREVIOUS=<uri_actual>`
   - `MONGO_URI_CURRENT=<uri_nueva>`
3. Desplegar backend.
4. Verificar health checks, logs y operaciones criticas.
5. Si todo esta OK, mantener `MONGO_URI_PREVIOUS` solo como referencia temporal.
6. En ventana posterior, remover `MONGO_URI_PREVIOUS`.

## Plan de rollback
- JWT:
  - Volver `JWT_SECRET_CURRENT` al valor previo.
  - Mantener `JWT_SECRET_PREVIOUS` con el valor nuevo temporalmente si ya se emitieron tokens con el nuevo secreto.
- Mongo:
  - Restituir `MONGO_URI_CURRENT` al valor de `MONGO_URI_PREVIOUS`.
  - Desplegar nuevamente.

## Checklist operativo rapido
- [ ] Secretos almacenados en gestor seguro (no en repo).
- [ ] Rotacion ejecutada en ventana controlada.
- [ ] Verificacion post-deploy completada.
- [ ] Rollback probado en entorno de staging.
- [ ] Limpieza de secretos previos completada.
