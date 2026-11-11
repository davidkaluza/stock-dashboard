"""Auswertung der Push-Regeln – reine Funktionen ohne Netz und Datenbank.

Jede Regel meldet nur beim Übergang in einen neuen Zustand („Entprellung“); der Zustand liegt in
alert_rules.last_state und wird von der Action fortgeschrieben (die PWA setzt ihn bei Änderung auf null).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date
from typing import Optional

REARM = 0.005          # Schwelle wird erst wieder scharf, wenn der Kurs 0,5 % zurück auf der anderen Seite ist
NEWS_MEMORY = 60       # so viele News-IDs werden je Regel gemerkt


@dataclass
class Message:
    title: str
    body: str


def _num(v) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) and math.isfinite(v) else None


def fmt(value: float, digits: int = 2) -> str:
    """Deutsche Zahl: 1234.5 → '1.234,50'"""
    s = f"{value:,.{digits}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def fmt_pct(value: float) -> str:
    return f"{'+' if value >= 0 else ''}{fmt(value, 1)} %"


def _label(ctx: dict) -> str:
    return ctx.get("name") or ctx["symbol"]


def _price_text(ctx: dict, price: Optional[float]) -> str:
    if price is None:
        return "—"
    cur = ctx.get("currency") or ""
    return f"{fmt(price)} {cur}".strip()


def _crossing(price: float, above: Optional[float], below: Optional[float], state: dict):
    """Gemeinsame Logik für Schwelle und Referenzkurs: liefert ('above'|'below'|None, neuer Zustand)."""
    state = {"above_hit": bool(state.get("above_hit")), "below_hit": bool(state.get("below_hit"))}
    hit = None
    if above is not None:
        if price >= above and not state["above_hit"]:
            state["above_hit"] = True
            hit = "above"
        elif price < above * (1 - REARM):
            state["above_hit"] = False
    if below is not None:
        if price <= below and not state["below_hit"]:
            state["below_hit"] = True
            hit = hit or "below"
        elif price > below * (1 + REARM):
            state["below_hit"] = False
    return hit, state


def evaluate(rule: dict, ctx: dict, today: date) -> tuple[Optional[Message], Optional[dict]]:
    """Regel gegen aktuelle Marktdaten prüfen.

    ctx: {symbol, name, currency, price, prev_close, change_pct, news: [{id, title}] (neueste zuerst) | None}
    Rückgabe: (Nachricht oder None, neuer last_state – None, wenn die Regel nicht auswertbar ist)
    """
    rtype = rule.get("type")
    params = rule.get("params") or {}
    state = rule.get("last_state") or {}
    sym = ctx["symbol"]
    price = _num(ctx.get("price"))

    if rtype == "day_change":
        pct = _num(params.get("pct"))
        change = _num(ctx.get("change_pct"))
        if pct is None or pct <= 0 or change is None:
            return None, None
        if state.get("date") != today.isoformat():
            state = {"date": today.isoformat(), "up": False, "down": False}
        else:
            state = dict(state)
        if change >= pct and not state.get("up"):
            state["up"] = True
        elif change <= -pct and not state.get("down"):
            state["down"] = True
        else:
            return None, state
        return Message(f"{sym} {fmt_pct(change)}", f"{_label(ctx)}: {_price_text(ctx, price)} (Tagesänderung über ±{fmt(pct, 1)} %)"), state

    if rtype == "threshold":
        above, below = _num(params.get("above")), _num(params.get("below"))
        if price is None or (above is None and below is None):
            return None, None
        hit, state = _crossing(price, above, below, state)
        if not hit:
            return None, state
        level = above if hit == "above" else below
        word = "über" if hit == "above" else "unter"
        return Message(f"{sym} {word} {fmt(level)}", f"{_label(ctx)}: {_price_text(ctx, price)}"), state

    if rtype == "reference":
        ref, pct = _num(params.get("price")), _num(params.get("pct"))
        if price is None or ref is None or ref <= 0 or pct is None or pct <= 0:
            return None, None
        hit, state = _crossing(price, ref * (1 + pct / 100), ref * (1 - pct / 100), state)
        if not hit:
            return None, state
        diff = (price / ref - 1) * 100
        return Message(f"{sym} {fmt_pct(diff)} seit Referenz", f"{_label(ctx)}: {_price_text(ctx, price)} (Referenz {fmt(ref)})"), state

    if rtype == "news":
        news = ctx.get("news")
        if news is None:  # News-Abruf fehlgeschlagen → nicht als „keine News“ werten
            return None, None
        ids = [n["id"] for n in news if n.get("id")]
        if "seen" not in state:  # neue Regel: aktuelle Meldungen gelten als bekannt
            return None, {"seen": ids[:NEWS_MEMORY]}
        seen = list(state.get("seen") or [])
        fresh = [n for n in news if n.get("id") and n["id"] not in seen]
        new_state = {"seen": ([n["id"] for n in fresh] + seen)[:NEWS_MEMORY]}
        if not fresh:
            return None, state
        more = f" (+{len(fresh) - 1} weitere)" if len(fresh) > 1 else ""
        return Message(f"{sym}: neue Meldung", f"{fresh[0].get('title', '')}{more}"), new_state

    return None, None
