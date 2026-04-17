# Plan Completo - Migracion Paralela Libero -> Apex (1 VPS)

Fecha: 2026-04-16
Objetivo: desplegar Apex en paralelo en la misma VPS, usando la misma Mongo de produccion, y hacer cutover a apex.com.ve solo cuando este estable.

## Comandos directos
Para ejecucion copy/paste de Nginx + PM2 usa:
- backend/docs/APEX_NGINX_PM2_COMMANDS_2026-04-16.md

## Decisiones base
- 1 VPS compartida: SI.
- Misma Mongo de produccion: SI.
- Paralelo sin apagar Libero: SI.
- Regla de seguridad: solo una instancia con jobs habilitados para evitar ejecucion duplicada.

## Cambio tecnico aplicado en backend
Se agrego control por variable de entorno en server.js:
- ENABLE_SCHEDULED_JOBS=false

Efecto:
- deshabilita catch-up de arranque
- deshabilita cron de mensualidades/retrasados/conciliacion

Uso recomendado en paralelo:
- Libero activo: ENABLE_SCHEDULED_JOBS=true
- Apex en validacion: ENABLE_SCHEDULED_JOBS=false

Cuando hagas cutover:
- Libero: ENABLE_SCHEDULED_JOBS=false
- Apex: ENABLE_SCHEDULED_JOBS=true

## Arquitectura paralela objetivo
- Libero backend: puerto 4000, proceso pm2 backend
- Apex backend: puerto 4100, proceso pm2 apex-backend
- Libero frontend: ruta actual (sin cambios)
- Apex frontend: /var/www/apex
- Nginx apex.com.ve -> frontend /var/www/apex + /api y /uploads hacia 127.0.0.1:4100

## Fase 0 - Prechecks (obligatorio)
Ejecutar en VPS:

```bash
ssh root@50.114.206.31

pm2 list
sudo nginx -t
node -v
npm -v
mongod --version || mongosh --version
```

Checklist:
- acceso root y backup reciente
- espacio en disco suficiente para build + backups
- pm2 backend actual estable

## Fase 1 - DNS y SSL para apex.com.ve
En Cloudflare:
- A apex.com.ve -> IP de la VPS
- TTL auto
- proxied segun estrategia (si dudas, inicia sin proxy para validar origen y luego activas)

En VPS (si no tienes certificado wildcard para apex.com.ve):

```bash
sudo certbot --nginx -d apex.com.ve
```

## Fase 2 - Deploy de Apex en paralelo
### 2.1 Preparar carpeta de app Apex

```bash
export APEX_ROOT="/opt/apex"
mkdir -p "$APEX_ROOT"
cd "$APEX_ROOT"

# Opcion A: clonar repo
# git clone <tu_repo_git> .

# Opcion B: si ya existe copia local, actualizar
# git fetch --all --tags
# git checkout <release_ref>
```

### 2.2 Backend Apex env (misma BD prod, jobs deshabilitados)
Crear backend/.env de Apex con las variables de produccion necesarias y estos minimos:

```bash
PORT=4100
MULTI_TENANT_MODE=true
ENABLE_SCHEDULED_JOBS=false

# Mantener estas apuntando a la misma BD productiva actual
# CORE_MONGO_URI_CURRENT=...
# DEFAULT_TENANT_ID=...
# DEFAULT_TENANT_DB_URI=...
# JWT_SECRET_CURRENT=...
# REQUIRE_TENANT_IN_TOKEN=true
# ALLOW_DEFAULT_TENANT_FALLBACK=true|false
```

### 2.3 Levantar apex-backend en PM2

```bash
cd "$APEX_ROOT/backend"
npm ci
pm2 start server.js --name apex-backend --cwd "$APEX_ROOT/backend"
pm2 save
pm2 logs apex-backend --lines 80 --nostream
```

Validar backend apex local:

```bash
curl --fail http://127.0.0.1:4100/health
curl --fail -H "Host: apex.com.ve" http://127.0.0.1:4100/api/tenant/context
```

## Fase 3 - Frontend Apex + Nginx
### 3.1 Build frontend Apex

```bash
cd "$APEX_ROOT/my-react-app"
npm ci
npm run build
mkdir -p /var/www/apex
rsync -av --delete ./build/ /var/www/apex/
```

### 3.2 Nginx apex.com.ve
Crear archivo por ejemplo /etc/nginx/sites-available/apex.com.ve:

```nginx
server {
    listen 80;
    server_name apex.com.ve;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name apex.com.ve;

    # Certbot completara estas rutas si usas --nginx
    # ssl_certificate ...
    # ssl_certificate_key ...

    client_max_body_size 20m;

    location /api/ {
        proxy_pass http://127.0.0.1:4100;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:4100;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        root /var/www/apex;
        try_files $uri /index.html;
    }
}
```

Activar y recargar:

```bash
sudo ln -s /etc/nginx/sites-available/apex.com.ve /etc/nginx/sites-enabled/apex.com.ve 2>/dev/null || true
sudo nginx -t
sudo systemctl reload nginx
```

## Fase 4 - Validacion funcional en paralelo
### 4.1 Smoke tecnico

```bash
curl --fail https://apex.com.ve/api/tenant/context
curl --fail https://apex.com.ve
```

### 4.2 Smoke funcional minimo
- login admin
- alumnos lista/edicion simple
- mensualidades consulta
- pagos consulta/registro controlado
- constancia
- upload y lectura en /uploads

### 4.3 Verificacion de no-duplicacion de jobs
En apex-backend debe verse este log al iniciar:
- ENABLE_SCHEDULED_JOBS=false: catch-up y jobs cron deshabilitados para esta instancia

Comando:

```bash
pm2 logs apex-backend --lines 120 --nostream
```

## Fase 5 - Estabilizacion
Ventana recomendada: 24 a 72 horas.

Monitoreo:

```bash
pm2 logs apex-backend --lines 200 --nostream
pm2 logs backend --lines 200 --nostream
```

Revisar:
- 5xx
- latencia
- tenant mismatch token/host
- errores de Mongo
- endpoints criticos del negocio

## Fase 6 - Cutover final a Apex
Cuando apex.com.ve este estable.

### 6.1 Backup pre-cutover

```bash
cd "$APEX_ROOT/backend"
npm run backup:mongo
ls -1dt ./backups/* | head -n 3
```

### 6.2 Flip de jobs (critico)
- Libero backend -> ENABLE_SCHEDULED_JOBS=false
- Apex backend -> ENABLE_SCHEDULED_JOBS=true

Luego reiniciar ambos:

```bash
pm2 restart backend --update-env
pm2 restart apex-backend --update-env
pm2 save
```

### 6.3 Mover trafico principal
Opciones:
- Opcion recomendada: mantener apex.com.ve como principal y anunciar cambio.
- Opcion adicional: redirigir libero.com.ve -> apex.com.ve cuando confirmes cierre.

Ejemplo de redirect en Nginx (cuando decidas cerrar Libero):

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name libero.com.ve www.libero.com.ve;
    return 301 https://apex.com.ve$request_uri;
}
```

### 6.4 Validacion post-cutover

```bash
curl --fail https://apex.com.ve/api/tenant/context
pm2 logs apex-backend --lines 200 --nostream
```

## Rollback inmediato
Si falla despues del cutover:

1) Revertir jobs:
- Apex -> ENABLE_SCHEDULED_JOBS=false
- Libero -> ENABLE_SCHEDULED_JOBS=true

2) Reiniciar procesos:

```bash
pm2 restart apex-backend --update-env
pm2 restart backend --update-env
pm2 save
```

3) Revertir Nginx (quitar redirect o reactivar config previa de Libero):

```bash
sudo nginx -t
sudo systemctl reload nginx
```

4) Si hubo inconsistencia de datos incompatible:

```bash
cd "$APEX_ROOT/backend"
npm run restore:mongo
pm2 restart backend
pm2 save
```

## Riesgos y mitigaciones
- Riesgo: doble cron sobre misma BD.
  - Mitigacion: ENABLE_SCHEDULED_JOBS=false en una sola instancia.
- Riesgo: cambios de esquema incompatibles entre versiones.
  - Mitigacion: no aplicar migraciones destructivas durante paralelo.
- Riesgo: confusion operativa de dos frontends.
  - Mitigacion: ventana de pruebas controlada + checklist.

## Checklist de cierre
- apex.com.ve estable en ventana acordada
- jobs ejecutando solo en instancia activa final
- backup pre-cutover registrado
- rollback probado a nivel comando
- documentado quien y cuando hizo el flip final
