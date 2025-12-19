# SoNovel - 小说下载工具

一个功能强大的小说下载工具，支持多种书源和部署方式。

## 快速开始

### Windows 用户
```bash
sonovel.exe
```

### macOS 用户
```bash
./run-macos.sh
```

### Linux 用户
```bash
./run-linux.sh
```

## 使用说明

- 为获得最佳使用体验，请将终端窗口最大化
- `config.ini` 是配置文件，每个配置项有对应的注释，修改保存后需重启应用
- 如果认为下载速度较慢，适当减小爬取间隔可能有助于提高速度
- 设置过小的爬取间隔会导致部分书源封禁 IP，从而无法使用
- 如果书名搜不到，就用作者名称搜，反之亦然

## WebUI 模式

1. 在 `config.ini` 中开启 Web 服务
2. 浏览器访问 `localhost:7765`

## Docker 部署（推荐）

### 使用 Docker Compose（最简单）
```bash
docker-compose up -d
```

### 使用 Docker 命令
```bash
docker build -t sonovel-webui .
docker run -d -p 7765:7765 \
  -v $(pwd)/config.ini:/app/config.ini \
  -v $(pwd)/rules:/app/rules \
  -v $(pwd)/downloads:/app/downloads \
  --name sonovel sonovel-webui
```

详细部署说明请查看 [DEPLOYMENT.md](DEPLOYMENT.md) 文件。

## CLI 模式

### Windows
```bash
.\sonovel.exe -h
```

### Linux
```bash
./runtime/bin/java -jar app.jar -h
```

### macOS
```bash
./runtime/Contents/Home/bin/java -jar app.jar -h
```

## 问题反馈

- 使用问题或功能建议：[Issues](https://github.com/freeok/so-novel/issues/new/choose)
- 其他讨论：[Discussions](https://github.com/so-novel/discussions/new/choose)

提交反馈前请先查看：
- [常见问题](https://github.com/freeok/so-novel/issues?q=label%3A%22usage%20question%22)
- [讨论区](https://github.com/freeok/so-novel/discussions?discussions_q=)

## 相关链接

- [下载地址](https://github.com/freeok/so-novel/releases)
- [书源一览](https://github.com/freeok/so-novel/blob/main/BOOK_SOURCES.md)