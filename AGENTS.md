# Stock Dashboard

FastAPI (yfinance) + Vite/React/Tailwind. Single-file Backend (`main.py`), SPA mit `recharts`, `lucide-react`, `axios`.

## Commands

```
cd backend && python main.py         # Port 8001 (API + built frontend aus dist/)
cd frontend && npm run dev           # Port 5173 (API → localhost:8001)
cd frontend && npm run build         # dist/ für Single-Server-Produktion
start-local-dev.bat                  # Backend + Frontend parallel (Windows)
```

**Single-Server**: `npm run build` → `python main.py` servt das gebaute Frontend statisch + API auf 8001. Dev-Server proxyt nichts. Statische Dateien werden aus `backend/frontend/dist/` ODER `../frontend/dist/` gemountet (erste gefundene, `main.py:773-780`).

## Tücken

| Was | Wo | Detail |
|---|---|---|
| NaN-Patching | `main.py:15-46` | `JSONResponse.render` monket (`clean_nans`), NaN/Inf aus yfinance/pandas vor JSON zu entfernen |
| WKN-Auflösung | `main.py:336-398` | `WKN_MAP` (~50 Einträge) mapped deutsche WKNs → Ticker. 6-stellige Codes: erst Map, sonst `.DE`-Anhang. Symbole mit `.` oder ≤5 Zeichen gehen raw durch |
| Suche | `main.py:674-768` | `/search?q=...&limit=10` — Mehrstufig: WKN_MAP → `yf.Search` → `yf.query` → Direkt-Ticker-Fallback. Dedupe per (symbol, exchange) |
| Move/Copy | `App.jsx:419-444` | `handleMoveStock`/`handleCopyStock`; Button (`ArrowLeftRight`) in `StockCard.jsx` + `TableView.jsx`, Dialog in App |
| `.old`-Leichen | `frontend/src/components/*.jsx.old` | Alte Varianten, ungenutzt. Auch `NewsPanel.jsx` tot (nicht importiert). `backend/main.old.py` nur noch im Git-Index, nicht auf Disk |
| Kein `.gitignore` | Repo-Root | `node_modules/`, `__pycache__/`, `dist/`, `*.pyc` alle in git (9735 Dateien) |
| Kein `vite.config.js` | — | Nur Vite-Standard (plugin-react, tailwind via postcss). Kein Proxy, keine Aliase |
| Kein Lint/Test/Typecheck | — | Nur `dev`, `build`, `preview`. Kein Test-Framework, keine CI |
| db_config.json | `backend/db_config.json` | MongoDB-Einstellungen aus den UI-Settings, in git getrackt. Env-Vars (MONGO_URI/MONGO_ENABLED/CACHE_TTL/OFFLINE_MODE) gewinnen über der Datei |
| Schrift/Farben | `index.html:10`, `index.css:5-10` | JetBrains Mono via Google Fonts. Farben via CSS-Vars (`--bg-background`, `--bg-surface`, `--clr-accent`, `--clr-muted`) |

## MongoDB (optionale Caching-DB)

Lokaler Betrieb ohne Docker — MongoDB läuft extern auf `10.0.0.176`, DB `stock_dashboard_2` (kein Auth). Konfiguration über `backend/db_config.json` oder UI *Einstellungen → Datenbank*:

```bash
mongodb://10.0.0.176:27017/stock_dashboard_2
```

Nach Verbindung werden alle API-Responses in der `stock_cache`-Collection gecached  
(Standard-TTL 3600s). Bei erneuten Requests wird zuerst der Cache geprüft,  
dann ggf. von yfinance aktualisiert.

**Offline-Modus**: In den Settings aktivierbar. Beim Aktivieren werden KEINE yfinance-Abfragen mehr gemacht — nur Cache-Reads, 503 wenn ein Symbol fehlt (`raise_if_offline_without_cache`). Workflow: Watchlist füllen → `POST /db/refresh` („MongoDB aktualisieren") → Offline an.

## API (localhost:8001)

| Endpoint | Beschreibung |
|---|---|
| `GET /price/{symbol}` | Kurs, Änderung, Name, Währung via `fast_info` |
| `GET /stats/{symbol}` | Performance % 1d/1wk/1mo/2mo/3mo/6mo/1y/5y (2mo via `start=`-History, yfinance hat kein `2mo`) |
| `GET /history/{symbol}` | OHLC-Kurse. Query: `?period=1mo` oder `?start=YYYY-MM-DD` |
| `GET /news/{symbol}` | Top-5-News |
| `GET /detail/{symbol}` | Fundamentaldaten (PE, Div, Beta, 52w-Spanne, Sektor) + Analystenziele |
| `GET /search?q=...&limit=10` | Suche nach Name/Ticker/WKN. Returns `symbol, name, exchange, type` |
| `GET /db/status` | MongoDB-Verbindungsstatus + TTL |
| `GET /db/config` | Gespeicherte MongoDB-Einstellungen (uri/ttl/enabled/offline) |
| `POST /db/config` | MongoDB-URI + TTL setzen (Body: `{"uri":"...","ttl":3600}`) |
| `GET /db/cache/summary?symbols=...` | Cache-Übersicht (Keys/Types pro Symbol, zuletzt abgerufen) |
| `POST /db/refresh` | Alle Symbole neu von yfinance ziehen (Body: `{"symbols":[...]}`) |

## Frontend-State (alles localStorage)

- `accounts` — Array aus Depots: `watchlist[]`, `purchasePrices{}`, `shareQuantities{}`, `purchaseDates{}`, `oldShares[]`
- `activeTab` — Depot-ID
- `stockData`, `statsData`, `historyData` — gecachte API-Responses
- `viewMode` (`"cards"` | `"table"`), `colorSettings` (inkl. `pos`/`neg`/`posLight`/`negLight` als `--clr-pos` etc.)

Auto-Refresh alle 60s (alle Watchlist-Symbole). API-Base: `import.meta.env.DEV ? 'http://localhost:8001' : ''`.

Kartenansicht sortierbar (Name/Kurs/Wert/Rendite/Tage). Tabellenansicht mit A4-Druck via `@media print`. Performance-Werte in Tabellenansicht hell markiert (`text-pos-light`/`text-neg-light`), wenn der Zeitraum vor dem Kaufdatum beginnt.

## CSV-Import/Export

Semikolon (`;`)-Delimiter, UTF-8 BOM. Spalten: `DEPOT;TICKER;NAME;ANZAHL;KAUFKURS;DATUM`. Import erkennt `;` oder `,` automatisch.
