# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Die Projekt-Doku (Commands, Architektur, Tücken, State, CSV/JSON) steht in `AGENTS.md` und wird hier eingebunden:

@AGENTS.md

## Arbeitsweise in diesem Repo

- **Zwei Varianten:** `main` = lokale FastAPI-Version, `pwa` = PWA + Supabase + GitHub Action. Vor Änderungen den Zweig prüfen; die Architektur unterscheidet sich grundlegend.
- **Umsetzung in Schritten** laut `docs/superpowers/plans/`. Stand: Schritt 1 (Schema + Pipeline) und Schritt 2 (PWA) fertig; Schritt 3 (Suche über Edge Function `lookup` mit OpenFIGI) und Schritt 4 (Web-Push) offen. Die Spezifikation ist verbindlich; Abweichungen dort nachtragen.
- **Prüfen ohne Supabase:** Pipeline mit `--dry-run`; Frontend mit `npm test` + `npm run build`. Logik gehört in `frontend/src/lib/` (ohne Netz testbar) und wird mit vitest abgedeckt.
- **Neue Marktdaten** brauchen drei Stellen: Tabelle + RLS-Lese-Policy in einer neuen, idempotenten Migration (`supabase/migrations/000N_*.sql`), Abruf in `pipeline/fetch.py` + Speichern in `pipeline/run.py`, Lesen in `frontend/src/lib/market.js`.
