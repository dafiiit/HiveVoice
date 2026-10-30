# Fehler finden

Was es gibt, um Probleme zu sehen, auch solche, die nur auf einem echten Handy auftreten.

## Was auf echten Geräten passiert

Browser und Server melden Fehler und Ladezeiten an unsere eigene Datenbank, kein Dienst von außen (`src/components/Reporter.tsx`,
`src/instrumentation.ts`, `/api/report`, Tabelle `private.client_reports`). Nötig, weil Vercel im Hobby-Plan Logs nur kurz behält.

```bash
npm run reports
```

```bash
npm run reports -- 30
```

Gezählt wird je Tag, Art, Fehlertext, Route, Geräteart und Version. Keine Person, kein Konto, keine Adresse; E-Mail-Adressen und
Kennnummern werden aus Texten entfernt, personenbezogene Pfadteile werden zu `:id` (`src/lib/report.ts`). Nach 30 Tagen gelöscht,
höchstens 5.000 neue Zeilen am Tag. `vital` sind LCP, INP, CLS, FCP, TTFB und `long-frame` (ein Bild von 200 ms oder länger, das
sieht man als Ruck). Sie werden nur im Produktions-Build gesendet, Safari kennt `long-frame` und einige andere nicht. Der
Datenschutztext (`messages/*/legal.json`) beschreibt das.

Logs: `vercel logs --project hive-voice --scope dafiiits-projects` (nur das kurze Fenster des Hobby-Plans), Datenbank und Login
über den Supabase-Connector (bis 24 Stunden).

## Handy

| Weg | Befehl | Was es zeigt |
|---|---|---|
| Emuliertes Android | `npm run phone` | Echte Touch-Events, Bildraten, lange Frames, Video, Einzelbilder. Läuft auf dem Mac: findet Arbeit im Hauptthread, sagt nichts über den Grafikchip eines Handys |
| Langsames Handy | `npm run phone -- --cpu 6` | Dasselbe mit gedrosselter CPU |
| Safari-Engine | `npm run phone -- --target webkit --gesture none` | Bildraten ohne Geste. Headless oft nur 30 fps, das sagt nichts über die App |
| iPhone-Simulator | `npm run phone:ios -- 6 <Adresse>` | Echtes Safari als Video; die Geste kommt vom Simulator. Läuft auf Mac-Grafik |
| Android-Emulator | `npm run phone:android -- <Adresse>`, dann `npm run phone -- --target android --url <Adresse>` | Echtes Android 15 mit Chrome 124 und Touch. Läuft auf der Grafik des Macs, emuliert, nicht so schnell wie ein Handy: taugt für Verhalten und Vergleiche, nicht für absolute Bildraten |
| Echtes Android-Handy | `npm run phone -- --target android --url <Adresse>` | Chrome auf dem Gerät selbst. USB-Debugging in den Entwickleroptionen einschalten, anschließen, kein Emulator läuft |
| Eigene Aufnahme | `npm run phone:frames -- aufnahme.mp4` | Zerlegt ein Video in Einzelbilder und nennt die längsten Pausen. Zeitlupe vom Handy ist am genauesten |

Der Emulator ist nur mit den Kommandozeilen-Werkzeugen installiert (`brew install --cask android-commandlinetools`, `openjdk@21`,
SDK in `~/Library/Android/sdk`, Gerät `hivevoice`), ohne Android Studio. Beim allerersten Start zeigt Chrome einen Willkommensdialog;
der muss einmal von Hand bestätigt werden. `npm run phone:android -- --stop` beendet ihn.

Ergebnisse liegen in `test-results/phone/`. Der Browser-Pane der Desktop-App pausiert Animationen, solange er verborgen ist: Für
Messungen immer die Befehle hier nehmen.

## Tests

```bash
npm run test:local
```

startet eine eigene Datenbank in Docker (`tools/testdb/`, Port 54329: derselbe Stack wie beim Selbst-Hosting, mit allen Migrationen)
und führt alle Tests dort aus, in wenigen Sekunden, ohne Live-Daten und ohne Tageslimits. `npm run testdb:down` entfernt sie. Ein Lauf
gegen eine neue Migration prüft sie vor dem Anwenden auf die Live-Datenbank. `npm run test` und die e2e-Tests laufen weiter gegen
die Datenbank aus `.env.local`, also live.

## Bei jedem Push

`.github/workflows/ci.yml` prüft Lint, Typen, alle Tests auf der eigenen Datenbank und den Build. Ergebnis: `gh run list`.
