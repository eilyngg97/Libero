# Runbook Produccion - Alta de Nuevo Tenant

Fecha: 2026-04-14
Objetivo: dar de alta una nueva academia en produccion usando el esquema multi-tenant actual.

## Contexto actual
- Dominio principal: `libero.com.ve`
- Infraestructura actual: 1 VPS Ubuntu
- Frontend: un solo deploy
- Backend: un solo deploy
- Proxy: Nginx
- Proceso backend: PM2
- SSL: Certbot
- DNS: Cloudflare
- Puerto backend actual: `4000`
- Patrón tenant: 1 DB Mongo de negocio por academia + 1 DB core de tenants

## Resultado esperado
Al finalizar, el nuevo tenant debe quedar operativo en un host tipo `tenant-x.libero.com.ve`, con:
- DB dedicada
- registro en DB core
- acceso HTTPS funcional
- login funcional
- aislamiento de datos respecto a otros tenants

## Convencion recomendada
- Host tenant: `tenantid.libero.com.ve`
- `tenantId`: corto, sin espacios, en minusculas
- Ejemplo:
  - `villasport.libero.com.ve`
  - `pruebas.libero.com.ve`
  - `academia-centro.libero.com.ve`

## Requisitos previos
Antes de empezar, confirma:
- acceso SSH a la VPS
- acceso a Cloudflare para `libero.com.ve`
- acceso a MongoDB del entorno productivo
- acceso a variables de entorno del backend
- acceso a PM2 y Nginx en la VPS
- backup reciente validado

## Paso 1 - Definir datos del tenant
Reunir estos datos antes de tocar produccion:
- `tenantId`
- nombre comercial
- host publico
- URI MongoDB dedicada del tenant
- email inicial del admin
- contraseña temporal inicial

Ejemplo:
- `tenantId=academia-centro`
- `tenantName=Academia Centro`
- `host=academia-centro.libero.com.ve`
- `dbUri=mongodb://127.0.0.1:27017/libero_academia_centro`

## Paso 2 - Crear la DB dedicada
Crear una DB nueva para la academia.

Ejemplo de nombre recomendado:
- `libero_academia_centro`

Notas:
- no reutilizar la DB de otro tenant
- no compartir colecciones entre tenants
- definir política de backup igual que el resto de tenants

## Paso 3 - Registrar el tenant en DB core
Desde la VPS, en la carpeta `backend`:

```bash
cd /ruta/a/libero/backend
node scripts/seedTenantCore.js \
  --tenant-id academia-centro \
  --tenant-name "Academia Centro" \
  --domains academia-centro.libero.com.ve \
  --db-uri mongodb://127.0.0.1:27017/libero_academia_centro \
  --estado active
```

Resultado esperado:
- el tenant queda creado o actualizado en la DB core
- `domains[]` contiene el host exacto de produccion

## Paso 4 - Inicializar la DB del tenant
Materializar las colecciones y crear admin inicial:

```bash
cd /ruta/a/libero/backend
npm run tenant:init-db -- \
  --tenant-id academia-centro \
  --with-admin \
  --admin-email admin@academia-centro.local \
  --admin-password "CAMBIAR-ESTA-CLAVE" \
  --admin-name "Admin Academia Centro"
```

Resultado esperado:
- se crean las colecciones base del tenant
- se crea usuario admin inicial

## Paso 5 - Crear el subdominio en Cloudflare
En Cloudflare, crear el registro DNS del tenant.

Opciones comunes:
- `A` -> `academia-centro.libero.com.ve` apuntando a la IP de la VPS
- `CNAME` -> `academia-centro` apuntando a `libero.com.ve` si tu configuración DNS lo permite

Recomendación operativa:
- si vas a crecer a muchos tenants, usa wildcard DNS `*.libero.com.ve`

## Paso 6 - Ajustar Nginx
Tu Nginx debe aceptar el host nuevo y reenviar el host original al backend.

### Opcion A - server_name explicito
Si manejas hosts uno a uno:

```nginx
server {
    listen 443 ssl http2;
    server_name libero.com.ve www.libero.com.ve academia-centro.libero.com.ve;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        root /ruta/al/build/frontend;
        try_files $uri /index.html;
    }
}
```

### Opcion B - wildcard server_name
Si ya vas a soportar múltiples tenants:

```nginx
server {
    listen 443 ssl http2;
    server_name libero.com.ve www.libero.com.ve *.libero.com.ve;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        root /ruta/al/build/frontend;
        try_files $uri /index.html;
    }
}
```

### Validar configuracion Nginx
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Paso 7 - SSL
Tienes dos caminos:

### Opcion recomendada
- certificado wildcard para `*.libero.com.ve`

Ventajas:
- no tienes que emitir un certificado por cada tenant nuevo
- onboarding mas rápido

### Opcion manual por subdominio
Emitir certificado cada vez que agregas un tenant nuevo.

Ejemplo:
```bash
sudo certbot --nginx -d academia-centro.libero.com.ve
```

Si ya estás usando Cloudflare y planeas varios tenants, el wildcard es la mejor decisión operativa.

## Paso 8 - Reinicio operativo si hace falta
Si solo agregaste el tenant en DB core, normalmente no necesitas redeploy.

Reinicia backend solo si:
- cambiaste variables de entorno
- cambiaste configuración de proceso
- actualizaste código

Comandos típicos:

```bash
pm2 restart backend
pm2 save
```

## Paso 9 - Smoke test del tenant nuevo
Probar en este orden:

### 9.1 Contexto tenant
```bash
curl -H "Host: academia-centro.libero.com.ve" https://academia-centro.libero.com.ve/api/tenant/context
```

Esperado:
- `tenantId = academia-centro`

### 9.2 Login
Entrar por navegador a:
- `https://academia-centro.libero.com.ve`

Probar login con el admin inicial.

Esperado:
- login exitoso
- JWT con `tenantId=academia-centro`

### 9.3 Aislamiento
Validar:
- no aparecen datos de `villasport`
- no aparecen datos de otros tenants

### 9.4 Ruta protegida sin sede
Validar:
- si no hay sede seleccionada, no debe entrar por URL directa a vistas que dependen de sede

### 9.5 Uploads
Validar:
- carga de archivos
- acceso a `/uploads` con host del tenant correcto

## Paso 10 - Crear datos base operativos
Dependiendo del flujo comercial, normalmente debes crear:
- sede inicial
- usuario admin inicial confirmado
- configuración mínima de landing si aplica
- uniformes base si aplica

Si no hay sedes creadas, algunas vistas administrativas no deben habilitar acciones de registro dependientes de sede.

## Paso 11 - Checklist de salida del alta
- DNS resuelve al host correcto
- HTTPS válido
- `GET /api/tenant/context` responde el tenant correcto
- login exitoso
- tenant sin fuga de datos
- admin inicial validado
- uploads funcionales
- logs sin errores críticos
- backup del tenant incluido en política operativa

## Rollback del alta
Si algo falla durante el alta:

1. Desactivar el tenant en DB core:

```bash
node scripts/seedTenantCore.js \
  --tenant-id academia-centro \
  --tenant-name "Academia Centro" \
  --domains academia-centro.libero.com.ve \
  --db-uri mongodb://127.0.0.1:27017/libero_academia_centro \
  --estado suspended
```

2. Retirar el subdominio en Cloudflare si corresponde.
3. Retirar host/certificado en Nginx si se agregó manualmente.
4. Mantener la DB aislada para análisis; no mezclarla con otra.

## Recomendaciones para escalar mejor
- migrar a wildcard DNS `*.libero.com.ve`
- migrar a wildcard SSL `*.libero.com.ve`
- automatizar onboarding en un script único
- documentar credenciales iniciales y su rotación
- exigir cambio de contraseña al primer acceso

## Comando resumen de onboarding
Resumen mínimo del alta:

```bash
cd /ruta/a/libero/backend
node scripts/seedTenantCore.js --tenant-id academia-centro --tenant-name "Academia Centro" --domains academia-centro.libero.com.ve --db-uri mongodb://127.0.0.1:27017/libero_academia_centro --estado active
npm run tenant:init-db -- --tenant-id academia-centro --with-admin --admin-email admin@academia-centro.local --admin-password "CAMBIAR-ESTA-CLAVE" --admin-name "Admin Academia Centro"
```

Luego:
- crear DNS en Cloudflare
- asegurar Nginx y SSL
- probar login y aislamiento