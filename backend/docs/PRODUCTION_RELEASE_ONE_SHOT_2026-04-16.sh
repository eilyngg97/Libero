#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_REF="${RELEASE_REF:-main}"
TARGET_HOST="${TARGET_HOST:-libero.com.ve}"
TENANT_B_HOST="${TENANT_B_HOST:-pruebas.libero.com.ve}"
RUN_TENANT_B_CHECK="${RUN_TENANT_B_CHECK:-0}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Falta comando requerido: $1"
}

find_app_root() {
  find /root /home /var/www /opt -maxdepth 4 -type d -name .git 2>/dev/null \
    | sed 's#/.git$##' \
    | grep '/Libero$' \
    | head -n 1
}

find_front_build_target() {
  sudo nginx -T 2>/dev/null \
    | sed -n 's/^[[:space:]]*root[[:space:]]\+\([^;]*\);/\1/p' \
    | grep -v '/html$' \
    | head -n 1
}

APP_ROOT="${APP_ROOT:-$(find_app_root)}"
FRONT_BUILD_TARGET="${FRONT_BUILD_TARGET:-$(find_front_build_target)}"

[ -n "$APP_ROOT" ] || fail "No se pudo resolver APP_ROOT"
[ -d "$APP_ROOT/.git" ] || fail "APP_ROOT no apunta a un repo git valido: $APP_ROOT"
[ -n "$FRONT_BUILD_TARGET" ] || fail "No se pudo resolver FRONT_BUILD_TARGET desde Nginx"

require_cmd git
require_cmd npm
require_cmd pm2
require_cmd rsync
require_cmd curl
require_cmd sed
require_cmd find
require_cmd head

PREVIOUS_REF="$(git -C "$APP_ROOT" rev-parse HEAD)"
BACKUP_EVIDENCE=""
RESTORE_HINT_SHOWN=0

rollback() {
  if [ "$RESTORE_HINT_SHOWN" = "1" ]; then
    return
  fi

  RESTORE_HINT_SHOWN=1
  log "Iniciando rollback al ref previo: $PREVIOUS_REF"

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

  log "Rollback completado. Si hubo cambios de datos incompatibles, ejecutar restore manual con el backup pre-release."
}

on_error() {
  local exit_code=$?
  log "Fallo en linea ${BASH_LINENO[0]} con codigo ${exit_code}"
  rollback
  exit "$exit_code"
}

trap on_error ERR

log "Variables resueltas"
printf 'RELEASE_REF=%s\nAPP_ROOT=%s\nFRONT_BUILD_TARGET=%s\nPREVIOUS_REF=%s\n' \
  "$RELEASE_REF" "$APP_ROOT" "$FRONT_BUILD_TARGET" "$PREVIOUS_REF"

log "Actualizando repo al release"
cd "$APP_ROOT"
git fetch --all --tags
git checkout "$RELEASE_REF"

log "Instalando y validando backend"
cd "$APP_ROOT/backend"
npm ci
npm run ops:preflight
npm run backup:mongo
BACKUP_EVIDENCE="$(ls -1dt ./backups/* | head -n 3 | tr '\n' ';')"
printf 'BACKUP_EVIDENCE=%s\n' "$BACKUP_EVIDENCE"

log "Health previo del backend"
curl --fail --silent --show-error http://127.0.0.1:4000/health
printf '\n'

log "Reiniciando backend"
pm2 restart backend
pm2 save
pm2 logs backend --lines 80 --nostream

log "Validando backend post-restart"
curl --fail --silent --show-error http://127.0.0.1:4000/health
printf '\n'
curl --fail --silent --show-error -H "Host: ${TARGET_HOST}" http://127.0.0.1:4000/api/tenant/context
printf '\n'

log "Build y publicacion del frontend"
cd "$APP_ROOT/my-react-app"
npm ci
npm run build
rsync -av --delete ./build/ "$FRONT_BUILD_TARGET/"
sudo nginx -t
sudo systemctl reload nginx

log "Smoke tests publicos"
curl --fail --silent --show-error "https://${TARGET_HOST}/api/tenant/context"
printf '\n'

if curl --fail --silent --show-error "https://${TARGET_HOST}/health" >/dev/null 2>&1; then
  curl --fail --silent --show-error "https://${TARGET_HOST}/health"
  printf '\n'
else
  log "El endpoint publico /health no esta expuesto; se conserva la validacion local previa."
fi

if [ "$RUN_TENANT_B_CHECK" = "1" ]; then
  log "Smoke test tenant B"
  curl --fail --silent --show-error -H "Host: ${TENANT_B_HOST}" "https://${TENANT_B_HOST}/api/tenant/context"
  printf '\n'
fi

log "Monitoreo inmediato"
pm2 logs backend --lines 120 --nostream

trap - ERR
log "Release completado sin rollback"
printf 'RELEASE_OK ref=%s backup=%s\n' "$RELEASE_REF" "$BACKUP_EVIDENCE"
