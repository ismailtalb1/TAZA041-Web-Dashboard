@echo off
setlocal EnableExtensions
title TAZA 041 - Public Demo

set "PROJECT=%~dp0"
cd /d "%PROJECT%"
if errorlevel 1 goto :project_error

if not exist "artisan" goto :project_error

set "CLOUDFLARED="
where cloudflared.exe >nul 2>&1
if not errorlevel 1 set "CLOUDFLARED=cloudflared.exe"
if not defined CLOUDFLARED if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" set "CLOUDFLARED=C:\Program Files (x86)\cloudflared\cloudflared.exe"
if not defined CLOUDFLARED if exist "C:\Program Files\cloudflared\cloudflared.exe" set "CLOUDFLARED=C:\Program Files\cloudflared\cloudflared.exe"
if not defined CLOUDFLARED (
    echo [ERROR] cloudflared was not found.
    echo Install it with: winget install --id Cloudflare.cloudflared
    goto :failed
)

curl.exe --silent --fail --max-time 2 "http://127.0.0.1:8000/api/health" >nul 2>&1
if errorlevel 1 (
    echo Starting Laravel in a separate window...
    start "TAZA 041 - Backend" /min "%ComSpec%" /k call "%PROJECT%start-backend.bat"
)

echo Waiting for Laravel...
for /L %%I in (1,1,30) do (
    curl.exe --silent --fail --max-time 2 "http://127.0.0.1:8000/api/health" >nul 2>&1
    if not errorlevel 1 goto :start_tunnel
    ping.exe -n 2 127.0.0.1 >nul
)

echo [ERROR] Laravel did not become ready within 30 seconds.
goto :failed

:start_tunnel
echo.
if exist "%PROJECT%cloudflared-config.yml" goto :start_named_tunnel

echo Laravel is ready. Creating a temporary public Cloudflare URL...
echo Keep this window open. Press Ctrl+C to stop the tunnel.
echo.
"%CLOUDFLARED%" tunnel --url http://127.0.0.1:8000
goto :eof

:start_named_tunnel
echo Laravel is ready. Starting https://app.taza041.me ...
echo Keep this window open. Press Ctrl+C to stop the tunnel.
echo.
"%CLOUDFLARED%" tunnel --config "%PROJECT%cloudflared-config.yml" run
goto :eof

:project_error
echo [ERROR] Could not find the TAZA 041 project.

:failed
echo.
pause
exit /b 1
