#!/bin/bash

set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_ROOT"

BACKEND_IMAGE="${BACKEND_IMAGE:-visual-app-backend:latest}"
NODE_IMAGE="${NODE_IMAGE:-docker.m.daocloud.io/library/node:24.11.1-alpine}"
OUTPUT_DIR="${OUTPUT_DIR:-release}"
IMAGE_TAR="${OUTPUT_DIR}/visual-app-backend.tar"
RELEASE_DEPLOY_DIR="${OUTPUT_DIR}/deploy"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd npm
require_cmd docker

echo "==> Building frontend"
npm install
VITE_APP_LOGO="${VITE_APP_LOGO:-logo.png}" \
VITE_APP_FAVICON="${VITE_APP_FAVICON:-favicon.png}" \
VITE_ENABLE_DUAL_AI="${VITE_ENABLE_DUAL_AI:-false}" \
npm run build

echo "==> Building backend image: $BACKEND_IMAGE"
docker build --build-arg NODE_IMAGE="$NODE_IMAGE" -t "$BACKEND_IMAGE" .

echo "==> Exporting backend image"
rm -rf "$OUTPUT_DIR"
mkdir -p "$RELEASE_DEPLOY_DIR"
docker save "$BACKEND_IMAGE" -o "$IMAGE_TAR"

echo "==> Copying deployment files"
cp deploy/docker-compose.yml "$RELEASE_DEPLOY_DIR/docker-compose.yml"
cp deploy/.env.example "$RELEASE_DEPLOY_DIR/.env.example"

cat > "$OUTPUT_DIR/deploy.sh" <<'EOF'
#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令: $1" >&2
    exit 1
  fi
}

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "当前不是 root 用户，且系统没有 sudo。请使用 root 用户运行本脚本。" >&2
    exit 1
  fi
fi

run_privileged() {
  if [ -n "$SUDO" ]; then
    $SUDO "$@"
  else
    "$@"
  fi
}

install_docker_with_apt() {
  echo "==> 检测到 Debian/Ubuntu 系统，尝试安装 Docker 和 Compose 插件"
  run_privileged apt-get update
  run_privileged apt-get install -y ca-certificates curl gnupg lsb-release

  . /etc/os-release
  local distro_id="${ID:-ubuntu}"
  local codename="${VERSION_CODENAME:-}"

  if [ -z "$codename" ] && command -v lsb_release >/dev/null 2>&1; then
    codename="$(lsb_release -cs)"
  fi

  if [ -z "$codename" ]; then
    echo "无法识别系统代号，无法自动配置 Docker APT 源。" >&2
    exit 1
  fi

  run_privileged install -m 0755 -d /etc/apt/keyrings
  run_privileged rm -f /etc/apt/keyrings/docker.gpg
  curl -fsSL "https://mirrors.aliyun.com/docker-ce/linux/${distro_id}/gpg" | run_privileged gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  run_privileged chmod a+r /etc/apt/keyrings/docker.gpg

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/${distro_id} ${codename} stable" \
    | run_privileged tee /etc/apt/sources.list.d/docker.list >/dev/null

  run_privileged apt-get update
  run_privileged apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

install_docker_with_yum() {
  echo "==> 检测到 RHEL/CentOS/Alibaba 系统，尝试安装 Docker 和 Compose 插件"
  if command -v dnf >/dev/null 2>&1; then
    run_privileged dnf install -y yum-utils
    run_privileged dnf config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
    run_privileged dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    run_privileged yum install -y yum-utils
    run_privileged yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
    run_privileged yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
}

install_docker() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
  else
    echo "无法识别系统类型，请先手动安装 Docker 和 Docker Compose。" >&2
    exit 1
  fi

  case "${ID:-}" in
    ubuntu|debian)
      install_docker_with_apt
      ;;
    centos|rhel|rocky|almalinux|alinux|anolis)
      install_docker_with_yum
      ;;
    *)
      echo "暂不支持自动安装当前系统: ${PRETTY_NAME:-unknown}" >&2
      echo "请先手动安装 Docker 和 Docker Compose 后再运行本脚本。" >&2
      exit 1
      ;;
  esac
}

configure_docker_daemon() {
  if [ ! -f /etc/docker/daemon.json ]; then
    echo "==> 配置 Docker 国内镜像源"
    run_privileged mkdir -p /etc/docker
    cat <<'JSON' | run_privileged tee /etc/docker/daemon.json >/dev/null
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io"
  ]
}
JSON
  fi
}

ensure_docker_environment() {
  echo "==> 检测部署环境"

  if ! command -v docker >/dev/null 2>&1; then
    install_docker
  fi

  configure_docker_daemon

  if command -v systemctl >/dev/null 2>&1; then
    run_privileged systemctl enable docker >/dev/null 2>&1 || true
    run_privileged systemctl restart docker
  else
    run_privileged service docker restart >/dev/null 2>&1 || true
  fi

  if ! docker info >/dev/null 2>&1; then
    if [ -n "$SUDO" ]; then
      DOCKER="$SUDO docker"
    else
      echo "Docker 已安装，但当前无法访问 Docker 服务。" >&2
      exit 1
    fi
  else
    DOCKER="docker"
  fi

  if ! $DOCKER compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
    echo "==> 未检测到 Docker Compose，尝试安装 Compose 插件"
    if command -v apt-get >/dev/null 2>&1; then
      run_privileged apt-get update
      run_privileged apt-get install -y docker-compose-plugin
    elif command -v dnf >/dev/null 2>&1; then
      run_privileged dnf install -y docker-compose-plugin
    elif command -v yum >/dev/null 2>&1; then
      run_privileged yum install -y docker-compose-plugin
    fi
  fi
}

compose_cmd() {
  if $DOCKER compose version >/dev/null 2>&1; then
    echo "$DOCKER compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    if docker-compose version >/dev/null 2>&1; then
      echo "docker-compose"
    elif [ -n "$SUDO" ]; then
      echo "$SUDO docker-compose"
    else
      echo "docker-compose"
    fi
  else
    echo "缺少 Docker Compose，请先安装 docker compose 或 docker-compose。" >&2
    exit 1
  fi
}

set_env_value() {
  local key="$1"
  local value="$2"
  local tmp_file
  tmp_file="$(mktemp)"

  if grep -q "^${key}=" deploy/.env; then
    awk -v key="$key" -v value="$value" '
      BEGIN { replaced = 0 }
      $0 ~ "^" key "=" {
        print key "=" value
        replaced = 1
        next
      }
      { print }
      END {
        if (!replaced) print key "=" value
      }
    ' deploy/.env > "$tmp_file"
  else
    cp deploy/.env "$tmp_file"
    printf '\n%s=%s\n' "$key" "$value" >> "$tmp_file"
  fi

  mv "$tmp_file" deploy/.env
}

port_in_use() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}$"
    return
  fi

  if command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk 'NR > 2 {print $4}' | grep -Eq "[:.]${port}$"
    return
  fi

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    sock.bind(("0.0.0.0", port))
except OSError:
    sys.exit(0)
finally:
    sock.close()
sys.exit(1)
PY
    return
  fi

  return 1
}

choose_web_port() {
  local desired_port="${1:-18080}"
  local port="$desired_port"
  local max_port=$((desired_port + 100))

  while [ "$port" -le "$max_port" ]; do
    if ! port_in_use "$port"; then
      echo "$port"
      return 0
    fi
    port=$((port + 1))
  done

  echo "从 ${desired_port} 到 ${max_port} 都没有可用网页端口，请手动释放端口或设置 WEB_PORT。" >&2
  exit 1
}

detect_server_ip() {
  local ip_addr=""

  if [ -n "${PUBLIC_HOST:-}" ]; then
    echo "$PUBLIC_HOST"
    return
  fi

  if [ -n "${PUBLIC_IP:-}" ]; then
    echo "$PUBLIC_IP"
    return
  fi

  if command -v curl >/dev/null 2>&1; then
    ip_addr="$(curl -fsS --max-time 3 https://ifconfig.me 2>/dev/null || true)"
    if [ -z "$ip_addr" ]; then
      ip_addr="$(curl -fsS --max-time 3 https://api.ipify.org 2>/dev/null || true)"
    fi
  fi

  if command -v hostname >/dev/null 2>&1; then
    if [ -z "$ip_addr" ]; then
      ip_addr="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
    fi
  fi

  if [ -z "$ip_addr" ] && command -v ip >/dev/null 2>&1; then
    ip_addr="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i == "src") {print $(i+1); exit}}' || true)"
  fi

  if [ -z "$ip_addr" ]; then
    ip_addr="服务器IP"
  fi

  echo "$ip_addr"
}

check_local_http() {
  local port="$1"
  local url="http://127.0.0.1:${port}/robot-dog-web/"

  if ! command -v curl >/dev/null 2>&1; then
    echo "未安装 curl，跳过本机访问检查。"
    return 0
  fi

  local status
  status="$(curl -sS -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 8 "$url" 2>/dev/null || true)"
  case "$status" in
    200|301|302|304)
      echo "本机访问检查通过: ${url} -> ${status}"
      ;;
    *)
      echo "本机访问检查失败: ${url} -> ${status:-000}" >&2
      echo "请执行: cd deploy && $COMPOSE logs --tail=100 backend" >&2
      ;;
  esac
}

ensure_docker_environment
COMPOSE="$(compose_cmd)"

if [ ! -f visual-app-backend.tar ]; then
  echo "未找到 visual-app-backend.tar，请在 release 目录中运行本脚本。" >&2
  exit 1
fi

if [ ! -d deploy ]; then
  echo "未找到 deploy 目录，请确认已上传完整 release 目录。" >&2
  exit 1
fi

echo "==> 加载后端镜像"
$DOCKER load -i visual-app-backend.tar

if [ ! -f deploy/.env ]; then
  echo "==> 创建 deploy/.env"
  cp deploy/.env.example deploy/.env
fi

CURRENT_TARGET_API="$(grep -E '^TARGET_API=' deploy/.env | tail -n 1 | cut -d= -f2- || true)"
if [ -n "${TARGET_API:-}" ]; then
  set_env_value TARGET_API "$TARGET_API"
elif [ -z "$CURRENT_TARGET_API" ] || echo "$CURRENT_TARGET_API" | grep -q '主AI服务器IP'; then
  SERVER_IP_FOR_API="$(detect_server_ip)"
  if [ "$SERVER_IP_FOR_API" = "服务器IP" ]; then
    echo "无法自动识别服务器 IP，请设置 TARGET_API，例如：TARGET_API=http://192.168.1.10:8000 ./deploy.sh" >&2
    exit 1
  fi
  CURRENT_TARGET_API="http://${SERVER_IP_FOR_API}:8000"
  echo "==> TARGET_API 未设置，默认使用 ${CURRENT_TARGET_API}"
  set_env_value TARGET_API "$CURRENT_TARGET_API"
fi

cd deploy
echo "==> 清理旧容器"
$COMPOSE down --remove-orphans || true
cd "$ROOT_DIR"

CURRENT_WEB_PORT="$(grep -E '^WEB_PORT=' deploy/.env | tail -n 1 | cut -d= -f2- || true)"
if [ -n "${WEB_PORT:-}" ]; then
  set_env_value WEB_PORT "$WEB_PORT"
  CURRENT_WEB_PORT="$WEB_PORT"
elif [ -z "$CURRENT_WEB_PORT" ]; then
  set_env_value WEB_PORT "18080"
  CURRENT_WEB_PORT="18080"
fi

AVAILABLE_WEB_PORT="$(choose_web_port "$CURRENT_WEB_PORT")"
if [ "$AVAILABLE_WEB_PORT" != "$CURRENT_WEB_PORT" ]; then
  echo "==> 端口 ${CURRENT_WEB_PORT} 已被占用，自动改用 ${AVAILABLE_WEB_PORT}"
  set_env_value WEB_PORT "$AVAILABLE_WEB_PORT"
  CURRENT_WEB_PORT="$AVAILABLE_WEB_PORT"
fi

mkdir -p deploy/data/maps deploy/data/image deploy/data/videos deploy/data/temp

cd deploy
echo "==> 启动服务"
$COMPOSE up -d

echo
echo "部署完成。"
check_local_http "$CURRENT_WEB_PORT"
SERVER_IP="$(detect_server_ip)"
echo "访问地址: http://${SERVER_IP}:${CURRENT_WEB_PORT}/robot-dog-web/"
if [ "$SERVER_IP" = "服务器IP" ]; then
  echo "未能自动识别服务器 IP，请将上方地址中的 服务器IP 替换为实际服务器地址。"
fi
echo "如果输出的是 10.x、172.16-31.x 或 192.168.x 内网 IP，请改用服务器公网 IP 或域名访问。"
echo "查看状态: cd deploy && $COMPOSE ps"
EOF
chmod +x "$OUTPUT_DIR/deploy.sh"

cat > "$OUTPUT_DIR/stop.sh" <<'EOF'
#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

DOCKER="docker"
if ! docker info >/dev/null 2>&1 && [ -n "$SUDO" ]; then
  DOCKER="$SUDO docker"
fi

compose_cmd() {
  if $DOCKER compose version >/dev/null 2>&1; then
    echo "$DOCKER compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    if docker-compose version >/dev/null 2>&1; then
      echo "docker-compose"
    elif [ -n "$SUDO" ]; then
      echo "$SUDO docker-compose"
    else
      echo "docker-compose"
    fi
  else
    echo "缺少 Docker Compose，无法停止当前服务。" >&2
    exit 1
  fi
}

if [ ! -d deploy ] || [ ! -f deploy/docker-compose.yml ]; then
  echo "未找到 deploy/docker-compose.yml，请在 release 目录中运行本脚本。" >&2
  exit 1
fi

COMPOSE="$(compose_cmd)"

cd deploy
echo "==> 只停止当前 release/deploy 项目的容器"
$COMPOSE down --remove-orphans

echo
echo "已停止当前项目容器。数据目录 deploy/data 和 Docker 卷仍会保留。"
EOF
chmod +x "$OUTPUT_DIR/stop.sh"

cat > "$OUTPUT_DIR/部署说明.md" <<'EOF'
# visual-app 部署包使用说明

本目录由 `./package_release.sh` 生成，可以直接上传到目标服务器。

## 文件说明

- `visual-app-backend.tar`：后端 Docker 镜像。
- 前端静态文件已打入后端镜像，由后端容器直接提供访问。
- `deploy/`：Docker Compose、环境变量模板和详细部署文档。
- `deploy.sh`：一键部署脚本。
- `stop.sh`：停止当前项目容器的脚本。

部署版网页左上角和标签页使用真实 `public/logo.png`、`public/favicon.png`；本机 `rebuild.sh` 默认使用 `public/logo-placeholder.png`、`public/favicon-placeholder.png` 占位图。

## 最短部署步骤

在目标服务器进入本目录后执行：

```bash
./deploy.sh
```

脚本会自动加载镜像、初始化 `.env`，默认把 `TARGET_API` 设置为当前服务器 IP 的 `8000` 端口，检测网页端口是否被占用，并启动 Docker Compose。

网页默认端口是 `18080`。如果该端口已被占用，脚本会自动尝试 `18081`、`18082` 继续向后查找可用端口，并在部署完成后输出最终访问地址。

浏览器访问：

```text
http://服务器IP:18080
```

系统会跳转到：

```text
http://服务器IP:18080/robot-dog-web/
```

## 可选配置

编辑 `deploy/.env`：

```bash
# 留空时 deploy.sh 会自动使用当前服务器 IP:8000
TARGET_API=
```

部署版默认：

- 保留 `/api -> TARGET_API`
- 图片统一保存到 `data/image`

更多说明见 `deploy/README.md`。

## 停止服务

在 release 目录中执行：

```bash
./stop.sh
```

该脚本只会停止当前 `release/deploy` 这个 Docker Compose 项目的容器，不会影响服务器上的其他容器。
EOF

echo "==> Release artifact ready"
echo "Release directory: $OUTPUT_DIR"
echo "Included files:"
find "$OUTPUT_DIR" -maxdepth 2 -type f | sort
