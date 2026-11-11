import json
from datetime import date

import pytest

from pipeline import store as store_mod
from pipeline.store import SupabaseStore, clean


class Resp:
    def __init__(self, status=200, payload=None):
        self.status_code = status
        self._payload = payload or []
        self.text = json.dumps(self._payload)
        self.url = "u"
        self.request = type("R", (), {"method": "X"})()

    def json(self):
        return self._payload


def test_clean_handles_nan_dates_and_nesting():
    assert clean({"a": float("nan"), "b": [float("inf"), 1.5], "d": date(2026, 1, 2)}) == {"a": None, "b": [None, 1.5], "d": "2026-01-02"}


def test_headers_for_new_and_legacy_keys():
    new = SupabaseStore("https://x.supabase.co", "sb_secret_abc")
    assert new.session.headers["apikey"] == "sb_secret_abc"
    assert "Authorization" not in new.session.headers
    legacy = SupabaseStore("https://x.supabase.co", "eyJhbGciOi")
    assert legacy.session.headers["Authorization"] == "Bearer eyJhbGciOi"


def test_upsert_chunks_and_cleans(monkeypatch):
    s = SupabaseStore("https://x.supabase.co/", "sb_secret_abc")
    calls = []
    monkeypatch.setattr(s.session, "post", lambda url, **kw: calls.append((url, kw)) or Resp(201))
    monkeypatch.setattr(store_mod, "CHUNK", 2)
    n = s.upsert("daily_prices", [{"symbol": "A", "date": date(2026, 1, i), "close": float("nan") if i == 1 else 1.0} for i in range(1, 6)], on_conflict="symbol,date")
    assert n == 5 and len(calls) == 3
    url, kw = calls[0]
    assert url == "https://x.supabase.co/rest/v1/daily_prices"
    assert kw["params"] == {"on_conflict": "symbol,date"}
    assert "merge-duplicates" in kw["headers"]["Prefer"]
    assert json.loads(kw["data"])[0] == {"symbol": "A", "date": "2026-01-01", "close": None}


def test_select_pages_through_results(monkeypatch):
    s = SupabaseStore("https://x.supabase.co", "sb_secret_abc")
    pages = [Resp(200, [{"i": i} for i in range(1000)]), Resp(200, [{"i": 1000}])]
    monkeypatch.setattr(s.session, "get", lambda url, **kw: pages.pop(0))
    assert len(s.select("symbols")) == 1001


def test_errors_raise_and_unfiltered_delete_refused(monkeypatch):
    s = SupabaseStore("https://x.supabase.co", "sb_secret_abc")
    monkeypatch.setattr(s.session, "get", lambda url, **kw: Resp(401, {"message": "no"}))
    with pytest.raises(RuntimeError):
        s.select("symbols")
    with pytest.raises(ValueError):
        s.delete("symbols")
