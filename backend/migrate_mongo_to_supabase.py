"""Einmalige Migration: MongoDB stock_cache -> Supabase/PostgreSQL stock_cache.

Aufruf:
    pip install pymongo
    python migrate_mongo_to_supabase.py <mongo-uri> <postgres-uri>

Beispiel:
    python migrate_mongo_to_supabase.py mongodb://10.0.0.176:27017/stock_dashboard_2 \
        "postgresql://postgres.PROJEKT:PASSWORT@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"

Bestehende Einträge mit gleichem Key werden überschrieben, Zeitstempel bleiben erhalten.
"""
import json
import math
import sys

import psycopg
import pymongo
from psycopg.types.json import Jsonb

# Gleiche Tabelle wie CACHE_TABLE_SQL in main.py (nicht importiert, weil main.py
# beim Import die App startet und sich mit der konfigurierten DB verbindet).
CACHE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS stock_cache (
    key            text PRIMARY KEY,
    data           jsonb NOT NULL,
    fetched_at     double precision NOT NULL,
    fetched_at_iso text,
    cache_type     text
)
"""


def clean_nans(obj):
    """jsonb akzeptiert kein NaN/Inf."""
    if isinstance(obj, dict):
        return {k: clean_nans(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean_nans(v) for v in obj]
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    return obj


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    mongo_uri, pg_uri = sys.argv[1], sys.argv[2]

    mongo = pymongo.MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
    coll = mongo.get_database().stock_cache
    total = coll.count_documents({})
    print(f"{total} Dokumente in MongoDB gefunden")

    copied = skipped = 0
    with psycopg.connect(pg_uri, prepare_threshold=None) as conn:
        conn.execute(CACHE_TABLE_SQL)
        with conn.cursor() as cur:
            for doc in coll.find({}):
                key = doc.get("_id")
                data = doc.get("data")
                if not isinstance(key, str) or data is None:
                    skipped += 1
                    continue
                cur.execute(
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
                        # default=str: z. B. datetime-Werte aus BSON
                        Jsonb(clean_nans(data), dumps=lambda o: json.dumps(o, default=str)),
                        float(doc.get("fetched_at", 0)),
                        doc.get("fetched_at_iso"),
                        doc.get("cache_type") or key.split("_", 1)[0],
                    ),
                )
                copied += 1
                if copied % 100 == 0:
                    print(f"  {copied} von {total} kopiert")
        conn.commit()

    print(f"Fertig: {copied} kopiert, {skipped} übersprungen")


if __name__ == "__main__":
    main()
