#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Debian-Pakete prüfen / installieren ──
NEEDED=()
command -v python3 >/dev/null 2>&1 || NEEDED+=(python3)
command -v node >/dev/null 2>&1 || NEEDED+=(nodejs)
command -v npm >/dev/null 2>&1 || NEEDED+=(npm)
python3 -c "import ensurepip, venv" >/dev/null 2>&1 || NEEDED+=(python3-venv)

if [ ${#NEEDED[@]} -gt 0 ]; then
  echo "==> Fehlende Debian-Pakete: ${NEEDED[*]}"
  echo "    Installiere via apt (sudo)..."
  sudo apt-get update
  sudo apt-get install -y "${NEEDED[@]}"
fi

# ── Versionen prüfen ──
PY_MAJOR=$(python3 -c 'import sys; print(sys.version_info[0])')
if [ "$PY_MAJOR" -lt 3 ]; then
  echo "FEHLER: Python 3 erforderlich, gefunden: $(python3 --version)" >&2
  exit 1
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "FEHLER: Node >= 18 erforderlich (Vite 5), gefunden: $(node -v)" >&2
  echo "       z. B. via NodeSource: https://github.com/nodesource/distributions" >&2
  exit 1
fi

echo "==> Python $(python3 --version) | Node $(node -v) | npm $(npm -v)"

# ── Backend vorbereiten (Python venv) ──
echo "==> Backend vorbereiten (Python venv)..."
cd "$ROOT/backend"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  # shellcheck disable=SC1091
  source .venv/bin/activate
  pip install -r requirements.txt
else
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

echo "==> Backend starten..."
python main.py &
BACKEND_PID=$!

# ── Frontend vorbereiten ──
echo "==> Frontend vorbereiten..."
cd "$ROOT/frontend"
if [ ! -d node_modules ]; then
  npm install
fi

echo "==> Frontend starten..."
npm run dev &
FRONTEND_PID=$!

trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true' EXIT INT TERM

echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo "Beenden mit Strg+C..."
echo ""

wait