# Stock Dashboard (PWA)

Depotübersicht als installierbare Web-App. Kurse, Kennzahlen und News kommen von Yahoo Finance. Eine GitHub Action ruft sie alle 30 Minuten ab (Mo–Fr) und speichert sie in Supabase. Die App liest sie von dort.

**Deine Depots bleiben auf deinem Gerät.** Menge, Kaufkurs und Kaufdatum werden nur lokal gespeichert. Zum Server gehen nur die Ticker, deren Kurse abgerufen werden sollen.

- mehrere Depots, Karten- und Tabellenansicht (A4-Druck)
- Charts von 1 Woche bis 10 Jahre und „seit Kauf“
- CSV-Import/-Export und vollständige JSON-Sicherung
- offline lesbar (letzte geladene Daten)

Einrichtung: [`docs/einrichtung.md`](docs/einrichtung.md)

Die frühere lokale Version mit FastAPI-Backend liegt auf dem Zweig `main`.

## Entwicklung

```bash
cd frontend
npm install
cp .env.example .env.local     # Supabase-URL und anon key eintragen
npm run dev                    # http://localhost:5173
npm test
```

```bash
pip install -r pipeline/requirements-dev.txt
python -m pytest pipeline/tests
python -m pipeline.run quotes --dry-run SAP.DE AAPL
```
