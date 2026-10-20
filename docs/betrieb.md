# Aufgaben für den Betreiber

Was technisch vorbereitet ist, aber nur der Betreiber erledigen kann (Konten, Schlüssel, rechtliche Verantwortung).

## Admins festlegen

Wer Server-Admin ist, bestimmt allein die Einstellung `ADMIN_EMAILS` beim Hosting-Anbieter, nicht die App.
Es gibt keinen Knopf „Mich als Admin eintragen“, und Admins können sich nicht gegenseitig ernennen.

1. Vercel → Projekt → Settings → Environment Variables: `ADMIN_EMAILS` = eigene E-Mail-Adresse
   (mehrere durch Komma getrennt), für Production und Preview. Dann neu deployen.
2. Mit dieser Adresse anmelden. Sie muss bestätigt sein (Bestätigungsmail oder Google-Login).
3. Die Verwaltung liegt unter `https://<domain>/<ADMIN_PATH>`.

Der Abgleich (`app.sync_server_admins`) läuft bei jedem Aufruf der Verwaltung und sobald sich jemand
anmeldet, dessen Adresse neu auf der Liste steht oder von ihr gestrichen wurde. Wichtig: Ist `ADMIN_EMAILS`
leer, verliert beim nächsten Abgleich jedes Konto die Admin-Rechte. Also zuerst die Variable setzen,
dann deployen. Lokal gilt dasselbe in `.env.local`.

Ohne zweiten Faktor hängt der Admin-Zugang am E-Mail-Postfach (oder Google-Konto) dieser Adressen:
dort unbedingt 2FA einschalten.

### Später: 2FA für Admins

Vorbereitet, aber noch aus. `ADMIN_REQUIRE_MFA=1` lässt nur noch Sitzungen mit zweitem Faktor
(Supabase `aal2`) in die Verwaltung. Vorher muss es eine Seite geben, auf der man TOTP einrichtet und
den Code beim Anmelden eingibt (Supabase `auth.mfa.enroll` / `challenge` / `verify`), sonst sperrt man
sich aus. Siehe TASKS.md.

## Bot-Schutz einschalten (Cloudflare Turnstile)

Code ist fertig (`src/components/auth/Captcha.tsx`): sobald der Site Key gesetzt ist, erscheint die Prüfung beim
Registrieren und Anmelden, und das Token geht an Supabase.

1. Cloudflare-Konto → Turnstile → „Add widget“: Domain der App (und `localhost` zum Testen), Modus „Managed“ oder „Invisible“.
2. Supabase-Dashboard → Authentication → Bot and Abuse Protection → „Enable Captcha protection“, Anbieter Turnstile, **Secret Key** eintragen.
3. Vercel → Projekt → Settings → Environment Variables: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = **Site Key** (Production und Preview), dann neu deployen.
4. Lokal dieselbe Variable in `.env.local`. Achtung: ist der Schutz in Supabase an, aber kein Site Key gesetzt, schlägt jede Anmeldung fehl. Deshalb Schritt 2 und 3 zusammen machen.
5. Die e2e-Tests melden sich über das echte Formular an: für Tests den Test-Site-Key von Cloudflare (`1x00000000000000000000AA`) und den passenden Test-Secret nutzen oder die Tests gegen eine Instanz ohne Captcha laufen lassen.

## Rechtstexte

Die Seiten `/legal/imprint` und `/legal/privacy` haben Platzhalter in eckigen Klammern (`messages/*/legal.json`).
Was fehlt und vom Betreiber entschieden und rechtlich geprüft werden muss:

| Thema | Was technisch da ist | Was der Betreiber festlegt |
|---|---|---|
| Impressum (§ 5 DDG, § 18 MStV) | Seite mit Platzhaltern | Name, Anschrift, E-Mail, inhaltlich Verantwortliche:r |
| Datenschutzerklärung (DSGVO) | Text mit allen Diensten, die die App nutzt (Supabase, Vercel, Resend, Turnstile, OpenFreeMap, Link-Vorschau, Google Fotos), Löschweg, Rechte | Verantwortliche Stelle, Rechtsgrundlagen je Zweck, Speicherfristen, Auftragsverarbeitungsverträge (Supabase, Vercel, Resend, Cloudflare), Drittlandübermittlung, ggf. Datenschutzbeauftragte:r |
| Meldeweg nach DSA (Art. 16) | Melden-Knopf an Beiträgen, Argumenten, Einträgen, Nachrichten; Jury, Einspruch, Begründung an Betroffene, Transparenzbericht `/transparenz` | Kontaktstelle für Behörden und Nutzer:innen (Art. 11, 12), Frist und Zuständigkeit für Meldungen, ob die Plattform „klein“ im Sinne des DSA ist |
| Herausgabe an Behörden | Notfallzugriff auf Chats mit zweiter Freigabe und Protokoll (Datenbank) | Wer entscheidet über Auskunftsersuchen, wie sie geprüft und protokolliert werden, ob Nutzer:innen informiert werden |
| Nutzungsbedingungen | Grundsätze unter `/principles`, Regeln für Meldungen | verbindliche Bedingungen, Altersgrenze, Haftung, Kündigung |
| Marktplatz | Kategorien Jobs und Wohnen, Preise | Hinweis, dass die Plattform nicht vermittelt; bei Jobs ggf. AGG (diskriminierungsfreie Anzeigen), bei Wohnungen Angaben nach GEG (Energieausweis) |

Empfehlung: die Texte von einer Anwältin oder einem Anwalt für IT-Recht prüfen lassen, bevor die Instanz öffentlich wirbt.
