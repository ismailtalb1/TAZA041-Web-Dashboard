@echo off
setlocal EnableExtensions
title TAZA 041 - Backend

rem Find the project when this BAT is in the project, in tools, or on Desktop.
set "PROJECT=%~dp0"
if exist "%PROJECT%artisan" goto :project_found

set "PROJECT=%~dp0..\..\"
if exist "%PROJECT%artisan" goto :project_found

set "PROJECT=C:\Users\DELL005\Desktop\TAZA041 - Web & Dashboard\"
if exist "%PROJECT%artisan" goto :project_found

goto :project_error

:project_found
cd /d "%PROJECT%"
if errorlevel 1 goto :project_error

where php.exe >nul 2>&1
if errorlevel 1 (
    echo [ERROR] PHP was not found in PATH.
    echo Install PHP 8.2 or newer, then reopen this file.
    goto :failed
)

if not exist "vendor\autoload.php" (
    echo [ERROR] Laravel dependencies are missing.
    echo Open a terminal in the project folder and run: composer install
    goto :failed
)

if not exist ".env" (
    echo [ERROR] The .env file is missing.
    echo Copy .env.example to .env, configure the database, then run:
    echo php artisan key:generate
    goto :failed
)

curl.exe --silent --fail --max-time 2 "http://127.0.0.1:8000/api/health" >nul 2>&1
if not errorlevel 1 (
    echo TAZA 041 is already running at http://127.0.0.1:8000
    exit /b 0
)

echo Preparing Laravel...
php artisan optimize:clear
if errorlevel 1 (
    echo [ERROR] Laravel could not start. Check the message above.
    goto :failed
)

echo.
echo TAZA 041 Backend is running at:
echo http://127.0.0.1:8000
echo.
echo This CMD runs Laravel and the API.
echo Keep this window open. Press Ctrl+C to stop the server.
echo.
php artisan serve --host=127.0.0.1 --port=8000

echo.
echo The Backend server stopped.
goto :failed

:project_error
echo [ERROR] Could not find the TAZA 041 project.
echo Expected project path:
echo C:\Users\DELL005\Desktop\TAZA041 - Web ^& Dashboard

:failed
echo.
pause
exit /b 1
