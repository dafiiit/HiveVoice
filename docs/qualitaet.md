# Qualität prüfen

Wie HiveVoice vor einem Push geprüft wird: Emulatoren, Animationen, alle Knöpfe und Bildschirme, Menüs, Ladezeiten und Offline.
Fehlerberichte von echten Geräten und Logs stehen in `docs/debugging.md`.

## Die Regel

Vor jedem Push mit Änderungen an der Oberfläche, am Service Worker oder an Texten:

```bash
npm run check
```

Das dauert rund 30 Minuten und endet rot, sobald etwas nicht stimmt. Die drei häufigsten Fehler dieses Projekts haben je eine eigene
Prüfung:

| Fehler | Prüfung | Rot, wenn |
|---|---|---|
| Menü wird überdeckt oder abgeschnitten | `tools/review/menus.js` plus Bilder von Auge | Ein Eintrag eines geöffneten Menüs liegt nicht zuoberst oder ist nicht erreichbar |
| Hakelige Animation | `tools/quality/motion.spec.ts` | Grenzwerte unten überschritten, oder eine Animation nutzt Layout statt `transform` und `opacity` |
| Lange Ladezeit, schlecht offline | `tools/quality/speed.spec.ts`, `offline.spec.ts` | Grenzwerte unten überschritten |

Alle Grenzwerte stehen in `tools/quality/limits.ts`. Ein Grenzwert wird nur mit Begründung im Commit angehoben.

`npm run check -- --quick` lässt die fünf Größen weg (rund 10 Minuten). Für eine Seite: `REVIEW_PAGES=/me,/friends npm run review`.

Einzeln, gegen einen laufenden Produktions-Build:

```bash
NEXT_DIST_DIR=.next-prod npm run build
```

```bash
NEXT_DIST_DIR=.next-prod npx next start -p 3300
```

```bash
E2E_BASE_URL=http://localhost:3300 npx playwright test -c tools/quality/playwright.config.ts --project phone
```

Immer im Produktions-Build messen: `next dev` ist langsamer und hat keinen Service Worker. Die Prüfungen melden sich mit dem Testkonto
an und lesen die Datenbank aus `.env.local`, sie ändern dort aber nichts.

## Prüfen die Prüfungen?

Eine Prüfung, die nichts findet, sieht aus wie eine App ohne Fehler. Deshalb trifft jede Prüfung in `tools/quality/selftest.spec.ts`
auf eine Seite mit genau ihrem Fehler: eine Leiste über dem Menü, eine Leiste, die Klicks durchlässt, eine Spalte, die abschneidet, ein
Menü außerhalb des Fensters, Ruckeln, animiertes Layout, und ob die CPU-Drosselung wirkt. Bleibt eine stumm, stoppt `npm run check`
sofort. Dasselbe gilt für neue Prüfungen: erst der Selbsttest, dann die Prüfung. Die Gesten beweisen zusätzlich, dass sie etwas
bewirkt haben (`done` in `motion.spec.ts`): Eine Geste, die nichts tut, wäre sonst vollkommen flüssig.

## Menüs und alle Bildschirme

`npm run review` öffnet 27 Seiten in fünf Größen (Desktop 1440, iPad quer 1180 und hoch 820, Handy 390 und 360) und klickt dort alles,
was etwas aufklappt. Geprüft wird:

- **Menüs**: Jeder neue Eintrag muss an fünf Punkten selbst zuoberst liegen, auch gegen Ebenen, die Klicks durchlassen, darf von keiner
  Box mit `overflow: hidden` abgeschnitten werden und muss im Fenster liegen oder hineinscrollen.
- **Seiten**: seitliches Scrollen, Herausragen, Überlappen, abgeschnittener Text, zu kleine Ziele, gleich aussehende verschiedene
  Bedienelemente, Kontrast, Bedienelemente ohne Namen, Konsolen- und Netzwerkfehler.

`REVIEW_DARK=1 npm run review` macht dasselbe im Dunkelmodus.

Ergebnisse: `test-results/review/report.md` und `test-results/review/menus.json`.

**Bilder von Auge ansehen, das ist Pflicht.** Regeln finden Überdeckung, aber kein Menü, das nur falsch aussieht. Von jedem geöffneten
Menü entsteht ein Bild, gefunden oder nicht. `tools/review/sheets.mjs` legt sie auf Bögen, `test-results/review/_sheets/sheet-001.png`
usw., und `index.md` sagt, was jede Zelle zeigt. Jeden Bogen ansehen, bei Verdacht das Einzelbild in `test-results/review/_menus/`.

Wer ein neues Aufklapp-Element baut, benutzt `Popover`, ein `summary` oder `aria-expanded`, sonst findet die Durchsicht es nicht.

## Animationen

`tools/quality/motion.spec.ts` führt Wischen, Reiterwechsel, Menü und Scrollen vier Mal aus, wirft den ersten Lauf weg und bewertet den
mittleren. Die CPU ist achtfach gedrosselt, weil ein Mac auch vierfach gedrosselt noch schneller ist als ein Mittelklasse-Handy.
Die Grenzen: höchstens 2 Bilder über 34 ms, kein Bild über 67 ms, keine Aufgabe über 100 ms, und nur `transform` und `opacity` animieren.

Wenn etwas ruckelt:

```bash
npm run phone -- --cpu 8 --url <Adresse>
```

`test-results/phone/<Lauf>/` enthält Video, Einzelbilder und `report.json`. Das sagt, ob es am Hauptthread liegt.

Das reicht nicht für alles: Die Messung läuft auf dem Mac und sieht nur den Hauptthread. Was der Grafikchip eines Handys macht, zeigt nur
ein echtes Gerät. Bei Verdacht das Gerät nehmen (unten) oder eine Bildschirmaufnahme, am besten in Zeitlupe:

```bash
npm run phone:frames -- aufnahme.mp4
```

Das nennt die längsten Pausen zwischen zwei Bildern. Die Pause gilt nur während einer Bewegung; Aufnahmen enthalten nur geänderte Bilder.

Echte Geräte melden außerdem Frames ab 200 ms als `long-frame` an `npm run reports`.

## Ladezeiten

`tools/quality/speed.spec.ts` lädt die wichtigsten Seiten ohne Cache und ohne Service Worker auf langsamem 4G (150 ms Latenz, 1,6 MBit/s)
mit vierfach gedrosselter CPU:

| Wert | Grenze |
|---|---|
| Erster Inhalt (FCP) | 2,0 s |
| Größter Inhalt (LCP) | 3,0 s |
| Blockierte Zeit | 0,6 s |
| Reiterwechsel | 1,5 s |

`e2e/performance.spec.ts` begrenzt dazu das Gewicht jeder Seite. Reale Werte von Geräten: `npm run reports`.

## Offline und schlechtes Netz

Schlechtes Netz ist schwerer als kein Netz: Der Browser bekommt keinen Fehler, sondern keine Antwort. `tools/quality/offline.spec.ts` prüft:

| Fall | Grenze |
|---|---|
| Ohne Netz: gesehene Seite öffnen | 1,0 s |
| Netz hängt: gesehene Seite öffnen | 2,5 s |
| Ohne Netz: nie gesehene Seite sagt es | 1,5 s |
| Ohne Netz: Klick innerhalb der App | 2,0 s |

Der Service Worker (`public/sw.js`) wartet deshalb höchstens `PATIENCE` (1,5 s) auf das Netz, wenn eine Kopie da ist, und das Netz
erneuert die Kopie im Hintergrund. Neue Seiten kommen in die Liste `kept`, neue Arten von Inhalt mit einem eigenen Test.

## Die Emulatoren

Was sie können und was nicht:

| | Echtes Safari oder Chrome | Echter Touch | Skriptbar | Grafik |
|---|---|---|---|---|
| Android-Emulation in Chromium (`npm run phone`) | nein | ja | ja | Mac |
| Android-Emulator | ja, Chrome 124 | ja | ja | Mac |
| iPhone-Simulator | ja, Safari | nur über das Simulator-Werkzeug | nur Video | Mac |
| WebKit in Playwright | Engine | nein | ja | Mac |
| Echtes Android-Handy | ja | ja | ja | echt |

### Android-Emulator

Nur die Kommandozeilen-Werkzeuge, kein Android Studio. Installation einmalig:

```bash
brew install openjdk@21
```

```bash
brew install --cask android-commandlinetools
```

SDK in `~/Library/Android/sdk`, Gerät `hivevoice` (Android 15, 4 GB RAM, Grafik des Macs), siehe `tools/phone/android.mjs`.

```bash
npm run phone:android -- https://hive-voice.vercel.app/community
```

```bash
npm run phone -- --target android --url https://hive-voice.vercel.app/community
```

```bash
npm run phone:android -- --stop
```

Der erste Lauf nach einem Kaltstart ruckelt, weil alles erst lädt: warme Läufe vergleichen. Absolute Bildraten taugen nicht, nur Vergleiche
und Verhalten. Schaltet man den Emulator frisch auf, fragt Chrome einmal nach seinen Bedingungen; die muss ein Mensch annehmen.

### iPhone-Simulator

Läuft über Xcode (iOS-Runtime in Xcode → Settings → Components). Starten: `open -a Simulator`. Die Geste kommt vom Simulator-Werkzeug oder
der Maus, Safari lässt sich von außen nicht skripten.

```bash
npm run phone:ios -- 7 https://hive-voice.vercel.app/community
```

Die Aufnahme startet erst nach rund zwei Sekunden, die Geste also danach ausführen. Dann:

```bash
npm run phone:frames -- test-results/phone/ios-….mp4
```

### Echtes Android-Handy

Entwickleroptionen → USB-Debugging, anschließen, Zugriff am Handy bestätigen, Emulator aus. Dann wie oben mit `--target android`.
Lokale Adressen erreicht das Handy mit `adb reverse tcp:3300 tcp:3300` unter `http://localhost:3300`.

## Was das nicht garantiert

- Nur was eine Prüfung kennt, wird gefunden. Jeder neue Fehler, der durchrutscht, bekommt zuerst einen Selbsttest und dann eine Regel.
- Die Durchsicht klickt nur, was ohne Daten erreichbar ist: Knöpfe, die Daten ändern, und Abläufe über mehrere Schritte prüfen die e2e-Tests.
- Die Prüfung läuft mit dem Testkonto. Seiten mit Daten, die es nicht hat, bleiben ungeprüft.
- Mac-Messungen ersetzen kein echtes Gerät, vor allem nicht bei Safari.

## Sperre vor dem Push

`npm run check` vermerkt einen grünen, committeten Stand. Der Hook `.githooks/pre-push` lässt nur diesen Stand raus, wenn sich Oberfläche,
Service Worker oder Texte geändert haben. Er ist aus, bis man ihn einschaltet:

```bash
git config core.hooksPath .githooks
```
