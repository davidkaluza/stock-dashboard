# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Die Projekt-Doku (Commands, Tücken, API, Frontend-State, CSV-Format) steht in `AGENTS.md` und wird hier eingebunden:

@AGENTS.md

## Ergänzungen zur Architektur

**Zeilenangaben in `AGENTS.md` sind nur Richtwerte** und driften mit jeder Änderung — vor dem Editieren per Grep nach dem Symbol suchen (z. B. `WKN_MAP`, `resolve_symbol`, `handleMoveStock`).

### Backend-Endpoint-Muster (`backend/main.py`)

Jeder yfinance-Endpoint folgt demselben Ablauf — neue Endpoints sollten ihn übernehmen, sonst brechen Cache und Offline-Modus:

1. `cache_key = f"<typ>_{symbol}[_<param>]"` — das Präfix vor dem ersten `_` wird von `cache_set` als `cache_type` gespeichert und in `/db/cache/summary` ausgewertet.
2. `cached = cache_get(cache_key)` → bei Treffer direkt zurückgeben. Im Offline-Modus liefert `cache_get` auch abgelaufene Einträge (`allow_stale`) und hängt ein `_cache`-Metaobjekt an die Response.
3. `raise_if_offline_without_cache(symbol)` — 503 statt yfinance-Zugriff, wenn offline.
4. `resolve_symbol(symbol)` (WKN → Ticker), dann yfinance-Abfrage.
5. `cache_set(cache_key, result)` und zurückgeben. Fehler → `HTTPException(404)`.

Alle Cache-Funktionen sind No-Ops, wenn die Datenbank nicht verbunden oder deaktiviert ist — die App läuft ohne DB voll weiter. `POST /db/refresh` schaltet den Offline-Modus temporär ab, löscht die betroffenen Cache-Keys und ruft die Endpoint-Funktionen direkt auf (`await get_price(...)` usw.; detail/news/history nur über Flags im Request-Body). Neue Datentypen dort ergänzen, wenn sie offline verfügbar sein sollen.

Der DB-Zustand liegt in Modul-Globals (`_db_conn` — eine einzelne psycopg-Verbindung mit autocommit —, `_cache_ttl`, `_cache_enabled`, `_offline_mode`), gesetzt von `connect_db()` beim Start und bei `POST /db/config`. Alle SQL-Zugriffe laufen über `_cache_execute`, das bei abgebrochener Verbindung einmal neu verbindet; `jsonb` verträgt kein NaN, daher `clean_nans` vor dem Speichern.

Das statische Frontend wird am Dateiende auf `/` gemountet — neue Routen müssen **vor** diesem `app.mount` definiert werden, sonst fängt der StaticFiles-Mount sie ab.

### Frontend

`App.jsx` ist der zentrale State-Container (Depots, Daten-Caches, Settings, Auto-Refresh, Move/Copy-Dialog, CSV-Import/Export); die Komponenten in `src/components/` sind weitgehend präsentational und bekommen Daten + Handler per Props. Jeder State-Slice wird separat in `localStorage` persistiert; `accounts` enthält eine Migration vom alten Einzel-Watchlist-Format (`watchlist`/`purchasePrices`/`shareQuantities` als Top-Level-Keys).

UI-Texte und Fehlermeldungen sind deutsch.

### Verifizieren

Da es keine Tests gibt: Frontend-Änderungen mit `cd frontend && npm run build` prüfen (einziger Compile-Check). Backend-Änderungen durch Starten (`python main.py`) und Aufruf des betroffenen Endpoints, z. B. `curl localhost:8001/price/SAP.DE`. Abhängigkeiten: `pip install -r backend/requirements.txt`, `npm install` in `frontend/`.

### Veraltete Doku

`CHANGELOG.md` (v0.1.0) beschreibt Docker (`Dockerfile`, `docker-compose.yml`) und einen Insiderkäufe-Tab (`InsiderBuys.jsx`). Beides existiert nicht mehr, und der Docker-Kommentar über dem Static-Mount in `main.py` ist ebenfalls überholt. Maßgeblich ist der Code, nicht das Changelog.
