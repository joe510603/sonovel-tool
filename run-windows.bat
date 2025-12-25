@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   SoNovel - Windows Startup Script
echo ========================================
echo.

REM Check required files
if not exist "app.jar" (
    echo [ERROR] app.jar not found
    pause
    exit /b 1
)

if not exist "config.ini" (
    echo [ERROR] config.ini not found
    pause
    exit /b 1
)

REM Check Java environment
where java >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Java not found
    echo.
    echo Please install Java 17 or higher:
    echo   - Recommended: https://adoptium.net/
    echo   - Or: https://www.oracle.com/java/technologies/downloads/
    echo.
    pause
    exit /b 1
)

REM Display Java version
echo [INFO] Checking Java version...
java -version 2>&1 | findstr /i "version"
echo.

REM Run Java application
echo [INFO] Starting SoNovel service...
echo [INFO] Service URL: http://localhost:7765
echo.

java -Dconfig.file=config.ini -Dmode=tui -jar app.jar

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to run Java application
    pause
    exit /b 1
)

pause
