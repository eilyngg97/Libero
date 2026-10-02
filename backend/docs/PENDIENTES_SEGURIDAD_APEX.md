# Pendientes de seguridad de APEX

Creado: 1 de octubre de 2026 | Origen: revisión del VPS de producción
Estado general: en seguimiento

Este documento contiene únicamente mejoras pendientes. Los controles ya comprobados están documentados en `REVISION_SEGURIDAD_SERVIDOR_APEX_2026-10-01.md`.

## Reglas de trabajo

- Realizar un pendiente por vez.
- Generar respaldo antes de modificar SSH, MongoDB, PM2 o la red.
- Mantener abierta una sesión administrativa durante cambios de acceso.
- Validar inicio de sesión web, `GET /health` y servicios después de cada cambio.
- Registrar fecha, resultado y evidencia al cerrar cada punto.

## Resumen

| Prioridad | Pendiente | Estado | Requiere ventana |
|---|---|---|---|
| Crítica | Configurar autenticación de MongoDB | Pendiente | Sí |
| Alta | Configurar llave SSH y retirar acceso inseguro | Pendiente | Sí |
| Alta | Mantener respaldo cifrado fuera del VPS | Pendiente | No |
| Media | Ejecutar PM2 con usuario dedicado | Pendiente | Sí |
| Media | Limitar backend a `127.0.0.1:4000` | Pendiente | Sí |
| Media | Aplicar actualizaciones del sistema | Pendiente | Sí |

## 1. Autenticación de MongoDB

**Riesgo actual:** MongoDB está limitado a `127.0.0.1`, pero no exige autenticación. Un proceso o usuario con acceso local podría consultar o modificar las bases.

**Plan:**

- [ ] Generar y verificar un respaldo completo reciente.
- [ ] Crear una cuenta administradora de MongoDB.
- [ ] Crear una cuenta de aplicación con privilegios mínimos necesarios.
- [ ] Actualizar las URI de la base core y de todas las academias.
- [ ] Activar `authorization: enabled` en MongoDB.
- [ ] Reiniciar MongoDB y el backend durante una ventana controlada.
- [ ] Validar las 13 bases, inicio de sesión y flujos críticos.
- [ ] Confirmar que no existen conexiones sin autenticar.

**Criterio de cierre:** MongoDB rechaza consultas anónimas y APEX funciona con una cuenta restringida.

**Estado:** Pendiente. No ejecutar sin preparar todas las URI y un procedimiento de reversión.

## 2. Endurecimiento de SSH

**Riesgo actual:** el acceso directo de `root` y la autenticación mediante contraseña continúan habilitados. Fail2ban reduce ataques repetidos, pero no reemplaza las llaves.

**Plan:**

- [ ] Generar una llave SSH Ed25519 en el equipo administrador.
- [ ] Crear un usuario administrativo nominal con acceso a `sudo`.
- [ ] Instalar y probar la llave en una segunda sesión SSH.
- [ ] Confirmar acceso con llave antes de cambiar la configuración.
- [ ] Establecer `PermitRootLogin no`.
- [ ] Establecer `PasswordAuthentication no`.
- [ ] Reducir `MaxAuthTries` y deshabilitar `X11Forwarding`.
- [ ] Validar la configuración con `sshd -t` antes de recargar SSH.

**Criterio de cierre:** acceso administrativo confirmado con llave y `sudo`; acceso directo de `root` y contraseñas rechazado.

**Estado:** Pendiente. Nunca cerrar la sesión activa antes de probar una segunda sesión.

## 3. Respaldo externo cifrado

**Riesgo actual:** los respaldos completos diarios están en el mismo VPS. No cubren pérdida total, cifrado malicioso o destrucción del servidor.

**Plan:**

- [ ] Seleccionar un destino externo con cifrado y control de acceso.
- [ ] Transferir automáticamente el respaldo diario más reciente.
- [ ] Definir retención externa de 30 días como mínimo.
- [ ] Registrar y alertar fallas de transferencia.
- [ ] Ejecutar una restauración desde la copia externa.
- [ ] Documentar quién puede acceder y cómo se recuperan las credenciales.

**Criterio de cierre:** existe una copia cifrada fuera del VPS y una restauración desde ese destino fue verificada.

**Estado:** Pendiente.

## 4. Usuario de servicio para PM2

**Riesgo actual:** el backend se ejecuta como `root`, aumentando el impacto de una vulnerabilidad en la aplicación.

**Plan:**

- [ ] Crear un usuario de sistema sin acceso interactivo innecesario.
- [ ] Asignar propiedad mínima sobre la aplicación, uploads y logs.
- [ ] Mantener `.env` y secretos accesibles solo para el usuario de servicio.
- [ ] Migrar el proceso y el servicio de arranque de PM2.
- [ ] Verificar escritura de uploads, logs y respaldos requeridos.
- [ ] Retirar el servicio `pm2-root` cuando el reemplazo esté validado.

**Criterio de cierre:** backend operativo después de reiniciar el VPS y proceso ejecutado por el usuario dedicado.

**Estado:** Pendiente. Coordinar con la limitación del puerto 4000.

## 5. Backend limitado a localhost

**Riesgo actual:** Node escucha en `0.0.0.0:4000`. UFW impide el acceso externo, pero es preferible que solo Nginx pueda conectarse localmente.

**Plan:**

- [ ] Ajustar `app.listen` o la variable de host para usar `127.0.0.1`.
- [ ] Reiniciar el backend.
- [ ] Confirmar escucha en `127.0.0.1:4000` con `ss`.
- [ ] Validar `/health` local y HTTPS público.
- [ ] Confirmar que el puerto 4000 no responde desde Internet.

**Criterio de cierre:** el backend escucha únicamente en `127.0.0.1:4000` y Nginx funciona normalmente.

**Estado:** Pendiente.

## 6. Actualizaciones del sistema

**Riesgo actual:** después del reinicio quedaron actualizaciones disponibles, incluidas actualizaciones de seguridad informadas por Ubuntu.

**Plan:**

- [ ] Generar respaldo completo antes de actualizar.
- [ ] Revisar la lista de paquetes y posibles cambios de versión mayor.
- [ ] Aplicar actualizaciones durante una ventana de mantenimiento.
- [ ] Reiniciar si el sistema lo solicita.
- [ ] Validar Nginx, MongoDB, Fail2ban, UFW, PM2 y temporizador de respaldo.
- [ ] Validar HTTPS, inicio de sesión y flujos críticos.

**Criterio de cierre:** no hay actualizaciones de seguridad pendientes y todos los servicios pasan la validación posterior.

**Estado:** Pendiente.

## Registro de avances

| Fecha | Pendiente | Acción | Resultado | Evidencia |
|---|---|---|---|---|
| | | | | |
