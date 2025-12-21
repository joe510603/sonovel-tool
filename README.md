# SoNovel + NovelCraft - 网文拆书学习工具套件

一套完整的网络小说学习工具，包含小说下载服务和 Obsidian 智能分析插件。

> SoNovel 基于 [freeok/so-novel](https://github.com/freeok/so-novel) 修改

## 📦 项目组成

| 组件 | 说明 |
|------|------|
| **SoNovel** | 小说搜索下载服务，支持多书源 |
| **NovelCraft** | Obsidian 插件，AI 驱动的小说分析工具 |

## ✨ 功能特点

### SoNovel 下载服务
- 多书源搜索和下载
- WebUI 和 CLI 两种模式
- Docker 一键部署
- 自定义书源规则

### NovelCraft 分析插件
- 多格式支持：EPUB、TXT、DOCX、PDF
- AI 智能分析：人物、情节、写作技法
- 流式对话追问
- 结构化笔记生成
- Token 消耗追踪

## 🚀 快速开始

### 1. 启动 SoNovel 服务

**Docker 部署（推荐）**
```bash
docker-compose up -d
# 访问 http://localhost:7765
```

**本地运行**
```bash
# macOS
./run-macos.sh

# Windows
sonovel.exe
```

### 2. 安装 NovelCraft 插件

```bash
cd novel-craft
npm install
npm run build
```

将 `novel-craft` 文件夹复制到 Obsidian 插件目录：
```
<vault>/.obsidian/plugins/novel-craft/
```

### 3. 配置插件

1. 在 Obsidian 设置中启用 NovelCraft
2. 配置 LLM 服务（OpenAI/Claude/DeepSeek 等）
3. 配置 SoNovel 服务地址（默认 `http://localhost:7765`）

## 📖 使用流程

```
搜索小说 → 下载 EPUB → 导入 Obsidian → AI 分析 → 生成笔记 → 追问对话
```

1. 在 NovelCraft 主面板搜索小说
2. 下载到 Vault
3. 选择分析模式和章节范围
4. 查看生成的分析笔记
5. 通过对话深入探讨

## 📁 目录结构

```
├── app.jar              # SoNovel 服务
├── config.ini           # SoNovel 配置
├── rules/               # 书源规则
├── downloads/           # 下载目录
├── novel-craft/         # Obsidian 插件
│   ├── main.ts          # 插件入口
│   ├── src/             # 源代码
│   └── styles.css       # 样式
├── Dockerfile           # Docker 构建
└── docker-compose.yml   # Docker Compose
```

## ⚙️ 配置说明

### SoNovel 配置 (config.ini)
```ini
[web]
enabled = 1
port = 7765

[download]
path = downloads
interval = 500
```

### NovelCraft LLM 配置
| 服务商 | API 地址 |
|--------|----------|
| OpenAI | `https://api.openai.com/v1` |
| Claude | `https://api.anthropic.com` |
| DeepSeek | `https://api.deepseek.com` |

## 🐳 Docker 部署

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

详细部署说明：[DEPLOYMENT.md](DEPLOYMENT.md)

## 📚 文档

- [NovelCraft 插件详细文档](novel-craft/README.md)
- [部署指南](DEPLOYMENT.md)
- [项目说明](PROJECT_README.md)

## 📄 许可证

MIT License

## 🙏 致谢

- [freeok/so-novel](https://github.com/freeok/so-novel) - 原版小说下载工具
- [Obsidian](https://obsidian.md/) - 知识管理工具
