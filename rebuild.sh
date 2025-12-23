#!/bin/bash

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
