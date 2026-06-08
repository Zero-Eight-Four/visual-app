#!/bin/bash

set -e

# 1. Build Frontend
echo "Building Frontend..."
npm install
npm run build

# 2. Build Backend Docker Image
echo "Building Backend Docker Image..."
sudo docker build -t visual-app-backend .

# 3. Stop and Remove Existing Container
echo "Stopping existing container..."
sudo docker stop visual-backend || true
sudo docker rm visual-backend || true

# 4. Run New Container
echo "Starting new container..."

# OSS 挂载目录 (由 setup_oss.sh 创建)
# 注意：根据配置 fileDir: visitor，我们将挂载点下的 visitor 目录映射到容器
OSS_MOUNT_ROOT="/mnt/oss"
OSS_SUB_DIR="visitor"
OSS_PATH="${OSS_MOUNT_ROOT}/${OSS_SUB_DIR}"

# 检查挂载点是否存在
if [ ! -d "$OSS_MOUNT_ROOT" ] || [ -z "$(ls -A $OSS_MOUNT_ROOT 2>/dev/null)" ]; then
    echo "警告: OSS 挂载点 $OSS_MOUNT_ROOT 似乎为空或未挂载。"
    echo "请先运行 ./setup_oss.sh 进行挂载，或者按 Ctrl+C 取消并手动检查。"
    echo "将在 5 秒后继续..."
    sleep 5
fi

# 确保子目录存在
echo "Creating directories in OSS..."
sudo mkdir -p "${OSS_PATH}/maps" "${OSS_PATH}/image" "${OSS_PATH}/videos"

sudo docker run -d \
  --name visual-backend \
  --restart always \
  -p 3000:3000 \
  -v $(pwd)/maps:/app/maps \
  -v $(pwd)/image:/app/image \
  -v $(pwd)/videos:/app/videos \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/temp:/app/temp \
  visual-app-backend

echo "Deployment Complete!"
echo "Frontend files are in: $(pwd)/dist"
echo "Backend is running on port 3000"

echo "Running post-deploy checks..."

check_url() {
  local url="$1"
  local expected_csv="$2"
  local retries="${3:-1}"
  local wait_seconds="${4:-1}"
  local response_code
  local attempt

  for ((attempt = 1; attempt <= retries; attempt++)); do
    response_code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 8 "$url" 2>/dev/null || true)
    # 失败场景统一归一为 000，避免出现 000000 这类拼接结果
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

if [ -f "$(pwd)/dist/index.html" ]; then
  echo "[OK] Frontend artifact exists: $(pwd)/dist/index.html"
else
  echo "[WARN] Frontend artifact missing: $(pwd)/dist/index.html"
fi

# 后端容器刚启动时可能需要几秒完成初始化
check_url "http://127.0.0.1:3000/" "200,301,302" 8 2
check_url "http://127.0.0.1/" "200,301,302" 3 1
check_url "http://127.0.0.1/robot-dog-web/" "200" 3 1

if ss -lnt | grep -q ':443 '; then
  check_url "https://127.0.0.1/robot-dog-web/" "200,301,302" 3 1
else
  echo "[INFO] 443 is not listening yet. Run ./setup_https.sh to enable HTTPS."
fi

echo "Post-deploy checks completed."
