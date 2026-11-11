"""Einstieg der Pipeline: python -m pipeline.run <quotes|nightly|new> [SYMBOL ...] [--dry-run]

quotes   Kurse, Performance und News für alle verfolgten Symbole (alle 30 min)
nightly  Tageskurse ergänzen, Fundamentaldaten, Aufräumen (nachts)
new      Ein oder mehrere Symbole komplett laden (bei neuem Ticker)

--dry-run  nichts schreiben, nur ausgeben; verfolgte Symbole = die übergebenen SYMBOLE
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional, Protocol

from .calc import compute_quote, compute_stats, split_detected

log = logging.getLogger("pipeline")

STATS_LOOKBACK = timedelta(days=5 * 366 + 14)  # genug Historie für den 5-Jahres-Wert
SPLIT_OVERLAP = timedelta(days=10)             # so viele Tage werden beim Ergänzen neu geladen und verglichen
NEWS_RETENTION = timedelta(days=60)


class Store(Protocol):
    def select(self, table: str, columns: str = "*", **filters: str) -> list[dict]: ...
    def upsert(self, table: str, rows: Iterable[dict], on_conflict: Optional[str] = None) -> int: ...
    def delete(self, table: str, **filters: str) -> None: ...


class Fetcher(Protocol):
    def quotes(self, symbols: list[str]) -> dict[str, dict]: ...
    def daily(self, symbol: str, start: Optional[date]) -> list[tuple[date, float]]: ...
    def info(self, symbol: str) -> Optional[dict]: ...
    def news(self, symbol: str, limit: int = 20) -> list[dict]: ...
    def details(self, symbol: str) -> dict: ...


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_date(v) -> date:
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


# ── Lesen ──────────────────────────────────────────────────────

def tracked_symbols(store: Store) -> list[str]:
    return sorted({r["symbol"] for r in store.select("user_tickers", "symbol")})


def symbol_status(store: Store) -> dict[str, str]:
    return {r["symbol"]: r["status"] for r in store.select("symbols", "symbol,status")}


def stored_closes(store: Store, symbol: str, since: date) -> list[tuple[date, float]]:
    rows = store.select("daily_prices", "date,close", symbol=f"eq.{symbol}", date=f"gte.{since.isoformat()}", order="date.asc")
    return [(_to_date(r["date"]), float(r["close"])) for r in rows]


# ── Schreiben ──────────────────────────────────────────────────

def save_quote_and_stats(store: Store, symbol: str, q: dict, today: date) -> None:
    quote = compute_quote(q.get("price"), q.get("prev_close"))
    store.upsert("quotes", [{"symbol": symbol, **quote, "fetched_at": now_iso()}], on_conflict="symbol")
    closes = stored_closes(store, symbol, today - STATS_LOOKBACK)
    stats = compute_stats(closes, quote["price"], quote["prev_close"], today)
    store.upsert("stats", [{"symbol": symbol, "data": {"performance": stats}, "fetched_at": now_iso()}], on_conflict="symbol")


def save_news(store: Store, fetcher: Fetcher, symbol: str) -> int:
    """News sind optional: ein Fehler wird geloggt, bricht das Symbol aber nicht ab."""
    try:
        items = fetcher.news(symbol)
    except Exception as exc:
        log.warning("%s: News nicht verfügbar (%s)", symbol, exc)
        return 0
    if items:
        store.upsert("news", [{"symbol": symbol, **n} for n in items], on_conflict="symbol,id")
    return len(items)


def save_daily(store: Store, fetcher: Fetcher, symbol: str, today: date) -> int:
    """Tageskurse ergänzen; bei erkanntem Split komplett neu laden."""
    recent = stored_closes(store, symbol, today - SPLIT_OVERLAP - timedelta(days=30))
    if recent:
        start = recent[-1][0] - SPLIT_OVERLAP
        fresh = fetcher.daily(symbol, start)
        if split_detected(dict(recent), fresh):
            log.info("%s: abweichende Historie (Split?) – lade komplett neu", symbol)
            store.delete("daily_prices", symbol=f"eq.{symbol}")
            fresh = fetcher.daily(symbol, None)
    else:
        fresh = fetcher.daily(symbol, None)
    if fresh:
        store.upsert("daily_prices", [{"symbol": symbol, "date": d, "close": c} for d, c in fresh], on_conflict="symbol,date")
    return len(fresh)


def save_details(store: Store, fetcher: Fetcher, symbol: str) -> None:
    store.upsert("details", [{"symbol": symbol, "data": fetcher.details(symbol), "fetched_at": now_iso()}], on_conflict="symbol")


# ── Modi ───────────────────────────────────────────────────────

def load_new(store: Store, fetcher: Fetcher, symbol: str, today: date) -> bool:
    """Symbol vollständig laden. False, wenn Yahoo es nicht kennt (Status 'unknown')."""
    info = fetcher.info(symbol)
    if info is None:
        store.upsert("symbols", [{"symbol": symbol, "status": "unknown", "updated_at": now_iso()}], on_conflict="symbol")
        log.warning("%s: bei Yahoo unbekannt", symbol)
        return False
    store.upsert("symbols", [{"symbol": symbol, **info, "status": "ok", "updated_at": now_iso()}], on_conflict="symbol")
    save_daily(store, fetcher, symbol, today)
    q = fetcher.quotes([symbol]).get(symbol)
    if q:
        save_quote_and_stats(store, symbol, q, today)
    save_news(store, fetcher, symbol)
    try:
        save_details(store, fetcher, symbol)
    except Exception as exc:  # Details sind optional
        log.warning("%s: Details fehlgeschlagen (%s)", symbol, exc)
    return True


def run_new(store: Store, fetcher: Fetcher, symbols: list[str], today: date) -> tuple[int, int]:
    ok = failed = 0
    for sym in symbols:
        try:
            store.upsert("symbols", [{"symbol": sym}], on_conflict="symbol")  # existiert evtl. noch nicht
            if load_new(store, fetcher, sym, today):
                ok += 1
        except Exception:
            log.exception("%s: Laden fehlgeschlagen", sym)
            failed += 1
    return ok, failed


def run_quotes(store: Store, fetcher: Fetcher, today: date) -> tuple[int, int]:
    tracked = tracked_symbols(store)
    status = symbol_status(store)
    pending = [s for s in tracked if status.get(s, "pending") == "pending"]
    active = [s for s in tracked if status.get(s) == "ok"]

    ok, failed = run_new(store, fetcher, pending, today)

    quotes = fetcher.quotes(active) if active else {}
    for sym in active:
        try:
            q = quotes.get(sym)
            if not q:
                raise RuntimeError("kein Kurs von Yahoo")
            save_quote_and_stats(store, sym, q, today)
            save_news(store, fetcher, sym)
            ok += 1
        except Exception:
            log.exception("%s: Aktualisierung fehlgeschlagen", sym)
            failed += 1
    return ok, failed


def run_nightly(store: Store, fetcher: Fetcher, today: date) -> tuple[int, int]:
    tracked = set(tracked_symbols(store))
    status = symbol_status(store)

    # Symbole ohne Nutzer entfernen (Marktdaten folgen per ON DELETE CASCADE)
    for sym in sorted(set(status) - tracked):
        store.delete("symbols", symbol=f"eq.{sym}")
    store.delete("news", published_at=f"lt.{(datetime.now(timezone.utc) - NEWS_RETENTION).isoformat()}")

    ok = failed = 0
    for sym in sorted(tracked):
        if status.get(sym) == "unknown":
            continue
        try:
            if status.get(sym) != "ok":
                if not load_new(store, fetcher, sym, today):
                    continue
            else:
                save_daily(store, fetcher, sym, today)
                save_details(store, fetcher, sym)
            ok += 1
        except Exception:
            log.exception("%s: nächtliche Aktualisierung fehlgeschlagen", sym)
            failed += 1
    return ok, failed


# ── Probelauf ohne Datenbank ───────────────────────────────────

class DryRunStore:
    """Gibt Schreibzugriffe aus statt zu schreiben; verfolgte Symbole kommen von der Kommandozeile."""

    def __init__(self, symbols: list[str]):
        self.symbols = symbols
        self.daily: dict[str, list[dict]] = {}  # gemerkt, damit die Performance-Werte berechnet werden

    def select(self, table, columns="*", **filters):
        if table == "user_tickers":
            return [{"symbol": s} for s in self.symbols]
        if table == "daily_prices":
            sym = filters.get("symbol", "eq.")[3:]
            since = filters.get("date", "gte.")[4:]
            return sorted((r for r in self.daily.get(sym, []) if str(r["date"]) >= since), key=lambda r: str(r["date"]))
        return []

    def upsert(self, table, rows, on_conflict=None):
        rows = list(rows)
        if table == "daily_prices":
            for r in rows:
                self.daily.setdefault(r["symbol"], []).append(r)
        for r in rows[:3]:
            print(f"[{table}] {json.dumps(r, default=str, ensure_ascii=False)[:300]}")
        if len(rows) > 3:
            print(f"[{table}] … {len(rows)} Zeilen insgesamt")
        return len(rows)

    def delete(self, table, **filters):
        print(f"[{table}] DELETE {filters}")


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("mode", choices=["quotes", "nightly", "new"])
    parser.add_argument("symbols", nargs="*", type=str.upper)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    from .fetch import YFinanceFetcher
    fetcher = YFinanceFetcher()
    if args.dry_run:
        store: Store = DryRunStore(args.symbols)
    else:
        from .store import SupabaseStore
        store = SupabaseStore()

    today = datetime.now(timezone.utc).date()
    if args.mode == "new":
        if not args.symbols:
            parser.error("Modus 'new' braucht mindestens ein Symbol")
        ok, failed = run_new(store, fetcher, args.symbols, today)
    elif args.mode == "quotes":
        ok, failed = run_quotes(store, fetcher, today)
    else:
        ok, failed = run_nightly(store, fetcher, today)

    log.info("fertig: %d ok, %d fehlgeschlagen", ok, failed)
    return 1 if failed and not ok else 0


if __name__ == "__main__":
    sys.exit(main())
