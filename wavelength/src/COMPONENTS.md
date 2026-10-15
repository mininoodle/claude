# Wavelength / terminal — COMPONENTS.md

What `src/styles.css` and the static shell in `src/index.html` give every other
file. Copy the snippets verbatim: the class names, modifiers, state classes,
tokens and data attributes below are what the CSS keys on. The binding visual
contract is `DESIGN.md` (section numbers in brackets, e.g. [2.1]); SPEC.md stays
the behaviour contract.

Two parts:

- **Part A — contract layer (styles.css + index.html).** Tokens, filter modes,
  base, the `#app` grid, window chrome, primitives, flora/petal hooks, hit-area
  extenders, icons, glyph coverage. app.js / player.js and their CSS may rely on
  everything here.
- **Part B — component markup reference.** The DOM that app.js / player.js
  render (unchanged ids, classes, aria and text). Its *look* lives in app.css /
  player.css and is specified by DESIGN.md §3; Part B only records the markup.

Conventions (unchanged):

- Icons: `<svg class="icon" aria-hidden="true"><use href="#i-name"/></svg>`.
- Every play button holds **both** `i-play` and `i-pause`; the inactive one has
  the `hidden` attribute. CSS never flips icons; JS toggles `hidden`.
- State classes: `.is-current`, `.is-playing`, `.is-selected`, `.is-active`,
  `.is-liked`, `.is-open`, `.is-visible`, `.is-stuck`, `.is-disabled` / `disabled`.
  Their looks are the state vocabulary of DESIGN [3.0] (hover = `--hover` fill,
  current = `▷ ` + bitmap bold, playing = stepped meter, selected = inverted
  block, focus = 1 px dashed ring, pressed = inverted + 1 px shift, disabled =
  `--fg-4`; precedence selected > current > hover).
- Visibility: toggle with the `hidden` attribute (`[hidden]{display:none!important}`).
- Colours per entity go in inline custom properties, never inline `background`:
  `--hero-color`, `--browse-color`, `--mini-color`, `--xp-color`, `--home-tint`,
  `--strip-tint` / `--strip-opacity`. They are only ever painted on a layer that
  carries `filter: var(--fx…)` (Part A §3).
- Preservation: never change the `textContent` of an existing element.
  Decoration is CSS content (`::before`/`::after`, `attr()`, `text-transform`)
  or a **new `aria-hidden` element**. New elements never use `h1`/`h2` or the
  classes `.chip .card .shelf .shelf__title .track-row .song-row .lib-row
  .menu-item .cover`; new `<img>`s go after the existing cover `<img>`.

Live preview of everything in Part A: `node tools/work/shell/make-preview.js`
then `http://127.0.0.1:8765/preview-icons.html?m=mono|dither|invert|color|cyano|ink`.

---

# Part A — contract layer

## A1. Static shell (`src/index.html`)

Order (fragment; `build.js` inlines the stylesheet and the `<script src>` tags):

```html
<title>Wavelength</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&family=VT323&display=swap">
<link rel="stylesheet" href="styles.css">
<script>/* pre-paint: copies wl:prefs.filter onto <html data-filter> (A3) */</script>
<svg class="sprite" …>48 <symbol>s, viewBox 0 0 16 16</svg>
<svg class="fx-defs" …>#fx-dither #fx-dither-fine #fx-cyano #fx-ink</svg>
<canvas id="petals" class="petals flora" aria-hidden="true"></canvas>
<div id="app" class="app"> …unchanged children… </div>
<div id="context-menu" class="context-menu" role="menu" hidden></div>
<div id="dialog-root"></div>
<div id="toast-root" class="toast-root" aria-live="polite"></div>
<script src="flora.js"></script>   <!-- immediately before data.js -->
<script src="data.js"></script>
<script src="audio.js"></script>
<script src="player.js"></script>
<script src="app.js"></script>
```

- `#petals` is the only new static container. It sits **before** `#app`,
  `position: fixed; inset: 0; z-index: 0`, transparent, `pointer-events: none`.
  `#app` is `position: relative; z-index: 1`, so petals drift behind every
  window and never over `#context-menu` (50), `#dialog-root` (40),
  `#toast-root` (60) or the tooltip (70). styles.css hides it under
  `prefers-reduced-motion: reduce` and under `:root[data-motion="off"]`.
  Flora draws it (`Flora.petals(canvas, { count, fill })`), app.js starts /
  stops it (DESIGN [5.7], [6.4]).
- `.fx-defs` and `.sprite` are hidden with `position:absolute;width:0;height:0;overflow:hidden`
  (never `display:none`, which breaks `<use>` and `url(#filter)` references).

## A2. Tokens (`:root`) [1.2]

Ink (the only UI colours): `--bg #000`, `--fg #fff`, `--fg-2 #a3a3a3` (8.3:1,
secondary), `--fg-3 #757575` (4.6:1, meta/labels/placeholders/brackets),
`--fg-4 #3a3a3a` (disabled and faint separators only, never information),
`--rule #8c8c8c` (window hairlines, field boxes), `--rule-dim #333` (dashed
decoration rules), `--hover #161616`, `--press #262626`, `--sel-bg` = `--fg`,
`--sel-fg` = `--bg`, `--shadow-hard #262626`, `--scrim-a` / `--scrim-b`
(backdrop checker), `--cover-empty #111`.

Signal colours follow the filter mode: `--accent` (= `--fg` except `color`
`#1ed760` and `cyano` `#a8c6ff`), `--accent-hover`, `--accent-press`,
`--on-accent` (= `--bg`), `--danger`, `--verified`.

SPEC §2 names are kept and remapped, so old rules keep working:
`--bg-base/--bg-panel/--bg-elevated/--bg-menu` = `--bg`; `--bg-highlight` =
`--press`; `--bg-tinted` = `--hover`; `--bg-tinted-strong #1f1f1f`;
`--bg-tinted-press #0d0d0d`; `--fg-sub` = `--fg-2`; `--fg-muted` = `--fg-3`;
`--border` = `--rule-dim`; `--liked-a/-b/--liked-hero/--avatar-bg` (colours that
are only painted on filtered layers); `--shadow-cover: none`; `--shadow-menu:
6px 6px 0 var(--shadow-hard)`; `--shadow-toast: none`; all radii `0`;
`--selected` = `--sel-bg`; `--tile-hover` = `--hover`; `--overlay
rgba(0,0,0,.6)`; `--backdrop rgba(0,0,0,.75)`; `--focus-ring: none`.

Type: `--font` (`'VT323', 'DotGothic16', 'MS Gothic', 'Osaka-Mono', ui-monospace,
'Cascadia Mono', Consolas, monospace`; running text), `--font-display` (the same stack without VT323; 32/48 titles),
`--fs-s 18px / --lh-s 20px` (meta), `--fs 20px / --lh 22px` (body), `--fs-cjk 16px`, `--fs-l 32px / --lh-l 38px` (title),
`--fs-xl 48px / --lh-xl 52px` (display), `--bold: 1px 0 0 currentColor`
(bitmap bold: `text-shadow: var(--bold)`; weight is always 400).

Window chrome: `--win-bar-h` (14px; 12px on phone), `--win-ctl-w 34px`,
`--dash` / `--dash-dim` (3 px on / 2 px off horizontal dashes in `--rule` /
`--rule-dim`; use as `background` of a 1 px tall box), `--corners` (the two
corner fragments, 22 px left + 30 px right, for a 1 px `::after` under a cover
wrapper), `--blossom-mask` (13×12 pixel blossom as a CSS mask) and
`--blossom-img` (the same blossom as a white image; black under invert).

Layout: `--gap 16px` (column gap and resizer width), `--gap-y 10px` (row gap),
`--topbar-h 48px`, `--strip-h 44px` (40 on phone), `--player-h 92px`,
`--sidebar-w 288px`, `--sidebar-rail-w 72px`, `--right-w 300px`,
`--bottom-nav-h 56px`, `--mini-player-h 72px`.

Media filter: `--fx` (covers, images, colour fields), `--fx-fine` (thumbnails
≤ 48 px), `--fx-tint` (small tint layers under text: avatar, mini player),
`--fx-band` (large faded bands: hero, strip, home head, expanded player).

**Shared layout names** (styles.css sets them in rail mode; app.css consumes them
with the full-mode fallback written in its own `var()`):

| name | full sidebar (fallback in app.css) | rail (desktop `data-sidebar="rail"` and tablet) |
|---|---|---|
| `--_side` | `var(--sidebar-w)` (set on `#app`) | `var(--sidebar-rail-w)` |
| `--rail-hide` | unset → `inline` / `flex` / `block` per rule | `none` |
| `--rail-cols` | `2ch 40px minmax(0,1fr) auto` | `48px` |
| `--rail-pad` | `0 6px` | `4px` |
| `--rail-just` | `space-between` (header) / `start` (rows) | `center` |
| `--rail-dir` | `row` | `column` |

## A3. Filter modes [4]

The mode lives on `<html data-filter="mono|dither|invert|color|cyano|ink">`.
Missing attribute = `mono` (the `:root` defaults are mono, so covers are grey
from the first paint). The inline pre-paint script in index.html copies a saved
`wl:prefs` `filter` onto `<html>` before anything paints; app.js sets it
authoritatively in `App.init()` step 2 and on every `App.setFilter(mode)`.

| mode | `--fx` | `--fx-fine` | `--fx-tint` | `--fx-band` | accent |
|---|---|---|---|---|---|
| `mono` | `grayscale(1) contrast(1.12) brightness(1.02)` | = `--fx` | `grayscale(1) brightness(.4)` | `grayscale(1) brightness(.22)` | white |
| `dither` | `url(#fx-dither)` (2 px Bayer) | `url(#fx-dither-fine)` (1 px) | `grayscale(1) brightness(.4)` | `grayscale(1) brightness(.22)` | white |
| `invert` | `grayscale(1) invert(1) contrast(1.1)` | = `--fx` | `grayscale(1) invert(1) contrast(.1) brightness(1.9)` | same as tint | black |
| `color` | `none` | `none` | `brightness(.4)` | `brightness(.22)` | `#1ed760` |
| `cyano` | `url(#fx-cyano)` | `url(#fx-cyano)` | `url(#fx-cyano) brightness(.4)` | `url(#fx-cyano) brightness(.22)` | `#a8c6ff` |
| `ink` | `url(#fx-ink)` (black / 42% / white) | `url(#fx-ink)` | `url(#fx-ink) brightness(.4)` | `grayscale(1) brightness(.22)` | white |

- **invert flips the UI tokens** (`--bg #fff`, `--fg #000`, `--fg-2 #595959`,
  `--fg-3 #767676`, `--fg-4 #c4c4c4`, `--rule #737373`, `--rule-dim #ccc`,
  `--hover #ebebeb`, `--press #d9d9d9`, scrims, `--overlay`, `--backdrop`,
  `--blossom-img` → black, `color-scheme: light`). Never implement invert with
  `filter: invert()` on `html`, `body`, `#app` or any ancestor of a fixed element.
- `.flora` images get `filter: invert(1)` under invert (white silhouettes become
  black ink); the petal canvas is excluded and draws black itself.
- WebKit (iOS) falls back to `grayscale(1) contrast(1.8)` for dither
  (`@supports (-webkit-touch-callout: none)`; untested on a real device).
- **Untinted fallbacks are literal black**, never a flipping token:
  `var(--home-tint, #000)`, `var(--mini-color, #000)`, `var(--xp-color, #000)`,
  stripHTML default `'#000000'`. Through `--fx-band`/`--fx-tint` black stays
  black in the dark modes and becomes light under invert.
- **No `--fg-3` over a band or tint**: a container whose ground can be a band or
  tint re-declares `--fg-3: var(--fg-2); --fg-muted: var(--fg-2);` (both names).

Filtered layer pattern (owners copy this; the colour property name varies):

```css
.hero-band { position: absolute; …; background: var(--hero-color); filter: var(--fx-band);
             mask-image: linear-gradient(#000 0, transparent 100%); }
#mini-player::before { content: ""; position: absolute; …; background: var(--mini-color, #000); filter: var(--fx-tint); }
.browse-card::before { content: ""; position: absolute; inset: 0; z-index: -1; background: var(--browse-color); filter: var(--fx); }
```

## A4. Base and fonts [1.1, 1.3]

- `body { font: var(--fs)/var(--lh) var(--font); font-synthesis: none; background: var(--bg); color: var(--fg) }`.
  `b, strong, h1–h4` are weight 400. Allowed sizes: 14 / 16 / 32 / 48 with the
  line-heights of A2 (exception `.pb-time` 14/16). No fractional
  letter-spacing, no `transform: scale()` on text.
- Only fixed UI copy is lowercased (`text-transform: lowercase`): headings,
  buttons, chips, navigation, eyebrows, menu heads, window titles. Content
  (track/artist/album/playlist names, descriptions, toasts, dialog bodies, menu
  item labels) keeps its case.
- `:focus-visible { outline: 1px dashed var(--fg); outline-offset: 2px; box-shadow: none }`
  (rows use `outline-offset: -1px`; a selected row `outline-color: var(--sel-fg); outline-offset: -3px`).
- `button:disabled { color: var(--fg-4) }`; placeholders `--fg-3`;
  `caret-color: var(--fg); caret-shape: block`; `::selection` inverted.
- `@keyframes blink { 50% { opacity: 0 } }` — use as
  `animation: blink 1.06s steps(1) infinite` for `_` cursors and the library
  speaker; switch it off under reduced motion (global rule) **and** under
  `:root[data-motion="off"]` (write that selector next to your rule).
- `prefers-reduced-motion: reduce` kills every transition and animation
  globally (existing rule). Hover/focus/press are instant (`transition: none`);
  reveals use `steps()`.

## A5. Grid and containers [3.2, SPEC §10]

- Desktop: `.app { grid-template-rows: var(--topbar-h) minmax(0,1fr) var(--player-h);
  gap: var(--gap-y) var(--gap); padding: 8px 16px 10px }`. Columns
  `var(--_side) minmax(0,1fr)` (+ `var(--right-w)` when
  `#app[data-right="now-playing"|"queue"]`). Panels (`#sidebar`, `#main`,
  `#right-panel`) are transparent, radius 0, scroll internally; `#topbar` is
  transparent; `#player-bar` has an opaque `--bg` (petals never pass behind its
  text).
- `will-change: transform` on `#topbar`, `#player-bar`, `#mini-player`,
  `#bottom-nav` (grayscale anti-aliasing: no LCD colour fringes). **Never** on
  `#app`, `body`, `#toast-root`, `#dialog-root` (they contain fixed elements:
  `#expanded-player`, the tooltip). Never place a `position: fixed` element
  inside `#main`, `#topbar`, `#player-bar`, `#mini-player` or `#bottom-nav`.
- Tablet 768–1023: rail sidebar (72), no right panel, no resizers. Phone
  < 768: `main / mini-player / bottom-nav`, no gaps or padding; `#bottom-nav`
  `background: var(--bg); border-top: 1px solid var(--rule)`; `#expanded-player`
  fixed full screen (z 30).
- Resizers: 16 px wide in the column gaps, a 1 px `--rule` line on hover /
  `.is-dragging`. Breakpoint strings and the `data-right` / `data-sidebar`
  attribute rules are unchanged (SPEC §10).
- Scrollbars on `#sidebar, #main, #right-panel, #expanded-player, .context-menu`:
  6 px, square thumb `--fg-4`, `--rule` on hover, transparent track.

## A6. Window chrome [2.1]

```html
<!-- decorative bar: rule + "- ×", hidden from AT; FIRST child of its window -->
<div class="win__bar" aria-hidden="true" style="--rule-w:72%"></div>

<!-- live bar: rule + real buttons in the "- ×" slots (one or both may be live); LAST child of its window -->
<div class="win__bar win__bar--live" style="--rule-w:92%">
  <span class="win__ctl">
    <button type="button" class="win__btn win__btn--min" aria-label="Collapse Your Library"></button>
    <span class="win__btn win__btn--close" aria-hidden="true"></span>      <!-- decorative slot -->
  </span>
</div>

<!-- an existing icon button moved into a slot: keep ALL its classes, add win__btn + the slot class -->
<button class="icon-btn rp__close win__btn win__btn--close" aria-label="Close"><svg class="icon" aria-hidden="true"><use href="#i-close"/></svg></button>

<!-- prompt title / path: the text lives in attributes, so textContent never changes -->
<div class="win__title" aria-hidden="true" data-path="/quick_picks" data-meta="8 items"></div>
<span class="win__path" aria-hidden="true" data-path="/time"></span>

<!-- a full window -->
<div class="win win--time">
  <div class="win__bar" aria-hidden="true" style="--rule-w:72%"></div>
  <div class="win__title" aria-hidden="true" data-path="/quick_picks"></div>
  …content…
</div>

<!-- a window closed by the dashed rule (look_in.txt) -->
<div class="search-win win win--dashed"><div class="win__bar" aria-hidden="true" style="--rule-w:62%"></div>…</div>

<!-- an existing heading as a window title: CSS adds "> " -->
<h2 class="queue-section__title prompt">Next in queue</h2>
```

| class | what it draws |
|---|---|
| `.win` | `position: relative; padding-top: var(--win-bar-h)` (the bar's space) |
| `.win__bar` | absolute strip at the top, `height: var(--win-bar-h)`, z 1, `pointer-events: none`; `::before` = the 1 px `--rule` hairline that stops short (`width: min(var(--rule-w, 84%), calc(100% - var(--win-ctl-w) - 12px))`); `::after` = `-  ×` in 14 px `--fg-2` at the right |
| `.win__bar--live` | no drawn `::after`; holds `.win__ctl` instead |
| `.win__ctl` | the right-end slot row (flex, gap 6, `pointer-events: auto`) |
| `.win__btn` + `--min` / `--close` | 14 px glyph `-` / `×` via `::before` (no text node, so `textContent` is empty and the app tooltip shows the `aria-label`); `--fg` (the inert decorative `- ×` and a `span.win__btn` are `--fg-3`), hover `--hover` fill, `:active` inverted; any `.icon` inside is hidden; a `span.win__btn` is inert. Hit area: `::after` extender, 24×24 on desktop, 44 px tall on phone |
| `.win__title` | block line 22 px, `> ` + `attr(data-path)`; optional `data-meta` floats right in 14 px `--fg-3`; ellipsis |
| `.win__path` | the same prompt inline (`inline-block`), e.g. before the clock or a panel title |
| `.win--dashed` | `padding-bottom: 6px` + a 1 px `--dash` rule along the bottom (`::after`) |
| `.prompt` | `::before { content: "> " }` for an existing heading |
| `.rule-dash` / `.rule-dash--dim` | **new**: a standalone 1 px dashed rule (`--dash` / `--dash-dim`): `<div class="rule-dash" aria-hidden="true"></div>` |

Rules:

- `--rule-w` is set inline per window (DESIGN [2.3]: search 62%, sidebar 92%,
  strip 94%, `/time` 72%, `/quick_picks` 86%, shelves 74/58/80/66% by index,
  track list 66%, `/filter` 54%, right panel head 88% / cards 70%, player bar
  100%, mini 80%, expanded 76%, menu 70% / submenu 60%, dialog 64%).
- **Padding cascade.** `.win` is in styles.css, which is inlined *before*
  player.css and app.css. Any owner rule with a `padding` shorthand on a window
  silently removes the bar's space, so owners write
  `padding-top: calc(var(--win-bar-h) + Npx)` (or the shorthand with that first
  value): `.lib-header`, `.main-header`, `.rp__head`, `.shelf`,
  `.playlist-finder`, `.rp-card`, `.win--table`, `.win--quick`, `.win--time`,
  `.win--filter`, `.search-win`, `#player-bar`. Sticky / fixed owners override
  `.win`'s `position: relative`; the bar still anchors to them.
- An owner rule that gives a moved-in icon button its own size must not beat
  `.win__ctl .win__btn` (specificity 0,2,0); scope extra rules as
  `.win__ctl .rp__close` if needed.
- Corner fragments under a framed cover go on the cover's **unfiltered wrapper**:
  ```css
  .pb-cover { position: relative; }
  .pb-cover::after { content: ""; position: absolute; left: 0; right: 0; bottom: -7px; height: 1px; background: var(--corners); }
  ```
  (`.pb-cover`, `.hero__cover`, `.rp__cover-frame`, `.xp__cover`).

## A7. Primitives [3.1]

### Icon
```html
<svg class="icon" aria-hidden="true"><use href="#i-play"/></svg>              <!-- 16 -->
<svg class="icon icon--lg" aria-hidden="true"><use href="#i-play"/></svg>     <!-- 32 -->
<svg class="icon icon--xl" aria-hidden="true"><use href="#i-logo"/></svg>     <!-- 48, new -->
<svg class="icon icon--xxl" aria-hidden="true"><use href="#i-logo"/></svg>    <!-- 64, new -->
```
16×16 pixel grid, `fill: currentColor`, `shape-rendering: crispEdges`, `flex: none`,
`pointer-events: none`. `.icon--sm` and `.icon--xs` are 16 too (small glyphs are
drawn small inside the grid). **Any CSS that resizes an icon uses 16, 32, 48 or
64 only** (other sizes blur the pixels).

### Icon button
```html
<button class="icon-btn" aria-label="More options"><svg class="icon" aria-hidden="true"><use href="#i-more"/></svg></button>
<button class="icon-btn icon-btn--dot is-active" aria-label="Queue">…</button>   <!-- accent icon, 1px hairline box + 12×2 bar under it; hover on an off toggle only fills -->
<button class="icon-btn icon-btn--lg" …>      <!-- 40×40 -->
<button class="icon-btn icon-btn--round" …>   <!-- square with a 1px --rule-dim border -->
```
32×32 square, `--fg-2`; hover `--fg` + `--hover` fill; `:active` inverted +
1 px shift; `.is-active` `--accent`; disabled / `.is-disabled` `--fg-4`, no hover.
`position: relative` in the base rule (an owner may position one absolutely).
`.nav-btn` (back / forward, drawn by app.css) gets the same `position: relative`
anchor from styles.css for its hit extender.

### Play button
```html
<button class="play-btn" aria-label="Play Daily Mix 1" data-context-uri="playlist:pl_dailymix1">
  <svg class="icon" aria-hidden="true"><use href="#i-play"/></svg>
  <svg class="icon" aria-hidden="true" hidden><use href="#i-pause"/></svg>
</button>
```
Square block, radius 0: 32×32 (icon 16), `--accent` fill, `--on-accent` glyph;
hover `--accent-hover`; `:active` `--accent-press` + 1 px shift; disabled
`--fg-4` fill. `.play-btn--lg` 40×40 (icon 16); `.play-btn--xl` 64×64 (icon 32);
`.play-btn--white` 32×32 `--fg` fill, `--bg` glyph, hover a neutral 84 % mix of
`--fg` into `--bg` (never a hue); `.play-btn--white.play-btn--xl` 64 (icon 32).
Any `.icon` inside a play button is forced to 16 (32 in `--xl`). No scale on
hover.

### Pill, text button, chip
```html
<button class="pill">Follow</button>                    <!-- [ follow ] -->
<button class="pill pill--primary">Save</button>        <!-- inverted block, no brackets -->
<button class="pill pill--sm">Popular releases</button> <!-- 14px, 24 tall -->
<button class="text-btn">Cancel</button>                <!-- [ cancel ] -->
<button class="chip" aria-pressed="false">Artists</button>   <!-- [artists] -->
<button class="chip" aria-pressed="true">Playlists</button>  <!-- inverted block -->
<button class="chip chip--icon" aria-label="Clear filters"><svg class="icon" aria-hidden="true"><use href="#i-close"/></svg></button>  <!-- [×] -->
```
- `.pill` / `.text-btn`: `[` and `]` are `::before`/`::after` in `--fg-3` with a
  1ch gap; label 16 px `--fg`, lowercase; height 28, padding 0 4px; hover
  `--hover` fill; `:active` inverted + 1 px shift. `.pill--primary` inverted
  block, padding 0 10px, hover `--accent-hover`. `.pill--outline` = `.pill`.
- `.chip`: `[label]` 16 px `--fg-2` lowercase, height 24, brackets `--fg-3`,
  hover `--fg`; `[aria-pressed="true"]` / `.is-active` inverted block, no
  brackets, `padding-inline: 6px`. Never use `.chip` for new non-chip controls
  (the regression suite counts `#main .chip`).
- **Phone**: pills / text buttons reach 44 px (`min-height: 44px;
  border-block: 8px solid transparent; background-clip: padding-box`, drawn
  block 28); chips 44 px with a 10 px transparent `border-block` (drawn 24).
  A border rather than padding + `content-box`, so the inline padding of
  `.pill--primary` and pressed chips stays inside the drawn block. State rules
  use `background-color` (not the `background` shorthand) so the clip
  survives; owners overriding a chip/pill fill must do the same, and owners
  must not add `padding-block` on phone (the border already gives the 44 px).

### Cover
```html
<img class="cover cover--48" src="data:…" alt="">
<img class="cover cover--48 cover--round" src="data:…" alt="">
```
Radius 0, `object-fit: cover`, `background: var(--cover-empty)`,
`filter: var(--fx)`; `.cover--24/32/40/48` use `var(--fx-fine)`; `.cover--round`
50%; `.cover--24` is always round (album hero artist avatar). Sizes `--24 --32
--40 --48 --56 --64 --92`; no size class → sized by the parent.
Under `ink` every `.cover` gets `outline: 1px solid var(--rule); outline-offset: -1px`
(the only frame ever drawn on a filtered cover).

**Frame rule [3.0a]: never decorate a filtered `img.cover`** (no outline,
box-shadow, positive outline-offset or pseudo-element: the filter posterises,
inverts or clips them). Frames, hover outlines and corner fragments go on the
unfiltered wrapper (`.card__cover`, `.lib-row__cover`, `.hero__cover`,
`.pb-cover`, `.xp__cover`, `.song-row__cover`, `.rp__cover-frame`) or on a new
`aria-hidden` sibling.

### Equaliser (stepped meter)
```html
<span class="equaliser" aria-hidden="true"><i></i><i></i><i></i></span>
```
Three 2 px bars, 2 px gap, 10×12 box, `animation: eq .9s steps(4) infinite`
(heights 4→12 px in 2 px steps, three delays). Colour is `currentColor` with
`color: var(--accent)` on `.equaliser`, so an owner recolours it with `color`
(e.g. `.is-selected .equaliser { color: var(--sel-fg) }`). Reduced motion:
static 7 / 12 / 5 px.

### Eyebrow, avatar, links, badges, utilities
```html
<span class="eyebrow">Playing from playlist</span>          <!-- 14px lowercase --fg-3 -->
<span class="avatar">N</span>                               <!-- 24×24 square, 1px --rule border -->
<span class="avatar avatar--24">W</span>                    <!-- 20×20, 14px -->
<a class="text-link" href="#">Show all</a>                  <!-- 14px --fg-2 lowercase, hover underline -->
<a class="link" href="#">The Hollow Lights</a>              <!-- underline on hover -->
<svg class="icon badge-e" aria-hidden="true"><use href="#i-explicit"/></svg>
<svg class="icon badge-verified" aria-hidden="true"><use href="#i-verified"/></svg>
<span class="px-bold">Host:</span>                          <!-- new: text-shadow: var(--bold) -->
<span class="blossom" aria-hidden="true"></span>            <!-- new: 13×12 pixel blossom in currentColor -->
```
- `.avatar` is `position: relative; isolation: isolate` with a `::before` tint
  layer (`background: var(--avatar-bg); filter: var(--fx-tint)`), letter `--fg`.
- `.blossom` uses `mask: var(--blossom-mask)`; the toast bullet can use the same
  mask on its own `::before` (`width: 13px; height: 12px; background:
  currentColor; mask: var(--blossom-mask) center / 13px 12px no-repeat`).
- Utilities unchanged: `.truncate`, `.clamp-2`, `.clamp-3`, `.sr-only`, `.tabular`.

## A8. Hit-area extenders [1.5]

- Phone (< 768 px):
  `:is(.icon-btn, .nav-btn):not(.win__btn, .search-pill__clear, .search-field__clear, .finder-search__clear, .card__close)::before { content: ""; position: absolute; inset: -6px }`
  (`::before`, because `.icon-btn--dot` uses `::after`). So **do not use
  `::before` on an `.icon-btn` / `.nav-btn` for drawing on phone**; if a button
  needs both, exclude it here by adding it to the list (ask the shell) or draw
  with a child element.
- `.win__ctl .win__btn::after` extends the `- ×` to 24×24 (desktop) /
  44 px tall (phone).
- Bracketed clears (`.search-pill__clear`, `.finder-search__clear`,
  `.card__close`, `.search-field__clear`) and `.pb-cover__expand` reach the
  minimum with their own box (`min-width/min-height: 24px` desktop, 44 px
  phone; glyph centred) — owners write that.
- Pills, text buttons and chips: A7.

## A9. Flora hooks [3.0a, 5]

- `.flora` = any flower silhouette (`img` or the petal canvas):
  `pointer-events: none; user-select: none; -webkit-user-drag: none`; under
  invert `.flora:not(canvas)` gets `filter: invert(1)`.
- **Lazy sprite contract** (every flower image; app.js paints them through the
  cover pump):
  ```html
  <img class="flora readout__flora" alt="" aria-hidden="true" width="236" height="196" data-flora="{&quot;kind&quot;:&quot;branch&quot;,…}">
  ```
  No `src` at render time; the attribute value is `esc(JSON.stringify(opts))`;
  the pump calls `Flora.sprite(JSON.parse(…))`, sets `src`, removes the `img`
  when the result is `''`. When `typeof window.Flora !== 'object'` no flower
  `img` is rendered at all.
- `<script src="flora.js"></script>` loads immediately before data.js;
  `window.Flora` is guarded by every caller.

## A10. Icons [7]

48 symbols, each `viewBox="0 0 16 16"` with one `<path>` of unit rectangles
(`fill` inherited from `currentColor`, no strokes): `i-logo` (pixel blossom)
`i-home i-home-filled i-search i-search-filled i-library i-library-filled
i-plus i-play i-pause i-next i-prev i-shuffle i-repeat i-repeat-one
i-add-circle` (boxed plus) `i-check-circle` (solid box, check cut out)
`i-heart i-heart-filled i-volume-high i-volume-mid i-volume-low i-volume-off
i-queue i-now-playing i-more i-close i-chevron-left i-chevron-right
i-chevron-down i-arrow-left i-clock i-list i-grid i-speaker i-check i-sort
i-browse i-pin i-trash i-edit i-explicit` (7×7 box, E cut out) `i-expand
i-collapse i-download i-share i-verified` (scalloped badge, check cut out —
no `var(--fg)` stroke any more, it reads in every mode) and **new `i-petal`**
(a single notched petal, for the petals toggle).

Source grids: `tools/work/shell/px.js` (`node tools/work/shell/px.js check`,
`… ascii i-home`, `… inject` rewrites the sprite and the Bayer hrefs in
`src/index.html`).

## A11. Glyph coverage (DotGothic16, measured in Edge)

Covered: `▷` (full width, 2ch), `•`, `·`, `×`, `…`, `─`, `│`, `_`, `>`, `~`,
`#`, `!`, `花鳥風月`. **Not covered:** `▶`, `▾`, `▸`, `↗`, `℗`. So `▾` / `▸`
always mean the pixel `i-chevron-down` / `i-chevron-right` icon, never a typed
glyph; the `[↗]` expand control is a 16 px bordered box holding the pixel
`i-expand` icon; `℗` stays existing content text (system fallback is allowed
for content, not for decoration).

## A12. Z-index scale

`#petals` 0 (fixed, behind `#app`); `#app` 1; inside `#main`: sticky strip 5,
table header 4, window bars 1; resizer 10; mini player / bottom nav 20;
expanded player 30; dialog backdrop 40; context menu 50 (submenu 51); toast
root 60; tooltip 70.

---

# Part B — component markup reference (rendered by app.js / player.js)

The markup below is what app.js / player.js render today. Keep every id,
class, `data-*`, `aria-*`, `role` and text string. The new windows, titles,
labels, readout, clock, filter switcher and flower images are added per
DESIGN.md §2–6 (window markup in A6, lazy flowers in A9). Looks: DESIGN §3.

## B1. Top bar (`#topbar`, app.js)

```html
<div class="topbar__left">
  <button class="topbar__logo" aria-label="Wavelength" data-route="home"><svg class="icon icon--lg" aria-hidden="true"><use href="#i-logo"/></svg></button>
  <span class="topbar__word" aria-hidden="true"></span>                     <!-- new: "wavelength_" via CSS -->
</div>
<div class="topbar__center">
  <button class="round-btn topbar__home is-active" aria-label="Home" data-route="home"><svg class="icon" aria-hidden="true"><use href="#i-home-filled"/></svg></button>
  <div class="search-win win win--dashed">                                  <!-- new wrapper -->
    <div class="win__bar" aria-hidden="true" style="--rule-w:62%"></div>
    <div class="search-pill">
      <span class="search-pill__prompt" aria-hidden="true" data-path="look_in.txt"></span>   <!-- new -->
      <svg class="icon" aria-hidden="true"><use href="#i-search"/></svg>
      <input class="search-pill__input" type="search" placeholder="What do you want to play?" aria-label="Search">
      <span class="search-pill__caret" aria-hidden="true"></span>                            <!-- new: "_" -->
      <button class="icon-btn search-pill__clear" aria-label="Clear search" hidden><svg class="icon" aria-hidden="true"><use href="#i-close"/></svg></button>
      <span class="search-pill__divider" aria-hidden="true"></span>
      <button class="icon-btn search-pill__browse" aria-label="Browse"><svg class="icon" aria-hidden="true"><use href="#i-browse"/></svg></button>
    </div>
  </div>
</div>
<div class="topbar__right">
  <div class="fx-bar">…filter switcher (DESIGN 4.6)…</div>
  <button class="avatar-btn" aria-label="Account menu"><span class="avatar">N</span></button>
</div>
```

## B2. Library panel (`#sidebar`, app.js)

```html
<div class="lib-header">
  <button class="lib-title" aria-label="Collapse Your Library" title="Your Library"><svg class="icon" aria-hidden="true"><use href="#i-library-filled"/></svg><span>Your Library</span></button>
  <button class="icon-btn lib-add" aria-label="Create playlist"><svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg></button>
</div>
<div class="lib-chips">
  <button class="chip chip--icon" aria-label="Clear filters" hidden><svg class="icon" aria-hidden="true"><use href="#i-close"/></svg></button>
  <button class="chip" aria-pressed="false">Playlists</button>
  <button class="chip" aria-pressed="false">Artists</button>
  <button class="chip" aria-pressed="false">Albums</button>
</div>
<div class="lib-filter">
  <div>
    <button class="icon-btn" aria-label="Search in Your Library"><svg class="icon" aria-hidden="true"><use href="#i-search"/></svg></button>
    <div class="lib-filter__input"><svg class="icon" aria-hidden="true"><use href="#i-search"/></svg><input type="text" placeholder="Search in Your Library" aria-label="Search in Your Library"></div>
  </div>
  <button class="lib-sort" aria-label="Sort by: Recents">Recents <svg class="icon" aria-hidden="true"><use href="#i-chevron-down"/></svg></button>
</div>
<ul class="lib-list">
  <li>
    <button class="lib-row is-active is-current is-playing" data-context-uri="liked" title="Liked Songs" aria-label="Liked Songs">
      <span class="lib-row__cover"><img class="cover cover--48" src="…" alt=""><span class="lib-row__play" aria-hidden="true"><svg class="icon" aria-hidden="true"><use href="#i-play"/></svg><svg class="icon" aria-hidden="true" hidden><use href="#i-pause"/></svg></span></span>
      <span class="lib-row__text">
        <span class="name">Liked Songs</span>
        <span class="sub"><svg class="icon icon--xs" aria-hidden="true"><use href="#i-pin"/></svg>Playlist • 23 songs</span>
      </span>
      <span class="lib-row__end"><svg class="icon lib-row__speaker" aria-hidden="true"><use href="#i-speaker"/></svg></span>
    </button>
    <button class="icon-btn lib-row__more" aria-label="More options for Liked Songs">…i-more…</button>
  </li>
</ul>
<div class="lib-empty"><strong>Couldn't find "zzz"</strong>Try searching again using a different spelling or keyword.</div>
```
Artists: `lib-row__cover--round` on `.lib-row__cover` and `cover--round` on the
img. Rail mode reads the `--rail-*` names of A2. The window head (live `-`
bar as the header's last child) and the `.lib-sprig` are DESIGN [3.4].

## B3. Main panel chrome (`#main`, app.js)

```html
<div class="main-header" style="--strip-tint:#1e3264;--strip-opacity:0">
  <div class="main-header__nav">
    <button class="nav-btn" aria-label="Go back"><svg class="icon" aria-hidden="true"><use href="#i-chevron-left"/></svg></button>
    <button class="nav-btn nav-btn--forward" aria-label="Go forward" disabled><svg class="icon" aria-hidden="true"><use href="#i-chevron-right"/></svg></button>
  </div>
  <span class="main-header__path" aria-hidden="true" data-dir="~/playlist/" data-leaf="late_night_drive"></span>   <!-- new -->
  <div class="main-header__ctx">…play block + <span class="main-header__title">Late Night Drive</span>…</div>
  <div class="main-header__end">…home chips on Home…</div>
</div>
<div class="home-head" aria-hidden="true"></div>       <!-- Home only: filtered band, var(--home-tint, #000) -->
<div class="page">…</div>
```
`.main-header` is sticky, `height: var(--strip-h)`, opaque `--bg`, its tint is a
filtered `::before` (`--fx-band`). `#main` is a size container
(`container-type: inline-size`).

## B4. Home, shelves, cards

```html
<div class="chips chips--home"><span class="avatar chips__avatar" hidden>N</span><button class="chip" aria-pressed="true">All</button><button class="chip" aria-pressed="false">Music</button><button class="chip" aria-pressed="false">Podcasts</button></div>
<div class="quick-grid">
  <button class="quick-tile" data-context-uri="playlist:pl_dailymix1" data-color="#8d67ab">
    <img class="cover" src="…" alt="">
    <span class="quick-tile__name">Daily Mix 1</span>
    <span class="play-btn" aria-hidden="true"><svg class="icon" aria-hidden="true"><use href="#i-play"/></svg><svg class="icon" aria-hidden="true" hidden><use href="#i-pause"/></svg></span>
  </button>
</div>
<section class="shelf">
  <div class="shelf__head"><a class="shelf__title" href="#" data-route="section" data-id="made-for-you">Made For You</a><a class="shelf__all" href="#" data-route="section" data-id="made-for-you">Show all</a></div>
  <div class="card-grid card-grid--row">
    <div class="card" role="button" tabindex="0" data-context-uri="playlist:pl_dailymix1" data-route="playlist" data-id="pl_dailymix1">
      <div class="card__cover">
        <img class="cover" src="…" alt="">
        <button class="play-btn" aria-label="Play Daily Mix 1"><svg class="icon" aria-hidden="true"><use href="#i-play"/></svg><svg class="icon" aria-hidden="true" hidden><use href="#i-pause"/></svg></button>
      </div>
      <div class="card__text"><div class="card__title">Daily Mix 1</div><div class="card__sub">Marlow Vane, Nia Solace and more</div></div>
    </div>
  </div>
</section>
```
Artist cards: `card card--round` + `cover cover--round`. Recent-search cards add
`<button class="icon-btn card__close" aria-label="Remove …">i-close</button>`.
The readout band, `/time`, `/quick_picks`, `/filter` windows and the shelf
spray are DESIGN [3.6], [3.7], [6].

## B5. Search

```html
<h2 class="section-title browse-title">Browse all</h2>
<div class="browse-grid">
  <button class="browse-card" style="--browse-color:#e13300" data-route="genre" data-id="ge_pop">Pop<img class="cover" src="…" alt=""></button>
</div>
<div class="search-top">
  <div class="search-col"><h2 class="search-col__title">Top result</h2>
    <div class="top-result" role="button" tabindex="0" data-context-uri="artist:ar_1">
      <img class="cover cover--92 cover--round" src="…" alt="">
      <div class="top-result__name">Marlow Vane</div>
      <div class="top-result__meta"><span class="type-pill">Artist</span></div>
      <button class="play-btn" aria-label="Play Marlow Vane">…both icons…</button>
    </div>
  </div>
  <div class="search-col"><h2 class="search-col__title">Songs</h2>
    <div class="song-list">
      <div class="song-row" data-track-id="tr_1" tabindex="0">
        <span class="song-row__cover"><img class="cover" src="…" alt=""><button class="song-row__play" aria-label="Play">…both icons…</button></span>
        <span class="song-row__text"><span class="song-row__title">Glass Houses</span><span class="song-row__artist"><svg class="icon badge-e" aria-hidden="true"><use href="#i-explicit"/></svg><a href="#">The Hollow Lights</a></span></span>
        <span class="song-row__end"><button class="icon-btn song-row__like" aria-label="Add to Liked Songs"><svg class="icon" aria-hidden="true"><use href="#i-add-circle"/></svg></button><span class="song-row__dur">3:42</span><button class="icon-btn song-row__more" aria-label="More options">…i-more…</button></span>
      </div>
    </div>
  </div>
</div>
<div class="no-results"><div class="no-results__title">No results found for 'xqzv'</div><div class="no-results__text">Please make sure your words are spelled correctly, or use fewer or different keywords.</div></div>
<div class="search-header"><h1 class="search-header__title">Search</h1>
  <div class="search-field"><svg class="icon" aria-hidden="true"><use href="#i-search"/></svg><input type="search" placeholder="What do you want to listen to?" aria-label="Search"><button class="icon-btn search-field__clear" aria-label="Clear search" hidden>…i-close…</button></div>
</div>
```

## B6. Hero + action bar

```html
<section class="page page--hero" style="--hero-color:#503750">
  <div class="hero">                                   <!-- hero--artist | hero--liked | hero--genre | hero--editable -->
    <div class="hero__cover"><img class="cover" src="…" alt=""></div>
    <div class="hero__info">
      <span class="hero__type">Playlist</span>
      <h1 class="hero__title title-96">Late Night Drive</h1>   <!-- title-96 | title-72 | title-48 | title-32 -->
      <p class="hero__desc">Neon-lit synths for the open road.</p>
      <div class="hero__meta"><span class="avatar avatar--24">W</span><b>Wavelength</b><span>•</span><span>1,234,567 saves</span>…</div>
    </div>
  </div>
  <div class="hero-band" aria-hidden="true"></div>    <!-- filtered band (--fx-band) -->
  <div class="actions">
    <button class="play-btn play-btn--lg" aria-label="Play Late Night Drive" data-context-uri="playlist:pl_x">…both icons…</button>
    <button class="icon-btn actions__shuffle" aria-label="Enable shuffle"><svg class="icon icon--lg" aria-hidden="true"><use href="#i-shuffle"/></svg></button>
    <button class="icon-btn actions__save" aria-label="Add to Your Library"><svg class="icon icon--lg" aria-hidden="true"><use href="#i-add-circle"/></svg></button>
    <button class="icon-btn actions__download" aria-label="Download"><svg class="icon icon--lg" aria-hidden="true"><use href="#i-download"/></svg></button>
    <button class="icon-btn actions__more" aria-label="More options for Late Night Drive"><svg class="icon icon--lg" aria-hidden="true"><use href="#i-more"/></svg></button>
    <div class="actions__right">
      <button class="icon-btn" aria-label="Search in playlist"><svg class="icon" aria-hidden="true"><use href="#i-search"/></svg></button>
      <div class="inline-filter"><svg class="icon" aria-hidden="true"><use href="#i-search"/></svg><input type="text" placeholder="Search in playlist" aria-label="Search in playlist"></div>
      <button class="view-toggle" aria-label="View as: List">List <svg class="icon" aria-hidden="true"><use href="#i-chevron-down"/></svg></button>
    </div>
  </div>
  …track table…
</section>
```
DESIGN [3.9]: app.css resizes `.icon--lg` inside `.actions` to 16. Artist type
line: `<span class="hero__type"><svg class="icon badge-verified" aria-hidden="true"><use href="#i-verified"/></svg>Verified Artist</span>`.

## B7. Track table

```html
<div class="track-table" role="grid" aria-label="Late Night Drive">        <!-- --album | --popular | --songs | --queue | --compact -->
  <div class="track-table__head" role="row">
    <span class="cell cell--index">#</span><span class="cell">Title</span><span class="cell">Album</span><span class="cell cell--date">Date added</span>
    <span class="cell cell--dur"><svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg></span>
  </div>
  <div class="track-row" role="row" data-track-id="tr_1" tabindex="0">
    <span class="track-row__index">
      <span class="track-row__num">1</span>
      <span class="equaliser" aria-hidden="true"><i></i><i></i><i></i></span>
      <button class="track-row__play" aria-label="Play">…both icons…</button>
    </span>
    <span class="track-row__main">
      <img class="cover track-row__cover" src="…" alt="">
      <span class="track-row__text">
        <span class="track-row__title">Glass Houses</span>
        <span class="track-row__artist"><svg class="icon badge-e" aria-hidden="true"><use href="#i-explicit"/></svg><a href="#" data-route="artist" data-id="ar_1">The Hollow Lights</a></span>
      </span>
    </span>
    <span class="track-row__album"><a href="#" data-route="album" data-id="al_1">Glass Houses</a></span>
    <span class="track-row__date">3 days ago</span>
    <span class="track-row__end">
      <button class="track-row__like" aria-label="Add to Liked Songs"><svg class="icon" aria-hidden="true"><use href="#i-add-circle"/></svg></button>
      <span class="track-row__dur">3:42</span>
      <button class="track-row__more" aria-label="More options for Glass Houses"><svg class="icon" aria-hidden="true"><use href="#i-more"/></svg></button>
    </span>
  </div>
</div>
<a class="table-more" href="#">See more</a>
<div class="copyright"><div class="copyright__date">March 4, 2025</div><div>© 2025 Label</div><div>℗ 2025 Label</div></div>
```
Wrapper window, header cell classes and `.track-table__artist-head`: DESIGN [3.10].

## B8. Finder, empty states

```html
<div class="playlist-finder">
  <h2 class="playlist-finder__title">Let's find something for your playlist</h2>
  <div class="finder-search"><svg class="icon" aria-hidden="true"><use href="#i-search"/></svg><input type="text" placeholder="Search for songs" aria-label="Search for songs"><button class="icon-btn finder-search__clear" aria-label="Clear" hidden>…i-close…</button></div>
  <div class="finder-list">
    <div class="finder-row" data-track-id="tr_1">
      <img class="cover cover--40" src="…" alt="">
      <span class="finder-row__text"><span class="finder-row__title">Glass Houses</span><span class="finder-row__artist"><a href="#">The Hollow Lights</a></span></span>
      <span class="finder-row__album"><a href="#">Glass Houses</a></span>
      <button class="pill pill--outline finder-row__add">Add</button>
    </div>
  </div>
</div>
<div class="finder-foot"><button class="text-btn finder-refresh">Refresh</button><a class="text-link finder-more" href="#">Find more</a></div>

<div class="empty">
  <img class="empty__flora flora" alt="" aria-hidden="true" width="120" height="132" data-flora="…">   <!-- new, lazy (A9) -->
  <svg class="icon empty__icon" aria-hidden="true"><use href="#i-heart"/></svg>
  <div class="empty__title">Songs you like will appear here</div>
  <div class="empty__text">Save songs by tapping the heart icon.</div>
  <button class="pill pill--primary">Find songs</button>
</div>
```

## B9. Queue view and right panel

```html
<h1 class="page-title page-title--lg">Queue</h1>
<section class="queue-section">
  <div class="queue-section__head"><h2 class="queue-section__title">Next in queue</h2><button class="pill queue-clear">Clear queue</button></div>
  <div class="track-table track-table--queue">…rows with data-qid…</div>
</section>

<div class="rp__head"><h2 class="rp__title"><a href="#">Late Night Drive</a></h2><button class="icon-btn rp__close" aria-label="Close">…i-close…</button></div>
<div class="rp__body">
  <img class="cover rp__cover" src="…" alt="">                 <!-- wrapped in .rp__cover-frame (DESIGN 3.13) -->
  <div class="rp__track">…title, artist, like…</div>
  <div class="rp-card">…About the artist…</div>
  <div class="rp-card">…Next in queue + one .song-row…</div>
</div>
```

## B10. Context menu, dialog, toast, tooltip

```html
<div class="menu-list">
  <button class="menu-item" role="menuitem" aria-haspopup="true"><svg class="icon menu-item__icon" aria-hidden="true"><use href="#i-plus"/></svg><span class="menu-item__label">Add to playlist</span><svg class="icon menu-item__chev" aria-hidden="true"><use href="#i-chevron-right"/></svg></button>
  <div class="menu-sep" role="separator"></div>
  <button class="menu-item menu-item--danger" role="menuitem"><span class="menu-item__label">Delete</span></button>
</div>
<div class="dialog-backdrop">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
    <h2 class="dialog__title" id="dlg-title">Delete from Your Library?</h2>
    <div class="dialog__body">This will delete <b>Rooftop Nights</b> from Your Library.</div>
    <div class="dialog__actions"><button class="text-btn">Cancel</button><button class="pill pill--primary">Delete</button></div>
  </div>
</div>
<div class="toast">Added to Liked Songs <a class="toast__action" href="#">Undo</a></div>
<div class="tooltip" aria-hidden="true" style="left:…px;top:…px">Enable shuffle</div>
```
Menu `.menu-target`, dialog frame + sprig and the live `×` slot: DESIGN [3.14], [3.15].
The tooltip is `position: fixed` inside `#toast-root` — keep every ancestor free
of transform / filter / will-change / contain (A5).

## B11. Player bar, mini player, expanded player (player.js)

```html
<!-- #player-bar -->
<div class="pb-left">
  <div class="pb-cover"><img class="cover" src="…" alt=""><button class="pb-cover__expand" aria-label="Expand"><svg class="icon" aria-hidden="true"><use href="#i-expand"/></svg></button></div>
  <div class="pb-text"><div class="pb-title"><a href="#">Glass Houses</a></div><div class="pb-artist"><a href="#">The Hollow Lights</a></div></div>
  <button class="icon-btn pb-like" aria-label="Add to Liked Songs"><svg class="icon" aria-hidden="true"><use href="#i-add-circle"/></svg></button>
</div>
<div class="pb-center">
  <div class="pb-controls">…shuffle, prev, <button class="play-btn play-btn--white pb-play" aria-label="Play">…both icons…</button>, next, repeat…</div>
  <div class="pb-progress"><span class="pb-time">0:00</span><input type="range" class="slider slider--progress" min="0" max="1000" step="1" value="0" aria-label="Seek"><span class="pb-time pb-time--total">3:42</span></div>
</div>
<div class="pb-right">…npv, queue (icon-btn--dot), mute, <input type="range" class="slider slider--volume" min="0" max="100" step="1" value="70" aria-label="Volume">…</div>

<!-- #mini-player (style="--mini-color:…") -->
<div class="mini-player__inner"><img class="cover cover--40" src="…" alt=""><div class="mini-player__text"><div class="marquee mini-player__title">…</div><div class="mini-player__artist">The Hollow Lights</div></div><button class="icon-btn mp-like" …>…</button><button class="icon-btn mp-play" …>…</button></div>
<div class="mini-player__progress" aria-hidden="true"><i style="--fill:38%"></i></div>

<!-- #expanded-player (style="--xp-color:…") -->
<div class="xp__top">…xp-close (i-chevron-down), .xp__context (.eyebrow + .xp__context-name), xp-more…</div>
<div class="xp__cover"><img class="cover" src="…" alt=""></div>
<div class="xp__title-row"><div class="xp__text"><div class="xp__title">…</div><div class="xp__artist">…</div></div><button class="icon-btn xp-like" …>…</button></div>
<div class="xp__progress"><input type="range" class="slider slider--progress slider--thumb" …><div class="xp__times"><span>1:24</span><span>-2:18</span></div></div>
<div class="xp__controls">…shuffle, prev, <button class="play-btn play-btn--white play-btn--xl xp-play" …>…</button>, next, repeat…</div>
<div class="xp__bottom"><button class="icon-btn xp-queue" aria-label="Queue">…i-queue…</button></div>
```
Sliders keep the `--fill` contract (JS sets `--fill: pct%`); the volume slider
also gets `--fill-q` (rounded to 10 %). Paint, window bars, `Song:` / `Author:`
labels and `.pb-vol-pct`: DESIGN [3.18]–[3.21].

## B12. Markup added by the restyle (app.js / player.js, as integrated)

Every element below is new and `aria-hidden="true"` unless it is a control.
None of them uses `h1`/`h2`, `.chip`, `.card`, `.shelf`, `.track-row`,
`.song-row`, `.lib-row`, `.menu-item` or `.cover`.

| where | markup | notes |
|---|---|---|
| top bar | `.topbar__word`, `.search-win` (`win win--dashed`) > `.search-pill__prompt[data-path]`, `.search-pill__caret` | caret hidden while focused or filled |
| top bar | `.fx-bar` > `.fx[role=radiogroup]` > `.fx__label` + `button.fx__opt[role=radio][data-filter-set]`; `button.fx-menu-btn[data-mode]` (< 1280 px); `button.fx-petals[aria-pressed]` | controls; tiers DESIGN 3.3 / 4.6 |
| library | `button.win__btn.win__btn--min.lib-collapse` in the live `.win__bar--live` (last child of `.lib-header`); `.lib-sprig` > `img.flora` | collapse is desktop only |
| `#main` strip | `.main-header__path[data-dir][data-leaf]`; `.main-header--home` on Home | the path also updates on the partial search render |
| Home | `section.readout` > `img.readout__flora` + `dl.readout__info` > `.readout__row(--gap/--opt)` > `dt` + `dd[data-readout]`; `.home-side` > `.win.win--time` (`.clock` > `.win__path` + `time.clock__time[data-clock]`) and `.win.win--quick` (`.win__title[data-path="/quick_picks"]` + `.quick-grid`); phone `.win.win--filter` | readout/clock text is new text (rule 0.9) |
| shelves | `.shelf.win` + decorative `.win__bar`; `.card-grid__spray` > `img.flora` in the first empty slot | spray only in grid mode |
| search | `.browse-card__name` (wraps the existing name text node), `img.browse-card__flora.flora` after the cover img | |
| heroes | `img.hero__sprig.flora` after `.hero-band`; `.hero__cover-edit` hidden with `opacity: 0` | |
| track tables | `.win.win--table` > `.win__bar` + `.win__title[data-path][data-meta]` + `.track-table`; header cell classes `cell--title/--artist/--album/--plays`; `span.track-table__artist-head` (no `.cell`) | rows' inner wrappers are `display: contents` |
| empty states | `img.empty__flora.flora` first child of `.empty` | omitted without Flora |
| right panel | `.rp__head.win` with `.win__path[data-path]`; `.rp__close` moved into the live bar's `×` slot (`win__btn win__btn--close` added); `.rp__cover-frame` around `.rp__cover`; `.rp-card.win` | |
| menus | `.win__bar` + `.menu-target[data-path]` first children; phone inline submenu `.context-menu--inline[role=group]` | `openContextMenu(items, { title })` |
| dialogs | `.dialog-frame` > `.dialog` + `img.dialog__flora.flora`; `.dialog--wide` (Edit details); `.edit-details__edit`; `.dialog__close` moved into the live `×` slot | frame clicks count as backdrop clicks |
| bottom nav | `span.bottom-nav__label` wraps the label text | |
| player bar | first child `.win__bar` (100%); `.win__title.pb-win-title[data-path="/media"]` holding `span.equaliser.pb-eq`; `span.pb-vol-pct` after the volume input | |
| mini / expanded | first child `.win__bar` (80% / 76%); `img.flora.xp__flora` first child of `.xp__bottom` (only with Flora) | |
| player roots | `data-state` = `empty`, `playing` or `paused` on `#player-bar`, `#mini-player`, `#expanded-player` | |
