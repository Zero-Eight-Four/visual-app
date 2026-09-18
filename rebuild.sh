#!/bin/bash

set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_ROOT"

BACKEND_IMAGE="${BACKEND_IMAGE:-visual-app-backend:latest}"
NODE_IMAGE="${NODE_IMAGE:-docker.m.daocloud.io/library/node:24.11.1-alpine}"
NGINX_IMAGE="${NGINX_IMAGE:-docker.m.daocloud.io/library/nginx:alpine}"
NETWORK_NAME="${NETWORK_NAME:-visual-app-net}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-visual-backend}"
NGINX_CONTAINER="${NGINX_CONTAINER:-visual-nginx}"
BACKEND_PORT="${BACKEND_PORT:-3000}"
NGINX_PORT="${NGINX_PORT:-18080}"
TARGET_API="${TARGET_API:-http://8.148.247.53:8000}"
SECONDARY_AI_API="${SECONDARY_AI_API:-http://8.148.247.53:8001}"
ENABLE_SECONDARY_AI_PROXY="${ENABLE_SECONDARY_AI_PROXY:-true}"
ENABLE_SECONDARY_IMAGE_ROUTING="${ENABLE_SECONDARY_IMAGE_ROUTING:-true}"

if [ -f "$APP_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$APP_ROOT/.env"
  set +a
elif [ -f "$APP_ROOT/deploy/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$APP_ROOT/deploy/.env"
  set +a
fi

find_docker_cmd() {
  if docker info >/dev/null 2>&1; then
    echo "docker"
    return
  fi

  if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    echo "sudo -n docker"
    return
  fi

  echo "Docker is not available. Start Docker or configure current user access." >&2
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

DOCKER_CMD="$(find_docker_cmd)"

require_cmd npm
require_cmd curl

echo "==> Building frontend"
if [ -d "$APP_ROOT/dist" ]; then
  chmod -R u+rwX "$APP_ROOT/dist" 2>/dev/null || true
fi
npm install --no-audit --no-fund
VITE_APP_LOGO="${VITE_APP_LOGO:-logo-placeholder.png}" \
VITE_APP_FAVICON="${VITE_APP_FAVICON:-favicon-placeholder.png}" \
VITE_ENABLE_DUAL_AI="${VITE_ENABLE_DUAL_AI:-true}" \
npm run build

if [ ! -f "$APP_ROOT/dist/index.html" ]; then
  echo "Frontend build failed: dist/index.html was not created." >&2
  exit 1
fi

echo "==> Building backend image: $BACKEND_IMAGE"
$DOCKER_CMD build --build-arg NODE_IMAGE="$NODE_IMAGE" -t "$BACKEND_IMAGE" .

echo "==> Preparing persistent data directories"
mkdir -p maps image image2 animal-species videos temp config

echo "==> Preparing Docker network: $NETWORK_NAME"
if ! $DOCKER_CMD network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  $DOCKER_CMD network create "$NETWORK_NAME" >/dev/null
fi

echo "==> Removing old containers"
$DOCKER_CMD rm -f "$NGINX_CONTAINER" "$BACKEND_CONTAINER" >/dev/null 2>&1 || true

echo "==> Starting backend container"
$DOCKER_CMD run -d \
  --name "$BACKEND_CONTAINER" \
  --network "$NETWORK_NAME" \
  --network-alias backend \
  --restart always \
  -p "$BACKEND_PORT:3000" \
  -e NODE_ENV=production \
  -e TARGET_API="$TARGET_API" \
  -e SECONDARY_AI_API="$SECONDARY_AI_API" \
  -e ENABLE_SECONDARY_AI_PROXY="$ENABLE_SECONDARY_AI_PROXY" \
  -e ENABLE_SECONDARY_IMAGE_ROUTING="$ENABLE_SECONDARY_IMAGE_ROUTING" \
  -v "$APP_ROOT/maps:/app/maps" \
  -v "$APP_ROOT/image:/app/image" \
  -v "$APP_ROOT/image2:/app/image2" \
  -v "$APP_ROOT/animal-species:/app/animal-species" \
  -v "$APP_ROOT/videos:/app/videos" \
  -v "$APP_ROOT/config:/app/config" \
  -v "$APP_ROOT/temp:/app/temp" \
  "$BACKEND_IMAGE" >/dev/null

echo "==> Starting nginx container"
$DOCKER_CMD run -d \
  --name "$NGINX_CONTAINER" \
  --network "$NETWORK_NAME" \
  --restart always \
  -p "$NGINX_PORT:80" \
  -v "$APP_ROOT/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$APP_ROOT/dist:/usr/share/nginx/html:ro" \
  "$NGINX_IMAGE" >/dev/null

check_url() {
  local url="$1"
  local expected_csv="$2"
  local retries="${3:-1}"
  local wait_seconds="${4:-1}"
  local response_code="000"
  local attempt

  for ((attempt = 1; attempt <= retries; attempt++)); do
    response_code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 8 "$url" 2>/dev/null || true)
    if [[ ! "$response_code" =~ ^[0-9]{3}$ ]]; then
      response_code="000"
    fi

    if [[ ",$expected_csv," == *",$response_code,"* ]]; then
      echo "[OK] $url -> $response_code"
      return 0
    fi

    if (( attempt < retries )); then
      sleep "$wait_seconds"
    fi
  done

  echo "[WARN] $url -> $response_code (expected: $expected_csv)"
  return 1
}

echo "==> Running post-deploy checks"
check_url "http://127.0.0.1:$BACKEND_PORT/" "200,301,302" 8 2
check_url "http://127.0.0.1:$NGINX_PORT/" "301,302" 8 2
check_url "http://127.0.0.1:$NGINX_PORT/robot-dog-web/" "200" 8 2
check_url "http://127.0.0.1:$NGINX_PORT/api/weather/config" "200,304,502" 3 1

echo "==> Deployment complete"
echo "Frontend: http://127.0.0.1:$NGINX_PORT/robot-dog-web/"
echo "Backend:  http://127.0.0.1:$BACKEND_PORT/"
echo "Containers: $BACKEND_CONTAINER, $NGINX_CONTAINER"
