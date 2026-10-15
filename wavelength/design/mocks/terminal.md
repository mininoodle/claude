# Wavelength / terminal: design rationale

Mock: `dist/mocks/terminal.html` (standalone, ~122 KB, all CSS/JS inline, only Google Fonts external).
Source of the mock (for porting): `tools/work/terminal/mock/` (`mock.css`, `mock.js`, `flora.js`, `terminal.html`), assembled by `node tools/work/terminal/assemble.js terminal.html dist/mocks/terminal.html`.
Query `?fx=dither|invert|color|cyano` opens the mock on another filter; the choice persists in `localStorage` (`wl-terminal-fx`).

The direction is a dense, highly usable terminal app. Every panel is a framed window drawn with hairline chrome on pure black. The type is one bitmap face. Lists read like `ls -l`. State is shown with inversion and ASCII texture instead of colour. Colour exists only inside media, and only through one switchable filter. Flowers grow everywhere the UI has room to breathe.

---

## 1. Tokens

All UI colour is black, white or grey. These are the only colour tokens. The two pattern tokens are greys too.

| token | value | use |
|---|---|---|
| `--bg` | `#000` | ground: the page and every window |
| `--fg` | `#fff` | primary text, important rules, inverted blocks (selection, primary buttons, toasts) |
| `--fg-2` | `#a3a3a3` | secondary text (artists, values, descriptions), 8.3:1 on black |
| `--fg-3` | `#757575` | meta, labels, placeholders, brackets, 4.6:1 on black (AA for text) |
| `--fg-4` | `#3a3a3a` | disabled, faint separators |
| `--rule` | `#8c8c8c` | window hairlines and corner ticks |
| `--rule-dim` | `#333` | dashed row and section rules |
| `--hover` | `#1c1c1c` | the ▒ hover fill |
| `--sel-bg` / `--sel-fg` | `#fff` / `#000` | the █ selection (an inverted block) |
| `--pat-playing` | `repeating-conic-gradient(#2c2c2c 0 25%, #000 0 50%) 0 0/4px 4px` | the ░ "playing" fill (2 px checker) |
| `--pat-shade` | 2 px black checker | dialog backdrop (a 1-bit dim) |
| `--fx` | filter list (see section 6) | applied to every colour-carrying surface |

Spacing works on an 8 px half-cell (the width of one glyph). The main values are `--gap: 12px`, 10/16 px between windows and 22 px window chrome. Nothing has rounded corners except round artist covers. Nothing has blur or gradients except media and the filtered hero band.

State vocabulary (used the same way in every list, menu and chip):

| state | look | glyph metaphor |
|---|---|---|
| hover / keyboard-focused menu item | `--hover` fill. Menu items invert | ▒ |
| playing / current | `--pat-playing` checker fill, a stepped 3-bar meter in the index column, a `▷ ` prefix on the title | ░ ▷ |
| selected | inverted block: white fill, every child black | █ |
| focus-visible | `1px dashed #fff` outline, offset 2 px | ┄ |
| pressed (`:active`) and toggled-on modes (shuffle) | inverted, shifted 1 px down and right | ▣ |
| active mode in the player (shuffle, repeat, queue) | white icon plus a 4×2 px bar under it | ▁ |
| disabled | `--fg-4` | |

## 2. Type

- **Face:** [DotGothic16](https://fonts.google.com/specimen/DotGothic16) (Google Fonts, a bitmap gothic by Fontworks). Its Latin glyphs are half-width, so all Latin is monospaced at exactly 0.5 em (8 px at 16 px; I measured digits, `i` and `M` and they are equal). It also covers kana and kanji, so the readout's `Contact: 花鳥風月` renders in the same pixels. This matches the reference's small bitmap type and its CJK contact line.
- **Fallback stack:** `'DotGothic16', 'MS Gothic', 'Osaka-Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace`. MS Gothic and Osaka are CJK bitmap-era monospaces with the same half-width metric. The rest keep the grid monospaced.
- **Scale.** The sizes sit on the font's 16 px pixel grid, so 16, 32 and 48 render at 1, 2 and 3 screen pixels per font pixel and stay crisp:

| size | line height | role |
|---|---|---|
| 48 px | 52 | display: hero titles (`Late Night Drive`) |
| 32 px | 38 | titles: phone hero, big numerals on mix covers (cover numerals scale with the cover) |
| **16 px** | 22 | **body**: everything else, including window titles, list rows, buttons, menu items and the readout |
| 14 px | 18–20 | meta/labels: sub lines, column heads, card subs, times, `[show all]` |
| 12 px | 14 | only the tiny type painted into covers |

- **Hierarchy without weight.** The face has one weight, so hierarchy comes from four things: brightness (`--fg`, `--fg-2`, `--fg-3`), inversion, the `>` prompt and lowercase. Headings, buttons, chips and navigation are lowercased with `text-transform`. Content (track, artist and album names, descriptions, toasts) keeps its case.
- **`ch` is a real unit here.** Because the face is monospaced, columns and offsets are written in `ch`: the `#` column is `4ch` and the date column is `13ch`. The search field's blinking `_` sits at `calc(4px + 27ch)`, which is exactly the end of the 25-character placeholder.
- **Rendering note (important for the integrator).** Chromium on Windows applies LCD subpixel antialiasing in non-composited regions. On 1 px bitmap stems this prints blue and orange fringes, which show up as a colour leak in a monochrome UI. The fix is `will-change: transform` on the text-heavy regions that do not scroll. In the app those are `#topbar`, `#player-bar`, `#bottom-nav`, `#mini-player`, the context menu and the dialog. The scroll containers are already composited. The mock applies it to `.frame, .sheet, .note`.

## 3. Window chrome anatomy

This follows the reference windows (`> /time`, `> /Media`, `> look_in.txt`):

```
─────────────────────────────────────────────────    - ×      ← .win__bar: 1px --rule hairline that stops 52px short;
> /library                                     [+]            ← .win__title: '>' prompt + path (or the existing heading, lowercased)
  …window body (scrolls; chrome stays)…                          "- ×" control pair at the right end, 2px above the rule
                                                                 (decorative, or wired: "-" = collapse, "×" = close)
────                                         ──────           ← ::after corner ticks: 28px bottom-left, 44px bottom-right
```

- `.win` is `position: relative; display: flex; flex-direction: column; padding-top: 20px`. `.win__bar` is absolutely positioned and `aria-hidden`. `.win__title` is the first flow child. `.win__body` takes `flex: 1; overflow: auto`.
- **Prompts are CSS.** `.prompt::before { content: '>' }`, `.shelf__title::before/::after` add `> ` and `/`, and `.chip::before/::after`, `.btn::before/::after` and `.shelf__all` add the `[ ]` brackets. No existing text node changes. New decorative paths (`/home`, `/media`, `/time`, `/playlist/latenightdrive`) are new `aria-hidden` elements.
- **Floating windows** (context menu, submenu, dialogs) use a full 1 px box instead of a hairline, plus a hard 6 px offset shadow (`box-shadow: 6px 6px 0 #2b2b2b`), which is the TUI drop shadow. The dialog backdrop is a 2 px black checker, so the page shows through as a 1-bit dim instead of a blur.
- The **dashed rule** from the reference becomes the underline of the search prompt, the rule under table headers and the separators in menus.

## 4. App regions → windows

| region (id) | window | contents and notes |
|---|---|---|
| `#topbar` | chromeless status line | Left: the pixel-blossom logo (13×12 grid) + `wavelength_` with a blinking cursor. Centre: `[⌂]` home, then the search field as a prompt: `> What do you want to play?_` on a dashed rule, with `caret-shape: block` when focused (a new `aria-hidden` `.caret` span; the existing magnifier SVG is hidden by CSS). Browse is a pixel box icon. Right: the **fx switcher** (`fx: [mono] dither invert color cyano`, `role=radiogroup`, arrow keys) and the `N` avatar as an inverted cell. |
| `#sidebar` | `> your library` window | `[+]` create, `[playlists] [artists] [albums]` chips, search glyph + `recents ▾`. Rows are a 50 px file listing: a 2ch gutter (stepped meter when playing, `>` when it is the open route), a 40 px filtered cover, the name, and the grey sub line (`Playlist • Wavelength`). The current context gets the ░ fill. A white sakura sprig grows from the bottom-left corner into the empty space (canvas, `aria-hidden`, redrawn per breakpoint). |
| `#main` | `> /home` or `> /<view>/<id>` window | **Home:** the chips sit in the title row. A **neofetch readout** (`Host`, `Os`, `Architecture`, `Contact: 花鳥風月`, then `FPS` (live), `Location`, `Connection: ESTABLISHED`, `Session Number` (day of year), `Filter`) sits beside a white **flowering branch** drawn on canvas. A nested `> /time` window shows the live clock `DD-MM-YYYY hh:mm AM/PM`. The quick grid is 2×4 rows of 30 px. Shelves are `> made for you/ … [show all]` with a 7-column card grid. **Playlist:** a filtered colour band behind the hero (`--hero-color` through `--fx`), a 168 px cover, a `# playlist` type line, a 48 px title and grey meta. The action bar is an inverted pause block, shuffle toggled (inverted), saved (dot), download and more. The track table is a **one-line file listing** (section 5). |
| `#right-panel` | `> /now-playing` or `> /queue` window | Not drawn in the mock. Same chrome. Queue rows use the track-row states. Its `×` is the real close button. |
| `#player-bar` | `> /media` window | Mirrors the reference: `Song:` / `Author:` labels (new `aria-hidden` spans, padded to 7ch so the values align) before the existing title and artist links. Pixel transport: inverted pause block, shuffle and repeat with an active bar. The progress bar is a solid white elapsed line, a dashed grey remainder and a 3×10 knob, with times on either side. Volume is a 10-cell segmented bar (`■■■■■■■□□□` drawn with CSS) and a `70%` readout. |
| `#context-menu` (+ `--sub`) | boxed popup | A new `aria-hidden` `.menu-head` shows the target (`> Holding the Weekend`). Items are 30 px. Hover and `.is-focused` invert. The `.is-open` parent gets ▒. Separators are dashed. `.menu-search` is a `>` prompt. The menu flips upward when the space below is short (as in the mock). |
| `#dialog-root` | boxed modal over a dither backdrop | `> Already added`. Actions are `[ Don't add ]` (bracket text button) and an inverted `Add anyway`. Edit details uses boxed inputs that turn white on focus, with lowercase `name:` and `description:` labels. |
| `#toast-root` | inverted status line | A white block with a pixel-blossom bullet: `✿ Added to queue`. It sits bottom-centre above the player. |
| `#mini-player` (phone) | compact `/media` | 1 px boxed, with a dashed progress rule under it. The `--mini-color` tint is painted on a `::before` layer that goes through `--fx` (a dark grey in mono, a Bayer field in dither, the real colour in color), so the text stays white. |
| `#bottom-nav` (phone) | tab line | A top hairline and pixel icons. The active label is an inverted cell (`█home█`). |
| `#expanded-player` (phone) | full-screen `/media` | Not drawn. Same anatomy: a large filtered cover and the dashed progress. |

## 5. Lists as file listings

- **Track table.** `.track-row__main`, `.track-row__text` and `.track-row__end` get `display: contents`. Index, cover, title, artist, album, date, like, duration and more then become direct grid items of one row. The template is `4ch 24px 1.45fr 1fr 1fr 13ch 24px 5ch 24px`, with 32 px rows and a dashed header rule. One extra `aria-hidden` header cell (`artist`) labels the new column. The DOM order and every class stay unchanged.
- **Phone.** The same row becomes a 56 px two-line row (`cover | title / artist | more`) through `grid-template-areas`. Index, album, date, duration and like are hidden, and the header is hidden.
- **Library rows, quick tiles, menu items and queue rows** share the same ░ ▒ █ vocabulary.

## 6. Filters (the only way colour reaches the screen)

`:root[data-fx]` sets `--fx`. `.cover`, `.fx-media`, the hero band and the mini-player tint layer all use `filter: var(--fx)`. Thumbnails of 48 px and below use `var(--fx-fine, var(--fx))`, so dither stays legible at that size. The SVG `<filter>` defs live once in the page.

| key | definition | intent |
|---|---|---|
| `mono` (default) | `grayscale(1) contrast(1.12) brightness(1.02)` | tonal greys; the covers' tonal flower art reads as charcoal prints |
| `dither` | SVG `#fx-dither`: luminance (`feColorMatrix` with ×1.2 contrast, −0.1 offset) + a tiled 4×4 Bayer matrix (8×8 px `feImage` data-URI, so 2 px cells) via `feComposite arithmetic k2=1 k3=1 k4=-0.5`, then a `feComponentTransfer discrete 0 1` 1-bit step, then `in SourceGraphic` to keep round avatars round. `#fx-dither-fine` is the same on 1 px cells for thumbnails. | true 1-bit ordered dither, like a Mac Plus / Game Boy |
| `invert` | `grayscale(1) invert(1) contrast(1.1)` | a negative; white grounds go black, so covers sit flush with the UI |
| `color` | `none` | colour passes through untouched |
| `cyano` (mine) | SVG `#fx-cyano`: luminance → `feComponentTransfer table` from Prussian blue `≈#08214d` to paper white `≈#edf5fc` | the cyanotype: a monochrome photographic process in one hue, historically used to make the first photographic books of botanical specimens. It is the one non-grey filter that is still a single ink, and it is the flower theme's own medium. |

The mono default is not a loss of information. Every cover is drawn as a tonal composition with dark grounds and pale petals, so it holds up in greyscale and gives `dither` real gradients to quantise.

## 7. Flower inventory

Everything is drawn procedurally on canvas by `Flora` (`tools/work/terminal/mock/flora.js`, about 600 lines, no assets). It is seeded, so the same id always grows the same flowers. Silhouettes are a white fill with a ~1 px black stroke on every petal. Drawing back to front, each petal's stroke cuts a thin dark separation into the petal behind it, which is the reference's layered-petal look.

**Species (9):**

| key | species | construction |
|---|---|---|
| `sakura` | *Prunus serrulata* | 5 notched petals, stamen burst |
| `ume` | *Prunus mume* | 5 round petals, long stamens |
| `peony` | *Paeonia lactiflora* | 4 rings of ruffled petals (9/8/7/5) |
| `camellia` | *Camellia japonica* | 4 spiralled rings of round petals, dotted boss |
| `chrysanthemum` | kiku, *C. morifolium* | 4 rings of narrow rays (24/20/16/11) |
| `cosmos` | *Cosmos bipinnatus* | 8 three-toothed petals, dotted disc |
| `magnolia` | *Magnolia stellata* | 2 rings of strap petals, cone |
| `hydrangea` | *H. macrophylla* | a dome of 22–30 four-petal florets |
| `wisteria` | *W. floribunda* | hanging racemes of paired pea-flower petals that shrink toward the tip |

**Primitives:** `bloom`, `leaf` (midrib + veins), `bud` (with sepals), `petal`, `taper` (tapered branch polygon along a cubic) and `growScene` (recursive branch growth with nodes, leaves, buds, tip clusters and loose falling petals; the scene is fitted into any rect).

**Where flowers live:**

1. **Home readout:** `heroBranch`, a peony and camellia branch rising from the bottom right, after the reference.
2. **Library window:** a sakura sprig in the empty bottom-left corner.
3. **Covers:** seven tonal compositions in colour, picked by id (`bloom`, `branch`, `field`, `bouquet`, `wallpaper`, `hanging`, `moon`). Artist images are one *signature bloom* per artist. Liked Songs is a heart made of sakura on the old violet-to-mint gradient. Playlist covers add a `> name` pixel label and a pixel-blossom mark. Mixes and Top 50 add a big pixel numeral. Each cover takes 2–6 ms at 256 px; the mock makes 42 unique covers.
4. **Empty states:** Liked Songs gets a closed bud on a stem (nothing has bloomed yet). No results gets a bare twig shedding its last petals. The empty queue gets a sprig of ume.
5. **Logo and bullets:** a 13×12 pixel blossom (`BLOSSOM` grid) is the logo, the toast bullet and the cover mark.
6. **Falling petals:** a fixed canvas with 22 petals on desktop and 12 on phone. They drift down and left, flip in 3D (y-scale) and sway. The canvas uses `mix-blend-mode: difference`, so petals are XOR sprites: white on black, and they invert anything they cross, so they never hide text. They pause when the page is hidden and are removed under `prefers-reduced-motion`.

## 8. Phone adaptation (≤ 767 px)

- `#app` becomes a single column: a 44 px **phone head** (logo, short clock `05:05 PM`, avatar), then the main window (16 px gutters, its own `> /home` chrome), then the **mini player**, then the **bottom nav**. The top bar, library and player bar are hidden, as in the app.
- **Home stacks.** The readout shrinks: a 128×156 branch, 14 px type, and `Architecture` and `Session Number` hidden. Next come `/time`, the **fx switcher** (a phone-only copy, since the top bar is gone), the quick grid (2 columns of 44 px tiles) and the shelves as horizontal scrollers of 132 px cards.
- **Playlist stacks.** A 148 px cover, a 32 px title, then actions with the big inverted play button moved to the right of the bar (as SPEC asks). Rows become two-line.
- **The context menu becomes a bottom sheet:** full width, top rule only, 40 px items, the submenu replacing it (shown in the sheet section as `/menu --sheet`). The toast sits above the mini player. Dialogs fit the width, and Edit details stacks its cover above the fields.
- No horizontal page scroll at 390 px (checked: `scrollWidth > innerWidth` is false).

## 9. Why this beats a generic dark theme

1. **One ink, one rule.** A generic dark theme is grey cards on near-black with an accent colour doing the state work. Here every state is carried by shape and inversion (░ ▒ █ ┄ ▷). That makes the UI readable in pure 1-bit, legible for people who cannot see the old green, and identical across filters.
2. **Colour becomes a choice, not a default.** The user asked for monochrome with filters for non-monochrome. Every colour-carrying surface goes through one variable, so a single switch (`mono`, `dither`, `invert`, `color`, `cyano`) re-renders the whole catalogue at once, including the hero bands and the mini player tint.
3. **Structure is visible.** The window chrome (hairline, `- ×`, prompt title, corner ticks) names every region (`/library`, `/home`, `/media`) and makes a dense layout scannable without boxes or shadows. Monospace turns tables into aligned columns for free.
4. **It has a subject.** The flowers are not a texture overlay. They are the cover art, the empty states, the logo, the readout and the weather (petals), all drawn from one botanical engine. Nine real species are named in the inventory, so the theme can grow (seasonal branch species, a `Flora` per artist) instead of being a palette swap.
5. **It keeps the app intact.** Every decoration is CSS or a new `aria-hidden` element, and the text, ids, classes and aria are unchanged. Real `:hover`, `:active` and `:focus-visible` styles back the demo states. Text contrast meets AA (the lowest is `--fg-3` at 4.6:1).

## 10. Notes for the integrator

- **Icons.** Replace the sprite's `<symbol>` contents with pixel paths of the same ids (`i-play`, `i-pause`, …), drawn on 9-cell grids (`PX` in `mock.js`, rendered by `Flora.gridPath`) with `shape-rendering: crispEdges` at 2 px per cell. Doing this changes no JS. `i-explicit` becomes the 7×7 filled E.
- **Canvas type.** Covers that paint text should `await document.fonts.load('16px DotGothic16', text)` before drawing, with a 2.5 s timeout fallback.
- **Inline colour.** `--hero-color`, `--mini-color` and `--home-tint` still come from inline custom properties. Only their paint goes through `--fx`. Use the green accent nowhere; `--accent` should map to `--fg`.
- **Reduced motion.** It removes the petal layer, stops the blinking cursors and freezes the meters.
