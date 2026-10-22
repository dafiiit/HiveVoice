# Architektur und Entscheidungen

## Grundprinzip

Einstieg und Selfhosting sind **dieselbe Software in zwei Betriebsmodi**. Erstnutzer landen auf der
Flagship-Instanz (Vercel + Supabase), Vereine und Kommunen können später eine eigene Instanz betreiben.
Föderation ist eine Schicht für den öffentlichen Teil, nicht das Rückgrat.

## Schichten

```
Browser ── Next.js (Server Components, Server Actions) ──┬── Postgres (Schema, RLS, Fachlogik in SQL)
                                                          └── Supabase Auth (nur Login)
```

- **Datenbankzugriff:** Die App verbindet sich mit einem eigenen Login (`hivevoice_app`), der nur Mitglied von
  `hivevoice_server` ist. Für Nutzeranfragen wechselt jede Transaktion in die Rolle `authenticated` (oder `anon`)
  und setzt `request.jwt.claims`. Damit gelten die Row-Level-Security-Regeln genau so, als käme die Anfrage
  über PostgREST. Ohne Supabase funktioniert das identisch, die Rollen legt die Migration selbst an.
- **Vertrauenswürdige Funktionen** (`app.cast_vote`, `app.ensure_profile`, Admin-Funktionen) dürfen nur vom Server aufgerufen werden.
- **Fachlogik in SQL:** Gruppenrechte, Zielabstimmung, Initiativ-Phasen, Bridge-Score, Jury und Benachrichtigungen
  sind Funktionen und Trigger in `supabase/migrations/`. So bleibt das Verhalten bei jedem Betreiber gleich.
- **Supabase-spezifisch** ist nur `20261015000003_supabase.sql` (`pg_cron`, Löschen von Logins). Ohne `pg_cron`
  ruft ein externer Scheduler `GET /api/cron` mit `CRON_SECRET` auf.

## Wichtige Entscheidungen

| Entscheidung | Warum |
| --- | --- |
| `profiles.id` ist unabhängig von `auth.users` (`auth_user_id` optional) | Remote-Personen aus anderen Instanzen und Demo-Profile brauchen ein Profil ohne lokalen Login |
| `uri` und `origin_instance_id` an Gruppen, Initiativen, Argumenten, Posts, Einträgen; Tabelle `instances` | Vorbereitung für ActivityPub; lokale Zeilen haben `origin_instance_id = null` |
| `federation_outbox` mit Triggern | Öffentliche Änderungen werden schon jetzt protokolliert; ein späterer Worker liefert sie aus |
| `app.uid()` statt `auth.uid()` | RLS läuft ohne Supabase GoTrue |
| HMAC-Schlüssel in der App-Umgebung, nicht im Supabase Vault | portabel; die Datenbank kennt den Schlüssel nie |
| Regionen mit amtlichem Schlüssel (AGS) und Platz für `wikidata_id` | Instanzen meinen dieselbe Region |
| Polling statt Realtime | keine zusätzliche Infrastruktur beim Selfhosting |
| Verantwortungsbereiche statt Behörden-Accounts | jede:r kann zuständig sein; Behörden belegen es per Dienst-E-Mail-Domain |
| `verification_mode` (`login` / `eid`) | Testbetrieb ohne eID, später nur noch eID, umschaltbar in der Admin-Seite |

## Bridge-Score

Jede Person, die Argumente unterstützt, gehört dem Lager an, dessen Argumente sie häufiger unterstützt (Pro oder Contra).
Für jedes Argument wird je Lager die Zustimmungsrate berechnet, als untere Grenze des Wilson-Intervalls (z = 1,28).
Der Score ist das **Minimum der beiden Lager**. Oben stehen also nur Argumente, die beide Seiten überzeugen;
kleine Zahlen werden nicht überbewertet. Ab 0,15 zeigt die App „Findet Zustimmung auf beiden Seiten“.

## Abstimmungen

- **Gruppenziele:** Mitglieder (ohne Gäste) zählen; angenommen bei Mehrheit der Abstimmenden und Beteiligung ≥ 50 %.
  Externe stimmen als Resonanz mit, wenn die Rechte-Matrix es erlaubt.
- **Initiativen:** Die Autor:innen starten die Abstimmung, sobald die Debatte läuft. Alle dürfen abstimmen,
  verbindlich zählen die Betroffenen (Wohnort im Gebiet). Quorum optional. Ergebnisse bleiben bis zum Ende verborgen.
- Ein Token pro Person und Abstimmung erlaubt das Ändern der Stimme bis zum Ende.

## Föderation: Fahrplan

1. **Jetzt:** Schema vorbereitet, Outbox füllt sich, keine Auslieferung. Nur öffentliche Inhalte kommen in die
   Outbox (`app.federation_public`: öffentliche Gruppe ohne Altersgrenze, veröffentlichte und nicht gesperrte
   Initiative, sichtbares Argument, öffentlicher aktiver Eintrag; keine Beispiele). Öffentlich werden ist `Create`,
   öffentlich bleiben `Update`, nicht mehr öffentlich `Delete`. Private Inhalte hinterlassen keine Spur.
2. **Selfhost-Paket:** Compose mit Postgres, GoTrue (Supabase Auth) und App.
3. **Nur-Lese-Föderation:** Gruppen und Initiativen als ActivityPub-Actors, Mastodon kann folgen (z. B. mit Fedify).
4. **Beidseitig:** Remote-Argumente und Kommentare, Instanz-Allowlist.
5. **Verifier-Attestierungen:** Unterstützungen und Stimmen aus fremden Instanzen zählen nur mit signierter Bestätigung.

Regeln für den Worker (ab Stufe 3):

- **Beim Ausliefern neu prüfen.** Der Worker liest `app.federation_queue()`, prüft jedes Objekt noch einmal mit
  `app.federation_public` und baut die Nutzlast erst dann aus der aktuellen Zeile. Die Warteschlange enthält nur
  Typ, ID und Aktivität, nie Inhalte.
- **Nur Aliasnamen.** Was eine Instanz verlässt, liegt bei fremden Servern dauerhaft. Personen heißen nach außen
  immer `app.federation_name` (der Alias), auch bei `display_mode = 'real'`. Zum Start keine Personen-Actors, nur
  Gruppen (`Group` nach FEP-1b12, wie Lemmy) und Initiativen; Beiträge nennen die Person nur als Alias im Text.
- **Termine als `Event`.** Termine (F01) bekommen Felder, die sich ohne Umbau als ActivityStreams-`Event`
  ausgeben lassen (`startTime`, `endTime`, Ort als `Place` mit Adresse und Koordinaten, Zeitzone, Status
  abgesagt/verschoben, Teilnahme als `Accept`/`TentativeAccept`/`Reject`). Dann sind öffentliche Termine mit
  Mobilizon und Gancio kompatibel und das iCal-Abo folgt aus denselben Feldern.
- **Löschen ist eine Bitte.** Ein `Delete` an fremde Server lässt sich nicht erzwingen; der Datenschutztext muss
  das sagen, bevor ausgeliefert wird.

## Später ergänzen (Schema steht schon)

- Finanzierung (`funding_campaigns`, `pledges`), Alles-oder-nichts, zweckgebunden
- Dateien mit Versionen und Änderungsvorschlägen (`files`, `file_versions`, `change_requests`)
- eID-Verifizierung (`private.identities`, `private.rejoin_blocks`)
- LLM-basiertes Matching (heute: Stichwörter und Region)
- Bildmoderation (Fotos werden heute nur über „Melden“ geprüft), Zuschnitt und weitere Größen

## Fotos

Fotos liegen im Objektspeicher (Supabase Storage, Bucket `images`, öffentlich lesbar). Die Datenbank kennt nur den
Pfad `<auth-user-id>/<datei>.jpg` (`profiles.avatar_path`, `listing_images`). Der Browser verkleinert jedes Bild
(lange Seite höchstens 1280 px, Profilfoto 640 px, JPEG) und lädt es direkt in den eigenen Ordner hoch. Die Policies auf
`storage.objects` erlauben Schreiben nur dort, die Datenbankfunktionen `app.set_avatar` und `app.set_listing_images`
prüfen Ordner, Endung und Anzahl (höchstens vier je Eintrag). Auf einem eigenen Server genügt jeder S3-kompatible
Speicher: `NEXT_PUBLIC_IMAGE_BASE_URL` zeigt auf seine öffentliche Adresse, nur `src/lib/upload.ts` ändert sich.
Nicht mehr verwendete Dateien werden noch nicht automatisch gelöscht.

## Verbinden: Anfragen und Chats

Erste Kontakte laufen immer über eine Anfrage, damit niemand ungefragt zugeschrieben wird:

- `contact_requests` mit Eintrag (Angebot oder Gesuch) oder ohne (erste Nachricht über ein Profil, `app.request_direct`)
- `group_join_requests` für Gruppen mit Beitritt auf Anfrage

Verbinden zeigt beides als Zeilen mit Status („Wartet“, „Neu“, „Abgelehnt“). Nimmt die empfangende Person an,
entsteht eine `conversation`; die erste Nachricht wandert hinein. Chats nutzen Polling (4 s bei offenem Tab), keine
Echtzeit-Verbindung. Der „Gelesen“-Hinweis kommt aus `conversation_participants.last_read_at`.

Im Testbetrieb gibt `app.ensure_demo_chats()` jedem Konto beim ersten Öffnen von Verbinden drei Beispiel-Chats und
drei Anfragen von Demo-Profilen (Schalter „Demo-Chats“ auf der Admin-Seite, Einstellung `demo_chats`). „Alle
Demo-Daten löschen“ entfernt sie wieder.
