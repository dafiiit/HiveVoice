# Dateien, Umfragen, Antworten und Notizen

Neben Text können Nachrichten, Beiträge und geteiltes Wissen jetzt **Dateien**, **Umfragen** und **Markdown-Notizen** enthalten.
Alles läuft über die Datenbank (Migration `20261015000014_attachments_polls_notes.sql`), die Oberfläche folgt den Rechten dort.

## Wo was geht

| Wo | Dateien (Foto, PDF, Dokument) | Umfrage | Antwort auf eine Nachricht |
| --- | --- | --- | --- |
| Einzelchats (Verbinden) | ja, bis zu 6 je Nachricht | ja | ja: Knopf „Antworten“ oder nach rechts wischen, das Zitat springt zur Originalnachricht |
| Gruppenchat, Marktplatz, Diskussionen | ja | ja | über die bestehenden Antworten unter einem Beitrag |
| Wissen (Neu → Link teilen) | ja: Foto, PDF, Dokument (ein Eintrag = eine Datei) | nein | nein |
| Wissen: Markdown-Notiz | schreiben und später weiter bearbeiten (nur die Autorin oder der Autor) | nein | nein |

Erlaubt sind JPEG, PNG, WebP, GIF, PDF, Markdown, Text, CSV, Word/Excel/PowerPoint (`docx`, `xlsx`, `pptx`) und OpenDocument (`odt`, `ods`, `odp`),
je Datei höchstens 10 MB. Nicht erlaubt (absichtlich): HTML, SVG, Programme und Archive. Fotos werden im Browser auf 1600 Pixel verkleinert.
Die Grenzen stehen im Speicher-Bucket und werden von der Datenbank beim Anhängen nochmal geprüft (Typ und Größe aus den Angaben des Speichers, nicht aus dem Browser).

## Dateien: privat, Zugriff über die Datenbank

- Die Dateien liegen im **privaten** Bucket `files`, im eigenen Ordner `<Auth-ID>/<zufällig>.<Endung>`. Hochladen darf nur, wer angemeldet ist, nur in den eigenen Ordner.
- Eine Zeile in `public.attachments` hängt die Datei an genau eine Nachricht, einen Beitrag oder einen Wissens-Eintrag.
- **Lesen** darf, wer die Nachricht, den Beitrag oder den Eintrag lesen darf. Das steckt in `app.can_read_attachment`, die Zeilen-Regel von `attachments` und
  die Speicher-Regel `hv_files_select` benutzen sie. Chat-Dateien sieht also nur, wer im Chat ist, Dateien aus Gruppen mit Beitrittsanfrage nur Mitglieder,
  Dateien aus öffentlichen Beiträgen auch Gäste.
- Die App liefert nie die Datei selbst aus: `/api/files/<id>` fragt die Datenbank (mit den Rechten der angemeldeten Person), erzeugt dann einen
  **signierten Link** (eine Stunde gültig) und leitet dorthin weiter. Fotos und PDFs öffnen sich im Browser, alles andere wird heruntergeladen (`?dl=1` erzwingt das).
- Hochgeladene Dateien, die am Ende nirgends angehängt werden, kann die Person selbst wieder löschen (der Speicher erlaubt das nur für Dateien ohne Verknüpfung).
  Wird eine Nachricht, ein Beitrag oder ein Eintrag gelöscht, räumt die App die Dateien aus dem Speicher mit auf, soweit die Person sie selbst hochgeladen hat.
  Was durch fremde Moderation verschwindet, kann als verwaiste Datei im Speicher zurückbleiben. Sie ist nicht mehr lesbar (keine Zeile in `attachments`).

## Umfragen

- Eine Umfrage hat eine Frage (bis 200 Zeichen), 2 bis 8 Antworten und wahlweise Mehrfachauswahl. Sie gehört zu einer Nachricht oder einem Beitrag.
- Abstimmen dürfen bestätigte Mitglieder, die den Chat oder Beitrag lesen dürfen. Eine Stimme je Antwort und Person, die Wahl lässt sich ändern oder zurücknehmen.
- Die Zahlen sind für alle sichtbar, die die Umfrage lesen dürfen. **Wer wie abgestimmt hat, ist nicht lesbar:** `poll_votes` zeigt jeder Person nur die eigene Zeile,
  Zählungen kommen aus `app.poll_view`.

## Notizen in Markdown

- Eine Notiz ist ein Wissens-Eintrag (`resources.origin = 'note'`) mit dem Text in `body_md` (bis 100.000 Zeichen). Der Editor zeigt die Vorschau gleichzeitig (breite Bildschirme)
  oder in einem zweiten Reiter (Handy), mit Knöpfen für Überschrift, Fett, Liste, Tabelle, Code und Diagramm.
- Eine hochgeladene `.md`-Datei wird nicht als Datei gespeichert, sondern in den Editor geladen. So lässt sie sich weiter bearbeiten.
- Dargestellt wird mit `react-markdown` und GitHub-Erweiterungen (Tabellen, Aufgabenlisten, durchgestrichen). **Rohes HTML wird nicht angezeigt.** Links öffnen in neuem Tab mit
  `rel="noopener noreferrer nofollow ugc"`, fremde Bilder erscheinen als Link (sonst erführe die andere Seite, wer mitliest).
- **Diagramme** mit [Mermaid](https://mermaid.js.org): einen Codeblock mit der Sprache `mermaid` schreiben. Gezeichnet wird im Browser im Modus `strict` (keine Skripte, kein HTML in Beschriftungen),
  die Bibliothek lädt nur, wenn eine Notiz ein Diagramm enthält.
- Bearbeiten darf nur, wer die Notiz geschrieben hat (`app.save_note` prüft das). Die Suche in Entdecken → Wissen findet auch Text in Notizen.

## Selbst betreiben

Dateien brauchen Supabase Storage oder einen S3-kompatiblen Speicher mit denselben Regeln. Ohne Speicher (reines Postgres) prüft die Datenbank die Dateien nicht gegen den Speicher,
und die App kann keine signierten Links erzeugen. Dann sollten die Datei-Knöpfe entfernt werden. Umfragen, Antworten und Notizen gehen auch ohne Speicher.
