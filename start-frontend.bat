@echo off
setlocal EnableExtensions
title TAZA 041 - Frontend (Port 5500)

rem Find the project when this BAT is in the project, in tools, or on Desktop.
set "PROJECT=%~dp0"
if exist "%PROJECT%public\frontend\index.html" goto :project_found

set "PROJECT=%~dp0..\..\"
if exist "%PROJECT%public\frontend\index.html" goto :project_found

set "PROJECT=C:\Users\DELL005\Desktop\TAZA041 - Web & Dashboard\"
if exist "%PROJECT%public\frontend\index.html" goto :project_found

goto :project_error

:project_found
cd /d "%PROJECT%"
if errorlevel 1 goto :project_error

where php.exe >nul 2>&1
if errorlevel 1 (
    echo [ERROR] PHP was not found in PATH.
    goto :failed
)

curl.exe --silent --fail --max-time 2 "http://127.0.0.1:5500/frontend/index.html" >nul 2>&1
if not errorlevel 1 (
    echo TAZA 041 Frontend is already running at http://127.0.0.1:5500
    exit /b 0
)

echo TAZA 041 Frontend is running at:
echo http://127.0.0.1:5500/frontend/index.html
echo.
echo Dashboard:
echo http://127.0.0.1:5500/dashboard/index.html
echo.
echo Frontend data comes from the Backend API on port 8000.
echo Keep this window open. Press Ctrl+C to stop the server.
echo.
php -S 127.0.0.1:5500 -t "%PROJECT%public"

echo.
echo The Frontend server stopped.
goto :failed

:project_error
echo [ERROR] Could not find the TAZA 041 frontend project.
echo Expected project path:
echo C:\Users\DELL005\Desktop\TAZA041 - Web ^& Dashboard

:failed
echo.
pause
exit /b 1
