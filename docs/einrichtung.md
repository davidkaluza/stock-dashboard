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

## Teil 2: Die App (PWA) veröffentlichen

### 1. Anmeldung in Supabase einstellen

Im Supabase-Dashboard unter **Authentication**:

1. **Sign In / Providers** (bzw. **Providers → Email**): „Allow new users to sign up“ **ausschalten**. Dann kann sich nur das Konto aus Teil 1, Schritt 5 anmelden. „Email“ als Anmeldeweg bleibt an.
2. **Emails → Magic Link**: Die App meldet sich mit einem **Code** an, nicht per Link. Ein Link würde auf dem iPhone Safari öffnen statt der installierten App. Ersetze den Text der Vorlage z. B. durch:

   ```html
   <h2>Dein Anmeldecode</h2>
   <p>Gib diesen Code in der Stock-Dashboard-App ein:</p>
   <p style="font-size:24px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
   ```

   Ohne `{{ .Token }}` enthält die E-Mail keinen Code.
3. Supabase verschickt über den eingebauten Mailversand nur wenige E-Mails pro Stunde. Für einen einzelnen Nutzer reicht das.

### 2. Zugangsdaten für die App eintragen

Die App braucht die Projekt-URL und den **öffentlichen** Schlüssel. Er darf im veröffentlichten Code stehen: Mit ihm kommt man nur nach der Anmeldung und nur an die eigenen Daten.

Supabase: **Project Settings → API Keys** → „Publishable key“ (`sb_publishable_…`), bei älteren Projekten der **anon**-Schlüssel.

GitHub: **Settings → Secrets and variables → Actions → Reiter „Variables“ → New repository variable**

| Name | Wert |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Publishable/anon key |

Achtung: Das sind **Variables**, keine Secrets. Der Secret-Key aus Teil 1 gehört nicht hierher.

### 3. GitHub Pages einschalten

1. Das Repo muss **öffentlich** sein, sonst braucht GitHub Pages ein kostenpflichtiges Konto: **Settings → General → Danger Zone → Change visibility**.
2. **Settings → Pages → Build and deployment → Source: „GitHub Actions“**.
3. Ist `pwa` **nicht** der Standard-Zweig: **Settings → Environments → github-pages → Deployment branches and tags** und `pwa` hinzufügen.
4. Unter **Actions → PWA veröffentlichen → Run workflow** den ersten Build starten. Danach läuft er bei jedem Push auf `pwa` automatisch.

Die App ist dann erreichbar unter `https://<dein-github-name>.github.io/stock-dashboard/`.

### 4. In der App anmelden

E-Mail eingeben → **Code senden** → Code aus der E-Mail eintippen. Das ist pro Gerät einmal nötig.

Die Tickerliste aus Teil 1, Schritt 5 gleicht die App automatisch ab. Ticker, die in keinem Depot auf dem Gerät stehen, entfernt sie vom Server, sobald du dort mindestens eine Aktie hast.

### 5. Depots aus der alten Version übernehmen

In der alten lokalen Version (Zweig `main`) mit dem Download-Knopf **CSV exportieren**. In der neuen App mit dem Upload-Knopf die CSV **importieren**. Danach unter **Einstellungen → Konto & Sicherung → Sichern** eine JSON-Sicherung anlegen.

Die JSON-Sicherung enthält alle Depots (auch alte Positionen) und Einstellungen. Mit **Wiederherstellen** überträgst du sie auf ein weiteres Gerät.

### 6. Auf dem iPhone installieren

In **Safari** die App-Adresse öffnen → **Teilen** → **Zum Home-Bildschirm**. Nur so installiert, kann die App später Push-Nachrichten empfangen (ab iOS 16.4). Nach der Installation einmal in der App anmelden: Die Home-Bildschirm-App hat einen eigenen Speicher, getrennt von Safari.

### Prüfliste

- [ ] Login per Code klappt (E-Mail enthält einen Code, keinen Link)
- [ ] Fremde E-Mail-Adresse → „Für diese E-Mail-Adresse gibt es kein Konto.“
- [ ] Depots erscheinen nach CSV-Import, Kurse mit „Stand: HH:MM“
- [ ] Neuer Ticker zeigt „wird geladen…“ und nach dem nächsten Action-Lauf Kurse
- [ ] Charts 1W bis 10Y und „Seit Kauf“
- [ ] JSON-Sicherung → auf zweitem Gerät wiederherstellen
- [ ] Flugmodus: App startet und zeigt die letzten Kurse
