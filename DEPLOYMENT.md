# SoNovel Docker 部署指南

本项目已 Docker 化，可以通过 Docker 容器运行 SoNovel 应用程序，并通过 Web UI 访问。

## 文件结构

- `Dockerfile` - Docker 构建文件
- `docker-compose.yml` - Docker Compose 配置文件
- `config.ini` - 应用程序配置文件（已启用 Web 服务）
- `app.jar` - 应用程序 JAR 文件
- `rules/` - 规则文件目录
- `downloads/` - 下载目录（Docker 容器中会自动创建）

## 快速开始

### 使用 Docker Compose（推荐）

1. 确保已安装 Docker 和 Docker Compose
2. 在项目根目录运行：
   ```bash
   docker-compose up -d
   ```
3. 访问 Web UI：http://localhost:7765

### 使用 Docker 命令

1. 构建 Docker 镜像：
   ```bash
   docker build -t sonovel-webui .
   ```

2. 运行容器：
   ```bash
   docker run -d \
     -p 7765:7765 \
     -v $(pwd)/config.ini:/app/config.ini \
     -v $(pwd)/rules:/app/rules \
     -v $(pwd)/downloads:/app/downloads \
     --name sonovel \
     sonovel-webui
   ```

3. 访问 Web UI：http://localhost:7765

## 配置说明

### Web 服务配置

在 `config.ini` 文件中，Web 服务已默认启用：
```ini
[web]
# 是否开启 Web 服务 (1 是，0 否)
enabled = 1
# Web 服务端口
port = 7765
```

### 数据持久化

Docker 容器使用以下卷挂载来持久化数据：

1. `config.ini` - 配置文件（可在主机上修改）
2. `rules/` - 规则目录（可在主机上更新规则）
3. `downloads/` - 下载目录（下载的书籍会保存在这里）

### 环境变量

可以通过环境变量覆盖默认配置：

- `CONFIG_FILE` - 配置文件路径（默认：`/app/config.ini`）
- `MODE` - 运行模式（默认：`web`）

## 管理容器

### 查看日志
```bash
docker logs sonovel
```

### 停止容器
```bash
docker stop sonovel
```

### 启动容器
```bash
docker start sonovel
```

### 重启容器
```bash
docker restart sonovel
```

### 删除容器
```bash
docker rm -f sonovel
```

## 使用 Docker Compose 管理

### 启动服务
```bash
docker-compose up -d
```

### 查看服务状态
```bash
docker-compose ps
```

### 查看日志
```bash
docker-compose logs -f
```

### 停止服务
```bash
docker-compose down
```

### 重新构建并启动
```bash
docker-compose up -d --build
```

## 故障排除

### 端口冲突
如果端口 7765 已被占用，可以修改 `config.ini` 中的端口号，并更新 `docker-compose.yml` 中的端口映射。

### 权限问题
确保 `downloads/` 目录对 Docker 容器可写：
```bash
mkdir -p downloads
chmod 777 downloads
```

### 容器无法启动
检查日志以获取详细信息：
```bash
docker logs sonovel
```

## 更新应用程序

1. 下载新的 `app.jar` 文件
2. 重新构建 Docker 镜像：
   ```bash
   docker-compose build --no-cache
   ```
3. 重启服务：
   ```bash
   docker-compose up -d
   ```

## 安全注意事项

1. 默认配置中 Web 服务监听所有网络接口，请在生产环境中考虑防火墙配置
2. 考虑使用反向代理（如 Nginx）添加 HTTPS 支持
3. 定期备份 `downloads/` 目录中的重要数据

## 支持与反馈

如有问题，请参考：
- 项目 GitHub：https://github.com/freeok/so-novel
- 问题反馈：https://github.com/freeok/so-novel/issues
