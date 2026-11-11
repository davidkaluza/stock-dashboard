"""Schlanker Supabase-Zugriff über die REST-Schnittstelle (PostgREST) mit dem Service-Key."""
from __future__ import annotations

import json
import math
import os
from datetime import date, datetime
from typing import Any, Iterable, Optional

import requests

CHUNK = 500  # Zeilen pro Upsert-Request


def clean(obj: Any) -> Any:
    """NaN/Inf → None und Datumswerte → ISO-Text, damit jsonb und JSON sie akzeptieren."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    if hasattr(obj, "item"):  # numpy-Skalare
        return clean(obj.item())
    return obj


class SupabaseStore:
    def __init__(self, url: Optional[str] = None, key: Optional[str] = None, timeout: int = 30):
        url = url or os.environ.get("SUPABASE_URL")
        key = key or os.environ.get("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL und SUPABASE_SERVICE_KEY müssen gesetzt sein.")
        self.base = url.rstrip("/") + "/rest/v1"
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({"apikey": key, "Content-Type": "application/json"})
        if key.startswith("eyJ"):  # alter service_role-JWT; neue sb_secret_…-Schlüssel nur im apikey-Header
            self.session.headers["Authorization"] = f"Bearer {key}"

    def _check(self, resp: requests.Response) -> requests.Response:
        if resp.status_code >= 400:
            raise RuntimeError(f"Supabase {resp.request.method} {resp.url}: {resp.status_code} {resp.text[:300]}")
        return resp

    def select(self, table: str, columns: str = "*", **filters: str) -> list[dict]:
        """Alle Zeilen (seitenweise). Filter im PostgREST-Format, z. B. symbol="eq.SAP.DE"."""
        rows: list[dict] = []
        page = 1000
        offset = 0
        while True:
            params = {"select": columns, **filters}
            headers = {"Range-Unit": "items", "Range": f"{offset}-{offset + page - 1}"}
            resp = self._check(self.session.get(f"{self.base}/{table}", params=params, headers=headers, timeout=self.timeout))
            batch = resp.json()
            rows.extend(batch)
            if len(batch) < page:
                return rows
            offset += page

    def upsert(self, table: str, rows: Iterable[dict], on_conflict: Optional[str] = None) -> int:
        rows = [clean(r) for r in rows]
        params = {"on_conflict": on_conflict} if on_conflict else {}
        headers = {"Prefer": "resolution=merge-duplicates,return=minimal"}
        for i in range(0, len(rows), CHUNK):
            body = json.dumps(rows[i:i + CHUNK], allow_nan=False)
            self._check(self.session.post(f"{self.base}/{table}", params=params, headers=headers, data=body, timeout=self.timeout))
        return len(rows)

    def delete(self, table: str, **filters: str) -> None:
        if not filters:
            raise ValueError("delete ohne Filter ist nicht erlaubt")
        self._check(self.session.delete(f"{self.base}/{table}", params=filters, timeout=self.timeout))
