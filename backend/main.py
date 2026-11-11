import json
import numpy as np
import os
import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.responses import JSONResponse
import yfinance as yf
import pandas as pd
from typing import List, Dict, Any, Optional


def clean_nans(obj):
    if isinstance(obj, dict):
        return {k: clean_nans(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_nans(v) for v in obj]
    elif isinstance(obj, (np.floating,)):
        v = float(obj)
        return None if (np.isnan(v) or np.isinf(v)) else v
    elif isinstance(obj, float):
        return None if (np.isnan(obj) or np.isinf(obj)) else obj
    elif isinstance(obj, (np.integer,)):
        return int(obj)
    elif isinstance(obj, (np.bool_,)):
        return bool(obj)
    elif isinstance(obj, (np.ndarray,)):
        return clean_nans(obj.tolist())
    return obj


original_render = JSONResponse.render


def json_safe_render(self, content):
    content = clean_nans(content)
    return json.dumps(
        content,
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


JSONResponse.render = json_safe_render

app = FastAPI()

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Supabase/PostgreSQL (optionale Caching-DB) ──────────────────

DB_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "db_config.json")

_db_conn = None
_last_connect_attempt = 0.0
RECONNECT_INTERVAL = 30  # s; avoids a connect timeout on every request while the DB is down
_cache_ttl = 3600  # default 1h
_cache_enabled = False
_offline_mode = False

CACHE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS stock_cache (
    key            text PRIMARY KEY,
    data           jsonb NOT NULL,
    fetched_at     double precision NOT NULL,
    fetched_at_iso text,
    cache_type     text
)
"""


class DbConfig(BaseModel):
    uri: str = ""
    ttl: int = 3600
    enabled: bool = False
    offline: bool = False


class CacheRefreshRequest(BaseModel):
    symbols: List[str]
    history_periods: List[str] = ["1mo", "6mo", "1y", "5y", "max"]
    include_detail: bool = True
    include_news: bool = True


def load_db_config() -> DbConfig:
    """Load database settings. Environment variables win over the JSON file.

    DATABASE_URL is a PostgreSQL URI, e.g. the Supabase "Session pooler"
    connection string. For a local run, db_config.json or Settings in the UI
    can still be used.
    """
    cfg = DbConfig()
    try:
        with open(DB_CONFIG_PATH) as f:
            cfg = DbConfig(**json.load(f))
    except Exception:
        pass

    env_uri = os.getenv("DATABASE_URL")
    if env_uri:
        cfg.uri = env_uri
        cfg.enabled = os.getenv("DB_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
    env_ttl = os.getenv("CACHE_TTL")
    if env_ttl:
        try:
            cfg.ttl = int(env_ttl)
        except ValueError:
            pass
    env_offline = os.getenv("OFFLINE_MODE")
    if env_offline is not None:
        cfg.offline = env_offline.lower() in {"1", "true", "yes", "on"}
    return cfg


def save_db_config(cfg: DbConfig):
    with open(DB_CONFIG_PATH, "w") as f:
        json.dump({"uri": cfg.uri, "ttl": cfg.ttl, "enabled": cfg.enabled, "offline": cfg.offline}, f)


def _close_db():
    global _db_conn
    if _db_conn is not None:
        try:
            _db_conn.close()
        except Exception:
            pass
    _db_conn = None


def connect_db(cfg: DbConfig):
    global _db_conn, _cache_ttl, _cache_enabled, _offline_mode, _last_connect_attempt
    _last_connect_attempt = time.time()
    _cache_enabled = cfg.enabled
    _offline_mode = cfg.offline
    _close_db()
    if not cfg.uri:
        return
    try:
        import psycopg
        # prepare_threshold=None: works with Supabase session and transaction pooler
        _db_conn = psycopg.connect(cfg.uri, autocommit=True, connect_timeout=5, prepare_threshold=None)
        _db_conn.execute(CACHE_TABLE_SQL)
        _cache_ttl = cfg.ttl
    except Exception:
        _close_db()


def db_connected() -> bool:
    return _db_conn is not None and not _db_conn.closed


def ensure_db_connected() -> bool:
    """Reconnect lazily, e.g. after the pooler dropped an idle connection."""
    if db_connected():
        return True
    if time.time() - _last_connect_attempt < RECONNECT_INTERVAL:
        return False
    cfg = load_db_config()
    if cfg.uri and cfg.enabled:
        connect_db(cfg)
    return db_connected()


def cache_conn():
    if not _cache_enabled or not ensure_db_connected():
        return None
    return _db_conn


def _cache_execute(sql: str, params: tuple = ()):
    """Run a statement; on a broken connection reconnect once and retry."""
    import psycopg
    for attempt in range(2):
        conn = cache_conn()
        if conn is None:
            return None
        try:
            return conn.execute(sql, params)
        except psycopg.OperationalError:
            _close_db()
            if attempt:
                raise


def cache_get(key: str, allow_stale: Optional[bool] = None) -> Optional[dict]:
    try:
        cur = _cache_execute("SELECT data, fetched_at, fetched_at_iso FROM stock_cache WHERE key = %s", (key,))
        row = cur.fetchone() if cur else None
        if not row:
            return None
        data, fetched_at, fetched_at_iso = row
        if allow_stale is None:
            allow_stale = _offline_mode
        if allow_stale or time.time() - fetched_at < _cache_ttl:
            if isinstance(data, dict):
                data = {**data, "_cache": {
                    "key": key,
                    "fetched_at": fetched_at,
                    "fetched_at_iso": fetched_at_iso,
                    "stale": time.time() - fetched_at >= _cache_ttl,
                    "offline": _offline_mode,
                }}
            return data
    except Exception:
        pass
    return None


def cache_set(key: str, data: dict):
    try:
        from psycopg.types.json import Jsonb
        now = time.time()
        _cache_execute(
            """
            INSERT INTO stock_cache (key, data, fetched_at, fetched_at_iso, cache_type)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (key) DO UPDATE SET
                data = EXCLUDED.data,
                fetched_at = EXCLUDED.fetched_at,
                fetched_at_iso = EXCLUDED.fetched_at_iso,
                cache_type = EXCLUDED.cache_type
            """,
            (
                key,
                # jsonb rejects NaN/Inf, so clean like the JSON responses
                Jsonb(clean_nans(data)),
                now,
                pd.Timestamp.fromtimestamp(now, tz="UTC").isoformat(),
                key.split("_", 1)[0],
            ),
        )
    except Exception:
        pass


def cache_delete(key: str):
    try:
        _cache_execute("DELETE FROM stock_cache WHERE key = %s", (key,))
    except Exception:
        pass


def raise_if_offline_without_cache(symbol: str):
    if _cache_enabled and _offline_mode:
        raise HTTPException(
            status_code=503,
            detail=f"Offline-Modus aktiv: Keine gespeicherten Daten fuer {symbol} in der Datenbank gefunden. Bitte online aktualisieren.",
        )


# connect on startup if config exists
_startup_cfg = load_db_config()
if _startup_cfg.uri:
    connect_db(_startup_cfg)


@app.get("/db/status")
async def db_status():
    ensure_db_connected()
    return {"connected": db_connected(), "ttl": _cache_ttl, "enabled": _cache_enabled, "offline": _offline_mode}


@app.post("/db/config")
async def db_configure(cfg: DbConfig):
    save_db_config(cfg)
    connect_db(cfg)
    return {"connected": db_connected(), "enabled": cfg.enabled, "offline": cfg.offline}


@app.get("/db/config")
async def db_get_config():
    ensure_db_connected()
    cfg = load_db_config()
    return {"uri": cfg.uri, "ttl": cfg.ttl, "enabled": cfg.enabled, "offline": cfg.offline, "connected": db_connected()}


@app.get("/db/cache/summary")
async def db_cache_summary(symbols: str = ""):
    requested = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    try:
        cur = _cache_execute("SELECT key, fetched_at, fetched_at_iso FROM stock_cache ORDER BY fetched_at DESC LIMIT 2000")
    except Exception:
        cur = None
    if cur is None:
        return {"connected": db_connected(), "enabled": _cache_enabled, "offline": _offline_mode, "items": {}, "total_keys": 0}
    rows = cur.fetchall()
    items: Dict[str, Any] = {}
    for key, fetched_at, fetched_at_iso in rows:
        parts = key.split("_")
        if len(parts) < 2:
            continue
        cache_type = parts[0]
        symbol = parts[1].upper()
        if requested and symbol not in requested:
            continue
        entry = items.setdefault(symbol, {"symbol": symbol, "keys": [], "types": {}, "last_fetched_at": None, "last_fetched_at_iso": None})
        entry["keys"].append(key)
        entry["types"][cache_type] = entry["types"].get(cache_type, 0) + 1
        if entry["last_fetched_at"] is None or fetched_at > entry["last_fetched_at"]:
            entry["last_fetched_at"] = fetched_at
            entry["last_fetched_at_iso"] = fetched_at_iso
    last_fetched_at = None
    stale_all = False
    for entry in items.values():
        ts = entry.get("last_fetched_at")
        if ts is not None and (last_fetched_at is None or ts > last_fetched_at):
            last_fetched_at = ts
    if last_fetched_at is not None:
        stale_all = time.time() - last_fetched_at >= _cache_ttl
    return {"connected": db_connected(), "enabled": _cache_enabled, "offline": _offline_mode, "items": items, "total_keys": len(rows), "last_fetched_at": last_fetched_at, "stale_all": stale_all}


@app.post("/db/refresh")
async def db_refresh(req: CacheRefreshRequest):
    global _offline_mode
    ensure_db_connected()
    if not db_connected() or not _cache_enabled:
        raise HTTPException(status_code=400, detail="Datenbank ist nicht verbunden oder Cache ist deaktiviert.")
    symbols = []
    for raw in req.symbols:
        sym = raw.strip().upper()
        if sym and sym not in symbols:
            symbols.append(sym)
    if not symbols:
        raise HTTPException(status_code=400, detail="Keine Symbole uebergeben.")

    old_offline = _offline_mode
    _offline_mode = False
    refreshed: Dict[str, Any] = {}
    try:
        for symbol in symbols:
            result = {"ok": [], "errors": []}
            for key in [f"price_{symbol}", f"stats_{symbol}"]:
                cache_delete(key)
            try:
                await get_price(symbol)
                result["ok"].append("price")
            except Exception as e:
                result["errors"].append({"type": "price", "error": str(e)})
            try:
                await get_stats(symbol)
                result["ok"].append("stats")
            except Exception as e:
                result["errors"].append({"type": "stats", "error": str(e)})
            if req.include_detail:
                cache_delete(f"detail_{symbol}")
                try:
                    await get_detail(symbol)
                    result["ok"].append("detail")
                except Exception as e:
                    result["errors"].append({"type": "detail", "error": str(e)})
            if req.include_news:
                cache_delete(f"news_{symbol}")
                try:
                    await get_news(symbol)
                    result["ok"].append("news")
                except Exception as e:
                    result["errors"].append({"type": "news", "error": str(e)})
            for period in req.history_periods:
                cache_delete(f"history_{symbol}_{period}")
                try:
                    await get_history(symbol, period=period)
                    result["ok"].append(f"history:{period}")
                except Exception as e:
                    result["errors"].append({"type": f"history:{period}", "error": str(e)})
            refreshed[symbol] = result
    finally:
        _offline_mode = old_offline
    return {"symbols": symbols, "refreshed": refreshed}


# ── WKN → Ticker ───────────────────────────────────────────────

WKN_MAP = {
    "723610": "SAP.DE",
    "716460": "BAS.DE",
    "840100": "BAYN.DE",
    "DATX01": "DAI.DE",
    "A1EWWW": "BMW.DE",
    "A1ML7J": "VNA.DE",
    "A1JWVX": "DBK.DE",
    "A1RFDG": "DBK.DE",
    "510700": "ALV.DE",
    "A0D9PT": "SIE.DE",
    "A0JL6D": "VOD.DE",
    "A1ML7Q": "DTE.DE",
    "A2AAJ2": "ADS.DE",
    "A1RFMY": "EOAN.DE",
    "A1RX8Y": "MUV2.DE",
    "A2E4L4": "DEQ.DE",
    "A0XYHG": "FME.DE",
    "A1M93W": "FRE.DE",
    "A0F5UF": "LXS.DE",
    "A1R0LA": "TKA.DE",
    "A1E8S2": "RWE.DE",
    "A0M4V6": "EVK.DE",
    "A1XBS4": "HEI.DE",
    "A2DAJ0": "SDF.DE",
    "A0MSAG": "SZU.DE",
    "A1C8B9": "SZU.DE",
    "A0D9PU": "HNR1.DE",
    "A0L1N0": "KSP.DE",
    "A2E4E9": "PBB.DE",
    "A1X7XQ": "MTX.DE",
    "A2E4L0": "AIXA.DE",
    "A1R0BA": "G1A.DE",
    "A1X3GW": "S92.DE",
    "A1RRLE": "NUE.DE",
    "A0L1QQ": "F3R1.DE",
    "A2GS5D": "SHL.DE",
    "A0L1H0": "LHA.DE",
    "A2NBH8": "ZAL.DE",
    "A0Z2Y5": "SAX.DE",
    "A1DAHH": "AT1.DE",
    "A0M8LR": "B4B.DE",
    "A0WMPJ": "WDI.DE",
    "A1JNV1": "KCO.DE",
    "A0L1K4": "LEO.DE",
    "A1E8SW": "TTF.DE",
    "A0F5CH": "SRT3.DE",
    "A1R1A3": "M3V.DE",
    "A2NBHH": "BVB.DE",
    "A1YDDM": "COK.DE",
    "A0D9R4": "A6T.DE",
}


def resolve_symbol(symbol: str) -> str:
    symbol = symbol.upper().strip()
    if '.' in symbol or len(symbol) <= 5:
        return symbol
    if symbol.isdigit() and len(symbol) == 6:
        if symbol in WKN_MAP:
            return WKN_MAP[symbol]
        return symbol + ".DE"
    return symbol

# ── API-Endpunkte ──────────────────────────────────────────────


@app.get("/stats/{symbol}")
async def get_stats(symbol: str):
    cache_key = f"stats_{symbol}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    raise_if_offline_without_cache(symbol)

    try:
        ticker_symbol = resolve_symbol(symbol)
        ticker = yf.Ticker(ticker_symbol)
        info = ticker.fast_info
        current_price = info.last_price

        periods = {
            "1d": "2d", "1wk": "5d", "1mo": "1mo",
            "2mo": "2mo", "3mo": "3mo", "6mo": "6mo",
            "1y": "1y", "5y": "5y"
        }

        stats = {}
        for label, period in periods.items():
            if label == "2mo":
                start_date = (pd.Timestamp.now() - pd.Timedelta(days=61)).strftime("%Y-%m-%d")
                hist = ticker.history(start=start_date)
            else:
                hist = ticker.history(period=period)
            if not hist.empty:
                start_price = hist['Close'].iloc[0]
                change_abs = round(current_price - start_price, 2)
                if start_price and abs((current_price - start_price) / start_price) < 100:
                    change_pct = round(((current_price - start_price) / start_price) * 100, 2)
                    stats[label] = {"pct": change_pct, "abs": change_abs}
                else:
                    stats[label] = None
            else:
                stats[label] = None

        result = {
            "symbol": ticker_symbol,
            "current_price": round(current_price, 2),
            "performance": stats,
            "currency": info.currency
        }
        cache_set(cache_key, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Error fetching stats for {symbol}: {str(e)}")


@app.get("/price/{symbol}")
async def get_price(symbol: str):
    cache_key = f"price_{symbol}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    raise_if_offline_without_cache(symbol)

    try:
        ticker_symbol = resolve_symbol(symbol)
        ticker = yf.Ticker(ticker_symbol)
        info = ticker.fast_info

        current_price = info.last_price
        previous_close = info.previous_close
        change = current_price - previous_close
        change_percent = (change / previous_close) * 100 if previous_close else 0

        try:
            company_name = info.long_name if hasattr(info, 'long_name') else ticker.info.get('shortName', '')
        except Exception:
            company_name = ''

        result = {
            "symbol": ticker_symbol,
            "name": company_name,
            "price": round(current_price, 2),
            "change": round(change, 2),
            "change_percent": round(change_percent, 2),
            "currency": info.currency
        }
        cache_set(cache_key, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not find data for {symbol}. Please try the Ticker symbol (e.g., SAP.DE). Error: {str(e)}")


@app.get("/history/{symbol}")
async def get_history(symbol: str, period: str = "1mo", start: str = None):
    cache_key = f"history_{symbol}_{period or start}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    raise_if_offline_without_cache(symbol)

    try:
        ticker_symbol = resolve_symbol(symbol)
        ticker = yf.Ticker(ticker_symbol)

        if start:
            hist = ticker.history(start=start)
        else:
            hist = ticker.history(period=period)
        if hist.empty:
            raise HTTPException(status_code=404, detail="No history found")

        closes = hist['Close']
        valid = [
            (d.strftime('%Y-%m-%d'), round(float(p), 2))
            for d, p in zip(hist.index, closes)
            if pd.notna(p)
        ] if hasattr(hist.index, 'strftime') else [
            (str(i), round(float(p), 2))
            for i, p in enumerate(closes)
            if pd.notna(p)
        ]
        prices = [v[1] for v in valid]
        dates = [v[0] for v in valid]

        result = {
            "symbol": ticker_symbol,
            "period": period,
            "start": start,
            "prices": prices,
            "dates": dates
        }
        cache_set(cache_key, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Error fetching history for {symbol}: {str(e)}")


@app.get("/news/{symbol}")
async def get_news(symbol: str):
    cache_key = f"news_{symbol}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    raise_if_offline_without_cache(symbol)

    try:
        ticker_symbol = resolve_symbol(symbol)
        ticker = yf.Ticker(ticker_symbol)
        news = ticker.news

        result = []
        for item in news[:5]:
            result.append({
                "title": item.get("title"),
                "publisher": item.get("publisher"),
                "link": item.get("link"),
                "providerPublishTime": item.get("providerPublishTime")
            })
        cache_set(cache_key, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Error fetching news for {symbol}: {str(e)}")


@app.get("/detail/{symbol}")
async def get_detail(symbol: str):
    cache_key = f"detail_{symbol}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    raise_if_offline_without_cache(symbol)

    try:
        ticker_symbol = resolve_symbol(symbol)
        ticker = yf.Ticker(ticker_symbol)

        fi = ticker.fast_info
        info = {}
        try:
            info = ticker.info
        except Exception:
            pass

        analyst = {}
        try:
            pt = ticker.analyst_price_target or ticker.analyst_price_targets or {}
            analyst["priceTargets"] = {
                "current": pt.get("current"),
                "mean": pt.get("mean"),
                "median": pt.get("median"),
                "high": pt.get("high"),
                "low": pt.get("low"),
            }
        except Exception:
            pass

        try:
            rs = ticker.recommendations_summary
            if rs is not None and not rs.empty:
                analyst["recommendations"] = {
                    k: int(v) for k, v in rs.iloc[0].to_dict().items()
                }
        except Exception:
            pass

        try:
            ee = ticker.earnings_estimate
            if ee is not None and not ee.empty:
                analyst["earningsEstimate"] = []
                for idx, row in ee.iterrows():
                    analyst["earningsEstimate"].append({
                        "period": str(idx),
                        "avg": round(row.get("avg", 0), 2) if pd.notna(row.get("avg")) else None,
                        "low": round(row.get("low", 0), 2) if pd.notna(row.get("low")) else None,
                        "high": round(row.get("high", 0), 2) if pd.notna(row.get("high")) else None,
                    })
        except Exception:
            pass

        try:
            re = ticker.revenue_estimate
            if re is not None and not re.empty:
                analyst["revenueEstimate"] = []
                for idx, row in re.iterrows():
                    analyst["revenueEstimate"].append({
                        "period": str(idx),
                        "avg": round(row.get("avg", 0), 2) if pd.notna(row.get("avg")) else None,
                        "low": round(row.get("low", 0), 2) if pd.notna(row.get("low")) else None,
                        "high": round(row.get("high", 0), 2) if pd.notna(row.get("high")) else None,
                    })
        except Exception:
            pass

        try:
            ge = ticker.growth_estimates
            if ge is not None and not ge.empty:
                analyst["growthEstimates"] = {}
                for idx, row in ge.iterrows():
                    val = None
                    for c in ge.columns:
                        if pd.notna(row[c]):
                            val = round(row[c], 2)
                            break
                    analyst["growthEstimates"][str(idx)] = val
        except Exception:
            pass

        def g(v, fallback=None):
            return v if v is not None else fallback

        result = {
            "symbol": ticker_symbol,
            "name": g(info.get("longName"), info.get("shortName", "")),
            "currency": g(getattr(fi, "currency", None), info.get("currency", "")),
            "price": g(getattr(fi, "last_price", None), info.get("currentPrice", 0)),
            "previousClose": g(getattr(fi, "previous_close", None), info.get("previousClose")),
            "marketCap": g(getattr(fi, "market_cap", None), info.get("marketCap")),
            "peRatio": g(getattr(fi, "trailing_pe", None), info.get("trailingPE")),
            "forwardPE": g(getattr(fi, "forward_pe", None), info.get("forwardPE")),
            "dividendYield": g(getattr(fi, "dividend_yield", None), info.get("dividendYield")),
            "dividendRate": g(getattr(fi, "dividend_rate", None), info.get("dividendRate")),
            "beta": g(getattr(fi, "beta", None), info.get("beta")),
            "high52w": g(getattr(fi, "year_high", None), info.get("fiftyTwoWeekHigh")),
            "low52w": g(getattr(fi, "year_low", None), info.get("fiftyTwoWeekLow")),
            "avgVolume": g(getattr(fi, "average_volume", None), info.get("averageVolume")),
            "volume": g(getattr(fi, "volume", None), info.get("volume")),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "description": info.get("longBusinessSummary"),
            "employees": info.get("fullTimeEmployees"),
            "website": info.get("website"),
            "country": info.get("country"),
            "exchange": info.get("exchange"),
            "analyst": analyst,
        }
        cache_set(cache_key, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Error fetching detail for {symbol}: {str(e)}")


def normalize_search_result(item: Dict[str, Any]) -> Dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    symbol = item.get("symbol") or item.get("ticker")
    if not symbol:
        return None
    name = (
        item.get("shortname") or item.get("longname")
        or item.get("name") or item.get("displayName") or ""
    )
    exchange = (
        item.get("exchange") or item.get("exchDisp")
        or item.get("exchangeName") or ""
    )
    quote_type = item.get("quoteType") or item.get("typeDisp") or item.get("type") or ""
    return {"symbol": str(symbol).upper(), "name": name, "exchange": exchange, "type": quote_type}


def dedupe_search_results(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    unique = []
    for item in results:
        symbol = item.get("symbol")
        exchange = item.get("exchange") or ""
        key = (symbol, exchange)
        if not symbol or key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def search_with_yfinance(query: str, limit: int) -> List[Dict[str, Any]]:
    results = []
    try:
        search = yf.Search(query, max_results=limit)
        quotes = getattr(search, "quotes", None) or []
        for item in quotes:
            normalized = normalize_search_result(item)
            if normalized:
                results.append(normalized)
    except Exception:
        pass
    return results


def search_with_query_module(query: str, limit: int) -> List[Dict[str, Any]]:
    results = []
    try:
        from yfinance import query as yf_query
        response = yf_query.search(query)
        quotes = response.get("quotes", []) if isinstance(response, dict) else []
        for item in quotes[:limit]:
            normalized = normalize_search_result(item)
            if normalized:
                results.append(normalized)
    except Exception:
        pass
    return results


def search_with_wkn_map(query: str, limit: int) -> List[Dict[str, Any]]:
    q = query.upper().strip()
    results = []
    for wkn, ticker in WKN_MAP.items():
        if q in wkn or q in ticker.upper():
            results.append({"symbol": ticker, "name": f"WKN {wkn}", "exchange": "Germany", "type": "Equity"})
        if len(results) >= limit:
            break
    return results


@app.get("/search")
async def search_stocks(q: str, limit: int = 10):
    query = q.strip()
    if len(query) < 2:
        return []
    safe_limit = max(1, min(limit, 20))
    upper_query = query.upper()
    results: List[Dict[str, Any]] = []

    if upper_query in WKN_MAP:
        results.append({"symbol": WKN_MAP[upper_query], "name": f"WKN {upper_query}", "exchange": "Germany", "type": "Equity"})

    results.extend(search_with_wkn_map(query, safe_limit))
    results.extend(search_with_yfinance(query, safe_limit))

    if len(results) < safe_limit:
        results.extend(search_with_query_module(query, safe_limit))

    direct_symbol = resolve_symbol(upper_query)
    if direct_symbol and not any(item.get("symbol") == direct_symbol for item in results):
        results.append({"symbol": direct_symbol, "name": "Direkte Eingabe", "exchange": "", "type": "Ticker"})

    return dedupe_search_results(results)[:safe_limit]


# Serve the built React app. Local development uses ../frontend/dist, while the
# combined Docker image copies it into ./frontend/dist next to main.py.
_frontend_candidates = [
    os.path.join(os.path.dirname(__file__), "frontend", "dist"),
    os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"),
]
for frontend_dist in _frontend_candidates:
    if os.path.isdir(frontend_dist):
        app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
        break

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
