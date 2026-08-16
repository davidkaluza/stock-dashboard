# Stock Dashboard v2 - lauffaehige Version

Lokaler Betrieb ohne Docker. Das Dashboard laeuft auf dem lokalen Rechner, MongoDB extern unter `10.0.0.176` (DB `stock_dashboard_2`, kein Auth).

## Schnellstart (Windows)

Doppelklick auf:

```text
start-local-dev.bat
```

Startet Backend (Port 8001) + Frontend-Dev-Server (Port 5173) in zwei Fenstern.
Oeffnen:

```text
http://localhost:5173
```

## Manuell starten

Backend:

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Frontend im Entwicklungsmodus:

```bash
cd frontend
npm install
npm run dev
```

## Single-Server (Produktion)

```bash
cd frontend && npm run build
cd ../backend && python main.py
```

Der Backend-Server servt das gebaute Frontend statisch + API auf `http://localhost:8001`.

## MongoDB

Konfiguration unter *Einstellungen → Datenbank* oder direkt in `backend/db_config.json`:

```text
mongodb://10.0.0.176:27017/stock_dashboard_2
```

Alle API-Responses werden in der `stock_cache`-Collection gecached (Standard-TTL 3600s).

## Workflow fuer Offline-Modus

1. Aktien zur Watchlist hinzufuegen.
2. Button "MongoDB aktualisieren" klicken.
3. Fortschritt abwarten, z. B. "2 von 100 geladen".
4. Offline-Button aktivieren.

Im Offline-Modus werden keine yfinance-Abfragen ausgefuehrt. Die App liest dann nur aus MongoDB.

## Neue Bedienung

- MongoDB-Fenster ist standardmaessig minimiert.
- Button "Anzeigen/Minimieren" klappt die gespeicherten Cache-Details auf oder zu.
- Beim Aktualisieren wird der Fortschritt angezeigt.
- In den Einstellungen kann die Schriftgroesse mit +/- angepasst werden.
