"""Erzeugt ein VAPID-Schlüsselpaar für Web-Push.

    python scripts/gen_vapid.py            # gibt JSON {"public": …, "private": …} aus
    python scripts/gen_vapid.py --github   # trägt beides direkt per gh-CLI ins Repo ein (privat bleibt unsichtbar)

public  → GitHub-Variable VITE_VAPID_PUBLIC_KEY (in der App, öffentlich)
private → GitHub-Secret   VAPID_PRIVATE_KEY     (nur in der Action)
Format: base64url ohne Padding; public = unkomprimierter P-256-Punkt (65 Byte), private = 32 Byte.
Braucht das Paket `cryptography` (kommt mit pywebpush).
"""
import base64
import json
import subprocess
import sys

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def generate() -> dict:
    key = ec.generate_private_key(ec.SECP256R1())
    private = key.private_numbers().private_value.to_bytes(32, "big")
    public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return {"public": b64url(public), "private": b64url(private)}


def main() -> int:
    keys = generate()
    if "--github" not in sys.argv:
        print(json.dumps(keys))
        return 0
    subprocess.run(["gh", "variable", "set", "VITE_VAPID_PUBLIC_KEY", "--body", keys["public"]], check=True)
    subprocess.run(["gh", "secret", "set", "VAPID_PRIVATE_KEY"], input=keys["private"].encode(), check=True)
    print("VITE_VAPID_PUBLIC_KEY (Variable) und VAPID_PRIVATE_KEY (Secret) gesetzt.")
    print("Achtung: Bestehende Push-Abos werden damit ungültig; in der App Benachrichtigungen neu aktivieren.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
