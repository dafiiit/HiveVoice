# Offene Projekte: was wir einbinden, was wir selbst bauen

Stand 2026-10-28. Frage: Welche Open-Source-Projekte decken Teile von HiveVoice ab (Kalender, Aufgaben, Markdown,
Aufgaben in Gruppen, Chats und Gruppen, Dateien, Termine im Fediverse, Beteiligung), und wie binden wir sie ein, ohne
dass das Design auseinanderfällt?

## Grundsatz

1. **Über offene Protokolle verbinden, nicht über fremde Oberflächen.** CalDAV, WebDAV, iCal, ActivityPub und Matrix
   sind Standards: HiveVoice spricht sie, die Menschen behalten ihre gewohnten Programme (Nextcloud, Thunderbird,
   Apple Kalender, DAVx⁵, Element, Mastodon), und unsere Oberfläche bleibt eine. Fremde Oberflächen in einem Rahmen
   (iframe) nur dort, wo es nicht anders geht, und dann so schlicht wie möglich (draw.io mit `ui=min`).
2. **Bibliotheken ohne eigene Optik bevorzugen** (headless) oder solche, deren Aussehen sich ganz über CSS steuern
   lässt. Dann tragen sie unsere Farben, eckigen Kanten und Schrift (`src/app/globals.css`).
3. **Lizenz muss zu AGPL-3.0 passen.** MIT, Apache 2.0, BSD, (A)GPL gehen. „Fair Code“ oder „Fair Use“-Lizenzen
   (Quelltext sichtbar, Nutzung eingeschränkt) nicht: sie würden HiveVoice selbst einschränken.
4. **Gepflegt muss es sein.** Ein Projekt ohne Pflege wird zu unserem eigenen Wartungsfall.

## Übersicht

| Bereich | Projekt | Lizenz | Stand | Empfehlung |
|---|---|---|---|---|
| Kalender (Abgleich) | **Nextcloud** (CalDAV), **Radicale**, **Baïkal** | AGPL / GPL | gepflegt | **eingebunden** (2026-10-28, siehe `docs/nextcloud.md`): ein Nextcloud-Kalender erscheint bei den eigenen Terminen und im Gruppenkalender, die HiveVoice-Termine lassen sich dort abonnieren. Jeder CalDAV-Server geht mit demselben Code, sobald jemand ihn braucht |
| Kalender (Ansicht) | **Schedule-X** | MIT | gepflegt, React-Komponenten | **nächster Schritt** für das Monats- und Wochenraster (TASKS: Kalender, nächste Schritte); Aussehen per CSS-Variablen auf unsere Tokens |
| | FullCalendar | MIT (Kern), Zeitachsen nur gegen Geld | gepflegt | nein: Ressourcen-Ansichten (Räume buchen, F03) wären kostenpflichtig |
| Aufgaben (persönlich) | eigene: Notizen mit `- [ ]` | – | gebaut | bleibt. Später **VTODO über CalDAV**, damit Aufgaben in Nextcloud Tasks, Tasks.org, Thunderbird erscheinen |
| Aufgaben in Gruppen | **Vikunja** | AGPL-3.0 | gepflegt, REST-API und CalDAV | nicht einbetten (eigene Oberfläche, eigene Konten). Für Gruppen, die es schon nutzen: später Abgleich über CalDAV-Aufgaben. Unsere Gruppenaufgaben bleiben |
| | Planka | „Fair Use License“ (kein Open Source) | gepflegt | **nein** (Lizenz) |
| | Focalboard | MIT/AGPL | **nicht mehr gepflegt** (Mattermost hat es 2023 abgegeben) | **nein** |
| | Kanboard, Wekan | MIT | gepflegt, aber eigene Oberfläche | nein, nur als Vorbild für eine Kanban-Ansicht der Gruppenaufgaben |
| Markdown schreiben | **CodeMirror 6** | MIT | gepflegt | **eingebunden** (Notiz-Editor) |
| Gemeinsam schreiben | **Yjs** + **y-codemirror.next** + **Hocuspocus** (Server) | MIT | gepflegt | **Weg für „Live-Zusammenarbeit“** (TASKS, Ideen): passt genau auf den CodeMirror-Editor, und Yjs ist zugleich der Baustein für „offline zuerst“ (Änderungen auf dem Gerät, Abgleich später, ohne Konflikte) |
| | HedgeDoc, Outline | AGPL / BSL | gepflegt | nein: ganze Programme mit eigener Oberfläche; Outline ist nicht Open Source (BSL) |
| Zeichnen, Diagramme | **draw.io** | Apache 2.0 | gepflegt | **eingebunden**, selbst ausgeliefert |
| | **Excalidraw** | MIT | gepflegt, als React-Komponente | Kandidat für eine schnelle Skizze in Notizen und für „Anmerkungen auf Screenshots“ (Ideen); gemeinsames Zeichnen bräuchte einen eigenen Dienst |
| Chats und Gruppen | **Matrix** (Synapse, matrix-js-sdk) | AGPL-3.0 (Element hat 2023/2024 umgestellt) | gepflegt | **Brücke, nicht Ersatz**: unsere Chats bleiben (Rechte, Werkzeuge, Notfallzugriff hängen daran); später eine Matrix-Brücke, damit Menschen aus Element mitschreiben können. AGPL passt zu unserer Lizenz |
| | Zulip, Rocket.Chat, Mattermost | Apache / MIT / gemischt | gepflegt | nein: komplette Plattformen mit eigener Oberfläche |
| Dateien | **Nextcloud** (WebDAV) | AGPL | gepflegt | **eingebunden**: Ordner als Fotogalerie, Hochladen dorthin |
| | **Syncthing** | MPL-2.0 | gepflegt | für „ein Ordner auf dem Rechner“ (TASKS, Gemeldet): Syncthing hält Ordner zwischen Geräten gleich, unsere Desktop-App müsste dann nur den Ordner lesen und schreiben |
| Termine im Fediverse | **Mobilizon**, **Gancio** | AGPL | Mobilizon seit 2024 bei Kaihuri (Ehrenamt, NLnet-gefördert), Gancio gepflegt | **über ActivityPub verbinden**: unsere Termine sind schon so gebaut, dass sie sich als `Event` ausgeben lassen (`docs/architektur.md`) |
| Beteiligung | **Decidim**, **Consul Democracy**, **Loomio** | AGPL | gepflegt, von Städten genutzt | nicht einbinden: Vorbilder für Abläufe (Bürgerhaushalt F18, Anträge F06); bei einer Kommune, die eins davon nutzt, über Export und Verlinkung koppeln |
| Karten | **MapLibre**, **PMTiles** | BSD / BSD | gepflegt | **eingebunden** (MapLibre); PMTiles für eigene Kacheln (`docs/unabhaengigkeit.md`) |
| Anmeldung | **GoTrue** (Supabase Auth) | MIT | gepflegt | **eingebunden**, auch im Selbst-Hosting-Paket |

## Reihenfolge

1. **Schedule-X** für Monat und Woche im Kalender (klein, sichtbar, MIT).
2. **Yjs** im Notiz-Editor: erst offline (Änderungen auf dem Gerät zusammenführen), dann live mit Hocuspocus im
   Selbst-Hosting-Paket und als Dienst neben der Cloud-Instanz.
3. **VTODO über CalDAV** für Aufgaben (mit dem Nextcloud-Code von heute).
4. **ActivityPub-`Event`** für öffentliche Termine (Mobilizon, Gancio, Mastodon sehen sie).
5. **Matrix-Brücke** für Chats, wenn eine Gemeinschaft das braucht.

## Quellen

- Focalboard: [Mattermost, Boards im Wartungsmodus](https://support.mattermost.com/hc/en-us/articles/19614000831252-Boards-Plugin-in-Maintenance-Mode), [GitHub-Diskussion zur Pflege](https://github.com/mattermost-community/focalboard/issues/5038)
- Planka: [About PLANKA (Fair Use License)](https://docs.planka.cloud/docs/about-planka)
- Vikunja: [README (AGPLv3)](https://git.local-it.org/local-it/vikunja-api/src/commit/be47459c147eb5054f14a203ddd1707de5260732/README.md)
- Schedule-X: [GitHub](https://github.com/argshook/schedule-x), [npm @schedule-x/react](https://npmjs.com/package/@schedule-x/react); FullCalendar: [React-Doku](https://fullcalendar.io/docs/react.md)
- Matrix/Element: [Element, Umstellung auf AGPL](https://element.io/blog/sustainable-licensing-at-element-with-agpl)
- Mobilizon: [Wikipedia](https://en.wikipedia.org/wiki/Mobilizon), [Über Mobilizon](https://mobilizon.org/about/)
- Yjs: [CodeMirror-Anbindung](https://docs.yjs.dev/ecosystem/editor-bindings/codemirror)
- Excalidraw: [npm](https://npmjs.com/@excalidraw/excalidraw), [Wikipedia](https://en.wikipedia.org/wiki/Excalidraw)
