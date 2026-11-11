# Stock Dashboard (Zweig `pwa`)

PWA (Vite/React/Tailwind, `recharts`, `lucide-react`, `@supabase/supabase-js`) auf GitHub Pages + Supabase (PostgreSQL) + GitHub Action (Python, yfinance). Kein eigener Server. Die lokale FastAPI-Variante liegt auf `main`.

Design und Pläne: `docs/superpowers/specs/2026-11-11-pwa-design.md`, `docs/superpowers/plans/`. Einrichtung für Nutzer: `docs/einrichtung.md`.

## Commands

```
cd frontend && npm run dev            # Port 5173, Base '/'; braucht frontend/.env.local (Vorlage .env.example)
cd frontend && npm test               # vitest (src/**/*.test.js)
cd frontend && npx vitest run src/lib/history.test.js   # einzelne Testdatei
cd frontend && npm run build          # dist/ mit Base '/stock-dashboard/' (VITE_BASE überschreibt)
cd frontend && npm run preview        # gebaute PWA unter http://localhost:4173/stock-dashboard/
pip install -r pipeline/requirements-dev.txt
python -m pytest pipeline/tests                        # Pipeline-Tests, offline
python -m pytest pipeline/tests/test_run.py -k split   # einzelner Test
python -m pipeline.run quotes --dry-run SAP.DE AAPL    # echte Yahoo-Daten, schreibt nichts
python scripts/gen_icons.py           # PWA-Icons in frontend/public/ neu erzeugen (Pillow)
python scripts/gen_vapid.py --github  # VAPID-Schlüsselpaar erzeugen und per gh in Variable/Secret eintragen
```

Workflows: `fetch.yml` (Kursabruf + Push-Regeln: Mo–Fr alle 30 min, nachts, `workflow_dispatch` manuell oder von Supabase bei neuem Ticker; Modi `quotes`/`nightly`/`new`/`test-push`), `pages.yml` (Build + Pages bei Push auf `pwa`), `functions.yml` (Edge Functions per Supabase-CLI, übersprungen ohne `SUPABASE_ACCESS_TOKEN`), `test.yml` (pytest + vitest + Build). Zeitgesteuerte und Dispatch-Workflows laufen nur auf dem **Standard-Zweig**.

## Architektur

- **Privat bleibt lokal:** Depots, Menge, Kaufkurs, Kaufdatum liegen nur im `localStorage` der PWA. Auf den Server gehen nur Ticker (`user_tickers`) und später Push-Regeln/-Abos. Neue Features dürfen Depotdaten nicht nach Supabase schreiben.
- **Supabase-Schema:** `supabase/migrations/0001_schema.sql`; `0002_dispatch_new_ticker.sql` startet per `pg_net` die Action bei neuem `symbols`-Eintrag (Token/Repo im Vault, ohne sie No-Op). Marktdaten (`symbols`, `quotes`, `daily_prices`, `stats`, `details`, `news`) sind für `authenticated` lesbar und werden nur per Service-Key (Action) geschrieben. Nutzertabellen haben RLS `user_id = auth.uid()`. Ein Trigger legt für neue `user_tickers` eine `symbols`-Zeile mit `status = 'pending'` an.
- **Pipeline (`pipeline/`):** `run.py` (Modi, Orchestrierung; `store`/`fetcher` werden injiziert → testbar mit Fakes), `fetch.py` (alles mit yfinance), `calc.py` (reine Funktionen: Performance aus Tageskursen, News-Normalisierung, Split-Erkennung), `store.py` (PostgREST per `requests`), `alerts.py` (reine Regelauswertung mit Entprellung über `last_state`), `push.py` (pywebpush/VAPID; 404/410 → Abo löschen). Performance wird aus `daily_prices` berechnet, nicht per yfinance-Abfrage pro Zeitraum.
- **Frontend-Datenschicht `frontend/src/lib/`:** `market.js` liefert Supabase-Daten in den Formen, die die Komponenten erwarten (`stockData[sym] = {symbol, name, price, change, change_percent, currency, status, fetched_at}`, `statsData[sym] = {performance}`). `history.js` filtert Chart-Zeiträume lokal aus Tageskursen. `tickers.js` gleicht `user_tickers` ab (leere lokale Liste löscht nichts). `backup.js` übernimmt CSV und JSON-Sicherung. `theme.js` setzt gespeicherte Farben vor dem ersten Rendern.
- **`Root.jsx`** entscheidet zwischen Login (E-Mail-OTP-Code, `shouldCreateUser: false`) und `App.jsx`. `App.jsx` ist der zentrale State-Container, die Komponenten sind präsentational.
- **Suche:** Edge Function `supabase/functions/lookup/` – `logic.js` ist reines ESM (Deno + vitest, Tests in `frontend/src/lib/lookup.test.js`), `index.ts` nur die Deno-Hülle. WKN/ISIN → OpenFIGI → Börsencode-Tabelle `EXCHANGES` → Yahoo-Ticker; Namen → Yahoo-Suche. Frontend ruft sie über `lib/search.js` (`functions.invoke`) auf.
- **Push:** `lib/push.js` (Abo dieses Geräts, `syncPushSubscription` beim Start erneuert verworfene iOS-Abos), `lib/alerts.js` (Regeln `alert_rules`, Validierung), `components/AlertDialog.jsx` (Glocke pro Aktie). Die PWA setzt nie `last_state` (DB-Trigger setzt ihn bei Nutzeränderung auf null).
- **PWA:** `vite-plugin-pwa` mit `injectManifest`; eigener Service Worker `frontend/src/sw.js` (Precache, Navigation-Fallback, `push` → `showNotification`, `notificationclick` → `?symbol=`).

## Tücken

| Was | Detail |
|---|---|
| `vite.config.js` Base | `command === 'serve'` gilt auch für `vite preview` → Unterscheidung über `isPreview`. Dev = `/`, Build/Preview = `/stock-dashboard/` |
| vitest-Version | vitest 2.x, weil Vite 5 (vitest ≥ 3 braucht Vite ≥ 6) |
| yfinance-Version | ≥ 1.8: ältere Versionen scheitern an der News-API („Yahoo Finance is currently down“) |
| Supabase-Schlüssel in `store.py` | neue `sb_secret_…`-Keys nur im `apikey`-Header; `Authorization: Bearer` nur bei alten JWT-Keys (`eyJ…`) |
| PostgREST | max. 1000 Zeilen pro Abfrage → `selectAll`/`select` paginieren. `jsonb` verträgt kein NaN → `store.clean` |
| Kaufkurs `null` | markiert eine neu hinzugefügte Aktie; wird mit dem ersten Kurs vorbelegt. `0`/fehlend (CSV-Import) bleibt unangetastet |
| localStorage-Größe | `dailyPrices` wird nur für die letzten 400 Tage gespeichert (`trimDailyForStorage`), längere Zeiträume werden bei Bedarf nachgeladen |
| `package-lock.json` | eingecheckt (CI nutzt `npm ci`), enthält die Linux-Binärpakete für Rollup/esbuild |
| `VAPID_SUBJECT` | py_vapid akzeptiert nur `mailto:…` oder `https://host` ohne Pfad – `WebPusher` prüft das beim Start |
| `CHANGELOG.md` | beschreibt den Stand v0.1.0 (Docker, Insider-Tab) und ist veraltet |

## Frontend-State (localStorage)

- `accounts` – Depots: `watchlist[]`, `purchasePrices{}`, `shareQuantities{}`, `purchaseDates{}`, `oldShares[]` (Migration vom alten Einzel-Watchlist-Format)
- `activeTab`, `viewMode` (`cards`/`table`), `colorSettings`, `fontScale`, `fontFamily`, `refreshInterval` (60–3600 s, Standard 300)
- `stockData`, `statsData`, `dailyPrices` – zuletzt geladene Marktdaten (offline sichtbar)
- `lastBackupAt`, `backupReminderSnoozedUntil` – Backup-Erinnerung (30 Tage)
- `sb-<projekt>-auth-token` – Supabase-Sitzung

## CSV / JSON

CSV: Semikolon, UTF-8 BOM, Spalten `DEPOT;TICKER;NAME;ANZAHL;KAUFKURS;DATUM`; Import erkennt `;` oder `,`. JSON-Sicherung: `{app: 'stock-dashboard', version: 1, exportedAt, accounts, settings, alertRules}`; Import ersetzt die lokalen Depots nach Rückfrage.

UI-Texte und Fehlermeldungen sind deutsch.
