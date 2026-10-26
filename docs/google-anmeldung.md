# Google-Anmeldung und Google Fotos einrichten

Diese Anleitung hat zwei Teile. Teil A schaltet „Mit Google anmelden“ ein. Teil B schaltet „Aus Google Fotos“
beim Hochladen von Bildern ein. Beides nutzt dasselbe Google-Projekt. Teil B ist optional.

Die App ist schon vorbereitet: Sobald die Umgebungsvariablen unten gesetzt sind und neu gebaut wurde, erscheinen die Knöpfe.

## Teil A: Mit Google anmelden

### 1. Google-Projekt anlegen

1. Öffne <https://console.cloud.google.com> und melde dich mit deinem Google-Konto an.
2. Oben links auf die Projektauswahl klicken, **Neues Projekt**, Name `HiveVoice`, **Erstellen**. Danach das neue Projekt oben auswählen.

### 2. Zustimmungsbildschirm (was Menschen bei Google sehen)

1. Menü **APIs & Dienste → OAuth-Zustimmungsbildschirm** (in der neuen Oberfläche: **Google Auth Platform**). **Los geht’s**.
2. App-Name `HiveVoice`, Support-E-Mail: deine Adresse. **Weiter**.
3. Zielgruppe: **Extern**. **Weiter**. Kontakt-E-Mail eintragen, Bedingungen akzeptieren, **Erstellen**.
4. **Datenzugriff (Scopes)**: Es genügen die Standardbereiche `openid`, `…/auth/userinfo.email` und `…/auth/userinfo.profile`. Mehr braucht die Anmeldung nicht.
5. **Zielgruppe / Veröffentlichungsstatus**: Zuerst steht die App auf **Testing**. Dann können sich nur Konten anmelden, die unter **Testnutzer** eingetragen sind (trage dich selbst ein). Wenn alle sich anmelden sollen: **App veröffentlichen** („In Produktion“). Für die Standardbereiche ist keine Prüfung durch Google nötig.

### 3. OAuth-Client erstellen

1. **Clients** (alt: **Anmeldedaten**) → **Client erstellen** (alt: **Anmeldedaten erstellen → OAuth-Client-ID**).
2. Anwendungstyp **Webanwendung**, Name `HiveVoice Web`.
3. **Autorisierte JavaScript-Quellen** hinzufügen:
   - `https://hive-voice.vercel.app` (deine echte Adresse, ohne Schrägstrich am Ende)
   - `http://localhost:3000` (nur zum Entwickeln)
4. **Autorisierte Weiterleitungs-URIs** hinzufügen, genau diese:
   `https://wpfkxekiumonxmscwcvc.supabase.co/auth/v1/callback`
   (Das ist die Supabase-Adresse deines Projekts. Supabase zeigt sie dir auch im nächsten Schritt an. Mit eigener Adresse für Supabase kommt `https://auth.deinedomain.de/auth/v1/callback` dazu, siehe docs/betrieb.md.)
5. **Erstellen**. Es erscheinen **Client-ID** und **Clientschlüssel**. Beides kopieren. Den Schlüssel nie in den Chat, ins Repo oder in `.env.example` schreiben.

### 4. In Supabase einschalten

1. <https://supabase.com/dashboard> → dein Projekt → **Authentication → Sign In / Providers** (alt: **Providers**) → **Google**.
2. **Enable Sign in with Google** einschalten, **Client ID** und **Client Secret** einfügen, **Save**.
3. **Authentication → URL Configuration**:
   - **Site URL**: `https://hive-voice.vercel.app`
   - **Redirect URLs**: `https://hive-voice.vercel.app/**` und `http://localhost:3000/**`

### 5. In der App einschalten

1. Vercel → Projekt `hive-voice` → **Settings → Environment Variables**. Neu anlegen (Production, Preview, Development):
   - `NEXT_PUBLIC_AUTH_PROVIDERS` = `google`
2. **Deployments** → am neuesten Eintrag **⋯ → Redeploy**. Die Variablen mit `NEXT_PUBLIC_` werden beim Bauen eingebaut, ohne Redeploy ändert sich nichts.
3. Lokal: dieselbe Zeile in `.env.local`, danach `npm run dev` neu starten.

### 6. Ausprobieren

Abmelden → **Anmelden** → **Mit Google**. Beim ersten Mal führt der Weg ins Onboarding (Ort, Name, Interessen).

### Wenn etwas hakt

| Meldung | Ursache |
| --- | --- |
| `redirect_uri_mismatch` | Die Weiterleitungs-URI im Google-Client stimmt nicht genau mit der Supabase-Callback-Adresse überein (Buchstabe für Buchstabe, ohne Leerzeichen). |
| „Zugriff blockiert: … hat die Google-Überprüfung nicht abgeschlossen“ / „nicht verifiziert“ | App steht auf **Testing** und das Konto ist kein Testnutzer. Testnutzer eintragen oder App veröffentlichen. |
| Zurück auf `/login?error=callback` | Redirect-URL fehlt in Supabase (**URL Configuration**). `https://…/**` eintragen. |
| Der Google-Knopf fehlt | `NEXT_PUBLIC_AUTH_PROVIDERS=google` fehlt oder es wurde nach dem Setzen nicht neu deployt. |

## Teil B: Fotos aus Google Fotos

Der Knopf **Aus Google Fotos** erscheint beim Hochladen von Profilbild und Angebots- oder Anfragefotos,
sobald `NEXT_PUBLIC_GOOGLE_CLIENT_ID` gesetzt ist. Ablauf für die Person: Knopf drücken → Google fragt einmal nach
Erlaubnis → „Google Fotos öffnen“ → Fotos auswählen und bestätigen → die Fotos landen automatisch in HiveVoice.
HiveVoice sieht nur die ausgewählten Fotos, nie die ganze Mediathek, und speichert den Zugriffscode nicht.

1. Im selben Google-Projekt: **APIs & Dienste → Bibliothek** → **Google Photos Picker API** suchen → **Aktivieren**.
2. **Datenzugriff (Scopes) → Bereiche hinzufügen**: `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`
   (manuell einfügen, falls er nicht in der Liste steht), **Speichern**.
   Im Testmodus genügt es, dass die Person Testnutzer ist. Für alle Menschen kann Google beim Veröffentlichen eine
   Prüfung dieses Bereichs verlangen. Plane dafür Zeit ein.
3. Die JavaScript-Quellen aus Teil A, Schritt 3 gelten auch hier. Eine zusätzliche Weiterleitungs-URI ist nicht nötig.
4. Vercel → **Environment Variables**: `NEXT_PUBLIC_GOOGLE_CLIENT_ID` = die **Client-ID** aus Teil A (nur die ID, nicht den Schlüssel).
   Danach **Redeploy**. Lokal in `.env.local`.
5. Ausprobieren: **Für mich** → **Aus Google Fotos**.

Hinweise:

- Fotos vom eigenen Gerät gehen immer, auch ohne Google: Knopf **Vom Gerät** oder Fotos auf die Fläche ziehen. Auf dem Handy bietet die Auswahl des Geräts meist selbst Google Fotos oder iCloud an.
- Die Google-Fotos-Anbindung konnte in der Entwicklung nicht gegen Google getestet werden, weil dafür deine Zugangsdaten nötig sind.
  Wenn der Ablauf bei dir hakt, schick die Meldung (Browser-Konsole oder Text im Rot-Kasten).
