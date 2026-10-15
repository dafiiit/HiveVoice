# HiveVoice

**Frag an, was dir fehlt. Biete, was du kannst. Wer dasselbe will, verbindet sich zu Gruppen mit Zielen.**

HiveVoice ist eine parteiunabhängige Plattform für Nachbarschaft und Bürgerbeteiligung:
Anfragen und Angebote, Gruppen mit Zielen und geheimen Abstimmungen, Bürgerinitiativen
mit Debatte und Antwortpflicht des Adressaten, „Wer ist zuständig?“ und eine geloste
Bürgerjury statt Moderationsteam.

Status: **MVP / Testbetrieb.** Ein Login gilt derzeit als bestätigt; die Bestätigung mit
dem Online-Ausweis (eID) folgt.

## Was drin ist

| Bereich | Inhalt |
| --- | --- |
| Entdecken | Initiativen, Gruppen, Menschen und Zuständige, gefiltert nach Ebene (Stadtteil bis Bund) |
| Anfragen · Anbieten | Einträge mit Gegenwert (kostenlos, Stundenlohn, Festpreis, Tausch), Matching über Stichwörter und Region, „Ich auch“, Kontakt erst nach Zustimmung, privater Chat danach |
| Verbinden | Marktplatz deines Orts, Gruppengespräche, private Nachrichten (Polling) |
| Gruppen | Ziele mit Unterzielen und geheimer Zielabstimmung, Gespräch, Bedarf, Aufgaben-Board, Rollen und Rechte-Matrix, Beitritt offen oder auf Anfrage |
| Initiativen | Idee → Debatte (sobald zwei Personen mitreden) → Abstimmung → Adressat (6 Wochen Frist) → Umsetzung → umgesetzt; Argumente mit Bridge-Score, Threads, Verlauf, Leichte Sprache |
| Wer ist zuständig? | Jede:r trägt eigene Zuständigkeiten ein; Behörden bestätigen sie per dienstlicher E-Mail (Domain-Liste in der Admin-Seite) |
| Moderation | Melden → zufällig geloste Jury aus der Region → Mehrheit entscheidet |
| Für mich | Profil (Klarname oder Pseudonym), Notizbuch, Meldungen und Jury, Zuständigkeiten, Einstellungen (Sprache, Leichte Sprache, Dark Mode, Wohnort, Passkey, Konto löschen) |
| Verwaltung | Versteckte Admin-Seite unter `ADMIN_PATH` |

Sprachen: Deutsch, Englisch, Leichte Sprache. Darstellung: hell, dunkel oder wie das Gerät.
Installierbar als PWA.

## Technik in Kürze

- **Next.js 16** (App Router, TypeScript, Tailwind 4, next-intl), läuft auf Vercel oder als Docker-Container.
- **PostgreSQL** ist der portable Kern: Schema, Rechte (Row Level Security) und die gesamte Fachlogik
  (Abstimmung, Jury, Gruppenrechte, Bridge-Score) liegen als SQL in `supabase/migrations/`.
- **Supabase** liefert im MVP Datenbank, Login (E-Mail, Google, Apple, Passkeys) und den Zeitplan (`pg_cron`).
  Die App spricht mit der Datenbank direkt (`postgres.js`), nicht über die Supabase-API; nur der Login nutzt Supabase.
- **Wahlgeheimnis:** Teilnahme und Stimme liegen in getrennten Tabellen ohne gemeinsame Personen-ID.
  Die Stimme hängt an einem Token `HMAC(BALLOT_SECRET, Person|Abstimmung)`, das nur der Server berechnen kann.
  Ehrlicher Hinweis: Wer Datenbank *und* Server-Secret zugleich hat, könnte Tokens nachrechnen.
  Für echte Ende-zu-Ende-Anonymität sind später Blind Signatures geplant (siehe `docs/architektur.md`).

Mehr dazu in [docs/architektur.md](docs/architektur.md) und [docs/selbsthosting.md](docs/selbsthosting.md).

## Lokal starten

```bash
npm install
cp .env.example .env.local   # Werte eintragen
npm run db:migrate           # Schema und Logik
npm run db:regions           # Länder, Kreise, Gemeinden, PLZ (OpenPLZ API)
npm run db:seed              # optional: Demo-Daten aus dem Prototyp
npm run dev
```

## Tests

```bash
npm run test       # Datenbanklogik: Wahlgeheimnis, Rechte, Kontaktablauf, Jury (Rollback, hinterlässt nichts)
npm run test:e2e   # Playwright: Kernseiten auf Desktop und Mobil
npm run typecheck
npm run lint
```

## Daten

Regionen und Postleitzahlen stammen aus der [OpenPLZ API](https://www.openplzapi.org) (amtliche Quellen).
Die Münchner Stadtbezirke sind im Import-Skript hinterlegt.

## Lizenz

[AGPL-3.0](LICENSE). Wer HiveVoice verändert und als Dienst betreibt, veröffentlicht seine Änderungen.
