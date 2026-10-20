# Tasks

## Active
- [ ] **Bot-Schutz einschalten** - Code fertig; Schritte in docs/betrieb.md: Turnstile-Widget bei Cloudflare anlegen, Secret im Supabase-Dashboard (Authentication → Bot and Abuse Protection), `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in Vercel und `.env.local` – Supabase und Site Key gleichzeitig, sonst scheitert jede Anmeldung
- [ ] **Rechtstexte festlegen** - Checkliste in docs/betrieb.md; Datenschutztext nennt jetzt alle Dienste (Resend, Turnstile, OpenFreeMap, Link-Vorschau, Matching). Offen: Impressum-Angaben, Rechtsgrundlagen, AV-Verträge, DSA-Kontaktstelle, Umgang mit Behördenanfragen – vom Betreiber zu klären und prüfen zu lassen
- [ ] **Matching mit KI (Stufe 2)** - Konzept in docs/markt.md: pgvector-Ähnlichkeit als weiterer Grund in `app.listing_matches`; Anbieter/Datenschutz vorher entscheiden

## GUI mobile

## GUI desktop

## Waiting On

## Someday
- [ ] **eID-Anbindung** - Modus `eid` ist vorbereitet, aber noch kein eID-Dienst angebunden
- [ ] **Virenscanner für Uploads** - `scan_status` existiert, aber kein Scanner; braucht einen Dienst außerhalb der App
- [ ] **Aufräumen gelöschter Dateien im Speicher** - nach 30 Tagen Papierkorb bleibt die Datei unlesbar im Speicher liegen, bis sie jemand mit dem Service-Schlüssel entfernt (Cron-Job oder Edge Function)
- [ ] **Auffälligkeiten pro IP erkennen** - „viele neue Konten von einer Adresse"; braucht Edge/WAF
- [ ] **Oberfläche für Notfallzugriff auf Chats** - DB-Funktionen (Antrag, zweite Freigabe, Protokoll) sind da, Lese-Oberfläche bewusst noch nicht gebaut
- [ ] **Live-Zusammenarbeit an Dokumenten** - bisher nur Sperre und Versionen; CRDT erst bei Bedarf
- [ ] **Föderation über Stufe 1 hinaus** - Remote-Profile sind höchstens Stufe 1, mehr ist noch nicht gebaut

## Done
- [x] **~~Offene Änderungen committen~~ (2026-10-20)** - war schon in e8449f7
- [x] **~~Anfrage und Angebot: klarer unterscheiden / Mischform~~ (2026-10-20)** - Ein Formular mit „Ich biete / Ich suche“; Tausch legt das Gegenstück an und verbindet beide
- [x] **~~Formulare für verschiedene Zwecke~~ (2026-10-20)** - Kategorien Hilfe, Jobs, Wohnen, Dinge, Mitfahrt, Kurse plus eigenes Formular mit eigenen Feldern
- [x] **~~Anfrage und Angebot: klarer matchen / besseres Matching~~ (2026-10-20)** - `app.listing_matches` mit Gründen für beide Seiten, Bezug beim Anfragen, Mitteilung bei neuen Treffern; Marktplatz in Entdecken mit Filtern je Kategorie
- [x] **~~Karte: echte Kartenanbindung~~ (2026-10-20)** - MapLibre + OpenFreeMap (Vergleich in docs/markt.md), lädt erst nach Klick, Gemeinde-Mittelpunkte aus Wikidata
- [x] **~~Rechte und Verantwortung, Stufen 1 bis 9 umgesetzt~~ (2026-10-19)**
