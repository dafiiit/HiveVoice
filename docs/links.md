# Wissen und Links teilen

Menschen teilen Wissen, Dateien und Orte, die sie schon anderswo abgelegt haben (Google Drive, Dropbox, GitHub, Figma, Karten, Rezepte,
PDFs auf einer Webseite). **Bei einem Link speichert HiveVoice nie eine Datei**, nur Adresse, Titel, Beschreibung, Hashtags und die Vorschau-Angaben
(Titel, Beschreibung, Adresse eines Vorschaubilds, Typ, Größe).

Eigene Dateien (Foto, PDF) und Markdown-Notizen hängen am selben Ort, siehe [dateien.md](dateien.md).

Wo man es findet: Entdecken → **Wissen**, Neu → **Link teilen**, in jeder Gruppe der Reiter **Links**, die Suche oben (Treffer „Wissen“).
Wer etwas nicht findet, kann direkt eine Anfrage dazu stellen („Nichts gefunden? Frag danach“).

## Prüfung vor dem Teilen

Jeder Link wird auf dem Server geprüft, nie nur im Browser (`src/lib/links/`).

| Schritt | Was passiert |
| --- | --- |
| Adresse säubern | `https` erzwingen, Tracking-Parameter (utm, fbclid, gclid …) entfernen, keine Zugangsdaten in der Adresse, keine Zahlenadressen (IP), keine internen Namen (`localhost`, `.local` …), nur Port 443, höchstens 2000 Zeichen |
| Verboten | `javascript:`, `data:`, `file:`, Programme und Installationsdateien (`.exe`, `.apk`, `.dmg` …), Seiten, die es nicht gibt (404), nicht erreichbare Seiten |
| Kurzlinks | `bit.ly` & Co. werden aufgelöst. Gespeichert und gezeigt wird das echte Ziel. Lässt es sich nicht auflösen, ist der Link abgelehnt |
| Bekannte Dienste | Drive, Docs, Maps, Dropbox, OneDrive, GitHub, GitLab, Figma, Miro, Notion, YouTube, Wikipedia, Rezeptseiten, Forschungsarchive, Offene Daten und die offiziellen Domains aus der Admin-Seite gelten als **Bekannter Dienst** |
| Unauffällig | Unbekannte Seite, bei der nichts auffällt: **Geprüft** |
| Mit Vorsicht | Weiterleitung auf eine fremde Seite, Kurzlink, Adresse mit Sonderzeichen (Verwechslungsgefahr), Endungen wie `.zip`/`.top`, Archive, Downloads, vermutlich nicht öffentlich, Seite antwortet nicht. Der Link bleibt möglich, trägt aber ein rotes Zeichen, und beim Öffnen gibt es den Hinweis „Trotzdem öffnen“ |
| Warnliste (optional) | Mit `SAFE_BROWSING_API_KEY` wird zusätzlich Google Safe Browsing gefragt. Treffer werden abgelehnt. Ohne Schlüssel läuft alles andere trotzdem |

Die Vorschau holt der Server selbst: nur öffentliche Adressen (jede Verbindung wird gegen private und lokale Adressen geprüft, auch nach
Weiterleitungen und bei DNS-Tricks), höchstens vier Weiterleitungen, 6 Sekunden, die ersten 400 KB, nichts wird gespeichert außer den Angaben oben.
Landet die Anfrage auf einer Anmeldeseite, ist der Link nicht öffentlich: Die Vorschau wird verworfen und es erscheint der Hinweis.

Vorschaubilder lädt der Browser direkt von der verlinkten Seite (`referrerpolicy="no-referrer"`). Die Seite erfährt also die IP-Adresse
der Betrachtenden, aber nicht, dass sie von HiveVoice kommen. Fehlt ein Bild, zeigt die Karte den Typ in großer Schrift.

## Bewerten, melden, aufräumen

- **Hoch/Runter:** eine Stimme je Person, ändern oder zurücknehmen geht. Sortiert wird nach Bewertung, dann nach Datum.
- **Melden:** wie überall über die Bürgerjury, mit der zusätzlichen Regel „Unsicherer Link“. Entscheidet die Jury so, wird der Link ausgeblendet.
- **Grenzen:** höchstens 30 geteilte Links je Person und Tag, derselbe Link nur einmal je Person.
- **Löschen:** die teilende Person und Admins/Maintainer der Gruppe.
- **Gruppen:** Links einer Gruppe mit Beitrittsanfrage oder nur für Mitglieder sieht nur, wer die Gruppe lesen darf (Row Level Security).

## Schlüssel für Safe Browsing (optional)

1. Google Cloud Console → dein Projekt → **APIs & Dienste → Bibliothek** → **Safe Browsing API** → **Aktivieren**.
2. **Anmeldedaten → Anmeldedaten erstellen → API-Schlüssel**. Unter **API-Einschränkungen** nur „Safe Browsing API“ erlauben.
3. In Vercel `SAFE_BROWSING_API_KEY` anlegen und neu deployen. Lokal in `.env.local`.

## Später

PDF-Seitenvorschau (ohne die Datei zu speichern), Hinweis „Link ist inzwischen tot“ durch regelmäßige Prüfung, Sammlungen/Ordner von Links,
Kommentare unter Links, Freigabe-Prüfung für Google Drive über den Picker.
