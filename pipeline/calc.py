"""Reine Rechenfunktionen der Pipeline – ohne Netz, ohne Datenbank."""
from __future__ import annotations

import math
from datetime import date, datetime, timezone
from typing import Any, Iterable, Optional, Sequence

from dateutil.relativedelta import relativedelta

# Zeiträume wie bisher /stats im FastAPI-Backend (Schlüssel bleiben gleich, damit das Frontend passt)
PERIODS: dict[str, relativedelta] = {
    "1wk": relativedelta(weeks=1),
    "1mo": relativedelta(months=1),
    "2mo": relativedelta(months=2),
    "3mo": relativedelta(months=3),
    "6mo": relativedelta(months=6),
    "1y": relativedelta(years=1),
    "5y": relativedelta(years=5),
}

MAX_PLAUSIBLE_RATIO = 100  # wie bisher: Änderung > 10 000 % gilt als Datenfehler


def _valid(x: Any) -> bool:
    return isinstance(x, (int, float)) and math.isfinite(x)


def change(price: Optional[float], base: Optional[float]) -> Optional[dict]:
    """{pct, abs} von base nach price, gerundet; None bei fehlenden oder unplausiblen Werten."""
    if not _valid(price) or not _valid(base) or base == 0:
        return None
    ratio = (price - base) / base
    if abs(ratio) >= MAX_PLAUSIBLE_RATIO:
        return None
    return {"pct": round(ratio * 100, 2), "abs": round(price - base, 2)}


def compute_quote(price: Optional[float], prev_close: Optional[float]) -> dict:
    c = change(price, prev_close)
    return {
        "price": round(price, 4) if _valid(price) else None,
        "prev_close": round(prev_close, 4) if _valid(prev_close) else None,
        "change": c["abs"] if c else None,
        "change_pct": c["pct"] if c else None,
    }


def compute_stats(
    closes: Sequence[tuple[date, float]],
    price: Optional[float],
    prev_close: Optional[float],
    today: date,
) -> dict:
    """Performance je Zeitraum aus Tagesschlusskursen (aufsteigend sortiert).

    Startkurs ist der erste Schlusskurs am oder nach dem Stichtag – wie früher
    `history(period=...)`, das ebenfalls mit dem ersten Handelstag im Fenster beginnt.
    Reicht die Historie nicht bis zum Stichtag zurück, ist der Wert None.
    """
    result: dict[str, Optional[dict]] = {"1d": change(price, prev_close)}
    for label, delta in PERIODS.items():
        cutoff = today - delta
        if not closes or closes[0][0] > cutoff:
            result[label] = None
            continue
        start = next((c for d, c in closes if d >= cutoff), None)
        result[label] = change(price, start)
    return result


def _parse_time(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
        except ValueError:
            return None
    return None


def normalize_news(item: dict) -> Optional[dict]:
    """Eine yfinance-News-Meldung (altes oder neues Format) → {id, title, publisher, link, published_at}."""
    if not isinstance(item, dict):
        return None
    content = item.get("content")
    if isinstance(content, dict):  # neues Format (yfinance ≥ 0.2.48)
        url = (content.get("canonicalUrl") or {}).get("url") or (content.get("clickThroughUrl") or {}).get("url")
        news = {
            "id": item.get("id") or content.get("id"),
            "title": content.get("title"),
            "publisher": (content.get("provider") or {}).get("displayName"),
            "link": url,
            "published_at": _parse_time(content.get("pubDate") or content.get("displayTime")),
        }
    else:  # altes Format
        news = {
            "id": item.get("uuid") or item.get("id"),
            "title": item.get("title"),
            "publisher": item.get("publisher"),
            "link": item.get("link"),
            "published_at": _parse_time(item.get("providerPublishTime")),
        }
    if not news["id"] or not news["title"]:
        return None
    return news


def split_detected(stored: dict[date, float], fresh: Iterable[tuple[date, float]], tolerance: float = 0.01) -> bool:
    """True, wenn sich gespeicherte Schlusskurse an überlappenden Tagen um mehr als `tolerance` unterscheiden.

    Yahoo passt nach einem Aktiensplit die gesamte Historie an; dann muss sie komplett neu geladen werden.
    """
    for d, close in fresh:
        old = stored.get(d)
        if old and _valid(old) and _valid(close) and abs(close / old - 1) > tolerance:
            return True
    return False
