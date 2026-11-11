# Schritt 2: Umbau zur PWA

Spezifikation: `docs/superpowers/specs/2026-11-11-pwa-design.md`

## Ergebnis

Das Frontend läuft ohne FastAPI-Backend als installierbare PWA auf GitHub Pages: Login per E-Mail-Code, Kurse aus Supabase, Ticker-Abgleich, Charts aus `daily_prices`, CSV- und JSON-Sicherung.

## Aufgaben

1. **Datenschicht `frontend/src/lib/`**, reine Funktionen möglichst getrennt von den Netzaufrufen:
   - `supabase.js`: Client aus `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
   - `market.js`: `fetchSnapshot(symbols)` liefert `stockData`/`statsData` in den bisherigen Formen, dazu `fetchDailyPrices(symbols, since)`, `fetchDetails(symbol)`, `fetchNews(symbol)`
   - `history.js`: `CHART_PERIODS`, `periodStart()`, `filterHistory()` (alle Zeiträume und „seit Kauf“ lokal)
   - `tickers.js`: `diffTickers()` + `syncTickers()`. Ein leeres lokales Depot löscht nichts, damit ein frisch installiertes Gerät nicht alles entfernt.
   - `backup.js`: CSV-Export/-Import (aus `App.jsx` herausgelöst, Verhalten unverändert) und JSON-Sicherung `{version: 1, …}`
2. **Login** `components/Login.jsx`: E-Mail → 6-stelliger Code (`signInWithOtp` mit `shouldCreateUser: false`, `verifyOtp`), Abmelden in den Einstellungen.
3. **`App.jsx`**: axios/Backend raus, Supabase-Snapshot beim Start, bei Sichtbarkeit und im Intervall (Standard 5 min). Tageskurse für Karten ab 1 Jahr, längere Zeiträume bei Bedarf nachladen. Ticker-Abgleich, Backup-Erinnerung (30 Tage), `navigator.storage.persist()`. DB-Panel, Offline- und Aktualisieren-Knopf entfallen.
4. **Komponenten**:
   - `StockCard`/`StockDetail`: Zeiträume aus `CHART_PERIODS`, „Stand HH:MM“ und Status (`wird geladen…`/`unbekannt`)
   - `StockDetail`: Details und News aus Supabase
   - `AddStock`: Suche optional über ein `search`-Prop (kommt in Schritt 3), bis dahin direkte Ticker-Eingabe
   - `Settings`: DB-Bereich raus, Konto/Abmelden und Sicherung rein
5. **PWA**: `vite-plugin-pwa` (`injectManifest`, eigener `src/sw.js`), Manifest, Icons (192/512/maskable/apple-touch), iOS-Meta-Tags, `base: '/stock-dashboard/'`.
6. **Tests** (vitest): `history`, `tickers`, `backup`.
7. **Workflows**: `pages.yml` (Build + GitHub Pages), `test.yml` um das Frontend ergänzt.
8. **Aufräumen**: `backend/`, `deploy/`, Startskripte, `*.old`, `NewsPanel.jsx`, eingecheckte `node_modules`/`dist` aus dem Index. AGENTS.md, CLAUDE.md und README auf die neue Architektur umschreiben. `docs/einrichtung.md` Teil 2.

## Prüfung

- `npm test` und `npm run build` grün, `pytest` weiterhin grün
- `npm run preview`: Login-Bildschirm erscheint, Manifest und Service Worker werden geladen (manuell bzw. per Browser)
- Ende-zu-Ende mit echter Supabase erst nach Einrichtung durch den Nutzer
