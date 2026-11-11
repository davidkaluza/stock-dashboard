# Stock Dashboard als PWA auf GitHub – Design

Stand: 2026-11-11 · Zweig: `pwa` (abgezweigt von `main` @ `3365d3f`)

## Ziel

Das Stock Dashboard läuft ohne eigenen Server:

- **PWA** auf GitHub Pages, installierbar (insbesondere iPhone/iPad), offline lesbar.
- **Supabase** als zentrale Datenbank für Marktdaten, Tickerliste, Push-Regeln und Push-Abos.
- **GitHub Action** (Python, yfinance) ruft die Kurse regelmäßig ab, prüft die Push-Regeln und verschickt Web-Push.
- **Private Daten** (Depots, Kaufkurs, Menge, Kaufdatum) liegen ausschließlich lokal in der PWA.

Das FastAPI-Backend entfällt auf diesem Zweig. `main` behält die lokale Variante.

## Rahmenbedingungen (entschieden)

| Thema | Entscheidung |
|---|---|
| Datenbank | Supabase (PostgreSQL) |
| Hosting | GitHub Pages. Das Repo wird dafür öffentlich. Die Git-Historie wurde geprüft und enthält keine echten Zugangsdaten |
| Nutzer | ein Nutzer auf mehreren Geräten, Login per Supabase Auth |
| Push-Geräte | iPhone/iPad (Web-Push ab iOS 16.4, nur als Home-Bildschirm-App) und alle anderen Web-Push-fähigen Browser |
| Abruf | alle 30 min zu Handelszeiten (Mo–Fr), dazu ein Lauf nachts |
| Push-Regeln | alle vier Typen pro Aktie wählbar (siehe unten) |
| WKN/ISIN | Auflösung über OpenFIGI (getestet: WKN 716460 → `SAP` an Xetra) |

## Architektur

```
┌─────────── iPhone / Browser ───────────┐        ┌──────────── Supabase ────────────┐
│ PWA (GitHub Pages)                     │ lesen  │ Marktdaten (alle Angemeldeten):  │
│  lokal (localStorage):                 │◄───────│  symbols, quotes, daily_prices,  │
│   Depots, Kaufkurs, Menge, Datum       │        │  stats, details, news            │
│  synchronisiert:                       │schreib.│ Pro Nutzer (RLS, nur eigene):    │
│   Ticker, Push-Regeln, Push-Abo ───────┼───────►│  user_tickers, alert_rules,      │
│  Suche ────────────────────────────────┼───────►│  push_subscriptions, alert_log   │
└────────────────────────────────────────┘        │ Edge Function `lookup`           │
          ▲ Web-Push (Apple/Google)               └──────┬─────────────────▲─────────┘
          │                                 neuer Ticker │ Trigger         │ schreibt
          │                                              ▼                 │ (service key)
          └──────────────────────────── GitHub Action (Python, yfinance) ───┘
                                         alle 30 min + nachts + bei neuem Ticker
```

## Datenmodell (Supabase)

Alle Tabellen liegen im Schema `public` und haben RLS aktiviert.

### Marktdaten: Lesen für `authenticated`, Schreiben nur per Service-Key (Action)

| Tabelle | Spalten | Hinweis |
|---|---|---|
| `symbols` | `symbol` PK, `name`, `currency`, `exchange`, `status` (`pending`/`ok`/`unknown`), `updated_at` | `pending` = von der PWA angelegt, noch nicht geladen |
| `quotes` | `symbol` PK, `price`, `prev_close`, `change`, `change_pct`, `fetched_at` | aktueller Kurs (Yahoo, ca. 15 min verzögert) |
| `daily_prices` | (`symbol`, `date`) PK, `close` | Tagesschlusskurse, bis 10 Jahre |
| `stats` | `symbol` PK, `data` jsonb, `fetched_at` | Performance 1d/1wk/1mo/2mo/3mo/6mo/1y/5y wie bisher `/stats` |
| `details` | `symbol` PK, `data` jsonb, `fetched_at` | Fundamentaldaten und Analystenziele wie bisher `/detail` |
| `news` | (`symbol`, `id`) PK, `title`, `publisher`, `link`, `published_at` | die letzten 20 pro Symbol |

### Nutzerdaten: RLS `user_id = auth.uid()` für alle Operationen

| Tabelle | Spalten |
|---|---|
| `user_tickers` | (`user_id`, `symbol`) PK, `added_at` |
| `alert_rules` | `id` PK, `user_id`, `symbol`, `type` (`day_change`/`threshold`/`news`/`reference`), `params` jsonb, `enabled`, `last_state` jsonb, `updated_at`; eindeutig (`user_id`, `symbol`, `type`) |
| `push_subscriptions` | `id` PK, `user_id`, `endpoint` (eindeutig), `p256dh`, `auth`, `device_label`, `created_at` |
| `alert_log` | `id` PK, `user_id`, `rule_id`, `symbol`, `title`, `body`, `sent_at` (PWA darf nur lesen) |

`last_state` schreibt nur die Action. Die PWA setzt es beim Anlegen oder Ändern einer Regel auf `null` zurück.

### Trigger

Die Marktdaten-Tabellen verweisen per Fremdschlüssel mit `ON DELETE CASCADE` auf `symbols.symbol`. Ein Insert in `user_tickers` legt per Trigger (`SECURITY DEFINER`, weil die PWA `symbols` nicht schreiben darf) eine `symbols`-Zeile mit `status = 'pending'` an, falls sie noch nicht existiert. Bei einer neuen `pending`-Zeile ruft ein zweiter Trigger über `pg_net` die GitHub-API auf (`POST /repos/{owner}/{repo}/actions/workflows/fetch.yml/dispatches`, Modus `new` ohne Symbol = alle noch nicht geladenen). *Umsetzung:* `workflow_dispatch` statt `repository_dispatch`, weil der Token dann nur „Actions: write“ braucht statt „Contents: write“. Das Token liegt im Supabase Vault. Fehlt das Token oder schlägt der Aufruf fehl, holt der nächste reguläre Lauf das Symbol nach.

### Datenschutz

Auf dem Server liegen nur Ticker, Push-Regeln und Push-Abos. Ausnahme ist der `reference`-Wert einer Referenzkurs-Regel. Er liegt nur dann auf dem Server, wenn diese Regel aktiviert wird, und die PWA weist darauf hin. Menge, Kaufdatum und die Depot-Zuordnung verlassen das Gerät nie. Zeiträume ab Kaufdatum berechnet die PWA lokal aus `daily_prices`.

## GitHub Action (`pipeline/`)

### Workflow `.github/workflows/fetch.yml`

| Auslöser | Zeitplan / Ereignis | Modus |
|---|---|---|
| `schedule` | `*/30 6-21 * * 1-5` (UTC) | `quotes` |
| `schedule` | `0 2 * * *` | `nightly` |
| `repository_dispatch` | `new-ticker` | `new` mit `client_payload.symbol` |
| `workflow_dispatch` | manuell, Eingabe `mode` | wählbar, zusätzlich `test-push` (Testnachricht an alle Abos) |

Eine gemeinsame `concurrency`-Gruppe (`fetch`, `cancel-in-progress: false`) verhindert überlappende Läufe. Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

### Module

| Modul | Aufgabe |
|---|---|
| `pipeline/run.py` | Einstieg: `python -m pipeline.run <quotes\|nightly\|new> [symbol]` |
| `pipeline/fetch.py` | yfinance-Abrufe: Kurse (gebündelt per `yf.download`), Tageskurse, Stats, Details, News. Logik aus `backend/main.py` übernommen |
| `pipeline/store.py` | Lesen und Schreiben in Supabase (REST über `supabase-py`, Service-Key) |
| `pipeline/alerts.py` | reine Funktion: Regel + Marktdaten + `last_state` → (Nachricht oder nichts, neuer `last_state`) |
| `pipeline/push.py` | Versand per `pywebpush`/VAPID; Abos mit 404/410 werden gelöscht |

### Modi

- **`quotes`:** Symbole = alle `symbols` mit Status `ok` oder `pending`, die in `user_tickers` vorkommen. Abgerufen werden `quotes`, `stats` und `news`. Noch `pending`-Symbole werden dabei wie im Modus `new` vollständig geladen und auf `ok`/`unknown` gesetzt. So holt dieser Lauf neue Ticker nach, falls der Trigger nicht gegriffen hat. Danach werden alle aktiven Regeln dieser Symbole ausgewertet, Pushes versendet und `alert_log` und `last_state` geschrieben.
- **`nightly`:** `daily_prices` ergänzen (nur fehlende Tage, beim ersten Mal 10 Jahre) und `details` aktualisieren. Symbole ohne Nutzer werden aus `symbols` gelöscht, ihre Marktdaten per `ON DELETE CASCADE` mit.
- **`new`:** alle Daten für ein Symbol. Liefert yfinance nichts, wird `status = 'unknown'` gesetzt, sonst `ok` plus Name und Währung.

### Fehlerbehandlung

Fehler bei einem Symbol werden geloggt, der Lauf geht weiter. Bei einer HTTP-429-Antwort von Yahoo wird bis zu dreimal mit wachsender Pause wiederholt. Nur wenn **alle** Symbole scheitern, endet der Lauf mit einem Fehlercode, und GitHub schickt eine E-Mail. Die PWA zeigt immer `fetched_at` an, damit veraltete Kurse erkennbar sind.

## Push-Regeln

| Typ | `params` | Auslösen, wenn | `last_state` / Entprellung |
|---|---|---|---|
| `day_change` | `{pct: 5}` | \|`change_pct`\| ≥ `pct` | `{date, up: bool, down: bool}`: je Richtung höchstens einmal pro Handelstag |
| `threshold` | `{above?: 200, below?: 180}` | Kurs ≥ `above` bzw. ≤ `below` | `{above_hit, below_hit}`: erneut erst, nachdem der Kurs wieder auf der anderen Seite war |
| `news` | `{}` | neue News-ID, die beim letzten Lauf noch nicht bekannt war | `{seen: [ids]}`. Ist der Zustand leer (neue Regel), werden die aktuellen IDs ohne Push als gesehen übernommen |
| `reference` | `{price: 150.0, pct: 10}` | \|Kurs/`price` − 1\| ≥ `pct` % | `{above_hit, below_hit}` wie bei `threshold` |

Nachrichtenformat: Titel `SAP.DE +5,2 %` bzw. `SAP.DE: neue Meldung`, Text mit Kurs, Zeit bzw. Schlagzeile. Die Payload enthält `{symbol}`. Ein Tipp auf die Nachricht öffnet die PWA mit `?symbol=SAP.DE`.

Pro Lauf und Nutzer gehen höchstens 20 Pushes raus. Weitere Treffer stehen nur in `alert_log`.

## Edge Function `lookup` (Supabase)

`GET /functions/v1/lookup?q=...`, nur mit gültigem Nutzer-JWT. Antwort: `[{symbol, name, exchange, type, source}]`, höchstens 10 Einträge.

- **6 Zeichen alphanumerisch (WKN)** → OpenFIGI `idType: ID_WERTPAPIER`
- **12 Zeichen mit Länderpräfix (ISIN)** → OpenFIGI `idType: ID_ISIN`
- **sonst** → Yahoo-Suche (`query1.finance.yahoo.com/v1/finance/search`) sowie die Eingabe selbst als direkter Ticker

Die OpenFIGI-Treffer werden über eine feste Tabelle von Börsencodes in Yahoo-Ticker übersetzt. Unbekannte Börsencodes werden verworfen. Sortierung: Xetra zuerst, dann Heimatbörse, dann der Rest.

| exchCode | Yahoo-Endung |
|---|---|
| GY (Xetra), GR (deutsche Sammelnotierung) | `.DE` |
| GF | `.F` |
| GM | `.MU` |
| GS | `.SG` |
| GD | `.DU` |
| GH | `.HM` |
| US, UN, UW, UQ, UA | (keine) |
| LN | `.L` |
| FP | `.PA` |
| NA | `.AS` |
| SW | `.SW` |
| IM | `.MI` |
| SM | `.MC` |
| AV | `.VI` |

*Korrektur bei der Umsetzung:* `GR` ist bei Bloomberg die deutsche Composite-Notierung, nicht Berlin. Bei ETFs ist sie oft die einzige deutsche Zeile (z. B. MSCI World: `EUNL GR`, kein `GY`) und wird deshalb auf `.DE` abgebildet. Codes mit unsicherer Bedeutung (GI, GT, …) werden verworfen. Ticker mit Währungsendung (`SAPUSD`) ebenfalls.

Die Logik liegt in `supabase/functions/lookup/logic.js` (reines ESM, auch mit vitest getestet), `index.ts` ist nur die Deno-Hülle. Veröffentlicht wird über `.github/workflows/functions.yml`.

Bei US-Tickern wird `/` durch `-` ersetzt (`BRK/B` → `BRK-B`). Ist die Edge Function nicht erreichbar, übernimmt die PWA die Eingabe als direkten Ticker.

## PWA (`frontend/`)

### Technik

- Bestehendes Vite/React/Tailwind-Frontend, dazu `vite-plugin-pwa` (Workbox, `injectManifest` für den eigenen Push-Handler) und `@supabase/supabase-js`.
- `vite.config.js` mit `base: '/stock-dashboard/'`.
- Supabase-URL und anon key kommen als `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` per Build-Variable aus GitHub (Repository-Variablen, nicht Secrets).
- Der öffentliche VAPID-Schlüssel kommt als `VITE_VAPID_PUBLIC_KEY`.
- Workflow `pages.yml`: Bei einem Push auf `pwa` wird gebaut und auf GitHub Pages veröffentlicht.

### Login

Supabase Auth mit **E-Mail-OTP (6-stelliger Code)**, nicht per Magic Link, weil der Link auf iOS Safari statt der installierten App öffnet. Die Sitzung bleibt pro Gerät erhalten. Ohne Login zeigt die App nur den Login-Bildschirm. Lokale Depots bleiben dabei unangetastet.

### Lokale Daten

Depots (`accounts`), Einstellungen und Ansicht bleiben im `localStorage` mit den bestehenden Schlüsseln und der bestehenden Migration. Beim Start wird `navigator.storage.persist()` angefragt. Wurde 30 Tage lang keine JSON-Sicherung erstellt, erscheint ein Hinweis-Banner.

### Ticker-Abgleich

`syncTickers()` läuft beim Start, nach dem Login und nach jeder Depot-Änderung (Hinzufügen, Entfernen, Verschieben, Import):
- Ticker aus allen lokalen Depots, die auf dem Server fehlen, werden per Upsert in `user_tickers` eingetragen.
- Ticker auf dem Server, die in keinem lokalen Depot vorkommen, werden gelöscht.
- Hat ein anderes Gerät einen gelöschten Ticker noch, trägt es ihn bei seinem nächsten Abgleich wieder ein.

### Daten lesen

Beim Start, bei `visibilitychange` → sichtbar und alle 5 Minuten lädt die PWA `quotes`, `stats` und `symbols` für alle eigenen Ticker in je einer Abfrage. `daily_prices`, `details` und `news` werden erst beim Öffnen einer Aktie geladen. Die zuletzt geladenen Daten werden wie bisher im `localStorage` zwischengespeichert, damit die App offline etwas anzeigt.

Die Charts arbeiten mit `daily_prices`. Die Zeiträume 1M/3M/6M/1J/5J/10J und „seit Kauf“ werden lokal gefiltert. Intraday-Charts entfallen.

### UI-Änderungen

- **Suche:** `AddStock` fragt `lookup` ab (Verzögerung 300 ms) und zeigt die Trefferliste. Eine neue Karte zeigt „wird geladen…“ (`pending`) bzw. „unbekannt“ (`unknown`).
- **Karte und Tabellenzeile:** „Stand: HH:MM“ aus `fetched_at` und ein Glocken-Symbol, das den Regel-Dialog öffnet.
- **Regel-Dialog:** vier Regeltypen mit Schalter und Werten. Bei „Referenzkurs“ ist der Kaufkurs aus dem aktiven Depot vorausgefüllt, mit dem Hinweis „Referenzkurs wird für die Benachrichtigung auf dem Server gespeichert.“
- **Einstellungen → Benachrichtigungen:** Knopf „Benachrichtigungen aktivieren“ (Nutzergeste, fordert die Erlaubnis an und speichert das Abo), der Status dieses Geräts, ein Knopf „Test-Anzeige“ (zeigt lokal über den Service Worker eine Beispielbenachrichtigung; den echten Versand testet man über den Action-Modus `test-push`) und die letzten 50 Einträge aus `alert_log`. Auf iOS ohne Home-Bildschirm-Installation steht dort stattdessen eine Anleitung zur Installation.
- **Service Worker:** `push`-Event → `showNotification`; `notificationclick` → App mit `?symbol=` öffnen bzw. fokussieren.
- **Import/Export:** CSV unverändert (`DEPOT;TICKER;NAME;ANZAHL;KAUFKURS;DATUM`). Neu ist die **JSON-Sicherung** `{version: 1, exportedAt, accounts, settings, alertRules}`. Beim Import ersetzt sie nach Rückfrage die lokalen Daten, spielt die Regeln per Upsert ein und ruft `syncTickers()` auf.
- **Entfällt:** DB-Einstellungen, Offline-Schalter, Knopf „Datenbank aktualisieren“, Statuszeile der Cache-DB, alle `axios`-Aufrufe an das alte Backend.

## Projektstruktur auf `pwa`

```
frontend/                  PWA
pipeline/                  Python-Pipeline + tests/ + requirements.txt
supabase/migrations/       SQL: Tabellen, RLS, Trigger
supabase/functions/lookup/ Edge Function (Deno/TypeScript)
.github/workflows/         fetch.yml, pages.yml, test.yml
docs/einrichtung.md        Einrichtungsanleitung inkl. manueller Testcheckliste
scripts/gen_vapid.py       erzeugt das VAPID-Schlüsselpaar
```

Entfernt werden `backend/`, `deploy/`, `start-local-dev.bat`, `start-debian.sh` und der Git-getrackte Ballast (`frontend/dist`, `__pycache__`, `*.old`). AGENTS.md, CLAUDE.md und README werden auf die neue Architektur umgeschrieben.

## Tests

- **pytest (`pipeline/tests/`):** `alerts.py` mit allen Regeltypen (Auslösen, Entprellung, Rücksetzen, Erstbefüllung bei News, Grenze von 20 Pushes), Berechnung der Stats aus einer Kursreihe, Behandlung von 404/410 in `push.py` (gemockt), Modus-Steuerung in `run.py` (mit gemocktem `store`/`fetch`).
- **vitest für `lookup` (`frontend/src/lib/lookup.test.js`):** Erkennung von WKN/ISIN/Name und die Übersetzung exchCode → Yahoo inklusive Sortierung. Statt eines Deno-Tests, weil die Logik reines ESM ist.
- **vitest (`frontend/`):** Zeitraumfilter und „seit Kauf“ auf `daily_prices`, CSV- und JSON-Export → Import (Ergebnis identisch), `syncTickers`-Diff.
- **`test.yml`:** führt alle drei Testsuiten bei jedem Push und Pull Request aus.
- **Manuell (Checkliste in `docs/einrichtung.md`):** Installation auf dem iPhone, Login per Code, Push-Erlaubnis, Test-Push, Tipp auf die Nachricht öffnet die Aktie, Offline-Start.

## Umsetzungsreihenfolge

1. **Supabase-Schema + Pipeline ohne Push:** Migrationen, `fetch`/`store`/`run`, `fetch.yml`, pytest. Ergebnis: Die Action füllt die Kurstabellen für manuell eingetragene `user_tickers`.
2. **PWA-Umbau:** Login, Lesen aus Supabase, Ticker-Abgleich, Charts aus `daily_prices`, JSON-Sicherung, `vite-plugin-pwa`, `pages.yml`, Aufräumen des Backends.
3. **Suche:** Edge Function `lookup` und neue `AddStock`-Trefferliste.
4. **Push:** Regel-Dialog, Abo-Verwaltung, `alerts.py`/`push.py`, Service-Worker-Handler, Verlauf, Trigger für neue Ticker.

Jeder Schritt endet lauffähig mit grünen Tests und wird vor dem nächsten abgenommen.

## Bekannte Risiken

- **Yahoo-Drosselung** von GitHub-IPs: Gegenmittel sind Bündelabrufe und Wiederholungen. Ein Ausfall wird über `fetched_at` sichtbar.
- **Verspätung von GitHub-Cron** um 5–20 Minuten: Pushes kommen entsprechend später. Das ist akzeptiert.
- **iOS-Web-Push** funktioniert nur als Home-Bildschirm-App ab iOS 16.4. iOS kann Abos stillschweigend verwerfen. Gegenmittel: Die App prüft beim Start, ob das Abo noch besteht, und meldet es bei Bedarf neu an.
- **Lokale Daten** können verloren gehen, wenn iOS den Speicher räumt oder die App gelöscht wird. Gegenmittel sind `storage.persist()` und die Backup-Erinnerung.
- **OpenFIGI ohne API-Schlüssel** erlaubt 25 Anfragen pro Minute. Für eine Tippsuche mit Verzögerung reicht das. Ein Schlüssel ließe sich später als Secret der Edge Function ergänzen.
