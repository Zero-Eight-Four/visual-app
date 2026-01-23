# 部署说明

此目录包含用于在其他服务器上部署 visual-app 的配置文件。

## 前置要求

- 服务器已安装 Docker 和 Docker Compose。
- 服务器可以访问阿里云镜像仓库 `registry.cn-hangzhou.aliyuncs.com`。

## 部署步骤

1. 将 `deploy` 目录上传到目标服务器。
2. 进入目录：
   ```bash
   cd deploy
   ```
3. 启动服务：
   ```bash
   # 新版 Docker 使用 docker compose (中间有空格)
   docker compose up -d
   
   # 如果报错命令不存在，且安装的是旧版，尝试:
   # docker-compose up -d
   ```
4. **访问服务**：
   打开浏览器访问：`http://服务器IP:8080`
## 目录结构说明

启动后，会在当前目录下生成 `data/` 目录，用于存放持久化数据：

- `data/maps`: 地图数据
- `data/image`: 图片数据
- `data/videos`: 视频数据
- `data/temp`: 临时文件

配置文件默认存储在 Docker 卷 `app_config` 中。如果需要修改配置（如 rocketmq 或 schedules），可以使用以下命令将配置文件复制出来：

```bash
# 将配置文件从容器复制到当前目录的 config 文件夹
docker cp $(docker compose ps -q backend):/app/config ./config

# 修改 docker-compose.yml，将 volume 部分改为 bind mount：
# - ./config:/app/config
```

## 更新部署

如果发布了新的镜像版本：

```bash
docker compose pull
docker compose up -d
```

## 故障排查

### 1. 更新镜像

如果需要更新 Nginx 或 后端服务，请先在本地运行 `./push.sh` 推送最新镜像，然后在服务器运行：

```bash
docker compose pull
docker compose up -d
```
