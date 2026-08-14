@echo off
setlocal EnableExtensions
title TAZA 041 - Start Website

set "LAUNCHERS=%~dp0"
if exist "%LAUNCHERS%start-backend.bat" if exist "%LAUNCHERS%start-frontend.bat" goto :launchers_found

set "LAUNCHERS=C:\Users\DELL005\Desktop\TAZA041 - Web & Dashboard\"
if exist "%LAUNCHERS%start-backend.bat" if exist "%LAUNCHERS%start-frontend.bat" goto :launchers_found

echo [ERROR] Backend or Frontend BAT is missing.
pause
exit /b 1

:launchers_found
call :backend_ready
if errorlevel 1 start "TAZA 041 - Backend" /min "%ComSpec%" /k call "%LAUNCHERS%start-backend.bat"

call :frontend_ready
if errorlevel 1 start "TAZA 041 - Frontend" /min "%ComSpec%" /k call "%LAUNCHERS%start-frontend.bat"

echo Waiting for Backend 8000 and Frontend 5500...
for /L %%I in (1,1,30) do (
    ping.exe -n 2 127.0.0.1 >nul
    call :both_ready
    if not errorlevel 1 goto :open_page
)

echo [ERROR] The servers did not become ready within 30 seconds.
echo Check the Backend and Frontend CMD windows.
pause
exit /b 1

:open_page
start "" "http://127.0.0.1:5500/frontend/index.html"
exit /b 0

:backend_ready
curl.exe --silent --fail --max-time 2 "http://127.0.0.1:8000/api/health" >nul 2>&1
exit /b %errorlevel%

:frontend_ready
curl.exe --silent --fail --max-time 2 "http://127.0.0.1:5500/frontend/index.html" >nul 2>&1
exit /b %errorlevel%

:both_ready
call :backend_ready
if errorlevel 1 exit /b 1
call :frontend_ready
exit /b %errorlevel%
