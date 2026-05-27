# Brandy 自动化部署指南（云服务器 + 1Panel 面板 + GitHub Actions）

本指南介绍如何将本项目（React 前端 + Go 后端 + MongoDB + Redis）部署到你自己的云服务器上。我们不使用 GitHub Pages，而是通过 **1Panel 面板** 管理容器与 Web 服务，并使用 **GitHub Actions** 实现自动打包与持续部署（CI/CD）。

---

## 架构概览

- **前端服务**：React + Vite 打包为静态文件，通过 1Panel 的 **OpenResty (Nginx)** 容器进行静态托管。
- **后端服务**：Go 语言编写，打包为 Docker 容器运行在服务器中，对外暴露 `8181` 端口。
- **辅助服务**：MongoDB（数据库）与 Redis（缓存），作为 Docker 容器运行，仅对后端服务开放。
- **代理路由**：OpenResty 对外网提供服务，通过反向代理将域名或 IP 上的 `/api/*` 请求转发到后端的 `8181` 端口（包括 WebSocket 支持）。

---

## 部署流程步骤

### 第一步：云服务器与 1Panel 的准备工作

1. **安装 OpenResty**：
   - 登录 1Panel 面板，进入 **应用商店**，搜索并安装 **OpenResty**（1Panel 推荐的 Nginx 服务）。

2. **创建静态网站**：
   - 在 1Panel 中，进入 **网站** -> **网站列表** -> **创建网站**。
   - 选择 **静态网站**，输入你的域名（或使用服务器公网 IP，例如 `123.45.67.89`，并指定端口如 `80`）。
   - 记录该网站的 **代码目录**。根据你的配置，此路径为：
     `/opt/1panel/www/sites/brandy.glassous.top/index`
     *(这个路径就是你需要配置到 GitHub Secrets 中的 `FRONTEND_DEPLOY_PATH`)*。

3. **创建后端部署目录**：
   - 在服务器上规划一个文件夹用于存放后端的 `docker-compose` 配置。
   - 结合你的实际配置，在服务器上创建存放目录：`/opt/brandy`。
   - 该目录需要让你的 SSH 登录用户具有写入和执行权限。
   - *(这个路径就是你需要配置到 GitHub Secrets 中的 `BACKEND_DEPLOY_PATH`)*。

4. **配置后端环境变量（安全红线 🚨）**：
   - **本地的 `.env` 配置文件绝对不能上传到 GitHub 公有仓库！**
   - 你需要在服务器上的后端代码目录下手动创建 `.env` 文件。
   - 在服务器中，切换到刚才创建的目录，并新建子目录：
     ```bash
     mkdir -p /opt/brandy/brandybackend
     ```
   - 在 `/opt/brandy/brandybackend/` 下创建一个名为 `.env` 的文件，填入你的生产环境配置（腾讯云 COS 密钥、JWT 密钥等）：
     ```env
     PORT=8081
     MONGO_URI=mongodb://mongo:27017
     MONGO_DB=brandy
     REDIS_ADDR=redis:6379
     REDIS_PASSWORD=
     JWT_SECRET=你自定义的超强随机生产密钥_123!@#
     
     # 腾讯云 COS 配置（根据实际情况填写）
     COS_SECRET_ID=你的腾讯云COS_SecretID
     COS_SECRET_KEY=你的腾讯云COS_SecretKey
     COS_BUCKET=你的存储桶名称
     COS_REGION=你的存储桶地域
     COS_CUSTOM_DOMAIN=你的CDN或COS加速域名
     ```
   - *提示：在本地的 `.gitignore` 中已将 `.env` 排除，GitHub Actions 在执行时绝对不会覆盖或泄露你在服务器上手动创建的这个生产环境 `.env` 文件。*

---

### 第二步：配置 GitHub Secrets

为了让 GitHub Actions 有权限连接服务器并传输构建好的文件，你必须在你的 GitHub 仓库中配置机密变量。

1. 打开 GitHub 仓库页面，点击 **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**。
2. 依次添加以下 6 个机密变量：

| Secret 名称 | 说明 | 示例值 |
| :--- | :--- | :--- |
| `SSH_HOST` | 服务器的公网 IP 地址 | `123.45.67.89` |
| `SSH_USER` | 用于 SSH 登录的用户名 | `root` |
| `SSH_KEY` | 你的 SSH 私钥（通常是 `~/.ssh/id_rsa` 的内容） | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `SSH_PORT` | SSH 服务的端口号（若未修改过，填 22 即可） | `22` |
| `FRONTEND_DEPLOY_PATH` | 1Panel 中创建的静态站点的物理路径 | `/opt/1panel/www/sites/brandy.glassous.top/index` |
| `BACKEND_DEPLOY_PATH` | 后端 Docker 服务在服务器上的存放路径 | `/opt/brandy` |

> [!TIP]
> **如何生成和配置 SSH 密钥对？**
> 如果还没有配置过密钥登录，可以在本地或服务器运行 `ssh-keygen -t rsa -b 4096` 生成一对密钥。
> 将公钥（`.pub`）内容追加到服务器的 `/root/.ssh/authorized_keys` 中，将私钥内容完整粘贴到 GitHub 的 `SSH_KEY` 变量中。

---

### 第三步：配置 OpenResty 反向代理与 WebSocket 支持

由于前后端分离，前端静态网页由 OpenResty (Nginx) 直接托管，而后端运行在 Docker 容器（8181 端口）中。我们需要在 1Panel 的网站配置中，将 `/api/` 路由下的全部请求（包括 WebSocket）反向代理至后端。

1. 打开 1Panel，进入 **网站** -> **网站列表** -> 点击你的网站 -> **配置文件**。
2. 在 `server { ... }` 块内，通常在原有配置后方，添加以下 Nginx 代理规则：

```nginx
# 1. 代理普通的 HTTP API 请求
location /api/ {
    proxy_pass http://127.0.0.1:8181/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # 支持客户端大文件上传（如果是云盘服务，建议调大该值）
    client_max_body_size 500m;
}

# 2. 代理 WebSocket 链接，支持即时通讯
location /api/ws {
    proxy_pass http://127.0.0.1:8181/api/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # 保持 WebSocket 链接不因为超时被 Nginx 中断
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

3. 点击保存并重载 OpenResty 配置。

---

### 第四步：触发自动构建与部署

当你在本地修改代码并推送至公有仓库的 `main` 分支时：
1. **GitHub Actions** 会自动启动执行构建流（在 `.github/workflows/deploy.yml` 中定义）。
2. 在 GitHub 的 **Actions** 标签页下可以实时查看打包和部署的日志。
3. 构建流程会自动：
   - 自动拉取代码并构建 React 生产环境静态文件到 `dist` 目录。
   - 使用 SCP 工具将 `dist` 内容安全地上传至服务器的 `FRONTEND_DEPLOY_PATH`（覆盖原有网页文件）。
   - 将 `docker-compose.yml` 和最新的后端 Go 代码上传至 `BACKEND_DEPLOY_PATH`。
   - 通过 SSH 连接到服务器，进入后端目录，并静默执行 `docker compose up -d --build backend`。此时，后端容器将拉取最新代码并在服务器本地重新打包镜像并无缝重启。

---

## 运维与日志查看

部署完成后，如果遇到接口调用失败或系统故障，可以通过以下方式排查：

1. **查看后端 Gin 容器日志**：
   在服务器终端运行：
   ```bash
   cd /opt/brandy
   docker compose logs -f backend
   ```
   或者直接在 1Panel 的 **容器** -> **容器列表** 中找到 `brandy-backend`，点击 **日志** 即可在线查看。

2. **MongoDB / Redis 日志查看**：
   在服务器终端运行：
   ```bash
   docker compose logs -f mongo
   docker compose logs -f redis
   ```

3. **Nginx/OpenResty 错误日志**：
   在 1Panel 网站管理后台的 **日志** 板块中查看访问日志与错误日志。
