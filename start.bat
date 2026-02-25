@echo off
title Geo-Sonification

echo ========================================
echo   Geo-Sonification Launcher
echo ========================================
echo.

cd /d "%~dp0"

:: ---- Phase 1: Load .env WITHOUT delayed expansion ----
:: This prevents ! characters in values (e.g. tokens, URLs) from being
:: corrupted by cmd.exe's delayed-expansion parser.
:: Inline # comments are not stripped (acceptable trade-off for correctness).
setlocal
if exist ".env" (
    for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
        set "%%A=%%B"
    )
)

if not defined HTTP_PORT set HTTP_PORT=3000
if not defined WS_PORT set WS_PORT=3001

:: ---- Phase 2: Enable delayed expansion (inherits .env variables) ----
setlocal enabledelayedexpansion

:: Check prerequisites
where node >nul 2>&1 || (
    echo ERROR: node not found. Install Node.js 18+ first.
    pause
    exit /b 1
)
where npm >nul 2>&1 || (
    echo ERROR: npm not found. Install Node.js ^(includes npm^) first.
    pause
    exit /b 1
)
where curl >nul 2>&1 || (
    echo ERROR: curl not found. Install curl or upgrade to Windows 10 17063+.
    pause
    exit /b 1
)

:: Install server deps if needed
if not exist "server\node_modules" (
    echo [0/2] Installing server dependencies ^(first run^)...
    call npm --prefix server install
    if !ERRORLEVEL! neq 0 (
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
    echo.
)

:: Check if ports are already in use
for /f "tokens=5" %%P in ('netstat -aon 2^>nul ^| findstr ":%HTTP_PORT% " ^| findstr "LISTENING"') do (
    echo Port %HTTP_PORT% in use ^(pid: %%P^) -- stopping...
    taskkill /PID %%P /F >nul 2>&1
)
for /f "tokens=5" %%P in ('netstat -aon 2^>nul ^| findstr ":%WS_PORT% " ^| findstr "LISTENING"') do (
    echo Port %WS_PORT% in use ^(pid: %%P^) -- stopping...
    taskkill /PID %%P /F >nul 2>&1
)

:: Start server in background
echo [1/2] Starting Node.js server...
start /b "" node server/index.js

:: Wait for server to be ready
echo   Waiting for http://localhost:%HTTP_PORT%/health ...
set READY=false
for /l %%I in (1,1,15) do (
    curl -fsS "http://localhost:%HTTP_PORT%/health" >nul 2>&1 && (
        set READY=true
        goto :server_ready
    )
    timeout /t 1 /nobreak >nul
)
:server_ready

if "!READY!"=="false" (
    echo   ERROR: Server failed to start within 15 seconds.
    echo   Check server logs above for errors.
    pause
    exit /b 1
)
echo   OK: Server is ready

:: Capture server PID for cleanup
set SERVER_PID=
for /f "tokens=5" %%P in ('netstat -aon 2^>nul ^| findstr ":%HTTP_PORT% " ^| findstr "LISTENING"') do (
    if not defined SERVER_PID set "SERVER_PID=%%P"
)

:: Open browser
echo [2/2] Opening browser...
start "" "http://localhost:%HTTP_PORT%?ws_port=%WS_PORT%"

echo.
echo ========================================
echo   All systems launched!
echo ========================================
echo.
echo   - Server:  http://localhost:%HTTP_PORT%
echo   - Audio:   Web Audio ^(browser^)
echo   - Browser: Should open automatically
echo.
echo   Press any key to stop the server
echo ========================================
echo.

:: Wait for user to stop, then clean up server process
pause >nul
echo.
echo Stopping server...
if defined SERVER_PID (
    taskkill /PID !SERVER_PID! /F >nul 2>&1
)
endlocal
endlocal
exit /b 0
