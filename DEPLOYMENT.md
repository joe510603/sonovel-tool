# SoNovel Docker 部署指南

本项目已 Docker 化，可以通过 Docker 容器运行 SoNovel 应用程序。

## 📁 文件结构

```
├── Dockerfile           # Docker 构建文件
├── docker-compose.yml   # Docker Compose 配置
├── nginx.conf           # Nginx 反向代理配置
├── config.ini           # 应用程序配置
├── app.jar              # 应用程序 JAR 文件
├── rules/               # 书源规则目录
└── downloads/           # 下载目录
```

## 🚀 快速开始

### 使用 Docker Compose（推荐）

```bash
# 启动服务
docker-compose up -d

# 访问 WebUI
open http://localhost:7765
```

### 使用 Docker 命令

```bash
# 构建镜像
docker build -t sonovel-webui .

# 运行容器
docker run -d \
  -p 7765:7765 \
  -v $(pwd)/config.ini:/app/config.ini \
  -v $(pwd)/rules:/app/rules \
  -v $(pwd)/downloads:/app/downloads \
  --name sonovel \
  sonovel-webui
```

## ⚙️ 配置说明

### Web 服务配置

`config.ini` 中的 Web 服务配置：

```ini
[web]
enabled = 1      # 开启 Web 服务
port = 7765      # 服务端口
```

### 数据持久化

Docker 容器使用以下卷挂载：

| 路径 | 说明 |
|------|------|
| `config.ini` | 配置文件 |
| `rules/` | 书源规则目录 |
| `downloads/` | 下载文件目录 |

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CONFIG_FILE` | `/app/config.ini` | 配置文件路径 |
| `MODE` | `web` | 运行模式 |

## 🔧 容器管理

### Docker Compose 命令

```bash
# 启动服务
docker-compose up -d

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重新构建
docker-compose up -d --build
```

### Docker 命令

```bash
# 查看日志
docker logs sonovel

# 停止容器
docker stop sonovel

# 启动容器
docker start sonovel

# 重启容器
docker restart sonovel

# 删除容器
docker rm -f sonovel
```

## 🔄 更新应用

1. 下载新的 `app.jar` 文件
2. 重新构建镜像：
   ```bash
   docker-compose build --no-cache
   ```
3. 重启服务：
   ```bash
   docker-compose up -d
   ```

## ❗ 故障排除

### 端口冲突

修改 `config.ini` 中的端口号，并更新 `docker-compose.yml` 中的端口映射。

### 权限问题

确保 `downloads/` 目录可写：
```bash
mkdir -p downloads
chmod 777 downloads
```

### 容器无法启动

检查日志：
```bash
docker logs sonovel
```

## 🔒 安全建议

1. 生产环境中配置防火墙
2. 使用反向代理添加 HTTPS 支持
3. 定期备份 `downloads/` 目录

## 📮 支持

- 项目 GitHub：https://github.com/freeok/so-novel
- 问题反馈：https://github.com/freeok/so-novel/issues
