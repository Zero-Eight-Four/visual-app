# visual-app 新服务器部署说明

此目录用于把网页部署到一台新服务器。部署方式是：

- 前端：静态文件已打入后端镜像，由后端容器直接提供访问。
- 后端：Node.js Docker 容器，负责地图、图片、视频、定时任务、通知、AI 代理等接口。
- 对外访问端口：默认 `18080`；如果 `18080` 已被占用，一键脚本会自动尝试 `18081`、`18082` 继续向后查找可用端口。
- 部署版网页左上角和标签页使用真实 `public/logo.png`、`public/favicon.png`；本机 `rebuild.sh` 默认使用 `public/logo-placeholder.png`、`public/favicon-placeholder.png` 占位图。

## 前置要求

- 推荐使用 root 用户运行 `deploy.sh`，或确保当前用户具备 `sudo` 权限。
- `deploy.sh` 会自动检测 Docker 和 Docker Compose；如果缺少，会在 Debian/Ubuntu/CentOS/RHEL/Alibaba 系系统上尝试使用国内源安装。
- 如果自动安装失败，需要手动安装 Docker 和 Docker Compose 后重新执行 `deploy.sh`。
- 服务器安全组/防火墙已放行网页端口，默认 `18080`；如果脚本自动切换到了其他端口，需要放行脚本最终输出的端口。

## 发布者准备

交给别人部署前，维护者需要先构建前端静态文件、构建后端镜像，然后导出成 tar 包。前端静态文件会打进后端镜像，由后端容器直接提供访问。目标服务器不需要从任何业务镜像仓库 pull，也不会 push 到任何仓库。

在项目根目录执行：

```bash
npm install
VITE_ENABLE_DUAL_AI=false npm run build
docker build --build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:24.11.1-alpine -t visual-app-backend .
docker save visual-app-backend:latest -o visual-app-backend.tar
```

也可以直接执行项目根目录的脚本，它会完成前端构建、后端镜像构建和 tar 包导出：

```bash
./package_release.sh
```

生成文件：

```text
release/
├── visual-app-backend.tar
├── deploy.sh
├── 部署说明.md
└── deploy/
    ├── docker-compose.yml
    ├── .env.example
    └── README.md
```

## 一键部署步骤

1. 将整个 `release/` 目录上传到目标服务器。
2. 进入 `release/` 目录，运行部署脚本：
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```
   脚本会自动检测/安装 Docker 环境、加载后端镜像、创建 `.env`，默认把 `TARGET_API` 设置为当前服务器 IP 的 `8000` 端口，检测网页端口是否被占用，并启动服务。
   部署完成后会输出访问地址。如果服务器有公网 IP，但脚本输出的是内网 IP，请使用公网 IP 替换地址中的 IP 部分。
3. 打开浏览器访问脚本最终输出的地址，例如：
   ```text
   http://服务器IP:18080
   ```

系统会自动跳转到：

```text
http://服务器IP:18080/robot-dog-web/
```

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

如果发布了新的部署包：

```bash
./deploy.sh
```

## 停止服务

在 `release/` 目录中执行：

```bash
./stop.sh
```

该脚本只会进入当前包的 `deploy/` 目录执行 Docker Compose 停止操作，因此只影响当前网页项目的容器，不会停止服务器上的其他容器。

## 故障排查

### 1. 查看服务是否启动

```bash
docker compose ps
```

正常情况下应看到 `backend` 是 `Up`。

### 2. 查看日志

```bash
docker compose logs -f backend
```

### 旧版 docker-compose 报 `ContainerConfig`

部分服务器上的 `docker-compose 1.29.2` 在重建旧容器时可能报 `KeyError: 'ContainerConfig'`。一键部署脚本会先执行 `down --remove-orphans` 清理旧容器，再重新启动。手动部署时可以执行：

```bash
cd deploy
docker-compose down --remove-orphans
docker-compose up -d
```

### 3. 页面打不开

检查三件事：

- 服务器安全组是否放行网页端口，默认 `18080`。
- 如果部署脚本提示改用了 `18081` 等端口，安全组也要放行那个最终端口。
- 容器是否启动：`docker compose ps`。
- 是否访问了正确地址：`http://服务器IP:18080/robot-dog-web/`。

### 4. 页面能打开，但接口失败

检查 `.env` 里的地址是否正确：

```bash
cat .env
```

然后重启：

```bash
docker compose up -d
```

### 5. 代理路径说明

当前访问关系：

- `/robot-dog-web/`：前端静态页面，由后端容器提供。
- `/api`：后端容器转发到 `TARGET_API`。
- `/maps`、`/images`：后端容器提供静态资源服务。
- 机器狗文件服务走 `/api/robot-files`，由后端中转；`8080` 保留给机器狗文件服务/内网穿透，网页默认使用 `18080`。
