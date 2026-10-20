# Tasks

## Active
- [ ] **Rechtstexte festlegen** - Checkliste in docs/betrieb.md; Datenschutztext nennt alle Dienste. Offen: Impressum-Angaben, Rechtsgrundlagen, AV-Verträge, DSA-Kontaktstelle, Umgang mit Behördenanfragen – vom Betreiber zu klären und prüfen zu lassen
- [ ] **Füge eine Sektion: "Meine Inhalte" unter der sektion "Verbinden" hinzu** - diese soll Dokumente, Todolisten, Projekte, etc. die man selber erstellt hat enthalten
  - [ ] per default privat

## GUI mobile
- [ ] **Doppelte Chats in Verbinden** - auf dem Handy erscheinen Mia Schuster, Felix Wolf und Ali Rahimi je zweimal (gleiche Vorschau). Sieht nach doppelt angelegten Demo-Chats aus (`app.ensure_demo_chats()` beim Laden von /connect, evtl. parallele Aufrufe); noch nicht untersucht
- [ ] **Kopfzeile: „Anmelden“ ragt über den Rand** - abgemeldet auf 390 px Breite (z. B. /explore) passen Logo, „Haltung“, Sprachwahl und Anmelden nicht nebeneinander, der Knopf wird rechts abgeschnitten. Bei 360 und 390 px prüfen (src/components/shell/)

## GUI desktop and mobile
- [ ] **GUI cleanup**
  - [ ] we need alignment of buttons, button hights etc.
  - [ ] we need to have less scrollbars taking up space in the app. I would like the things to stay scrollable but no scrollbar visible
  - [ ] Wir müssen es schaffen die App übersichtlicher zu gestalten. Dazu gehe bitte visuell alle screens durch und schaue das design guidlines eingehalten werden. Teilweise ist es mir gerade einfach zu viel. Zu viel Text, zu viele Buttons, zu viel...
  - [ ] Das prinzip der App muss nicht an jeder ecke in der App erklärt werden, soll aber an den relevanten ecken erklärt werden. Also Es muss möglich sein einzusehen warum man was vorgeschlagen bekommt und wie die algorithmen funktionieren, aber ich brauch nicht die ganzen Kommentare wie "Offen für alle in München · jede:r kann schreiben". So etwas kann an anderer Stelle klar werden.

## Waiting On

## Someday
- [ ] **Kalender und wiederkehrende Aufgaben** - häufigste Lücke aller zehn Gemeinschaften (docs/verknuepfungen.md)
- [ ] **Mehrsprachiges Embedding-Modell** - gte-small ist für Deutsch schwach; multilingual-e5-small in der Edge Function, Schwelle neu eichen (docs/markt.md)
- [ ] **Unabhängigkeit Stufe 1** - Speicher-Schicht mit S3, SMTP statt Resend, `EMBEDDING_URL`, Codeberg-Spiegel (docs/unabhaengigkeit.md)
- [ ] **eID-Anbindung** - Modus `eid` ist vorbereitet, aber noch kein eID-Dienst angebunden
- [ ] **Virenscanner für Uploads** - `scan_status` existiert, aber kein Scanner; braucht einen Dienst außerhalb der App
- [ ] **Aufräumen gelöschter Dateien im Speicher** - nach 30 Tagen Papierkorb bleibt die Datei unlesbar im Speicher liegen, bis sie jemand mit dem Service-Schlüssel entfernt (Cron-Job oder Edge Function)
- [ ] **Auffälligkeiten pro IP erkennen** - „viele neue Konten von einer Adresse"; braucht Edge/WAF
- [ ] **Oberfläche für Notfallzugriff auf Chats** - DB-Funktionen (Antrag, zweite Freigabe, Protokoll) sind da, Lese-Oberfläche bewusst noch nicht gebaut
- [ ] **Live-Zusammenarbeit an Dokumenten** - bisher nur Sperre und Versionen; CRDT erst bei Bedarf
- [ ] **Föderation über Stufe 1 hinaus** - Remote-Profile sind höchstens Stufe 1, mehr ist noch nicht gebaut

## Done
- [x] **~~Login permanent machen~~ (2026-10-20)** - Anmelden/Registrieren leitet Angemeldete direkt weiter; „Weiter als …“ mit gemerktem Konto (Google mit login_hint); Sitzungs-Cookies werden täglich vom Server neu gesetzt (Safari begrenzt per Skript gesetzte Cookies auf 7 Tage)
- [x] **~~Bot-Schutz live~~ (2026-10-20)** - Turnstile lädt live, Supabase erzwingt es
- [x] **~~E2E-Tests anmeldefähig~~ (2026-10-20)** - Service-Schlüssel lokal, eine Sitzung pro Lauf
- [x] **~~Bot-Schutz prüfen~~ (2026-10-20)** - Supabase erzwingt das Captcha; Live-Seite ohne Site Key (siehe Active)
- [x] **~~Matching mit KI~~ (2026-10-20)** - Embeddings mit gte-small in der Supabase Edge Function `embed-listings`, Grund „ähnliche Bedeutung“
- [x] **~~Werbematerial~~ (2026-10-20)** - docs/werbung/anwendungsfaelle.md (10 Personas, Vergleich), docs/werbung/HiveVoice.pptx (15 Folien)
- [x] **~~Plan zur Unabhängigkeit~~ (2026-10-20)** - docs/unabhaengigkeit.md: jede Abhängigkeit mit Ersatz, jede zentrale Komponente mit dezentraler Alternative, Fahrplan
- [x] **~~„Anliegen“ statt Anfragen/Anbieten~~ (2026-10-20)** - drei Bereiche in der Navigation, /anliegen mit beiden Seiten
- [x] **~~Verknüpfungen stärken~~ (2026-10-20)** - Weitergeben als Karte (Chat, Gruppe, Marktplatz), Sammlung und Untergruppen, Lesen/Bearbeiten getrennt für Einträge und Aufgaben, Vorlagen für 10 Gemeinschaften, docs/verknuepfungen.md
- [x] **~~Offene Änderungen committen~~ (2026-10-20)** - war schon in e8449f7
- [x] **~~Anfrage und Angebot: klarer unterscheiden / Mischform~~ (2026-10-20)** - Ein Formular mit „Ich biete / Ich suche“; Tausch legt das Gegenstück an und verbindet beide
- [x] **~~Formulare für verschiedene Zwecke~~ (2026-10-20)** - Kategorien Hilfe, Jobs, Wohnen, Dinge, Mitfahrt, Kurse plus eigenes Formular mit eigenen Feldern
- [x] **~~Anfrage und Angebot: klarer matchen / besseres Matching~~ (2026-10-20)** - `app.listing_matches` mit Gründen für beide Seiten, Bezug beim Anfragen, Mitteilung bei neuen Treffern; Marktplatz in Entdecken mit Filtern je Kategorie
- [x] **~~Karte: echte Kartenanbindung~~ (2026-10-20)** - MapLibre + OpenFreeMap (Vergleich in docs/markt.md), lädt erst nach Klick, Gemeinde-Mittelpunkte aus Wikidata
- [x] **~~Rechte und Verantwortung, Stufen 1 bis 9 umgesetzt~~ (2026-10-19)**
