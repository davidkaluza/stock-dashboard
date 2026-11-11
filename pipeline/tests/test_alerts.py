from datetime import date

from pipeline.alerts import evaluate, fmt, fmt_pct

TODAY = date(2026, 11, 11)


def ctx(price=100.0, change_pct=0.0, news=None, **kw):
    return {"symbol": "SAP.DE", "name": "SAP SE", "currency": "EUR", "price": price, "prev_close": 100.0,
            "change_pct": change_pct, "news": news, **kw}


def rule(type_, params, state=None):
    return {"id": 1, "type": type_, "params": params, "last_state": state}


def run_seq(r, contexts, today=TODAY):
    """Regel über mehrere Läufe auswerten; liefert die Titel der ausgelösten Nachrichten."""
    titles = []
    for c in contexts:
        msg, state = evaluate(r, c, today)
        if state is not None:
            r = {**r, "last_state": state}
        titles.append(msg.title if msg else None)
    return titles, r


def test_format():
    assert fmt(1234.5) == "1.234,50"
    assert fmt_pct(5.24) == "+5,2 %"
    assert fmt_pct(-3) == "-3,0 %"


def test_day_change_once_per_direction_and_day():
    r = rule("day_change", {"pct": 5})
    titles, r = run_seq(r, [ctx(change_pct=2), ctx(change_pct=5.2), ctx(change_pct=6), ctx(change_pct=-5.5), ctx(change_pct=-7)])
    assert titles == [None, "SAP.DE +5,2 %", None, "SAP.DE -5,5 %", None]
    # neuer Tag → wieder scharf
    msg, _ = evaluate(r, ctx(change_pct=5.1), date(2026, 11, 12))
    assert msg.title == "SAP.DE +5,1 %"
    assert "210" not in msg.body and "SAP SE" in msg.body


def test_threshold_rearms_only_after_crossing_back():
    r = rule("threshold", {"above": 200})
    prices = [190, 201, 205, 199.5, 202, 195, 200]
    titles, _ = run_seq(r, [ctx(price=p) for p in prices])
    # 199.5 liegt innerhalb der 0,5 %-Zone → noch nicht wieder scharf; 195 → scharf; 200 → erneut
    assert titles == [None, "SAP.DE über 200,00", None, None, None, None, "SAP.DE über 200,00"]


def test_threshold_below_and_both():
    r = rule("threshold", {"above": 220, "below": 180})
    titles, _ = run_seq(r, [ctx(price=p) for p in [200, 179, 175, 230]])
    assert titles == [None, "SAP.DE unter 180,00", None, "SAP.DE über 220,00"]


def test_threshold_already_met_when_created_fires_once():
    titles, _ = run_seq(rule("threshold", {"below": 180}), [ctx(price=150), ctx(price=150)])
    assert titles == ["SAP.DE unter 180,00", None]


def test_reference_price():
    r = rule("reference", {"price": 100, "pct": 10})
    titles, _ = run_seq(r, [ctx(price=105), ctx(price=111), ctx(price=112), ctx(price=89)])
    assert titles == [None, "SAP.DE +11,0 % seit Referenz", None, "SAP.DE -11,0 % seit Referenz"]


def test_news_baseline_then_only_new_items():
    n1 = [{"id": "a", "title": "Alt"}]
    n2 = [{"id": "c", "title": "Neu 2"}, {"id": "b", "title": "Neu 1"}, {"id": "a", "title": "Alt"}]
    r = rule("news", {})
    msg, state = evaluate(r, ctx(news=n1), TODAY)
    assert msg is None and state == {"seen": ["a"]}  # Erstbefüllung ohne Push
    r["last_state"] = state
    msg, state = evaluate(r, ctx(news=n2), TODAY)
    assert msg.title == "SAP.DE: neue Meldung" and msg.body == "Neu 2 (+1 weitere)"
    assert state["seen"][:3] == ["c", "b", "a"]
    r["last_state"] = state
    assert evaluate(r, ctx(news=n2), TODAY)[0] is None


def test_news_fetch_failure_is_not_evaluated():
    assert evaluate(rule("news", {}, {"seen": ["a"]}), ctx(news=None), TODAY) == (None, None)


def test_invalid_rules_are_ignored():
    assert evaluate(rule("day_change", {"pct": 0}), ctx(change_pct=50), TODAY) == (None, None)
    assert evaluate(rule("threshold", {}), ctx(), TODAY) == (None, None)
    assert evaluate(rule("reference", {"price": 0, "pct": 5}), ctx(), TODAY) == (None, None)
    assert evaluate(rule("threshold", {"above": 1}), ctx(price=None), TODAY) == (None, None)
    assert evaluate(rule("quatsch", {}), ctx(), TODAY) == (None, None)
