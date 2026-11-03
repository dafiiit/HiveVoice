# Desktop design: review and recommendations (2026-11-03)

Basis: all 27 pages of `npm run review` at 1440 × 900 and 1180 × 820 (working tree on top of `57807eb`, including the uncommitted search-scope and note-icon work), each also with every menu opened. Compared with NN/g, Apple HIG (macOS sidebars and split views), Material 3 (large screens), Fluent 2 (elevation) and WCAG 2.2 (sources at the end). Recommendations only; the counterpart for phones is `docs/mobile-design.md`.

## What already works

- **The three-pane layout** (sidebar 200 px, list 380 px, opened item) is the right model for a desktop app with many collections. Apple's split view and Teams/Outlook use the same structure, and it is applied the same way in every area.
- **List rows** are clean: one bold title, one muted line, a clear selected state (bar on the left plus grey fill).
- **Type** is calm and consistent: Helvetica, few sizes, bold titles. The welcome page uses the Swiss grid well.
- **The "Neu" page** (nine tiles with a glyph, a name and one sentence) is easy to scan.
- **The review tool** already catches overlaps, clipping and tiny targets. This round it found 11 errors, all in one place (see Bug below), and 12 warnings (20 px links).

## Bug found on the way

The new note-icon picker (`src/components/links/IconPicker.tsx`, not yet committed) is see-through: the emoji grid sits on the editor's placeholder text without a background (11 errors in `report.md`, `notiz-neu`). Give the popover `bg-surface border border-ink` like the other menus. Recommendation 9 below would also stop this class of bug.

## The main problems

On a phone the problem is too much chrome. On a desktop it is the opposite: **the hierarchy is flat and the extra space is wasted.** Almost everything is solid black or a 1 px outline, so nothing leads the eye. Pages built for one column leave half of a 1440 px screen empty, or run as one very long list.

### 1. Put the three areas at the top of the sidebar, not the bottom (high impact)

Today the sidebar shows the sections of the current area at the top (Pinnwand, Anliegen …) and the areas themselves (Gemeinschaft, Freunde, Ich) at the bottom. That reverses the hierarchy: the higher level sits below the level it contains, 650 px away from the small grey area name it controls. The active area is drawn as a 2 px black box, which looks like a keyboard focus ring.

- Option A (Teams/Slack pattern): a narrow rail of 64 px on the far left with the three areas (icon over label), and the sidebar next to it with the area's sections. The rail never folds; the sidebar does.
- Option B (fewer changes): the three areas as a segmented row at the top of the sidebar, directly under the fold button, and the sections under them.
- Either way, mark the active area like the active section (fill plus bar), not with a box. Apple's guidance is at most two levels in a sidebar, and that holds here.

### 2. One strong action per view; calm everything else (high impact)

Count the solid black shapes on Freunde → Chats: the "+ Chat" bar, every initials avatar (five black squares), the unread badges, and the avatar in the chat header. Personen has 11 black avatar squares in a column. When everything is black, nothing is primary.

- **Avatars without a photo**: ink letter on `--chip` (or on a light tone from the seed), not white on black. They are the most repeated element and should be the quietest.
- **Create buttons**: one placement. Today Freunde, Chats, Notizen and Meine Inhalte have a full-width black bar under the title, while Anliegen, Gruppen and Personen have a compact button to the right of the title. Use the compact one everywhere (it keeps the list higher) and keep black for it.
- **Button rows**: the profile header has four equal outlined buttons (Nachricht schreiben, Folgen, Du sagst: hat mir geholfen, Blockieren). Make "Nachricht schreiben" primary, keep "Folgen" secondary, and put "Blockieren" (destructive and rare) behind "⋯".

### 3. Disabled buttons should not be the loudest grey on screen

"Senden", "Antworten", "Hinzufügen", "Kommentieren" and "Anmelden" are solid grey blocks while disabled (the black fill at `disabled:opacity-45`). They are the largest grey shapes on their screens and read as broken. Draw a disabled primary as an outline with muted text, or keep the button enabled and explain on submit. Material and Fluent both draw disabled controls with less contrast than enabled ones, not with a different fill.

### 4. Use the width on wide screens

- **Pinnwand** (1440 px): a 896 px column with 170 px empty on the left and nothing on the right. Add a right column (the `aside` slot of `Page` already exists): your place and its range, upcoming events nearby, groups nearby. Move the place picker from the toolbar into it.
- **Termine**: one list of 9,263 px for eight weeks, because each weekly series repeats every week, and each row shows "Öffentlich" plus "Zusage / Absage". Show a series once ("jeden Freitag, 17:00") with its next date, drop "Öffentlich" on a page that only lists public events, and show "Zusage" only after hovering or opening the row.
- **Kalender**: the right column is "Erinnerungen und Abo", which are settings and take a third of the page. On desktop that column should be a month grid (already planned in TASKS, F01; Schedule-X is the candidate). Move reminders and the subscription address into Einstellungen or a gear popover.
- **Anmelden**: the form sits at 380 px from the left with nothing to its right. Center it, or use a two-column layout with the welcome image.

### 5. Limit line length inside the opened item

`.pane-titles .page-narrow { max-width: 1400px }` (globals.css) lets text in the detail pane run as wide as the pane. With the sidebar folded, the detail is 1232 px wide and a paragraph runs past 150 characters. Readable measure is 45–75 characters; WCAG 1.4.8 sets 80 as the upper limit. Keep the pane wide for tables, images and the editor, but give running text (`.md`, leads, descriptions, comments) `max-width: 72ch`.

### 6. Show secondary actions on hover, not always

Desktop has hover; phones do not. Under every chat message, "Antworten · Ausblenden · Melden" sits underlined and always visible (20 px high, flagged by the review). Under every Pinnwand post there is a row of four icons. Slack, Teams and Mail show these on row hover and on keyboard focus:

- `@media (hover: hover)`: hide the action row until `:hover` or `:focus-within`, and keep it visible on touch.
- Use icon buttons of 28–32 px with a tooltip instead of underlined words.

### 7. Search: one field, one meaning

The header search changes its placeholder per page ("Beiträge suchen", "Chats suchen", "Suchen: Menschen, Gruppen …"). It now looks global but searches locally on most pages. It is also centered on the window, so it lines up with neither the list nor the content.

- Keep the header field global (people, groups, initiatives, places, my notes) and open it with ⌘K / Strg+K as a command palette.
- Filtering the current list belongs in the list header, aligned with the list (one field, the same width as the list).
- That also answers the phone recommendation "one search, not two".

### 8. Keyboard shortcuts for repeated work

HiveVoice is used every day: chats, notes and lists. NN/g recommends accelerators for such use, as an optional extra that is shown in menus and tooltips. Start small: ⌘K search, `N` new (the Neu menu), `J/K` or ↑/↓ to move through the list, Enter to open, Esc back to the list, ⌘Enter to send. Show them in tooltips as the editor already does.

### 9. Floating layers need depth

Menus, popovers, the peeking sidebar and dialogs float over the page, but the rule "no shadows" leaves them only a 1 px border. That makes them hard to tell from the page. It has also caused bugs: the see-through diagram menu (fixed in `90e850d`) and now the icon picker. Fluent and Material express "this is on top" with elevation. A single shadow token used only for floating layers keeps the flat Swiss page and makes layers obvious. See "Proposed rule changes".

### 10. Badges: one meaning per color

Today counts appear as a black square (Chats 1, Kontaktanfragen 1), a red square (Freunde 2, inbox 3), a red "Neu" label (Jonas Brandl), black chips with numbers (Mitteilungen filters) and small red squares (unread notifications). Rule: **red means "waiting for you"**, with one shape (count in a red square), everywhere. Black counts are plain information and can be muted text ("13 Einträge" already is).

### 11. Smaller things

- **Folded list column**: folded, the list becomes a strip of identical icons (every note shows the same note icon), which identifies nothing. When folded, hide the list completely (the sidebar button reopens it), or fold only the sidebar.
- **Ich → Überblick** opens the first item (an initiative) instead of giving an overview. Either rename it, or build the planned "Heute" overview (TASKS, "Struktur … ausbauen").
- **Initiatives without a picture** show a 160–250 px placeholder graphic at the top of the detail. On desktop show nothing, or a small glyph next to the title.
- **Sidebar labels** are cut at 200 px ("Kontaktanf…"). Shorten to "Anfragen".
- **Einstellungen → Profil** mixes the photo, how you appear, offers and searches (two identical grids of 12 chips) and, on the right, your initiatives and groups. Split it into sections with a left navigation on desktop (macOS System Settings, GitHub settings), and show one chip grid with a switch "biete / suche".
- **Termine** shows 00:00 for several example events. Check whether these are all-day events; if so, show "ganztägig".

## Proposed rule changes (AGENTS.md "Design", styles.ts)

The current line is "square corners, no shadows". The Swiss look should stay, but three rules cost more than they give on desktop:

| Rule today | Proposal | Why |
|---|---|---|
| No shadows | No shadows on things in the page. One token, e.g. `--shadow-float: 0 8px 24px rgb(0 0 0 / .16)`, only for menus, popovers, dialogs and the peeking sidebar. | Layers become clear; see-through menus become obvious. Fluent and Material use elevation only for what floats. |
| Square corners everywhere | Square for surfaces, fields and action buttons. A full pill radius for filter chips and on/off toggles, marked `data-round` (checks.js already allows it). | NN/g recommends a recognizable button shape. Round chips separate "filter" from "action" (this is the open TASKS item "zweite Knopfart mit runden Ecken"). |
| Black for emphasis (implicit) | Black fill for at most one primary action per view. Avatars, badges and create buttons follow 2 and 10. | Hierarchy needs contrast between levels. |
| (none) | Running text at most 72ch, also inside wide panes. | Readability, WCAG 1.4.8. |
| (none) | On `hover: hover`, secondary row actions appear on hover/focus. | Less noise, the same function. |

## Turn it into checks

As AGENTS.md says, what the eye finds becomes a rule with a self-test. Candidates for `tools/review/checks.js`:
- **Line length**: a text block wider than 80ch at desktop sizes (warning).
- **One primary**: more than one `bg-ink` button visible in one pane (hint).
- **Disabled look**: a disabled button whose background is darker than `--line-strong` (warning).
- **Page height**: a page more than 4 screens tall without paging or grouping (hint, would have caught Termine).
- **Floating without depth**: an opened menu without `--shadow-float` (once the token exists).

## Suggested order

1. Fix the icon picker (bug), disabled buttons (3), badges (10): small changes in `styles.ts` and a few components.
2. Sidebar structure (1) and quiet avatars and create buttons (2): the biggest visible change, mostly `Sidebar.tsx`, `Avatar.tsx`, `Split.tsx`.
3. Line length (5), hover actions (6), the shadow token (9) together with the rule changes above.
4. Wide-screen pages: Pinnwand aside, Termine grouping, Kalender grid (4).
5. Search and shortcuts (7, 8).

## Sources

- NN/g, Clickable elements and weak signifiers in flat design: [Beyond Blue Links: Making Clickable Elements Recognizable](https://www.nngroup.com/articles/clickable-elements/), [Flat Design Decreases User Efficiency](https://www.nngroup.com/videos/flat-design/)
- NN/g, grouping by proximity and common region: [Proximity Principle](https://www.nngroup.com/articles/gestalt-proximity/), [Common Region](https://www.nngroup.com/articles/common-region/)
- NN/g, accelerators for expert users: [UI Accelerators](https://www.nngroup.com/articles/ui-accelerators/)
- Apple HIG, [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars.md) (at most two levels, the source list) and [Split views](https://developer.apple.com/design/human-interface-guidelines/split-views.md)
- Material 3 on large screens, rail versus drawer: [Android: Build adaptive navigation](https://developer.android.com/develop/ui/compose/layouts/adaptive/build-adaptive-navigation), [SAP Fiori for Android, M3 navigation rail](https://www.sap.com/design-system/fiori-design-android/v26-1/components/m3-standard-components/navigation-rail/usage)
- Fluent 2, elevation for floating layers: [Fluent 2 Elevation](https://fluent2.microsoft.design/elevation), [Windows: Layering and elevation](https://learn.microsoft.com/en-my/WINDOWS/APPS/design/signature-experiences/layering)
- Line length, 45–75 characters, WCAG 1.4.8 at most 80: [UXPin: Optimal line length](https://www.uxpin.com/studio/blog/optimal-line-length-for-readability/)
