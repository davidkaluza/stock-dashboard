# Schritt 1: Supabase-Schema + Pipeline (ohne Push)

Spezifikation: `docs/superpowers/specs/2026-11-11-pwa-design.md`

## Ergebnis

Die Action füllt `symbols`, `quotes`, `stats`, `daily_prices`, `details` und `news` für alle Einträge in `user_tickers`. Die Tests laufen offline (pytest).

## Aufgaben

1. **`supabase/migrations/0001_schema.sql`**: alle Tabellen der Spezifikation, also auch die Nutzertabellen für spätere Schritte, damit das Schema einmal vollständig steht. Dazu RLS-Policies und der Trigger `user_tickers` → `symbols` (`pending`). Der Dispatch-Trigger folgt erst in Schritt 4.
2. **`pipeline/calc.py`**: reine Funktionen, ohne Netz testbar:
   - `compute_quote(price, prev_close)` → `change`, `change_pct`
   - `compute_stats(closes, price, prev_close, today)` → `{"1d": {pct, abs}, …, "5y": …}` aus Tagesschlusskursen. Startkurs ist der erste Schlusskurs am oder nach dem Stichtag (wie bisher `history(period)`), Ausreißer über ±10 000 % ergeben `None`.
   - `normalize_news(item)`: unterstützt das alte und das neue yfinance-News-Format.
   - `split_detected(stored, fresh)`: Weichen die überlappenden Tage um mehr als 1 % ab, wird die Historie komplett neu geladen (Aktiensplit).
3. **`pipeline/fetch.py`**: yfinance-Zugriffe mit Wiederholung bei Drosselung: `quotes(symbols)` (gebündelt per `yf.download`), `daily(symbol, start)`, `info(symbol)`, `news(symbol)`, `details(symbol)` (Logik aus `main.py`).
4. **`pipeline/store.py`**: schlanker PostgREST-Client per `requests` (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`): `select`, `upsert` (in Blöcken), `delete`.
5. **`pipeline/run.py`**: Modi `quotes`, `nightly`, `new <symbol>`. `store` und `fetch` werden übergeben, damit die Tests Attrappen einsetzen können.
6. **Tests** `pipeline/tests/`: `test_calc.py`, `test_run.py` (FakeStore/FakeFetch).
7. **Workflows**: `.github/workflows/fetch.yml` (Zeitpläne, Dispatch, manuell, `concurrency`) und `.github/workflows/test.yml` (pytest).
8. **`docs/einrichtung.md`** (Teil 1): Supabase-Projekt, Migration einspielen, Secrets, ersten Lauf manuell starten.

## Prüfung

- `pytest pipeline/tests` grün
- Echte Abfrage ohne Supabase: `python -m pipeline.run quotes --dry-run SAP.DE AAPL` gibt die Daten aus, statt sie zu schreiben
- Nach der Einrichtung durch den Nutzer: manueller Lauf der Action, Tabellen in Supabase gefüllt
