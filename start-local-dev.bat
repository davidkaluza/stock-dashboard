@echo off
setlocal
cd /d "%~dp0"

echo Starte lokalen Entwicklungsmodus ohne Docker...
echo.
echo Installiere Python-Abhaengigkeiten...
cd /d "%~dp0backend"
pip install -r requirements.txt

echo.
echo Installiere Frontend-Abhaengigkeiten, damit vite verfuegbar ist...
cd /d "%~dp0frontend"
if not exist node_modules (
  npm install
)

echo.
echo Starte Backend...
start "Stock Dashboard - Backend" /d "%~dp0backend" cmd /k "python main.py"

echo Starte Frontend...
start "Stock Dashboard - Frontend" /d "%~dp0frontend" cmd /k "npm run dev"

echo.
echo Backend:  http://localhost:8001
echo Frontend: http://localhost:5173
echo.
pause