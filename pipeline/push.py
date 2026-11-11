"""Web-Push-Versand per VAPID (pywebpush)."""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Optional

log = logging.getLogger(__name__)

OK, GONE, ERROR = "ok", "gone", "error"
TTL = 12 * 3600  # Nachricht verfällt, wenn das Gerät 12 h nicht erreichbar ist


class WebPusher:
    def __init__(self, private_key: Optional[str] = None, subject: Optional[str] = None):
        self.private_key = private_key or os.environ.get("VAPID_PRIVATE_KEY", "")
        self.subject = subject or os.environ.get("VAPID_SUBJECT", "")
        if not self.private_key or not self.subject:
            raise RuntimeError("VAPID_PRIVATE_KEY und VAPID_SUBJECT müssen gesetzt sein.")
        # pywebpush/py_vapid erlauben nur mailto:… oder eine https-Adresse ohne Pfad
        if not re.fullmatch(r"mailto:[^@\s]+@[^@\s]+|https://[\w.-]+", self.subject):
            raise RuntimeError("VAPID_SUBJECT muss 'mailto:name@domain' oder 'https://host' (ohne Pfad) sein.")

    def send(self, sub: dict, payload: dict) -> str:
        """Eine Nachricht an ein Abo. GONE = Abo existiert nicht mehr (löschen)."""
        from pywebpush import WebPushException, webpush

        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
                data=json.dumps(payload, ensure_ascii=False),
                vapid_private_key=self.private_key,
                vapid_claims={"sub": self.subject},
                ttl=TTL,
                headers={"Urgency": "high"},
            )
            return OK
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (404, 410):
                return GONE
            log.warning("Push an %s… fehlgeschlagen: %s %s", sub["endpoint"][:40], status, exc)
            return ERROR
        except Exception as exc:  # Netzwerkfehler usw.
            log.warning("Push an %s… fehlgeschlagen: %s", sub["endpoint"][:40], exc)
            return ERROR


class PrintPusher:
    """Für --dry-run: gibt Nachrichten aus statt sie zu senden."""

    def send(self, sub: dict, payload: dict) -> str:
        print(f"[push] {sub.get('endpoint', '')[:40]}… {json.dumps(payload, ensure_ascii=False)}")
        return OK
