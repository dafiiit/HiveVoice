# Tasks

Grundlage für die Wellen 1–4: docs/personas.md (30 Personas, Feature-Codes F01–F29, Zahl = wie viele Personas es brauchen).

## Active

### Welle 1: Zeit und Geld (20 von 30 Personas)
- [ ] **Kalender und Termine (F01, 13 Personas)** - Termine in Gruppen und persönlich, Zu-/Absage (auch je Rolle: „2. Geige fehlt“), Erinnerung, iCal-Abo, öffentliche Termine in Entdecken. Erster Schritt: Zu-/Absage an „Kurse & Treffen“. Häufigste Lücke auch in docs/verknuepfungen.md
- [ ] **Wiederkehrende Aufgaben und Dienstpläne (F02, 9)** - Rotation, Dienste tauschen, Vertretung, „wer war zuletzt dran“. Zusammen mit F01 als ein Baustein bauen: ein Dienst ist ein wiederkehrender Termin mit Zuständigen (Putzplan WG, Gießplan Garten, Kleiderkammer, Müll-Touren)
- [ ] **Zeitfenster und Buchen (F03, 7)** - wiederkehrende Verfügbarkeit an Angeboten („Gassi Di und Do 17 Uhr“), Räume, Geräte und Sprechstunden buchen, Konflikte erkennen
- [ ] **Gemeinsames Geld (F04, 9)** - Ausgaben teilen (WG), Kassenbuch mit Belegen (für Mitglieder oder öffentlich), Beiträge, Spenden, Alles-oder-nichts. Schema `funding_campaigns`/`pledges` existiert. Zahlung nur über externe Anbieter, die Plattform hält nie Geld

### Welle 2: Stimme mit Wirkung (Kern der Mission)
- [ ] **Politische Verantwortung tragen können** - HiveVoice soll politische Veränderung bewirken und Verantwortung dauerhaft tragen. Personas: Rainer (frustriert), Sophie (will Verantwortung), Mia (16), Olena (ohne Wahlrecht), Stefan (Bürgermeister), Claudia (Stadträtin)
  - [ ] **Geführter Einstieg „Ich will etwas ändern“ (F15)** - in eigenen Worten oder per Auswahl und Ort sagen, was stört; die App zeigt ähnliche Anliegen, Gruppen, Zuständige und den kleinsten nächsten Schritt (Embeddings vorhanden)
  - [ ] **Wirkung sichtbar (F16)** - Verlauf jeder Initiative und Anfrage bis zur Umsetzung, Zusagen mit Termin und Status, Mitteilung an alle, die mitgemacht haben. Wichtigster Hebel gegen Frust
  - [ ] **Mängel auf der Karte (F20)** - melden mit Foto und Ort, ähnliche Meldungen bündeln, Status bis „erledigt“, geht an die Zuständigen
  - [ ] **Fragen und informieren von oben (F17)** - Zuständige befragen die Betroffenen eines Gebiets (offen oder ausgelost wie die Jury), Ergebnis öffentlich, Pflicht zur Rückmeldung, was daraus wurde; Mitteilungen nur mit Opt-in
  - [ ] **Mandatsprofil (F19)** - Abstimmungen mit Begründung, Zusagen, Sprechstunde (F03), Team-Zugang fürs Büro, beleidigende Nachrichten vorsortieren (nicht löschen)
  - [ ] **Wahlen von Personen und Ämter auf Zeit (F05)** - Vorstand, Kassenprüfung, Delegierte, Komitee; Amtszeit mit Ende, Rechenschaft beim Abgeben, Rotation
  - [ ] **Szenario Müllabfuhr ausarbeiten** - Kwame (Persona 29): Viertel in Westafrika organisiert die Müllabfuhr selbst. Durchspielen mit F23 (SMS/USSD), F04 (Mobile Money, öffentliche Kasse), F02, F20, F25, F05, F22; Ergebnis in docs/ festhalten
  - [ ] **Szenario Bürgermeister ausarbeiten** - Stefan (Persona 23): einen Monat Gemeindealltag mit HiveVoice durchspielen, danach F17, F18 (Bürgerhaushalt), F19, F20, F29 (Ratsinformationssystem) priorisieren
  - [ ] **Was braucht dauerhafte Verantwortung?** - Übergaben, Amtszeiten, Vertretung, Rechenschaft, Geld und Haftung; mit docs/rechte.md abgleichen und Lücken als Tasks eintragen

### Welle 3: Wirtschaft und Organisationen, mit Leitplanken
- [ ] **Firmen und Organisationen integrieren** - Interessen der Bevölkerung werden zu keinem Zeitpunkt beschnitten. Personas: Julia (Einzelunternehmen), Frank (Mittelstand), Katrin (Großunternehmen), Giuseppe (Laden), Anna (Hof); NGOs: Birgit (klein), Jan (groß), Kwames Komitee
  - [x] Drei Firmen- und drei NGO-Personas erstellt und abgeglichen (docs/personas.md)
  - [ ] **Leitplanken festschreiben** - Organisationen stimmen nicht ab, unterstützen nicht und starten keine Initiativen; wer für eine Organisation spricht, ist gekennzeichnet; Hervorhebung nie bei Initiativen, Argumenten, Abstimmungen, Zuständigkeiten; Deckel pro Ort (docs/personas.md, Abschnitt 6). Zuerst, vor allen Teilaufgaben unten
  - [ ] **Organisationsprofil (F07)** - Firma, NGO, Partei, Amt als Akteur mit mehreren Personen, Rollen und Impressum. Vorschlag: Gruppe mit Art „Organisation“, damit Rechte, Rollen und Übergabe schon funktionieren
  - [ ] **Geschützte Arbeitsräume (F08)** - IP wahren: Vertraulichkeits-Hinweis, Weitergeben und Export gesperrt, Zugriffsprotokoll, Wasserzeichen
  - [ ] **Waren und Dienstleistungen anbieten (F09)** - Orte mit Öffnungszeiten, „jetzt offen“, Tagesangebot, reservieren und abholen, Orten folgen. Erster Schritt: Öffnungszeiten als Feld an Angeboten
  - [ ] **Mitarbeitende suchen (F10)** - Stellen mit Pflichtangaben (Lohnspanne, Stunden, Sprache), Bewerben mit Profil, Aufträge mit Kostenvoranschlag, Abschlussarbeiten
  - [ ] **Werbung für Projekte (F12)** - bezahlte, gekennzeichnete Hervorhebung zu festem Preis, ohne Tracking

### Welle 4: Reichweite
- [ ] **Fähigkeiten, Referenzen, Patenschaften (F11, 9)** - Fähigkeiten und Sprachen im Profil, Bestätigung nach erledigtem Austausch (Text, keine Sterne), Engagement-Nachweis mit Stunden, „Nachweis liegt vor“ (z. B. Führungszeugnis), Mentoring. Erster Schritt: Fähigkeiten als Tags am Profil
- [ ] **Übersetzen und mehr Sprachen (F22, 6)** - Beiträge und Chats auf Knopfdruck übersetzen; weitere Oberflächensprachen (TR, AR, UK, PL)
- [ ] **Themenkreise ohne Ort (F13, 5)** - Interessen folgen, überregionale Kreise, daraus lokale Treffen. Erster Schritt: den vorhandenen Tags folgen
- [ ] **Zugang ohne Smartphone oder Adresse (F23)** - SMS/Telefon, Stellvertretung mit Protokoll („Enkel hilft Opa“), Konto ohne Meldeadresse, sicher auf öffentlichen Geräten
- [ ] **Barrierefreiheit (F24)** - Vorlesen, Sprechen statt Tippen, Barriere-Angaben an Orten und Treffen

## Klären
- [ ] **Offene Fragen aus docs/personas.md** - (1) Auch außerhalb Deutschlands (dann F22, F23, Mobile Money früher)? (2) Organisationen als eigene Konten oder Gruppenart? (3) Wahlen von Personen als eigene Funktion oder als Art von Ziel? (4) Ab welchem Alter zählen Stimmen bei Initiativen verbindlich? (5) Testpartner: welche Gemeinde, welcher Verein, welche Partei?

## GUI mobile

## GUI desktop and mobile
- [ ] **Struktur Gemeinschaft · Freunde · Ich ausbauen** - Umbau und Regeln stehen (docs/struktur.md); offen: „Heute“-Übersicht unter Ich, Kalender als Werkzeug (F01), Rechtegruppen frei benennen, Leichte-Sprache-Texte für die neuen Bereiche
- [ ] **GUI cleanup, weitere Runden** - erste Runde erledigt (siehe Done). Offen: Formulare mit vielen Feldern (Anliegen anlegen, Gruppe gründen, Initiative) und die Einstellungen visuell durchgehen; Erklärtexte bündeln (z. B. eine Seite „So funktionieren Vorschläge“ statt Hinweisen an vielen Stellen)

## Waiting On
- [ ] **Rechtstexte festlegen** - Checkliste in docs/betrieb.md; Datenschutztext nennt alle Dienste. Offen: Impressum-Angaben, Rechtsgrundlagen, AV-Verträge, DSA-Kontaktstelle, Umgang mit Behördenanfragen – vom Betreiber zu klären und prüfen zu lassen (Anleitung: docs/betrieb.md, Abschnitt Rechtstexte)

## Someday
- [ ] **Pinnwand-Filter „Passt zu mir“** - automatischer Filter für die Pinnwand in Gemeinschaft (docs/struktur.md): woraus er sich speist (Ort, Tags, Sprache, Gruppen, Embeddings), wie man ihn sieht und korrigiert, gespeicherte eigene Ansichten
- [ ] **2FA für Admins (beim Wechsel vom MVP zum Betrieb)** - Seite zum Einrichten von TOTP/Passkey und Code-Abfrage beim Anmelden (Supabase MFA), dann `ADMIN_REQUIRE_MFA=1` setzen; danach Sudo-Modus (frische Anmeldung für gefährliche Aktionen) und Mail bei Admin-Anmeldung von neuem Gerät (docs/betrieb.md, Abschnitt Admins)
- [ ] **Später aus docs/personas.md, erst mit einem konkreten Partner** - F06 Anträge und Änderungsanträge (Partei, Verband), F18 Bürgerhaushalt (Gemeinde), F21 Stimmen delegieren, F25 anonyme Hinweise (rechtlich heikel), F26 Lage-Modus für Krisen (Hilfsorganisation), F14 Sammlungen und Tauschlisten, F27 Vertrauen bei Tieren/Kindern/Schlüsseln, F28 Pressebereich, F29 Schnittstellen und Export
- [ ] **Ein Zugriffsmodell in der Datenbank** - Oberfläche ist vereinheitlicht (Teilen → Zugriff), aber Dokumente (visibility, edit_mode, resource_grants mit Stufen und Ablauf) und Einträge/Aufgaben (read_scope, write_scope, object_grants) speichern es noch verschieden; zusammenführen braucht neue Policies auf der Live-Datenbank
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
- [x] **~~Umbau Gemeinschaft · Freunde · Ich~~ (2026-10-21)** - Teams-Layout mit Leiste links (Logo-Icons), Suche oben in der Mitte, Konto-Menü rechts; Pinnwand mit Ort und Thema; Anliegen in allen drei Bereichen; Zuständige als Tag unter Personen; Gruppenwerkzeuge an/aus (ab zwei Personen, „Gruppe daraus“ im Chat); Adressen auf Englisch mit Weiterleitungen; „Wissen teilen“ ohne eigene Knöpfe
- [x] **~~Admins aus der Konfiguration~~ (2026-10-20)** - `ADMIN_EMAILS` beim Hosting-Anbieter bestimmt die Admins (nur bestätigte Adressen), kein „Mich als Admin eintragen“ mehr, Admins ernennen sich nicht gegenseitig; 2FA vorbereitet (`ADMIN_REQUIRE_MFA`)
- [x] **~~Einheitlich statt gewachsen~~ (2026-10-20)** - Begriffe (Gesuch, Kontaktanfrage, Chat, Teilen, Pinnwand, Orga/Betreuung/Leitung, zuständige Stelle), ein Zuhause je Inhalt (Angebote und Gesuche nur in Anliegen unter /anliegen/[id], Kontaktanfragen nur in Verbinden, Zuständige unter Entdecken, eine Einladungsadresse), /new mit sechs gleichen Kacheln, Initiative mit eigener Seite, Gruppe gründen mit Vorlage und eingeklappten Einstellungen; Bausteine Page/PageHeader/Section/Tabs/Toolbar/Notice/Dialog/Popover/PersonPicker/CopyField, zwei Bedienhöhen, Bestätigen in der Seite, Teilen-Fenster mit „Zugriff“, Hashtags mit Umlauten, Erklärseiten unter einer Navigation
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
