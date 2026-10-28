# Nextcloud verbinden

Seit 2026-10-28. Eine Person oder eine Gruppe verbindet ihre eigene Nextcloud mit HiveVoice:

- **Kalender**: ein Kalender der Nextcloud erscheint in HiveVoice bei den eigenen Terminen (Ich → Kalender) oder im
  Gruppenkalender, mit „Nextcloud“ markiert. Wiederholungen löst Nextcloud selbst auf (CalDAV `expand`).
- **Abo**: die eigenen HiveVoice-Termine erscheinen als abonnierter Kalender in Nextcloud (über die geheime
  Abo-Adresse aus Ich → Kalender, mit Erinnerungen). Nur für die eigene Nextcloud.
- **Galerie**: ein Ordner der Nextcloud erscheint als Fotogalerie (Ich → Uploads, in Gruppen als Reiter „Nextcloud“),
  mit Unterordnern, Hochladen dorthin und „In Nextcloud öffnen“.

## So verbindet man

Einstellungen → Nextcloud (persönlich) oder in der Gruppe: Werkzeug „Nextcloud“ einschalten, dann im Reiter
(nur Admins). Adresse eintragen, „Verbinden“: Nextclouds eigene Anmeldung öffnet sich in einem neuen Tab
(Login Flow v2), dort „Zugriff gewähren“. HiveVoice bekommt ein **App-Passwort**; das eigentliche Passwort tippt
niemand in HiveVoice ein. In Nextcloud steht der Zugang danach unter Einstellungen → Sicherheit → Geräte und
Sitzungen und lässt sich dort jederzeit widerrufen. „Trennen“ in HiveVoice nimmt das Abo und das App-Passwort zurück.

## Wie es gebaut ist

| Teil | Wo |
|---|---|
| Tabelle, Rechte, Geheimnis | `supabase/migrations/20261028000067_nextcloud.sql`: `public.nextcloud_links` (für Clients gesperrt), App-Passwort verschlüsselt in **Supabase Vault**, Liste ohne Geheimnis über `app.nextcloud_list()`, das Passwort nur für die Server-Rolle über `app.nextcloud_credentials()` nach `app.nextcloud_access()` als die anfragende Person |
| Gespräch mit Nextcloud | `src/lib/nextcloud.ts`: Login Flow v2, Kalender (PROPFIND, REPORT mit `expand`), Abo (MKCOL mit `cs:subscribed` und `cs:source`), Dateien (PROPFIND, PUT), Vorschaubilder (`/index.php/core/preview.png?file=…`) |
| Aktionen | `src/lib/actions/nextcloud.ts` |
| Bilder und Dateien | `src/app/api/nextcloud/[id]/route.ts`: nur Dateien im gewählten Ordner, für alle, die die Verbindung nutzen dürfen; das App-Passwort verlässt den Server nie |
| Oberfläche | `src/components/nextcloud/` (Verbinden, Galerie, Hochladen) |

**Sicherheit**: Nur `https`-Adressen im öffentlichen Internet (sonst könnte jemand den Server in sein eigenes Netz
fragen lassen). Eine Nextcloud im selben Heimnetz wie ein selbst gehostetes HiveVoice erlaubt
`NEXTCLOUD_ALLOW_PRIVATE=1` (im Selbst-Hosting-Paket gesetzt). Pfade mit `..` werden abgelehnt; Gruppenmitglieder
sehen nur den gewählten Ordner, nicht die übrige Nextcloud der Person, die verbunden hat. Dateien, die keine Bilder
sind, werden nur heruntergeladen, nie als Seite angezeigt.

## Testen

- `tests/nextcloud.test.ts`: Termine lesen, WebDAV-Antworten, gesperrte Pfade und Adressen.
- `tests/db.test.ts` › nextcloud: Rechte (eigene, Gruppe, Fremde), Geheimnis nur für den Server, Neu-Verbinden, Trennen.
- `e2e/nextcloud.spec.ts`: der ganze Weg mit einer echten Nextcloud (Anmeldung im neuen Tab, Kalender, Galerie, Abo,
  Trennen). Braucht eine lokale Nextcloud:

```bash
docker run -d --name hv-nextcloud -p 8090:80 -e SQLITE_DATABASE=nc -e NEXTCLOUD_ADMIN_USER=admin -e NEXTCLOUD_ADMIN_PASSWORD=<passwort> -e NEXTCLOUD_TRUSTED_DOMAINS=localhost nextcloud:31-apache
```

```bash
NEXTCLOUD_TEST_URL=http://localhost:8090 NEXTCLOUD_TEST_PASSWORD=<passwort> npx playwright test e2e/nextcloud.spec.ts --project=desktop
```

## Später

- Aufgaben als VTODO über CalDAV (Nextcloud Tasks), siehe `docs/open-source.md`.
- Termine nach Nextcloud schreiben statt nur abonnieren (dann auch Gruppentermine).
- Andere CalDAV- und WebDAV-Server (Radicale, Baïkal, ownCloud) über denselben Code, mit Benutzername und App-Passwort statt Login Flow.
