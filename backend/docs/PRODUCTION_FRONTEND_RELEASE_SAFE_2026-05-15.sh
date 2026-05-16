#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_HOST="${TARGET_HOST:-libero.com.ve}"
ALLOW_ABSOLUTE_API_URL="${ALLOW_ABSOLUTE_API_URL:-0}"

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

load_nvm() {
  if command -v nvm >/dev/null 2>&1; then
    return
  fi

  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "$HOME/.nvm/nvm.sh"
  fi

  command -v nvm >/dev/null 2>&1 || fail "nvm no esta disponible. Instala nvm y reintenta."
}

APP_ROOT="${APP_ROOT:-$(find_app_root)}"
FRONT_BUILD_TARGET="${FRONT_BUILD_TARGET:-$(find_front_build_target)}"

[ -n "$APP_ROOT" ] || fail "No se pudo resolver APP_ROOT"
[ -d "$APP_ROOT/.git" ] || fail "APP_ROOT no apunta a un repo git valido: $APP_ROOT"
[ -n "$FRONT_BUILD_TARGET" ] || fail "No se pudo resolver FRONT_BUILD_TARGET desde Nginx"

FRONTEND_DIR="$APP_ROOT/my-react-app"
[ -d "$FRONTEND_DIR" ] || fail "No existe directorio frontend: $FRONTEND_DIR"

NODE_VERSION_FILE="$FRONTEND_DIR/.nvmrc"
EXPECTED_NODE_VERSION="18.20.8"
if [ -f "$NODE_VERSION_FILE" ]; then
  EXPECTED_NODE_VERSION="$(head -n 1 "$NODE_VERSION_FILE" | tr -d '[:space:]')"
fi
[ -n "$EXPECTED_NODE_VERSION" ] || fail "Version Node esperada vacia"

require_cmd sudo
require_cmd nginx
require_cmd npm
require_cmd node
require_cmd rsync
require_cmd curl
require_cmd sed
require_cmd find
require_cmd head
require_cmd grep
require_cmd tr
require_cmd tail

log "Variables resueltas"
printf 'APP_ROOT=%s\nFRONT_BUILD_TARGET=%s\nTARGET_HOST=%s\nEXPECTED_NODE_VERSION=%s\n' \
  "$APP_ROOT" "$FRONT_BUILD_TARGET" "$TARGET_HOST" "$EXPECTED_NODE_VERSION"

log "Asegurando version de Node compatible con react-scripts"
load_nvm
nvm install "$EXPECTED_NODE_VERSION" >/dev/null
nvm use "$EXPECTED_NODE_VERSION" >/dev/null

ACTUAL_NODE_VERSION="$(node -v | sed 's/^v//')"
[ "$ACTUAL_NODE_VERSION" = "$EXPECTED_NODE_VERSION" ] || fail "Node activo $ACTUAL_NODE_VERSION no coincide con esperado $EXPECTED_NODE_VERSION"

log "Node y npm activos"
printf 'node=%s\nnpm=%s\n' "$(node -v)" "$(npm -v)"

ENV_PROD_FILE="$FRONTEND_DIR/.env.production"
if [ -f "$ENV_PROD_FILE" ]; then
  API_URL_VALUE="$(sed -n 's/^REACT_APP_API_URL=//p' "$ENV_PROD_FILE" | tail -n 1 | tr -d '"' | tr -d "'")"
  if [ -n "$API_URL_VALUE" ] && [ "$ALLOW_ABSOLUTE_API_URL" != "1" ]; then
    fail "REACT_APP_API_URL en .env.production esta definido ('$API_URL_VALUE'). Para multi-tenant por host debe ir vacio/relativo. Si es intencional, exporta ALLOW_ABSOLUTE_API_URL=1."
  fi
fi

log "Instalando dependencias reproducibles"
cd "$FRONTEND_DIR"
npm ci

log "Generando build de produccion"
npm run build
[ -d "$FRONTEND_DIR/build" ] || fail "No se genero carpeta build"

log "Publicando build en Nginx"
rsync -av --delete "$FRONTEND_DIR/build/" "$FRONT_BUILD_TARGET/"
sudo nginx -t
sudo systemctl reload nginx

log "Smoke test publico"
curl --fail --silent --show-error "https://${TARGET_HOST}/api/tenant/context" >/dev/null
printf 'SMOKE_OK host=%s endpoint=/api/tenant/context\n' "$TARGET_HOST"

log "Frontend release completado"
