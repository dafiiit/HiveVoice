# Tasks

## Active
- [ ] **Bot-Schutz einschalten** - Code fertig; Schritte in docs/betrieb.md: Turnstile-Widget bei Cloudflare anlegen, Secret im Supabase-Dashboard (Authentication → Bot and Abuse Protection), `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in Vercel und `.env.local` – Supabase und Site Key gleichzeitig, sonst scheitert jede Anmeldung
  - [ ] I did this, check if it worked...
- [ ] **Rechtstexte festlegen** - Checkliste in docs/betrieb.md; Datenschutztext nennt jetzt alle Dienste (Resend, Turnstile, OpenFreeMap, Link-Vorschau, Matching). Offen: Impressum-Angaben, Rechtsgrundlagen, AV-Verträge, DSA-Kontaktstelle, Umgang mit Behördenanfragen – vom Betreiber zu klären und prüfen zu lassen
- [ ] **Matching mit KI (Stufe 2)** - Konzept in docs/markt.md: pgvector-Ähnlichkeit als weiterer Grund in `app.listing_matches`; Anbieter/Datenschutz vorher entscheiden
  - [ ] ja nutze hier erstmal supabase
- [ ] **Werbematerial erstellen** - zeige 10 verschiedene Usecases, für verschiedene Personas welche zeigen was diese App besonders geeignet macht für diese Personen in dieser Situation.
  - [ ] Create a powerpoint presenting the App. The philosophical concept, the real life application for personas, the advantage over other social medias.
- [ ] **Plan zur unabhängigkeit** - Analysiere von welchen providern/closed source/kostenpflichtig die app aktuell abhängig ist und wie wir nach dem MVP später zu einer unabhänigen, dezentralen Lösung kommen.
  - [ ] Für jede Abhängigkeit finde eine Lösung
  - [ ] Für jede zentrale komponente überlege dir eine dezentrale alternative

## GUI mobile

## GUI desktop and mobile
- [ ] **Packe "Anfragen" und "Anbieten" in eine Kategorie in der Seitenleiste, sodass es nur noch drei gibt. Die gemeinsame Kategorie soll "Anliegen" heißen. Sie soll elegant beides verbinden.**
- [ ] **Verknüpfungen in der App stärken** - Es gibt einige Kreuzverbindungen in der App und ich will diese Stärken. Suche weitere die ich vergessen habe und stelle sicher das alles möglich ist. Es gibt Aufgaben, Gruppen, Dokumente, Angebote und Anfragen.  alle soll man in den Chats oder Marktplatz Verschicken können.  alle soll man Einer Gruppe hinzufügen können.  Für alle soll man verschiedene Optionen haben, was das lese und schreibrecht angeht und man kann diese beiden getrennt verwalten (nur ich, spezielle Personen hinzufügen, jeder mit dem ich den Link geteilt habe, jeder im Internet)
  - [ ] überlege wie man das alles organisieren kann, dass man maximalen spielraum beim gestalten hat
  - [ ] Implementiere die möglichkeiten zur vollen verschachtelung. Stelle dabei sicher das es übersichtlich bleibt.
  - [ ] Ich will das jeder Verein, jede Schule, jede schon existierende Gruppe sich diese App so gestalten kann, das sie ihren Ansprüchen gerecht wird. Denke die zB. 10 verschiedene Communities in der Gesellschaft aus und überlege was für ansprüche sie hätten und wie man diesen gerecht werden könnte.

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
