# Brandy - 现代化即时通讯与云盘应用

Brandy 是一个全栈即时通讯应用，集成了实时聊天、文件云盘、好友管理等功能。采用 React + Go 技术栈，支持单聊、群聊、文件分享、表情包管理等特性。

## 功能特性

### 即时通讯
- **单聊与群聊**：支持一对一私聊和多人群组聊天
- **实时消息**：基于 WebSocket 的实时消息推送
- **消息管理**：消息撤回、编辑、搜索功能
- **消息类型**：文本、图片、文件、表情包等多种消息类型
- **聊天置顶与隐藏**：灵活的会话管理

### 好友系统
- **好友请求**：发送、接受、拒绝好友请求
- **好友备注**：自定义好友备注名
- **用户搜索**：通过用户名搜索添加好友
- **好友管理**：删除好友、查看好友列表

### 云盘功能
- **文件管理**：创建文件夹、上传、下载、删除文件
- **文件操作**：移动、复制、重命名文件和文件夹
- **文件分享**：好友间文件分享、链接分享
- **离线下载**：支持 URL 离线下载到云盘
- **回收站**：文件删除后可恢复，支持清空回收站
- **存储统计**：查看个人存储使用情况

### 群组管理
- **群组创建**：创建群聊并邀请好友
- **群组设置**：修改群名、群公告
- **成员管理**：添加/移除成员、设置管理员
- **群组权限**：全员禁言、单个成员禁言
- **AI 成员**：支持添加 AI 机器人到群组
- **操作日志**：群组操作审计日志

### 用户系统
- **多种登录方式**：密码登录、验证码登录、二维码登录
- **个人资料**：修改昵称、头像、个性签名
- **账号安全**：修改密码、密码重置
- **主题设置**：深色/浅色模式切换、自定义主题色

### 其他功能
- **表情包管理**：收藏、管理自定义表情包
- **小游戏**：内置小游戏功能（如五子棋）
- **管理后台**：用户管理、群组管理、系统统计、版本管理
- **Android 版本管理**：应用版本发布与更新

## 技术栈

### 前端
- **框架**：React 19 + TypeScript
- **构建工具**：Vite 8
- **路由**：React Router v7
- **UI 组件**：Lucide React 图标库
- **Markdown**：Marked + Prism.js 代码高亮
- **文件上传**：腾讯云 COS JS SDK
- **二维码**：qrcode.react
- **表情选择**：emoji-picker-react

### 后端
- **语言**：Go 1.22
- **Web 框架**：Gin
- **数据库**：MongoDB
- **缓存**：Redis
- **实时通信**：gorilla/websocket
- **认证**：JWT (golang-jwt)
- **对象存储**：腾讯云 COS SDK
- **密码加密**：bcrypt

### 部署与运维
- **容器化**：Docker + Docker Compose
- **反向代理**：OpenResty (Nginx)
- **CI/CD**：GitHub Actions
- **面板管理**：1Panel

## 项目结构

```
brandy/
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   │   ├── Auth/          # 认证相关组件
│   │   ├── Chat/          # 聊天相关组件
│   │   ├── Layout/        # 布局组件
│   │   └── shared/        # 共享组件
│   ├── contexts/          # React Context
│   ├── pages/             # 页面组件
│   ├── utils/             # 工具函数
│   └── config.ts          # 配置文件
├── brandybackend/         # 后端源码
│   ├── db/                # 数据库连接
│   ├── handlers/          # HTTP 处理器
│   ├── middleware/         # 中间件
│   ├── models/            # 数据模型
│   └── utils/             # 工具函数
├── docker-compose.yml     # Docker Compose 配置
├── DEPLOYMENT.md          # 详细部署指南
└── README.md              # 项目说明
```

## 快速开始

### 环境要求

- Node.js 18+
- Go 1.22+
- MongoDB 6.0+
- Redis 7.0+
- 腾讯云 COS 账号（用于文件存储）

### 本地开发

#### 1. 克隆项目

```bash
git clone https://github.com/your-username/brandy.git
cd brandy
```

#### 2. 配置后端环境变量

```bash
cd brandybackend
cp .env.example .env
# 编辑 .env 文件，填入你的配置
```

环境变量说明：

```env
PORT=8081
MONGO_URI=mongodb://localhost:27017
MONGO_DB=brandy
REDIS_ADDR=localhost:6379
REDIS_PASSWORD=
JWT_SECRET=your_jwt_secret_key

# 腾讯云 COS 配置
COS_SECRET_ID=your_cos_secret_id
COS_SECRET_KEY=your_cos_secret_key
COS_BUCKET=your_bucket_name
COS_REGION=your_bucket_region
COS_CUSTOM_DOMAIN=your_custom_domain
```

#### 3. 启动后端服务

```bash
cd brandybackend
go mod tidy
go run main.go
```

后端服务将在 `http://localhost:8081` 启动。

#### 4. 配置并启动前端

```bash
# 返回项目根目录
cd ..
npm install
npm run dev
```

前端开发服务器将在 `http://localhost:5173` 启动。

#### 5. 访问应用

打开浏览器访问 `http://localhost:5173`，注册新账号或登录。

## 部署方式

### 方式一：Docker Compose 部署（推荐）

#### 1. 准备配置文件

确保项目根目录有以下文件：
- `docker-compose.yml`
- `brandybackend/Dockerfile`
- `brandybackend/.env`（生产环境配置）

#### 2. 配置环境变量

在 `brandybackend/.env` 中配置生产环境参数：

```env
PORT=8081
MONGO_URI=mongodb://mongo:27017
MONGO_DB=brandy
REDIS_ADDR=redis:6379
REDIS_PASSWORD=
JWT_SECRET=your_strong_production_secret

COS_SECRET_ID=your_cos_secret_id
COS_SECRET_KEY=your_cos_secret_key
COS_BUCKET=your_bucket_name
COS_REGION=your_bucket_region
COS_CUSTOM_DOMAIN=your_custom_domain
```

#### 3. 启动服务

```bash
docker compose up -d
```

这将启动以下服务：
- MongoDB（端口 27018）
- Redis（端口 6380）
- Brandy 后端（端口 8181）

#### 4. 配置反向代理

使用 Nginx 或 OpenResty 配置反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/your/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:8181/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 500m;
    }

    # WebSocket 代理
    location /api/ws {
        proxy_pass http://127.0.0.1:8181/api/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

#### 5. 构建并部署前端

```bash
npm run build
# 将 dist 目录内容复制到 Nginx 静态文件目录
```

### 方式二：GitHub Actions 自动部署

项目配置了 GitHub Actions 实现 CI/CD，推送到 `main` 分支自动部署。

#### 1. 配置 GitHub Secrets

在 GitHub 仓库设置中添加以下 Secrets：

| Secret 名称 | 说明 |
|-------------|------|
| `SSH_HOST` | 服务器公网 IP |
| `SSH_USER` | SSH 登录用户名 |
| `SSH_KEY` | SSH 私钥内容 |
| `SSH_PORT` | SSH 端口（默认 22） |
| `FRONTEND_DEPLOY_PATH` | 前端部署路径 |
| `BACKEND_DEPLOY_PATH` | 后端部署路径 |

#### 2. 服务器准备

```bash
# 创建部署目录
sudo mkdir -p /opt/brandy
sudo chown -R $USER:$USER /opt/brandy

# 创建后端环境变量文件
mkdir -p /opt/brandy/brandybackend
# 在 /opt/brandy/brandybackend/.env 中配置生产环境变量
```

#### 3. 自动部署流程

推送代码到 `main` 分支后，GitHub Actions 会自动：
1. 构建前端静态文件
2. 上传前端文件到服务器
3. 上传后端代码和 Docker Compose 配置
4. 通过 SSH 执行 `docker compose up -d --build backend`

详细部署指南请参考 [DEPLOYMENT.md](./DEPLOYMENT.md)

## API 概览

### 认证相关
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 密码登录
- `POST /api/auth/send-code` - 发送验证码
- `POST /api/auth/login-code` - 验证码登录
- `POST /api/auth/reset-password` - 重置密码
- `POST /api/auth/qr/uuid` - 获取二维码 UUID
- `GET /api/auth/qr/status` - 查询二维码状态

### 用户相关
- `GET /api/user/profile` - 获取个人信息
- `PUT /api/user/profile` - 更新个人信息
- `POST /api/user/change-password` - 修改密码
- `POST /api/user/avatar` - 上传头像
- `GET /api/users/search` - 搜索用户

### 好友相关
- `GET /api/friends` - 获取好友列表
- `POST /api/friends/request` - 发送好友请求
- `GET /api/friends/requests` - 获取好友请求列表
- `PUT /api/friends/requests/:id` - 处理好友请求
- `DELETE /api/friends/:id` - 删除好友

### 聊天相关
- `GET /api/chats` - 获取聊天列表
- `GET /api/chats/:friend_id/messages` - 获取聊天记录
- `POST /api/chats/messages/:id/recall` - 撤回消息
- `PUT /api/chats/messages/:id/edit` - 编辑消息
- `GET /api/chats/search` - 搜索消息

### 群组相关
- `POST /api/groups` - 创建群组
- `GET /api/groups` - 获取群组列表
- `GET /api/groups/:group_id` - 获取群组详情
- `PUT /api/groups/:group_id` - 更新群组信息
- `POST /api/groups/:group_id/members` - 添加成员
- `DELETE /api/groups/:group_id/members/:user_id` - 移除成员

### 云盘相关
- `GET /api/disk/items` - 获取文件列表
- `GET /api/disk/usage` - 获取存储使用情况
- `POST /api/disk/folders` - 创建文件夹
- `POST /api/disk/upload-credential` - 获取上传凭证
- `POST /api/disk/upload-complete` - 完成上传
- `PUT /api/disk/items/:id` - 重命名文件
- `DELETE /api/disk/items/:id` - 删除文件
- `POST /api/disk/share/friend` - 分享给好友
- `POST /api/disk/transfer` - 转存文件

### WebSocket
- `GET /api/ws` - WebSocket 连接端点

## 运维管理

### 查看日志

```bash
# 查看后端日志
docker compose logs -f backend

# 查看 MongoDB 日志
docker compose logs -f mongo

# 查看 Redis 日志
docker compose logs -f redis
```

### 数据备份

```bash
# 备份 MongoDB
docker compose exec mongo mongodump --out /data/backup

# 备份 Redis
docker compose exec redis redis-cli BGSAVE
```

### 服务管理

```bash
# 启动服务
docker compose up -d

# 停止服务
docker compose down

# 重启服务
docker compose restart

# 重新构建并启动
docker compose up -d --build
```

## 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 联系方式

如有问题或建议，请通过以下方式联系：
- 提交 Issue
- 发送邮件至 [your-email@example.com]

## 致谢

感谢以下开源项目：
- [React](https://react.dev/)
- [Gin](https://gin-gonic.com/)
- [MongoDB](https://www.mongodb.com/)
- [Redis](https://redis.io/)
- [Vite](https://vitejs.dev/)
- [Lucide Icons](https://lucide.dev/)
