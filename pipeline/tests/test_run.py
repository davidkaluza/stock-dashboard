from datetime import date, timedelta

from pipeline.run import run_new, run_nightly, run_quotes

TODAY = date(2026, 11, 11)
KEYS = {
    "symbols": ("symbol",), "quotes": ("symbol",), "stats": ("symbol",), "details": ("symbol",),
    "news": ("symbol", "id"), "daily_prices": ("symbol", "date"), "user_tickers": ("symbol",),
}


class FakeStore:
    """In-Memory-Nachbau der benutzten PostgREST-Funktionen (eq/gte/lt-Filter, order=…asc)."""

    def __init__(self, user_tickers=(), symbols=None):
        self.tables = {t: {} for t in KEYS}
        for s in user_tickers:
            self.tables["user_tickers"][(s,)] = {"symbol": s}
        for s, status in (symbols or {}).items():
            self.tables["symbols"][(s,)] = {"symbol": s, "status": status}
        self.deleted = []

    @staticmethod
    def _match(row, filters):
        for col, cond in filters.items():
            if col == "order":
                continue
            op, _, val = cond.partition(".")
            cell = str(row.get(col))
            if op == "eq" and cell != val:
                return False
            if op == "gte" and not cell >= val:
                return False
            if op == "lt" and not (row.get(col) is not None and cell < val):
                return False
        return True

    def select(self, table, columns="*", **filters):
        rows = [r for r in self.tables[table].values() if self._match(r, filters)]
        if "order" in filters:
            col = filters["order"].split(".")[0]
            rows.sort(key=lambda r: str(r[col]))
        return [dict(r) for r in rows]

    def upsert(self, table, rows, on_conflict=None):
        n = 0
        for r in rows:
            r = {k: (v.isoformat() if isinstance(v, date) else v) for k, v in r.items()}
            key = tuple(str(r[k]) for k in KEYS[table])
            existing = self.tables[table].get(key, {"status": "pending"} if table == "symbols" else {})
            self.tables[table][key] = {**existing, **r}
            n += 1
        return n

    def delete(self, table, **filters):
        self.deleted.append((table, filters))
        for key, row in list(self.tables[table].items()):
            if self._match(row, filters):
                del self.tables[table][key]
        if table == "symbols":  # ON DELETE CASCADE nachbilden
            gone = {k[0] for k in self.tables["symbols"]}
            for t in ("quotes", "stats", "details", "news", "daily_prices"):
                for key in list(self.tables[t]):
                    if key[0] not in gone:
                        del self.tables[t][key]


class FakeFetcher:
    def __init__(self, known=("SAP.DE", "AAPL"), history=None):
        self.known = set(known)
        self.history = history or {}
        self.daily_calls = []

    def quotes(self, symbols):
        return {s: {"price": 110.0, "prev_close": 100.0} for s in symbols if s in self.known}

    def daily(self, symbol, start):
        self.daily_calls.append((symbol, start))
        rows = self.history.get(symbol, [(TODAY - timedelta(days=i), 100.0) for i in range(400, 0, -1)])
        return [r for r in rows if start is None or r[0] >= start]

    def info(self, symbol):
        return {"name": symbol + " AG", "currency": "EUR", "exchange": "GER"} if symbol in self.known else None

    def news(self, symbol, limit=20):
        return [{"id": f"{symbol}-1", "title": "Meldung", "publisher": "X", "link": "L", "published_at": "2026-11-10T00:00:00+00:00"}]

    def details(self, symbol):
        return {"symbol": symbol, "peRatio": 20}


def test_new_symbol_loaded_completely():
    store, fetcher = FakeStore(["SAP.DE"]), FakeFetcher()
    assert run_new(store, fetcher, ["SAP.DE"], TODAY) == (1, 0)
    sym = store.tables["symbols"][("SAP.DE",)]
    assert sym["status"] == "ok" and sym["name"] == "SAP.DE AG"
    assert store.tables["quotes"][("SAP.DE",)]["change_pct"] == 10.0
    assert store.tables["stats"][("SAP.DE",)]["data"]["performance"]["1mo"]["pct"] == 10.0
    assert len(store.tables["daily_prices"]) == 400
    assert ("SAP.DE", "SAP.DE-1") in store.tables["news"]
    assert store.tables["details"][("SAP.DE",)]["data"]["peRatio"] == 20


def test_unknown_symbol_marked():
    store = FakeStore(["XXXX"])
    run_new(store, FakeFetcher(), ["XXXX"], TODAY)
    assert store.tables["symbols"][("XXXX",)]["status"] == "unknown"
    assert not store.tables["quotes"]


def test_quotes_loads_pending_and_updates_active():
    store = FakeStore(["SAP.DE", "AAPL", "XXXX"], symbols={"AAPL": "ok", "XXXX": "unknown"})
    ok, failed = run_quotes(store, FakeFetcher(), TODAY)
    assert (ok, failed) == (2, 0)  # SAP.DE neu (pending ohne symbols-Zeile), AAPL aktualisiert; XXXX übersprungen
    assert store.tables["symbols"][("SAP.DE",)]["status"] == "ok"
    assert ("AAPL",) in store.tables["quotes"]
    assert ("XXXX",) not in store.tables["quotes"]


def test_quotes_counts_missing_price_as_failure():
    store = FakeStore(["AAPL"], symbols={"AAPL": "ok"})
    assert run_quotes(store, FakeFetcher(known=()), TODAY) == (0, 1)


def test_nightly_removes_orphans_and_extends_history():
    store = FakeStore(["SAP.DE"], symbols={"SAP.DE": "ok", "OLD": "ok"})
    store.upsert("quotes", [{"symbol": "OLD", "price": 1}])
    old_rows = [(TODAY - timedelta(days=i), 100.0) for i in range(400, 20, -1)]
    store.upsert("daily_prices", [{"symbol": "SAP.DE", "date": d, "close": c} for d, c in old_rows])
    fetcher = FakeFetcher()

    assert run_nightly(store, fetcher, TODAY) == (1, 0)
    assert ("OLD",) not in store.tables["symbols"]
    assert ("OLD",) not in store.tables["quotes"]  # Cascade
    # nur ergänzt (mit Überlappung), nicht komplett neu geladen
    assert fetcher.daily_calls == [("SAP.DE", TODAY - timedelta(days=21) - timedelta(days=10))]
    assert len(store.tables["daily_prices"]) == 400
    assert ("SAP.DE",) in store.tables["details"]


def test_nightly_reloads_full_history_after_split():
    store = FakeStore(["SAP.DE"], symbols={"SAP.DE": "ok"})
    store.upsert("daily_prices", [{"symbol": "SAP.DE", "date": TODAY - timedelta(days=i), "close": 200.0} for i in range(30, 5, -1)])
    fetcher = FakeFetcher()  # liefert 100.0 → wirkt wie ein 2:1-Split
    run_nightly(store, fetcher, TODAY)
    assert fetcher.daily_calls[-1] == ("SAP.DE", None)
    assert ("daily_prices", {"symbol": "eq.SAP.DE"}) in store.deleted
    assert {r["close"] for r in store.tables["daily_prices"].values()} == {100.0}
