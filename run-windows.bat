@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo   SoNovel 小说下载服务 - Windows 启动脚本
echo ========================================
echo.

:: 检查必要文件
if not exist "app.jar" (
    echo [错误] 未找到 app.jar
    pause
    exit /b 1
)

if not exist "config.ini" (
    echo [错误] 未找到 config.ini
    pause
    exit /b 1
)

:: 检查 Java 环境
where java >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Java 环境
    echo.
    echo 请安装 Java 17 或更高版本:
    echo   - 推荐: https://adoptium.net/
    echo   - 或者: https://www.oracle.com/java/technologies/downloads/
    echo.
    pause
    exit /b 1
)

:: 检查 Java 版本
for /f "tokens=3" %%i in ('java -version 2^>^&1 ^| findstr /i "version"') do (
    set JAVA_VER=%%i
)
set JAVA_VER=%JAVA_VER:"=%
echo [信息] 检测到 Java 版本: %JAVA_VER%
echo.

:: 运行 Java 应用
echo [信息] 正在启动 SoNovel 服务...
echo [信息] 服务地址: http://localhost:7765
echo.

java -Dconfig.file=config.ini -Dmode=tui -jar app.jar

if %errorlevel% neq 0 (
    echo.
    echo [错误] 运行 Java 应用失败
    pause
    exit /b 1
)

pause
