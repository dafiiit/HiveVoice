# Selbst hosten

Das MVP läuft auf Vercel + Supabase. Die Architektur ist so gebaut, dass ein eigener Server dieselbe Software betreibt.

## Was du brauchst

- PostgreSQL 15 oder neuer
- Supabase Auth (GoTrue) als Login-Dienst, z. B. als einzelnen Container `supabase/auth`
  (alternativ das komplette Supabase-Selfhosting)
- Den App-Container aus dem `Dockerfile`

## Datenbank einrichten

```bash
# Superuser-Verbindung, Migrationen direkt ausführen
MIGRATION_MODE=direct MIGRATION_DATABASE_URL=postgresql://postgres:<pw>@localhost:5432/hivevoice npm run db:migrate
MIGRATION_MODE=direct MIGRATION_DATABASE_URL=... npm run db:regions
```

`20261015000003_supabase.sql` setzt `pg_cron` und das `auth`-Schema von GoTrue voraus. Ohne `pg_cron`:
Zeile mit `cron.schedule` weglassen und alle fünf Minuten `GET /api/cron` mit `Authorization: Bearer $CRON_SECRET` aufrufen.

App-Login anlegen:

```sql
create role hivevoice_app login noinherit password '<starkes-passwort>';
grant hivevoice_server to hivevoice_app with inherit true, set true;
```

## App starten

```bash
docker build -t hivevoice \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://auth.example.org \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon-key> .
docker run --env-file .env -p 3000:3000 hivevoice
```

Danach den geheimen Admin-Pfad (`ADMIN_PATH`) öffnen und dich als ersten Admin eintragen.
Dort trägst du auch die offiziellen E-Mail-Domains ein und schaltest später auf „Nur Online-Ausweis“ um.
