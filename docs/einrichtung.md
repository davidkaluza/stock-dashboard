# Einrichtung

Reihenfolge: **A** Supabase → **B** GitHub → **C** erste Läufe prüfen → **D** App benutzen.

> Supabase und GitHub benennen Menüpunkte gelegentlich um. Passt ein Name nicht exakt, such nach dem ähnlichsten Eintrag an derselben Stelle.

---

## A. Supabase

Ein bestehendes Projekt (z. B. das bisherige Cache-Projekt) kann weiterverwendet werden: Die alte Tabelle `stock_cache` stört nicht.

### A1. Projekt öffnen

**supabase.com/dashboard** → anmelden → Projekt anklicken.

### A2. Tabellen anlegen

1. Links **SQL Editor** (Symbol `>_`) → oben **+ New query**.
2. Den **gesamten** Inhalt von [`supabase/migrations/0001_schema.sql`](../supabase/migrations/0001_schema.sql) einfügen (auf GitHub: Datei öffnen → „Raw“ → alles kopieren).
3. Unten rechts **Run** (Strg+Enter). Erwartet: **„Success. No rows returned“**. Eine Warnung „destructive operation“ bestätigen: Das Skript löscht keine Daten, es ersetzt nur gleichnamige Zugriffsregeln.
4. Kontrolle unter **Table Editor**: `symbols`, `quotes`, `daily_prices`, `stats`, `details`, `news`, `user_tickers`, `alert_rules`, `push_subscriptions`, `alert_log`.

Das Skript lässt sich gefahrlos mehrfach ausführen.

### A3. Eigenes Benutzerkonto anlegen

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. **Email:** deine Adresse, an die der Anmeldecode geht. **Password:** beliebig und lang (wird nie gebraucht). **Auto Confirm User:** Haken setzen.
3. **Create user**.

### A4. Fremde Anmeldungen sperren (wichtig)

1. **Authentication** → **Sign In / Providers** (ältere Oberfläche: **Providers**).
2. Abschnitt **User Signups**: **„Allow new users to sign up“ ausschalten**.
3. Provider **Email** bleibt **aktiviert**. **Save**.

### A5. E-Mail auf Code umstellen

Die App fragt einen **Code** ab, keinen Link. Ein Link würde auf dem iPhone Safari öffnen statt der installierten App.

1. **Authentication** → **Emails** (ältere Oberfläche: **Email Templates**) → Reiter **Magic Link**.
2. **Subject:** `Dein Anmeldecode`
3. **Body** komplett ersetzen durch:

   ```html
   <h2>Dein Anmeldecode</h2>
   <p>Gib diesen Code in der Stock-Dashboard-App ein:</p>
   <p style="font-size:24px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
   ```
4. **Save**.

Ohne eigenen Mailserver verschickt Supabase nur **sehr wenige E-Mails pro Stunde** (je nach Projekt 2–4). Nicht mehrmals hintereinander einen Code anfordern. Kommt keiner, ein paar Minuten warten.

### A6. Erste Ticker eintragen (nur für den ersten Test)

Sobald die App läuft, trägt sie die Ticker selbst ein. Für den ersten Test der Action: **SQL Editor** → **+ New query** → mit **deiner** Adresse aus A3:

```sql
insert into public.user_tickers (user_id, symbol)
select id, s from auth.users, unnest(array['SAP.DE', 'AAPL']) as s
where email = 'DEINE@ADRESSE.de';
```

**Run** → „Success. 2 rows affected“. Im **Table Editor** → `symbols` stehen dann `SAP.DE` und `AAPL` mit Status `pending`.

### A7. Schlüssel und Adressen heraussuchen

| | Wo | Aussehen |
|---|---|---|
| **a) Project URL** | **Project Settings** (Zahnrad) → **Data API** (bzw. **API**) | `https://abcdefghijklm.supabase.co`, **ohne** `/rest/v1` am Ende |
| **Projekt-ID** | Teil der URL vor `.supabase.co` | `abcdefghijklm` |
| **b) Publishable key** (öffentlich) | **Project Settings** → **API Keys** → *Publishable key* | `sb_publishable_…` (ältere Projekte: Reiter *Legacy API Keys* → **anon**, `eyJ…`) |
| **c) Secret key** (geheim) | gleiche Seite → *Secret keys*; ggf. **+ Add new secret key** (Name z. B. `github-action`), mit dem Auge anzeigen | `sb_secret_…` (ältere Projekte: *Legacy* → **service_role**, `eyJ…`) |
| **d) Access Token** (geheim) | Profilbild oben rechts → **Account preferences** → **Access Tokens** → **Generate new token** (Name z. B. `github-actions`), **sofort kopieren** | `sbp_…` |

Der **Secret key** hat Vollzugriff auf die Datenbank, der **Access Token** auf **alle** deine Supabase-Projekte. Beide gehören nur in GitHub Secrets.

### A8. Optional: OpenFIGI-Schlüssel

Ohne Schlüssel erlaubt OpenFIGI (WKN/ISIN-Suche) 25 Abfragen pro Minute. Für eine Person reicht das. Bei Bedarf kostenlos auf openfigi.com/api holen und in Supabase unter **Edge Functions → Secrets** als `OPENFIGI_API_KEY` eintragen.

---

## B. GitHub

### B1. Secrets und Variablen

Repo → **Settings** → **Secrets and variables** → **Actions**.

**Reiter „Secrets“** → **New repository secret**:

| Name | Wert |
|---|---|
| `SUPABASE_URL` | Project URL (a) |
| `SUPABASE_SERVICE_KEY` | Secret key (c) |
| `SUPABASE_ACCESS_TOKEN` | Access Token (d) |

**Reiter „Variables“** → **New repository variable** (öffentlich sichtbar, in die App eingebaut):

| Name | Wert |
|---|---|
| `VITE_SUPABASE_URL` | Project URL (a) |
| `VITE_SUPABASE_ANON_KEY` | Publishable key (b) |
| `SUPABASE_PROJECT_REF` | Projekt-ID |

**Niemals** den Secret key oder den Access Token unter *Variables* eintragen.

### B2. Repo öffentlich, `pwa` als Standard-Zweig

1. **Settings → General → Default branch** → `pwa`. Zeitgesteuerte Workflows und „Run workflow“ funktionieren nur auf dem Standard-Zweig. `main` bleibt als lokale Variante erhalten.
2. **Settings → General → Danger Zone → Change visibility → Public**. GitHub Pages ist für private Repos kostenpflichtig. Die Git-Historie enthält keine Zugangsdaten.

Bei öffentlichen Repos pausiert GitHub zeitgesteuerte Workflows nach **60 Tagen ohne Commit**. Du bekommst vorher eine E-Mail und kannst sie unter **Actions** mit einem Klick wieder aktivieren.

### B3. GitHub Pages

**Settings → Pages → Build and deployment → Source: „GitHub Actions“**.

---

## C. Erste Läufe und Prüfung

Unter **Actions** links den Workflow wählen → **Run workflow** → Zweig `pwa`.

| Workflow | Ergebnis prüfen |
|---|---|
| **Kurse abrufen** (Modus `quotes`) | Supabase → **Table Editor**: `symbols` Status `ok` mit Namen, `quotes` mit Kursen, `daily_prices` mit ca. 5 000 Zeilen |
| **Edge Functions veröffentlichen** | Supabase → **Edge Functions**: `lookup` ist aufgeführt |
| **PWA veröffentlichen** | Im Lauf bei „deploy“ steht die Adresse, z. B. `https://<name>.github.io/stock-dashboard/` |

Schlägt ein Lauf fehl, den Lauf öffnen und im roten Schritt die Meldung lesen.

Danach läuft alles von selbst:
- **Kurse:** Mo–Fr alle 30 Minuten von etwa 7 bis 23 Uhr, dazu nachts. GitHub startet zeitgesteuerte Läufe oft 5–20 Minuten verspätet.
- **App und Edge Function:** werden bei jedem Push auf `pwa` neu veröffentlicht.

Supabase-Projekte im kostenlosen Tarif pausieren nach etwa einer Woche ohne Aktivität. Die regelmäßigen Läufe verhindern das.

---

## D. App benutzen

### D1. Anmelden

App-Adresse öffnen → E-Mail aus A3 → **Code senden** → Code aus der E-Mail eintippen. Das ist pro Gerät (und pro Browser) einmal nötig.

### D2. Depots aus der alten Version übernehmen

In der alten lokalen Version (Zweig `main`) mit dem Download-Knopf **CSV exportieren**, in der neuen App mit dem Upload-Knopf **importieren**. Danach unter **Einstellungen → Konto & Sicherung → Sichern** eine JSON-Sicherung anlegen.

Die App gleicht ihre Tickerliste mit dem Server ab. Test-Ticker aus A6, die in keinem Depot stehen, entfernt sie, sobald mindestens eine Aktie im Depot ist.

### D3. Auf dem iPhone installieren

In **Safari** die App-Adresse öffnen → **Teilen** → **Zum Home-Bildschirm**. Nur so installiert, empfängt die App später Push-Nachrichten (ab iOS 16.4). Die Home-Bildschirm-App hat einen **eigenen Speicher**, getrennt von Safari. Deshalb dort erneut anmelden und die JSON-Sicherung über **Wiederherstellen** einspielen.

### D4. Suche

Ins Suchfeld eintippen, z. B. `716460` (WKN) → `SAP.DE · Xetra`, `A0RPWH` → `EUNL.DE`, `Rheinmetall` → `RHM.DE`. Ein neuer Ticker zeigt „wird geladen…“, bis die Action ihn abgerufen hat (spätestens beim nächsten 30-Minuten-Lauf).

### Prüfliste

- [ ] Login per Code (E-Mail enthält einen Code, keinen Link)
- [ ] Fremde Adresse → „Für diese E-Mail-Adresse gibt es kein Konto.“
- [ ] Depots nach CSV-Import sichtbar, Kurse mit „Stand: HH:MM“
- [ ] Suche nach WKN, ISIN und Name
- [ ] Charts 1W bis 10Y und „Seit Kauf“
- [ ] JSON-Sicherung → auf zweitem Gerät wiederherstellen
- [ ] Flugmodus: App startet und zeigt die letzten Kurse

---

## E. Push-Benachrichtigungen

### E1. Schlüssel für den Versand (VAPID)

Einmalig ein Schlüsselpaar erzeugen und direkt in GitHub eintragen. Der private Schlüssel wird dabei nie angezeigt:

```bash
pip install cryptography
python scripts/gen_vapid.py --github     # setzt Variable VITE_VAPID_PUBLIC_KEY und Secret VAPID_PRIVATE_KEY
gh secret set VAPID_SUBJECT --body "https://<dein-github-name>.github.io"
```

`VAPID_SUBJECT` ist eine Kontaktangabe für Apple/Google: entweder `mailto:name@domain` oder eine https-Adresse **ohne Pfad**. `https://…github.io/stock-dashboard/` wird abgelehnt.

Danach muss die App neu gebaut werden (**Actions → PWA veröffentlichen → Run workflow** oder ein beliebiger Push), damit sie den öffentlichen Schlüssel enthält.

Ein neues Schlüsselpaar macht alle bestehenden Abos ungültig. Die App meldet sich beim nächsten Öffnen selbst neu an, sofern Benachrichtigungen erlaubt sind.

### E2. Neuer Ticker → sofort laden (optional)

Ohne diesen Schritt erscheinen neue Ticker spätestens nach dem nächsten 30-Minuten-Lauf. Mit ihm startet Supabase die Action sofort.

1. Supabase → **SQL Editor** → **+ New query** → Inhalt von [`supabase/migrations/0002_dispatch_new_ticker.sql`](../supabase/migrations/0002_dispatch_new_ticker.sql) einfügen → **Run**.
2. GitHub → Profilbild → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**:
   - **Token name:** `supabase-dispatch`
   - **Expiration:** z. B. 1 Jahr (danach erneuern, siehe unten)
   - **Repository access:** *Only select repositories* → `stock-dashboard`
   - **Permissions → Repository permissions → Actions:** *Read and write*. Sonst nichts.
   - **Generate token** und kopieren.
3. Supabase → **SQL Editor** → mit deinem Token und Repo:

   ```sql
   select vault.create_secret('github_pat_…DEIN_TOKEN…', 'github_dispatch_token');
   select vault.create_secret('davidkaluza/stock-dashboard', 'github_repo');
   ```

Der Token kann nur Workflows dieses Repos starten, keinen Code ändern.

**Token erneuern:** neuen Token erzeugen, dann
`select vault.update_secret((select id from vault.secrets where name = 'github_dispatch_token'), 'github_pat_…NEU…');`

**Prüfen:** In der App einen neuen Ticker hinzufügen → unter GitHub **Actions** startet nach wenigen Sekunden ein Lauf „Kurse abrufen“.

### E3. Auf dem Gerät aktivieren

1. iPhone/iPad: Die App muss **zum Home-Bildschirm hinzugefügt** sein (D3), ab iOS 16.4. Android/Desktop: im Browser oder als installierte App.
2. **Einstellungen → Benachrichtigungen → Aktivieren** → Abfrage **Erlauben**.
3. **Test-Anzeige** prüft die Darstellung auf dem Gerät.
4. Echter Versand: GitHub → **Actions → Kurse abrufen → Run workflow → Modus `test-push`**. Nach etwa einer Minute kommt „Testnachricht – Benachrichtigungen funktionieren.“

### E4. Regeln festlegen

Auf jeder Karte und in jeder Tabellenzeile öffnet das **Glocken-Symbol** die Regeln für die Aktie. Ist mindestens eine Regel aktiv, ist die Glocke gefüllt.

| Regel | Meldet |
|---|---|
| Tagesänderung | Änderung zum Vortag ≥ X %, je Richtung einmal pro Tag |
| Kursschwelle | Kurs über/unter festem Wert, erneut erst nach Rückkehr (0,5 % Abstand) |
| Referenzkurs | ±X % gegenüber einem Referenzkurs (vorbelegt mit dem Kaufkurs; dieser eine Wert wird auf dem Server gespeichert) |
| News | neue Meldungen zur Aktie |

Geprüft wird bei jedem Lauf der Action (Mo–Fr alle 30 Minuten). Höchstens 20 Pushes pro Lauf, alle Meldungen stehen unter **Einstellungen → Benachrichtigungen → Zuletzt gesendet**. Die Regeln sind in der JSON-Sicherung enthalten.

---

## Lokal entwickeln

```bash
cd frontend && cp .env.example .env.local    # Project URL + Publishable key eintragen
npm install && npm run dev                   # http://localhost:5173
pip install -r pipeline/requirements-dev.txt
python -m pytest pipeline/tests              # Tests ohne Netz
python -m pipeline.run quotes --dry-run SAP.DE AAPL   # echte Yahoo-Daten, nichts wird geschrieben
```

Manuell veröffentlichen ohne GitHub: `supabase login`, dann `supabase functions deploy lookup --project-ref <projekt-id>`.
