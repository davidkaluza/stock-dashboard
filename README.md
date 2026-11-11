# Stock Dashboard v2 - lauffaehige Version

Lokaler Betrieb ohne Docker. Das Dashboard laeuft auf dem lokalen Rechner, der optionale Cache liegt in Supabase (PostgreSQL).

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

## Supabase

Konfiguration unter *Einstellungen → Datenbank* oder direkt in `backend/db_config.json` (Vorlage: `db_config.json.example`; die Datei enthaelt das DB-Passwort und wird nicht in Git eingecheckt).

Connection-String in Supabase unter *Connect* → **Session pooler** kopieren und `[YOUR-PASSWORD]` ersetzen:

```text
postgresql://postgres.PROJEKT:PASSWORT@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

Alternativ per Umgebungsvariable `DATABASE_URL`. Die Tabelle `stock_cache` wird beim ersten Verbinden automatisch angelegt; alle API-Responses werden dort gecached (Standard-TTL 3600s).

### Altdaten aus MongoDB uebernehmen (einmalig)

```bash
cd backend
pip install pymongo
python migrate_mongo_to_supabase.py mongodb://10.0.0.176:27017/stock_dashboard_2 "postgresql://..."
```

## Workflow fuer Offline-Modus

1. Aktien zur Watchlist hinzufuegen.
2. Button "Supabase aktualisieren" (Pfeil-Symbol) klicken.
3. Fortschritt abwarten, z. B. "2 von 100 geladen".
4. Offline-Button aktivieren.

Im Offline-Modus werden keine yfinance-Abfragen ausgefuehrt. Die App liest dann nur aus Supabase.

## Neue Bedienung

- Datenbank-Fenster ist standardmaessig minimiert.
- Button "Anzeigen/Minimieren" klappt die gespeicherten Cache-Details auf oder zu.
- Beim Aktualisieren wird der Fortschritt angezeigt.
- In den Einstellungen kann die Schriftgroesse mit +/- angepasst werden.
