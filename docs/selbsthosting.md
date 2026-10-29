# Selbst hosten

HiveVoice läuft für alle in der Cloud (Vercel + Supabase). Wer seine Daten selbst halten will, betreibt dieselbe
Software auf einem eigenen Rechner: einem PC, der ohnehin läuft, einem kleinen Heimserver oder einem Raspberry Pi
(Anleitung: `docs/raspberry-pi.md`). Alles liegt dann dort: Datenbank, Anmeldung, Fotos und Dateien.

## Drei Wege

1. **Desktop-App, ein Klick** (macOS, Linux): Einstellungen → „Diesen Rechner als Server“. Die App legt das Paket
   nach `~/HiveVoice-Server`, lädt das fertige Image (`ghcr.io/dafiiit/hivevoice`) und richtet alles ein. Braucht
   Docker Desktop (oder Docker unter Linux). Windows: Weg 2 in WSL.
2. **Skript**: im Repository `selfhost/setup.sh` ausführen. Es fragt, wie andere den Server erreichen sollen.
3. **Von Hand**: wie unten unter „Bausteine“, für eigene Server mit eigener Postgres-Datenbank.

## Wie andere den Server erreichen

| Zugang | Was man braucht | Adresse |
|---|---|---|
| `local` | nichts | `http://<IP im Heimnetz>:8080`, nur im eigenen WLAN |
| `tailscale` | kostenloses Tailscale-Konto, ein Auth-Key, „Funnel“ im Tailnet erlaubt | fest, mit https: `https://hivevoice.<tailnet>.ts.net`, von überall, **ohne Router-Einstellungen** |
| `cloudflare` | Domain bei Cloudflare, ein Tunnel mit öffentlichem Hostnamen auf `http://gateway:80` | `https://hv.deine-domain.de`, ohne Router-Einstellungen |
| `domain` | eine Domain, die auf deine Internetadresse zeigt, Ports 80 und 443 im Router an den Rechner weitergeleitet | `https://hv.deine-domain.de`; das Zertifikat holt Caddy selbst |

Tailscale ist der einfachste Weg „von überall“: keine Domain, keine Portfreigabe, und die Adresse ändert sich nicht.
Ändert man den Zugang später, `./setup.sh --mode …` noch einmal: die Daten bleiben, nur die Adresse wechselt.

## Mit dem Skript

```bash
git clone https://github.com/dafiiit/HiveVoice.git
```

```bash
cd HiveVoice/selfhost && ./setup.sh
```

Ohne Fragen, zum Beispiel für Tailscale:

```bash
./setup.sh --mode tailscale --ts-authkey tskey-auth-… --admin du@example.org --yes
```

Weitere Schalter: `--image ghcr.io/dafiiit/hivevoice:latest` (fertiges Image statt selbst bauen; auf dem Raspberry Pi
dringend empfohlen), `--no-regions` (Gemeinden und Postleitzahlen nicht laden; sonst einmal, etwa eine halbe Minute, weil beim Start jede Person einen Ort wählt), `--status`, `--stop`.
Noch einmal `./setup.sh` aktualisiert: neues Image, neue Migrationen, Neustart; Daten und Geheimnisse bleiben.

Danach unter der angezeigten Adresse mit der Admin-E-Mail registrieren und unter Einstellungen → Ansicht auf
„Verwaltung“ wechseln. Ohne Mailserver werden neue Konten sofort bestätigt (für eine kleine Instanz unter Menschen, die
sich kennen); mit `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` und `MAIL_AUTOCONFIRM=false` in
`selfhost/.env` bekommt jede Anmeldung eine Bestätigungsmail.

## Sichern und umziehen

```bash
./backup.sh
```

schreibt `selfhost/backups/hivevoice-<datum>.tar.gz` (Datenbank mit allen Konten und die gespeicherten Dateien).
Auf einem neuen Rechner: `./setup.sh`, dann `./backup.sh --restore backups/hivevoice-….tar.gz`. Die Sicherung gehört
auf eine zweite Platte oder einen anderen Rechner; `selfhost/.env` (die Geheimnisse) ebenso, aber getrennt aufbewahrt.

## Aus der Cloud herausziehen

Die Software ist dieselbe, also lassen sich die Daten mitnehmen: mit der direkten Postgres-Verbindung des
Supabase-Projekts (Einstellungen → Database, als `postgres`) `pg_dump --data-only` der Schemas `public` und `auth`,
dann auf dem eigenen Server einspielen (`psql` mit `session_replication_role = replica`), die Dateien aus dem Bucket
`images` mit dem Service-Schlüssel herunterladen und mit `docker compose cp` in den Dienst `storage` legen. Das ist noch Handarbeit und
nicht gegen die Live-Datenbank geprobt; ein Skript dafür steht in TASKS.md.

## Bausteine (was das Paket startet)

`selfhost/compose.yml`, alle Images gibt es für x86 und 64-Bit-ARM:

| Dienst | Image | Wofür |
|---|---|---|
| `db` | `supabase/postgres` | Postgres mit `pg_cron`, Vault und den Rollen, die Supabase Auth und Storage brauchen |
| `auth` | `supabase/gotrue` | Anmeldung (dieselbe Software wie in der Cloud) |
| `storage` | `supabase/storage-api` | Fotos und Dateien, in einem Docker-Volume (ein freigegebener Mac- oder Windows-Ordner kann ihre erweiterten Attribute nicht speichern); `backup.sh` holt sie heraus |
| `app` | `hivevoice` (dieses Repository, `Dockerfile`) | die App; trägt die Migrationen mit (`node scripts/migrate.mjs`) |
| `gateway` | `caddy` | eine Adresse für alles: `/auth/v1` → Anmeldung, `/storage/v1` → Dateien, sonst die App; bei `domain` mit Zertifikat |
| `tailscale` / `cloudflared` | offizielle Images | der Zugang von außen (nur mit `--profile`) |

Die App bekommt Adresse und öffentlichen Schlüssel der Anmeldung erst beim Start (`SUPABASE_PUBLIC_URL`,
`SUPABASE_ANON_KEY`, `src/lib/supabase/config.ts`); deshalb läuft dasselbe Image unter jeder Adresse. Die Geheimnisse
(Datenbank-Passwörter, JWT-Schlüssel, Abstimmungs-Geheimnis) erzeugt `setup.sh` einmal und schreibt sie nach
`selfhost/.env` (nicht im Git).

## Von Hand, mit eigener Datenbank

```bash
MIGRATION_MODE=direct MIGRATION_DATABASE_URL=postgresql://postgres:<pw>@localhost:5432/hivevoice npm run db:migrate
```

`20261015000003_supabase.sql` setzt `pg_cron` und das `auth`-Schema von GoTrue voraus, `…067_nextcloud.sql` Supabase
Vault. Ohne `pg_cron`: alle fünf Minuten `GET /api/cron` mit `Authorization: Bearer $CRON_SECRET` aufrufen. App-Login:

```sql
create role hivevoice_app login noinherit password '<starkes-passwort>';
grant hivevoice_server to hivevoice_app with inherit true, set true;
```

Für die App reichen dann `DATABASE_URL` (mit `?sslmode=disable`, wenn die Datenbank ohne TLS daneben läuft),
`SUPABASE_PUBLIC_URL`, `SUPABASE_ANON_KEY`, `APP_URL`, `BALLOT_SECRET`, `ADMIN_EMAILS`.
