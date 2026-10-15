# Wavelength, direction "rice": design rationale

Mock: `dist/mocks/rice.html` (standalone; open at 1280×800 and at 390×844).
Sections, top to bottom: Home frame, Playlist frame (menu, submenu, toast), overlays (dialog, empty state, state table), filter strip, flower inventory, tokens.

## 1. Idea

This direction is the most literal reading of the reference. Every app region becomes a floating terminal window on a black field. A window has no border, background or radius. It is drawn with four marks only:

- a hairline rule that stops short;
- a `− ×` pair at the right end;
- a prompt line (`> /time`, `> look_in.txt`) as its title;
- optionally, a dashed rule that closes it.

The UI uses greys only. Colour exists only inside media (covers, artist images, genre tiles, entity hues, the avatar, the mini player tint), and media always renders through one switchable filter, `var(--media-filter)`, which is mono by default. Flowers are white silhouettes with 1px black separations, as in the reference branch. They appear in the logo, every cover, the Home readout, the playlist hero, the empty states, the flower inventory and a slow falling-petal layer.

## 2. Tokens

```css
/* field + greys: the only UI colours */
--void:#000;  --ink-1:#0c0c0c;  --ink-2:#161616;  --ink-3:#2a2a2a;
--rule:#d9d9d9;  --rule-dim:#4d4d4d;
--fg-hi:#fff;  --fg:#d9d9d9;  --fg-sub:#8f8f8f;  --fg-dim:#575757;
--sel-bg:#d9d9d9;  --sel-fg:#000;              /* inverse video */
/* chrome */
--hair:1px;  --win-top:20px;  --ctl-gap:14px;  --rule-w:<per window>;
--dash: repeating-linear-gradient(90deg, var(--rule) 0 3px, transparent 3px 5px);
--dash-dim: same with --rule-dim;
/* layout (desktop) */
--pad:32px;  --gutter:48px;  --side-w:232px;  --top-h:72px;  --player-h:88px;
/* media */
--media-filter: grayscale(1) contrast(1.12) brightness(1.03);  /* set by [data-filter] on <body> */
```

Mapping onto the existing SPEC §2 tokens (names are kept, values change):

| SPEC token | rice value |
|---|---|
| `--bg-base`, `--bg-panel` | `#000` |
| `--bg-elevated`, `--bg-menu` | `#000` (menus get a `0 0 0 1px #262626` edge) |
| `--bg-highlight`, `--bg-tinted*` | `--ink-2` / `--ink-3` |
| `--fg`, `--fg-sub`, `--fg-muted` | `--fg`, `--fg-sub`, `--fg-dim` |
| `--accent`, `--accent-hover`, `--accent-press` | `#fff`, `#fff`, `#8f8f8f` (states use brackets, bold and inverse video, not green) |
| `--on-accent` | `#000` |
| `--liked-a/-b/-hero`, `--verified`, `--avatar-bg` | unchanged, but only ever painted on a filtered layer |
| `--danger` | `#fff` with a `!` marker; no red |
| `--radius-*` | `0` everywhere except artist images (`50%`) |
| `--focus-ring` | `outline: 1px dashed #fff; outline-offset: 3px` |
| `--font` | see §3 |

## 3. Type

- **Face:** DotGothic16 (Google Fonts, OFL), a 16-dot bitmap gothic. Its Latin glyphs are half-width, so it sets as a monospace. It also covers JIS kanji in the same dot grid, so `Contact: 鳥語花香` (a Chinese idiom: birdsong and fragrant flowers) matches the reference's Chinese line in the same pixel style.
- **Stack:** `'DotGothic16', 'MS Gothic', 'Osaka-Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace`. MS Gothic and Osaka-Mono are the system bitmap-era Japanese monospaces, so a failed font load still looks right.
- **Load:** `https://fonts.googleapis.com/css2?family=DotGothic16&display=swap`.

| role | size / line | used for |
|---|---|---|
| label | 12 / 16 | meta, sublines, flags (chips), table heads, readout, `− ×`, time stamps, tooltips |
| body | 16 / 20 | names, track titles, prompts and window titles, menu items, clock, toast, dialog title |
| title | 32 / 36 | hero `h1` at every title length (the `title-96/72/48/32` classes all map to 32; on phone too) |

- 16 and 32 fall on the font's pixel grid and render crisp. 12 renders slightly soft, which matches the soft pixel type of the reference screenshot.
- **Bitmap bold:** `text-shadow: 1px 0 0 currentColor` at 16px (0.5px at 12px), the classic smear-by-one-pixel bold. Use it for labels (`Host:`, `Song:`), the current track and current names.
- Weight is always 400. Nothing uses `font-weight` above 400, since the face has no bold.
- Case: lowercasing is CSS only (`text-transform: lowercase` on flags, sublines, shelf titles, the library title). Text nodes are never edited.

## 4. Window chrome anatomy

```
──────────────────────────────────────────            − ×     1 rule  2 controls
> look_in.txt   _What do you want to play?        [▣]         3 prompt  4 cursor
- - - - - - - - - - - - - - - - - - - - - - - - - - - - -     5 dashed rule
```

1. **Rule:** `::before`, 1px `--rule`, `top: 9px`, `width: calc(var(--rule-w) - 26px - var(--ctl-gap))`. Rules stop short by different amounts, as in the reference (83%, 83%, 57%):
   - library 92%
   - search 62%
   - `/time` 72%
   - quick picks 86%
   - shelves 74%, 58%, 80% (alternating)
   - track list 66%
   - player 100%
2. **Controls:** `::after { content: "\2212\00a0\00d7" }`, 12px, flush right, 4px above the rule, aria-hidden by construction. Where the app has a real close action (right panel, dialog with `closeButton`, expanded player), the real button sits exactly under the `×`.
3. **Prompt title:** `"> "` comes from `::before`, followed by a path at 16px, 8px under the rule. The path is either the region's existing heading, lowercased by CSS (`> your library`, `> made for you`), or a new aria-hidden span (`> /time`, `> /quick_picks`, `> /media`, `> look_in.txt`, `> late_night_drive.m3u`).
4. **Cursor:** `_` blinks with `1.06s steps(1)`. It appears after the wordmark, in the empty search field (hidden on `:focus-within`, where the native caret takes over) and in the colophon.
5. **Dashed rule:** 3px on, 2px off. It closes the search window, separates table heads from rows, and makes the menu separators and slider tracks.
6. **Corner fragments:** two short rules (22px and 30px) under the player cover and the hero cover. They come from the empty frame in the reference's `/Media` window.

The whole chrome is pure CSS on a `.win` class (`position: relative; padding-top: 20px` plus the two pseudo-elements). No markup is needed, so it can be added to existing elements: `.sidebar`, `.shelf`, `.track-table`, `.player-bar`, `.context-menu`, `.dialog`, `.mini-player`, `#right-panel`.

## 5. Region → window

| region | window | notes |
|---|---|---|
| `#topbar` | logo + `look_in.txt` window + filter switcher + avatar | Logo: vector 5-petal blossom (`#i-logo`) with an aria-hidden `wavelength_` wordmark. Home button: pixel house. Search pill: `> look_in.txt` (aria-hidden) then the real input with the placeholder in `--fg-dim` and a blinking `_` before it. The divider is hidden; browse is a pixel archive box. The dashed rule closes the window. |
| `#sidebar` | `> your library` | The title text is the prompt, and the icon shows only in rail mode. Chips render as flags (`--playlists`); pressed means `[--albums]` in white. Sort reads `recents ▾`. Rows: 32px cover, 16px name, 12px lowercased subline. The open route gets a `>` in a 16px gutter (scroll containers get `padding-left:16px; margin-left:-16px`). The playing row has a blinking pixel speaker. |
| `#main` header | `‹ ›  ~/home` breadcrumb | 12px grey; the last segment is white. Home chips sit at the right end of this line on desktop. When `.main-header__ctx` shows, the ctx play button and title follow the breadcrumb. |
| Home | readout band + windows | Left: no chrome, exactly like the reference: a fitted flowering branch (236×196) plus the neofetch readout (Host, Os, Architecture, Contact 鳥語花香, FPS live, Location = route name, Connection: ESTABLISHED, Session Number). Right: `/time` (live `DD-MM-YYYY hh:mm AM/PM`) and `/quick_picks` (2×4 lines of 24px cover + name). Below: one window per shelf, with the title as prompt and `show all` at the right. Covers are 8 per row at about 95px; subs are one line. |
| Playlist / album / artist | hero without chrome + action line + `.m3u` window | Hero: 156px cover with corner fragments, `type: playlist`, the 32px title, description, meta, and an aria-hidden `hue: ■ 4a1d6a` swatch (the entity colour, filtered). A small white sprig sits at the right edge, echoing the reference. Play is a white square with a black pixel triangle. The track list is a window titled `> late_night_drive.m3u`, with a dashed rule under the head. |
| `#player-bar` | `> /media` window | Columns 35/37/28. The left column is `> /media`, a 44px cover with corner fragments, then `Song:` / `Author:` labels from `::before` before the existing title/artist links. Sliders: the dashed track is the remaining time, a solid 1px white line is the played part, and a 5×9 block is the thumb. |
| `#right-panel` | `> /now_playing` or `> /queue` | The real close × sits under the chrome `×`. |
| `.context-menu` | small window, black fill, 1px #262626 edge | 16px items, 28px tall. Hover and keyboard focus are inverse video; an open submenu parent is `--ink-3`. Separators are dashed. `Find a playlist` is a bare prompt field. |
| `.dialog` | window with prompt title `> Delete from Your Library?` | Secondary actions are `[ Cancel ]`; primary is an inverse block. Backdrop `rgba(0,0,0,.78)`. |
| `.toast` | inverse status line `✓ Added to Liked Songs` | Offsets as in SPEC §8.7. |
| `.tooltip` | black box, 1px `--rule-dim` edge, 12px | |
| empty states | window titled with the route path | A single drooping bud (`Flora.bud` + `Flora.leaf`) next to the existing copy. |

## 6. Interaction states

| state | treatment |
|---|---|
| hover | Text goes to `--fg-hi`. Rows get an `--ink-2` fill and a `>` cursor in the gutter. Cards get a 1px `--rule-dim` box 4px outside the cover, and the play square steps in (2 steps). |
| active / pressed / on | Flags and filter options are bracketed, white and bitmap-bold. Toggle icons (shuffle, repeat, queue) turn white with a 6×1 underline. Saved shows as a white check-circle. |
| selected (track row) | Inverse video: `--sel-bg` with black text and the `>` gutter cursor. |
| current / playing | White, bitmap-bold title. A 3-bar stepped equaliser replaces the number. The library and quick-pick rows of the playing context show a blinking speaker or the pause square. |
| focus-visible | `outline: 1px dashed #fff; outline-offset: 3px`, the dashed rule again. |
| disabled | `--fg-dim`. |

## 7. Flowers

Everything is procedural and seeded (`mulberry32` over an FNV hash of the entity id), so a given cover is identical on every load.

- **Petal primitives:** `notch` (cherry), `round` (obovate), `lance`, `spoon`, `ruffle` (scalloped rim), `tepal` (long, rounded tip).
- **Construction:** each petal is filled, then stroked in the separation colour (`#000` for silhouettes, the cover's darkest tone for covers). Front petals cut thin dark lines into the back ones, which is the reference's "white mass, fine dark lines" look.

| species | construction |
|---|---|
| sakura (cherry) | 5 notched petals; stamen lines with dot tips |
| ume (plum) | 5 round petals; 18 stamens |
| peony | 4 rings of ruffled petals (8/7/5/4) |
| chrysanthemum | 5 rings of spoon petals (26 → 8) |
| lotus | 3 rings of lance petals; seed-pod centre |
| daisy | 18 petals; stippled disc |
| rose | 2 guard rings; disc with a 2.4-turn spiral |
| magnolia | side view: reflexed pair, back trio and front pair of tepals; twig, bud and leaf |
| wisteria | raceme: a cone of pea-flowers on a curved stalk, open at the top and budded at the tip |
| hydrangea | 30 four-petal florets on a golden-angle dome |
| leaf | almond shape with midrib and three vein pairs |
| bud | teardrop with sepal lines |
| petal | loose notched petal, squashed for tilt |

**Branch generator.** `Flora.branch(ctx, w, h, opts)` works in three steps:

1. It plans a wandering main stem with seeded forks two levels deep.
2. It places leaves on nodes, small blooms on side nodes, and a cluster of 1 to 3 blooms plus a bud on every tip.
3. It measures the whole plan, fits it into the canvas (base on the bottom edge, `anchorX`, `maxScale`), and draws it with separation widths divided by the fit scale. Loose petals drift in a `petalBox` beside it.

Home uses seed `rice-hero-10` (peony, peony, sakura), which is the closest to the reference's composition: stem from bottom right, clusters top, left and right-middle, petals to the left. The hero sprig uses sakura and ume.

**Covers.** Covers are tonal flower compositions in colour, 300×300, derived from the entity colour:

- Background: the hue at lightness ≤ 0.27 fading to ≤ 0.12, plus a radial glow.
- Petals: three pale tints at lightness 0.9 / 0.77 / 0.66. Separations at 0.11. Leaves are the hue shifted −50°.

Backgrounds are always dark and petals always light, so every filter reads (and `ink` thresholds cleanly). There are five modes:

- `bloom`: one big head, cropped, with a companion.
- `branch`: a fitted, bleeding branch.
- `scatter`: a staggered wallpaper.
- `bouquet`: mixed heads over leaves.
- `petals`: a corner head and drifting petals.

Mixes and charts carry a big outlined bitmap numeral. Editorial covers carry a tiny white blossom mark. Liked Songs keeps its `--liked-a → --liked-b` gradient with a white heart. Late Night Drive is an ume branch against a pale moon.

**Petal layer.** One fixed `<canvas>` behind the windows (`pointer-events:none`, aria-hidden) holds 12 petals on desktop and 7 on phone. Each is 5 to 9.5px, alpha 0.4 to 0.85, falls at 9 to 23px/s, sways 12 to 38px and tumbles (squash on a sine). With `prefers-reduced-motion: reduce` they are drawn once and never move. The cursor blink and equaliser stop too.

**Where flowers appear:** the logo, every cover and artist image, the Home branch, the playlist sprig, the empty states, the petal layer, and the `/flora` inventory.

## 8. Filters

- **Switcher.** `filter [mono] dither invert color ink` is a `role="radiogroup"` of `role="radio"` buttons. Arrow keys move the selection and persist it in `localStorage` (`rice-filter`). It lives at the right of the top bar on desktop, and under the Home flags on phone, where the top bar is hidden.
- **Mechanism.** `<body data-filter="…">` sets `--media-filter`. Every colour carrier uses it:
  - `.cover` (img) gets `filter: var(--media-filter)` directly.
  - Flat colours move onto a filtered layer: `.browse-card::before { background: var(--browse-color) }`, `.avatar::before { background: var(--avatar-bg) }`, `.hero__hue i { background: var(--hero-color) }`, `.mini-player__tint { background: …var(--mini-color) }`, and likewise `--xp-color` and `--home-tint` if used. Each of these layers gets `filter: var(--media-filter)`.
  - The UI chrome is never filtered, because it is already grey.

| name | definition | reads as |
|---|---|---|
| `mono` (default) | `grayscale(1) contrast(1.12) brightness(1.03)` | tonal grey flowers; hue gone, value kept |
| `dither` | SVG `#f-dither`, details below | 1-bit screen print |
| `invert` | `grayscale(1) invert(1) contrast(1.05)` | photographic negative; flowers become ink on paper |
| `color` | `none` | the original palette passes through |
| `ink` (rice's own) | SVG `#f-ink`: luminance, discrete table `0 0 0 0 0 .42 1 1 1 1` | the reference silhouette: black ground, white flowers, one mid-grey for centres |

`dither` builds its output in four steps:

1. Rec. 709 luminance, then a 1.25× contrast.
2. Add a tiled 8×8 `feImage`: a 4×4 Bayer matrix at 2px cells holding inverted thresholds. It is generated at load by canvas into a PNG data URI.
3. Combine with `feComposite arithmetic k2=1 k3=1 k4=-.5`.
4. Apply `feComponentTransfer discrete 0 1`.

The two SVG filters (`<svg class="defs">`) must sit in the document next to the sprite.

## 9. Phone (< 768px)

- **Shell.** One column: `main / mini-player / bottom-nav`. Top bar, library and player bar are hidden, as in the spec. `#main` has 16px sides.
- **Home** stacks in this order:
  1. breadcrumb
  2. `[N]` avatar and flags
  3. the filter switcher
  4. the readout band (branch 132×150 + readout)
  5. `/time`
  6. `/quick_picks` (2 columns)
  7. shelf windows that scroll sideways at 128px per card, with play squares hidden
- **Mini player.** A `/media` window docked above the nav: rule plus `− ×`, a 40px cover, `Song:` / `Author:`, add, play/pause. A dashed progress line with a solid played part and a block head runs under it. A filtered `--mini-color` gradient sits at 38% behind.
- **Bottom nav.** A black bar under a dashed top edge. Pixel icons with lowercase labels. The active item is white with a 22×1 underline.
- **Playlist.**
  - The hero stacks: 150px cover, 32px title, meta wraps.
  - The action line puts the play square at the right.
  - Rows are 52px: 40px cover, title/artist and an always-visible `⋯`. No index, album, date or duration; no selected or hover look (tap plays).
  - Context menus are demonstrated at desktop. On phone the same `.context-menu` CSS applies, with the app's own positioning.
- **Expanded player** (not mocked). It is a full-height `/media` window: `> playing from playlist / Late Night Drive` as the prompt, the cover with corner fragments, `Song:` / `Author:`, a dashed slider with a block thumb and `1:24 / -2:18`, and pixel controls with a white play square. The `−` sits over the real close chevron.

## 10. Why this is better than a generic dark theme

- **It has a grammar, not a palette.** A dark theme is a set of colours. Rice is a few repeatable marks (rule, `− ×`, prompt, dashed rule, cursor, brackets, inverse video), so any new screen can be built in the same voice without inventing anything.
- **State without colour.** A green accent is replaced by typographic devices native to terminals:
  - brackets for chosen
  - bitmap bold for current
  - inverse video for selected and focused
  - a `>` cursor for hover
  - dashed outlines for focus

  These survive grayscale and colour-blindness, and print.
- **Colour becomes a choice.** Because colour only exists behind `--media-filter`, the whole app can be mono, 1-bit, negative, silhouette or full colour from one switch. The UI never clashes with an album cover, since it has no hue of its own.
- **Negative space is structural.** Windows have no fills or borders, so the black field shows between everything. The rules that stop short keep each window open on one side. The result feels like the reference's vast black space even at full app density.
- **The flowers carry identity.** Seeded, species-specific silhouettes give every playlist and artist a recognisable picture in mono, so the app stays scannable after removing colour, which is where most monochrome themes fail.

## 11. Integration notes (for the CSS/JS engineers)

- **Kept as is:**
  - Every id, class, data attribute, aria-label, role and text node.
  - All new text is in pseudo-elements: `> `, `Song:`, `Author:`, `type:`, `[`, `]`, `--`, `− ×`.
  - The other new text is in new aria-hidden spans: the `/time` path, `/quick_picks`, `/media`, `look_in.txt`, `.m3u` titles, the wordmark, the hue swatch, breadcrumbs.
- **New elements:**
  - Home readout (`.neo`, `canvas.neo__flora`, `dl.neo__info`) and `/time` window (`time.clock[data-clock]`).
  - The filter switcher (`.fsw`, `[data-filter-set]`).
  - `.hero__hue`, `canvas.hero__sprig`, `.mini-player__tint`, the petal canvas, and the two SVG filters.
- **Icons:** the sprite symbols keep their ids. Their paths become 16×16 bitmaps (`shape-rendering: crispEdges`, rendered at 16 or 32px). The mock builds them from row strings in `B = {…}` and can emit them as static paths.
- **Flora:** the mock's `Flora` object (exposed as `window.RiceFlora`) is the reference for `src/flora.js`. It provides `bloom`, `leaf`, `bud`, `loose`, `branch` and `SPECIES`, plus the cover painter `cover(ent)` (`pal()` + modes).
- **Watch:**
  - 12px DotGothic16 is slightly soft on Windows. Never go below 12.
  - SVG filters on very many images cost paint time. Cover `<img>`s are small, so this is fine in practice, but avoid filtering large scrolling backgrounds.
  - Dither is noisy below 32px. That is accepted, since it is a mode the viewer picks.
