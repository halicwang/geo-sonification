@echo off
setlocal enabledelayedexpansion
title Geo-Sonification

echo ========================================
echo   Geo-Sonification Launcher
echo ========================================
echo.

cd /d "%~dp0"

:: Load .env if present (skip # comment lines, strip inline # comments)
if not exist ".env" goto :env_done
for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
    call :setenv "%%A" "%%B"
)
:env_done

if not defined HTTP_PORT set HTTP_PORT=3000
if not defined WS_PORT set WS_PORT=3001

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
exit /b 0

:: ---- Subroutines ----

:setenv
:: Set env var from .env line, stripping inline # comments and trailing spaces.
set "_key=%~1"
set "_val=%~2"
if not defined _val (
    set "%_key%="
    goto :eof
)
:: Strip inline comment: " #..." (space-hash) to match bash semantics.
:: A bare # inside a value (e.g. token=pk.abc#def) is preserved.
call :strip_inline_comment
:: Trim trailing spaces
:trim_loop
if "!_val:~-1!"==" " (
    set "_val=!_val:~0,-1!"
    goto :trim_loop
)
set "%_key%=!_val!"
goto :eof

:strip_inline_comment
:: Walk _val char-by-char; truncate at first " #" (space-hash).
set "_i=0"
:_sic_loop
if "!_val:~%_i%,1!"=="" goto :eof
if "!_val:~%_i%,2!"==" #" (
    if !_i! equ 0 (set "_val=") else set "_val=!_val:~0,%_i%!"
    goto :eof
)
set /a "_i+=1"
goto :_sic_loop
