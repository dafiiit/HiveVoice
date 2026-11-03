# Mobile design: review and recommendations (2026-11-03)

Basis: the 27 pages of the last `npm run review` (current with `57807eb`) at 390 and 360 px, compared with Apple HIG, Material 3, WCAG 2.2, NN/g and Hoober's thumb research (sources at the end). Recommendations only, nothing is changed yet.

## What already works

- Form fields and search are 16 px on phones (`SearchField` only shrinks at `md:`), so iOS does not zoom on focus.
- `viewportFit: "cover"` and `env(safe-area-inset-bottom)` under the bottom bar.
- Main buttons and inputs are 44 px (`h-11`), matching HIG 44 pt.
- Bottom navigation with 3–4 items (HIG/Material: 3–5), swipe between tabs, clean list rows with clear titles and avatars.

## The main problem: too much chrome, too little content

On a phone, most pages stack **four layers of navigation and controls** before the first entry:

| Layer | Example (Gemeinschaft → Anliegen) | Height |
|---|---|---|
| Header: logo, global search, inbox, avatar | | 84 px |
| Area tabs | Pinnwand · Anliegen · Termine · Gruppen | 44 px |
| Page actions | Karte, + Anliegen | 52 px |
| Sub-tabs | Angebote · Gesuche | 50 px |
| Page search | Anliegen durchsuchen … | 50 px |
| Filters | Kategorie · Filter · 13 Einträge | 52 px |
| Bottom bar | Gemeinschaft · Freunde · Neu · Ich | 64 px |

The first entry starts at **355 px**. Together with the bottom bar, roughly **60 % of the visible screen is controls**, and only 3–4 entries fit. Pinnwand, Kalender and Ich → Überblick look similar (3 control rows each).

### 1. Let the header scroll away (high impact, low effort)
`SmartHeader` already hides on downward scroll and returns on upward scroll, but only on pages without the shell. Use the same behaviour for the shell header **and the area tabs** on phones. This is Material's "scroll-off-screen" top app bar and Safari's own pattern. Keep the bottom bar fixed. Gain: ~128 px while reading.

### 2. One search, not two
Every list page shows the global "Suchen …" in the header and, 100 px below, a page "Durchsuchen …" field that looks identical (same grey fill, same icon). People cannot tell which one searches what.
- On phones, make the header search an icon button that expands into a full-width field (or opens a search page).
- Keep the page search as the visible one, because it filters what is on screen.

### 3. Drop the full-width "+ X" button at the top of lists on phones
"+ Notiz", "+ Chat", "+ Gruppe", "+ Diagramm", "+ Initiative" each take a 52 px black bar, and the bottom bar already has "Neu". The placement is also inconsistent: full width (Notizen), right-aligned next to "Karte" (Anliegen), left-aligned and narrower (Kalender "+ Neuer Termin").
- Use one consistent compact "+" button at the right end of the area-tab row (the same compact button the desktop review recommends next to the list title, `docs/desktop-design.md` 2).
- Not recommended (revised 2026-11-03): a context-aware bottom "Neu" that creates a note on Notizen and a chat on Chats. The same button would do different things on different pages, and the long press for the full menu is hidden.

### 4. Merge sub-tabs and filters into one row
Sub-tabs (Angebote/Gesuche, Notizen/Mit Aufgaben, Gruppen/Initiativen) are a third tab level. NN/g and Material both advise against nested tab bars.
- Turn them into the first chip of the filter row: `[Angebote ▾] [Kategorie ▾] [Filter ▾]   13`, or a two-item segment inside that row.
- Pinnwand: merge "Nachbarschaft · Stadt · Bundesland · Land" and "Schwabing-Freimann ▾" into one button: `📍 Schwabing-Freimann · Stadt ▾`.
- Kalender: put "Woche / 4 Wochen / 3 Monate" and "← Früher / Später →" in one row with arrow icons.

With 1–4 the first entry on Anliegen would start around 150–200 px instead of 355 px.

## Navigation

### 5. Area tabs overflow without a hint
At 360 px "Gruppen" is cut ("Gruppe"), and in Ich the row scrolls to "…nder | Notizen | Diagramme | Uploads | Init…". Ich has 8 tabs; HIG/Material recommend at most 5 per level, the rest behind "More".
- Show 4 tabs plus "Mehr ▾" on phones (`TabRow` already does this when space runs out on wider screens; apply it on phones too instead of horizontal scrolling).
- Or make Ich → Überblick a hub with tiles (Notizen, Diagramme, Uploads, Initiativen …) and keep only Überblick, Anliegen, Kalender, Notizen as tabs.
- Swipe is currently the only way to discover tabs to the right; swipe alone is not discoverable.

### 6. Bottom bar: current place weaker than "Neu"
The black "Neu" block is the strongest element on every screen, while the current section is shown only by a thin top line and bold text. Icons are ~12 px hexagon clusters that look alike.
- Make the active item clearly marked (filled icon, ink background or a thick indicator, as in Material's active indicator).
- Make "Neu" a normal-weight item (icon in a square outline, or the red accent), not a solid black block.
- Raise icons to 24 px and give Gemeinschaft, Freunde and Ich distinct shapes; keep the labels (labels raise use, NN/g).

### 7. Hide the bottom bar in focused tasks
In an open chat and in the note editor, the composer sits on top of the bottom bar. With the keyboard open, header + composer + bar leave little room for messages. iOS hides the tab bar on pushed detail screens (`hidesBottomBarWhenPushed`), most chat apps do the same.
- Open chat, note editor, diagram editor: full screen with the back arrow, no bottom bar.
- Chat composer at 360 px: the text field is only ~155 px wide. Put attachment and poll behind one "+" button and use an icon send button.

### 8. Header details
- The salmon square in the header is not a missing avatar: the test account has a 1 × 1 px pink test photo (TASKS, "Avatar des Testkontos"). Nothing to change in the app; remove the photo in Einstellungen. (Corrected 2026-11-03.)
- Logo is 34 × 34 px; give it a 44 px tap area.
- Login page header: "Als Gast entdecken" wraps to two lines; shorten to "Als Gast" or move it below the form.

## Touch and readability

### 9. Action links as text
"Antworten · Ausblenden · Melden" under chat messages, "So sehen andere dein Profil · Rechte und Stufen" in Einstellungen and "Geteilt mit mir, Übergaben, Papierkorb" under lists are 20 px tall underlined text. WCAG 2.5.8 exempts links inside sentences, but these are action rows, and on touch 44 px is the target (HIG, WCAG 2.5.5).
- Chat: move message actions into a long press / "⋯" menu (as WhatsApp, Signal).
- Lists: show "Geteilt mit mir, Übergaben, Papierkorb" as three 44 px rows or one "Mehr" row.

### 10. 36 px controls on touch
Chips, filters, "Karte", "Mehr ▾", "Werkzeuge" and sub-tabs are 36 px (`h-9`). The review tool already lists them as "Klein für Touch". `tag` already uses `pointer-coarse:h-10`; do the same for `segment`, `chip` and `sm` buttons (`pointer-coarse:h-11`), keeping 36 px for mouse.

### 11. Chip rows cut at the edge
"Kontaktanfragen 1" is cut in Freunde at 390 and 360 px, the badge half hidden. Shorten labels on phones ("Anfragen") or fade the edge like the tab row does.

### 12. Truncated placeholders and titles
"Gruppen durchsuch" (Gruppen), "Mia Sch…" (chat header at 360 px, squeezed by "+ ▾" and "Mehr ▾"). Use the plain "Durchsuchen …" everywhere; in the chat header, combine "+" and "Mehr" into one "⋯".

## Turn it into checks

As AGENTS.md says, what the eye finds becomes a rule. Candidate rules for `tools/review`:
- **Content start**: on list pages at 390 px, the first list entry starts above 35 % of the viewport height.
- **One search field** visible per screen on phones.
- **No horizontally clipped chip or tab** at 360 px without an overflow hint.
- **Bottom bar absent** on chat and editor pages.
- **Touch size** of 44 px as a warning (not a hint) under `pointer: coarse`.

## Suggested order

1. Header scrolls away (1), one search (2): biggest gain, mostly shell changes.
2. Context-aware "Neu", remove top "+" bars (3), merged filter rows (4).
3. Bottom bar styling (6), hide it in chat and editor (7), header details (8).
4. Tab overflow (5), touch sizes (9, 10), clipping (11, 12).
5. Add the review rules so it stays fixed.

## Sources

- Apple Human Interface Guidelines, Layout and Tab bars: 44 pt targets, 3–5 tabs, safe areas — via [specification.website: touch target size](https://specification.website/spec/accessibility/touch-target-size/)
- Material 3 top app bar scroll behaviour (pinned, scroll-off-screen, collapsing): [SAP Fiori for Android, M3 top app bar](https://www.sap.com/design-system/fiori-design-android/v25-8/components/m3-standard-components/top-app-bar/usage), [Android: TopAppBarScrollBehavior](https://developer.android.com/reference/kotlin/androidx/compose/material3/TopAppBarScrollBehavior)
- WCAG 2.2, 2.5.8 Target Size (Minimum), 24 px, and 2.5.5, 44 px: [W3C Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [Deque: target-size](https://dequeuniversity.com/rules/axe/4.7/target-size)
- Hidden vs. visible navigation (NN/g study, summarised): [Smashing Magazine: bottom navigation on mobile web](https://smashingmagazine.com/2019/08/bottom-navigation-pattern-mobile-web-pages), [UX Planet: alternatives to the hamburger menu](https://uxplanet.org/alternatives-of-hamburger-menu-a8b0459bf994)
- Thumb reach and grips: [Hoober, UXmatters: Design for fingers and thumbs](https://uxmatters.com/mt/archives/2013/11/design-for-fingers-and-thumbs-instead-of-touch.php), [Smashing Magazine: The Thumb Zone](https://smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users)
- Mobile forms, 16 px inputs, `inputmode`, `enterkeyhint`: [specification.website: mobile form inputs](https://specification.website/spec/accessibility/mobile-form-inputs/)
