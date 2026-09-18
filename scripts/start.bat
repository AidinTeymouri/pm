@echo off
setlocal

cd /d "%~dp0.."

set IMAGE_NAME=pm-app
set CONTAINER_NAME=pm-app
if "%PORT%"=="" set PORT=8000

if not exist backend\data mkdir backend\data

docker build -t %IMAGE_NAME% .
if errorlevel 1 exit /b 1

docker rm -f %CONTAINER_NAME% >nul 2>&1

if exist .env (
  docker run -d --name %CONTAINER_NAME% -p %PORT%:8000 -v "%cd%\backend\data:/app/backend/data" --env-file .env %IMAGE_NAME%
) else (
  docker run -d --name %CONTAINER_NAME% -p %PORT%:8000 -v "%cd%\backend\data:/app/backend/data" %IMAGE_NAME%
)

echo Running at http://localhost:%PORT%
