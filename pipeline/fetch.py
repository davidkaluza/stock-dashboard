"""yfinance-Zugriffe der Pipeline. Alles mit Netz liegt hier, damit run.py testbar bleibt."""
from __future__ import annotations

import logging
import math
import time
from datetime import date
from typing import Any, Callable, Optional, TypeVar

import pandas as pd
import yfinance as yf

from .calc import normalize_news

log = logging.getLogger(__name__)
T = TypeVar("T")

RETRIES = 3
RETRY_BASE_DELAY = 5  # s, wächst 5 → 10 → 20


def _is_rate_limit(exc: Exception) -> bool:
    text = f"{type(exc).__name__} {exc}".lower()
    return "ratelimit" in text or "too many requests" in text or "429" in text


def with_retry(fn: Callable[[], T], what: str) -> T:
    """Bei Drosselung durch Yahoo bis zu RETRIES-mal mit wachsender Pause wiederholen."""
    for attempt in range(RETRIES + 1):
        try:
            return fn()
        except Exception as exc:
            if attempt == RETRIES or not _is_rate_limit(exc):
                raise
            delay = RETRY_BASE_DELAY * 2 ** attempt
            log.warning("%s: von Yahoo gedrosselt, neuer Versuch in %ss", what, delay)
            time.sleep(delay)
    raise AssertionError("unreachable")


def _num(v: Any) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


class YFinanceFetcher:
    def quotes(self, symbols: list[str]) -> dict[str, dict]:
        """Aktueller Kurs + Vortagesschluss für viele Symbole in einem Abruf.

        Liefert {symbol: {"price", "prev_close"}}; Symbole ohne Daten fehlen im Ergebnis.
        """
        if not symbols:
            return {}
        df = with_retry(
            lambda: yf.download(
                symbols, period="5d", interval="1d", auto_adjust=False,
                progress=False, threads=True, multi_level_index=True,
            ),
            "Kurse",
        )
        result: dict[str, dict] = {}
        if df is None or df.empty or "Close" not in df.columns.get_level_values(0):
            return result
        closes = df["Close"]
        for sym in symbols:
            if sym not in closes.columns:
                continue
            series = closes[sym].dropna()
            if series.empty:
                continue
            price = _num(series.iloc[-1])
            prev = _num(series.iloc[-2]) if len(series) > 1 else None
            if price is not None:
                result[sym] = {"price": price, "prev_close": prev}
        return result

    def daily(self, symbol: str, start: Optional[date]) -> list[tuple[date, float]]:
        """Tagesschlusskurse (split-bereinigt, nicht dividendenbereinigt) ab `start`, sonst 10 Jahre."""
        kwargs = {"start": start.isoformat()} if start else {"period": "10y"}
        hist = with_retry(
            lambda: yf.Ticker(symbol).history(interval="1d", auto_adjust=False, **kwargs),
            f"Historie {symbol}",
        )
        if hist is None or hist.empty:
            return []
        rows = []
        for idx, close in hist["Close"].items():
            c = _num(close)
            if c is not None:
                rows.append((pd.Timestamp(idx).date(), round(c, 4)))
        return rows

    def info(self, symbol: str) -> Optional[dict]:
        """Name, Währung, Börse – oder None, wenn Yahoo das Symbol nicht kennt."""
        ticker = yf.Ticker(symbol)
        try:
            fi = ticker.fast_info
            currency = fi.currency
            last = _num(fi.last_price)
        except Exception:
            return None
        if last is None:
            return None
        name = None
        exchange = None
        try:
            info = with_retry(lambda: ticker.info, f"Info {symbol}") or {}
            name = info.get("longName") or info.get("shortName")
            exchange = info.get("exchange")
        except Exception as exc:  # Name ist nett, aber nicht nötig
            log.info("%s: keine Stammdaten (%s)", symbol, exc)
        return {"name": name or symbol, "currency": currency, "exchange": exchange}

    def news(self, symbol: str, limit: int = 20) -> list[dict]:
        raw = with_retry(lambda: yf.Ticker(symbol).news, f"News {symbol}") or []
        items = [normalize_news(n) for n in raw[:limit]]
        return [n for n in items if n]

    def details(self, symbol: str) -> dict:
        """Fundamentaldaten + Analystenschätzungen (übernommen aus dem FastAPI-Endpoint /detail)."""
        ticker = yf.Ticker(symbol)
        fi = ticker.fast_info
        info: dict = {}
        try:
            info = with_retry(lambda: ticker.info, f"Details {symbol}") or {}
        except Exception:
            pass

        def rounded_rows(frame) -> list[dict]:
            rows = []
            for idx, row in frame.iterrows():
                rows.append({
                    "period": str(idx),
                    **{k: (round(row.get(k), 2) if pd.notna(row.get(k)) else None) for k in ("avg", "low", "high")},
                })
            return rows

        analyst: dict[str, Any] = {}
        try:
            pt = ticker.analyst_price_targets or {}
            analyst["priceTargets"] = {k: pt.get(k) for k in ("current", "mean", "median", "high", "low")}
        except Exception:
            pass
        try:
            rs = ticker.recommendations_summary
            if rs is not None and not rs.empty:
                analyst["recommendations"] = {
                    k: (int(v) if isinstance(v, (int, float)) and pd.notna(v) else v)
                    for k, v in rs.iloc[0].to_dict().items()
                }
        except Exception:
            pass
        for attr, key in (("earnings_estimate", "earningsEstimate"), ("revenue_estimate", "revenueEstimate")):
            try:
                frame = getattr(ticker, attr)
                if frame is not None and not frame.empty:
                    analyst[key] = rounded_rows(frame)
            except Exception:
                pass
        try:
            ge = ticker.growth_estimates
            if ge is not None and not ge.empty:
                analyst["growthEstimates"] = {
                    str(idx): next((round(row[c], 2) for c in ge.columns if pd.notna(row[c])), None)
                    for idx, row in ge.iterrows()
                }
        except Exception:
            pass

        def fast(attr: str, key: str):
            try:
                v = getattr(fi, attr)
            except Exception:
                v = None
            return v if v is not None else info.get(key)

        return {
            "symbol": symbol,
            "name": info.get("longName") or info.get("shortName", ""),
            "currency": fast("currency", "currency"),
            "price": fast("last_price", "currentPrice"),
            "previousClose": fast("previous_close", "previousClose"),
            "marketCap": fast("market_cap", "marketCap"),
            "peRatio": info.get("trailingPE"),
            "forwardPE": info.get("forwardPE"),
            "dividendYield": info.get("dividendYield"),
            "dividendRate": info.get("dividendRate"),
            "beta": info.get("beta"),
            "high52w": fast("year_high", "fiftyTwoWeekHigh"),
            "low52w": fast("year_low", "fiftyTwoWeekLow"),
            "avgVolume": info.get("averageVolume"),
            "volume": info.get("volume"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "description": info.get("longBusinessSummary"),
            "employees": info.get("fullTimeEmployees"),
            "website": info.get("website"),
            "country": info.get("country"),
            "exchange": info.get("exchange"),
            "analyst": analyst,
        }
