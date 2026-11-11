# Einrichtung

Diese Anleitung wächst mit jedem Umsetzungsschritt. Teil 1 richtet die Datenbank und den automatischen Kursabruf ein.

## Teil 1: Supabase und Kursabruf

### 1. Datenbank anlegen

Du kannst dein bestehendes Supabase-Projekt weiterverwenden: Die neuen Tabellen stören die alte Tabelle `stock_cache` nicht. Alternativ legst du auf supabase.com ein neues Projekt an.

1. Im Supabase-Dashboard links **SQL Editor** öffnen und auf **New query** klicken.
2. Den Inhalt von [`supabase/migrations/0001_schema.sql`](../supabase/migrations/0001_schema.sql) einfügen und **Run** klicken.
3. Unter **Table Editor** sollten jetzt u. a. `symbols`, `quotes`, `daily_prices` und `user_tickers` stehen.

Das Skript lässt sich gefahrlos mehrfach ausführen.

### 2. Zugangsdaten notieren

Im Dashboard unter **Project Settings → API Keys** bzw. **Data API**:

- **Project URL**, z. B. `https://abcd1234.supabase.co`
- **Secret key** (`sb_secret_…`) oder, bei älteren Projekten, der **service_role**-Schlüssel (`eyJ…`)

Der Secret-/service_role-Schlüssel hat Vollzugriff auf die Datenbank. Er gehört nur in die GitHub Secrets, niemals in Code oder Chat.

### 3. GitHub Secrets eintragen

Im Repo auf GitHub: **Settings → Secrets and variables → Actions → New repository secret**

| Name | Wert |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_KEY` | Secret-/service_role-Schlüssel |

### 4. Standard-Zweig

GitHub führt **zeitgesteuerte** Workflows nur auf dem Standard-Zweig aus. Den manuellen Start (**Run workflow**) gibt es ebenfalls nur für Workflows, die auf dem Standard-Zweig liegen. Damit die Action läuft, gibt es zwei Möglichkeiten:

- **`pwa` zum Standard-Zweig machen:** **Settings → General → Default branch**. `main` bleibt als lokale Variante erhalten.
- oder `pwa` in `main` mergen.

Bei öffentlichen Repos pausiert GitHub zeitgesteuerte Workflows nach **60 Tagen ohne Commit**. Du bekommst vorher eine E-Mail und kannst sie unter **Actions** mit einem Klick wieder aktivieren.

### 5. Ersten Ticker eintragen (bis die PWA fertig ist)

Bis die PWA in Schritt 2 die Ticker selbst einträgt, legst du einen Testnutzer und Ticker von Hand an:

1. **Authentication → Users → Add user → Create new user**: deine E-Mail-Adresse, ein beliebiges Passwort, „Auto Confirm User“ an. Später meldest du dich mit derselben Adresse in der PWA an.
2. Im **SQL Editor**:

   ```sql
   insert into public.user_tickers (user_id, symbol)
   select id, s from auth.users, unnest(array['SAP.DE', 'AAPL']) as s
   where email = 'DEINE@ADRESSE';
   ```

### 6. Ersten Lauf starten

**Actions → Kurse abrufen → Run workflow**, Modus `quotes`. Nach etwa einer Minute stehen in Supabase Kurse, 10 Jahre Tagesschlusskurse, Performance-Werte, News und Fundamentaldaten.

Danach läuft die Action von selbst: Mo–Fr alle 30 Minuten zwischen etwa 7 und 23 Uhr, dazu nachts um 3 bzw. 4 Uhr. GitHub startet zeitgesteuerte Läufe oft 5–20 Minuten verspätet.

**Schlägt ein Lauf fehl**, schickt GitHub eine E-Mail. Im Log des Laufs steht pro Ticker, was nicht geklappt hat.

### Lokal ausprobieren (ohne Datenbank)

```bash
pip install -r pipeline/requirements-dev.txt
python -m pytest pipeline/tests                           # Tests ohne Netz
python -m pipeline.run quotes --dry-run SAP.DE AAPL       # echte Yahoo-Daten, nichts wird geschrieben
```
