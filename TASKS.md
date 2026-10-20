# Tasks

## Active
- [ ] **Kalender und wiederkehrende Aufgaben** - häufigste Lücke aller zehn Gemeinschaften (docs/verknuepfungen.md)

## GUI mobile

## GUI desktop and mobile
- [ ] **GUI cleanup, weitere Runden** - erste Runde erledigt (siehe Done). Offen: Formulare mit vielen Feldern (Anliegen anlegen, Gruppe gründen, Initiative) und die Einstellungen visuell durchgehen; Erklärtexte bündeln (z. B. eine Seite „So funktionieren Vorschläge“ statt Hinweisen an vielen Stellen)

## Waiting On
- [ ] **Rechtstexte festlegen** - Checkliste in docs/betrieb.md; Datenschutztext nennt alle Dienste. Offen: Impressum-Angaben, Rechtsgrundlagen, AV-Verträge, DSA-Kontaktstelle, Umgang mit Behördenanfragen – vom Betreiber zu klären und prüfen zu lassen (Anleitung: docs/betrieb.md, Abschnitt Rechtstexte)

## Someday
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
- [x] **~~Meine Inhalte~~ (2026-10-20)** - vierter Bereich nach Verbinden (/inhalte): Dokumente, Todo-Listen, Notizen, Initiativen, Anliegen; neue Dokumente, Dateien und Listen sind privat, bis man sie teilt; Notizen und Dokumente aus „Für mich“ hierher umgezogen
- [x] **~~Offline fähig~~ (2026-10-20)** - Service Worker behält geöffnete Seiten und Bilder (beim Abmelden gelöscht), Chats offline lesbar, Nachrichten warten auf dem Gerät und gehen bei Verbindung raus (ohne Doppelungen), Hinweis „Offline“
- [x] **~~Doppelte Chats in Verbinden~~ (2026-10-20)** - gleichzeitige Seitenaufrufe legten Demo-Chats doppelt an; Sperre pro Person, Duplikate entfernt
- [x] **~~Kopfzeile auf 360/390 px~~ (2026-10-20)** - abgemeldet nur das Logo-Zeichen unter 440 px, Test für 360 und 390 px
- [x] **~~GUI aufräumen, erste Runde~~ (2026-10-20)** - keine sichtbaren Scrollbalken, ein „Weitergeben“ statt zwei Knöpfen, kürzere Karten und Untertitel (z. B. Marktplatz nur „München“), Schreibfeld ohne Knopfzeile bis man tippt, Knopf- und Chiphöhen vereinheitlicht
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
