docker tag visual-app-backend:latest registry.cn-hangzhou.aliyuncs.com/zjyp/java-app:visual-app-backend
docker push registry.cn-hangzhou.aliyuncs.com/zjyp/java-app:visual-app-backend

# -----------------------------------------------------------------------------
# 处理 Nginx 镜像 (搬运官方镜像到私有仓库，解决服务器无法拉取 DockerHub 的问题)
# -----------------------------------------------------------------------------
echo "Processing Nginx image..."
# 1. 拉取（确保本地有）
docker pull nginx:alpine
# 2. 打标签为阿里云镜像
docker tag nginx:alpine registry.cn-hangzhou.aliyuncs.com/zjyp/java-app:nginx-alpine
# 3. 推送
docker push registry.cn-hangzhou.aliyuncs.com/zjyp/java-app:nginx-alpine

echo "All images pushed successfully!"