@echo off
chcp 65001 >nul
title Puente Solidario
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js no esta instalado.
  echo  Descarga la version LTS desde https://nodejs.org , instalala y vuelve a abrir este archivo.
  start "" https://nodejs.org
  pause
  exit /b 1
)

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo.
  echo  Necesitas Node.js 22.13 o superior. Actualizalo desde https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo  Instalando dependencias por primera vez...
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

if "%PORT%"=="" set PORT=3737
start "" cmd /c "timeout /t 3 >nul & start http://puentesolidario.localhost:%PORT%"
call npm start
pause
