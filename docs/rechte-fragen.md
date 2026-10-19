# Rechte und Verantwortung: offene Fragen mit Vorschlägen

Stand: 19.10.2026. Fragen und Vorschläge zum Durcharbeiten. **Umgesetzt sind alle Vorschläge, was davon wie gilt, steht in [rechte.md](rechte.md).** Die Tabelle „Was heute gilt“ beschreibt den Stand *vor* der Umsetzung. Zu jeder Frage steht, **was damals galt**, und ein **Vorschlag**.
Wo der Vorschlag keine Alternative nennt, ist er die einfachste Lösung, die zum Rest der App passt.

## Was heute gilt (Kurzfassung)

| Bereich | Stand |
| --- | --- |
| Identität | „Bestätigt" heißt in der Testphase: eingeloggt (`verification_mode = login`). Später soll eID gelten. Profile sind für Gäste lesbar (Name, Bio, Kurzzeile, Ort, Haken). |
| Gruppen | Rollen `admin`, `maintainer`, `contributor`, `guest`. Zehn Rechte pro Rolle einstellbar (lesen, schreiben, Ziele vorschlagen, abstimmen, Aufgaben, Dateien, Änderungen freigeben, Mitglieder verwalten, Finanzen, archivieren). Beitritt offen oder auf Anfrage. Der letzte Admin kann nicht gehen. Es gibt kein „Eigentümer"-Konzept, kein Löschen, keine Einladungen (die Spalte `direction = 'invite'` ist ohne Funktion). |
| Initiativen | Eine Autorin bzw. ein Autor (die Person, die sie anlegt). Nur Autor:innen bearbeiten und starten die Abstimmung. Keine Mit-Autor:innen, keine Übergabe. |
| Zuständigkeiten | Jede bestätigte Person kann jede Zuständigkeit eintragen (Titel, Organisation, Ort). „Offiziell" wird sie nur über eine Mail der Behörden-Domain. Mehrere Personen können dasselbe beanspruchen, es gibt keine Regel dafür. Weiterleiten von Anfragen geht, Übergabe oder Vertretung nicht. |
| Kontakt | Erste Nachricht an Fremde = Anfrage, ein Chat entsteht erst nach Annahme. Jede bestätigte Person darf jeder anderen eine Anfrage schicken. Kein Blockieren, kein Stummschalten, keine Einstellung „Wer darf mich anschreiben". |
| Nachrichten | Können weder gelöscht noch bearbeitet werden. Eine **gemeldete Nachricht bleibt auch bei Urteil der Jury unverändert** (`resolve_case` ignoriert Nachrichten). Beiträge: Autor:in oder Admin/Maintainer löscht. |
| Dokumente | Notizen und Dateien in Wissen: bearbeiten und löschen nur die Autorin bzw. der Autor (löschen auch Admins der Gruppe). Jede Person, die lesen darf, darf herunterladen und kopieren. Keine Lizenzangabe, kein Teilen von Bearbeitungsrechten. Die Tabellen `files`, `file_versions`, `change_requests` und die Rechte `edit_files`/`approve_changes` gibt es im Schema, aber ohne Oberfläche, und sie hängen nicht an Wissen. |
| Spam | Verifiziert schreiben, Jury nach Meldung, höchstens 30 Links/Notizen pro Tag. Sonst keine Limits (Nachrichten, Anfragen, Gruppen, Uploads). |
| Moderation | Bürgerjury aus sieben Personen, Mehrheit oder nach 7 Tagen einfache Mehrheit. Folge: der Inhalt wird ausgeblendet. Keine Verwarnung, keine Sperre von Personen. |
| Konto löschen | Löscht alle Inhalte der Person (Kaskade). Gruppen, die sonst niemanden haben, verschwinden. Eine Gruppe mit Mitgliedern, in der die Person der einzige Admin war, bleibt **ohne Admin** zurück. |
| Server-Admin | Wer den geheimen Pfad zuerst öffnet, wird Admin. Admins können Verifikations-Modus, Behörden-Domains, Demo-Daten und weitere Admins ändern. |

---

## A. Vertrauen und Identität

**A1. Welche Vertrauensstufen gibt es, und was darf jede Stufe?**
Heute: Gast, eingeloggt (= bestätigt in der Testphase). Das Versprechen „Ein Raum ohne Bots" ist damit noch nicht eingelöst.
*Vorschlag:* fünf Stufen. 0 Gast (lesen), 1 Konto (E-Mail oder Google bestätigt: reagieren, Anfragen schicken, in Gruppen mit offenem Beitritt schreiben nach 24 h), 2 Bestätigt (Klarname geprüft oder Einladung durch Bestätigte: Gruppen gründen, abstimmen, Zuständigkeit beanspruchen), 3 Amtlich (Behörden-Mail), 4 Moderation und Server-Admin. Eine Tabelle „Aktion × Stufe" ist das Kernstück des Konzepts (siehe J1).

**A2. Wie wird man „bestätigt", und was gilt bis dahin?**
*Vorschlag:* Übergang in drei Schritten: jetzt Login + Telefon-/Mail-Prüfung + Warmlaufphase (Konto 24 h alt), danach „Bürgschaft" (zwei Bestätigte bürgen, eine Person darf höchstens 5 Mal pro Monat bürgen, Missbrauch fällt auf die Bürgen zurück), später eID. Stimmen bei Abstimmungen zählen erst ab Stufe 2.

**A3. Alias oder Klarname: wer darf welchen Namen sehen?**
Heute: jede Person wählt Alias oder Klarname und kann wechseln.
*Vorschlag:* Alias bleibt erlaubt, aber (a) das Alias-Konto ist intern immer an eine bestätigte Person gebunden, (b) Wechsel höchstens einmal pro Monat, damit Gespräche nachvollziehbar bleiben, (c) Initiativen starten, Zuständigkeit übernehmen und Gruppen leiten verlangen Klarnamen, wenn sie öffentlich wirken, (d) niemand außer der Jury (bei einem Fall, mit Protokoll) sieht den Klarnamen hinter einem Alias.

**A4. Alter und Minderjährige?**
*Vorschlag:* ab 16, bei Anmeldung bestätigen; unter 18 keine Zahlungen und keine Gruppen mit Altersgrenze, Kontaktanfragen von Fremden an Minderjährige nur über gemeinsame Gruppen.

## B. Gruppen

**B1. Wer darf Gruppen gründen?**
*Vorschlag:* ab Stufe 2, höchstens 3 gleichzeitig neu gegründete (ohne weitere Mitglieder) pro Person, Namensähnlichkeit zu bestehenden und zu amtlichen Namen wird beim Gründen angezeigt („Gibt es schon: …, mitmachen?"), geschützte Namen (Behörden, Parteien) nur mit Amts-Bestätigung.

**B2. Rollenmodell: reichen vier Rollen, und gibt es einen „Eigentümer"?**
*Vorschlag:* Rollen bleiben (Admin, Maintainer, Mitwirkende, Gast), plus ein klar benannter **Eigentümer** (Gründer:in oder die Person, an die übergeben wurde). Der Eigentümer kann Admins ernennen und die Gruppe archivieren oder löschen, Admins nicht. Eigene Rollen nicht nötig, stattdessen die zehn Rechte pro Rolle (das gibt es schon).

**B3. Standardrechte je Gruppentyp?**
*Vorschlag:* beim Gründen eine von drei Vorlagen: „Offenes Projekt" (alle Mitwirkenden bearbeiten, Maintainer geben frei), „Verein" (Vorstand = Admin, Mitglieder lesen und stimmen ab, nur Maintainer bearbeiten Dateien), „Initiative" (wie öffentliche Debatte, Abstimmung bei Zielen). Die Matrix danach einzeln anpassbar.

**B4. Sichtbarkeit und Beitritt: welche Stufen?**
Heute: öffentlich/nur Mitglieder × offen/auf Anfrage.
*Vorschlag:* dritte Sichtbarkeit „Nur auf Einladung" (taucht in Suche und Listen nicht auf, nur Mitglieder und Eingeladene sehen sie). Beitritt: offen / Anfrage / nur Einladung. Beitrittsfragen (ein Satz „Warum möchtest du mitmachen?") optional.

**B5. Einladen: wie, und wer darf?**
Heute: nicht vorhanden.
*Vorschlag:* (1) Einladungslink je Gruppe und Rolle, mit Ablauf (7 Tage Standard), Höchstzahl und Widerruf; (2) direkte Einladung einer Person aus der App (Benachrichtigung, Annahme nötig, Rolle vorgeschlagen); (3) Einladen darf, wer das Recht `manage_members` hat; für Gruppen mit offenem Beitritt auch jedes Mitglied. Eingeladene Personen ohne Konto durchlaufen zuerst die Anmeldung, die Einladung bleibt danach gültig. Einladungslinks verraten bei privaten Gruppen nur den Gruppennamen, bis man angemeldet ist.

**B6. Verantwortung für eine Gruppe weitergeben: wie?**
*Vorschlag:* Übergabe in zwei Schritten (Eigentümer schlägt vor, die Person nimmt an, 48 h Widerrufsfrist). Der Eigentümer kann nicht gehen, ohne zu übergeben (heute: „letzter Admin" geht nicht, das gilt künftig für den Eigentümer). Bei Kontolöschung ohne Übergabe geht die Rolle an den dienstältesten Admin, sonst an die aktivste Person mit Maintainer-Recht, sonst wird die Gruppe nach 30 Tagen archiviert und den Mitgliedern angeboten.

**B7. Verwaiste oder zerstrittene Gruppen?**
*Vorschlag:* (a) Verwaist (kein Admin, 30 Tage keine Aktivität des Eigentümers): Mitglieder können eine Übernahme beantragen, wer die meisten Mitglieder-Stimmen hat (Mehrheit der Aktiven), wird Admin; (b) Streit um Leitung: Abwahl-Abstimmung durch Mitglieder (Quorum 50 %, Zweidrittel); (c) die Jury entscheidet nicht über Leitung, nur über Verstöße.

**B8. Mitglieder entfernen und sperren: Regeln?**
*Vorschlag:* Entfernen darf, wer `manage_members` hat, mit kurzer Begründung (sichtbar nur für die Person). Wiederbeitritts-Sperre wählbar (nie / 30 Tage / dauerhaft). Beiträge bleiben stehen, wenn sie nicht gemeldet sind. Einspruch an die Plattform-Jury nur bei dauerhafter Sperre aus öffentlichen Gruppen.

**B9. Gruppe auflösen oder löschen?**
*Vorschlag:* „Archivieren" (nur lesen) durch Admin; „Löschen" nur durch den Eigentümer nach 14 Tagen Bedenkzeit, mit Export der Dateien und Hinweis an alle Mitglieder.

**B10. Wer darf Regeln der Gruppe ändern (Rechte-Matrix, Beitrittsart, Sichtbarkeit)?**
*Vorschlag:* Admin; Änderungen an „Sichtbarkeit nur Mitglieder → öffentlich" und „Rechte für Gäste erweitern" benachrichtigen alle Mitglieder, und es gibt eine Protokollzeile (wer, wann, was).

## C. Initiativen

**C1. Mit-Autor:innen und Übergabe?**
Heute: nur die Person, die anlegt.
*Vorschlag:* bis zu 5 Autor:innen, hinzufügen durch Einladung (Annahme nötig), jede:r Autor:in darf bearbeiten und die Abstimmung starten, entfernen nur durch Mehrheit der Autor:innen (bei zweien: einvernehmlich). Hauptverantwortliche:r kann wechseln wie bei Gruppen (B6). Eine Initiative kann einer Gruppe zugeordnet werden und wird dann von deren Admins mitverwaltet (wenn die Gruppe das erlaubt).

**C2. Bearbeiten nach Start der Debatte und der Abstimmung?**
*Vorschlag:* Debatte: Änderungen erlaubt, jede Fassung bleibt als Revision sichtbar („Was hat sich geändert?"). Während einer laufenden Abstimmung: Text eingefroren, nur Korrekturen von Tippfehlern über einen sichtbaren Vermerk. Wer wesentlich ändern will, bricht die Abstimmung ab und startet neu (Unterstützende werden informiert).

**C3. Wer darf abstimmen und wer darf die Abstimmung starten?**
Heute: es gibt die Segmente „Betroffene", „Mitglieder", „Externe".
*Vorschlag:* starten dürfen Autor:innen nach Mindestunterstützung (Zahl abhängig von der Ebene: Gemeinde 10, Kreis 50, Land 250, Bund 1000, aus der Unterstützer-Zahl) und Debatten-Frist. Abstimmen dürfen bestätigte Personen (Stufe 2), Betroffene = Wohnort in der Region. Segment „Externe" wird getrennt ausgewiesen (heute schon so) und zählt nicht für das Ergebnis. Schutz vor Stimmenfarmen: Konto muss vor Start der Abstimmung bestehen.

**C4. Wer darf eine Initiative zurückziehen, sperren oder löschen?**
*Vorschlag:* Autor:innen ziehen zurück (bleibt sichtbar mit Vermerk). Löschen nur, solange es keine Unterstützung und keine Abstimmung gab, danach nie (Archiv). Sperren nur durch Jury-Urteil oder Plattform-Admin bei Rechtsverstoß, mit Begründung.

## D. Verantwortung für einen Bereich („Zuständige")

**D1. Wer darf eine Zuständigkeit übernehmen?**
Heute: jede bestätigte Person.
*Vorschlag:* drei sichtbare Stufen: **Selbsterklärung** (grau: „Person sagt, sie sei zuständig"), **Bestätigt durch die Gemeinschaft** (mindestens 5 Betroffene aus der Region bestätigen, oder eine Gruppe mit passendem Zweck schlägt sie vor), **Amtlich** (Behörden-Mail, heute vorhanden). Antworten erscheinen immer mit der Stufe. Bei Selbsterklärung gelten schärfere Limits (D3).

**D2. Was, wenn mehrere dieselbe Zuständigkeit beanspruchen?**
*Vorschlag:* Mehrere sind erlaubt, sie erscheinen gleichberechtigt nach Stufe sortiert (amtlich vor gemeinschaftlich vor Selbsterklärung), bei Gleichstand nach Antwortquote. Wird einer Selbsterklärung widersprochen („Nein, das ist X zuständig"), entsteht ein Streitfall: 14 Tage Zeit für Belege; dann entscheidet die Jury (sieben Personen aus der Region) über „stimmt / stimmt nicht". Bei amtlichen Stellen gewinnt die Domain-Prüfung. Falsche Angaben führen zu Verwarnung (E7).

**D3. Wie viele Zuständigkeiten pro Person, und Missbrauch?**
*Vorschlag:* höchstens 3 Selbsterklärungen pro Person, jede mit Region und Beschreibung; Titel, die nach Amt klingen („Bürgermeister", „Referat …"), sind ohne Amts-Bestätigung nicht erlaubt (Wortliste plus Meldeweg).

**D4. Übergabe, Vertretung, Abwesenheit?**
*Vorschlag:* Zuständigkeit an eine andere Person übergeben (Annahme nötig, Historie bleibt), Vertretung mit Zeitraum, automatischer Hinweis „seit 30 Tagen keine Antwort" und nach 60 Tagen „Verantwortung frei" (die Zuständigkeit bleibt, wird aber als unbesetzt markiert, Anfragen werden an Vertretung oder die nächsthöhere Ebene geleitet).

**D5. Fristen und Eskalation für Anfragen?**
*Vorschlag:* Antwort-Soll 14 Tage (heute gibt es `avg_response_days` als Statistik). Danach darf die Anfragende die Anfrage an eine andere Zuständige weiterleiten oder öffentlich als „unbeantwortet" markieren lassen (Zähler auf der Seite der Zuständigen).

**D6. Funktionsadressen und Wechsel des Personals bei Behörden?**
*Vorschlag:* Amtliche Zuständigkeit gehört der **Rolle** (Postfach der Behörde), nicht der Person: mehrere Personen mit Behörden-Mail können sie betreuen, ein Verlassen wird durch erneute Bestätigung alle 12 Monate erkannt.

## E. Kontakt, Auffindbarkeit und Schutz

**E1. Wer darf mich finden?**
Heute: Profile sind für alle lesbar, auch Gäste, die Suche findet Menschen.
*Vorschlag:* drei Stufen pro Person (Einstellung): „Alle" (Standard für Klarnamen-Profile), „Nur Angemeldete", „Nur über gemeinsame Gruppen oder Initiativen" (Standard für Alias und unter 18). Gäste sehen nur Name, Haken und Kurzzeile; Bio, Region und Tags erst nach Anmeldung. Suche nach Namen verlangt mindestens 3 Zeichen und ist begrenzt (Scraping).

**E2. Wer darf mir schreiben?**
Heute: jede bestätigte Person als Anfrage.
*Vorschlag:* Einstellung „Anfragen von: Allen / Nur Bestätigten / Nur Mitgliedern gemeinsamer Gruppen / Niemandem". Erste Nachricht immer als Anfrage mit höchstens 500 Zeichen und ohne Anhänge. Zu viele abgelehnte Anfragen (3 in 7 Tagen) senken das Tageslimit des Absenders.

**E3. Blockieren, Stummschalten, Melden?**
*Vorschlag:* „Blockieren" (gegenseitig unsichtbar in Suche, Chats und Anfragen; in gemeinsamen Gruppen bleibt es bei Stummschalten der Beiträge), „Stummschalten" (keine Benachrichtigungen), „Melden" (an die Jury, siehe H). Gespräche behalten bei Blockade ihren Verlauf, neue Nachrichten werden nicht zugestellt.

**E4. Nachrichten löschen und bearbeiten?**
Heute: weder noch.
*Vorschlag:* **Bearbeiten** 15 Minuten lang (Kennzeichnung „bearbeitet", frühere Fassung bleibt für die Jury sichtbar); **Löschen** jederzeit: „für mich" (blendet nur bei mir aus) oder „für alle" (Inhalt wird zu „Nachricht gelöscht", Dateien werden entfernt). Gemeldete Nachrichten werden bis zur Entscheidung gesichert (Kopie nur für die Jury). In Einzelchats darf jede Seite nur ihre eigenen Nachrichten löschen. Gruppenchats: Autor:in, Admin und Maintainer.

**E5. Aufbewahrung und automatisches Löschen?**
*Vorschlag:* Einzelchats bleiben, solange beide Seiten sie behalten; Löschen des Chats entfernt ihn nur bei mir. Gelöschte Konten: Nachrichten bleiben bei den anderen sichtbar, der Name wird zu „Gelöschtes Mitglied". Optional pro Chat „Nachrichten verschwinden nach 7/30 Tagen" (beide müssen zustimmen).

**E6. Beiträge löschen und Moderation in Gruppenchats und Marktplatz?**
*Vorschlag:* Autor:innen löschen eigene Beiträge, Admin und Maintainer jeden Beitrag der Gruppe (mit Vermerk „von der Moderation entfernt", Begründung für die Autor:in). Marktplatz einer Region: Moderation nur durch Jury und Plattform, nicht durch Einzelne. Zusätzlich: Beiträge anpinnen, Kommentare sperren, „langsamer Modus" (ein Beitrag pro Minute) für Gruppen.

**E7. Wie wird mit Verstößen gegen Personen umgegangen (nicht nur Inhalten)?**
*Vorschlag:* Strafleiter: 1. Verstoß Hinweis, 2. Verstoß Verwarnung und 24 h Schreibpause, 3. Verstoß 7 Tage Sperre, danach Plattform-Admin prüft. Die Jury entscheidet nur „Verstoß ja/nein" und die Stufe ist automatisch; Einspruch einmalig, ebenfalls Jury (andere Besetzung). Fristen verfallen nach 12 Monaten.

## F. Dokumente, Notizen und Dateien

**F1. Wer darf Notizen und Dateien bearbeiten?**
Heute: nur die Autorin bzw. der Autor.
*Vorschlag:* je Eintrag eine Bearbeitungsart: „Nur ich" (Standard), „Alle in der Gruppe mit Recht `edit_files` bearbeiten direkt", „Vorschläge" (andere schlagen eine Änderung vor, die Autor:in oder `approve_changes`-Berechtigte freigeben, das Schema `change_requests` gibt es dafür schon). Jede Änderung speichert eine Version (`file_versions`), Zurücksetzen jederzeit.

**F2. Rechte pro Dokument teilen?**
*Vorschlag:* vier Stufen pro Person oder Gruppe: **Ansehen**, **Kommentieren/Vorschlagen**, **Bearbeiten**, **Verwalten** (Rechte vergeben, löschen, Eigentum übergeben). Dazu die Sichtbarkeit des Dokuments: „Nur ich", „Eingeladene", „Gruppe", „Jeder mit Link (nicht in Suche)", „Öffentlich (in Wissen und Suche)". Rechte können befristet sein. Rechte entziehen wirkt sofort; bereits Heruntergeladenes lässt sich nicht zurückholen (das sagen wir offen).

**F3. Kopieren, Herunterladen, Weitergeben?**
*Vorschlag:* je Dokument ein Schalter „Herunterladen und Kopieren erlaubt" (Standard: ja bei öffentlichen, nein bei Gruppen-Dokumenten, wenn die Gruppe nicht öffentlich ist). Bei „nein": nur Ansicht im Browser (PDF/Bild über den Anzeige-Link, kein Download-Knopf; ehrlich vermerkt, dass Bildschirmfotos nicht verhinderbar sind). Pflichtangabe **Lizenz** für öffentliche Dokumente (Alle Rechte vorbehalten / CC BY / CC BY-SA / CC0) mit Standardwert „CC BY-SA" für Notizen. „Kopie in meine Gruppe / mein Wissen" als Funktion mit Verweis auf das Original (bei CC-Lizenzen erlaubt).

**F4. Eigentum, Löschen, Übergabe von Dokumenten?**
*Vorschlag:* Eigentümer:in ist, wer es anlegt; Übergabe an Person oder Gruppe; bei Konto-Löschung geht ein Gruppen-Dokument an die Gruppe (Wahl: „meine Beiträge bleiben der Gruppe erhalten" oder „löschen"), persönliche Dokumente werden gelöscht. Löschen: Papierkorb 30 Tage, danach endgültig; Versionen und Dateien werden mit entfernt (heute teilweise: Dateien werden aufgeräumt, wenn die Person selbst löscht).

**F5. Schutz vor Missbrauch bei Uploads?**
*Vorschlag:* Speicherquote je Stufe (z. B. 100 MB Stufe 1, 500 MB Stufe 2, Gruppen 2 GB), Virenprüfung der Dateien beim Hochladen, Entfernen von Standortdaten in Fotos (EXIF) im Browser vor dem Upload (teils schon: Fotos werden neu kodiert), gemeldete Dateien sofort unlesbar, bis die Jury entschieden hat.

**F6. Gleichzeitiges Bearbeiten?**
*Vorschlag:* erste Ausbaustufe ohne Live-Zusammenarbeit: Sperre „X bearbeitet gerade" (5 Minuten) und Versionen beim Speichern; Live-Zusammenarbeit (CRDT) erst, wenn es gebraucht wird.

## G. Umfragen und Abstimmungen im Alltag

**G1. Wer darf Umfragen erstellen, ändern und beenden?**
*Vorschlag:* erstellen: alle, die im Chat bzw. in der Gruppe schreiben dürfen. Fragen und Antworten sind nach der ersten Stimme gesperrt (Tippfehler: neu anlegen). Beenden und löschen darf die Ersteller:in und Admin/Maintainer. Optional Frist („endet in 24 h/7 Tagen"). Für **geheime** Abstimmungen über Gruppenziele bleibt der bestehende Weg (blind, Quorum); Umfragen sind offen für Zahlen, aber geheim bei Personen (heute schon so).

## H. Spam, Bots und Plattform-Moderation

**H1. Limits je Vertrauensstufe?**
Heute: nur 30 Links/Notizen pro Tag.
*Vorschlag:* Standardlimits pro Tag (Stufe 1 / Stufe 2): Nachrichten 100/500, Beiträge 20/60, Anfragen an Fremde 5/20, Gruppen gründen 1/3, Einladungen 10/50, Beitrittsanfragen 10/30, Uploads 10/50. Neue Konten erste 24 Stunden halbiert. Überschreiten zeigt eine verständliche Meldung („Du hast heute viel geschrieben, morgen geht es weiter") statt eines Fehlers.

**H2. Technische Hürden gegen Bots?**
*Vorschlag:* unsichtbare Prüfung bei Registrierung und Erstkontakt (Cloudflare Turnstile oder hCaptcha), Wegwerf-Mail-Domains sperren, Honeypot-Feld, Auffälligkeitsregeln (gleiche Nachricht an viele, viele Links, viele neue Konten von einer Adresse), Einladung statt offener Registrierung in einer Anlaufphase (siehe I2).

**H3. Meldungen und Jury: Feinschliff?**
Heute: Jury aus 7 Personen, Mehrheit oder nach 7 Tagen einfache Mehrheit, Folge nur Ausblenden, Meldungen zu Nachrichten wirkungslos.
*Vorschlag:* Meldegründe ergänzen (illegal, Gefahr für Kinder, Belästigung), **Notfall-Weg** (Gewalt, Kinderschutz, Strafbares: sofort ausblenden und an Plattform-Admin, ohne Jurywarten), Jury-Mitglieder bekommen keine Fälle aus eigenen Gruppen und eigenen Kontakten, Missbrauch von Meldungen (viele abgewiesene Meldungen) senkt das Meldegewicht, Nachrichten und Dateien in Meldungen werden wirksam (ausblenden oder löschen).

**H4. Rechtliches: Meldeweg und Aufbewahrung?**
*Vorschlag:* Meldewege nach DSA (Formular, Bestätigung, Begründung der Entscheidung, Einspruch), Aufbewahrung von Meldungen und Entscheidungen 6 Monate, Herausgabe an Behörden nur auf richterlichen Beschluss, Betreiber-Kontakt im Impressum, Transparenzbericht einmal im Jahr.

**H5. Was dürfen Server-Admins?**
Heute: Admin wird, wer zuerst den geheimen Pfad öffnet; Admins ändern Einstellungen, vergeben Admin-Rechte, löschen Demo-Daten.
*Vorschlag:* mindestens zwei Admins (Vier-Augen-Prinzip bei Rechtevergabe und Sperren), Protokoll aller Admin-Aktionen (für alle Mitglieder einsehbar, ohne Personenbezug), kein Lesezugriff auf private Chats, Notfallzugriff nur mit Protokoll und Begründung, Admin-Wechsel per Übergabe wie bei Gruppen.

## I. App teilen und Wachstum

**I1. App teilen: welche Wege?**
Heute: nur PWA-Installation.
*Vorschlag:* „App teilen" in „Für mich": System-Teilen (Web Share), Link mit Kurztext, QR-Code zum Vorzeigen. Beim Teilen aus einer Gruppe, Initiative oder Anfrage entsteht ein Link zu genau diesem Inhalt mit schöner Vorschau (nur bei öffentlichen Inhalten, bei privaten sieht der Empfänger nach Anmeldung nur „Einladung" und den Namen).

**I2. Offene Registrierung oder Einladungsphase?**
*Vorschlag:* in der Anlaufphase offen lesen für alle, Schreiben nach Registrierung, aber Gruppen gründen und Initiativen starten nur mit Einladung oder Bürgschaft. Jede Person bekommt 5 Einladungen, die nachwachsen, wenn Eingeladene aktiv bleiben. Wer einlädt, ist für die ersten 30 Tage der Eingeladenen sichtbar „Bürg:in" (nicht öffentlich).

**I3. Anreize ohne Spiel?**
*Vorschlag:* keine Ranglisten fürs Werben; stattdessen sichtbar machen, wo etwas fehlt („In deiner Gemeinde fehlt noch eine Zuständige für Verkehr: lade jemanden ein").

## J. Technik und Aufbau der Rechte

**J1. Eine zentrale Rechte-Tabelle?**
Heute: Rechte sind in vielen Funktionen und Policies verteilt.
*Vorschlag:* eine Tabelle „Ressource × Aktion × Stufe/Rolle" als Quelle der Wahrheit (SQL-Funktion `app.can(actor, action, resource)`), die Policies, Server-Aktionen und die Oberfläche („Warum darf ich das nicht?") nutzen. Dazu Tests für jede Zeile.

**J2. Protokoll und Benachrichtigungen bei Rechteänderungen?**
*Vorschlag:* Tabelle `audit_log` (wer, wann, was, auf welchem Objekt) für Rechteänderungen, Entfernen, Sperren, Löschen; Betroffene werden benachrichtigt; sichtbar für Admins der Gruppe, anonymisiert für die Plattform.

**J3. Befristete Rechte und Vertretung?**
*Vorschlag:* jedes Recht darf ein Ablaufdatum haben (Gast-Zugang, Vertretung im Urlaub), und „im Namen von" ist nie möglich: Vertretung zeigt immer „X für Y".

**J4. Föderation: Rechte von Personen anderer Instanzen?**
Heute: Instanzen haben `trust_level` (offen, verifiziert, blockiert), Remote-Profile gibt es im Schema.
*Vorschlag:* Remote-Profile gelten höchstens als Stufe 1, dürfen nicht abstimmen, aber lesen und anfragen; blockierte Instanzen sehen nichts, verifizierte dürfen Anfragen und Nachrichten schicken. Das Thema kommt später, das Rechtekonzept soll es nur nicht verbauen.

**J5. Erklärbarkeit und leichte Sprache?**
*Vorschlag:* jede Sperre und Ablehnung nennt den Grund in einem Satz und den nächsten Schritt („Du brauchst Stufe 2: bitte … "). Rechte-Seiten bekommen Texte in Leichter Sprache.

---

## Reihenfolge zum Klären

1. **A1–A3** (Stufen, Bestätigung, Namen) und **J1** (zentrale Tabelle): alles andere hängt daran.
2. **H1–H2** (Limits und Bot-Schutz) und **E2–E4** (Anschreiben, Blockieren, Nachrichten löschen): die dringendsten Schutzlücken, bevor mehr Menschen kommen.
3. **B2, B5, B6** (Eigentümer, Einladen, Übergabe) und **C1** (Mit-Autor:innen): Alltag für Gruppen und Initiativen.
4. **D1–D4** (Zuständigkeiten, Streit, Übergabe).
5. **F1–F4** (Bearbeiten, Teilen, Kopieren von Dokumenten).
6. Rest (Umfragen, Teilen, Föderation).
