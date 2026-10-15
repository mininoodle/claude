# Wavelength / garden — design rationale

Mock: `dist/mocks/garden.html` (standalone, all CSS and JS inline, fonts from Google Fonts only).
Screens: `tools/shots/garden/g-final-*.png` (desktop 1280×800 and phone 390×844); the whole Home under each filter is in `g-r4-d-top-{dither,invert,color,cyano}.png`. Open the mock with `?filter=dither` (or invert, color, cyano) to start on another filter.

## 1. The direction in one paragraph

This is the reference's world: a pure black screen, small white bitmap type and floating "terminal windows" made of a hairline that stops short, a `- ×` pair and a prompt line. In "garden" the flowers do most of the work. A camellia branch grows beside the system readout on Home, a sakura branch fills the empty bottom of the library, a moonflower vine hangs from the playlist hero, a peony sprig comes out of the dialog's corner and a sakura spray fills the empty slot at the end of a shelf. Petals drift over everything. Every cover is a dense flower still-life, and every genre has its own species. The flowers are white silhouettes with thin black lines between the petals, the same treatment as the reference's branch, so the page still reads as black-and-white terminal art and never as a pastel theme. Colour exists only inside covers and entity tints, and it always passes through a filter. The default filter is mono.

## 2. Tokens

| token | value | use |
|---|---|---|
| `--bg` | `#000` | page, windows (windows have no fill; they float on black like the reference) |
| `--fg` | `#fff` | text, hairlines, flower silhouettes |
| `--fg-2` | `#c2c2c2` | values (`Host: ` **wavelength**), secondary text |
| `--fg-3` | `#8a8a8a` | placeholders, dates, card subtitles, table header |
| `--fg-4` / `--fg-5` | `#4d4d4d` / `#1c1c1c` | disabled, wells |
| `--rule` | `rgba(255,255,255,.82)` | window hairline |
| `--rule-2` | `rgba(255,255,255,.32)` | faint dividers, field underline, nav squares |
| `--hover` / `--hover-2` | `rgba(255,255,255,.08)` / `.15` | row and tile hover; active library row |
| `--sel-bg` / `--sel-fg` | `#fff` / `#000` | selection is an inverted block, like a terminal selection |
| `--dash` | 3px on / 3px off at 80% white | the reference's dashed rule (under quick picks, table header) |
| `--dash-faint` | 2/2 at 35% | slider tracks, tile underlines, menu separators |
| `--checker` | 2px 50% white checkerboard | 1-bit "drop shadow" under menus, dialogs and toasts; the dialog backdrop is a dark checker too |
| `--accent` | per filter: `#fff` (mono, dither, invert), `#1ed760` (color), `#a8c6ff` (cyano) | now-playing title, equaliser, speaker, toggled icons, liked check |
| `--play-bg` / `--play-fg` | `#fff`/`#000`; green under color | the blossom play button |
| `--tone-filter` | see section 7 | applied to everything that carries colour |
| `--topbar-h` / `--player-h` / `--sidebar-w` | 44px / 82px / 248px | desktop grid |
| `--pad` / `--gap` | 16px / 24px | page side padding / gutter between library and main |
| `--blossom` | 5-petal SVG mask | play buttons; the slider thumb is the same blossom in white |

Spacing inside windows: the hairline sits on an 11px chrome row and the title line starts 5px below it, indented 6px. Rows are 50px (library, tracks), quick tiles 34px (46px on phone), and cards have 4px padding with a 10px column gap.
Motion: the cursor `_` blinks in 1.1s steps. The equaliser is 3 bars animated in 4 steps (pixel motion, not smooth). The blossom play button turns 18° and grows 7% on hover and turns further and shrinks on press. Petals fall at 0.2 to 0.6px per frame with a sway. Under `prefers-reduced-motion: reduce` all animation and transition stops, and the petals freeze in place.

## 3. Type

- Family: **VT323** (Google Fonts), a monospace bitmap terminal face with real lowercase. It stays readable at 15px and still looks like the reference.
- CJK: **DotGothic16** (Google Fonts), a pixel face that has the kanji, so `Contact: 花鳥風月` stays pixel-style.
- Stack: `'VT323', 'DotGothic16', ui-monospace, 'Cascadia Mono', Consolas, 'Courier New', monospace`.
- VT323 sets small and narrow (about 0.4em per character), so the px values are larger than they would be in Figtree:

| role | size | where |
|---|---|---|
| xs | 15px | card subtitles, row artist lines, dates, durations, library subtitles |
| sm | 16px | labels, chips, readout, table header, eyebrow, filter switcher, `- ×` |
| body / md | 18px | row titles, menu items, search input, quick tiles, `Song:` / `Author:` |
| lg | 20px | shelf titles, browse tile names, bands |
| xl | 24px | dialog title, empty-state title |
| hero | 84px desktop, 44px phone | playlist / album / artist titles (VT323 is narrow: 84px holds about 16 characters in the hero column; suggested steps 84 / 64 / 48 / 36 by length) |
| CJK | 14px DotGothic16 | readout contact line |

The weight is always regular, because VT323 has only one. Hierarchy comes from size, from white against grey, and from inversion (a white block with black text).
Window titles, chips, eyebrows, the sort control and shelf titles are lowercased with `text-transform`. Their DOM text stays as it is ("Made For You", "Your Library", "Show all"). Track, artist and album names keep their case.

## 4. Window chrome anatomy

```
──────────────────────────────────────────────╴      - ×     ← .chrome: 1px rule (--rule) that stops --stop (24px) short; "- ×" raised 3px
> /made for you                                 [ show all ]  ← title line: prompt ">" + "/" (CSS) + the existing heading text, lowercased
[content]
- - - - - - - - - - - - - - - - - - - - - - - -               ← optional dashed rule (--dash) closing the window
```

- `.chrome` is a new `aria-hidden` element: a flex row holding `.chrome__rule` and `.chrome__ctl`. The `.chrome--short` variant ends the rule at `--len` (for example 62%) and pushes `- ×` to the far right, which is the reference's `look_in.txt` window.
- The `>` prompt and the `/` path prefix are `::before` content or `aria-hidden` spans. Bracket chips are `::before "["` and `::after "]"`. No existing text node changes.
- `- ×` is decorative by default. Where the app already has the real control, the control takes the `×` slot: the dialog's `closeButton` and the right panel's close button. The library's `-` is a natural place for the rail toggle.
- Floating windows (context menu, dialog, toast) are a black sheet (white for the toast) with a 1px white border and a 6px-offset dithered shadow. Both are pseudo-elements (`::before` sheet, `::after` checker) inside the element's own stacking context.
- Cursor: a blinking `_` after the search placeholder (hidden while focused or filled), after `look_in.txt`, after the playing track's title, and in the footer.

## 5. How each app region maps to a window

| region (ids, classes kept) | garden treatment |
|---|---|
| `#topbar` | No chrome, so it reads as the shell prompt. Logo: a white sakura blossom (canvas) + `wavelength`. Home: a 34px hairline square, inverted when on Home. Search (`.search-pill`): `> ` prompt + input + blinking `_`, underline rule, the divider kept, Browse icon. Right: the **filter switcher** (new `.fx` radiogroup: `filter: [mono] dither invert color cyano`) and the avatar, whose colour disc is filtered. |
| `#sidebar` | Window `> /your library` with `+`. Chips are `[playlists] [artists] [albums]`. Rows keep cover, name and subtitle. The active route row gets `--hover-2` and a `>` in the gutter, and the playing context shows the accent speaker. A new `canvas.lib-flora` fills the empty space under the list with a sakura branch. In rail mode it is hidden. |
| `#main` on Home | A desktop of windows: `/home` (back/forward squares, `[all] [music] [podcasts]`), `/time` (live clock `DD-MM-YYYY hh:mm AM/PM`), `look_in.txt` (the quick picks, closed by the dashed rule), the **system readout** with the camellia branch (Host, Os, Library, Contact 花鳥風月 / FPS live, Filter, Connection: ESTABLISHED, Session Number: 1207), then one window per shelf. The empty last slot of a short shelf grows a spray. |
| `#main` on playlist/album/artist | A strip window `> /playlist/late_night_drive` (`aria-hidden` path) with the existing nav buttons. The hero eyebrow reads `> cat playlist`, the title is 84px VT323, and the cover sits in a hairline mount. The hero tint (`--hero-color`) is a `::before` gradient through the filter. A moonflower vine (the genre's species) hangs down the right edge. Actions: blossom play/pause, icon buttons. Track table: a lowercase header over a dashed rule. |
| `#right-panel` (not drawn) | Window `/now playing` or `/queue`. The existing close button is the `×`. The large cover is filtered, and the about-artist image uses a round portrait cover. |
| `#player-bar` | Window `/media`: the rule spans the bar, then `> /media`, the cover, `Song: <title>` and `Author: <artist>` (the labels are `aria-hidden` spans; the links are unchanged), add circle, controls with a **white square** play/pause, and a progress slider on a dotted track with a solid white fill and a blossom thumb on hover. Volume works the same way. |
| `#mini-player` | A small `/media` window. The `--mini-color` tint is a filtered gradient at 50%. Cover, `Song:`/`Author:`, add circle, blossom play. The 2px progress line is dotted with a white fill. |
| `#bottom-nav` | Three items with lowercased labels. The active label is an inverted block and its icon is the filled one. |
| `#expanded-player` (not drawn) | A full-screen `/media` window with the big filtered cover, a branch of the context's species growing from the top corner, and the same controls with a 64px blossom play. |
| `#context-menu` | A floating window with an `aria-hidden` head `> letter --opts`. The hovered item and the open submenu parent are inverted. The submenu opens to the right. Separators are dotted. The "Find a playlist" field gets a `>` prompt. |
| `#dialog-root` | Dithered backdrop. The dialog is a window whose `- ×` has the real close button as its `×`. The title gets a `>` prompt, the primary action is `[ Add anyway ]` (inverted block) and the secondary is a text button. A peony sprig grows out of the lower-left corner. |
| `#toast-root` | A white sheet with black text and a black blossom mark (canvas). The dithered shadow is kept. |
| empty states | A white seedling (a stem, two leaves and a bud on a ground line) above the existing copy ("Songs you like will appear here"). |
| `.browse-card` | The filtered genre colour as the tile. The genre's species grows in white from the bottom-right corner, tilted like the old rotated cover. The name and the `species.sp` tag sit on black labels. |

## 6. Flower inventory

All flowers come from one canvas engine (the `Flora` IIFE in the mock, intended for `src/flora.js`). It uses shared petal paths (`notch`, `oval`, `lance`, `strap`, `spoon`, `ruffle`), leaf paths (`lance`, `serrate`, `heart`, `blade`, `pad`, `lobed`, `pinnate`, `spiny`, `toothed`), a tapered stem polygon and seeded randomness (mulberry32 + FNV, the same algorithms as `data.js`). Each petal is filled and then stroked in the opposite ink, which makes the thin dark separations.

| # | species | genre | form | leaf |
|---|---|---|---|---|
| 01 | sakura (5 notched petals, stamens) | Pop | woody branch | serrate |
| 02 | chrysanthemum (7 rings of strap/spoon florets) | Hip-Hop | stalks | lobed |
| 03 | rose (spiral, 3 rings) | Rock | stalks | serrate |
| 04 | wisteria (hanging racemes) | Indie | hanging vine | pinnate |
| 05 | moonflower (pentagonal trumpet, star folds) | Electronic | twining vine with tendrils | heart |
| 06 | camellia (4 offset rows of round petals) | Lo-Fi | woody | lance |
| 07 | magnolia (goblet side view) | Jazz | woody | lance |
| 08 | lily (6 tepals, veins, spots, long stamens) | Classical | stalks | blade |
| 09 | lotus (side view, pad) | Ambient | pad + stalks | pad |
| 10 | peony (5 ruffled layers) | R&B | woody | lobed |
| 11 | daisy (18+18 rays, seeded disc) | Folk | stalks | lance |
| 12 | hibiscus (5 veined ruffles, staminal column) | Latin | woody | serrate |
| 13 | sunflower (2 rings, phyllotaxis disc) | Funk | stalks | heart |
| 14 | thistle (bract globe, brush) | Metal | stalks | spiny |
| 15 | iris (standards and bearded falls) | New Releases | stalks | blade |
| 16 | dandelion (seed head, pappus) | Charts | stalks | toothed |

Where the flowers appear:
- **Silhouettes (white, UI layer, never filtered):** the logo mark, the Home branch (camellia with peony), the library branch (sakura), the shelf-corner spray (sakura), the hero vine (the context genre's species; moonflower for Late Night Drive), the dialog sprig (peony), the empty-state seedling, the toast mark, browse tiles, the herbarium, and the falling-petal layer (about 20 notched petals, `mix-blend-mode: difference` so they show on white blocks too).
- **Covers (colour, always filtered):** composed in a fixed 300-unit space and scaled, so an entity looks the same at 34px and at 184px. Each cover has a dithered gradient ground in the entity hue and a dense still-life. Playlists are a bouquet of their genre's species plus a companion. Albums are a branch or stalks behind a lighter bouquet, or one large bloom about 30% of the time. Artists are a single large bloom in a round crop. Mixes carry a `mix 01` pixel label, Top 50 is dandelions with a `top 50` label, and Liked Songs is a heart cut from blossoms on the violet-to-mint gradient. The cover is finished with a 7-level 4×4 Bayer quantisation, so the tones are dithered before any filter runs.

## 7. Filter definitions

The filter is set once on `:root[data-filter]`. The value is persisted (`localStorage` in the mock; the app would use prefs). Every colour carrier reads `filter: var(--tone-filter)`.

| filter | `--tone-filter` | accent | intent |
|---|---|---|---|
| **mono** (default) | `grayscale(1) contrast(1.12) brightness(1.04)` | white | the reference's black and white |
| **dither** | `url(#wl-dither)`: luminance, contrast boost (`slope 1.55, intercept -0.2`), minus a tiled 8×8px Bayer threshold (`feImage` whose PNG is generated at runtime, then `feTile`), `feComposite arithmetic k2=1 k3=-1 k4=.5`, alpha forced to 1, `feComponentTransfer discrete "0 .94"`, then `in SourceAlpha` | white | 1-bit ordered dither, like an early Mac screen |
| **invert** | `grayscale(1) invert(1) contrast(1.06)` | white | negatives: dark flowers on pale paper |
| **color** | `none` | `#1ed760` (the old green comes back) | colour passes through; the chrome stays black and white |
| **cyano** (own) | `url(#wl-cyano)`: luminance, then a `feComponentTransfer` table from Prussian blue `#051a45` to paper white | `#a8c6ff` | a cyanotype, the sun print of a pressed flower. It is the historical way to print flowers in one ink, so it fits "garden" |

What the filter applies to: cover canvases (`.cover`, `canvas` in cards, rows, tiles, hero, player), artist images, `.browse-card::before` (genre colour), `.hero::before` (`--hero-color` gradient), the Home tint, `.mini-player::before` (`--mini-color`), `#expanded-player` background (`--xp-color`), the avatar disc, and the Liked Songs gradient. It never applies to text, icons, rules or silhouettes. Browse-tile labels sit on black so they read under every filter.
The switcher is a `role="radiogroup"` of `role="radio"` buttons (arrow keys move the selection, roving tabindex). It lives in the top bar on desktop and tablet and in a `/filter` window on the phone Home. The readout's `Filter:` line mirrors the value.

## 8. Interaction states (all live CSS; the mock also forces them with `.is-hover` / `.is-focus` / `.is-press` so they show in stills)

- Hover: rows, tiles and cards get `--hover`. The card play blossom slides up 6px and fades in. Icon buttons go from `--fg-2` to white. Chips go white. Text links underline. Nav squares get a white border.
- Active / pressed: the blossom turns 36° and shrinks to 0.93. Icon buttons drop 1px. A toggled icon (shuffle, repeat, the panel toggles) is drawn in `--accent` with a 4×2px bar under it. An active chip, nav square or filter is an inverted block.
- Selected row: an inverted white block with black text and a `>` in the gutter (desktop only; no selection on phone, per SPEC).
- Playing: a 3-bar stepped equaliser in the index cell. The title is in `--accent` with a blinking `_`. The library row and quick tile show the speaker or equaliser. The play buttons show pause.
- Focus-visible: a 1px dashed white outline offset by 3px, on everything including sliders. The search field gets a solid 1px box.
- Disabled: `--fg-4` icon with a `--fg-5` border.

## 9. Phone adaptation (< 768px)

- The SPEC grid is kept: `main / mini / nav`, with the top bar, library and player bar hidden. Inside `#main` (16px gutters) the windows stack: `/home` (avatar + chips), `/time`, the system readout with a more upright branch (the preset tilts by canvas aspect so the blooms stay inside), `look_in.txt` (2 columns, 46px tiles, 2-line names), `/filter` (the switcher, since there is no top bar), then shelves that scroll horizontally (132px cards).
- The mini player is a small `/media` window: `Song:`/`Author:` lines, the filtered tint at 50%, a blossom play and a dotted progress line. The bottom nav has the inverted active label.
- Playlist: the strip window, a 150px cover centred with the vine hanging at the screen edge, a 44px title, the action bar with the blossom play pushed right, and rows with cover, title, artist and an always-visible `…`.
- The track menu becomes a bottom sheet above the mini player. The "Add to playlist" submenu opens inline (indented, dashed sheet) instead of to the side. The toast moves to the top of the scene so the sheet never covers it. The dialog shrinks to the viewport minus 32px.
- Tablet (768–1023px): rail library (covers only), no filter label, the Home columns stacked, the Date added column hidden.
- No horizontal scroll at 390px (checked: `scrollWidth == innerWidth == 390`).

## 10. Why this is better than a generic dark theme

1. **One idea everywhere instead of a palette.** A dark theme is "the same app with grey surfaces". Here every region is a window from the same terminal, and the flowers are the content and the brand at once. A screenshot of any corner (a shelf, a dialog, the toast) is recognisably this product.
2. **Colour is a choice the listener makes.** The filter layer separates the information (shapes, names, states) from the mood (colour). Mono is calm and legible, color restores the album art, dither and cyano are play. It is one CSS variable, so it costs nothing per component, and the old green accent has a place again.
3. **The covers stop competing with the UI.** Generated covers in full colour fight each other on a dark grid. Through mono they read as a herbarium: a family of grey prints, with white blossoms carrying the brightness.
4. **States are more legible.** Selection is an inverted block, focus a dashed box, playing a blinking cursor plus equaliser. These are binary black/white signals that need no colour, so they survive every filter, including 1-bit dither.
5. **Generative but deterministic.** Sixteen species from one small engine, seeded by entity id, give each genre an identity (browse tiles, hero vines, covers) without image assets, and an entity looks identical at every size.

## 11. Notes for the build phase

- `src/flora.js` should expose roughly what the mock's `Flora` does: `paint(canvas)` driven by `data-art` (`cover`, `spray` + `data-preset`, `spec`, `tile`, `mark`, `sprout`), `cover({seed, hex, sp, kind, label}, size)`, the `GENRE → species` map, and `petalsLayer(canvas)`. `Catalog.cover` / `artistImage` / `playlistMosaic` can delegate to it, with the same seed and all cover art kept in colour.
- The SVG `<filter>` defs must sit in `src/index.html` (zero-size, never `display:none`). The Bayer `feImage` href is generated once at runtime and must set both `href` and `xlink:href`.
- The petal canvas must be `aria-hidden`, `pointer-events:none` and below `#context-menu` / `#dialog-root` in the real app. The mock puts it on top only for the stills.
- The filter preference belongs in `Library` prefs (`filter`), restored before the first paint so covers never flash in colour.
- Repaint silhouettes on resize, debounced (they are drawn at CSS size × DPR). Covers repaint only when their size changes.
- No existing text nodes are touched. All decoration is `::before`/`::after`, `text-transform`, or new `aria-hidden` elements (`.chrome`, `.wt__p`, `.wt__path`, `.pb-k`, the readout, canvases).
