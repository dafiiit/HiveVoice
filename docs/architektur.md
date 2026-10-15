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

1. **Jetzt:** Schema vorbereitet, Outbox füllt sich, keine Auslieferung.
2. **Selfhost-Paket:** Compose mit Postgres, GoTrue (Supabase Auth) und App.
3. **Nur-Lese-Föderation:** Gruppen und Initiativen als ActivityPub-Actors, Mastodon kann folgen (z. B. mit Fedify).
4. **Beidseitig:** Remote-Argumente und Kommentare, Instanz-Allowlist.
5. **Verifier-Attestierungen:** Unterstützungen und Stimmen aus fremden Instanzen zählen nur mit signierter Bestätigung.

## Später ergänzen (Schema steht schon)

- Finanzierung (`funding_campaigns`, `pledges`), Alles-oder-nichts, zweckgebunden
- Dateien mit Versionen und Änderungsvorschlägen (`files`, `file_versions`, `change_requests`)
- eID-Verifizierung (`private.identities`, `private.rejoin_blocks`)
- LLM-basiertes Matching (heute: Stichwörter und Region)
- Bilder-Upload (heute: Platzhalter)
