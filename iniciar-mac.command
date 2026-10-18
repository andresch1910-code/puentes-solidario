#!/bin/bash
# Puente Solidario — inicio en macOS (doble clic) o Linux (bash iniciar-mac.command)
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js no está instalado."
  echo "  Descarga la versión LTS desde https://nodejs.org , instálala y vuelve a abrir este archivo."
  open "https://nodejs.org" 2>/dev/null || true
  read -r -p "Presiona Enter para salir…"
  exit 1
fi

if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"; then
  echo "  Necesitas Node.js 22.13 o superior. Actualízalo desde https://nodejs.org"
  read -r -p "Presiona Enter para salir…"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "  Instalando dependencias por primera vez…"
  npm install --no-fund --no-audit || { read -r -p "Error. Presiona Enter para salir…"; exit 1; }
fi

PORT="${PORT:-3737}"
( sleep 3; (open "http://puentesolidario.localhost:$PORT" 2>/dev/null || xdg-open "http://puentesolidario.localhost:$PORT" 2>/dev/null) ) &
npm start
