# Apex - Nginx y PM2 (Comandos Copy/Paste)

Fecha: 2026-04-16
Objetivo: levantar Apex en paralelo en la misma VPS con la misma BD de produccion, evitando doble cron.

## 1) Variables base (autodeteccion + defaults)
Ejecutar en la VPS:

```bash
ssh root@50.114.206.31

export LIBERO_ROOT="${LIBERO_ROOT:-$(find /root /home /var/www /opt -maxdepth 4 -type d -name .git 2>/dev/null | sed 's#/.git$##' | grep '/Libero$' | head -n 1)}"
export APEX_ROOT="${APEX_ROOT:-/opt/apex}"
export APEX_PORT="${APEX_PORT:-4100}"
export APEX_DOMAIN="${APEX_DOMAIN:-apex.com.ve}"
export APEX_FRONT_ROOT="${APEX_FRONT_ROOT:-/var/www/apex}"

printf 'LIBERO_ROOT=%s\nAPEX_ROOT=%s\nAPEX_PORT=%s\nAPEX_DOMAIN=%s\nAPEX_FRONT_ROOT=%s\n' \
  "$LIBERO_ROOT" "$APEX_ROOT" "$APEX_PORT" "$APEX_DOMAIN" "$APEX_FRONT_ROOT"
```

## 2) Deploy de Apex (codigo + backend)
Si Apex ya esta clonado en otra ruta, solo exporta APEX_ROOT y salta el clone.

```bash
mkdir -p "$APEX_ROOT"
cd "$APEX_ROOT"

# Si APEX_ROOT esta vacio, clona desde el repo actual de Libero/Apex
if [ -z "$(ls -A "$APEX_ROOT" 2>/dev/null)" ]; then
  git clone <URL_REPO_APEX> "$APEX_ROOT"
fi

cd "$APEX_ROOT/backend"
npm ci
```

## 3) Backend .env de Apex (paralelo seguro)
Regla durante paralelo:
- Libero mantiene jobs activos
- Apex corre sin cron/catch-up

```bash
cd "$APEX_ROOT/backend"

cp .env .env.apex.backup.$(date +%Y%m%d-%H%M%S) 2>/dev/null || true

# Ajusta manualmente secretos/URIs si aun no existen en .env
# Estos setean solo las claves criticas de paralelo
grep -q '^PORT=' .env && sed -i "s/^PORT=.*/PORT=$APEX_PORT/" .env || echo "PORT=$APEX_PORT" >> .env
grep -q '^MULTI_TENANT_MODE=' .env && sed -i 's/^MULTI_TENANT_MODE=.*/MULTI_TENANT_MODE=true/' .env || echo 'MULTI_TENANT_MODE=true' >> .env
grep -q '^ENABLE_SCHEDULED_JOBS=' .env && sed -i 's/^ENABLE_SCHEDULED_JOBS=.*/ENABLE_SCHEDULED_JOBS=false/' .env || echo 'ENABLE_SCHEDULED_JOBS=false' >> .env
```

## 4) PM2 paralelo (backend viejo + apex-backend)

```bash
# Apex backend
pm2 start "$APEX_ROOT/backend/server.js" --name apex-backend --cwd "$APEX_ROOT/backend"
pm2 save

# Verificar ambos procesos
pm2 list
pm2 logs apex-backend --lines 120 --nostream
```

Esperado en logs de Apex:
- ENABLE_SCHEDULED_JOBS=false: catch-up y jobs cron deshabilitados para esta instancia

## 5) Build frontend Apex

```bash
mkdir -p "$APEX_FRONT_ROOT"
cd "$APEX_ROOT/my-react-app"
npm ci
npm run build
rsync -av --delete ./build/ "$APEX_FRONT_ROOT/"
```

## 6) Nginx final para apex.com.ve
Crear config dedicada:

```bash
sudo tee /etc/nginx/sites-available/apex.com.ve >/dev/null <<EOF
server {
    listen 80;
    server_name ${APEX_DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${APEX_DOMAIN};

    client_max_body_size 20m;

    location /api/ {
        proxy_pass http://127.0.0.1:${APEX_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:${APEX_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location / {
        root ${APEX_FRONT_ROOT};
        try_files \$uri /index.html;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/apex.com.ve /etc/nginx/sites-enabled/apex.com.ve 2>/dev/null || true
sudo nginx -t
sudo systemctl reload nginx
```

Si aun no tienes SSL para apex.com.ve:

```bash
sudo certbot --nginx -d "$APEX_DOMAIN"
sudo nginx -t
sudo systemctl reload nginx
```

## 7) Validaciones rapidas

```bash
curl --fail http://127.0.0.1:${APEX_PORT}/health
curl --fail -H "Host: ${APEX_DOMAIN}" http://127.0.0.1:${APEX_PORT}/api/tenant/context
curl --fail https://${APEX_DOMAIN}/api/tenant/context
```

## 8) Flip final de jobs en cutover
Cuando Apex este estable y vayas a cortar:

```bash
# En Libero: desactivar jobs
cd "$LIBERO_ROOT/backend"
grep -q '^ENABLE_SCHEDULED_JOBS=' .env && sed -i 's/^ENABLE_SCHEDULED_JOBS=.*/ENABLE_SCHEDULED_JOBS=false/' .env || echo 'ENABLE_SCHEDULED_JOBS=false' >> .env

# En Apex: activar jobs
cd "$APEX_ROOT/backend"
grep -q '^ENABLE_SCHEDULED_JOBS=' .env && sed -i 's/^ENABLE_SCHEDULED_JOBS=.*/ENABLE_SCHEDULED_JOBS=true/' .env || echo 'ENABLE_SCHEDULED_JOBS=true' >> .env

pm2 restart backend --update-env
pm2 restart apex-backend --update-env
pm2 save

pm2 logs backend --lines 80 --nostream
pm2 logs apex-backend --lines 80 --nostream
```

## 9) Rollback express (si algo falla)

```bash
# Revertir jobs
cd "$LIBERO_ROOT/backend"
grep -q '^ENABLE_SCHEDULED_JOBS=' .env && sed -i 's/^ENABLE_SCHEDULED_JOBS=.*/ENABLE_SCHEDULED_JOBS=true/' .env || echo 'ENABLE_SCHEDULED_JOBS=true' >> .env

cd "$APEX_ROOT/backend"
grep -q '^ENABLE_SCHEDULED_JOBS=' .env && sed -i 's/^ENABLE_SCHEDULED_JOBS=.*/ENABLE_SCHEDULED_JOBS=false/' .env || echo 'ENABLE_SCHEDULED_JOBS=false' >> .env

pm2 restart backend --update-env
pm2 restart apex-backend --update-env
pm2 save
```
