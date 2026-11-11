from datetime import date, timedelta

from pipeline.calc import change, compute_quote, compute_stats, normalize_news, split_detected


def test_change_basic():
    assert change(110.0, 100.0) == {"pct": 10.0, "abs": 10.0}
    assert change(90.0, 100.0) == {"pct": -10.0, "abs": -10.0}


def test_change_invalid_values():
    assert change(None, 100.0) is None
    assert change(100.0, 0) is None
    assert change(float("nan"), 100.0) is None
    assert change(1_000_000.0, 1.0) is None  # unplausibel (> 10 000 %)


def test_compute_quote():
    q = compute_quote(105.0, 100.0)
    assert q == {"price": 105.0, "prev_close": 100.0, "change": 5.0, "change_pct": 5.0}
    assert compute_quote(105.0, None)["change_pct"] is None


def daily_series(start: date, end: date, value_for):
    d, rows = start, []
    while d <= end:
        if d.weekday() < 5:
            rows.append((d, value_for(d)))
        d += timedelta(days=1)
    return rows


def test_compute_stats_uses_first_close_on_or_after_cutoff():
    today = date(2026, 11, 11)
    closes = daily_series(date(2020, 1, 1), today - timedelta(days=1), lambda d: 100.0 if d < date(2026, 10, 11) else 200.0)
    stats = compute_stats(closes, price=220.0, prev_close=200.0, today=today)
    assert stats["1d"] == {"pct": 10.0, "abs": 20.0}
    # Stichtag 1mo = 2026-10-11 (Sonntag) → erster Kurs am Montag 2026-10-12 = 200
    assert stats["1mo"] == {"pct": 10.0, "abs": 20.0}
    # 3mo liegt vor dem Sprung → Startkurs 100
    assert stats["3mo"] == {"pct": 120.0, "abs": 120.0}
    assert stats["5y"]["pct"] == 120.0


def test_compute_stats_missing_history_is_none():
    today = date(2026, 11, 11)
    closes = daily_series(date(2026, 6, 1), today, lambda d: 50.0)
    stats = compute_stats(closes, price=55.0, prev_close=50.0, today=today)
    assert stats["3mo"] == {"pct": 10.0, "abs": 5.0}
    assert stats["6mo"] is None  # Historie beginnt erst nach dem Stichtag
    assert stats["1y"] is None
    assert stats["5y"] is None


def test_compute_stats_empty():
    stats = compute_stats([], price=10.0, prev_close=None, today=date(2026, 1, 1))
    assert set(stats) == {"1d", "1wk", "1mo", "2mo", "3mo", "6mo", "1y", "5y"}
    assert all(v is None for v in stats.values())


def test_normalize_news_new_format():
    item = {
        "id": "abc",
        "content": {
            "title": "SAP steigt",
            "pubDate": "2026-11-10T08:30:00Z",
            "provider": {"displayName": "Reuters"},
            "canonicalUrl": {"url": "https://example.com/a"},
        },
    }
    assert normalize_news(item) == {
        "id": "abc", "title": "SAP steigt", "publisher": "Reuters",
        "link": "https://example.com/a", "published_at": "2026-11-10T08:30:00+00:00",
    }


def test_normalize_news_old_format():
    item = {"uuid": "u1", "title": "T", "publisher": "P", "link": "L", "providerPublishTime": 0}
    assert normalize_news(item) == {
        "id": "u1", "title": "T", "publisher": "P", "link": "L", "published_at": "1970-01-01T00:00:00+00:00",
    }


def test_normalize_news_rejects_incomplete():
    assert normalize_news({"id": "x", "content": {}}) is None
    assert normalize_news("kaputt") is None


def test_split_detected():
    stored = {date(2026, 1, 5): 100.0, date(2026, 1, 6): 102.0}
    assert not split_detected(stored, [(date(2026, 1, 6), 102.5), (date(2026, 1, 7), 103.0)])
    assert split_detected(stored, [(date(2026, 1, 6), 51.0)])  # 2:1-Split
    assert not split_detected({}, [(date(2026, 1, 6), 51.0)])
