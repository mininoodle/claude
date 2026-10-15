# Wavelength / terminal — DESIGN.md (binding restyle contract)

Status: binding. Four engineers implement this in parallel without talking to each other, so every shared name (token, class, data attribute, API) is fixed here. If something you need is missing, solve it inside your own files and report the gap; never rename anything defined here or in SPEC.md.

> This document was the working contract while the restyle was built. Paths under `tools/work/` point to scratch files from that session and are not part of the repository; `src/` holds the finished implementation.

- **Visual reference:** `design/mocks/terminal.html` (the winning mock; open with `?fx=dither|invert|color|cyano`). Its source is in `tools/work/terminal/mock/` (`mock.css`, `mock.js`, `flora.js`): port from there. Rationale: `design/mocks/terminal.md`.
- **User reference:** a screenshot the user shared, not included in the repository (a black screen, small white bitmap type, floating windows made of a hairline that stops short, a `- ×` pair and a `> /path` prompt, a white flowering branch beside a neofetch readout, `/time`, `/Media` with `Song:` / `Author:`, `look_in.txt` closed by a dashed rule, a lot of black space).
- **Grafts** from the other two mocks: `design/mocks/rice.html` (rice.md) and `design/mocks/garden.html` (garden.md). Garden's flower engine for the extra species is the inline `Flora` IIFE in `design/mocks/garden.html` (lines ~622–1200).
- **Helper:** `node tools/work/design-lead/px.js symbols|bayer|blossom|check` converts pixel grids to SVG paths and prints the Bayer data URIs and the blossom mask (section 4, 7).
- **Verified filter self-check:** `node tools/work/design-lead/make-fx-test.js` writes `dist/design-lead-fx.html` (the exact SVG defs of 4.4 with the static Bayer href, the window-chrome primitives, the tint clamps, the toast bullet, the exemplar icons). Screenshots of all six modes: `tools/shots/design-lead/fx-{mono,dither,invert,color,cyano,ink}.png`. It also shows the LCD colour fringe on the un-composited toast text that section 8.4 fixes.
- **SPEC.md** stays the functional contract. Where SPEC gives a *visual* value (colour, font, size, radius, shadow, gradient), DESIGN.md wins. Where SPEC gives *behaviour* (what happens on click, what a control does, the toast copy and offsets, the breakpoints, z-index order, the data attributes), SPEC wins. The only declared layout override of SPEC is the Home chips in the strip (3.6).
- **The mock is a look, not a contract.** Its class names and markup differ from this document in places; where they differ, DESIGN.md wins and the mock's names must not be introduced. Known pairs (mock → contract): `.logo__word` → `.topbar__word`; `.lib-row__gut` → `.lib-row::before`; `.pb-label` (real text) → pseudo labels on `.pb-text` (3.18); `.cursor` → `.search-pill__caret`; `.dialog--wide` → `.dialog--wide` added by `openDialog` only for Edit details (3.15); `.btn--primary` → `.pill--primary`. Never port a mock element that puts real text where this document uses CSS content.
- **Glyph coverage** (measured with `tools/work/design-lead/glyphs2.js` in Edge, DotGothic16 loaded): covered: `▷` (full width, 2ch), `•`, `·`, `×`, `…`, `─`, `│`, `_`, `>`, `~`, `#`, `!`, `花鳥風月`. **Not covered:** `▶`, `▾`, `▸`, `↗`, `℗`. So: `▾`/`▸` in this document always mean the existing pixel `i-chevron-down` / `i-chevron-right` icon, never a typed glyph; the `[↗]` expand control is a 16 px bordered box holding the pixel `i-expand` icon (3.18); `℗` stays existing content text and uses the system fallback (allowed: content, not decoration).

## 0. The direction in ten rules

1. One ground (`#000`), one ink (`#fff`), three greys. The UI never shows a hue except under the `color` and `cyano` filters.
2. Two pixel faces (amended by the fixer round, see the last Resolutions list): running text is VT323 at 20 px (body) and 18 px (meta), the terminal face whose i / l / 1 / I stay distinct at 1x; DotGothic16 is the display face at 32 and 48 px, the cover numerals and the CJK fallback (DotGothic16 merges i / l / 1 / I below 24 px). Weight is always 400. "Bold" is a 1 px text-shadow smear.
3. Every region is a **window**: a 1 px hairline that stops short at a per-window length, a `- ×` pair at the right end, a `> /path` prompt title. Windows have **no fill and no border**; black space shows between them.
4. Floating windows (menus, dialogs) are the only boxes: black fill, 1 px border, the same hairline head inside, and a hard 6 px offset shadow.
5. State is shape, never colour: hover = dark fill, current = `▷ ` + bitmap bold, playing = stepped meter, selected = inverted block, focus = 1 px dashed ring, pressed = inverted + 1 px shift, disabled = darkest grey.
6. Everything that carries colour (covers, artist images, entity colours, genre tiles, the old green accent, the avatar disc, the Liked gradient, the hero/home/mini/expanded tints) goes through **one filter variable**. `mono` is the default and is applied by CSS before first paint.
7. A terminal-style switcher (`filter: [mono] dither invert color cyano ink`) changes the filter; `color` lets colour through (and brings the green accent back).
8. Flowers everywhere, always white silhouettes with thin dark separations: the logo, every cover, the Home branch, the library sprig, hero sprigs, genre tiles, shelf sprays, empty states, the dialog sprig, the toast bullet, a falling-petal layer.
9. All decoration is CSS (`::before`/`::after`, `text-transform`, `attr()`) or a **new aria-hidden element**. No existing text node changes: the `textContent` of every existing element stays exactly as today. `innerText` may differ only (a) in letter case, from `text-transform`, and (b) by the text of new elements (readout, clock, `.fx__opt` labels, `.pb-vol-pct`, the compact filter menu).
10. Pixel crispness: font sizes 18/20 (VT323) and 32/48 (DotGothic16), 16 for CJK runs, icon sizes 16/32/48/64 only, integer positions, no blur, no gradients except inside media, no rounded corners except round artist covers.

---

## 1. Fonts and tokens (owner: shell, `src/styles.css` + `src/index.html`)

### 1.1 Font

`src/index.html` replaces the Figtree link (keep the preconnect line as is):

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&family=VT323&display=swap">
```

- Family `DotGothic16` (Google Fonts, OFL, one weight: 400). Latin glyphs are exactly half-width (0.5 em), so it sets as a monospace and `ch` is a real column unit. It also has JIS kanji, so `Contact: 花鳥風月` renders in the same pixels.
- Stack: `'DotGothic16', 'MS Gothic', 'Osaka-Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace` (now `--font-display`).
- **Amended (fixer round):** running text uses `--font: 'VT323', 'DotGothic16', …` (Google Fonts, OFL, monospace, 0.4 em advance). VT323 at 20 px has the same 8 px advance as DotGothic16 at 16 px, so every `ch` measure is unchanged; `--fs` is 20 px, `--fs-s` 18 px (7.2 px advance), line-heights unchanged (22 / 20). `.page-title--lg`, `.hero__title` and `.top-result__name` set `font-family: var(--font-display)`; the readout `Contact` value (`dd[lang=ja]`) uses DotGothic16 at `--fs-cjk` (16 px). Cover text (canvas) stays DotGothic16.
- `body { font-synthesis: none }` (no faux bold or italic). `b, strong, h1, h2, h3, h4 { font-weight: 400 }`. Remove every `font-weight` above 400 from app.css and player.css.
- Bitmap bold = `text-shadow: var(--bold)` (`1px 0 0 currentColor`). Use it only on: readout labels (`Host:`), `Song:` / `Author:` labels, the current / playing title (track rows, song rows, library name, card title, quick tile name, player title), hero title, inverted active labels.

| role | size / line-height | used for |
|---|---|---|
| display | 48 / 52 | hero title `title-96` and `title-72` (desktop and tablet) |
| title | 32 / 38 | hero `title-48` / `title-32`, all phone hero titles, `.page-title--lg`, `.top-result__name` |
| body | 16 / 22 (VT323 20 / 22 since the fixer round) | everything else: window titles, rows, buttons, menu items, chips, readout (desktop), toasts, dialog text |
| meta | 14 / 20 (VT323 18 / 20 since the fixer round) | sub lines, column heads, card subs, times, `[show all]`, `- ×`, tooltips, phone readout, `Song:`/`Author:` labels |

No DOM text below 14 px anywhere. Canvas text painted inside covers is at least 0.075 × the cover size and only on full-size covers (section 5.6). Text transform rule: only **fixed UI copy** is lowercased: headings, buttons, chips, navigation, eyebrows, menu heads and window titles are `text-transform: lowercase`; content (track, artist, album, playlist names, descriptions, toasts, dialog bodies, menu item labels) keeps its case. Elements that carry a name keep their case even inside a lowercased heading: `text-transform: none` on `.shelf--more .shelf__title` ("More by <artist>"), `.queue-section__title a` (the context link after "Next from:"), `.rp__title`, `.main-header__title`, `.hero__title`, `.top-result__name`. Durations, times and counts keep `font-variant-numeric: tabular-nums` (harmless; the face is monospaced anyway).

Crispness rules: line-heights from the table only (they centre the glyphs on whole pixels; the one exception is `.pb-time` at 14/16, 3.18); no fractional `letter-spacing`, no `transform: scale()` on text, no sub-pixel translate on text (hover "scale 1.04" from SPEC is dropped everywhere).

### 1.2 Tokens (`:root` in styles.css, complete)

```css
:root {
  color-scheme: dark;
  /* ---- ink: the only UI colours ---- */
  --bg: #000000;          /* ground: page and every window (windows are unfilled) */
  --fg: #ffffff;          /* 21:1   primary text, important rules, inverted blocks */
  --fg-2: #a3a3a3;        /* 8.3:1  secondary text, values, artists, descriptions */
  --fg-3: #757575;        /* 4.6:1  meta, labels, placeholders, brackets, dates */
  --fg-4: #3a3a3a;        /* 1.9:1  disabled controls, faint separators: NEVER information */
  --rule: #8c8c8c;        /* window hairlines, corner fragments, field boxes (3:1), ink-mode cover frame */
  --rule-dim: #333333;    /* dashed row/section rules: decoration only */
  --hover: #161616;       /* hover fill */
  --press: #262626;       /* open submenu parent, pressed rows */
  --sel-bg: var(--fg);    /* selection = inverted block */
  --sel-fg: var(--bg);
  --shadow-hard: #262626; /* 6px offset shadow of floating windows */
  --scrim-a: rgba(0,0,0,.9);
  --scrim-b: rgba(0,0,0,.6);   /* dialog / sheet backdrop: 2px checker of a and b */
  --cover-empty: #111111;      /* <img class="cover"> before its src arrives */

  /* ---- accent and signal colours follow the filter (section 4) ---- */
  --accent: var(--fg);
  --accent-hover: #d6d6d6;
  --accent-press: #a3a3a3;
  --on-accent: var(--bg);
  --danger: var(--fg);
  --verified: var(--fg);

  /* ---- SPEC §2 names, remapped (every existing rule keeps working) ---- */
  --bg-base: var(--bg);
  --bg-panel: var(--bg);
  --bg-elevated: var(--bg);
  --bg-menu: var(--bg);
  --bg-highlight: var(--press);
  --bg-tinted: var(--hover);
  --bg-tinted-strong: #1f1f1f;
  --bg-tinted-press: #0d0d0d;
  --fg-sub: var(--fg-2);
  --fg-muted: var(--fg-3);
  --border: var(--rule-dim);
  --liked-a: #450af5;          /* colour: only ever painted on a filtered layer */
  --liked-b: #c4efd9;
  --liked-hero: #5038a0;
  --avatar-bg: #e8115b;
  --shadow-cover: none;
  --shadow-menu: 6px 6px 0 var(--shadow-hard);
  --shadow-toast: none;
  --radius-panel: 0;
  --radius-card: 0;
  --radius-pill: 0;
  --selected: var(--sel-bg);
  --tile-hover: var(--hover);
  --overlay: rgba(0,0,0,.6);
  --backdrop: rgba(0,0,0,.75);
  --focus-ring: none;          /* focus is an outline now, see 1.3 */

  /* ---- type ---- */
  --font: 'DotGothic16', 'MS Gothic', 'Osaka-Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace;
  --fs-s: 14px;  --lh-s: 20px;
  --fs: 16px;    --lh: 22px;
  --fs-l: 32px;  --lh-l: 38px;
  --fs-xl: 48px; --lh-xl: 52px;
  --bold: 1px 0 0 currentColor;

  /* ---- window chrome ---- */
  --win-bar-h: 14px;
  --win-ctl-w: 34px;
  --dash: repeating-linear-gradient(90deg, var(--rule) 0 3px, transparent 3px 5px);
  --dash-dim: repeating-linear-gradient(90deg, var(--rule-dim) 0 3px, transparent 3px 5px);
  --corners: linear-gradient(var(--rule), var(--rule)) left bottom / 22px 1px no-repeat,
             linear-gradient(var(--rule), var(--rule)) right bottom / 30px 1px no-repeat;
  --blossom-mask: url("data:image/svg+xml,…");   /* px.js blossom: "CSS mask" line */
  --blossom-img: url("data:image/svg+xml,…");    /* px.js blossom: "#ffffff" line */

  /* ---- layout ---- */
  --gap: 16px;            /* column gap; also the resizer width */
  --gap-y: 10px;          /* row gap */
  --topbar-h: 48px;
  --strip-h: 44px;        /* .main-header (window head of #main); 40px on phone */
  --player-h: 92px;
  --sidebar-w: 288px;
  --sidebar-rail-w: 72px;
  --right-w: 300px;
  --bottom-nav-h: 56px;
  --mini-player-h: 72px;  /* phone only: 12 bar + 56 body + 4 progress */

  /* ---- media filter (section 4); these are the mono defaults ---- */
  --fx: grayscale(1) contrast(1.12) brightness(1.02);
  --fx-fine: var(--fx);
  --fx-tint: grayscale(1) brightness(.4);
  --fx-band: grayscale(1) brightness(.22);
}
@media (max-width: 767px) { :root { --strip-h: 40px; --win-bar-h: 12px; } }   /* --mini-player-h already assumes the 12px bar */
```

`--blossom-mask` and `--blossom-img` are the exact strings printed by `node tools/work/design-lead/px.js blossom` (13×12 pixel blossom). The invert block (1.4) swaps `--blossom-img` to the `#000000` line.

**Shared layout names** (fixed; styles.css sets them, app.css consumes them; never rename or drop them when rewriting the grid). In full mode styles.css leaves the `--rail-*` names unset and app.css uses the fallback written in its `var()`:

| name | full sidebar (fallback in app.css) | rail (desktop rail and tablet, set by styles.css) | consumers |
|---|---|---|---|
| `--_side` | `var(--sidebar-w)` (set on `#app`) | `var(--sidebar-rail-w)` | `#app` grid, the top bar grid (3.3) |
| `--rail-hide` | unset → `inline` / `flex` / `block` per rule | `none` | library labels, chips, filter, row text/end, `.lib-empty`, `.lib-sprig`, `.lib-row::before` |
| `--rail-cols` | `2ch 40px minmax(0,1fr) auto` | `48px` | `.lib-row` |
| `--rail-pad` | `0 6px` | `4px` | `.lib-row` |
| `--rail-just` | `space-between` (header) / `start` (rows) | `center` | `.lib-header`, `.lib-row` |
| `--rail-dir` | `row` | `column` | `.lib-header` |

### 1.3 Base additions (styles.css, after the verbatim SPEC reset)

```css
body { font: var(--fs)/var(--lh) var(--font); font-synthesis: none; background: var(--bg); color: var(--fg); }
b, strong, h1, h2, h3, h4 { font-weight: 400; }
button:disabled { color: var(--fg-4); }
:focus-visible { outline: 1px dashed var(--fg); outline-offset: 2px; box-shadow: none; }
::selection { background: var(--fg); color: var(--bg); }
input::placeholder, textarea::placeholder { color: var(--fg-3); }
input, textarea { caret-color: var(--fg); caret-shape: block; }
.flora { pointer-events: none; user-select: none; -webkit-user-drag: none; }
:root[data-filter="invert"] .flora:not(canvas) { filter: invert(1); }   /* white silhouettes become black ink; the petal canvas is excluded (it draws black itself, 5.7) */
.fx-defs { position: absolute; width: 0; height: 0; overflow: hidden; }   /* never display:none */
@media (prefers-reduced-motion: reduce) { #petals { display: none; } }
:root[data-motion="off"] #petals { display: none; }
```

### 1.4 Invert-mode token overrides (styles.css)

Invert is a full negative: the whole UI becomes black ink on white paper, the media become photographic negatives, the white silhouettes become black (`.flora` rule above).

```css
:root[data-filter="invert"] {
  color-scheme: light;
  --bg: #ffffff;  --fg: #000000;
  --fg-2: #595959;   /* 7.0:1 on white */
  --fg-3: #767676;   /* 4.5:1 on white */
  --fg-4: #c4c4c4;
  --rule: #737373;  --rule-dim: #cccccc;
  --hover: #ebebeb; --press: #d9d9d9;
  --shadow-hard: #d4d4d4;
  --scrim-a: rgba(255,255,255,.9); --scrim-b: rgba(255,255,255,.6);
  --cover-empty: #eeeeee;
  --accent-hover: #2b2b2b; --accent-press: #595959;
  --bg-tinted-strong: #e0e0e0; --bg-tinted-press: #f2f2f2;
  --overlay: rgba(255,255,255,.7); --backdrop: rgba(255,255,255,.75);
  --blossom-img: url("data:image/svg+xml,…");   /* px.js blossom: "#000000" line */
  --fx: grayscale(1) invert(1) contrast(1.1);
  --fx-fine: var(--fx);
  --fx-tint: grayscale(1) invert(1) contrast(.1) brightness(1.9);   /* output 0.855–1.0 for any input */
  --fx-band: grayscale(1) invert(1) contrast(.1) brightness(1.9);
}
```

Every tint/band layer falls back to **literal black** when no entity colour is set (`.home-head` `var(--home-tint, #000)`, the stripHTML default tint `#000000`, `var(--mini-color, #000)`, `var(--xp-color, #000)`), never to a flipping token such as `var(--bg)` / `var(--bg-panel)`: through `--fx-band` / `--fx-tint` black stays black in the dark modes and becomes white under invert, so an untinted page never shows a grey band.

(`--accent`, `--on-accent`, `--sel-*`, `--danger`, `--verified` and the SPEC names follow automatically because they are defined as `var()` of the flipped tokens on the same `:root`.)

Never implement invert with `filter: invert()` on `html`, `body`, `#app` or any ancestor of a fixed element: a filter on an ancestor turns it into the containing block of `#expanded-player`, the menu and the toasts.

### 1.5 Spacing and geometry

- Desktop `#app` padding `8px 16px 10px`; column gap `--gap` (16), row gap `--gap-y` (10). Panels have no radius and no background.
- Inside windows: title line 22 px; content starts 4 px below; page side padding in `#main` 16 px (desktop, tablet, phone).
- Rows: library 50 px, track rows 32 px (desktop), song/finder rows 48 px, quick tiles 30 px (desktop) / 46 px (phone), menu items 30 px (desktop) / 44 px (phone), phone track rows 56 px.
- Hit areas on phone are at least 44 px (padding or a transparent `::before`/`::after { content:""; position:absolute; inset: -Npx }` extender), even where the drawn control is smaller; on desktop every control's hit area is at least 24×24 (WCAG 2.5.8). Extenders (styles.css owns the generic ones):
  - the primitives `.icon-btn` and `.nav-btn` get `position: relative` in their base rule (plain class selectors, so an owner rule that positions one absolutely, such as `.lib-row__more`, still wins by source order); phone: `:is(.icon-btn, .nav-btn):not(.win__btn, .search-pill__clear, .search-field__clear, .finder-search__clear, .card__close)::before { content:""; position:absolute; inset:-6px }` (a pseudo-element rule only; `::before`, because `.icon-btn--dot` uses `::after`). Excluded: `.win__btn`, whose `::before` is the glyph and whose extender is `::after` (2.1); and the bracketed `[×]` clears, whose `::before`/`::after` draw the brackets: they reach the hit size with their own box (`min-width: 44px; min-height: 44px` on phone, glyph centred);
  - desktop: `.win__ctl .win__btn::after { content:""; position:absolute; inset:-5px }` (the 14 px `- ×` become 24 px targets); the bracketed clears (`.search-pill__clear`, `.finder-search__clear`, `.card__close`) and `.pb-cover__expand` reach 24×24 with their own box (`min-width: 24px; min-height: 24px`, 16 px glyph centred).

---

## 2. Window chrome

### 2.1 Primitives (styles.css; documented in COMPONENTS.md)

Markup (exact):

```html
<!-- decorative bar: rule + "- ×", hidden from AT -->
<div class="win__bar" aria-hidden="true" style="--rule-w:72%"></div>

<!-- live bar: rule + real buttons in the "- ×" slots (one or both may be live); always the LAST child of its window -->
<div class="win__bar win__bar--live" style="--rule-w:92%">
  <span class="win__ctl">
    <button type="button" class="win__btn win__btn--min" aria-label="Collapse Your Library"></button>
    <span class="win__btn win__btn--close" aria-hidden="true"></span>      <!-- decorative slot -->
  </span>
</div>

<!-- prompt title / path (new text lives in an attribute, so textContent/innerText never change) -->
<div class="win__title" aria-hidden="true" data-path="/quick_picks" data-meta="8 items"></div>
<span class="win__path" aria-hidden="true" data-path="/time"></span>
```

A *window* is any element with class `win` (or, for containers, the equivalent rules written by the owner) that has a `.win__bar` child. A **decorative** bar is the first child. A **live** bar is the **last** child of its window, so Tab reaches the header content (`Your Library`, the right-panel context link, the dialog body) before the `-` / `×` controls, matching the visual order (the bar is absolutely positioned, so the look is identical; WCAG 2.4.3).

```css
.win { position: relative; padding-top: var(--win-bar-h); }
.win__bar { position: absolute; left: 0; right: 0; top: 0; height: var(--win-bar-h); pointer-events: none; z-index: 1; }
.win__bar::before { content: ""; position: absolute; left: 0; top: calc(var(--win-bar-h) / 2);
  width: min(var(--rule-w, 84%), calc(100% - var(--win-ctl-w) - 12px)); border-top: 1px solid var(--rule); }
.win__bar::after { content: "-\2002\00d7"; position: absolute; right: 2px; top: 0; white-space: pre;
  font-size: var(--fs-s); line-height: var(--win-bar-h); color: var(--fg-2); }
.win__bar--live::after { content: none; }
.win__ctl { position: absolute; right: 0; top: 0; height: var(--win-bar-h); display: flex; align-items: center; gap: 6px; pointer-events: auto; }
.win__ctl .win__btn { position: relative; display: inline-flex; align-items: center; justify-content: center; width: auto; min-width: 14px;
  height: var(--win-bar-h); padding: 0 2px; border-radius: 0; background: none; color: var(--fg-2);
  font-size: var(--fs-s); line-height: var(--win-bar-h); transform: none; }
.win__ctl .win__btn:hover { color: var(--fg); background: none; }
.win__btn--min::before { content: "-"; }
.win__btn--close::before { content: "\00d7"; }
.win__ctl .win__btn > .icon { display: none; }           /* an existing icon button moved into the slot shows the glyph */
.win__ctl span.win__btn { pointer-events: none; }
.win__title, .win__path { display: block; min-height: var(--lh); line-height: var(--lh); color: var(--fg);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.win__path { display: inline-block; }
.win__title::before, .win__path::before { content: "> " attr(data-path); }
.win__title[data-meta]::after { content: attr(data-meta); float: right; color: var(--fg-3); font-size: var(--fs-s); }
.win--dashed { padding-bottom: 6px; }
.win--dashed::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 1px; background: var(--dash); }
.prompt::before { content: "> "; }                        /* for an existing heading used as a window title */
.win__ctl .win__btn::after { content: ""; position: absolute; inset: -5px; }                                      /* desktop: 24px hit area */
@media (max-width: 767px) { .win__ctl .win__btn::after { inset: -16px -8px; } }  /* phone: 44px tall hit area */
```

**Padding cascade.** `.win` lives in styles.css, which is inlined before player.css and app.css, so any owner rule with a `padding` shorthand on the same element silently removes the bar's space. Every owner that sets padding on a window writes `padding-top: calc(var(--win-bar-h) + Npx)` (or the shorthand with that first value). This applies to: `.lib-header`, `.main-header`, `.rp__head`, `.shelf`, `.playlist-finder`, `.rp-card`, `.win--table`, `.win--quick`, `.win--time`, `.win--filter`, `.search-win`, `#player-bar`. `.win`'s `position: relative` is intentionally overridden by sticky (`.lib-header`, `.main-header`, `.rp__head`) and fixed owners; the bar still anchors to them because sticky and fixed are positioned.

Rules:
- The rule always stops short: `--rule-w` is set inline per window (table 2.3), capped so it never reaches the controls.
- `- ×` is drawn in the font (`-` and `×`, U+00D7), 14 px, `--fg-2`. A live control is a real `<button>` with an `aria-label` and **no text node** (the glyph is `::before`), so the app tooltip shows its label and its `textContent` is empty. An existing icon button (`.rp__close`, `.dialog__close`) may be moved into a slot: keep all its classes, add `win__btn win__btn--close`; CSS hides its `<svg>` and shows the glyph.
- A window title is either an existing heading styled with `.prompt`-like CSS (`> your library`) or a new `aria-hidden` element whose text comes from `data-path` (and optional `data-meta`) via `attr()`.
- The **dashed rule** (`--dash`) closes a window when the reference does (`look_in.txt`, track list head, menu separators) and replaces solid underlines.
- **Corner fragments** (from the empty frame in the reference's `/Media` window): two short rules, 22 px at the bottom-left and 30 px at the bottom-right, drawn 6 px below a framed cover with `background: var(--corners)` on a `::after { position:absolute; left:0; right:0; bottom:-7px; height:1px }` of the cover's **unfiltered wrapper** (never of the `img`, see 3.0a): `.pb-cover::after` (player), `.hero__cover::after` (hero), `.rp__cover-frame::after` (right panel, new wrapper, 3.13), `.xp__cover::after` (expanded player). Each wrapper gets `position: relative`.

### 2.2 Containers → windows

| container | window | prompt title (all lowercase) | `- ×` |
|---|---|---|---|
| `#topbar` | chromeless status line (logo, home, search window, filter bar, avatar) | — | — |
| search window (inside `#topbar`) | `.search-win` (`win win--dashed`), closed by the dashed rule | `> look_in.txt` (new `.search-pill__prompt`) | decorative |
| `#sidebar` | head = `.lib-header` (sticky) | `> your library` (existing `.lib-title` text, `>` via CSS) | `-` **live** = collapse/expand the library (new `.lib-collapse` button, desktop ≥1024 only, label = `libTitleLabel()`); `×` decorative |
| `#main` | head = `.main-header` (sticky strip) | breadcrumb `~/home`, `~/playlist/late_night_drive` … (new `.main-header__path`) | decorative |
| `#right-panel` | head = `.rp__head` (sticky) | `> /now_playing` or `> /queue` (new `.win__path`), then the existing `.rp__title` (context name) | `-` decorative; `×` **live** = the existing `.rp__close` moved into the slot |
| `#player-bar` | `/media` window | `> /media` (new `.win__title`) | decorative |
| `#mini-player` | compact `/media` (bar only, no title line) | — (labels `Song:` / `Author:` carry it) | decorative |
| `#expanded-player` | full-screen `/media` | the existing eyebrow, prefixed `> ` by CSS (`> playing from playlist`) | decorative (both). The existing chevron `.xp-close` is the only close control; no `.xp-min` is added. |
| `#context-menu` | floating box with a hairline head | `> <target name>` (new `.menu-target`, `data-path` = track/entity name, or `opts`) | decorative |
| `.context-menu--sub` | same | `> <parent label, lowercased>` (e.g. `> add to playlist`) | decorative |
| `.dialog` | floating box with a hairline head | `> <title>` (existing `.dialog__title`, `>` via CSS) | `×` **live** = existing `.dialog__close` (only when `closeButton: true`) moved into the slot; otherwise both decorative |
| `.toast` | inverted status line, no chrome | — | — |
| `.tooltip` | 1 px box, no chrome | — | — |
| `#bottom-nav` | tab line: 1 px top `--rule` | — | — |

Nested windows inside `#main` / `#right-panel`: `/time`, `/quick_picks`, `/filter` (phone), every `.shelf` (`> made for you/`), the track list (`> late_night_drive.m3u`), the top result, the artist `About`, the right-panel cards (`> about the artist`, `> next in queue`), `.playlist-finder`. The Home **readout band has no chrome** (it floats on black exactly like the reference).

### 2.3 Rule lengths (`--rule-w`, set inline on each `.win__bar`)

| window | `--rule-w` |
|---|---|
| search (`look_in.txt`) | 62% |
| `#sidebar` | 92% |
| `#main` strip | 94% |
| `/time` | 72% |
| `/quick_picks` | 86% |
| shelves, cycling by index on the page (0,1,2,3…) | 74%, 58%, 80%, 66% |
| track list | 66% |
| `/filter` (phone) | 54% |
| `#right-panel` head / its cards | 88% / 70% |
| `#player-bar` | 100% (capped before the controls) |
| `#mini-player` | 80% |
| `#expanded-player` | 76% |
| context menu / submenu | 70% / 60% |
| dialog | 64% |

---

## 3. Components (keyed by existing class names)

Owners: `app.css` styles everything inside `#topbar #sidebar #main #right-panel #bottom-nav #context-menu #dialog-root #toast-root`; `player.css` everything inside `#player-bar #mini-player #expanded-player`; `styles.css` the primitives listed in 3.1. "New:" marks new elements (always `aria-hidden` unless they are new controls).

### 3.0 State vocabulary (applies to every list, tile, card, menu, chip)

| state | look (no colour needed) |
|---|---|
| hover / keyboard-focused menu item | `--hover` fill, text to `--fg`; any `--fg-3` text inside the filled area is lifted to `--fg-2` (keeps ≥4.5:1 on the fill). Menu items invert instead. |
| current (`.is-current`) | title gets `::before { content: "▷ " }` + `text-shadow: var(--bold)` + `color: var(--accent)` |
| playing (`.is-playing`) | the stepped 3-bar `.equaliser` in the track index column, the pause glyph on the play buttons of cards, quick tiles, the top result and the hero, a blinking pixel speaker on library rows; the current-title marker `▷ ` stays. **No checker fill, no background.** |
| selected (`.is-selected`) | inverted block: `background: var(--sel-bg)`, every descendant `color: var(--sel-fg)` (including `.is-current` titles and their `▷`, `.is-liked` / saved checks, equaliser bars, badges); covers get **no** outline (the inverted block is enough) |
| focus-visible | `outline: 1px dashed var(--fg); outline-offset: 2px` (rows: `outline-offset: -1px`); on a selected row `.is-selected:focus-visible { outline-color: var(--sel-fg); outline-offset: -3px }` so the ring is drawn inside the block |
| pressed (`:active`), toggled-on blocks | inverted + `transform: translate(1px,1px)` |
| toggle on (`.is-active` on shuffle, repeat, now-playing, queue, saved) | icon in `--accent` + a 4×2 px `--accent` bar centred under the icon |
| disabled | `--fg-4`, no hover |
| open route (`.lib-row.is-active`) | `>` in the row gutter, name `--fg` (no fill) |

**Precedence:** selected > current > hover. Inside `.is-selected` no state may paint `--accent`, `--fg` or `--hover` over the block; everything is `--sel-fg` on `--sel-bg`.

All hover/focus changes are instant (`transition: none`); reveals use `steps()` (section 8.3).

### 3.0a Rules for every owner: frames, flower sprites, grounds under bands

- **Never decorate a filtered `img.cover`.** A CSS filter applies to the element's own outline and box-shadow, and the SVG filters (dither, cyano, ink) clip to the border box, so an outline, box-shadow, positive-offset outline or `::after` on a filtered cover is posterised, inverted or cut away (and an `img` cannot hold `::after` at all). Frames, hover outlines and corner fragments go on the **unfiltered wrapper** (`.card__cover`, `.lib-row__cover`, `.hero__cover`, `.pb-cover`, `.xp__cover`, `.song-row__cover`, `.rp__cover-frame`) or on a new `aria-hidden` sibling. The only exception is the ink frame (4.5), an inset outline in a grey that survives the posterise. Bare covers (`.top-result` cover, `.track-row__cover`, quick tiles, menus) get no frame.
- **Flower sprites are lazy.** No render function calls `Flora.sprite` synchronously. Every flower image is rendered as `<img class="flora …" alt="" aria-hidden="true" width="W" height="H" data-flora="{json opts}">` **without `src`** (the attribute value is `esc(JSON.stringify(opts))`), and app.js paints it through the existing cover pump (`lazyCovers` / `pumpCovers`: 8 ms slices, near-view check, `display:none` skipped): the pump also collects `img[data-flora]:not([src])`, calls `Flora.sprite(JSON.parse(…))`, sets `src`, and removes the `img` when the result is `''`. When Flora is absent (`typeof window.Flora !== 'object'`) no flower `img` is rendered at all. After Home's first paint app.js pre-warms the 16 genre tile sprites with `requestIdleCallback` (fallback `setTimeout(…, 200)`), one sprite per idle callback.
- **No `--fg-3` over a band or tint.** Every container whose ground can be a filtered band or tint lifts its tertiary text: `.main-header, .hero, .actions, .readout, .home-side, .win--filter, #mini-player, .xp__top, .xp__text { --fg-3: var(--fg-2); --fg-muted: var(--fg-2); }` (both names: `--fg-muted` is resolved on `:root` and would not follow a local `--fg-3`; app.css writes the app selectors, player.css the player ones). This covers the breadcrumb dir `~/playlist/`, chip brackets in the strip, `# ` before the hero type, the xp eyebrow and placeholders in the inline filter.

### 3.1 Primitives (styles.css)

- **`.icon`** 16×16 (was 24); `.icon--sm` 16; `.icon--xs` 16 (small glyphs are drawn small inside the grid); `.icon--lg` 32; `shape-rendering: crispEdges`. Any CSS that resizes an icon must use 16, 32, 48 or 64.
- **`.icon-btn`** 32×32 square (phone: +6 px `::before` hit extender, 1.5), `--fg-2`; hover `--fg` + `--hover` fill; `:active` inverted + 1 px shift; `.is-active` `--accent`; `.icon-btn--dot.is-active::after` = 4×2 px `--accent` rect at `bottom: 2px`, centred; disabled `--fg-4`; `.icon-btn--lg` 40; `.icon-btn--round` = square with 1 px `--rule-dim` border.
- **`.play-btn`** square block, no radius: 32×32 (icon 16), `--accent` fill, `--on-accent` glyph; hover `--accent-hover`; `:active` 1 px shift; disabled `--fg-4` fill. `.play-btn--lg` 40×40 (icon 16), `.play-btn--xl` 64×64 (icon 32), `.play-btn--white` 32×32 (icon 16). Both play and pause icons stay in the DOM (SPEC).
- **`.pill`** bracket button: no border, `[` and `]` as `::before`/`::after` in `--fg-3` with 1ch gap, label `--fg` lowercase 16 px, height 28 px, padding 0 4px; hover `--hover` fill; `:active` inverted. `.pill--primary` = inverted block (no brackets), padding 0 10px, hover `--accent-hover` fill. `.pill--outline` = `.pill`. `.pill--sm` 14 px, height 24. Phone: min-height 44 (the drawn block stays 28 via `background-clip: content-box; padding-block: 8px`).
- **`.chip`** `[label]` lowercase 16 px `--fg-2`, height 24, brackets `--fg-3`; hover `--fg`; `[aria-pressed="true"]`, `.is-active` = inverted block without brackets (padding 0 6px). `.chip--icon` = `[×]` (the `i-close` glyph at 16 px). Phone: min-height 44 with `background-clip: content-box` (inside `.main-header` the drawn box stays 24 px and padding with matching negative margins gives the 44 px, 3.6).
- **`.cover`** radius 0, `object-fit: cover`, `background: var(--cover-empty)`, `filter: var(--fx)`. `.cover--round` 50%; `.cover--24` stays round too (it is the artist avatar in the album hero meta and has no `cover--round` class). Fixed sizes keep their names; `.cover--24/32/40/48` use `filter: var(--fx-fine)`. Never an outline, box-shadow or `::after` on a cover (3.0a), except the ink frame: `:root[data-filter="ink"] .cover { outline: 1px solid var(--rule); outline-offset: -1px; }` (`#8c8c8c` posterises to the 0.42 grey and stays visible; `--rule-dim` would posterise to black).
- **`.equaliser`** three 2 px bars, 2 px gap, 12 px tall, `--accent`, `animation: eq .9s steps(4) infinite` with the three existing delays; reduced motion: static at 60/100/40%.
- **`.eyebrow`** 14 px, lowercase, `letter-spacing: 0`, `--fg-3`.
- **`.avatar`** 24×24 square, `--fg` letter 16 px, 1 px `--rule` border, a `::before` tint layer (`background: var(--avatar-bg); filter: var(--fx-tint); position:absolute; inset:0; z-index:-1`; the avatar gets `position:relative; isolation:isolate`). `.avatar--24` 20×20, 14 px.
- **`.text-link`** 14 px `--fg-2` lowercase, hover `--fg` + underline (`text-underline-offset: 3px`). **`.text-btn`** = bracket button like `.pill` (`[ cancel ]`, `[ refresh ]`). `.link:hover` underline.
- **`.badge-e`** `--fg-2`; **`.badge-verified`** `--verified`.
- `.truncate`, `.clamp-2`, `.clamp-3`, `.sr-only`, `.tabular` unchanged.
- **Scrollbars** (replace SPEC §2 rules for `#sidebar, #main, #right-panel, #expanded-player, .context-menu`): `scrollbar-width: thin; scrollbar-color: var(--fg-4) transparent`, hover `var(--rule) transparent`; WebKit: width 6px, track transparent, thumb square (`border:0; border-radius:0; background: var(--fg-4)`), hover thumb `var(--rule)`. `#main` is the only vertical scroller of the content; no element inside `#main` gets `overflow-y: auto`.

### 3.2 Grid and containers (styles.css)

```css
.app { gap: var(--gap-y) var(--gap); padding: 8px 16px 10px; position: relative; z-index: 1; }
#sidebar, #main, #right-panel { background: transparent; border-radius: 0; }
#topbar { background: transparent; }
#player-bar { background: var(--bg); }   /* opaque: petals pass only through empty space, never behind its text */
#topbar, #player-bar, #mini-player, #bottom-nav { will-change: transform; }   /* grayscale AA: no LCD colour fringes */
#petals { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; }
.resizer::after { background: var(--rule); }
```

- `#app` gets **no** `transform`, `filter`, `will-change`, `contain` or `backdrop-filter` (it contains the fixed `#expanded-player`). `#main` already has `container-type: inline-size` (layout containment): never place a `position: fixed` element inside `#main`, `#topbar`, `#player-bar`, `#mini-player` or `#bottom-nav` (verified today: none of them holds one). `#context-menu`, `#dialog-root` and `#toast-root` are body-level; the single `.tooltip` lives **inside `#toast-root`** (SPEC 8.7) and is `position: fixed` in viewport coordinates. Therefore `#toast-root`, `#dialog-root`, `#context-menu`'s ancestors and `body` never get `transform`, `filter`, `will-change`, `contain` or `backdrop-filter` (any of them would make `#toast-root` the containing block of the tooltip and push every tooltip off-screen). `will-change` goes on the fixed elements themselves (`.toast`, `.tooltip`, `.context-menu`, `.dialog`), which does not change their own positioning.
- Breakpoint rules of SPEC §10 stay; values change only: desktop grid rows `var(--topbar-h) minmax(0,1fr) var(--player-h)`; phone `#bottom-nav` background `var(--bg)` with `border-top: 1px solid var(--rule)`; phone `#mini-player` keeps `display:block`.

### 3.3 Top bar (`#topbar`, app)

Layout: grid `[left: var(--_side)] [center: minmax(0,1fr)] [right: auto]`, 48 px tall, columns aligned to the sidebar column.

- **Logo** `.topbar__logo` 40×40 transparent, `i-logo` (pixel blossom) at 32 px, `--fg`. New sibling `<span class="topbar__word" aria-hidden="true"></span>` after the button: `::before { content: "wavelength" }`, `::after { content: "_"; animation: blink 1.06s steps(1) infinite }`, 16 px `--fg`. Hidden on tablet.
- **Home** `.round-btn.topbar__home` → 32×32 square, `--fg-2`, hover `--hover`; `.is-active` `--fg` + filled icon (existing `i-home-filled` swap).
- **Search window.** New wrapper `<div class="search-win win win--dashed">` around the existing `.search-pill`, with a decorative `.win__bar` (`--rule-w:62%`) as its first child. Inside `.search-pill` (DOM order): new `<span class="search-pill__prompt" aria-hidden="true" data-path="look_in.txt"></span>` (`::before { content: "> " attr(data-path) }`, `--fg`, margin-right 1ch), the existing `i-search` icon (hidden: `display:none`), the existing input, new `<span class="search-pill__caret" aria-hidden="true"></span>` (`::before { content: "_" }`, blinking, absolutely placed over the input's 1ch left padding), the existing clear, divider (hidden) and browse.
  - `.search-pill`: no fill, no border, no radius, height 28, `padding-left: 0`; `.search-pill__input` 16 px `--fg`, `padding-left: 1ch` (the caret slot), placeholder `--fg-3`. The dashed closing rule (from `.win--dashed`) brightens to a solid `--fg` 1 px rule on `:focus-within`.
  - The `_` caret shows only when the field is empty and unfocused: `.search-pill:focus-within .search-pill__caret, .search-pill__input:not(:placeholder-shown) ~ .search-pill__caret { display:none }` (the caret follows the input in the DOM so the `~` selector works). Its position never depends on the placeholder length.
  - Clear `[×]` (16 px glyph, box ≥ 24×24); browse `i-browse` 16 px; `.search-pill__browse.is-active` `--fg`.
  - `.search-pill__input { min-width: 200px }`. The prompt shortens to the bare `>` whenever the search window itself is narrow, independent of the viewport and of the dragged sidebar width: `.search-win { container-type: inline-size; flex: 1 1 0; min-width: 0 }` and `@container (max-width: 400px) { .search-pill__prompt::before { content: ">" } }` (the path stays in `data-path` only; `> look_in.txt` costs 120 px, the clear/browse/gaps 64 px, so at 400 px the input still gets ≥ 200 px either way).
- **Filter bar** (new, section 4.6) and the **avatar** `.avatar-btn` (32×32, transparent, contains `.avatar`) at the right, gap 16.
- **Width budget** (the right column is `auto`; the left column is `var(--_side)`, 288 by default and up to 420 when dragged): the radiogroup is ≈ 280 px, its `filter:` label 72, petals 32, avatar 32, gaps 32. Three tiers by viewport width: **≥ 1440 px** radiogroup with label (right ≈ 450); **1280–1439 px** radiogroup without `.fx__label` (right ≈ 376); **< 1280 px** (small desktop and tablet) the top-bar radiogroup is `display: none` and the compact switcher `.fx-menu-btn` (4.6) shows instead (right ≈ 176). Worst cases (sidebar dragged to 420): 1440 → input ≈ 280 px with the full prompt; 1280 → ≈ 290 px with the bare prompt (≈ 330 px with the full prompt at the default 288 sidebar); 1024 → ≈ 236 px; tablet 768 (rail) → ≈ 230 px with the full prompt. Never hide `.topbar__home`.

### 3.4 Library (`#sidebar`, app)

- `.lib-header` (sticky, `background: var(--bg)`, `will-change: transform`, `padding: calc(var(--win-bar-h) + 6px) 16px 8px`) becomes the window head: add class `win`, the live bar (section 2.2) as its **last** child. `.lib-title`: in full mode the icon is hidden and the label renders `> your library` (`.lib-title span::before { content: "> " }`, lowercase, 16 px `--fg`); in rail mode (desktop rail and tablet) the label hides (existing `--rail-hide`) and the pixel `i-library-filled` icon shows; the bar's `.win__ctl` is hidden in rail mode. `.lib-add` → `+` icon button.
- `.lib-chips` → `[playlists] [artists] [albums]` chips; `.lib-chip-clear` → `[×]`.
- `.lib-filter`: search icon button, `.lib-filter__input.is-open` = prompt field (`>` + input, dashed underline, 190 px); `.lib-sort` → `recents` lowercase `--fg-2` followed by the pixel `i-chevron-down` icon (no typed `▾`).
- New (optional) column head row is not added (keep the list clean).
- `.lib-row`: grid `[2ch gutter] [40px cover] [minmax(0,1fr) text] [auto end]`, height 50, padding 0 6px, no radius (update the `--rail-cols` default and `.page--library .lib-row` to this template; in rail mode `--rail-cols` stays `48px` and `.lib-row::before` is `display:none`). The gutter is `.lib-row::before` (a grid item) with `content: ""`; `:hover` and `.is-active` set it to `">"` in `--fg`. Cover 40×40 (`.cover--48` inside a row is resized to 40; `filter: var(--fx-fine)`); round for artists. `.name` 16 px `--fg`; `.sub` 14 px `--fg-3` (keeps case), the pin icon in `--accent`. `.is-current .name` → accent + bitmap bold (no `▷`). `.lib-row__end`: the `i-speaker` (pixel) shows only when `.is-playing`, `--accent`, `animation: blink 1.06s steps(1) infinite` (static under reduced motion). `.lib-row__play` overlay on the cover: `--overlay` + `--fg` pixel play/pause 16 px. `.lib-row__more` shows on hover (16 px dots). Hover fill `--hover`; selected/active rows have **no fill**.
- `.lib-empty` → seedling art (lazy `img.flora`, 3.0a, opts `{ kind:'seedling', w:96, h:72 }`) above `strong` (16 px `--fg`) and text (14 px `--fg-3`).
- New: `<div class="lib-sprig" aria-hidden="true"><img class="flora" alt="" width="260" height="150" data-flora="…"></div>` after the list (lazy, opts `{ kind:'sprig', species:'sakura', seed:'lib', w:260, h:150 }`, anchored bottom-left); `#sidebar` is a flex column so `margin-top: auto` puts it at the bottom when the list is short. Hidden in rail mode and on the phone library route.
- Rail mode (72 px): bar rule only, covers 40 px centred, everything else hidden as today.

### 3.5 `#main` window head (`.main-header`, app)

- Height `var(--strip-h)`, `background: var(--bg)` (opaque), `will-change: transform`, class `win` added, `padding-top: var(--win-bar-h)` (no other vertical padding), decorative bar (`--rule-w:94%`) first. Below the bar one 22 px line: `.main-header__nav` (back/forward `.nav-btn` = 24×24 squares, pixel chevrons, `--fg-2`, hover `--fg` + `--hover`, disabled `--fg-4`, no circle; phone hit extender per 1.5), then new `<span class="main-header__path" aria-hidden="true" data-dir="~/playlist/" data-leaf="late_night_drive"></span>` (`::before { content: attr(data-dir); color: var(--fg-3) }`, lifted to `--fg-2` by 3.0a; `::after { content: attr(data-leaf); color: var(--fg) }`; `min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis`), then `.main-header__ctx` (when the hero title has scrolled away: 32 px play block + `.main-header__title` 16 px, the path hides while ctx is visible), then `.main-header__end` (on Home: the home chips, see 3.6).
- The SPEC tint cross-fade is kept but filtered: `.main-header::before { background: var(--strip-tint); filter: var(--fx-band); opacity: var(--strip-opacity) }` over the black base. `stripHTML`'s default tint becomes the literal `'#000000'` (was `'var(--bg-panel)'`, which flips to white under invert and would band grey; 1.4).
- Breadcrumb by route (slug = lowercase, accents stripped, non `[a-z0-9]` runs → `_`, trimmed, max 32 chars, **max 20 chars on phone**). While the user types, `render()` replaces only `.search-results` (the partial path); that path also updates the existing `.main-header__path`'s `data-dir` / `data-leaf`, so the breadcrumb never goes stale. Routes: home `~/` + `home` (the path is hidden on Home on phone, 3.6); search `~/` + `search` or `~/search/` + slug(query); playlist `~/playlist/` + slug(name); user playlist `~/you/` + slug(name); album `~/album/`; artist `~/artist/`; liked `~/` + `liked_songs`; genre `~/genre/`; section `~/home/` + id with `-`→`_`; queue `~/` + `queue`; library `~/` + `library`.
- `.track-table__head` sticks at `top: var(--strip-h)`; app.js sets `state.stripHeight` from the measured `.main-header` height (fallback 44 / 40) instead of the 64 / 48 constants.

### 3.6 Home (app)

Desktop/tablet (container ≥ 820 px): `.page--home` is a grid `minmax(0,1fr) minmax(320px,404px)`, gap `12px 24px`, `align-items: start`; shelves span both columns. Below 820 px container width (right panel open, tablet) it is one column: readout band, `/time`, `/quick_picks`, shelves.

- **Chips** `.chips--home` move into `.main-header__end` (desktop and phone); on phone the existing `.chips__avatar` is their first child (SPEC: avatar beside the chips). **This overrides SPEC 8.3's "nothing extra appears on Home" in the strip (layout only; chip behaviour, labels and the Podcasts toast are unchanged; the chips stay inside `#main`, so `#main .chip` still finds them).** Inside `.main-header` chips keep their drawn 24 px box so the strip stays `--strip-h` tall; on phone they reach 44 px with padding that does not take layout space (their `::before`/`::after` are the brackets, so no pseudo extender): `.main-header .chip { box-sizing: border-box; height: 44px; min-height: 0; padding-block: 10px; margin-block: -10px; background-clip: content-box }` (the inverted `[aria-pressed="true"]` fill stays 24 px tall; `.main-header` must not clip it: no `overflow: hidden` on the strip). On phone the `~/home` path is hidden on Home (app.js adds the new class `main-header--home` to the Home strip; phone: `.main-header--home .main-header__path { display: none }`), which leaves back/forward + avatar + `[all] [music] [podcasts]` ≈ 300 px in the 358 px row.
- **Readout band** (new, section 6.1): column 1, row 1, no chrome.
- **`.home-side`** (new wrapper, column 2): `/time` window (6.2) then `/quick_picks` window.
- **`/quick_picks`** (new wrapper `<div class="win win--quick">` + decorative bar 86% + `<div class="win__title" aria-hidden="true" data-path="/quick_picks"></div>`) around the existing `.quick-grid`: 2 columns × 4 rows, gap `4px 10px`. `.quick-tile`: grid `30px minmax(0,1fr) auto`, height 30, no fill, no radius; cover 30×30 (`--fx-fine`); `.quick-tile__name` 16 px one line; `.play-btn` 24×24 block, `visibility: hidden` until hover / focus-within / `.is-playing`. Hover `--hover`. `.is-current` name: `▷ ` + bold + accent. The `--home-tint` hover behaviour stays.
- **`.home-head`** stays as the filtered band: `background-color: var(--home-tint, #000); filter: var(--fx-band); mask-image: linear-gradient(#000, transparent); height: 260px` (literal black fallback, 1.4). The readout, `.home-side` and the phone `/filter` window sit on it, so they carry the `--fg-3` lift of 3.0a.
- **Shelves** (see 3.7), one window each.
- **Phone** (< 768 px) stack: strip (back/forward + avatar + chips; no path) → readout band (branch 128×156 + 14/19 px readout, the two `--opt` rows hidden) → `/time` → `/filter` window (6.6) → `/quick_picks` (2 columns, 46 px tiles, 46 px covers, names 14 px `clamp-2`, play button hidden) → shelves scrolling horizontally.

### 3.7 Shelves and cards (app)

- **`.shelf`**: add class `win`, a decorative bar as the first child (`--rule-w` cycles 74/58/80/66% by the shelf's index in the page), margin-bottom 18 px. `.shelf__head` height 24: `.shelf__title` 16 px lowercase `--fg`, `::before { content: "> " }`, `::after { content: "/"; color: var(--fg-3) }`, hover underline. `.shelf__all` 14 px `--fg-3` lowercase `[show all]` (brackets via pseudo), hover `--fg`. Same treatment for `h2.shelf__title` (no link).
- **`.card-grid`** `repeat(auto-fill, minmax(128px, 1fr))`, gap 16; `.card-grid--row` keeps the one-row clamp (app.js `clampShelfRows`).
- **Shelf spray** (new, graft): only in grid mode (`cols > 0`; never on phone flex rows), when a `.card-grid--row` has fewer `.card`s than columns, `clampShelfRows` appends one `<div class="card-grid__spray" aria-hidden="true"><img class="flora" alt="" data-flora="…"></div>` (never `.card`, never focusable) that fills the first empty slot. The sprite is drawn at a **fixed bucket** so resizing never redraws: bucket = the smallest of 128 / 160 / 192 px that is ≥ the slot width (192 when wider), opts `{ kind:'spray', species:'sakura', seed:'spray:'+shelfId, w:bucket, h:bucket }` (lazy, 3.0a); CSS scales it: `width: 100%; height: auto; aspect-ratio: 1; object-fit: contain; object-position: left bottom`, inside the slot (never clipped). If the existing spray already has the same bucket, `clampShelfRows` leaves it untouched (no new `data-flora`, no repaint). Remove it when the grid is full.
- **`.card`**: no fill, padding 0 0 4px, no radius. `.card__cover` (the unfiltered wrapper div) square, no shadow; hover / focus-within: `outline: 1px solid var(--fg); outline-offset: 2px` on `.card__cover`, never on its `img`. `.play-btn` 32×32 block at the cover's bottom-right corner (inside), hidden until hover / focus-within / `.is-playing`, appears with `steps(2)` (8 px → 0). `.card__title` 16 px one line; `.card__sub` 14 px `--fg-3` `clamp-2`. `.is-current .card__title`: `▷ ` + bold + accent. `.card--round` round cover and round outline. `.card__close` (recent searches) = `[×]` (16 px glyph, box ≥ 24×24, 1.5) at the cover's top-right, `--bg` fill, shown on hover.
- Phone: shelves scroll horizontally (SPEC), cards 132 px, play button hidden.

### 3.8 Search (app)

- **Browse:** `.browse-title` = `> browse all/`. `.browse-grid` `repeat(auto-fill, minmax(160px,1fr))`, gap 16 (phone 2 columns, gap 12).
- **`.browse-card`** square, no radius, `isolation: isolate; overflow: hidden`:
  - `::before` colour field: `position:absolute; inset:0; z-index:-1; background: var(--browse-color); filter: var(--fx)`.
  - app.js wraps the name text node in `<span class="browse-card__name">` (button `textContent` unchanged): black label (`background: var(--bg); color: var(--fg)`), 16 px, padding `2px 6px`, top-left at 10 px, keeps case.
  - New `<img class="browse-card__flora flora" alt="" aria-hidden="true" data-flora="…">` **after** the existing cover img: the genre species (5.3), lazy (3.0a) with opts `{ kind:'tile', species, seed: genreId, w:120, h:120 }` (pre-warmed after Home's first paint, so Browse usually finds them cached), absolutely at the bottom-right, 75% of the tile, growing from the corner.
  - The existing rotated `.cover` is hidden (`display:none`; the lazy painter skips hidden covers).
  - Hover: `outline: 1px solid var(--fg); outline-offset: 2px`. Name stays readable under every filter because it sits on its own black label.
- **Recent searches** shelf as 3.7; `.search-clear-recent` = `[ clear recent searches ]`.
- **Results:** `.search-chips` `[all] [songs] …`. `.search-top` two columns (one on phone). `.search-col__title` = `> top result/`, `> songs/`. `.top-result`: no fill, 1 px `--rule-dim` box, padding 16, hover `--hover` fill; cover 92 (`cover--92`, round for artists); `.top-result__name` 32/38 one line; `.top-result__meta` 14 px `--fg-2`; `.type-pill` = `[artist]` lowercase `--fg-2` (brackets `--fg-3`); `.play-btn` 40 block at the bottom-right on hover. `.song-list` rows (3.11).
- **No results:** `.no-results` = twig art (5.5) + `.no-results__title` 16 px `--fg` + `.no-results__text` 14 px `--fg-3`, centred, max-width 40ch.
- **Phone search header** `.search-header` (sticky, `--bg`, `will-change: transform`): `.search-header__title` = `> search` 16 px lowercase; `.search-field` = prompt field: no fill, height 44, `::before { content: ">" }`, the existing icon hidden, input 16 px `--fg`, placeholder `--fg-3`, dashed bottom rule (solid `--fg` on focus), clear `[×]` 44 px hit area.

### 3.9 Heroes and the action bar (app)

- **`.page--hero`**: `position: relative`. The hero no longer slides under the strip (`margin: 0`, no negative top margin).
- **`.hero-band`** (existing element): a very dark filtered fade, never a filled panel: `position:absolute; left:-16px; right:-16px; top:0; height:260px; z-index:-1; background: var(--hero-color); filter: var(--fx-band); mask-image: linear-gradient(#000 0, transparent 100%)`. Liked uses `--liked-hero` (existing class). In the dark modes its brightest possible value is `#383838` (0.22) at the very top, fading to black; under invert it is never darker than `#dadada` (0.855).
- **`.hero`**: flex, `align-items: flex-end`, gap 22, padding `16px 176px 16px 0` desktop / `16px 156px 16px 0` tablet (the right padding reserves the sprig; `0` wherever the sprig is hidden or on phone). `.hero__cover` 168×168 (tablet 148, phone 150 centred), no shadow, corner fragments on `.hero__cover::after` (the wrapper div, 2.1). `.hero__cover--round` round. `.hero__cover-edit` (user playlists): `--overlay` fill, pixel `i-edit` 32 + `edit details` 16 px lowercase, shown on hover/focus.
- **`.hero__type`** 16 px `--fg-2` lowercase, `::before { content: "# "; color: var(--fg-3) }`; verified artists show the pixel `i-verified` 16 px in `--verified`.
- **`.hero__title`**: weight 400, `letter-spacing: 0`, `overflow-wrap: anywhere`, `-webkit-line-clamp: 2` (3 for 32 px), `text-shadow: var(--bold)` only at 32 px (48 px is already heavy). Size map: desktop/tablet `title-96` → 48/52, `title-72` → 48/52, `title-48` → 32/38, `title-32` → 32/38 (clamp 3); container < 640 px: `title-96/72` → 32/38; phone: all 32/38 (clamp 2, `title-32` clamp 3). No 72/84/96 px anywhere.
- **`.hero__desc`** 16 px `--fg-2` `clamp-2`. **`.hero__meta`** 14/20 `--fg-2`, `b`/`a` `--fg`, the avatar/`cover--24` 20 px. `.hero__listeners` 16 px `--fg`.
- **Hero sprig** (new, graft): `<img class="hero__sprig flora" alt="" aria-hidden="true" data-flora="…">` placed in `.page--hero` **after** `.hero-band` (never inside `.hero`, so `.hero img` stays the cover). Sized to fit inside the hero, never below it: `position:absolute; right:0; top:8px`, **160×176 desktop, 140×156 tablet** (the hero is at least 200 / 180 px tall: 16 + cover + 16), hidden below 640 px container width on desktop; phone 88×120 at `right:0; top:8px` (beside the centred cover). Lazy (3.0a) with opts `{ kind:'sprig', species, seed:'hero:'+id, w, h, anchor:'topright', angle: π/2 + .35 }` (a sparse sprig hanging in from the top-right; never over the title, meta or action bar). Species: `Catalog.coverSpecies(entity)` for playlists, albums, artists and Liked (`coverSpecies('liked')` → `sakura`; moonflower for Late Night Drive); user playlists (`plu_*`, which data.js cannot resolve) use `coverSpecies` of their first track's album, or `ume` when empty; genre pages use `Flora.speciesFor(genreId)`.
- **`.hero--genre`**: no cover; padding `32px 176px 24px 0` (tablet `… 156px …`), `min-height: 200px` desktop / `180px` tablet / `136px` phone with `box-sizing: border-box` (content stays at the bottom via `align-items: flex-end`), so the same sprig size fits without reaching the first shelf; filtered band uses the genre colour at full height; the sprig is the genre species at the standard size.
- **`.actions`**: `position: relative; z-index: 1` (always above any decoration), padding `6px 0 12px`, gap 12, row-gap 12. `.play-btn--lg` 40 block. `.actions__shuffle` / `__save` / `__download` / `__more` are 32×32 icon buttons with **16 px glyphs** (app.css resizes `.icon--lg` inside `.actions` to 16). Saved = pixel `i-check-circle` in `--accent`; `.actions__follow` = `[ follow ]` / `[ following ]` (following: inverted block). `.actions__right`: filter button + `.inline-filter` (prompt field: `>` + input 16 px, dashed underline, `width: min(200px, 40cqi)` when open) + `.view-toggle` (`list` + its existing pixel `i-chevron-down` icon, lowercase `--fg-2`). Prompt fields (`.inline-filter`, and likewise `.lib-filter__input`, `.finder-search`, `.search-field`): the old `outline: none` on their inputs stays, and `:focus-within` turns the dashed underline into a solid 1 px `--fg` line (their only focus indicator).
- **Phone**: hero stacks (SPEC); type line hidden except artists; actions: play block moves to the right (`order`), right group hidden (SPEC).

### 3.10 Track table (app)

The table is a **file listing**: one 32 px line per track, aligned columns, a dashed head rule.

- **Window**: app.js wraps the table: `<div class="win win--table"><div class="win__bar" aria-hidden="true" style="--rule-w:66%"></div><div class="win__title" aria-hidden="true" data-path="late_night_drive.m3u" data-meta="40 files"></div>` + the existing `.track-table` + `</div>`. File name = slug(context name) + `.m3u` (Liked: `liked_songs.m3u`, artist popular: `popular.m3u`, genre: `top_songs.m3u`, search songs: `songs.m3u`). Queue sections and right-panel lists are not wrapped. `data-meta` = `N files` where N is the number of rows **currently rendered** (artist Popular: `5 files`, then `10 files` after `[see more]`).
- **Columns** with named grid lines (every variant defines every name; absent columns collapse onto the next line, so header placement is uniform). The rows' children `.track-row__main`, `.track-row__text`, `.track-row__end` get `display: contents`, so index, cover, title, artist, (artist-col), album/plays, date, like, duration, more become direct grid items in DOM order:

```css
.track-table { --cols: [index] 4ch [cover] 24px [title] minmax(0,1.45fr) [artist] minmax(0,1fr) [album plays] minmax(0,1fr) [date] 13ch [like] 24px [dur] 6ch [more] 24px [end]; }
.track-table--album   { --cols: [index] 4ch [cover title] minmax(0,1.6fr) [artist] minmax(0,1fr) [album plays] 14ch [date like] 24px [dur] 6ch [more] 24px [end]; }
.track-table--popular { --cols: [index] 4ch [cover] 24px [title] minmax(0,1.6fr) [artist] minmax(0,1fr) [album plays] 14ch [date like] 24px [dur] 6ch [more] 24px [end]; }
.track-table--songs, .track-table--queue { --cols: [index] 4ch [cover] 24px [title] minmax(0,1.45fr) [artist] minmax(0,1fr) [album plays] minmax(0,1fr) [date like] 24px [dur] 6ch [more] 24px [end]; }
.track-table--compact { --cols: [index] 4ch [cover title] minmax(0,1.45fr) [artist] minmax(0,1fr) [album plays] minmax(0,1fr) [date] 13ch [like] 24px [dur] 6ch [more] 24px [end]; }
/* compact hides .track-row__cover and .track-row__artist and shows .track-row__artist-col (existing rules) */
.track-table__head, .track-row { display: grid; grid-template-columns: var(--cols); column-gap: 12px; }
@container (max-width: 760px) {   /* drop the date column (SPEC) */
  .track-row__date, .cell--date { display: none; }
  /* only the default and compact variants have a 13ch date track; album, popular, songs and queue already merge [date like] */
  .track-table:not(.track-table--album):not(.track-table--popular):not(.track-table--songs):not(.track-table--queue):not(.track-table--compact)
                        { --cols: [index] 4ch [cover] 24px [title] minmax(0,1.45fr) [artist] minmax(0,1fr) [album plays] minmax(0,1fr) [date like] 24px [dur] 6ch [more] 24px [end]; }
  .track-table--compact { --cols: [index] 4ch [cover title] minmax(0,1.45fr) [artist] minmax(0,1fr) [album plays] minmax(0,1fr) [date like] 24px [dur] 6ch [more] 24px [end]; }
}
```

- **Head** `.track-table__head`: height 28, 14 px `--fg-3` lowercase, `border-bottom: 0; background: var(--dash) left bottom / 100% 1px no-repeat; background-color: var(--bg)` (always opaque, so petals never pass behind the column names, 8.3), `margin-bottom: 4px`; `.is-stuck` adds `will-change: transform` (keep the dash). app.js adds classes to the existing header cells: `cell--index` (exists), `cell--title`, `cell--artist` (the compact "Artist" cell), `cell--album`, `cell--plays`, `cell--date` (exists), `cell--dur` (exists), and inserts one new `<span class="track-table__artist-head" aria-hidden="true"></span>` in non-compact tables (text via `::before { content: "artist" }`, no role, and deliberately **no `.cell` class**, so `#main .track-table__head .cell` queries in the regression suite see the same list as before). Placement: `.cell--index{grid-column:index/cover} .cell--title{grid-column:cover/artist} .cell--artist,.track-table__artist-head{grid-column:artist/album} .cell--album,.cell--plays{grid-column:album/date} .cell--date{grid-column:date/like} .cell--dur{grid-column:dur/more}`. Index and duration heads right-aligned; the clock icon 16 px.
- **Row** `.track-row`: height 32, padding `0 8px 0 4px`, no radius, 16 px. `.track-row__index` 4ch right-aligned `--fg-3` (`.track-row__num`), `.equaliser` and `.track-row__play` keep the SPEC show/hide logic. `.track-row__cover` 24×24 (`--fx-fine`). `.track-row__title` `--fg`. `.track-row__artist`, `.track-row__album`, `.track-row__plays` `--fg-2`, the explicit badge 16 px before the artist. `.track-row__date` `--fg-3`. `.track-row__dur` `--fg-2` right-aligned. `.track-row__like` / `__more` 24×24 with 16 px glyphs, `visibility: hidden` until hover / focus-within / selected; a liked check is always visible in `--accent`.
- **States**: hover/focus-within `--hover` fill, date lifted to `--fg-2`; `.is-current .track-row__title` `▷ ` + bold + accent; `.is-playing` meter (no fill); `.is-selected` inverted block (every cell `--sel-fg`, including the current title, the liked check and the equaliser bars; no cover outline; 3.0 precedence); focus-visible dashed outline at `-1px` (`-3px` and `--sel-fg` on a selected row); `.is-disabled` `--fg-4`.
- **Narrow container** (< 560 px on desktop, both side panels open): two-line rows like the phone but keeping the index and duration: areas `"index cov title dur more" "index cov artist dur more"`, 48 px, cover 32.
- **Phone**: `--cols: 40px minmax(0,1fr) 40px`; areas `"cov title more" "cov artist more"`; 56 px rows; title 16, artist 14 `--fg-2`; index, album, date, duration, like hidden; head hidden; `.track-row__more` always visible (40×40, 16 px glyph); no hover, no selected look; `touch-action: manipulation` (SPEC).
- `.table-more` = `[see more]` / `[show less]` text-link. `.copyright` 14/20 `--fg-3`; `.copyright__date` 16 px `--fg-2`.
- **Regression requirement** for `display: contents`: row click, double-click, context menu, row `i-more`, like toggle, tap-to-play on phone, `role="row"/"cell"` exposure and keyboard focus must all still work. The suite (t04, t06, t07, t12, t12b) covers the interactions only; **no test inspects roles**, so the integrator adds one explicit check: on a playlist page, CDP `Accessibility.getFullAXTree` must show `row > cell > button` for the like and more buttons of the first track row (the elements with `display: contents` must still expose their roles). If any of this fails, grid the row element with `grid-template-columns: subgrid` spans instead (`.track-row__main { display:grid; grid-column: cover / album; grid-template-columns: subgrid }` and the same for `__text` and `__end`); the look must not change.

### 3.11 Song rows, finder, recommended (app)

- **`.song-row`**: grid `32px minmax(0,1fr) auto`, height 48, padding 0 8px, no radius; cover 32 (`--fx-fine`) with `.song-row__play` overlay on hover; title 16 `--fg`, artist 14 `--fg-2`; end: like, duration 14 `--fg-2`, more (16 px glyphs); states as 3.0 (selected inverted).
- **`.playlist-finder`**: a window (class `win`, decorative bar 70%); `.playlist-finder__title` 16 px lowercase `> let's find something for your playlist`; `.playlist-finder__sub` 14 `--fg-3`. `.finder-search` = prompt field (`>` + input, dashed underline, `min(100%, 364px)`), `.finder-search__clear` `[×]`. `.finder-row`: grid `32px minmax(0,1fr) minmax(0,1fr) auto`, 48 px, cover 32, title/artist two lines, album `--fg-2`, `.finder-row__add` = `[ add ]`. `.playlist-finder--recommended`: title `> recommended/`, `.finder-refresh` `[ refresh ]`, `.finder-more` text-link.

### 3.12 Empty states (app)

`emptyHTML()` gains an optional `art` argument. Markup: `<div class="empty"><img class="empty__flora flora" alt="" aria-hidden="true" width="120" height="132" data-flora="…">` (lazy, 3.0a; omitted when Flora is absent) + existing children. `.empty`: centred column, gap 6, padding 32px 16px; `.empty__title` 16 px `--fg`; `.empty__text` 14/20 `--fg-3`, max-width 32ch; button below (`.pill--primary`). `.empty__icon` (the heart of the Liked empty state) is hidden when `.empty__flora` is present. `.empty--sm` uses 96×104 art.

| empty state | art (section 5.5) |
|---|---|
| Liked Songs (`Songs you like will appear here`) | `bud`: a closed bud on a gently drooping stem, two leaves, one fallen petal |
| no search results, `No songs/artists/albums/playlists found`, `… not found` | `twig`: a bare twig shedding its last petals |
| queue empty (queue view and right panel `Add to your queue`) | `sprig` of `ume` |
| `Nothing playing`, `Nothing here yet`, `.lib-empty`, empty user playlist finder | `seedling`: a stem, two leaves and a bud on a dashed ground line |

### 3.13 Queue view and right panel (app)

- Queue view: `.page-title--lg` = `> queue` 32/38 lowercase; `.queue-section__title` 16 px lowercase `> now playing/`, `> next in queue/`, `> next from:` (the existing `.muted` span `--fg-3`, the link `--fg`); `.queue-clear` `[ clear queue ]`.
- **`#right-panel`**: `.rp__head` sticky, `--bg`, `will-change: transform`, class `win`, `padding-top: calc(var(--win-bar-h) + 4px)`, live bar as its **last** child (`--rule-w:88%`, decorative `-`, the existing `.rp__close` moved into the `×` slot with classes added). Title line: new `<span class="win__path" aria-hidden="true" data-path="/now_playing">` (or `/queue`), then the existing `h2.rp__title` (16 px `--fg-2`, link `--fg`, `text-transform: none`), ellipsis.
- `.rp__body` padding `8px 0 16px` (the panel has no side padding of its own beyond 0 4px). `.rp__cover` (a bare filtered `img`) gets a new wrapper: app.js renders `<div class="rp__cover-frame"><img class="cover rp__cover" …></div>` (the img keeps every class and attribute); the wrapper is full width, `position: relative`, and carries the corner fragments (`.rp__cover-frame::after`, 2.1). No radius on the cover. `.rp__track-title` 16 px `--fg` + bold; `.rp__track-artist` 14 `--fg-2`; `.rp__like` 32 icon button.
- `.rp-card` → nested windows (class `win`, decorative bar 70%), no fill, no radius. `.rp-card__img` 4:3 filtered; `.rp-card__img-label` = black label (`--bg` fill) 14 px lowercase top-left, no text-shadow. `.rp-card__name` 16 `--fg`; `.rp-card__sub` 14 `--fg-3`; `.rp__follow` `[ follow ]`; `.rp-card__bio` 14/20 `--fg-2` `clamp-3`. `.rp-card__head` `.rp-card__name` = `> next in queue` (prompt via CSS, lowercase), `.text-link` `[open queue]`. `.rp-card__empty` 14 `--fg-3`.
- Queue mode: song rows (3.11).

### 3.14 Context menu (app)

- `.context-menu` (and `--sub`): `position: fixed` (app positioning and flip logic unchanged), `min-width: 240px; max-width: 340px`, `background: var(--bg)`, `border: 1px solid var(--rule)`, no radius, `box-shadow: var(--shadow-menu)`, padding `calc(var(--win-bar-h) + 2px) 4px 4px`, `will-change: transform`.
- First children (new, rendered by `renderMenuList`): decorative `.win__bar` (`--rule-w:70%`, submenu 60%) and `<div class="menu-target" aria-hidden="true" data-path="…"></div>` (14 px `--fg-3`, `::before { content: "> " attr(data-path) }`, ellipsis, dashed bottom rule `--dash-dim`, margin-bottom 4). `data-path` = `pos.title` (new optional `openContextMenu` option; app call sites pass the track / entity name, sort → `sort`, account → `account`, create → `new`, view → `view as`), else `opts`; the submenu passes the parent label lowercased.
- `.menu-item`: grid `16px minmax(0,1fr) 16px`, gap 10, height 30, padding 0 8px, 16 px, with explicit placement because most items have no icon (Go to artist, Copy link to …, Embed …, every playlist in Add to playlist ▸): `.menu-item__icon, .menu-item > .cover { grid-column: 1 } .menu-item__label { grid-column: 2 } .menu-item__chev, .menu-item__check { grid-column: 3 }`; hover / `.is-focused` = inverted block (icons `--sel-fg`); `.is-open` `--press` fill; disabled `--fg-4`; `.menu-item--danger .menu-item__label::before { content: "! " }` in `--danger`, and `.menu-item:is(:hover, .is-focused) .menu-item__label::before { color: inherit }` (on the inverted block it takes `--sel-fg`); `.menu-item__check` `--accent`; `.menu-item__chev` `--fg-2`; `.menu-item .cover` 24×24 (`--fx-fine`).
- `.menu-sep` 1 px `--dash-dim`, margin 4px 8px. `.menu-head` (type 'header', e.g. "View as") 14 px `--fg-3` lowercase, `::before { content: "# " }`. `.menu-search` = prompt field: `>` + input, 1 px `--rule` box (focus `--fg`; `--rule-dim` would be 1.7:1, below the 3:1 for component boundaries), height 30, the search icon hidden.
- **Phone (< 768 px) = bottom sheet**: `left:0 !important; right:0; top:auto !important; bottom:0; width:100%; max-width:none; max-height: 70vh !important` (placeMenu / openSubmenu write an inline `max-height`, which must not win here); `border-width:1px 0 0; box-shadow: none; will-change: auto; padding-bottom: calc(8px + env(safe-area-inset-bottom))`; items 44 px. Scrim: `#context-menu::before { content:""; position: fixed; inset: 0; z-index: -1; background: var(--scrim-b); pointer-events: none }` (no `will-change` on the sheet, or the fixed pseudo would be contained by it; `pointer-events: none` keeps tap-outside-to-close exactly as today; the opaque black sheet paints over it). The **submenu opens inline** (graft): on phone `openSubmenu` inserts the sub `.context-menu.context-menu--sub.context-menu--inline` right after the parent item inside `#context-menu` (not in `body`), with `role="group"` (a `menu` may not contain a `menu`) and `aria-label` = the parent item's label; the parent keeps `aria-expanded`. Styled `position: static; max-height: none !important; will-change: auto; margin: 0 0 4px 16px; border: 0; border-left: 1px dashed var(--rule-dim); box-shadow: none`. Keep `menu.sub` pointing at it so keyboard handling is unchanged; the body-level sub listeners must skip events whose target is inside `els.menu` (they are already handled by the menu's own listeners).

### 3.15 Dialogs (app)

- `.dialog-backdrop`: `background: repeating-conic-gradient(var(--scrim-a) 0 25%, var(--scrim-b) 0 50%) 0 0 / 2px 2px` (a 1-bit dim).
- New wrapper: backdrop > `<div class="dialog-frame">` > `.dialog` + new `<img class="dialog__flora flora" alt="" aria-hidden="true" data-flora="…">`. `.dialog-frame { position: relative; width: max-content; max-width: 100% }` (it hugs the dialog). The backdrop click handler also treats a click whose target is the frame as a backdrop click (`e.target === backdrop || e.target === frame`), so SPEC 8.7's close-on-backdrop never regresses. Everything else (`.dialog` role, focus trap, close rules, `#dialog-root .dialog` selectors) unchanged.
- `.dialog`: `width: min(440px, calc(100vw - 32px))`, `background: var(--bg)`, `border: 1px solid var(--fg)`, `box-shadow: var(--shadow-menu)`, padding `30px 18px 16px`, no radius, `will-change: transform`. `.dialog--wide { width: min(560px, calc(100vw - 32px)) }`: `openDialog` adds `dialog--wide` when the body element is `.edit-details`. The bar inside sits at `left:12px; right:12px; top:6px` (`--rule-w:64%`); without `closeButton` it is decorative and the first child; with `closeButton` it is live, the **last** child of `.dialog` (2.1), and the existing `.dialog__close` moves into its `×` slot.
- `.dialog__title` 16/22 `--fg`, `::before { content: "> " }`, margin `0 0 10px`, no right padding. `.dialog__body` 16/22 `--fg-2`, `b` `--fg`. `.dialog__actions` right-aligned, gap 12, margin-top 18: secondary `.text-btn` `[ don't add ]`, primary `.pill--primary` inverted block. `.dialog .pill` keeps 28 px height (44 on phone).
- **Edit details**: `.edit-details` grid `152px minmax(0,1fr)`, gap 16; cover 152 square filtered (mosaic); hover / focus-within shows the pixel edit glyph from a new `<span class="edit-details__edit" aria-hidden="true">` holding `i-edit` (32 px, `--overlay` fill) placed **after** the cover img (its parent gets `position: relative`); `.field` column, gap 4; `.field__label` static (not floating, always visible) 14 px `--fg-3` lowercase with `::after { content: ":" }`; `.field__input` `background: var(--bg)`, `border: 1px solid var(--rule)` at rest (3:1 boundary), no radius, padding 6px 8px, 16 px; hover and focus `--fg`; textarea height 88. Phone: one column, cover 120 centred above the fields, actions right.
- **Dialog sprig** (graft, outside the dialog, inside the frame's box): `.dialog__flora` 120×168 peony sprig (lazy, 3.0a, opts `{ kind:'sprig', species:'peony', seed:'dialog', w:120, h:168, anchor:'bottomright' }`; the dialog is opened after the first paint, so it is normally cached), `position:absolute; right: calc(100% + 12px); bottom: 0`. It never overlaps the dialog's border or content. Hidden below 1024 px viewport width.

### 3.16 Toast and tooltip (app)

- `.toast-root`: SPEC offsets with the new tokens (desktop `bottom: calc(var(--player-h) + 16px)`; phone `calc(var(--bottom-nav-h) + var(--mini-player-h) + 16px + env(safe-area-inset-bottom, 0px))`, regardless of the mini player). **No `will-change`, `transform`, `filter` or `contain` on `.toast-root`**: it holds the `position: fixed` `.tooltip` (SPEC 8.7), and any of these would become its containing block (3.2). The phone expanded-player rule (toasts near the top while it is open) stays.
- `.toast`: inverted status line: `min-height: 36px; max-width: calc(100vw - 32px); padding: 7px 14px 7px 10px; gap: 10px; align-items: flex-start; background: var(--fg); color: var(--bg); font: var(--fs)/var(--lh) var(--font); border-radius: 0; box-shadow: none; will-change: transform` (a long `Added to <playlist name>` wraps to a second line instead of overflowing; the text node is a direct child, so no ellipsis). Bullet: `.toast::before { content: ""; width: 13px; height: 12px; flex: none; margin-top: 5px; background: currentColor; -webkit-mask: var(--blossom-mask) center / 13px 12px no-repeat; mask: … }` (a pixel blossom; `textContent` unchanged). Enter: `toast-in 120ms steps(2)` from `translateY(8px)`; leave reversed. `.toast__action` `--bg`, underline.
- `.tooltip` (the single element inside `#toast-root`, `position: fixed`, viewport coordinates from `showTooltip`): `background: var(--bg); color: var(--fg); border: 1px solid var(--rule); border-radius: 0; box-shadow: none; font: var(--fs-s)/var(--lh-s) var(--font); padding: 0 6px; will-change: transform` (on the tooltip itself this is harmless); visible instantly (no fade).

### 3.17 Bottom nav (app)

`.bottom-nav` 56 px + safe area, `border-top: 1px solid var(--rule)` (container rule in styles.css), three equal items. `.bottom-nav__item`: column, gap 4, icon 16 px, label 14 px lowercase `--fg-3`; app.js wraps the label text in `<span class="bottom-nav__label">` (the anchor's `textContent` and first `<use>` unchanged). `.is-active`: icon `--fg` (the existing filled swap), label inverted cell (`background: var(--fg); color: var(--bg); padding: 0 4px`). Hover `--fg`. The whole item is the hit area (≥ 56 px tall).

### 3.18 Player bar (`#player-bar`, player)

- Window: `#player-bar { position: relative; padding: calc(var(--win-bar-h) + 22px) 4px 4px; background: var(--bg); }` (inner layout; the container height is `--player-h` = 92, so the content box is 92 − 36 − 4 = 52 px). New first children: decorative `.win__bar` (`--rule-w:100%`) and `<div class="win__title pb-win-title" aria-hidden="true" data-path="/media">` absolutely at `top: var(--win-bar-h); left: 4px`.
- Grid `minmax(0,1fr) minmax(0,1.25fr) minmax(0,1fr)` (was 30/40/30), gap 24, `align-items: center`.
- **Left** `.pb-left`: `.pb-cover` (the wrapper div) 48×48, its img `--fx-fine`, corner fragments on `.pb-cover::after`; `.pb-cover__expand` = a 16×16 drawn square (`--bg` fill, 1 px `--rule` border) holding the existing pixel `i-expand` icon at the top-right on hover; its hit box is 24×24 (1.5). **Song/Author labels**: `.pb-text` becomes a grid `grid-template-columns: 56px minmax(0,1fr); column-gap: 8px` (56 px holds `Author:` at 14 px = 49 px; never a `ch` value, which would resolve against the 16 px container) with `::before` (row 1) and `::after` (row 2) as the labels, both 14/20 `--fg` + bold (the reference's labels). The labels are hidden from assistive tech with CSS alt text: `content: "Song:"; content: "Song:" / "";` and `content: "Author:"; content: "Author:" / "";` (the second declaration wins where alt text is supported; the first is the fallback), so screen readers never hear `Song: <title> <artist> Author:` in the wrong order. `.pb-title` (row 1, col 2) 16/22 `--fg` (links `--fg`, hover underline); `.pb-artist` (row 2, col 2) 14/20 `--fg-2`. `textContent` of `.pb-title` / `.pb-artist` is unchanged (labels are pseudo-elements of `.pb-text`). `.pb-like` 32 icon button (saved = `--accent`).
- **Centre** `.pb-center` (column, `row-gap: 4px`; 32 + 4 + 16 = 52 px, exactly the content box): `.pb-controls` gap 14: shuffle, prev, `.pb-play` (`.play-btn--white` → 32 block, `--fg` fill, `--bg` glyph; disabled `--fg-4`), next, repeat (all 16 px glyphs; active = accent + bar). `.pb-progress` gap 12, height 16: `.pb-time` 14/16 (line-height 16) `--fg-2` 4ch right / left; the progress slider (3.19, input height 16).
- **Right** `.pb-right` gap 8: `.pb-npv`, `.pb-queue` (dot toggles), `.pb-mute`, the volume slider (3.19), new `<span class="pb-vol-pct" aria-hidden="true">70%</span>` 14 px `--fg-3` 4ch (player.js updates it on `volumechange`; `0%` when muted; its text is a new node, so it may appear in container `innerText`, rule 0.9). Tablet: `.pb-vol-pct` and `.pb-npv` hidden.
- `.is-empty`: left column hidden (SPEC), controls `--fg-4`.

### 3.19 Sliders (player)

The inputs, scales, `--fill` contract and drag behaviour stay as SPEC §6.3. Only the paint changes.

- **Progress** (`.slider--progress`): input height 16; track height 12, no radius, `background: linear-gradient(var(--slider-fill), var(--slider-fill)) left center / var(--fill, 0%) 2px no-repeat, repeating-linear-gradient(90deg, var(--fg-3) 0 4px, transparent 4px 7px) center / 100% 1px no-repeat` (solid elapsed line over a dashed remainder). `--slider-fill: var(--fg)`; hover / focus / active `var(--accent)`. Thumb: hidden at rest on desktop; on hover / focus / drag a 13×12 pixel blossom (`width:13px; height:12px; border:0; border-radius:0; box-shadow:none; background: var(--blossom-img) center / 13px 12px no-repeat`). `.slider--thumb` (expanded player): blossom always visible, and the input is 44 px tall there (`#expanded-player .slider { height: 44px }`, the 12 px track centred) so the phone seek target is 44 px. Same rules for `::-moz-range-*`.
- **Volume** (`.slider--volume`): 90 px wide (10 cells × 9 px); track height 10, `background: repeating-linear-gradient(90deg, var(--slider-fill) 0 6px, transparent 6px 9px) left / var(--fill-q, var(--fill, 0%)) 100% no-repeat, repeating-linear-gradient(90deg, var(--fg-3) 0 6px, transparent 6px 9px)` (empty cells in `--fg-3`, so a muted slider is still visible at ≥ 4.5:1). player.js also sets `--fill-q` = the value rounded to the nearest 10% so the bar fills whole cells. Thumb 2×10 `--fg`, visible only on `:focus-visible`.
- Focus-visible: the input gets the dashed outline. Disabled: `--slider-fill: var(--fg-4)`, no thumb.
- **Mini progress** (`.mini-player__progress`): height 4 at the bottom; `background: repeating-linear-gradient(90deg, var(--fg-3) 0 4px, transparent 4px 7px) center / 100% 1px no-repeat`; `i` = 2 px `--fg` line, `width: var(--fill)`.

### 3.20 Mini player (`#mini-player`, phone, player)

- `margin: 0 8px 6px`, no radius, `overflow: hidden`, height `var(--mini-player-h)` (72). New first child: decorative `.win__bar` (`--rule-w:80%`, 12 px on phone). Body `.mini-player__inner` 56 px below the bar.
- **Tint** (replaces the coloured bar): `#mini-player::before { content:""; position:absolute; left:0; right:0; top: var(--win-bar-h); bottom:0; z-index:0; background: var(--mini-color, #000); filter: var(--fx-tint); }` (literal black fallback, 1.4); the inner content sits above (`position:relative; z-index:1`). `--mini-color` is the album colour pre-darkened by player.js (`darken(color, .55)`), so through `--fx-tint` the layer is never lighter than `#383838` (luminance) in the dark modes (white ≥ 11:1, `--fg-2` artist line ≥ 4.6:1) and ≥ 0.855 under invert (black ≥ 15:1, `--fg-2` ≥ 5.0:1); see 4.3 and 8.4. `#mini-player` carries the `--fg-3` lift (3.0a).
- `.mini-player__open` cover 40 (`--fx-fine`); `.mini-player__text` grid `56px minmax(0,1fr); column-gap: 8px` with the `Song:` / `Author:` labels as `::before` / `::after` (14/20 `--fg` + bold, CSS alt text `/ ""` exactly as 3.18); `.mini-player__title` 16/22 `--fg` (marquee unchanged); `.mini-player__artist` 14/20 `--fg-2`. `.mp-like`, `.mp-play` stay icon buttons: ≥ 44 px hit areas (40 px box + the 6 px phone extender of 1.5) with 16 px `--fg` glyphs, no fill. Swipe/tap behaviour unchanged. When no track is loaded the mini player stays hidden (`m.root.hidden = !tr`, SPEC 6.4).

### 3.21 Expanded player (`#expanded-player`, phone, player)

- Background `var(--bg)` + `::before` band: `background: linear-gradient(var(--xp-color, #000) 0, transparent 70%); filter: var(--fx-band); position:absolute; inset:0 0 auto 0; height:70%; z-index:0` (literal black fallback, 1.4); content above it.
- New first child: a **decorative** bar (`--rule-w:76%`, `- ×` both drawn, no buttons; the chevron `.xp-close` is the close control). It respects the notch: `#expanded-player > .win__bar { top: env(safe-area-inset-top, 0px) }`, and the player's padding-top becomes `calc(var(--win-bar-h) + 12px + env(safe-area-inset-top, 0px))` so `.xp__top` starts below the bar.
- `.xp__top`: `.xp-close` chevron 40×40 (16 px glyph); `.xp__context .eyebrow` 14 px `--fg-3` (lifted to `--fg-2`, 3.0a) lowercase with `::before { content: "> " }`; `.xp__context-name` 16 `--fg`; `.xp-more` 40×40 (when it opens the track menu it may pass `title: track.title`). Both reach 44 with the phone extender (1.5).
- `.xp__cover` (the wrapper div): square `min(88vw, max(160px, calc(100vh - 392px)))` (12 px more reserved for the bar), no radius, no shadow, its img filtered (full variant), corner fragments on `.xp__cover::after`.
- `.xp__text` grid `56px minmax(0,1fr); column-gap: 8px` with `Song:` / `Author:` pseudo labels (14 px bold `--fg`, CSS alt text `/ ""` as 3.18); `.xp__title` 16/22 `--fg` (one line), `.xp__artist` 14 `--fg-2`. `.xp-like` 40 (44 with the extender).
- Progress `.slider--thumb` (blossom thumb always visible), `.xp__times` 14 px `--fg-2` (`1:24` / `-2:18`).
- `.xp__controls`: 48×48 buttons with 32 px glyphs; `.xp-play` = `.play-btn--xl` 64 block (`--accent` fill, 32 px `--on-accent` glyph); active toggles accent + bar. `.xp__bottom` `.xp-queue` 40.

---

## 4. Filter system

### 4.1 Mode attribute and modes

- The mode lives on **`<html data-filter="…">`** (`document.documentElement`). Values: `mono` (default), `dither`, `invert`, `color`, `cyano`, `ink`. A missing attribute means `mono` (the `:root` defaults are mono, so covers are grey from the very first paint and never flash in colour).
- app.js sets it in step 2 of `App.init()` (before `Player.init()` and before any cover is painted) from `Library.prefs().filter` (validated; anything else → `mono`), and on every switch. That is authoritative, but it runs at the end of a large inlined fragment, so a saved `invert` would first paint black. The shell therefore adds a tiny **inline** script right after the stylesheet link in index.html (allowed: build.js only rewrites `<script src="…">` tags, so it passes through to both outputs untouched):

```html
<script>try{var f=JSON.parse(localStorage.getItem('wl:prefs')||'{}').filter;if(['mono','dither','invert','color','cyano','ink'].indexOf(f)>0)document.documentElement.setAttribute('data-filter',f)}catch(e){}</script>
```

- Persistence: **`wl:prefs` key `filter`** via `Library.setPref('filter', mode)` (emits `pref`, which `rerender()` ignores).

### 4.2 Per-mode tokens (styles.css; mono is the `:root` block of 1.2)

```css
:root[data-filter="dither"] { --fx: url(#fx-dither); --fx-fine: url(#fx-dither-fine);
  --fx-tint: grayscale(1) brightness(.4); --fx-band: grayscale(1) brightness(.22); }   /* no 1-bit pattern under text */
:root[data-filter="invert"] { /* section 1.4: UI tokens flip too */ }
:root[data-filter="color"]  { --fx: none; --fx-fine: none; --fx-tint: brightness(.4); --fx-band: brightness(.22);
  --accent: #1ed760; --accent-hover: #3be477; --accent-press: #1fdf64; --danger: #f15e6c; --verified: #3d91f4; }
:root[data-filter="cyano"]  { --fx: url(#fx-cyano); --fx-fine: url(#fx-cyano);
  --fx-tint: url(#fx-cyano) brightness(.4); --fx-band: url(#fx-cyano) brightness(.22);
  --accent: #a8c6ff; --accent-hover: #c4d8ff; --accent-press: #7f9fd6; --verified: #a8c6ff; }
:root[data-filter="ink"]    { --fx: url(#fx-ink); --fx-fine: url(#fx-ink);
  --fx-tint: url(#fx-ink) brightness(.4); --fx-band: grayscale(1) brightness(.22); }
/* WebKit (iOS) has a history of not rendering feImage inside CSS-referenced filters on HTML content;
   dither there falls back to a hard grey print (untested on a real device; see 9.e) */
@supports (-webkit-touch-callout: none) {
  :root[data-filter="dither"] { --fx: grayscale(1) contrast(1.8); --fx-fine: grayscale(1) contrast(1.8); }
}
```

| mode | `--fx` (covers, images, colour fields) | accent | reads as |
|---|---|---|---|
| `mono` | `grayscale(1) contrast(1.12) brightness(1.02)` | white | tonal grey prints (default) |
| `dither` | SVG `#fx-dither` (2 px Bayer cells); thumbnails ≤ 48 px `#fx-dither-fine` (1 px cells) | white | 1-bit ordered dither |
| `invert` | `grayscale(1) invert(1) contrast(1.1)`, and the whole UI flips to black on white | black | a photographic negative, ink on paper |
| `color` | `none` | `#1ed760` (the old green, back only here) | the original palette |
| `cyano` | SVG `#fx-cyano` (Prussian blue → paper white) | `#a8c6ff` | a cyanotype, the botanical sun print |
| `ink` | SVG `#fx-ink` (black / 42% grey / white posterise) + a 1 px inset `--rule` frame on covers (posterises to the 42% grey) | white | the reference's white silhouettes |

### 4.3 What each filter applies to

| surface | owner | filter |
|---|---|---|
| every `img.cover` (cards, tiles, rows, heroes, right panel, about, menus, player, mini, expanded, top result, edit details) | primitive + owners | `--fx`; ≤ 48 px thumbs `--fx-fine` |
| `.browse-card::before` (genre colour field) | app | `--fx` (unclamped; the name has its own black label) |
| `.avatar::before` (`--avatar-bg`) | styles.css | `--fx-tint` |
| `.hero-band` (`--hero-color`, `--liked-hero`), `.home-head` (`--home-tint`), `.main-header::before` (`--strip-tint`) | app | `--fx-band` |
| `#mini-player::before` (`--mini-color`) | player | `--fx-tint` |
| `#expanded-player::before` (`--xp-color`) | player | `--fx-band` |
| the accent, danger, verified colours | tokens | per-mode token values (no filter needed) |
| UI chrome (text, rules, icons, silhouettes, petals) | — | never filtered; under `invert` the tokens flip, `.flora` images get `invert(1)`, and the petal canvas draws black itself (`setFill`, 5.7) |

**Clamps** (must-fix):
- Bands (`--fx-band`): dark modes ≤ 0.22 (`#383838`) for any input, faded to transparent: `--fg` ≥ 11.7:1, `--fg-2` ≥ 4.6:1. Invert ≥ 0.855 (`#dadada`): `--fg` (black) ≥ 15:1, `--fg-2` ≥ 5.0:1.
- Tints (`--fx-tint`): dark modes ≤ 0.4 for raw colours (white ≥ 5.7:1; only the avatar letter sits on a raw-colour tint) and ≤ `#383838` luminance for the pre-darkened `--mini-color` (`--fg-2` ≥ 4.6:1). Invert: the same function as the band, ≥ 0.855 (`--fg-2` ≥ 5.0:1). Dither uses a plain grey tint (no pattern under text).
- `--fg-3` is never used over a band or tint (3.0a lifts it to `--fg-2`): it would measure 2.5:1 (dark) / 3.3:1 (invert).
- Untinted fallbacks are literal black (1.4). No colour-bearing layer is ever painted under text without `--fx-tint` or `--fx-band`.

Performance: SVG filters (`url(#…)`) are applied only to `<img class="cover">`, small tint layers and the browse tiles; the large bands use CSS functions in `dither` and `ink` (see 4.2); `cyano` bands use the cheap `#fx-cyano` table. Verify Home and a playlist scroll at ≥ 50 fps under `dither` and `cyano`; if `cyano` bands drop below that, use `grayscale(1) sepia(1) hue-rotate(180deg) saturate(2.5) brightness(.22)` for `--fx-band` in that mode.

### 4.4 SVG defs (index.html, shell; right after the sprite `<svg>`)

```html
<svg class="fx-defs" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <filter id="fx-dither" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
    <feColorMatrix in="SourceGraphic" type="matrix" values=".2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  0 0 0 1 0" result="lum"/>
    <feComponentTransfer in="lum" result="boost">
      <feFuncR type="linear" slope="1.55" intercept="-0.2"/>
      <feFuncG type="linear" slope="1.55" intercept="-0.2"/>
      <feFuncB type="linear" slope="1.55" intercept="-0.2"/>
    </feComponentTransfer>
    <feImage id="fx-bayer" x="0" y="0" width="8" height="8" preserveAspectRatio="none" href="BAYER_8" xlink:href="BAYER_8" result="cell"/>
    <feTile in="cell" result="bayer"/>
    <feComposite in="boost" in2="bayer" operator="arithmetic" k1="0" k2="1" k3="1" k4="-0.5" result="sum"/>
    <feComponentTransfer in="sum" result="bw">
      <feFuncR type="discrete" tableValues="0 1"/>
      <feFuncG type="discrete" tableValues="0 1"/>
      <feFuncB type="discrete" tableValues="0 1"/>
    </feComponentTransfer>
    <feComposite in="bw" in2="SourceAlpha" operator="in"/>
  </filter>
  <filter id="fx-dither-fine" …identical, except: <feImage id="fx-bayer-fine" … width="4" height="4" href="BAYER_4" xlink:href="BAYER_4" …/> …</filter>
  <filter id="fx-cyano" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values=".2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  0 0 0 1 0"/>
    <feComponentTransfer>
      <feFuncR type="table" tableValues="0.03 0.07 0.52 0.93"/>
      <feFuncG type="table" tableValues="0.13 0.25 0.67 0.96"/>
      <feFuncB type="table" tableValues="0.30 0.52 0.86 0.99"/>
    </feComponentTransfer>
  </filter>
  <filter id="fx-ink" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values=".2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  0 0 0 1 0"/>
    <feComponentTransfer>
      <feFuncR type="discrete" tableValues="0 0 0 0 0 .42 1 1 1 1"/>
      <feFuncG type="discrete" tableValues="0 0 0 0 0 .42 1 1 1 1"/>
      <feFuncB type="discrete" tableValues="0 0 0 0 0 .42 1 1 1 1"/>
    </feComponentTransfer>
  </filter>
</svg>
```

- `BAYER_8` and `BAYER_4` are the two strings printed by `node tools/work/design-lead/px.js bayer` (a 4×4 Bayer matrix, values `round(255 × (m + .5) / 16)`, at 2 px and 1 px cells), pasted **statically** into both `href` and `xlink:href` (no runtime script; dither works even if a module fails to load).
- The arithmetic `boost + bayer − 0.5` then the 0/1 step lights a pixel where `boost ≥ 1 − bayer` (a correct ordered dither); alpha stays 1, and the final `in SourceAlpha` keeps round avatars round.
- `.fx-defs` is hidden like the sprite (`position:absolute; width:0; height:0; overflow:hidden`), never `display:none`.

### 4.5 Ink frame and genre labels

`:root[data-filter="ink"] .cover { outline: 1px solid var(--rule); outline-offset: -1px }` (styles.css) so posterised covers do not dissolve into the black field. The outline is part of the filtered element, so it must survive the posterise: `--rule` (`#8c8c8c`, luminance band 5) maps to the 0.42 grey and stays visible, `--rule-dim` would map to black. The inset (negative) offset keeps it inside the filter region. This is the only outline ever drawn on a filtered cover (3.0a). Owners add a 1 px `--rule` frame to `.browse-card` under ink (on the unfiltered button, so any grey works there).

### 4.6 The switcher (app)

Markup (one instance in `#topbar .topbar__right`, one in the phone Home `/filter` window; both stay in sync):

```html
<div class="fx-bar">
  <div class="fx" role="radiogroup" aria-label="Media filter">
    <span class="fx__label" aria-hidden="true"></span>                   <!-- ::before "filter:" -->
    <button type="button" class="fx__opt" role="radio" aria-checked="true"  tabindex="0"  data-filter-set="mono">mono</button>
    <button type="button" class="fx__opt" role="radio" aria-checked="false" tabindex="-1" data-filter-set="dither">dither</button>
    … invert, color, cyano, ink …
  </div>
  <button type="button" class="fx-menu-btn" aria-haspopup="menu" aria-label="Media filter: mono" data-mode="mono"><svg class="icon" aria-hidden="true"><use href="#i-chevron-down"/></svg></button>   <!-- top bar only -->
  <button type="button" class="fx-petals" aria-pressed="true" aria-label="Falling petals"><svg class="icon" aria-hidden="true"><use href="#i-petal"/></svg></button>
</div>
```

- Look: `.fx__label::before { content: "filter:" }` 16 px `--fg-3`, margin-right 1ch; `.fx__opt` 16 px `--fg-2`, height 24, padding 0 4px, hover `--fg` + `--hover`; `[aria-checked="true"]` = inverted block. `.fx-petals` 32×32 icon button, `aria-pressed="true"` → `--fg`, false → `--fg-3` with the 4×2 bar removed. Phone (`/filter` window): options 44 px tall (`background-clip: content-box`), the row scrolls horizontally if needed (`overflow-x:auto; scrollbar-width:none`), no page overflow.
- **Tiers** (top bar, budget in 3.3): `.fx__label` shows only at ≥ 1440 px (`@media (max-width: 1439px) { #topbar .fx__label { display: none } }`; the radiogroup keeps its `aria-label`).
- **Compact switcher** (top bar, below 1280 px): `.fx-menu-btn` is `display: none` at ≥ 1280 px; below 1280 px the top-bar `.fx` radiogroup is `display: none` and `.fx-menu-btn` shows `[mono]` + the pixel chevron (`::before { content: "[" attr(data-mode) "]" }`, 16 px `--fg-2`, height 24, hover `--fg` + `--hover`). Click opens `openContextMenu` anchored under the button with `title: 'filter'`: a header item `Media filter` and six items `mono` … `ink`, the current one `checked` (the same item shape as the existing "View as" menu); each item calls `App.setFilter(mode)`. `App.setFilter` updates `data-mode` and `aria-label` (`Media filter: <mode>`) on every `.fx-menu-btn`. The phone `/filter` window always uses the radiogroup.
- Never use `.chip` for these (the regression suite collects `#main .chip`).
- Keyboard (handled on the radiogroup element, which runs before the document listeners): ArrowRight/ArrowDown = next, ArrowLeft/ArrowUp = previous (wrapping), Home/End = first/last; each moves focus **and** selects (`App.setFilter`), then `preventDefault()`. Space/Enter on a focused option selects it. Roving tabindex: only the checked option has `tabindex="0"`. Clicks select.
- `App.setFilter(mode)` (new public method): validates, sets `data-filter` on `<html>`, `Library.setPref('filter', mode)`, updates every `.fx__opt` (`aria-checked`, `tabindex`) and every `.fx-menu-btn` (`data-mode`, `aria-label`), the readout `Filter:` line, passes the petal ink (`'#000'` under invert, else `'#fff'`) to the petal controller's `setFill`, and emits the new App event `filter` (arg: mode). `App.filter()` returns the current mode.
- `App.setPetals(on)` / `App.petals()`: the **ambient motion switch**. Start/stop the petal controller (6.4), persist `wl:prefs` key `petals` (boolean, default `true`), sync every `.fx-petals` `aria-pressed`, and set `<html data-motion="off">` when off (attribute removed when on). CSS stops every blink and the marquee under `data-motion="off"` exactly as under reduced motion (8.3), which gives the WCAG 2.2.2 pause mechanism. Under `prefers-reduced-motion: reduce` the toggle renders `aria-pressed="false"` and `aria-disabled="true"` (it stays focusable and shows its tooltip; clicks do nothing), and petals never start.

---

## 5. Flora (owner: flora engineer, `src/flora.js` + the cover-art functions of `src/data.js`)

### 5.1 Global and loading

- `src/flora.js` attaches exactly one global, `window.Flora` (`globalThis.Flora` when `window` is undefined), at evaluation time. It is loaded **before** `data.js` (`<script src="flora.js"></script>`), touches no DOM at evaluation time, and every drawing function returns `''` / does nothing when there is no `document`.
- Callers always guard: `typeof window.Flora === 'object' && typeof Flora.sprite === 'function'`. With Flora absent the app still works (no silhouettes; data.js falls back to its current cover drawing).
- Port from `tools/work/terminal/mock/flora.js` (9 species, `growScene`, `drawScene`, `cover`, `liked`, BLOSSOM) and add garden's species from `design/mocks/garden.html` (`Flora` IIFE, lines ~622–1200). Use the same RNG as data.js (FNV-1a hash + mulberry32).

### 5.2 API (exact)

```js
Flora.version                       // 1
Flora.SPECIES                       // { [key]: { key, label, latin, genre|null, form, leaf, note } } — table 5.3
Flora.GENRE_SPECIES                 // { pop:'sakura', hiphop:'chrysanthemum', … newreleases:'iris', charts:'dandelion' }
Flora.speciesFor(x)                 // x: 'ge_pop' | 'pop' | entity with genreId / genreIds / styleKey; returns a species key; deterministic fallback by hash
Flora.rng(seed) -> () => [0,1)      // mulberry32 over FNV-1a of String(seed)
Flora.hash(str) -> uint32
Flora.HOME_SEED                     // the chosen seed of the Home branch (5.4)

// canvas primitives (ctx-level, used by covers and sprites)
Flora.bloom(ctx, x, y, r, species, style, R)
Flora.leaf(ctx, x, y, angle, length, style)
Flora.bud(ctx, x, y, angle, size, style)
Flora.petal(ctx, x, y, angle, size, style, shape = 'notch', flip = 1)
Flora.branch(ctx, rect, opts)       // grows a seeded branch scene and draws it fitted into rect {x,y,w,h}; opts below

// silhouettes: white on transparent, thin dark separations
Flora.sprite(opts) -> 'data:image/png;base64,…'   // cached; '' without DOM
Flora.draw(canvas, opts) -> canvas                 // same drawing into a given canvas (resizes it to w×h×dpr, sets CSS size)
//   opts: { kind, w, h, seed, species (key | key[]), anchor, angle, dpr }
//   kind: 'branch' | 'sprig' | 'spray' | 'bud' | 'twig' | 'seedling' | 'tile' | 'specimen' | 'mark'
//   anchor: 'center' | 'bottomleft' | 'bottomright' | 'topright' | 'bottom' (default per kind)
//   dpr: default Math.min(2, devicePixelRatio || 1)

// covers: tonal colour compositions (data.js calls this)
Flora.paintCover(ctx, size, spec) -> { usesText: boolean }    // paints an opaque size×size square at (0,0)
//   spec: { kind: 'album'|'playlist'|'artist'|'liked'|'mosaic-empty', seed: string, color: '#rrggbb',
//           species: key, comp?: 'bloom'|'branch'|'bouquet'|'stalks'|'field'|'wallpaper'|'hanging'|'moon'|'portrait',
//           label?: string, numeral?: string, mark?: boolean, variant?: 'full'|'thumb' }

// falling petals
Flora.petals(canvas, opts) -> { start(), stop(), setCount(n), setFill(color), destroy(), running, frames }
//   frames: running count of frames drawn (the readout's FPS reuses it, 6.1)
//   opts: { count = 14, seed = 'petals', fill = '#fff' }   // fill: '#fff' | '#000' (app passes '#000' under invert)
//   stop() cancels the frame loop AND clears the canvas (no frozen petals); start() resumes
//   the canvas backing store is capped at dpr 1.5

// pixel art
Flora.BLOSSOM                       // the 13×12 rows (same as px.js)
Flora.gridPath(rows) -> 'M5 0h3v1h-3z…'
```

`Flora.branch(ctx, rect, opts)` options: `{ seed, species: key[], depth = 2, bloomR = .12, maxBlooms = 7, extraBlooms = false, leaves = true, buds = true, petals = 6, petalDir = -1, bend = 1, ang0 = -π/2 - .45, anchor = 'center', inset = 4 }`. It grows the scene in abstract units, measures the whole plan including loose petals, and fits it into `rect` minus `inset` so **nothing is ever clipped**.

### 5.3 Species (19)

| key | label | latin | genre (tile, hero, covers) | form | construction |
|---|---|---|---|---|---|
| `sakura` | sakura | Prunus serrulata | pop | woody | 5 notched petals, stamen burst |
| `chrysanthemum` | kiku | Chrysanthemum morifolium | hiphop | stalks | 4 rings of narrow rays (24/20/16/11) |
| `rose` | rose | Rosa chinensis | rock | stalks | 2 guard rings + a 2.4-turn spiral centre |
| `wisteria` | wisteria | Wisteria floribunda | indie | hanging | racemes of paired pea-flowers shrinking to the tip |
| `moonflower` | moonflower | Ipomoea alba | electronic | vine | pentagonal trumpet with star folds, heart leaves, tendrils |
| `camellia` | camellia | Camellia japonica | lofi | woody | 4 spiralled rings of round petals, dotted boss |
| `magnolia` | star magnolia | Magnolia stellata | jazz | woody | 2 rings of strap petals, cone |
| `lily` | lily | Lilium longiflorum | classical | stalks | 6 tepals with veins and spots, long stamens |
| `lotus` | lotus | Nelumbo nucifera | ambient | pad | side view of 3 lance rings over a round pad |
| `peony` | peony | Paeonia lactiflora | rnb | woody | 4 rings of ruffled petals (9/8/7/5) |
| `daisy` | daisy | Leucanthemum vulgare | folk | stalks | 2 rings of 18 rays, seeded disc |
| `hibiscus` | hibiscus | Hibiscus rosa-sinensis | latin | woody | 5 veined ruffles, staminal column |
| `sunflower` | sunflower | Helianthus annuus | funk | stalks | 2 rings + a phyllotaxis disc |
| `thistle` | thistle | Cirsium vulgare | metal | stalks | bract globe + brush, spiny leaves |
| `iris` | iris | Iris germanica | `ge_newreleases` | stalks | 3 standards and 3 bearded falls |
| `dandelion` | dandelion | Taraxacum officinale | `ge_charts` | stalks | seed head with pappus rays |
| `ume` | ume | Prunus mume | — (queue empty, readout branch) | woody | 5 round petals, long stamens |
| `hydrangea` | hydrangea | Hydrangea macrophylla | — | cluster | dome of 22–30 four-petal florets |
| `cosmos` | cosmos | Cosmos bipinnatus | — | stalks | 8 three-toothed petals, dotted disc |

`GENRE_SPECIES` is the genre column (keys by styleKey; `newreleases` and `charts` for the two non-genre categories). `speciesFor('ge_newreleases')` → `iris`, `speciesFor('ge_charts')` → `dandelion`.

### 5.4 Silhouette style rules (every sprite, every UI flower)

- Fill pure `#ffffff` on transparent. Every petal is stroked with a thin dark separation (`#000000`, 1.1 device px, i.e. `lineWidth = 1.1 / scale` inside fitted scenes), drawn back to front so front petals cut lines into the ones behind (the reference's "white mass, fine dark lines" look). No grey fills, no gradients, no outline around the whole silhouette.
- Branches are tapered polygons (no stroke); leaves have a dark midrib and 2–3 vein pairs; buds are teardrops with sepal lines; loose petals are single notched petals squashed for tilt (`flip`).
- **Open, not a clump** (must-fix): a branch shows 4–8 distinct blossoms whose discs do not overlap by more than 25% of their radius, at least 3 leaves, at least 2 buds, a visible stem and 4–7 loose petals drifting to the **left** of the branch (`petalDir: -1`). `extraBlooms: false` for the Home branch.
- **Home branch**: `kind:'branch'`, 236×196 desktop / 128×156 phone, species `['peony','sakura','ume']`, stem rising from the bottom-right, fitted with a 4 px inset (nothing clipped). Pick `Flora.HOME_SEED` by rendering `'home-1'` … `'home-24'` and choosing the one that meets the rules above and looks closest to the reference branch (clusters at the top, left and right-middle; petals to the left); write it into the constant and name it in your final report.
- Sizes: sprites are drawn at `w × h × dpr` and shown at `w × h` CSS px. Kinds and defaults:

| kind | default anchor | use | size(s) |
|---|---|---|---|
| `branch` | center | Home readout | 236×196, 128×156 |
| `sprig` | bottomleft | library (sakura), hero (context species, `topright`, hanging), dialog (peony, `bottomright`), queue empty (ume, `center`) | 260×150; hero 160×176 / 140×156 / 88×120; 120×168; 120×132 |
| `spray` | bottomleft | shelf end slot | 128×128, 160×160, 192×192 (fixed buckets, scaled by CSS) |
| `bud` | bottom | Liked empty | 120×132, 96×104 |
| `twig` | center | no results / not found | 120×132, 96×104 |
| `seedling` | bottom | generic empty, empty mosaic | 120×132, 96×104, 96×72 |
| `tile` | bottomright | genre browse tile (grows from the corner) | 120×120 |
| `specimen` | center | single species (spare) | any |
| `mark` | center | the 13×12 pixel blossom | 13×12 × n |

### 5.5 Determinism, caching, budgets

- Determinism: every function is a pure function of its arguments (seeded RNG only, no `Math.random`, no time). The same `(kind, w, h, seed, species, anchor, angle, dpr)` always yields identical pixels; the same cover `spec` always yields an identical PNG.
- `Flora.sprite` caches data URLs in a Map keyed by the JSON of the normalised options (LRU, 96 entries). `Flora.draw` does not cache. Covers are cached by data.js (as today). Callers never vary `w`/`h` continuously (sprays use the fixed 128/160/192 buckets of 3.7), so the cache holds a small, stable set.
- Budgets (desktop, mid laptop): `paintCover` at 300 px ≤ 8 ms median, ≤ 20 ms p95 (phone ≤ 25 ms); a sprite ≤ 300×300 CSS px at dpr 2 ≤ 15 ms; one petal frame ≤ 1 ms. **Every route** (first render and re-render, including Browse with its 16 tiles and Home): no main-thread task over 50 ms. Render functions never paint: covers and flower sprites both go through app.js's lazy pump (8 ms slices, so the longest task is one slice plus at most one sprite or cover), and the 16 genre sprites are pre-warmed in idle time after Home's first paint (3.0a). The first viewport's covers and flowers are all painted within 600 ms of `DOMContentLoaded`. Average cover PNG ≤ 70 KB (flat tones compress well; no film grain).

### 5.6 Covers (data.js, cover-art functions only)

Signatures kept, one optional argument added:

```js
Catalog.cover(entityOrId, opts)    // entity object OR id string, incl. 'liked' (app.js passes ids such as data-cover keys);
                                   // opts?: { variant: 'full' | 'thumb' } (default 'full'); 300×300 PNG data URL; '' in Node
Catalog.artistImage(artist)        // = cover(artist)
Catalog.playlistMosaic(trackIds)   // unchanged logic: 2×2 of album covers / one album / empty
Catalog.hasCover(entityOrId, opts) // same arguments; true when cover(entityOrId, opts) is cached
Catalog.coverSpecies(entityOrId)   // NEW: the species key used for that entity's cover ('' when Flora is absent);
                                   // 'liked' → 'sakura'; user playlist ids (plu_*) are unknown to data.js → '' (app.js resolves them, 3.9)
```

- `cover()` builds a `spec` and calls `Flora.paintCover(ctx, 300, spec)` on its existing offscreen canvas when Flora is present; otherwise it keeps the current drawing code as the fallback. Node behaviour is unchanged (`''`, no throw), so `node src/test-data.js` keeps passing.
- Cache key: entity key, plus `#thumb` only for editorial playlists (the only covers that differ). Albums, artists, mixes, charts, Liked and mosaics return the same URL for both variants.
- Font: canvas text uses `DotGothic16` (`'<px>px DotGothic16, "MS Gothic", monospace'`); `fontReady()` / `watchFonts()` check `/dotgothic16/i` instead of Figtree; covers drawn before the font loads are marked pending and redrawn on their next request (existing mechanism). Text is always an overlay, never the only content.
- **Colour model** (so every filter has something to transform): grounds are always dark (the entity hue at lightness ≤ .27 fading to ≤ .12, plus a soft radial glow), petals always light (three tints at lightness .90 / .77 / .66), separations at .11, leaves the hue shifted −60°, one warm or complementary accent bloom. Tonal values must survive `mono`, threshold cleanly under `ink`, and give `dither` real gradients.
- **Compositions** (all drawn in the fixed 300-unit space; an entity looks identical at 24 px and 300 px because it is one PNG scaled by CSS):
  - `bloom` one large cropped head + a companion; `branch` a fitted bleeding branch; `bouquet` 5–7 stems with mixed heads; `stalks` upright stems (stalk species); `field` scattered heads and petals; `wallpaper` a staggered repeat; `hanging` racemes or vines from a top bar; `moon` a pale moon behind a dark branch silhouette; `portrait` one centred signature bloom on a radial ground (round-crop safe: subject inside the inner 70%).
- **Albums**: species = `speciesFor` the album's genre (its first track's `genreId`, else the artist's first genre); comp by `hash(id)` from `bloom, branch, bouquet, stalks, wallpaper, hanging` (≈30% `bloom`).
- **Artists**: comp `portrait`, species of the artist's first genre.
- **Playlists**: species = override below, else `speciesFor(pl.genreId)`, else by hash. Comp by id: `pl_dailymix1 field`, `pl_dailymix2 bloom`, `pl_dailymix3 wallpaper`, `pl_dailymix4 bouquet`, `pl_freshfinds stalks`, `pl_newreleases bloom`, `pl_chillvibes branch`, `pl_deepfocus moon`, `pl_latenightdrive moon`, `pl_morningcoffee bouquet`, `pl_workoutpulse field`, `pl_rainydayjazz branch`, `pl_indiegold hanging`, `pl_electronicessentials bloom`, `pl_top50global field`; unknown ids by hash. Species overrides: `pl_freshfinds iris`, `pl_newreleases iris`, `pl_chillvibes camellia`, `pl_deepfocus ume`, `pl_latenightdrive moonflower`, `pl_morningcoffee daisy`, `pl_workoutpulse sunflower`, `pl_rainydayjazz magnolia`, `pl_indiegold wisteria`, `pl_electronicessentials moonflower`, `pl_top50global dandelion`.
  - Mixes: big outlined pixel numeral `1`–`4` (0.56 S, white with a 0.03 S black stroke, bottom-right) on **both** variants. Top 50: numeral `50`.
  - Editorial (kind `editorial`): label `> ` + name lowercased in DotGothic16 at 0.075 S on a black strip at the bottom-left, **full variant only** (illegible below ~96 px, so `thumb` omits it).
  - Every playlist: the 13×12 pixel blossom mark (white, `max(1, round(S/128))` px per cell) at the top-right, both variants.
- **Liked Songs** (`{ kind:'liked' }`): a heart made of ~30 sakura blossoms (white and pale pink petals, deep-violet separations) on the old diagonal gradient `#3b12d6 → #8f7ae8 → #c4efd9`. Under mono it reads as a grey gradient with a white blossom heart.
- **Empty mosaic** (user playlist with no tracks): `#161616` ground, a pale (`#bdbdbd`) seedling silhouette centred, a small pixel eighth note top-left (SPEC's "music-note glyph").
- **Genre tiles**: not covers. app.js shows the filtered `--browse-color` field plus a white `tile` sprite of `speciesFor(genreId)` (3.8).

### 5.7 Petals (`Flora.petals`)

- Draws on the static `<canvas id="petals">` (shell). Count: 14 desktop, 12 tablet, 8 phone (app passes `count` by breakpoint and calls `setCount` on breakpoint change). Each petal: a notched sakura petal 6–10 px long, filled with `fill` (white; black under invert; no stroke at this size), alpha .3–.45 (capped at .45 so a petal passing behind text never hides it; text-dense bars are opaque anyway, 8.3), falling 12–28 px/s, drifting left 4–12 px/s, swaying 10–30 px with a 3–6 s period, tumbling (y-scale `max(.25, |cos|)`), rotating .2–.6 rad/s; recycled above the top when it leaves the bottom or left edge.
- `mix-blend-mode: normal` (no difference blend: no specks on white blocks). The canvas sits **behind** the UI (z-index 0 under `#app` at z-index 1, with transparent panels), so petals drift through the black void and behind text, never over menus, dialogs, toasts, covers or inverted blocks.
- Internal: DPR-aware sizing with the backing store capped at dpr 1.5, debounced resize, `requestAnimationFrame` loop that stops when `document.hidden` (resumes on `visibilitychange`), when the canvas is `display:none`, and on `stop()`; `stop()` also clears the canvas. Under invert the petals are drawn black through `fill` / `setFill('#000')` (no CSS filter on the full-screen canvas; the `.flora` invert rule excludes `canvas`, 1.3).
- Off when `prefers-reduced-motion: reduce` (the controller is never started; styles.css hides `#petals`; app listens for changes of that media query) and when the user turns petals off (`App.setPetals(false)`, which also sets `data-motion="off"`, 4.6). App also calls `stop()` while the opaque `#expanded-player` or a dialog is open and `start()` again when it closes (if petals are on and motion is allowed).

---

## 6. New UI (app unless noted)

### 6.1 Home readout band (system window without chrome)

```html
<section class="readout" aria-label="System readout">
  <img class="readout__flora flora" alt="" aria-hidden="true" width="236" height="196" data-flora="{…branch opts…}">   <!-- lazy, 3.0a -->
  <dl class="readout__info">
    <div class="readout__row"><dt>Host</dt><dd>wavelength</dd></div>
    <div class="readout__row"><dt>Os</dt><dd data-readout="os">Windows 11</dd></div>
    <div class="readout__row readout__row--opt"><dt>Architecture</dt><dd data-readout="arch">x64</dd></div>
    <div class="readout__row"><dt>Contact</dt><dd lang="ja">花鳥風月</dd></div>
    <div class="readout__row readout__row--gap"><dt>FPS</dt><dd data-readout="fps">60</dd></div>
    <div class="readout__row"><dt>Location</dt><dd data-readout="location">Toronto</dd></div>
    <div class="readout__row"><dt>Connection</dt><dd data-readout="connection">ESTABLISHED</dd></div>
    <div class="readout__row readout__row--opt"><dt>Session Number</dt><dd data-readout="session">0042</dd></div>
    <div class="readout__row"><dt>Audio</dt><dd data-readout="audio">idle</dd></div>
    <div class="readout__row"><dt>Filter</dt><dd data-readout="filter">mono</dd></div>
  </dl>
</section>
```

- Look: flex, `align-items: center`, gap 22, padding-left 12, min-height 210 (desktop: 10 rows of 20 px + the 10 px gap); `dt` `--fg` + bitmap bold with `::after { content: ":" }`; `dd` `--fg-2`, margin 0 0 0 1ch, ellipsis; 16/20 desktop, 14/19 phone; `.readout__row--gap { margin-top: 10px }` (6 px on phone) — the blank line between Contact and FPS, as in the reference (no empty `div` inside the `dl`: only `div`s wrapping `dt`/`dd` groups are valid there). Phone hides `--opt` rows. No `h1`/`h2`, no `.chip`/`.card`/`.shelf` inside.
- **Real environment values are an intended exception** to "all content stays fictional": Os, Architecture and Location are computed locally from the viewer's own browser, shown only to that viewer, never stored and never sent. Host, Contact and Session stay fictional/app-generated. When `navigator.webdriver` is true (the headless harness and the regression suite), every value is a fixed constant so snapshots are deterministic: Os `wavelength os 1.0`, Architecture `x64`, Location `Earth`, FPS `60` (no loop).
- Data sources (never geolocation, never network, nothing leaves the page):
  - **Host**: the constant `wavelength`.
  - **Os**: `navigator.userAgentData` when available: `platform` + `getHighEntropyValues(['platformVersion','architecture','bitness'])` (async, in try/catch, `.catch`): Windows with platformVersion major ≥ 13 → `Windows 11`, 1–12 → `Windows 10`; macOS → `macOS <major.minor>`; Android → `Android <major>`; ChromeOS; Linux. Fallback (and first paint): parse `navigator.userAgent` (`Windows NT 10.0` → `Windows`, `Mac OS X 10_15` → `macOS`, `Android 14`, `iPhone OS 17_0` → `iOS 17`, `Linux`); else `unknown`.
  - **Architecture**: high-entropy `architecture` + `bitness` → `x64` / `x86` / `arm64` / `arm`; UA fallback (`Win64|x64|x86_64|amd64` → `x64`, `arm64|aarch64` → `arm64`); else `unknown`.
  - **Contact**: `花鳥風月` (flower, bird, wind, moon), `lang="ja"`.
  - **FPS**: when the petal loop runs, reuse its frame count (no second loop); otherwise sample with `requestAnimationFrame` for 1 s every 5 s (so the main thread is idle 80% of the time just for a number), rounded. Sampling runs only while a readout is in the DOM and the document is visible, and also under reduced motion (it is not motion; the sampler draws nothing).
  - **Location**: `Intl.DateTimeFormat().resolvedOptions().timeZone` → its last segment with `_` → space (`America/Toronto` → `Toronto`); `UTC` or missing → `Earth`.
  - **Connection**: `ESTABLISHED` while `navigator.onLine !== false`, `OFFLINE` otherwise (updated on `online` / `offline`).
  - **Session Number**: `wl:prefs` key `sessionCount`, incremented once per `App.init()` (step 2), shown zero-padded to 4 digits.
  - **Audio** (music line): `idle` before any playback, `paused`, or `playing · 48 kHz` (sample rate from `AudioEngine.analyser.context.sampleRate` when it exists, in kHz with one decimal trimmed: `44.1`, `48`); updated on Player `statechange` and `trackchange`.
  - **Filter**: the current mode (updated by `App.setFilter`).
- Update rates: FPS once per sample (above); Connection on events; Audio on player events; Os/Arch computed **once per page load** and cached in module state (the first `getHighEntropyValues` result refines the cache; later Home renders read the cache, never re-query); the rest once per render. All live updates go through module-level listeners/timers that update every `[data-readout=…]` currently in the document; a re-render never arms a second timer or listener.

### 6.2 `/time` window

```html
<div class="win win--time">
  <div class="win__bar" aria-hidden="true" style="--rule-w:72%"></div>
  <div class="clock"><span class="win__path" aria-hidden="true" data-path="/time"></span><time class="clock__time" data-clock datetime="2026-10-14T16:13">14-10-2026 04:13 PM</time></div>
</div>
```

Format `DD-MM-YYYY hh:mm AM/PM` (zero-padded day, month, 12-hour hour; `AM`/`PM` uppercase). Updates at each minute boundary and on `visibilitychange` through **one module-level timer** (a `setTimeout` to the next minute, re-armed by itself, started once in `App.init()`), which rewrites every `[data-clock]` in the document (text and `datetime`); Home renders only emit the markup with the current time and never arm a timer. Gap between path and time 3ch. 16 px `--fg`. (Its text is a new node; rule 0.9.)

### 6.3 `/media` (player bar, mini, expanded)

`Song:` and `Author:` are CSS pseudo-element labels in front of the existing title and artist (3.18, 3.20, 3.21), in a fixed 56 px label column with an 8 px gap on all three players so the values align, exactly like the reference's `/Media` window. They use CSS alt text (`/ ""`) so assistive tech never reads them. When nothing is loaded SPEC 6.4 applies unchanged: the mini player stays hidden, the expanded player stays closed, and the desktop bar keeps SPEC's hidden left column.

### 6.4 Falling-petal layer

- Shell: `<canvas id="petals" class="petals flora" aria-hidden="true"></canvas>` directly before `<div id="app">`; CSS in 3.2 and 1.3 (hidden under reduced motion and under `data-motion="off"`).
- App: in `App.init()` after prefs (and only if `Flora.petals` exists, `prefs.petals !== false`, and reduced motion is off) create `Flora.petals(canvas, { count, fill })` (`fill` `'#000'` under invert) and `start()`; set `data-motion="off"` on `<html>` when `prefs.petals === false`. Pause/resume around the expanded player and dialogs (5.7). The toggle is `.fx-petals` next to the filter switcher (4.6); pref key **`petals`**.
- Flora owns: `stop()` clears, dpr cap 1.5, `fill` / `setFill`, `frames`. Shell owns: the canvas element and the CSS hiding rules. App owns: start/stop/pause, the toggle, `data-motion`, `setFill` on filter change.
- Z-order: behind `#app` (petals pass behind every window and text), therefore below `#context-menu` (50), `#dialog-root` (40), `#toast-root` (60) and the tooltip (70).

### 6.5 Flower decorations (complete list)

| place | what | species | count |
|---|---|---|---|
| top bar logo | `i-logo` pixel blossom (32 px) + `wavelength_` | — | 1 |
| Home | readout branch | peony, sakura, ume | 1 |
| library | sprig in the empty bottom | sakura | 1 |
| every cover / artist image | tonal composition | entity species | all |
| Liked Songs cover | heart of blossoms | sakura | 1 |
| hero (playlist, album, artist, liked, user, genre) | hanging sprig at the right edge | context species | 1 per page |
| genre browse tiles | species growing from the corner | genre species (16) | 16 |
| shelves | spray in the first empty slot of a short row | sakura | 0–1 per shelf |
| empty states | bud, twig, ume sprig, seedling | see 3.12 | 1 per state |
| dialog | sprig outside the frame (desktop ≥1024) | peony | 1 |
| toast | pixel blossom bullet | — | 1 |
| progress slider | blossom thumb on hover / always in the expanded player | — | 1 |
| whole screen | falling petals | sakura petals | 8–14 |

### 6.6 Phone `/filter` window (Home, < 768 px only)

`<div class="win win--filter">` + decorative bar (54%) + `<div class="win__title" aria-hidden="true" data-path="/filter"></div>` + the switcher markup of 4.6. `display: none` at ≥ 768 px (the top bar switcher is used there).

### 6.7 Logo

`i-logo` is redrawn as the pixel blossom (grid in section 7; the 13×12 BLOSSOM padded into 16×16). SPEC §0's "four-bar equaliser mark" is superseded by this document: the user asked for flowers everywhere, including the logo.

---

## 7. Icons (owner: shell, `src/index.html` sprite)

- Every `<symbol>` keeps its id and becomes `viewBox="0 0 16 16"` with **one `<path>` made of unit rectangles** (`M x y h w v1 h-w z` runs), `fill="currentColor"` (inherited), no strokes. `.icon { shape-rendering: crispEdges }`. Render only at 16, 32, 48, 64 px.
- Copy `tools/work/design-lead/px.js` to `tools/work/shell/px.js` and edit **the copy** (never another role's folder): write each icon as a 16×16 grid of `.` and `#` in its `GRIDS`, run `node tools/work/shell/px.js check` and `symbols`, and paste the output into the sprite. Eight exemplars are already in the file: `i-logo`, `i-play`, `i-pause`, `i-close`, `i-add-circle`, `i-check-circle`, `i-more`, `i-petal`.
- Rules: 1-cell strokes (the face's stem width at 16 px); diagonals are 1-cell staircases; filled variants are solid; even-symmetric glyphs use the 12×12 box at cols/rows 2–13, odd-symmetric glyphs (needing a centre pixel) the 11×11 box at 2–12; small glyphs (`i-pin`, `i-explicit`, `i-check`) are drawn small (≤ 9 cells) inside the grid so they read at 16 px in a 14 px line.
- `i-verified` is a filled scalloped badge with the check **cut out** (no stroke referencing `var(--fg)`), so it reads in every mode.

| id | 16×16 glyph |
|---|---|
| `i-logo` | 5-petal blossom (exemplar) |
| `i-home` / `i-home-filled` | house outline with a door / solid house with a door cut-out |
| `i-search` / `i-search-filled` | magnifier: 6×6 ring + 3-cell diagonal handle / 2-cell-thick ring |
| `i-library` / `i-library-filled` | two vertical bars + a leaning bar / the same 2 cells thick |
| `i-plus` | 11-cell plus, 1-cell stroke |
| `i-play`, `i-pause` | exemplars |
| `i-next` / `i-prev` | solid triangle + 2-cell bar (mirrored) |
| `i-shuffle` | two crossing paths with arrowheads |
| `i-repeat` / `i-repeat-one` | rectangular loop with an arrowhead / the same with a small `1` inside |
| `i-add-circle` / `i-check-circle` | boxed plus / solid box with a check cut-out (exemplars; the "circle" becomes a square) |
| `i-heart` / `i-heart-filled` | pixel heart outline / solid |
| `i-volume-high` / `-mid` / `-low` / `-off` | speaker + 2 arcs / 1 arc / none / an × |
| `i-queue` | three lines + a small play triangle |
| `i-now-playing` | box with a play triangle |
| `i-more` | three 2×2 dots (exemplar) |
| `i-close` | 10×10 × (exemplar) |
| `i-chevron-left` / `-right` / `-down` | 1-cell chevrons, 4 cells deep |
| `i-arrow-left` | shaft + chevron head |
| `i-clock` | pixel ring with hands |
| `i-list` / `i-grid` | three lines / four 4×4 squares |
| `i-speaker` | the volume-high glyph |
| `i-check` | small check (≤ 9 cells) |
| `i-sort` | three lines of decreasing length |
| `i-browse` | archive box (lid line + slot) |
| `i-pin` | small pushpin (7×9) |
| `i-trash` | bin with lid and two ribs |
| `i-edit` | pencil on a 1-cell diagonal |
| `i-explicit` | 7×7 solid box with an `E` cut out |
| `i-expand` / `i-collapse` | outward / inward corner arrows |
| `i-download` | arrow down onto a base line |
| `i-share` | arrow up out of an open box |
| `i-verified` | scalloped badge, check cut out |
| **new `i-petal`** | a single notched petal (exemplar), used by the petals toggle |

---

## 8. Responsive, motion, contrast

### 8.1 Tablet (768–1023 px)

- Grid as SPEC (rail sidebar 72 px, no right panel, no resizers). Top bar: logo icon only (no wordmark), the search window (prompt per its container query, input ≥ 200 px, ≈ 230 px at 768), the compact switcher `[mono]` (4.6, used everywhere below 1280 px), petals, avatar (budget in 3.3).
- `#main` container ~650–900 px: Home one column below 820 px; card grid 128 px min; hero cover 148, title per 3.9; track table drops Date (SPEC) and keeps one-line rows down to 560 px.
- Player bar: `.pb-npv`, `.pb-cover__expand`, `.pb-vol-pct` hidden; volume 60–90 px.

### 8.2 Phone (< 768 px)

- Grid as SPEC: `main / mini-player / bottom-nav`; top bar, sidebar, right panel, player bar hidden. `--strip-h` 40, `--win-bar-h` 12. `#main` 16 px side padding; no horizontal page scroll at 390 px (`document.documentElement.scrollWidth <= innerWidth`).
- Home stack per 3.6; search header per 3.8; heroes stack (cover 150 centred, title 32 left-aligned below it, sprig 88×120 at the top-right); rows two-line (3.10); menu = bottom sheet with inline submenu (3.14); dialog = `calc(100vw - 32px)`, Edit details stacked, no sprig; toast at the SPEC phone offset above the mini player; mini player (3.20); expanded player (3.21); bottom nav (3.17).
- Every control has a **≥ 44 px hit area; the drawn size may be smaller** (1.5 extenders): chips (strip chips via padding + negative margin, 3.6), filter options, the dialog's live `×`, `[×]` clears, icon buttons and back/forward (`::before` extender, +12 px), row `i-more` 40×40 in a 56 px row, `.mp-like` / `.mp-play` / `.xp-*` 40 + extender, the expanded seek slider 44 px tall, sheet items 44. Inline text links inside rows keep their text size; the row itself is the primary target. Desktop minimum is 24×24 (1.5).

### 8.3 Motion

- Pixel motion uses `steps()`: cursor blink `1.06s steps(1) infinite` (`@keyframes blink { 50% { opacity: 0 } }`), equaliser `steps(4)`, card play reveal `120ms steps(2)`, toast in/out `120ms steps(2)`, speaker blink `steps(1)`. Hover, focus, press and menu/dialog open are instant. The marquee and the petals are the only smooth motion.
- `prefers-reduced-motion: reduce`: no petals (controller never started, canvas hidden by styles.css), cursors static and visible, equaliser bars static, no marquee, no reveals, no transitions (the existing global rule in styles.css stays). The FPS readout keeps sampling (it is not motion).
- **Pause mechanism (WCAG 2.2.2):** the petals toggle is the ambient-motion switch. `:root[data-motion="off"]` (set by `App.setPetals(false)`, 4.6) applies the same rules as reduced motion to the blinking `wavelength_` cursor, the search caret, the library speaker and the marquee (each owner writes its selector next to its reduced-motion rule; the equaliser may keep moving, it is state, not ambient motion).
- **Petals vs text:** petal alpha ≤ .45 (5.7), and the text-dense bars have an opaque `--bg` background so petals pass only through empty space: `#player-bar` (3.2), `.lib-header`, `.rp__head`, `.main-header` (already opaque), and `.track-table__head` (always `background-color: var(--bg)`, not only when stuck).

### 8.4 Contrast minimums (verified values)

- Body text ≥ 7:1 on its ground: `--fg` 21:1; `--fg-2` 8.3:1 (invert `#595959` on white 7.0:1).
- Secondary text ≥ 4.5:1: `--fg-3` 4.6:1 on black (invert 4.5:1); on any filled hover/press area `--fg-3` text is lifted to `--fg-2`.
- `--fg-4` (1.9:1) only for disabled controls and faint rules, never for information.
- Accent text: green `#1ed760` 10.9:1, cyano `#a8c6ff` 12.2:1, mono white 21:1.
- Text over bands and tints, worst case (the brightest possible ground, computed from the filter functions of 1.2 / 1.4 / 4.2 for any input colour):

| ground | modes | worst ground | `--fg` | `--fg-2` | `--fg-3` |
|---|---|---|---|---|---|
| band (`--fx-band`): hero, strip, home head, xp | mono, dither, ink (`grayscale(1) brightness(.22)`), color (`brightness(.22)`), cyano (`url(#fx-cyano) brightness(.22)`) | luminance of `#383838` (0.040) | 11.7:1 | 4.6:1 | 2.5:1 → never used, lifted (3.0a) |
| band | invert (`grayscale(1) invert(1) contrast(.1) brightness(1.9)`) | `#dadada` (0.701) | 15.0:1 (black) | 5.0:1 | 3.3:1 → lifted |
| mini tint (`--fx-tint` over `--mini-color` = colour × .55) | mono, dither, ink, color, cyano | ≤ luminance of `#383838` | 11.7:1 | 4.6:1 | lifted |
| mini tint | invert | `#dadada` | 15.0:1 | 5.0:1 | lifted |
| avatar tint (`--fx-tint` over the raw `--avatar-bg`) | dark modes / invert | 0.4 / `#dadada` | 5.7:1 / 15.0:1 (letter only) | not used | not used |

- Lifted secondary text (`--fg-2`) on the `--hover` fill: 7.2:1.
- Rules and non-text marks ≥ 3:1 where they carry meaning (`--rule` 6.2:1; field boxes and `.menu-search` use `--rule`); dashed `--rule-dim` rules are decoration only.
- The integrator probes, in **invert** and **dither**, the computed ground under: the hero meta/type/desc text of the Late Night Drive and Liked heroes, the strip breadcrumb on a scrolled playlist, the mini player artist line (phone), and the readout `dd` on Home; each must meet the table above.
- Mono screenshots must contain **0 chromatic pixels outside media** (no LCD fringes): `will-change: transform` on `#topbar`, `#player-bar`, `#mini-player`, `#bottom-nav` (styles.css) and on `.main-header`, `.lib-header`, `.rp__head`, `.track-table__head.is-stuck`, `.search-header`, `.context-menu` (desktop only; the phone sheet drops it, 3.14), `.dialog`, each `.toast`, `.tooltip` (app.css). **Never on `.toast-root`** (it contains the fixed tooltip, 3.2). Scroll containers are transparent and composited, which already gives grayscale AA. Probe idea: `tools/work/judge-product/probe.js`.

---

## 9. File ownership and the work split

Common rules for all four:
- Work only inside the project root. No git, no publishing, no `mcp__Claude_Browser__*` tools. Write files with Write/Edit.
- Preservation: keep every existing id, class, `data-*`, `aria-*`, `role` and visible text string. Add classes and elements freely; never rename or remove. Decorative text only via CSS content (`attr()` or literals) or new `aria-hidden` elements. `textContent` of these must not change: `.pb-title`, `.pb-artist`, `.toast`, `.menu-item`, `.dialog__title`, `.dialog__body`, dialog buttons, `.queue-section__title`, `.shelf__title`, `.lib-row`, `.quick-tile`, `.bottom-nav__item`, `.browse-card`, `#right-panel`, hero `h1`, `.track-row__title`, `.chip`. Their `innerText` may differ only by letter case (`text-transform`) and by the text of new elements (rule 0.9); that is expected, not a regression. The one sanctioned role change is the phone inline submenu (`role="group"`, 3.14), a new element state that did not exist before.
- New elements never use the tags `h1`/`h2` or the classes `.chip`, `.card`, `.shelf`, `.shelf__title`, `.track-row`, `.song-row`, `.lib-row`, `.menu-item`, `.cover` (the regression suite counts them). New `<img>`s go **after** the existing cover `<img>` in any element that has one (tests read the first `img`).
- Test with your own page: `node build.js --out=<your-name>` → `http://127.0.0.1:8765/<your-name>.html`; screenshots with `node tools/cdp.js <module> --profile=<your-name> --fresh --url=… --out=tools/shots/<your-name>` (also `tools/tour.js`). Check 1440×900, 1280×800, 1100×800, 900×800, 390×844 and every filter (`App.setFilter(…)` from `c.eval`). `node --check` every JS file you touch; `node src/test-data.js` must pass.
- Each engineer works against the contracts here, not against the others' current code: guard every cross-module call (`typeof window.Flora`, `typeof Catalog.coverSpecies === 'function'`, a second `Catalog.cover` argument is simply ignored by an old data.js).

### 9.a Flora engineer — `src/flora.js`, and only the cover-art functions of `src/data.js`

1. Replace the placeholder `src/flora.js` with `window.Flora` exactly as in 5.2: 19 species (5.3), primitives, `branch`, `sprite` (+ cache), `draw`, `paintCover`, `petals` (with `fill` / `setFill`, `frames`, `stop()` clearing the canvas, backing store capped at dpr 1.5, alpha .3–.45), `speciesFor`, `GENRE_SPECIES`, `HOME_SEED` (chosen per 5.4), `BLOSSOM`, `gridPath`. No DOM access at evaluation time; Node-safe.
2. data.js cover-art functions only (`cover`, `artistImage`, `hasCover`, `playlistMosaic`, the draw helpers, `fontReady`/`watchFonts`, the cache): add the optional `opts` (`variant`), keep accepting id strings including `'liked'` (5.6), add `Catalog.coverSpecies(entityOrId)` (`'liked'` → `sakura`; unknown ids → `''`), build the `spec` per 5.6, delegate to `Flora.paintCover` when available, keep the old drawing as the fallback, switch the font checks to DotGothic16. Do not touch catalogue generation, search, formatters or anything else in data.js. `test-data.js` must still pass unchanged.
3. Deliver a small self-check page or module under `tools/work/flora/` (all 19 species, every cover comp, every sprite kind, the petal layer) and measure the budgets of 5.5; report `HOME_SEED`, timings and PNG sizes.

### 9.b Shell engineer — `src/index.html`, `src/styles.css`, `src/COMPONENTS.md`

1. index.html: the DotGothic16 font link (1.1); `<script src="flora.js"></script>` immediately before `<script src="data.js"></script>` (exact tag form); the redrawn sprite (section 7, all 47 ids + `i-petal`); the `.fx-defs` SVG with the four filters and the static Bayer URIs (4.4); `<canvas id="petals" class="petals flora" aria-hidden="true"></canvas>` directly before `#app`; the inline `data-filter` pre-paint script right after the stylesheet link (4.1). Nothing else in the shell changes.
2. styles.css: the complete token set (1.2) including the shared layout names (`--_side`, `--rail-*`, values per mode), invert overrides (1.4), per-mode filter blocks with the WebKit dither fallback (4.2), base additions (1.3) including the `#petals` reduced-motion / `data-motion` hiding, grid/layout values and container rules (3.2) including `will-change` on the four containers (never on `#app`, `#toast-root`, `#dialog-root` or `body`), the opaque `#player-bar` and the `#petals` layer, scrollbars (3.1), every primitive restyled (3.1, `.cover--24` round, ink frame in `--rule`), the window-chrome primitives (2.1) with the desktop/phone `::after` extenders, the phone `.icon-btn`/`.nav-btn` `::before` extenders (1.5), `.flora` rules, `@keyframes blink` and `eq` (steps). Keep the SPEC breakpoint strings and the rail/right-panel attribute rules.
3. COMPONENTS.md: document the new tokens, the shared layout names, the filter modes and attribute, the `.win*` primitives and markup (decorative bar first, live bar last; the padding-cascade rule), the frame rule of 3.0a, `.flora` and the lazy `data-flora` contract, the hit-extender rules, the icon size rule (16/32/48/64), the `#petals` canvas, the new sprite id, and the glyph coverage list from the header of this document.

### 9.c Player engineer — `src/player.js`, `src/player.css`

1. Markup additions only (all existing classes, labels and handlers stay): player bar `.win__bar` + `.pb-win-title` (3.18) and `.pb-vol-pct` (updated on volumechange, `0%` when muted); mini player `.win__bar` (3.20); expanded player **decorative** `.win__bar` (3.21; no `.xp-min`); set `--fill-q` alongside `--fill` on the volume slider; optionally pass `title` when `.xp-more` opens `App.openContextMenu`.
2. player.css: rewrite every rule in its three containers to sections 3.18–3.21 and 3.19 (sliders), the tint/band layers through `--fx-tint` / `--fx-band` with literal `#000` fallbacks, `Song:`/`Author:` grids (56 px label column, CSS alt text), the `--fg-3` lift on `#mini-player`, `.xp__top`, `.xp__text` (3.0a), the player-bar geometry (52 px content box), the xp safe-area bar and the 44 px xp seek slider, pixel icon sizes (16/32 only), thumbnails `--fx-fine`, corner fragments on the wrappers (`.pb-cover`, `.xp__cover`), steps-based motion, and the reduced-motion and `data-motion="off"` block (marquee). No hues; no font weights above 400.
3. Player covers need no change (tracks use album covers, which have no label variant).

### 9.d App engineer — `src/app.js`, `src/app.css`

1. app.js markup additions: window bars/titles everywhere listed in 2.2/2.3 (sidebar live `-` as the header's last child, right-panel `.rp__close` moved into the slot of a last-child live bar, dialog `.dialog__close` moved into the slot, menu `.menu-target`, shelves, track-table wrapper with file name and `data-meta` = rows rendered, `/time`, `/quick_picks`, `/filter`), the `.main-header__path` breadcrumb (also updated on the partial search render; `main-header--home` on Home), home chips moved into `.main-header__end`, the readout (6.1) with module-level live updates and cached Os/Arch, the clock (6.2, one module-level timer), the filter switcher + compact `.fx-menu-btn` + petals toggle in `#topbar` and the radiogroup on phone Home (4.6), the search window wrapper / prompt / caret (3.3), track-table header cell classes and the `track-table__artist-head` (3.10), browse-card name wrapper + species sprite (3.8), hero sprig with the species resolution of 3.9, shelf spray in `clampShelfRows` (3.7, buckets, `cols > 0` only), library sprig (3.4), empty-state art (3.12), bottom-nav label wrapper (3.17), the `.rp__cover-frame` wrapper (3.13), dialog frame + sprig + `dialog--wide` + `.edit-details__edit` + frame-as-backdrop click (3.15), phone inline submenu with `role="group"` (3.14), `data-cover-variant="thumb"` on covers rendered ≤ 92 px and passing it to `Catalog.cover`/`hasCover` (lib rows, quick tiles, track/song/finder rows, menus, `cover--24/32/40/48`, top result), `state.stripHeight` measured (3.5). **Every flower image goes through the lazy `data-flora` path of 3.0a** (the cover pump paints it; genre sprites pre-warmed in idle time; nothing rendered when Flora is absent); stripHTML's default tint is `'#000000'`.
2. New public API (add-only): `App.setFilter(mode)`, `App.filter()`, `App.setPetals(on)`, `App.petals()`, App event `filter`, `openContextMenu(items, { …, title })`. Prefs keys `filter`, `petals`, `sessionCount`. `data-filter` set on `<html>` in `App.init()` step 2; `data-motion="off"` set while petals are off; petals paused while the expanded player or a dialog is open; `setFill` on filter change.
3. app.css: rewrite every component rule to section 3 (3.3–3.17), the readout/time/filter/quick windows, the filtered layers (`.hero-band`, `.home-head` with `#000` fallback, `.main-header::before`, `.browse-card::before`), the `--fg-3` lift (3.0a), name elements with `text-transform: none` (1.1), the menu item grid placement, the phone sheet (`max-height: 70vh !important`, fixed scrim, no `will-change`), the top-bar width rules (3.3), `will-change` list of 8.4 (never `.toast-root`), steps-based motion, reduced-motion and `data-motion="off"` rules. No hues, no font weights above 400, no radius except round artist covers, no `transform: scale` hovers.

### 9.e Integration checklist (integrator / regression / verifier)

- `node build.js`; `node src/test-data.js`; the regression suite (`node tools/regress/run-all.js <label>` then `compare.js`): all SPEC behaviour unchanged; geometry and colour diffs are expected. **Compare case-folded**: lowercase both the baseline and the current log lines before `compare.js` (or accept case-only diffs), because `text-transform` changes `innerText` case in t04 (ITEM5 queue text), t06 (rp mode text), t07 (hero first line / eyebrow), t08 (`#main` text, top result) and t08b (top result). Diffs that consist only of new-element text (readout, clock, `.fx__opt` / compact filter labels, `.pb-vol-pct`) are also expected (rule 0.9). Any other text diff is a regression.
- Extra checks the suite does not cover: (a) **tooltips**: hover an icon button on desktop for 400 ms; the `.tooltip` must be inside the viewport, adjacent to the button (proves `#toast-root` is not a containing block, 3.2); (b) **roles under `display: contents`**: CDP `Accessibility.getFullAXTree` on a playlist page shows `row > cell > button` for the first row's like and more buttons (3.10); (c) **contrast probes** of 8.4 in invert and dither; (d) **budgets**: a performance trace of the first Home render and of opening Browse shows no task over 50 ms (5.5); (e) the dither WebKit fallback (4.2) is untested on a real iOS device: say so in the report unless a WebKit check was possible.
- Desktop 1440×900 (labelled switcher), 1280×800 and 1100×800 (compact switcher), plus 1280×800 with the sidebar dragged to 420 px, tablet 900×800, phone 390×844, each in all six filters: no console errors; no horizontal scroll at 390; the search input is ≥ 200 px wide at every desktop/tablet size; covers never appear in colour except under `color`; under `invert` every text over a tint or band is dark on light and no untinted page shows a grey band; 0 chromatic pixels outside media in a mono screenshot; menus flip near edges and on phone are sheets no taller than 70vh; the toast sits bottom-centre above the player / mini player; petals stay behind menus, dialogs and toasts, pause under the expanded player and dialogs, and disappear under reduced motion and when toggled off (canvas cleared); the Home branch is an open branch, not clipped; no decorative flower overlaps a control, a dialog border or text (hero sprigs end inside the hero; `.actions` sits above them).
- The brand word banned by SPEC §0 appears in no file (static check on `dist/index.html` and every `src/` file); all content stays fictional (the readout's local environment values are the declared exception, 6.1).

---

## Resolutions (critic round, one line per change)

1. [blocker] Tooltip vs `#toast-root`: `will-change` removed from `.toast-root` (3.16, 8.4) and put on each `.toast` and on `.tooltip`; 3.2 now says the tooltip lives inside `#toast-root` and that `#toast-root`, `#dialog-root`, `#context-menu`'s ancestors and `body` never get transform/filter/will-change/contain/backdrop-filter; 9.e adds a tooltip-position check.
2. [major] Rule 0.9 reworded (textContent unchanged; innerText may differ only by case and by new-element text); the section 9 preservation list is textContent-only; 9.e tells the regression role to compare case-folded logs and names the expected t04/t06/t07/t08/t08b case diffs.
3. [major] Frames: new 3.0a rule "never decorate a filtered `img.cover`; frames go on unfiltered wrappers"; ink frame changed to `--rule` (3.1, 4.2 table, 4.5); selected rows lose the cover outline (3.0, 3.10); corner fragments moved to wrappers (2.1) with a new `.rp__cover-frame` wrapper (3.13); card hover outline pinned to `.card__cover` (3.7).
4. [major] Untinted fallbacks are literal black: `.home-head` `var(--home-tint, #000)`, stripHTML default `'#000000'`, `--mini-color` / `--xp-color` fallbacks `#000` (1.4, 3.5, 3.6, 3.20, 3.21).
5. [major] Contrast: dark-mode bands `brightness(.22)` in mono/dither/ink/color/cyano (1.2, 4.2, 4.3 cyano fallback); invert band and tint `grayscale(1) invert(1) contrast(.1) brightness(1.9)` (1.4); dither tint `grayscale(1) brightness(.4)` (4.2); 3.0a lifts `--fg-3`/`--fg-muted` to `--fg-2` in every band/tint container; 4.3 clamps and the 8.4 table rewritten for `--fg`/`--fg-2`/`--fg-3` in all modes; integrator probes added (8.4); hero band values updated (3.9).
6. [major] Lazy flower sprites: 3.0a `data-flora` contract painted by the existing cover pump, nothing rendered without Flora, genre sprites pre-warmed in idle time; sprays drawn in fixed 128/160/192 buckets scaled by CSS and only when `cols > 0` (3.7); the 50 ms task budget applies to every route (5.5); readout, library sprig, empty art, browse tiles, hero and dialog sprigs all use the lazy path.
7. [major] Top bar width: budget written in 3.3 for the default and the dragged (420 px) sidebar; three tiers: radiogroup + `filter:` label at ≥ 1440 px, radiogroup without label at 1280–1439 px, new compact `.fx-menu-btn` (`[mono]` + chevron, opens a checked-items menu via `openContextMenu`) below 1280 px (4.6, 8.1); the `> look_in.txt` prompt shortens to `>` through a container query on `.search-win` (< 400 px), so it reacts to the sidebar width too; `.search-pill__input { min-width: 200px }`; `.topbar__home` is never hidden.
8. [major] Phone strip chips: 44 px hit height via padding plus matching negative margins (their pseudos are the brackets), strip stays 40 px; `~/home` path hidden on Home on phone via the new `.main-header--home`; the SPEC 8.3 override is declared explicitly (header and 3.6).
9. [major] Hero sprig sized to the hero: 160×176 desktop / 140×156 tablet at `top: 8px`; `.actions { position: relative; z-index: 1 }`; `.hero--genre` gets `min-height` 200/180/136 and the standard sprig; tablet hero padding-right 156 (3.9).
10. [major] Expanded player: the bar is decorative (no `.xp-min`; `.xp-close` stays the close control), positioned at `env(safe-area-inset-top)`, padding-top includes the bar, cover reserve 392 px (2.2, 3.21, 9.c). Chosen over the live-button variant because it removes both the notch and the `.xp-more` overlap problems.
11. [minor] Song/Author grids use a fixed `56px` label column with an 8 px gap on all three players; the "empty labels still show" clause is deleted (SPEC 6.4: mini hidden, expanded closed) (3.18, 3.20, 3.21, 6.3).
12. [minor] Song/Author labels use CSS alt text (`content: "Song:" / ""`, with a plain fallback declaration first) so assistive tech never reads them out of order.
13. [minor] Context menu items get explicit grid columns for icon/label/chevron/check; the danger `! ` inherits `--sel-fg` on the inverted hover (3.14).
14. [minor] Phone sheet: `max-height: 70vh !important`; inline submenu `role="group"` + `aria-label`, `max-height: none !important`; scrim is a fixed `::before` with `pointer-events: none`; no `will-change` on the sheet (3.14, 8.4).
15. [minor] State precedence selected > current > hover; every descendant of `.is-selected` uses `--sel-fg`; selected focus ring `--sel-fg` at `-3px` (3.0, 3.10).
16. [minor] Readout: the empty `.readout__gap` div is replaced by `.readout__row--gap` with `margin-top` (6.1).
17. [minor] Timers: one module-level clock timer for every `[data-clock]`; FPS reuses the petal loop's new `frames` counter or samples 1 s every 5 s; Os/Arch cached per page load; renders never arm timers (5.2, 6.1, 6.2).
18. [minor] Breadcrumb: the partial search render updates `.main-header__path`; the path ellipsises; phone slugs capped at 20 chars (3.5).
19. [minor] Track table: the new head cell is `.track-table__artist-head` without `.cell`; the false "suite checks roles" claim is replaced by an AX-tree verification step; the date-less `--cols` are written out (3.10, 9.e).
20. [minor] `.cover--24` stays round (3.1); name-bearing elements keep their case with `text-transform: none` (1.1, 3.13).
21. [minor] Hit areas: phone `::before` extender for icon and nav buttons (with exclusions for `.win__btn` and bracketed clears), desktop 24 px targets for `- ×`, clears and expand, 44 px xp seek slider; 8.2 reworded to "≥ 44 px hit area (drawn size may be smaller)" (1.5, 2.1, 3.19, 8.2).
22. [minor] Glyph coverage measured with `tools/work/design-lead/glyphs2.js`: `▶ ▾ ▸ ↗ ℗` are missing from DotGothic16; `▾`/`▸` always mean pixel chevron icons, `[↗]` is a box around `i-expand`, `℗` stays content text; recorded in the header, to be copied into COMPONENTS.md (9.b).
23. [minor] Live bars are the last child of their window for a correct focus order (2.1, 3.4, 3.13, 3.15).
24. [minor] `.win` padding cascade rule with the list of owners; `#player-bar` padding written as `calc(var(--win-bar-h) + 22px)` (2.1, 3.18).
25. [minor] Petals ownership: styles.css hides `#petals` under reduced motion and `data-motion="off"`; `stop()` clears; backing store capped at dpr 1.5; `fill` / `setFill('#000')` under invert replaces the CSS invert (`.flora:not(canvas)`); paused under the expanded player and dialogs; toggle `aria-disabled` under reduced motion (1.3, 4.6, 5.2, 5.7, 6.4).
26. [minor] Motion a11y: the petals toggle is the ambient-motion switch (`data-motion="off"` stops blinks and the marquee); petal alpha .3–.45; opaque `--bg` on `#player-bar` and the track-table head (3.2, 3.10, 8.3).
27. [minor] Shared layout names `--_side`, `--rail-hide`, `--rail-cols`, `--rail-pad`, `--rail-just`, `--rail-dir` fixed in 1.2 with per-mode values.
28. [minor] The mock is declared non-contract with the six differing name pairs (header); the shell edits a copy of px.js in `tools/work/shell/` (7).
29. [minor] Dialogs: `openDialog` adds `dialog--wide` for Edit details; new `.edit-details__edit` glyph span; `.dialog-frame` hugs the dialog and frame clicks count as backdrop clicks (3.15).
30. [minor] Inline pre-paint script sets `data-filter` from `wl:prefs` before first paint (4.1, 9.b).
31. [minor] Field boxes and `.menu-search` use `--rule` at rest (3:1); prompt fields show a solid `--fg` underline on `:focus-within`; empty volume cells use `--fg-3` (3.9, 3.14, 3.15, 3.19).
32. [minor] Player bar geometry fits: 32 + 4 + 16 = 52 (`.pb-time` 14/16, `row-gap: 4px`); desktop toast offset `+ 16px` (SPEC); toast `min-height: 36px`, `max-width`, wraps instead of ellipsis because its text node is a direct child (3.16, 3.18).
33. [minor] API gaps: `Catalog.cover`/`hasCover` accept id strings incl. `'liked'`; `coverSpecies('liked')` → `sakura`; `plu_*` and genre hero species resolved by app.js; no `img` when Flora is absent; `data-meta` = rows rendered (3.0a, 3.9, 3.10, 5.6, 9.a).
34. [minor] WebKit dither fallback via `@supports (-webkit-touch-callout: none)`; flagged as untested on a real device in 9.e (4.2).
35. [minor] Readout: real local environment values declared an intended exception (never stored or sent); fixed values under `navigator.webdriver` for deterministic snapshots (6.1, 9.e).

## Resolutions (fixer round after the fidelity / accessibility / bugs critics)

36. [high] Cover text font: `fontReady()` checks `document.fonts.check('22px DotGothic16', CHECK_TEXT)` with the cover characters (`0-9`, `> `, `a-z`, `…`); `watchFonts()` loads that text at once (`document.fonts.load`); after the flush Catalog fires `catalog:coversstale` on `window` and app.js puts painted `img.cover`s (new `data-cover-key`) whose cover is no longer cached back into the lazy pump (5.6).
37. [medium] Running text face is VT323 20 / 18 px (rule 2, 1.1); DotGothic16 stays for 32 / 48 px titles, cover text and CJK.
38. [medium] Decorative pseudo-content carries empty alt text (`content: X; content: X / "";`) everywhere except `.topbar__word` and `.track-table__artist-head` (aria-hidden, real words).
39. [medium] Phone `/filter`: options wrap (`flex-wrap`, every option ≥ 44 px), the petals toggle never overlaps an option (6.6). Phone hit areas: dialog `×` 40×44, chips `min-width: 44px`, back button 44×48, finder input and dialog fields 40 px tall, expanded-player artist links 40 px tall.
40. [medium] Narrow `#main` (container queries): readout compacts at ≤ 600 px and stacks at ≤ 360 px, labels ellipsize; search top result and songs stack at ≤ 640 px; the clock ellipsizes.
41. [medium] `.win__title[data-meta]` is a flex row: the prompt ellipsizes, the count keeps a 1ch gap (2.1).
42. [medium] Dither genre tiles: field darkened (`brightness(.45)`) before the 1-bit filter and the flower gets a 1 px black edge; mono / cyano tiles get `brightness(.55)` plus a radial falloff (3.8).
43. [low] Phone `.main-header` bar inset 16 px; artist "Popular" heading is the prompt of its list window (`.win--headed`, no second `> popular.m3u` head); generic right-panel titles read `> /Queue`, `> /Now playing` (the path span hides); petals 10–16 px (largest at .5–.6 alpha, 5.7); `i-petal` = the 13×12 blossom shedding two petals, toggle on = `[✿]` brackets, hover only fills (4.6); Liked cover = dark violet radial field (peak luminance ≈ .24) with a traced heart of 17 sakura blossoms (5.6); library sprig shrinks instead of overflowing; idle `/media` shows `Song:` / `Author:` and the cover corner fragments (CSS, alt ""), `.is-empty .pb-time` `--fg-3`.
44. [low] Toggles (`.icon-btn--dot`): on = hairline box (`inset 0 0 0 1px currentColor`) + 12 px bar; hover / focus on an off toggle only fills. Decorative `- ×` in `--fg-3`, working `.win__btn` in `--fg` with a `--hover` fill (2.1, 3.1).
45. [low] Collapsed filter inputs are `visibility: hidden` until `.is-open`; skip links ("Skip to main", "Skip to player", desktop and tablet, first in `#app`); explicit-badge slot reserved on every wide track row and the artist head indented 22 px; `.lib-chips` gap 6 px; slugs keep any letters (`\p{L}\p{N}`) and end in `…` when cut; hover tooltips are not opened by touch taps.
