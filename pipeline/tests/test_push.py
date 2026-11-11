"""push.py mit echter pywebpush-Verschlüsselung und -Signatur; nur der HTTP-Versand wird simuliert."""
import base64
import importlib.util
import json
from pathlib import Path

import pytest

pywebpush = pytest.importorskip("pywebpush")
from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import ec  # noqa: E402

from pipeline.push import GONE, OK, ERROR, WebPusher  # noqa: E402

spec = importlib.util.spec_from_file_location("gen_vapid", Path(__file__).resolve().parents[2] / "scripts" / "gen_vapid.py")
gen_vapid = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen_vapid)


def browser_subscription():
    """Schlüssel, wie sie ein Browser beim Abonnieren erzeugt."""
    key = ec.generate_private_key(ec.SECP256R1())
    p256dh = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    b64 = lambda b: base64.urlsafe_b64encode(b).decode().rstrip("=")
    return {"id": 1, "endpoint": "https://web.push.apple.com/abc", "p256dh": b64(p256dh), "auth": b64(b"0123456789abcdef")}


class FakeResponse:
    def __init__(self, status):
        self.status_code = status
        self.text = ""
        self.reason = "Gone" if status == 410 else ""
        self.headers = {}


class Capture(list):
    status = 201


@pytest.fixture
def capture(monkeypatch):
    calls = Capture()

    def fake_post(url, data=None, headers=None, timeout=None, **kw):
        calls.append({"url": url, "data": data, "headers": headers})
        return FakeResponse(calls.status)

    monkeypatch.setattr(pywebpush.requests, "post", fake_post)
    return calls


def test_generated_keys_have_expected_format():
    keys = gen_vapid.generate()
    pad = lambda s: s + "=" * (-len(s) % 4)
    assert len(base64.urlsafe_b64decode(pad(keys["public"]))) == 65
    assert len(base64.urlsafe_b64decode(pad(keys["private"]))) == 32


def test_send_signs_and_encrypts(capture):
    keys = gen_vapid.generate()
    pusher = WebPusher(keys["private"], "https://example.github.io")
    assert pusher.send(browser_subscription(), {"title": "SAP.DE +5,0 %", "body": "x"}) == OK
    call = capture[0]
    assert call["url"] == "https://web.push.apple.com/abc"
    assert call["headers"]["content-encoding"] == "aes128gcm"
    assert call["headers"]["authorization"].startswith("vapid t=")
    assert keys["public"] in call["headers"]["authorization"]
    assert call["headers"]["Urgency"] == "high"
    assert b"SAP.DE" not in call["data"]  # verschlüsselt


def test_gone_and_error_results(capture):
    pusher = WebPusher(gen_vapid.generate()["private"], "mailto:test@example.com")
    capture.status = 410
    assert pusher.send(browser_subscription(), {"title": "x"}) == GONE
    capture.status = 404
    assert pusher.send(browser_subscription(), {"title": "x"}) == GONE
    capture.status = 500
    assert pusher.send(browser_subscription(), {"title": "x"}) == ERROR


def test_missing_or_invalid_config():
    with pytest.raises(RuntimeError):
        WebPusher("", "mailto:a@b.c")
    with pytest.raises(RuntimeError):
        WebPusher("abc", "ohne-schema")
    with pytest.raises(RuntimeError):  # Pfad wird von py_vapid abgelehnt
        WebPusher("abc", "https://example.github.io/stock-dashboard/")
