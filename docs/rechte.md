# Rechte und Verantwortung in HiveVoice

So ist das Rechtekonzept umgesetzt. Die Fragen und Vorschläge dahinter stehen in [rechte-fragen.md](rechte-fragen.md).
Alles, was Rechte betrifft, steckt in der Datenbank (Migrationen `20261015000015` bis `…033`). Die Oberfläche fragt dieselben Regeln.
Zahlen wie „5 Autor:innen" oder „14 Tage" stehen in der Tabelle `rule_params` und lassen sich dort ändern (`app.set_param`, nur Admin, mit Protokoll).

## Der Aufbau

| Baustein | Wofür |
| --- | --- |
| `action_rules` | Plattform-Aktionen mit Mindeststufe und Tageslimit je Stufe (Nachrichten, Beiträge, Anfragen, Gruppen gründen, Einladen, Uploads, Teilen, Melden, …). Neue Konten haben in den ersten 24 Stunden die Hälfte. `app.require_action('…')` prüft und zählt. |
| `rule_params` | Alle Zahlen der Regeln (Schwellen, Fristen, Speicher, Strafleiter). |
| `rights_matrix` + `app.can(aktion, objekt)` | 26 Aktionen an Dokumenten, Initiativen, Gruppen, Zuständigkeiten, Umfragen, Nachrichten und Meldungen. Antwort: erlaubt oder nicht, mit einem Grund. Die Seite „Rechte und Stufen" zeigt die Matrix, der Link „Warum geht das nicht?" fragt dieselbe Regel. Zu jeder Zeile gibt es Tests. |
| `audit_log` | Wer hat wann was geändert (Regeln einer Gruppe, Übergaben, Sperren, Rechte an Dokumenten …). Für Admins der Gruppe sichtbar. |
| `sanctions`, `violations` | Schreibpausen und Sperren, Verstöße mit Stufe. |
| `tick()` | Läuft alle fünf Minuten (pg_cron) und beim Seitenaufruf: Abstimmungen schließen, Fristen, Übergaben, Papierkorb, Aufbewahrung. |

## A. Vertrauen und Identität

- **Stufen:** 0 Gast, 1 Konto, 2 bestätigt, 3 amtlich (Behörden-Mail, 12 Monate gültig), 4 Plattform-Admin.
- **Bestätigt** je nach Modus (Einstellung `verification_mode`): `login` (Testphase), `vouch` (zwei Bürgschaften, Konto mindestens 24 Stunden alt, höchstens fünf Bürgschaften je 30 Tage) oder `eid`.
- **Registrierung** (`registration_mode`): offen, oder mit Einladung. Dann braucht ein neues Konto einen Einladungscode oder zwei Bürgschaften, um Stufe 2 zu erreichen.
- **Namen:** Alias oder Klarname, Wechsel höchstens einmal im Monat. Öffentliche Rollen (Gruppen leiten, Initiativen starten, Zuständigkeiten eintragen, Mit-Autor:in werden) verlangen den Klarnamen.
- **Alter:** Bei der Anmeldung bestätigen. Minderjährige: strengere Datenschutz-Einstellungen, Kontakt von Fremden nur über gemeinsame Gruppen, keine Gruppen mit Altersgrenze.

## B. Gruppen

- **Eigentümer:in** (die Gründerin oder der Gründer, oder wem übergeben wurde). Nur sie oder er ernennt Admins, übergibt, löscht.
- **Vorlagen:** Offenes Projekt, Verein, Initiative setzen verschiedene Rechte je Rolle. Danach einzeln anpassbar.
- **Sichtbarkeit:** öffentlich, nur Mitglieder, geheim (nur auf Einladung, nicht in Listen). **Beitritt:** offen, Anfrage, Einladung.
- **Einladen:** Einladungslink (Rolle, Ablauf, Höchstzahl, widerrufbar), direkte Einladung mit Annahme. Links zu geheimen Gruppen zeigen vor der Anmeldung nur den Namen.
- **Entfernen und sperren** mit Begründung und wählbarer Wiederbeitritts-Sperre. **Übergabe** in zwei Schritten (Vorschlag, Annahme, 48 Stunden Widerrufsfrist). Der Eigentümer kann nicht gehen, ohne zu übergeben.
- **Verwaist** (kein Admin oder 30 Tage keine Aktivität): Mitglieder können die Übernahme beantragen; **Abwahl:** Antrag mit Quorum und Zweidrittel-Mehrheit.
- **Archivieren** durch Admins, **Löschen** durch die Eigentümerin nach 14 Tagen Bedenkzeit, mit Export der Gruppendaten.
- **Regeländerungen** (Sichtbarkeit, Beitritt, Altersgrenze, Langsam-Modus) stehen im Protokoll, Öffnungen gehen als Mitteilung an alle Mitglieder. Geschützte Namen (Behörden, Parteien) nur mit Amts-Bestätigung; beim Gründen zeigt die App ähnliche Gruppen.

## C. Initiativen

- **Autor:innen:** bis zu fünf, Einladung mit Annahme, Entfernen nur mit Mehrheit aller Autor:innen (bei zwei: beide). Eine **Leitung**, die übergeben werden kann; nur sie zieht zurück oder löscht.
- **Gruppe zuordnen:** Admins der Gruppe verwalten die Initiative mit, wenn die Gruppe es erlaubt.
- **Bearbeiten:** In der Debatte braucht jede Änderung einen Vermerk („Was hat sich geändert?"), jede Fassung bleibt sichtbar. Während der Abstimmung und danach ist der Text eingefroren: erlaubt sind nur kleine Korrekturen (wenige Wörter) mit Vermerk, Unterstützende bekommen sie. Wer wesentlich ändern will, bricht die Abstimmung ab (Grund für alle sichtbar, Stimmen werden verworfen).
- **Abstimmung starten:** nach 7 Tagen öffentlicher Debatte und mit genug Unterstützenden (Gemeinde 10, Kreis 50, Land 250, Bund 1000; Stadtteil 5, Ortsteil 3). **Zählen** tun die Stimmen der Betroffenen, deren Konto beim Start der Abstimmung schon bestand; „Externe" werden getrennt gezeigt.
- **Zurückziehen** bleibt sichtbar mit Vermerk, **Löschen** nur solange niemand außer den Autor:innen beteiligt war. **Sperren** nur durch Plattform-Admins mit Begründung, mit Vier-Augen-Prinzip.

## D. Zuständigkeiten

- **Drei Stufen:** Selbsterklärung, von der Gemeinschaft bestätigt (fünf Betroffene aus dem Ort oder eine passende öffentliche Gruppe empfiehlt), amtlich (Behörden-Mail). Sortierung nach Stufe, dann Antwortzeit.
- **Grenzen:** höchstens drei Selbsterklärungen je Person. Titel, die nach Amt klingen („Bürgermeister", „…amt", „Referat"), erscheinen erst nach der Behörden-Mail.
- **Streit:** Widerspruch gegen Selbsterklärungen und gemeinschaftliche Zuständigkeiten. 14 Tage Zeit für Belege, danach entscheiden sieben ausgeloste Menschen aus der Region. Bei amtlichen Stellen entscheidet die Prüfung der Mail-Adresse.
- **Übergabe** mit Annahme (Verlauf bleibt), **Vertretung** mit Zeitraum, nach 60 Tagen ohne Antwort gilt die Zuständigkeit als unbesetzt. **Antwort-Soll** 14 Tage; danach darf die anfragende Person weiterleiten oder die Anfrage öffentlich als unbeantwortet markieren.
- **Amtliche Zuständigkeit gehört der Stelle:** mehrere Personen mit der Mail-Adresse derselben Stelle betreuen sie, alle 12 Monate ist eine erneute Bestätigung nötig.

## E. Kontakt, Auffindbarkeit und Schutz

- Wer mich findet (alle, nur Angemeldete, nur über gemeinsame Gruppen) und wer mir schreiben darf (alle, Bestätigte, gemeinsame Gruppen, niemand). Namenssuche ab drei Zeichen und mit Limit.
- Blockieren (gegenseitig unsichtbar, neue Nachrichten werden nicht zugestellt), Stummschalten, Melden.
- Nachrichten bearbeiten (15 Minuten, mit Kennzeichnung) und löschen („für mich" oder „für alle"). Verschwindende Nachrichten, wenn beide zustimmen. Konto löschen: Nachrichten bleiben unter „Gelöschtes Mitglied".
- Beiträge in Gruppen: Autor:innen löschen, Admins und Maintainer entfernen mit Begründung, anpinnen, Kommentare sperren, Langsam-Modus.

## F. Dokumente (Notizen, Dateien, Links in „Wissen")

- **Sichtbarkeit:** nur ich, Eingeladene, Gruppe, alle mit dem Link (nicht in Listen und Suche), öffentlich.
- **Rechte** für Personen und Gruppen in vier Stufen (ansehen, kommentieren und vorschlagen, bearbeiten, verwalten), mit Ablaufdatum; Entziehen wirkt sofort.
- **Bearbeiten:** nur ich, die Gruppe, oder „Vorschläge" (Eigentümer:in oder Freigabe-Berechtigte übernehmen). Jede Änderung ist eine **Version**, zurückholbar. Während jemand schreibt, ist das Dokument fünf Minuten für andere gesperrt.
- **Herunterladen und Kopieren:** ein Schalter je Dokument; öffentliche Dokumente brauchen eine **Lizenz** (Alle Rechte vorbehalten, CC BY, CC BY-SA, CC0; Notizen starten mit CC BY-SA). Bei CC-Lizenz oder erlaubtem Download gibt es „Kopie in mein Wissen" mit Verweis auf das Original.
- **Eigentum** übergeben (mit Annahme) oder in eine Gruppe verschieben; **Papierkorb** 30 Tage; beim Löschen des Kontos bleiben Gruppen-Dokumente der Gruppe, wenn man das wählt.
- **Speicher:** 100 MB (Stufe 1), 500 MB (Stufe 2), 2 GB je Gruppe. Gemeldete Dateien sind sofort unlesbar, bis entschieden ist.

## G. Umfragen

Alle, die schreiben dürfen, erstellen Umfragen; Fragen und Antworten lassen sich nicht ändern (neu anlegen). Frist 24 Stunden, 7 Tage oder offen. Beenden und Löschen: die Ersteller:in und Admins und Maintainer der Gruppe. Zahlen sind offen, wer wie abgestimmt hat, bleibt geheim.

## H. Spam, Bots und Moderation

- **Limits** je Stufe (siehe `action_rules`), verständliche Meldung statt Fehler.
- **Bots:** Wegwerf-Mail-Domains werden abgelehnt, gleiche lange Nachrichten (mehr als vier in einer Stunde) und Link-Fluten von neuen Konten werden gestoppt, ein unsichtbarer Prüfschritt (Cloudflare Turnstile) und ein Falle-Feld im Anmeldeformular.
- **Melden:** Gründe Beleidigung, Belästigung, Bedrohung, strafbarer Inhalt, Gefahr für Kinder, Spam, Falschinformation, persönliche Daten, unsicherer Link. **Notfall-Weg** (Bedrohung, strafbar, Kinder): sofort ausgeblendet, eine Plattform-Admin entscheidet, keine Jury nötig. Sonst: sieben ausgeloste Menschen, nie aus Gruppen oder Chats der Beteiligten. Wer oft unbegründet meldet, wird gebremst.
- **Strafleiter:** 1. Verstoß Hinweis, 2. Verwarnung und 24 Stunden Schreibpause, 3. sieben Tage Sperre, danach prüft eine Plattform-Admin. Verstöße verfallen nach 12 Monaten. Einmal **Einspruch** (14 Tage), dann entscheidet eine andere Jury; war er erfolgreich, ist alles zurückgenommen. Wer jemanden eingeladen hat, erfährt von Verstößen in den ersten 30 Tagen.
- **Aufbewahrung** von Meldungen und Entscheidungen 6 Monate. **Transparenzbericht** unter `/transparenz` (Zahlen, Protokoll der Admin-Aktionen ohne Namen). Herausgabe an Behörden nur auf Beschluss, jede wird ohne Namen vermerkt.
- **Server-Admins:** Sobald es zwei gibt, braucht jede Rechtevergabe und Sperre (Admin ernennen oder entziehen, Person sperren, Initiative sperren, Notfallzugriff auf einen Chat) die Zustimmung einer zweiten Admin. Kein Lesezugriff auf private Chats; Notfallzugriff nur mit Begründung (mindestens 20 Zeichen), zweiter Admin, eine Stunde, und alle im Chat erfahren es.

## I. App teilen und Wachstum

Seite `/teilen`: System-Teilen, Link mit Kurztext, QR-Code. Öffentliche Gruppen, Initiativen und Anfragen haben „Weitergeben" (Link auf genau diese Seite); Nicht-Öffentliches bietet es nicht an. Einladungscodes: fünf je Person, wachsen nach, wenn Eingeladene mindestens 14 Tage bleiben; Admins können Codes für die Anlaufphase erzeugen. Statt Ranglisten zeigt `/teilen`, zu welchen Themen im eigenen Ort noch niemand zuständig ist.

## Was nur zum Teil geht (ehrlich)

- **eID:** Der Modus `eid` ist vorbereitet, es gibt aber noch keine Anbindung an einen eID-Dienst. Bis dahin: Login, Bürgschaft oder Einladung.
- **Bot-Schutz:** Das Captcha-Feld erscheint nur mit `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, und die Prüfung muss zusätzlich im Login-Dienst (Supabase, Authentication → Bot and Abuse Protection) eingeschaltet sein. Auffälligkeiten pro IP-Adresse („viele neue Konten von einer Adresse") erfordern Edge/WAF und sind hier nicht umgesetzt.
- **Virenprüfung:** Dateien haben ein Feld `scan_status`, und als „infiziert" markierte Dateien werden nicht ausgeliefert. Einen Scanner gibt es nicht; dafür braucht es einen Dienst außerhalb der App. Fotos werden im Browser neu kodiert (dabei verschwinden Standortdaten).
- **Gelöschte Dateien im Speicher:** Nach 30 Tagen Papierkorb wird die Zeile in der Datenbank gelöscht, die Datei im Speicher bleibt unlesbar übrig, bis sie jemand mit dem Service-Schlüssel entfernt. Löscht die Eigentümerin „endgültig", räumt die App auf.
- **Herunterladen ausgeschaltet** heißt: kein Knopf, kein Download-Link. Bildschirmfotos und das Speichern eines geöffneten Fotos lassen sich nie verhindern.
- **Rechtliche Abläufe** (Meldeweg nach DSA, Herausgabe an Behörden, Impressum, Datenschutzerklärung) sind technisch vorbereitet; die Texte und Zuständigkeiten muss der Betreiber festlegen und prüfen lassen.
- **Notfallzugriff auf Chats:** Die Datenbank-Funktionen (Antrag, zweite Freigabe, Protokoll, Mitteilung an die Beteiligten) sind da, eine Oberfläche zum Lesen gibt es bewusst noch nicht.
- **Live-Zusammenarbeit:** nur Sperre und Versionen. Föderation: Remote-Profile sind höchstens Stufe 1, mehr ist noch nicht gebaut.

## Wie man es prüft

`npm run test` (Datenbank-Tests, alles in zurückgerollten Transaktionen) und `npm run test:e2e`. Die Tests zu den Rechten stehen in `tests/db.test.ts` (Abschnitte „trust levels", „contact, privacy and messages", „groups", „initiatives", „responsibilities", „documents", „moderation", „growth", „polls and the rights matrix") und in `e2e/` (`rights`, `safety`, `groups`, `initiatives`, `responsible`, `documents`, `moderation`, `growth`).
Die Migrationen sind auf der Live-Datenbank angewendet, bevor der Code online geht: alter Code läuft mit der neuen Datenbank, aber ohne die neuen Funktionen (zum Beispiel Initiativen bearbeiten, bis der neue Code ausgeliefert ist).
