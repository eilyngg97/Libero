# Revisión de seguridad del servidor APEX

Fecha de revisión: 1 de octubre de 2026 | Alcance: VPS de producción, transporte, acceso, aplicación, MongoDB, respaldos y continuidad.

## Controles verificados

- UFW activo con política de entrada denegada y exposición pública limitada a SSH, HTTP y HTTPS.
- MongoDB enlazado exclusivamente a `127.0.0.1:27017`.
- HTTPS operativo con TLS 1.2 y TLS 1.3.
- Certificados ECDSA vigentes con renovación automática de Certbot activa.
- Fail2ban activo; bloqueos SSH observados durante la revisión.
- Backend protegido por JWT, permisos por rol y validación obligatoria de `tenantId` en el token.
- Acceso web validado después de activar `REQUIRE_TENANT_IN_TOKEN=true`.
- Archivo `.env` restringido a permisos `600`.
- Directorios de respaldos restringidos a permisos `700` y archivos a `600`.
- Respaldo completo de 13 bases generado correctamente: 551 archivos y 9,6 MB.
- Respaldo completo diario programado mediante `systemd`, con retención de 14 días.
- Restauración de `libero_core` probada en una base temporal: 11 documentos originales y 11 restaurados.
- Logs de PM2 depurados y rotación diaria configurada, con 14 rotaciones y límite de 20 MB.
- Servicios Nginx, MongoDB, Fail2ban, UFW y PM2 validados después de reiniciar el VPS.
- Endpoint local y endpoint HTTPS público respondieron correctamente después del reinicio.

## Correcciones aplicadas

- Eliminación de TLS 1.0 y TLS 1.1.
- Restricción de permisos para secretos y respaldos.
- Activación de validación obligatoria de academia en los tokens.
- Eliminación del registro de URI de MongoDB en logs y limpieza del histórico.
- Implementación y prueba de respaldos completos multiacademia.
- Configuración de rotación y retención de logs.

## Pendientes prioritarios

El seguimiento operativo se mantiene en `PENDIENTES_SEGURIDAD_APEX.md`.

1. Configurar acceso SSH mediante llave, crear un usuario administrativo sin privilegios permanentes y después deshabilitar el acceso directo de `root` y la autenticación por contraseña.
2. Habilitar autenticación de MongoDB durante una ventana controlada y actualizar todas las URI de conexión.
3. Copiar respaldos cifrados fuera del VPS para cubrir pérdida total del servidor.
4. Ejecutar las actualizaciones pendientes del sistema operativo y validar nuevamente los servicios.
5. Ejecutar PM2 con un usuario de servicio dedicado en lugar de `root`.
6. Limitar el backend a `127.0.0.1:4000` además de la protección proporcionada por UFW.

## Conclusión

La plataforma dispone de controles de seguridad por capas y continuidad verificados en producción. No existe riesgo cero. Los pendientes anteriores deben gestionarse como mejoras de endurecimiento, especialmente la autenticación de MongoDB, el acceso SSH mediante llave y una copia externa cifrada de los respaldos.