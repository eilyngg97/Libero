# Production Release Commands

Fecha base: 2026-04-16
Servidor objetivo actual: VPS Ubuntu 50.114.206.31
Proceso backend: PM2 con nombre backend

## Script copy-paste
Si prefieres una sola corrida automatizada, usa el script:
- backend/docs/PRODUCTION_RELEASE_ONE_SHOT_2026-04-16.sh

Ejemplo de ejecucion en la VPS:
```bash
export RELEASE_REF="main"
export APP_ROOT="${APP_ROOT:-$(find /root /home /var/www /opt -maxdepth 4 -type d -name .git 2>/dev/null | sed 's#/.git$##' | grep '/Libero$' | head -n 1)}"
bash "$APP_ROOT/backend/docs/PRODUCTION_RELEASE_ONE_SHOT_2026-04-16.sh"
```

## Variables a definir antes de ejecutar
- RELEASE_REF: commit, tag o branch exacto a liberar

## 0. Resolver variables en la VPS
Este bloque intenta detectar automaticamente la raiz del repo y el root publico de Nginx. Si no los encuentra, falla antes de tocar el release.

```bash
export RELEASE_REF="main"
export APP_ROOT="${APP_ROOT:-$(find /root /home /var/www /opt -maxdepth 4 -type d -name .git 2>/dev/null | sed 's#/.git$##' | grep '/Libero$' | head -n 1)}"
export FRONT_BUILD_TARGET="${FRONT_BUILD_TARGET:-$(sudo nginx -T 2>/dev/null | sed -n 's/^[[:space:]]*root[[:space:]]\+\([^;]*\);/\1/p' | grep -v '/html$' | head -n 1)}"

if [ -z "$APP_ROOT" ] || [ -z "$FRONT_BUILD_TARGET" ]; then
	echo "No se pudo resolver APP_ROOT o FRONT_BUILD_TARGET automaticamente."
	echo "APP_ROOT=$APP_ROOT"
	echo "FRONT_BUILD_TARGET=$FRONT_BUILD_TARGET"
	exit 1
fi

export PREVIOUS_REF="$(git -C "$APP_ROOT" rev-parse HEAD)"

printf 'RELEASE_REF=%s\nAPP_ROOT=%s\nFRONT_BUILD_TARGET=%s\nPREVIOUS_REF=%s\n' \
	"$RELEASE_REF" "$APP_ROOT" "$FRONT_BUILD_TARGET" "$PREVIOUS_REF"
```

## 1. Entrar al servidor
```bash
ssh root@50.114.206.31
```

## 2. Actualizar el repo al release
```bash
cd "$APP_ROOT"
git fetch --all --tags
git checkout "$RELEASE_REF"
```

## 3. Backend pre-release
```bash
cd "$APP_ROOT/backend"
npm ci
npm run ops:preflight
npm run backup:mongo
```

## 4. Registrar evidencia del backup generado
```bash
cd "$APP_ROOT/backend"
ls -1dt ./backups/* | head -n 3
```

## 5. Verificar salud previa del backend
```bash
curl http://127.0.0.1:4000/health
```

## 6. Reiniciar backend con el release
```bash
cd "$APP_ROOT/backend"
pm2 restart backend
pm2 save
pm2 logs backend --lines 80 --nostream
```

## 7. Validar backend post-restart
```bash
curl http://127.0.0.1:4000/health
curl -H "Host: libero.com.ve" http://127.0.0.1:4000/api/tenant/context
```

## 8. Frontend release
```bash
cd "$APP_ROOT/my-react-app"
npm ci
npm run build
rsync -av --delete ./build/ "$FRONT_BUILD_TARGET/"
sudo nginx -t
sudo systemctl reload nginx
```

## 9. Smoke test publico
```bash
curl https://libero.com.ve/health
curl https://libero.com.ve/api/tenant/context
```

## 10. Smoke test funcional minimo
Ejecutar manualmente en navegador:
- abrir https://libero.com.ve
- login admin tenant principal
- abrir alumnos
- abrir mensualidades
- validar pago o lectura segura de pagos
- generar constancia

## 11. Validacion multi-tenant si tenant B esta publicado
```bash
curl -H "Host: pruebas.libero.com.ve" https://pruebas.libero.com.ve/api/tenant/context
```

Esperado:
- tenant principal responde con tenantId correcto
- tenant B responde con tenantId pruebas si ese host esta habilitado en produccion

## 12. Monitoreo inmediato
```bash
pm2 logs backend --lines 120 --nostream
```

Revisar especificamente:
- errores 5xx
- errores de conexion Mongo
- errores de tenant resolution
- errores de jobs tenant-aware
- warnings operativos nuevos

## 13. Rollback rapido
Si el release falla:
```bash
cd "$APP_ROOT"
git checkout "$PREVIOUS_REF"

cd "$APP_ROOT/backend"
npm ci
pm2 restart backend
pm2 save

cd "$APP_ROOT/my-react-app"
npm ci
npm run build
rsync -av --delete ./build/ "$FRONT_BUILD_TARGET/"
sudo nginx -t
sudo systemctl reload nginx
```

Si ademas hubo inconsistencia de datos:
```bash
cd "$APP_ROOT/backend"
npm run restore:mongo
pm2 restart backend
pm2 save
```

## Nota importante
El comando curl a /health es valido localmente sobre el backend en 127.0.0.1:4000.
Si Nginx no expone /health publicamente, usa solo la validacion local para ese endpoint y deja la validacion publica en /api/tenant/context y el frontend.