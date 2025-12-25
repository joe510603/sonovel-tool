#!/bin/bash

# SoNovel Docker 启动脚本
# 使用方法: ./start-docker.sh [start|stop|restart|status|logs]

set -e

CONTAINER_NAME="sonovel-webui"
COMPOSE_FILE="docker-compose.yml"

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo "错误: Docker 未安装。请先安装 Docker。"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        echo "警告: docker-compose 未安装，尝试使用 docker compose 插件..."
        if ! docker compose version &> /dev/null; then
            echo "错误: docker-compose 和 docker compose 插件均未安装。"
            exit 1
        fi
        COMPOSE_CMD="docker compose"
    else
        COMPOSE_CMD="docker-compose"
    fi
}

# 检查必要的文件
check_files() {
    if [ ! -f "app.jar" ]; then
        echo "错误: 未找到 app.jar 文件"
        exit 1
    fi
    
    if [ ! -f "config.ini" ]; then
        echo "错误: 未找到 config.ini 文件"
        exit 1
    fi
    
    if [ ! -d "rules" ]; then
        echo "错误: 未找到 rules 目录"
        exit 1
    fi
    
    # 创建 downloads 目录如果不存在
    if [ ! -d "downloads" ]; then
        echo "创建 downloads 目录..."
        mkdir -p downloads
        chmod 777 downloads
    fi
}

# 启动服务
start_service() {
    echo "启动 SoNovel 服务..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" up -d
    echo "服务已启动，Web UI 地址: http://localhost:7765"
}

# 停止服务
stop_service() {
    echo "停止 SoNovel 服务..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" down
    echo "服务已停止"
}

# 重启服务
restart_service() {
    echo "重启 SoNovel 服务..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" restart
    echo "服务已重启"
}

# 查看状态
status_service() {
    echo "SoNovel 服务状态:"
    $COMPOSE_CMD -f "$COMPOSE_FILE" ps
}

# 查看日志
logs_service() {
    echo "SoNovel 服务日志:"
    $COMPOSE_CMD -f "$COMPOSE_FILE" logs -f
}

# 构建镜像
build_service() {
    echo "构建 Docker 镜像..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" build --no-cache
    echo "镜像构建完成"
}

# 显示帮助
show_help() {
    echo "SoNovel Docker 管理脚本"
    echo ""
    echo "使用方法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  start     启动服务"
    echo "  stop      停止服务"
    echo "  restart   重启服务"
    echo "  status    查看服务状态"
    echo "  logs      查看服务日志"
    echo "  build     重新构建镜像"
    echo "  help      显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 start    # 启动 SoNovel 服务"
    echo "  $0 logs     # 查看服务日志"
}

# 主函数
main() {
    check_docker
    check_files
    
    case "$1" in
        start)
            start_service
            ;;
        stop)
            stop_service
            ;;
        restart)
            restart_service
            ;;
        status)
            status_service
            ;;
        logs)
            logs_service
            ;;
        build)
            build_service
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            if [ -z "$1" ]; then
                echo "错误: 未指定命令"
                echo ""
                show_help
                exit 1
            else
                echo "错误: 未知命令 '$1'"
                show_help
                exit 1
            fi
            ;;
    esac
}

# 执行主函数
main "$@"
