#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Frontend bauen (dist/)..."
cd "$ROOT/frontend"
npm run build

echo "==> Service-Dateien mit Pfad '$ROOT' generieren..."
sed "s|__APP_DIR__|$ROOT|g" "$ROOT/deploy/stock-dashboard-backend.service"  > "$TMP/stock-dashboard-backend.service"
sed "s|__APP_DIR__|$ROOT|g" "$ROOT/deploy/stock-dashboard-frontend.service" > "$TMP/stock-dashboard-frontend.service"

echo "==> Nach /etc/systemd/system/ installieren (sudo)..."
sudo cp "$TMP/stock-dashboard-backend.service"  /etc/systemd/system/
sudo cp "$TMP/stock-dashboard-frontend.service" /etc/systemd/system/
sudo systemctl daemon-reload

echo "==> Dienste aktivieren + starten..."
sudo systemctl enable --now stock-dashboard-backend.service stock-dashboard-frontend.service

echo ""
echo "Status:"
systemctl status stock-dashboard-backend.service  --no-pager || true
systemctl status stock-dashboard-frontend.service --no-pager || true
echo ""
echo "URLs: http://localhost:5173 (Frontend) | http://localhost:8000 (API)"
echo "Logs:  journalctl -u stock-dashboard-backend.service -f"
echo "       journalctl -u stock-dashboard-frontend.service -f"
echo "Stopp: sudo systemctl stop stock-dashboard-backend.service stock-dashboard-frontend.service"