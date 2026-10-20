# Verknüpfungen: alles mit allem verbinden

HiveVoice kennt fünf Arten von Dingen: **Angebote und Gesuche** (Anliegen), **Dokumente** (Wissen, Notizen,
Dateien, Links), **Gruppen**, **Aufgaben** und **Initiativen**. Damit Vereine, Schulen, Nachbarschaften und alle
anderen sich die App so zusammenstellen können, wie sie arbeiten, lassen sich diese Dinge auf drei Arten
verbinden – immer gleich, egal um welche Art es geht.

## Drei Verbindungen

| Verbindung | Was es ist | Wo im Code |
|---|---|---|
| **Weitergeben** | Ein Ding wird als Karte verschickt: in einen Chat, ins Gespräch einer Gruppe, in den Marktplatz des eigenen Ortes | `messages.ref_*`, `posts.ref_*`, `ShareMenu` |
| **Sammeln** | Ein Ding liegt in der Sammlung einer Gruppe, ohne ihr zu gehören. Auch Gruppen können in Gruppen liegen: so entstehen Untergruppen und „gehört zu“ | `group_items`, Tab „Sammlung“, Seitenleiste „Untergruppen“ / „Gehört zu“ |
| **Freigeben** | Wer ein Ding lesen und wer es bearbeiten darf, getrennt eingestellt | `read_scope`, `write_scope`, `object_grants`, `AccessPanel` |

Das Grundprinzip: **Eine Verbindung gibt nie mehr Rechte, als das Ding selbst hat.** Eine Karte zeigt ihren Inhalt
nur, wer das Ding sehen darf; alle anderen sehen „Nicht sichtbar für dich“. Weitergeben kann man nur, was man selbst
sieht (Prüfung in der Datenbank, `app.ref_readable`). Eine Sammlung zeigt nur, was die Betrachtenden lesen dürfen.
So kann man frei verbinden, ohne aus Versehen etwas offenzulegen.

## Was mit welcher Art geht

| | Chat | Gruppen-Gespräch | Marktplatz | Sammlung einer Gruppe | Lesen | Bearbeiten |
|---|---|---|---|---|---|---|
| Angebot/Gesuch | ✓ | ✓ | ✓ | ✓ | nur ich · bestimmte Personen · Gruppe · Link · alle | nur ich · bestimmte Personen · Gruppe · Link · alle (angemeldet) |
| Dokument | ✓ | ✓ | ✓ | ✓ | nur ich · eingeladen · Gruppe · Link · alle | nur ich · Gruppe · Vorschläge; dazu Rechte je Person/Gruppe in vier Stufen |
| Gruppe | ✓ | ✓ | ✓ | ✓ (Untergruppe) | öffentlich · nur Mitglieder · geheim | über Rollen und Rechte-Matrix der Gruppe |
| Aufgabe | ✓ | ✓ | ✓ | ✓ | Gruppe (Standard) · bestimmte Personen · Link · alle · nur ich | Gruppe (Standard) · bestimmte Personen · Link · alle · nur ich |
| Initiative | ✓ | ✓ | ✓ | ✓ | öffentlich nach Veröffentlichung | Autor:innen |

Regeln für Lesen und Bearbeiten (Angebote, Gesuche, Aufgaben – `app.object_access`):

- Wem es gehört (bei Aufgaben auch wer sie angelegt hat und die Admins der Gruppe), darf immer alles.
- **Bearbeiten ist nie weiter offen als Lesen** (`write_wider_than_read`). Wer bearbeiten darf, darf auch lesen.
- Bearbeiten heißt bei Angeboten und Gesuchen: Titel, Beschreibung, Kategorie, Felder. Preis, Ort, Status und
  die Rechte selbst ändert nur, wem es gehört.
- „Alle“ beim Bearbeiten heißt: alle angemeldeten, bestätigten Menschen (wie ein Wiki).
- „Wer den Link hat“: ein geheimer Link (`/r/<art>/<id>?k=…`), der sich mit dem Zurückstellen der Einstellung erneuert.
- Wer zu „bestimmten Personen“ hinzugefügt wird, bekommt eine Mitteilung.
- Neue Einträge melden Treffer an andere nur, wenn alle sie lesen dürfen.

## So bleibt es übersichtlich

- **Ein Knopf, überall gleich:** „Weitergeben“ an jedem Ding, mit drei Zielen (Chat, Gruppe, Marktplatz) und einer optionalen Nachricht.
- **Rechte in einem Kasten:** „Wer darf was?“ – zwei Auswahlfelder, darunter Personen, darunter der geheime Link. Zu sehen nur für die, die es verwalten.
- **Sammlung nach Art sortiert:** Untergruppen, Angebote/Gesuche, Dokumente, Aufgaben, Initiativen. Wer etwas hineingelegt hat, steht dabei; entfernen darf es diese Person oder die Admins.
- **Verschachtelung ohne Hierarchie-Zwang:** Eine Gruppe kann in mehreren Gruppen liegen (der Turnverein in „Sportvereine Sendling“ und in „Jugendarbeit München“). Es gibt keine Eltern-Kind-Pflicht, keine Vererbung von Rechten: Jede Gruppe bleibt für sich verantwortlich. Das verhindert Machtkonzentration und Zyklen schaden nicht.
- **Stabile Adressen:** `/r/<art>/<id>` führt zu jedem Ding, egal wo es liegt (für Mitteilungen und geheime Links).

## Zehn Gemeinschaften und was sie brauchen

Beim Gründen einer Gruppe gibt es dafür Vorlagen (`src/lib/communities.ts`), die Art, Rechte-Vorlage,
Sichtbarkeit, Beitritt, Altersgrenze, Aufgaben und Themen setzen.

| Gemeinschaft | Was sie braucht | Wie HiveVoice das abdeckt | Was noch fehlt |
|---|---|---|---|
| **Sportverein** | Abteilungen, Trainingszeiten, Mitgliederversammlung, Helfer für Turniere, Material verleihen | Abteilungen als Untergruppen in der Sammlung, Trainings als „Kurse & Treffen“, Ziele mit Abstimmung, Aufgaben für Helferdienste, Material als Angebote „Zum Ausleihen“ | Mitgliedsbeiträge (Schema `funding_campaigns` vorhanden), Kalenderansicht |
| **Schulklasse / Schule** | geschützter Raum mit Minderjährigen, Elternbriefe, Ausflüge, Elternbeirat | Vorlage geheim + nur Einladung, Minderjährigen-Schutz (keine Fremdkontakte), Dokumente mit Sichtbarkeit „Gruppe“, Aufgaben für Dienste, Umfragen in Chats | Rolle „Lehrkraft“ mit Lesebestätigung, getrennte Eltern- und Schüler-Untergruppen per Vorlage |
| **Kita-Eltern** | Abholdienste, Fahrgemeinschaften, Bastelaktionen, nur Erwachsene | Vorlage nur Erwachsene, Mitfahrt-Kategorie mit „Gruppe“ als Lesen, Aufgaben mit Zuständigen, Chats | Wiederkehrende Aufgaben (Dienstplan) |
| **Nachbarschaft / Haus** | Verleihen, Helfen, Hausversammlung, Mängel an die Verwaltung | Anliegen mit Lesen „Gruppe“ oder „bestimmte Personen“, Werkzeug als Dinge zum Ausleihen, Initiative an die Hausverwaltung als Zuständige | Haus-Infos als angeheftete Dokumente |
| **Religiöse Gemeinde** | Gruppen (Chor, Jugend, Senioren), Ehrenamtsdienste, öffentliche Termine | Untergruppen, Aufgaben, Kurse & Treffen öffentlich, Dokumente | Kalender, Kollekte/Spenden |
| **Freiwillige Feuerwehr / Hilfsorganisation** | interne Dienstpläne, Übungen, vertrauliche Unterlagen, Jugendfeuerwehr | Vorlage nur Mitglieder + Einladung, Aufgaben mit Lesen „bestimmte Personen“, Dokumente „nur eingeladen“, Jugend als Untergruppe | Alarmierung (bewusst nicht: dafür gibt es eigene Systeme) |
| **Foodsharing / Tafel** | schnelle Abholungen, Lebensmittel verteilen, Fair-Teiler-Standorte | offene Gruppe, Abholungen als Aufgaben, Lebensmittel als kostenlose Angebote im Marktplatz und auf der Karte, Weitergeben in Chats | Ablaufdatum an Angeboten |
| **Repair-Café / offene Werkstatt** | Termine, Werkzeugliste, Wissen weitergeben | Termine als Kurse, Werkzeug als Dinge zum Ausleihen, Anleitungen als Dokumente mit Lizenz | Reparatur-Statistik |
| **Bürgerinitiative** | Forderung an eine Stelle, Unterschriften/Abstimmung, Recherche, Pressearbeit | Initiativen mit geheimer Abstimmung und Antwortpflicht, Dokumente, öffentliche Gruppe, Weitergeben in den Marktplatz | Pressebereich |
| **Wohnprojekt / Genossenschaft** | Beschlüsse, Dienste, Gemeinschaftsräume buchen, Finanzen | Ziele mit Abstimmung, Aufgaben, Dokumente „Gruppe“ mit Versionen, Räume als Angebote mit Lesen „Gruppe“ | Buchungskalender, Kassenbuch |

Querschnitt: Alle zehn brauchen **(1) geschützte Räume** (Sichtbarkeit und Rechte), **(2) Verbindungen nach außen**
(Marktplatz, Initiativen, Untergruppen in Dachverbänden), **(3) Arbeitsteilung** (Aufgaben mit Zuständigen) und
**(4) Entscheidungen** (Ziele, Abstimmungen). Häufigste Lücke: ein **Kalender** und **wiederkehrende Aufgaben** –
der nächste sinnvolle Baustein.

## Grenzen heute

- Aufgaben gehören immer zu einer Gruppe; freigegebene Aufgaben einer geheimen Gruppe sieht man als Karte, die Gruppenseite selbst bleibt zu.
- Gruppen haben (noch) keinen geheimen Link zum Lesen; Einladungslinks gibt es.
- Dokumente behalten ihr eigenes, feineres Rechtemodell (vier Stufen, Vorschläge, Lizenzen); die Begriffe im Rechte-Kasten sind angeglichen.
- Initiativen sind nach dem Veröffentlichen immer öffentlich – das gehört zu ihrem Zweck.
