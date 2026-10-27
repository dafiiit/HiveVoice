# Struktur: Gemeinschaft · Freunde · Ich

Drei Bereiche nach Nähe, Layout wie MS Teams. Anliegen erscheinen in allen drei. Werkzeuge (Kalender, Listen, Dokumente, Wissen …) sind eine Toolbox, die es für mich und für jede Gruppe gibt – Wissen teilen hat keine eigenen Knöpfe.

## Layout (Desktop)
* Kopfzeile
   * Links: Seitenleiste ein/aus, Zurück / Vor
   * Mitte: Suche (⌘K) über Menschen, Gruppen, Anliegen, Inhalte, Nachrichten
   * Rechts: Glocke (Mitteilungen) · Avatar → Konto-Menü
      * Profil bearbeiten (wie andere mich sehen)
      * Einstellungen (Konto, Mitteilungen, Sprache / Leichte Sprache, Datenschutz)
      * Admin-Ansicht (nur Admins) · Abmelden
* Linke Leiste (3 Icons, mit Abzeichen für Ungelesenes)
   * Gemeinschaft – HiveVoice-Logo
   * Freunde – rotes + schwarzes Hexagon nebeneinander
   * Ich – rotes Hexagon
   * unten: ＋ Neu
* Spalte 2: Liste des Bereichs (Filter-Chips oben, Suche in der Liste)
* Spalte 3: geöffnetes Element (Chat, Gruppe, Anliegen, Dokument …) mit Kopf, Tabs, Schreibfeld

Mobil: dieselben 3 Icons als untere Leiste, Spalte 2 und 3 werden nacheinander gezeigt (Liste → Antippen → Detail mit Zurück).

## Überall
* ＋ Neu: Anliegen · Chat · Gruppe · Initiative · Pinnwand-Beitrag · Notiz · Liste · Diagramm · Hochladen (Termin kommt mit F01) – überall dieselbe Liste (`src/components/new/items.ts`): auf /new, in Ich → Neu und über „＋“ am Handy
* An jedem Inhalt: Teilen (Zugriff: privat · Personen · Gruppe · öffentlich) · Weitergeben in Chat
* Im Schreibfeld: Format · Emoji · Datei · ＋ aus meiner Toolbox (wird Karte: Termin zusagen, Liste abhaken) · Senden

## 1. Gemeinschaft (alle auf der Plattform)
* Spalte 2, Abschnitte
   * Pinnwand – ein Strom aller Menschen, gefiltert
      * Filter-Chips: Passt zu mir (automatisch: Ort, Tags, Sprache) · Umkreis · Themen · Biete/Suche
      * Gespeicherte Ansichten (eigene Filter)
   * Anliegen anderer (Liste · Karte, „passt zu deinem Anliegen“)
   * Gruppen (öffentlich, Initiativen, Organisationen)
   * Personen (Suche nach Tags: Fähigkeiten, Sprachen, „Zuständig“)
* Spalte 3
   * Pinnwand: Beiträge mit Antworten im Thread · Beitrag schreiben (Text, Bild, Link, als Anliegen markieren)
   * An Beitrag / Anliegen: Antworten · Privat schreiben · Anfragen · Merken · Melden
   * Gruppe: Übersicht · Beitreten / Anfrage senden · Folgen
   * Person: Profil · Kontakt anfragen · Nachricht

## 2. Freunde (Menschen und Gruppen, die ich kenne)
* Spalte 2: eine Liste, ungelesene oben; Chips: Alle · Chats · Gruppen · Anfragen · Anliegen
   * 1-zu-1-Chats
   * Gruppen, in denen ich bin
   * Kontaktanfragen (annehmen / ablehnen)
   * Anliegen meiner Bekannten (aus Kontakten und Gruppen)
   * Knöpfe oben: Neuer Chat · Person einladen (Link / QR)
* Spalte 3: Chat
   * Verlauf mit Threads und Reaktionen · Schreibfeld
* Spalte 3: Gruppe – startet als Chat, wächst per Konfiguration
   * Kopf: Name · Mitglieder · Einladen · ⋯ (Einstellungen, Verlassen, Übergeben)
   * Tabs (nur die eingeschalteten): Chat · Kalender · Aufgaben · Dokumente · Timeline · Abstimmungen · Kasse · Mitglieder
   * Toolbox – Admin schaltet einzeln ein
      * Kalender (Zu-/Absage, Rollen „2. Geige fehlt“, iCal)
      * Todo-Listen und Dienstpläne (Rotation, tauschen)
      * Dokumente und Wissen (Seiten, Links, Dateien, Versionen)
      * Timeline / Wirkung (Ziel, Schritte, Zusagen – für Initiativen)
      * Abstimmungen und Wahlen (Ämter auf Zeit)
      * Kasse (Ausgaben, Belege, Beiträge)
      * Untergruppen / Kanäle
   * Mitglieder und Rechte
      * Rechtegruppen frei anlegen („Vorstand“, „Kasse“, „Presse“)
      * Je Werkzeug: wer liest, wer bearbeitet
      * Rolle ändern · Entfernen
   * Vorlagen beim Gründen: Chatgruppe · WG · Verein · Initiative · Organisation (setzen nur Schalter)

## 3. Ich (meine Inhalte – nicht die Konto-Einstellungen)
* Spalte 2
   * Heute: Termine, fällige Aufgaben, meine Dienste, offene Abstimmungen aus allen Gruppen
   * Kalender (meine + Gruppentermine, Farbe je Gruppe)
   * Todo-Listen
   * Notizen und Dokumente
   * Bilder und Texte
   * Ausgaben teilen (mit einzelnen Personen)
   * Meine Anliegen (Treffer und Anfragen dazu)
* Spalte 3: das geöffnete Element
   * Bearbeiten · Teilen · Erledigt / Löschen
   * Alles privat, bis geteilt

## Entschieden
* Gruppenwerkzeuge gibt es schon ab zwei Personen (Paar, Familie): aus jedem 1-zu-1-Chat „Gruppe daraus“; Vorlagen „Chatgruppe“ (ohne Werkzeuge) und „Zu zweit“ (Aufgaben, Dokumente)
* Pinnwand im manuellen Modus: Ort (Nachbarschaft, Stadt, Bundesland, Land) und Thema (Tag) selbst einstellen
* Alle Adressen auf Englisch, alte Adressen leiten weiter (Adressplan unten)
* Umbau in einem Schritt (2026-10-21)
* Startbereich nach dem Anmelden: Freunde, wenn man in Gruppen ist; sonst Gemeinschaft (neue Konten)
* Befragungen sind Abstimmungen (Werkzeug der Toolbox), kein eigenes Menü
* Mängel melden ist ein Anliegen (mit Foto und Ort), kein eigenes Menü
* Zuständige: Tag im Profil (z. B. „Zuständig: Verkehr, Sendling“); zu finden unter Gemeinschaft → Personen über die Suche nach dem Tag
* Pinnwand-Filter „automatisch“: späteres Projekt (TASKS.md, Someday)

## Offen
* Brauchen Gruppen Kanäle (wie Teams) oder reichen Untergruppen?

## Adressen (umgesetzt 2026-10-21)
| Bereich | Adresse | vorher |
|---|---|---|
| Gemeinschaft → Pinnwand | /community | /connect?c=market |
| Gemeinschaft → Anliegen | /community/listings | /anliegen?tab=offers |
| Gemeinschaft → Gruppen (Ansicht Initiativen) | /community/groups(?kind=initiatives) | /explore |
| Gemeinschaft → Personen (auch Zuständige) | /community/people | /explore?kind=people, /responsible |
| Freunde | /friends | /connect |
| Ich → Überblick, Listen, Notizen, Dokumente, Initiativen | /me(?f=…) | /inhalte |
| Ich → Meine Anliegen | /me/listings | /anliegen |
| Liste (eine Notiz mit Aufgaben) | /me/notes/[id] (alt: /me/lists/[id] leitet dorthin) | /inhalte/notizen/[id] |
| Anliegen | /listings/[id] | /anliegen/[id] |
| Einstellungen (Konto-Menü) | /settings | /me |
| Einladung, Teilen, Rechte, Transparenz, Verwaltung | /invite, /sharing, /rights, /transparency, /admin | deutsch |

## Noch nicht gebaut (aus dem Baum oben)
* Kalender, Dienstpläne, Abstimmungen als Werkzeug für Ich (Welle 1), Timeline/Wirkung, Rechtegruppen frei benennen
* Kasse: „Ausgaben teilen" ist gebaut (Werkzeug für Gruppen und 1-zu-1-Chats, 2026-10-23); offen sind Beiträge, Spenden und ein öffentliches Kassenbuch
* Bilder und Texte als eigene Inhaltsart unter Ich, „Heute“-Übersicht
* Wissen ist nicht mehr öffentlich durchsuchbar (Tab „Wissen“ entfällt); öffentliche Dokumente sind nur über Link, Gruppe oder Pinnwand zu finden

## Layout ab 2026-10-21 (Desktop)
* Kopfzeile: Logo · Suche · Mitteilungen · Avatar
* Eine Seitenleiste: oben der Knopf zum Ein-/Ausklappen, darunter die Unterpunkte des Bereichs (Icon + Text), unten die drei Bereiche nebeneinander; eingeklappt nur Icons, die Bereiche rutschen untereinander (Zustand im Cookie `hv_sidebar`, unter 1024 px eingeklappt)
* Jeder Unterpunkt: Liste in der Mitte (Name, ＋ passend zum Unterpunkt, Suche, Inhalt), das geöffnete Element rechts
   * Gemeinschaft: Pinnwand (Beitrag mit Antworten rechts), Anliegen (Karte rechts), Gruppen (/community/groups/[slug], Initiativen /community/groups/i/[id]), Personen
   * Freunde: Alle, Chats, Gruppen (/friends/g/[slug] mit allen Tabs), Kontaktanfragen, Anliegen
   * Ich: Überblick, Anliegen (/me/listings, neu: /me/listings/new), Notizen (Filter „Mit Aufgaben“ zeigt die Listen), Diagramme, Uploads, Initiativen
* Handy: unten die drei Bereiche, Unterpunkte als Tabs, Liste und Detail nacheinander

## Regeln für alle Bereiche (2026-10-21, nach der ersten Durchsicht)
Aus den Anmerkungen zum ersten Stand, verallgemeinert, damit dieselben Fehler nicht an anderer Stelle wiederkehren:
* Rechte Spalte nie leer: auf dem Desktop öffnet sich in jeder Liste das erste Element von selbst (Handy: Liste bleibt). Ausnahmen: Pinnwand (läuft über die ganze Breite, ein Beitrag öffnet sich an ihrer Stelle) und Gemeinschaft → Anliegen (rechts die Karte)
* Die Karte füllt die ganze rechte Fläche
* Kein Text wird abgeschnitten: kurze Platzhalter, Suchfeld über die volle Breite der Spalte, nichts daneben
* Eine Einstellung statt Menü pro Liste: „Reihenfolge der Listen“ (neueste zuerst / vorgeschlagen) steht in den Einstellungen und gilt für Freunde, Anliegen und Gruppen
* Filter sparen Platz: Kategorien und weitere Filter sind Menüs, keine Chip-Reihen
* Köpfe geöffneter Elemente sind kompakt: Titel 28 px, eine Zeile mit Autor, Datum, Version und Lizenz, eine Zeile mit allen Knöpfen in einer Höhe (36 px)
* Keine Erklärtexte unter Listen
* Formulare und Seiten ohne Spaltenlayout nutzen die ganze Breite (Gruppe gründen: Vorlagen in drei Spalten, Felder in zwei)
* Rechte überall gleich: Teilen → Zugriff mit Lesen und Bearbeiten getrennt (nur ich, bestimmte Personen, Link, öffentlich). Gilt jetzt auch für Listen (`todo_lists.read_scope/write_scope`, `app.object_access('list', …)`); Listen lassen sich wie Anliegen als Karte weitergeben

## Zweite Durchsicht (2026-10-22)
* Pinnwand: Antworten klappen unter dem Beitrag auf (wie ein Thread), keine eigene Seite; `?post=` öffnet einen Beitrag im Feed
* Menüs: schweben über allem (auch über Spalten, die scrollen, und über der Karte), immer nur eines offen; auf dem Handy ein Blatt von unten über der unteren Leiste
* Raster richten sich nach der Breite ihrer Spalte (Container-Abfragen), nicht nach dem Bildschirm
* Freunde: „+“ passt zum Abschnitt (Chat, Gruppe, Kontakt, Anliegen); ein Chat zu zweit bekommt unter „Werkzeuge“ dieselben Werkzeuge wie eine Gruppe (Aufgaben, Dokumente …) als Reiter neben „Chat“ und bleibt in der Liste ein Chat (`groups.conversation_id`, `app.chat_tools`)
* Ich → Überblick öffnet Elemente in der Übersicht (`/me?o=art:id`), statt in den Abschnitt zu springen; Mitteilungen und Einstellungen stehen in der Leiste unter Ich
* Karte: jedes Anliegen am Mittelpunkt seiner Postleitzahl (aus dem Ort, z. B. „81369 München“; Daten: GeoNames, CC BY 4.0), sonst am Mittelpunkt des Ortes
* Beispielinhalte: von jeder Art genau eins, jedes Konto trifft jedes genau einmal (`app.ensure_demo` beim ersten Besuch); in der Verwaltung für alle aus- und wieder einschaltbar, ohne zu löschen (`demo_visible`, restriktive Regeln auf allen Tabellen)
* Screenshots aller Ansichten: `npm run screens` (tools/screens), Grundlage für Durchsichten

## Notizen und Listen (seit 2026-10-27)

* Eine Notiz ist eine Markdown-Datei. Sie entsteht privat, sobald es etwas zu speichern gibt, und speichert sich selbst (eine Version je Sitzung); Teilen ist ein eigener Schritt auf der Seite der Notiz („Teilen“ → Zugriff).
* Eine Liste ist eine Notiz, deren Zeilen Aufgaben sind (`- [ ] …`). Die Ansicht „Liste“ ändert den Text der Notiz selbst; „Dargestellt“ zeigt dieselbe Datei beim Tippen so, wie sie aussieht, „Quelltext“ als reinen Text.
* Alte Listen (`todo_lists`) wurden in Notizen umgewandelt (Migration 062); die Tabellen bleiben als Sicherung. Das Dateiformat ist damit festgelegt, auf dem der geplante Ordner-Abgleich (TASKS.md, „Speicher verbessern“) aufsetzt.
