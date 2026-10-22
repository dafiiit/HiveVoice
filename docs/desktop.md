# Desktop-Apps

HiveVoice gibt es für Windows, macOS und Linux zusätzlich als Programm zum Herunterladen.
Die Startseite verlinkt bei diesen drei Systemen auf `https://github.com/dafiiit/HiveVoice/releases/latest`.
Daneben bleibt die Installation als Web-App (PWA) aus dem Browser der empfohlene Weg: sie braucht keine Signatur.

## Was das Programm ist

Eine dünne Hülle mit [Tauri 2](https://v2.tauri.app) (`desktop/`): ein Fenster mit der Webansicht des Systems
(WebView2 unter Windows, WKWebView unter macOS, WebKitGTK unter Linux), das die Live-Seite
`https://hive-voice.vercel.app/friends` lädt. Die App selbst läuft weiter auf dem Server (Next.js mit SSR) und
lässt sich nicht einpacken. Updates der Seite kommen deshalb sofort an; ein neues Programm braucht es nur,
wenn sich die Hülle ändert (Fenster, Symbol, Tauri-Version).

- Offline sorgt der vorhandene Service Worker (`public/sw.js`) dafür, dass Geöffnetes lesbar bleibt, genau wie im Browser.
  Beim allerersten Start braucht das Programm Netz.
- Die Seite bekommt keinen Zugriff auf Tauri-Funktionen (`capabilities/default.json` ist leer), sie läuft wie im Browser.
- Symbole: `npm run icons` in `desktop/` erzeugt sie aus `src/app/icon.svg` (braucht `rsvg-convert`).
- Andere Adresse (eigene Instanz, siehe docs/selbsthosting.md): `url` und `frontendDist` in `desktop/src-tauri/tauri.conf.json` ändern.
- Offen: Google blockiert die Anmeldung in eingebetteten Webansichten teils („disallowed_useragent“). Anmelden mit
  E-Mail geht immer; falls Google ablehnt, `userAgent` im Fenster setzen oder den Google-Login im Browser öffnen.

## Bauen

Lokal (nur das eigene System, braucht Rust und Node):

```bash
cd desktop && npm ci && npx tauri build
```

Für alle Systeme baut der Workflow `.github/workflows/desktop.yml` auf GitHub:

| System | Datei | Runner |
| --- | --- | --- |
| Windows | `.msi` und `-setup.exe` (NSIS) | windows-latest |
| macOS | `.dmg`, universal (Apple Silicon und Intel) | macos-latest |
| Linux | `.AppImage` und `.deb` | ubuntu-22.04 |

- **Release:** ein Tag `v` + Version pushen, z. B. `git tag v0.2.0 && git push origin v0.2.0`. Die Version im Tag
  (nur Zahlen, wegen MSI) wird zur Programmversion, die Dateien hängen danach am Release „HiveVoice v0.2.0“,
  und `/releases/latest` zeigt darauf.
- **Nur testen:** unter Actions → Desktop → „Run workflow“. Dann entsteht kein Release; die Dateien liegen 90 Tage am Lauf.

## Signieren

Ohne Signatur funktioniert alles, aber die Systeme warnen beim ersten Start. Der Workflow baut unsigniert,
solange keine Secrets gesetzt sind, und signiert automatisch, sobald sie da sind.

### Ohne Signatur starten

- **macOS (Gatekeeper):** „HiveVoice kann nicht geöffnet werden, da der Entwickler nicht verifiziert werden kann“.
  Rechtsklick auf HiveVoice → „Öffnen“ → „Öffnen“, oder Systemeinstellungen → Datenschutz & Sicherheit →
  „Dennoch öffnen“. Bei „ist beschädigt“ (Quarantäne-Flag nach dem Download): `xattr -dr com.apple.quarantine /Applications/HiveVoice.app`.
- **Windows (SmartScreen):** „Der Computer wurde durch Windows geschützt“ → „Weitere Informationen“ → „Trotzdem ausführen“.
- **Linux:** keine Warnung. AppImage ausführbar machen (`chmod +x HiveVoice_*.AppImage`), `.deb` mit `sudo apt install ./HiveVoice_*.deb`.

### macOS: Developer ID und Notarisierung

Kosten: Apple Developer Program, 99 $ pro Jahr (Person oder Organisation; für Organisationen braucht Apple eine D-U-N-S-Nummer).

1. Bei [developer.apple.com](https://developer.apple.com/programs/) anmelden und bezahlen.
2. Certificates → „+“ → **Developer ID Application** anlegen (dazu am Mac in der Schlüsselbundverwaltung eine
   Zertifikatsanfrage erstellen). Das Zertifikat laden, doppelklicken, im Schlüsselbund mit privatem Schlüssel
   als `.p12` exportieren und ein Passwort vergeben.
3. Für die Notarisierung unter [account.apple.com](https://account.apple.com) → Anmelden und Sicherheit →
   **App-spezifisches Passwort** erzeugen. Die Team-ID steht unter developer.apple.com → Membership.
4. In GitHub → Settings → Secrets and variables → Actions diese Secrets anlegen:

   | Secret | Inhalt |
   | --- | --- |
   | `APPLE_CERTIFICATE` | die `.p12` als Base64: `base64 -i zertifikat.p12 \| pbcopy` |
   | `APPLE_CERTIFICATE_PASSWORD` | Passwort der `.p12` |
   | `APPLE_SIGNING_IDENTITY` | z. B. `Developer ID Application: Name (TEAMID)` (`security find-identity -v -p codesigning`) |
   | `APPLE_ID` | E-Mail des Apple-Kontos |
   | `APPLE_PASSWORD` | das app-spezifische Passwort |
   | `APPLE_TEAM_ID` | Team-ID |

Tauri signiert dann das Programm, schickt es zur Notarisierung an Apple und heftet das Ergebnis an (Stapling).
Danach öffnet macOS das Programm ohne Warnung.

### Windows: Code-Signing-Zertifikat

SmartScreen vertraut einem Programm, wenn es mit einem anerkannten Zertifikat signiert ist und genug Leute es
ohne Probleme geladen haben. Seit 2023 liegen die Schlüssel nicht mehr als Datei vor, sondern auf Hardware
oder in einem Cloud-Dienst. Wege, grob nach Aufwand:

- **Azure Trusted Signing** (Microsoft, ca. 10 $ pro Monat): Identitätsprüfung durch Microsoft, Signieren aus GitHub
  Actions per Azure-Konto. In Tauri über `bundle.windows.signCommand` mit dem `trusted-signing-cli`.
  Nicht in allen Ländern und für alle Rechtsformen verfügbar; vor dem Einrichten die aktuelle Liste bei Microsoft prüfen.
- **OV-Zertifikat** (Organization Validation) von einer CA wie Certum, Sectigo oder SSL.com, ca. 100–300 € pro Jahr,
  Schlüssel auf USB-Token oder im Cloud-HSM der CA (z. B. SSL.com eSigner, das sich in CI nutzen lässt).
  SmartScreen warnt anfangs trotzdem, bis das Programm Ansehen gesammelt hat.
- **EV-Zertifikat** (Extended Validation), ca. 300–600 € pro Jahr: früher sofort ohne SmartScreen-Warnung, seit 2024
  behandelt Microsoft EV und OV gleich. Lohnt sich daher meist nicht mehr.

Eingebaut wird es in `desktop/src-tauri/tauri.conf.json` unter `bundle.windows`, entweder mit `certificateThumbprint`
(Zertifikat im Windows-Zertifikatsspeicher des Runners) oder mit `signCommand` (Cloud-Dienst), dazu die nötigen
Zugangsdaten als Secrets im Workflow. Anleitung: [v2.tauri.app/distribute/sign/windows](https://v2.tauri.app/distribute/sign/windows/).

### Linux

Keine Signatur nötig. Paketquellen (apt-Repository, Flathub) mit eigenen Signaturen wären ein eigener Schritt.
