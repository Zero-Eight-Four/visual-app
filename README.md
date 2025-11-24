# ROS Visualization Web

基于 Vue 3 + TypeScript + Three.js 的 ROS 可视化工具，参考 Lichtblick 架构设计。

## 功能特性

- ✅ **3D 场景渲染**: 使用 Three.js 实现 3D 场景可视化
- ✅ **状态信息显示**: 实时显示 ROS 连接状态和话题信息
- ✅ **图像显示**: 订阅并显示 ROS 图像话题
- ✅ **话题发布**: 支持向 ROS 发布自定义消息
- ✅ **模块化设计**: 前后端分离，便于维护和扩展

## 技术栈

- **前端框架**: Vue 3 + TypeScript
- **UI 组件库**: Element Plus
- **3D 渲染**: Three.js
- **状态管理**: Pinia
- **路由**: Vue Router
- **构建工具**: Vite
- **ROS 通信**: roslib.js

## 项目结构

```
web/
├── src/
│   ├── components/          # Vue 组件
│   │   ├── ConnectionStatus.vue    # 连接状态组件
│   │   ├── TopicSelector.vue       # 话题选择器
│   │   ├── ThreeDViewer.vue        # 3D 场景查看器
│   │   ├── ImageViewer.vue         # 图像显示组件
│   │   ├── StateInfo.vue           # 状态信息组件
│   │   └── TopicPublisher.vue      # 话题发布组件
│   ├── views/               # 页面视图
│   │   └── MainLayout.vue          # 主布局页面
│   ├── services/            # 服务层(模块化后端逻辑)
│   │   └── rosConnection.ts        # ROS连接管理
│   ├── stores/              # Pinia 状态管理
│   │   └── ros.ts                  # ROS 状态 store
│   ├── types/               # TypeScript 类型定义
│   │   └── ros.ts                  # ROS 相关类型
│   ├── router/              # 路由配置
│   │   └── index.ts
│   ├── App.vue              # 根组件
│   └── main.ts              # 应用入口
├── maps/                    # 地图资源
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 快速开始

### 前置要求

- Node.js >= 20
- ROS 环境 (ROS1 或 ROS2)
- rosbridge_server

### 安装依赖

```bash
cd web
npm install
# 或使用 yarn
yarn install
```

### 启动 ROS Bridge Server

```bash
# ROS1
roslaunch rosbridge_server rosbridge_websocket.launch

# ROS2
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

### 运行开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

### 构建生产版本

```bash
npm run build
```

构建产物将生成在 `dist` 目录。

## 使用说明

### 连接到 ROS

1. 确保 rosbridge_server 已启动
2. 点击左上角的"连接"按钮
3. 默认连接地址为 `ws://localhost:9090`

### 3D 场景查看

- 使用鼠标左键旋转视角
- 使用鼠标右键平移视角
- 使用滚轮缩放
- 点击"重置视角"恢复默认视角

### 图像显示

1. 从下拉菜单选择图像话题
2. 支持 `sensor_msgs/Image` 和 `sensor_msgs/CompressedImage` 类型

### 话题发布

1. 输入话题名称 (如 `/example_topic`)
2. 输入消息类型 (如 `std_msgs/String`)
3. 输入 JSON 格式的消息内容
4. 点击"发布消息"按钮

## 架构设计

### 模块化设计

项目采用模块化设计，主要分为以下几个层次:

1. **表示层 (Presentation Layer)**: Vue 组件负责 UI 展示
2. **业务逻辑层 (Business Logic Layer)**: Services 目录下的模块处理具体业务逻辑
3. **数据层 (Data Layer)**: Pinia stores 管理应用状态
4. **通信层 (Communication Layer)**: rosConnection 模块封装 ROS 通信

### 核心模块

#### ROS 连接模块 (`services/rosConnection.ts`)

- 单例模式管理 WebSocket 连接
- 提供话题订阅/取消订阅接口
- 提供话题发布接口
- 提供服务调用接口
- 支持连接状态监听

#### 状态管理 (`stores/ros.ts`)

- 管理连接状态
- 管理话题列表
- 提供计算属性和 actions

#### 类型系统 (`types/ros.ts`)

- 完整的 TypeScript 类型定义
- 确保类型安全

## 参考项目

本项目参考了 [Lichtblick](https://github.com/lichtblick-suite/lichtblick) 的架构设计和交互逻辑，使用 Vue 技术栈重新实现。

## 开发计划

- [ ] 添加更多 3D 可视化元素 (TF、Marker、点云等)
- [ ] 支持多种图像格式
- [ ] 添加录制和回放功能
- [ ] 支持自定义面板布局
- [ ] 添加更多 ROS 消息类型支持

## 许可证

MIT License
