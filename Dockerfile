# 使用 Eclipse Temurin JDK 21 作为基础镜像（兼容性更好）
FROM eclipse-temurin:21-jdk

# 设置工作目录
WORKDIR /app

# 复制应用程序文件
COPY app.jar /app/
COPY config.ini /app/
COPY rules /app/rules/

# 创建下载目录
RUN mkdir -p /app/downloads

# 暴露 Web UI 端口（根据 config.ini 中的端口配置）
EXPOSE 7765

# 设置环境变量
ENV CONFIG_FILE=/app/config.ini
ENV MODE=web

# 运行应用程序
# 注意：我们需要确保 config.ini 中的 web.enabled=1 才能启用 Web UI
# 如果 config.ini 中 web.enabled=0，我们可以通过环境变量或启动脚本修改
CMD ["java", \
    "-XX:+UseZGC", \
    "-XX:+ZGenerational", \
    "-Dconfig.file=${CONFIG_FILE}", \
    "-Dmode=${MODE}", \
    "-jar", "app.jar"]
