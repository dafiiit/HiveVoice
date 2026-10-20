# Marktplatz: Anfragen, Angebote, Matching und Karte

## Biete und suche

Ein Formular für beides: oben „Ich biete“ oder „Ich suche“, darunter die Kategorie. Jede Kategorie bringt
ihre eigenen Felder mit (`src/lib/market.ts`, eine Liste für Formular, Karte, Filter und Prüfung):

| Kategorie | eigene Felder | Gegenwert |
|---|---|---|
| Hilfe & Können | online möglich | kostenlos, Stundenlohn, Festpreis, Tausch |
| Jobs & Mitarbeit | Anstellung, Arbeitsort (vor Ort, hybrid, remote), Stunden pro Woche, Branche, Beginn | Stundenlohn, Monatsgehalt, ehrenamtlich |
| Wohnen | Art (Miete, WG-Zimmer, Zwischenmiete, Kauf, Wohnungstausch, Schlafplatz), Zimmer, Fläche, frei ab, möbliert, Haustiere | Miete oder Preis, kostenlos, Tausch |
| Dinge | Art (verschenken, verkaufen, verleihen, tauschen), Zustand, Versand | kostenlos, Preis, Tausch |
| Mitfahrt | von, nach, Datum, Abfahrt | kostenlos, Preis, Tausch |
| Kurse & Treffen | Datum, Uhrzeit, Niveau, online | kostenlos, Preis, Stundenlohn, Tausch |
| Eigenes Formular | bis zu acht eigene Felder (Name und Inhalt) | alle |

Der Titel schlägt die Kategorie vor („WG-Zimmer …“ öffnet Wohnen). Die Felder liegen in `listings.attrs`
(jsonb); der Server behält nur bekannte Felder mit dem richtigen Typ (`cleanAttrs`).

### Mischform: Tausch

Alles mit einer nicht-geldlichen Gegenleistung ist Angebot und Anfrage zugleich. Wählt man beim Gegenwert
„Tausch“, öffnet sich das Gegenstück: beim Angebot „Was suchst du im Gegenzug?“, bei der Anfrage „Was bietest
du dafür?“. Beide Einträge werden gespeichert und über `listings.pair_id` verbunden (`app.pair_listings`).
Karten und Detailseiten zeigen „Tausch · sucht dafür …“ und verlinken das Gegenstück. So wird man von beiden
Seiten gefunden, und ein Tausch in beide Richtungen ist ein eigener Grund im Matching.

## Matching

`app.listing_matches(listing, limit)` liefert Einträge der anderen Art mit Punktzahl und Gründen. Es läuft mit
den Rechten der Person, die fragt, sieht also nur, was sie lesen darf.

| Grund | Punkte |
|---|---|
| gleiches Stichwort (`tag:<slug>`) | 3 je Stichwort, höchstens 9 |
| ähnliche Worte in Titel und Beschreibung (deutsche Wortstämme) | 2 je Wort, höchstens 6 |
| gleiche Kategorie | 2 |
| am selben Ort / in der Nähe (gleicher Kreis oder darüber) / online | 3 / 1 / 0 |
| gleiche Art (Wohnen, Dinge) | 2 |
| gleiche Anstellung (Jobs) | 1 |
| gleiche Strecke (Mitfahrt) | 4 |
| Preis im Budget | 1 |
| Tausch in beide Richtungen | 5 |
| ähnliche Bedeutung (Embedding, siehe unten) | 3 |

Ein Treffer braucht inhaltliche Nähe (Stichwort, Wort, Bedeutung oder Strecke) und mindestens 3 Punkte.

**Sichtbar für beide Seiten:**

- Detailseite des eigenen Eintrags: „Angebote, die zu deiner Anfrage passen“ mit Gründen („#garten · am selben Ort“).
- Tab „Passt zu dir“ / „Wo du gebraucht wirst“: zuerst Treffer zu den eigenen Einträgen, dann zu den Interessen im Profil.
- Fremder Eintrag, der zu einem eigenen passt: „passt zu ‚…‘“ mit Gründen, der eigene Eintrag ist beim Anfragen vorausgewählt.
- Die Anfrage trägt den Bezug (`contact_requests.via_listing_id`); im Eingang und in „Verbinden“ steht „passt zu ‚…‘“.
- Neuer Eintrag: die Besitzer der besten Treffer (ab 6 Punkten, höchstens fünf, je Paar einmal) bekommen die Mitteilung „Neues Angebot passt zu ‚…‘“ (`app.notify_listing_matches`).

### Bedeutung (KI, in Supabase)

Jeder aktive Eintrag bekommt ein Embedding (`listings.embedding`, 384 Dimensionen) aus öffentlichem Text:
Titel, Beschreibung, Stichwörter, nie die privaten Details. Gerechnet wird mit dem Modell gte-small, das in
Supabase Edge Functions eingebaut ist (`supabase/functions/embed-listings`); kein Text verlässt die Plattform,
kein Schlüssel, keine Kosten außer den Funktionsaufrufen.

- Die App ruft die Funktion nach jedem Speichern auf, danach erst gehen die Treffer-Mitteilungen raus.
- Die Funktion arbeitet nur ab, was `app.pending_embeddings` liefert (fehlend oder veraltet, erkannt am md5 des Textes), höchstens 8 je Aufruf. Ohne offene Arbeit tut sie nichts, deshalb braucht sie keinen Schlüssel.
- In `app.listing_matches` zählt die Ähnlichkeit relativ: gte-small ist auf Englisch trainiert und hält fast alle deutschen Texte für ähnlich (0,85 bis 0,89). Als Grund „ähnliche Bedeutung“ (+3) zählt deshalb nur, was mindestens 0,06 über dem Durchschnitt dieses Eintrags liegt (an den Demo-Daten geeicht: „Auer Mühlbach in Blender modellieren“ ↔ „3D-Modellierung in Blender“).
- Neu deployen: `supabase functions deploy embed-listings --no-verify-jwt`.

**Nächste Schritte:** ein mehrsprachiges Modell (z. B. multilingual-e5-small über Transformers.js in derselben
Edge Function) hebt die Qualität für Deutsch deutlich; dann die Schwelle neu eichen. Danach Vorschläge für
Stichwörter und Kategorie beim Schreiben, und für die besten Treffer ein Satz, warum sie passen – immer
zusätzlich zu den festen Gründen, nie statt ihrer. Gewichte nach den ersten Wochen anhand angenommener Anfragen nachjustieren.

## Entdecken → Marktplatz

Angebote oder Gesuche, Kategorie-Leiste mit Anzahl, Suche (Volltext deutsch, Titel, Stichwörter), Filter je
Kategorie (Jobs nach Anstellung und Arbeitsort, Wohnen nach Art, Zimmern, Fläche, möbliert, Dinge nach Art und
Zustand, Mitfahrt nach Strecke und Datum, Kurse nach Datum und Niveau), dazu kostenlos, Höchstpreis, in meiner
Nähe, Ort. Sortierung: relevant, neu, Preis, nächster Termin. Ansicht: Liste oder Karte.

## Karte

| Anbieter | Kosten | Datenschutz | Kartenmaterial |
|---|---|---|---|
| Google Maps | ab ~10.000 Aufrufen/Monat kostenpflichtig, API-Schlüssel, Kreditkarte | Datenübermittlung an Google (USA), Einwilligung nötig | sehr gut, POIs |
| Mapbox | Freikontingent, danach pro Aufruf | US-Anbieter, Telemetrie | sehr gut |
| OSM-Kacheln von openstreetmap.org | frei, aber laut Nutzungsrichtlinie nicht für Apps mit viel Verkehr | ok | gut |
| **OpenFreeMap** (gewählt) | kostenlos, kein Schlüssel, keine Limits | keine Cookies, kein Tracking, IP sieht der Dienst | OpenStreetMap, Vektor |
| Eigene Kacheln (Protomaps/PMTiles) | Speicher ~1 GB für Deutschland, sonst nichts | keine Dritten | OpenStreetMap, Vektor |

Umgesetzt mit MapLibre GL (freie Bibliothek) und OpenFreeMap im Stil „positron“, passend zum Schwarz-Weiß.
Der Anbieter ist eine Umgebungsvariable: `NEXT_PUBLIC_MAP_STYLE_URL` (jeder MapLibre-Stil). Wer keine Dritten
will, legt eine PMTiles-Datei in den eigenen Speicher und trägt einen eigenen Stil ein.

- Das Kartenmaterial lädt erst nach Klick auf „Karte laden“; die Wahl merkt sich nur der Browser.
- Einträge erscheinen am Mittelpunkt ihres Ortes (Gemeinde oder Stadtteil), nie an einer Adresse, ein Quadrat pro Ort mit Anzahl.
- Koordinaten: `regions.lat/lon`, aus Wikidata (CC0) über den Gemeindeschlüssel; `node --env-file=.env.local scripts/import-region-coords.mjs` (bei neuen Gemeinden erneut ausführen).
