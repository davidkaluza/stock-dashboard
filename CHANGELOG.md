# Changelog

## v0.1.0 (2026-06-24)

- **Versioning** — Added `version` field in `frontend/package.json` (0.1.0), displayed as `Stock_Dashboard_v0_1_0` in UI header
- **Move/Copy stocks** — `ArrowLeftRight` button on each stock (card + table) opens a dialog to move or copy the stock to another depot
- **Insider buys tab** — Replaced bottom section with a dedicated "Insiderkäufe" tab in the tab bar. Global +/- lookback days (1–365) in the tab header. G/V calculated from purchase date + N days forward; returns 0 if not enough history.
- **Tabs instead of dropdown** — Depots are shown as clickable tabs. Added "Insiderkäufe" tab alongside depot tabs.
- **Docker compose** — `docker-compose.yml` + root `Dockerfile` (multi-stage: frontend built into backend). Single `docker compose up` command.
- **Chart fix** — Auto-refresh no longer overwrites chart history period. Only price + stats refresh every 60s; history fetched once initially.
- **CHANGELOG.md** — Tracked at project root for easy rollback reference

### Files changed

| File | Change |
|---|---|
| `Dockerfile` | New — multi-stage build (node:20 → python:3.11-slim) |
| `docker-compose.yml` | New — single service `stock-dashboard` on port 8001 |
| `frontend/package.json` | Version `0.0.0` → `0.1.0` |
| `frontend/src/App.jsx` | `activeAccountId` → `activeTab` (supports `'insider'`); added `insiderLookbackDays`, `isInsiderTab`, `allInsiderBuys`, `allWatchlistSymbols`; tab bar UI; conditional depot/insider rendering; fetch all symbols across all accounts; chart auto-refresh no longer overwrites history |
| `frontend/src/components/StockCard.jsx` | Move/copy + insider buy buttons |
| `frontend/src/components/TableView.jsx` | Move/copy + insider buy buttons |
| `frontend/src/components/InsiderBuys.jsx` | Rewritten: global lookback, G/V from purchase date + N days, 0 if insufficient history |
| `AGENTS.md` | Added `docker compose up` to commands |
| `CHANGELOG.md` | New file |
