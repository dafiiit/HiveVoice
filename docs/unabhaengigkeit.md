# Plan zur Unabhängigkeit

Wovon HiveVoice heute abhängt, was das kostet oder einschränkt, und wie die App nach dem MVP ohne Plattform-
Konzerne und ohne zentralen Betreiber laufen kann. Stand: Oktober 2026.

## Leitlinien

1. **Offene Standards vor Anbietern.** Jede Abhängigkeit hinter einer Schnittstelle, die es mehrfach gibt
   (Postgres-Protokoll, S3, SMTP, OIDC, ActivityPub, MapLibre-Stil, OpenAI-kompatible API).
2. **Gleiche Software, viele Betreiber.** Die Flagship-Instanz ist nur eine von vielen; Vereine, Kommunen,
   Schulen betreiben ihre eigene mit `docker compose up`.
3. **Fachlogik in SQL bleibt.** Rechte, Abstimmungen, Matching laufen in Postgres und sind damit bei jedem
   Betreiber gleich – das ist die wichtigste Grundlage für Unabhängigkeit und ist schon da.
4. **Schrittweise.** Erst austauschbar machen (Konfiguration statt Code), dann selbst betreiben, dann föderieren.

## Abhängigkeiten heute

| Abhängigkeit | Wofür | Art | Kosten | Austauschbar heute? |
|---|---|---|---|---|
| **Vercel** | Hosting der Next.js-App, Deploys | proprietär, gehostet | Hobby kostenlos, Pro ab 20 $/Monat und Person | ja: `Dockerfile`, `output: standalone` |
| **Supabase Postgres** | Datenbank | Postgres (offen), gehostet | Free / Pro 25 $/Monat | ja: jedes Postgres ≥ 15; nur `…003_supabase.sql` ist spezifisch |
| **Supabase Auth (GoTrue)** | Login, E-Mail-Bestätigung, Google-Login, Captcha-Prüfung | offen (MIT), gehostet | im Plan enthalten | teilweise: GoTrue als Container möglich; App nutzt `@supabase/ssr` |
| **Supabase Storage** | Fotos, Dateien | offen, S3-kompatibel | im Plan, Speicher extra | teilweise: `src/lib/upload.ts`, `storage.ts` rufen Supabase-API direkt |
| **Supabase Edge Functions** | Embeddings fürs Matching (gte-small) | Edge Runtime offen (Deno) | im Plan | ja: ohne Funktion fehlt nur der Grund „ähnliche Bedeutung“ |
| **pg_cron** | `app.tick()` alle 5 Minuten | offen | – | ja: `GET /api/cron` mit `CRON_SECRET` |
| **Resend** | E-Mails (Bestätigung, Hinweise) | proprietär | 3.000 Mails/Monat frei, dann ab 20 $ | teilweise: eigener Client in `src/lib/mail.ts` |
| **Cloudflare Turnstile** | Bot-Schutz bei Login und Registrierung | proprietär, kostenlos | 0 € | ja: abschaltbar, hCaptcha/ALTCHA möglich |
| **Google** (OAuth, Fotos-Picker, Safe Browsing) | Google-Login, „Aus Google Fotos“, Link-Prüfung | proprietär | kostenlos mit Kontingent | ja: alles optional |
| **OpenFreeMap** | Kartenkacheln | offen (OSM), gehostet von Dritten | 0 € | ja: `NEXT_PUBLIC_MAP_STYLE_URL` |
| **draw.io** (diagrams.net) | Diagramm-Editor in Ich → Diagramme | offen (Apache 2.0), gehostet von JGraph | 0 € | ja: `NEXT_PUBLIC_DRAWIO_URL` (Docker-Image `jgraph/drawio`) |
| **Wikidata, OpenPLZ** | Gemeinden, PLZ, Koordinaten | offene Daten (CC0 / ODbL) | 0 € | ja: einmaliger Import, liegt danach in der eigenen DB |
| **GitHub** | Code, Issues, Auslöser für Deploys | proprietär | 0 € | ja: Git ist dezentral |
| **npm-Pakete** | Next.js, React, postgres.js, MapLibre, zod … | offen | 0 € | ja, aber Next.js wird vor allem von Vercel entwickelt |

## Für jede Abhängigkeit eine Lösung

| Abhängigkeit | Ersatz | Aufwand | Wann |
|---|---|---|---|
| Vercel | Docker-Container auf einem EU-Server (Hetzner, netcup, Uberspace) mit Caddy als Reverse-Proxy; oder Coolify als selbst betriebene „Vercel-Oberfläche“ | klein: Container gibt es | nach dem MVP |
| Supabase Postgres | Postgres in Compose; Backups mit `pg_dump`/WAL-G in S3 | klein | mit dem Selfhost-Paket |
| Supabase Auth | **Variante A:** GoTrue-Container weiterverwenden (offen, gleiche API, kein Code-Umbau). **Variante B:** Auth in die App holen (Auth.js oder Lucia-artiges Session-Modell in Postgres) und dann OIDC für eID und Föderation | A klein, B mittel | A sofort möglich, B wenn eID kommt |
| Supabase Storage | S3-Schnittstelle direkt (MinIO, Garage, Hetzner Object Storage); `upload.ts`/`storage.ts` auf eine kleine Speicher-Schicht mit zwei Implementierungen umstellen | mittel | mit dem Selfhost-Paket |
| Edge Function (Embeddings) | dieselbe Funktion im Supabase-Edge-Runtime-Container, oder Transformers.js im App-Server, oder ein OpenAI-kompatibler Endpunkt (Ollama, vLLM) über `EMBEDDING_URL` | klein | wenn Matching ausgebaut wird |
| pg_cron | `GET /api/cron` (gibt es) per Container-Cron | keiner | sofort |
| Resend | SMTP-Schnittstelle: beliebiger Mailserver oder EU-Dienst (Brevo, Mailjet, eigener Postfix); `src/lib/mail.ts` auf SMTP umstellen (nodemailer) | klein | nach dem MVP |
| Turnstile | ALTCHA (offen, Proof-of-Work, ohne Dritte) oder Friendly Captcha (EU); GoTrue kennt nur hCaptcha/Turnstile, mit eigener Auth frei wählbar | klein | mit Variante B der Auth |
| Google-Login | weitere OIDC-Anbieter (z. B. Nextcloud, Keycloak eines Vereins) und vor allem die eID | mittel | mit eID |
| Google Fotos | normaler Datei-Upload (gibt es); optional Nextcloud-/WebDAV-Import | – | – |
| Safe Browsing | eigene Sperrlisten (z. B. URLhaus, Phishing.Database) | klein | bei Bedarf |
| OpenFreeMap | eigene PMTiles-Datei für Deutschland (~1 GB) im eigenen Speicher, MapLibre-Stil zeigt darauf | klein | sobald Karten viel genutzt werden |
| draw.io | eigener draw.io-Server (Docker `jgraph/drawio`, statische Dateien), `NEXT_PUBLIC_DRAWIO_URL` zeigt darauf | klein | sobald Diagramme viel genutzt werden |
| GitHub | Codeberg/Forgejo als Spiegel, Releases als Container-Images in einer offenen Registry | klein | jederzeit |
| Next.js | bleibt (offen, MIT); Risiko beobachten. Die Fachlogik in SQL macht einen späteren Wechsel des Frontends möglich | – | – |

## Für jede zentrale Komponente eine dezentrale Alternative

| Zentral heute | Dezentral | Wie es zu HiveVoice passt |
|---|---|---|
| **Eine Instanz** (Flagship) | **Viele Instanzen, föderiert** über ActivityPub. Schema ist vorbereitet (`uri`, `origin_instance_id`, `instances`, `federation_outbox`) | Gruppen, Initiativen, Einträge als ActivityPub-Objekte; Mastodon & Co. können folgen. Fahrplan in `architektur.md` |
| **Konten** in einer Datenbank | **Konten je Instanz + portable Identität**: Login bei der eigenen Instanz, Umzug mit `Move`-Aktivität (wie Mastodon); langfristig DID oder eID-Attestierung | Remote-Profile sind schon ohne lokalen Login möglich (`profiles.auth_user_id` optional) |
| **Bestätigung „echter Mensch“** durch den Betreiber | **Signierte Attestierungen**: eine Instanz (oder ein eID-Dienst) bestätigt „eine Person, ein Konto, wohnt in X“, andere Instanzen prüfen die Signatur | Stufe 5 im Föderations-Fahrplan; verhindert, dass Stimmen über Instanzen hinweg doppelt zählen |
| **Abstimmungen** auf dem Server der Instanz | **Abstimmung bleibt bei der Instanz der Initiative**, Stimmen anderer Instanzen kommen mit Attestierung; später Blind Signatures, damit niemand Stimme und Person verknüpfen kann | Teilnahme und Stimme sind schon getrennt gespeichert |
| **Marktplatz und Matching** zentral | **Einträge föderieren als ActivityPub-Objekte** (Typ `Offer`/`Request` mit Kategorie und Ort als Erweiterung); jede Instanz rechnet Treffer lokal über alles, was sie empfängt | `app.listing_matches` arbeitet auf jeder Instanz gleich; Embeddings werden lokal berechnet, nie ausgetauscht |
| **Chats** über den Server | **Ende-zu-Ende-verschlüsselt** (MLS, z. B. OpenMLS), Server sieht nur verschlüsselte Nachrichten; föderierbar über Matrix als Brücke | Notfallzugriff (zweite Freigabe) muss dann neu gedacht werden: Meldung mit Klartext durch Beteiligte |
| **Dateien** in einem Speicher | **Speicher je Instanz**, Links statt Kopien; für große Gemeinschaften IPFS oder einfach WebDAV der eigenen Cloud | „Wissen teilen“ funktioniert schon über Links |
| **Moderation** durch Betreiber | **Moderation je Instanz + gemeinsame Sperrlisten** (wie Fediverse-Blocklisten), Jury-Verfahren bleibt lokal | Jury, Einspruch, Transparenzbericht gibt es schon |
| **Karten** von einem Kachel-Dienst | **PMTiles je Instanz** oder gemeinsamer Kachel-Server einer Genossenschaft | Konfiguration reicht |
| **Entwicklung** bei einer Person | **Gemeinnütziger Träger** (Verein oder Genossenschaft der Instanzen), AGPL-Lizenz sichert, dass Änderungen offen bleiben | Lizenz ist schon AGPL-3.0 |

## Fahrplan

1. **Austauschbar machen (nächste Monate)**
   - Speicher-Schicht mit S3-Implementierung (`upload.ts`, `storage.ts`).
   - Mail über SMTP statt Resend-API.
   - `EMBEDDING_URL` statt fester Edge Function.
   - Codeberg-Spiegel, Container-Image bei jedem Release.
2. **Selbst betreiben (Selfhost-Paket)**
   - `docker-compose.yml` mit Postgres, GoTrue, MinIO, App, Caddy, Cron.
   - Anleitung für Vereine; ein Pilotverein betreibt eine eigene Instanz.
   - Flagship-Instanz zieht von Vercel/Supabase auf einen EU-Server (gleiche Compose-Datei).
3. **Eigene Identität**
   - eID-Anbindung, Auth in die App (Variante B), OIDC für Instanzen, ALTCHA statt Turnstile.
4. **Föderation**
   - Nur-Lese-ActivityPub (Gruppen, Initiativen, Einträge), dann beidseitig, dann Attestierungen.
5. **Ende-zu-Ende-Verschlüsselung** der Chats.

## Kosten im Vergleich (grob, 1.000 aktive Personen)

| | heute (Vercel + Supabase + Resend) | selbst betrieben |
|---|---|---|
| Hosting/Datenbank | 0–45 $/Monat, bei Wachstum deutlich mehr | ein Server (4 vCPU, 8 GB) ~10–20 €/Monat |
| Speicher | im Plan bis 100 GB | Object Storage ~5 €/TB |
| E-Mail | 0–20 $ | SMTP-Dienst ~0–10 € |
| Arbeit | wenig | Updates, Backups, Monitoring: ein paar Stunden im Monat |
