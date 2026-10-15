# Wavelength — COMPONENTS.md

What `src/styles.css` gives every other file. Copy the snippets verbatim; the
class names, modifiers, state classes and data attributes below are what the
CSS keys on.

Two layers:

1. **Contract layer (SPEC §2/§3/§10)** — tokens, base reset, the `#app` grid,
   breakpoints, resizers, scrollbars and the primitives (icon, icon-btn,
   play-btn, pill, chip, cover, equaliser, eyebrow, utilities). This is the part
   app.js / player.js may rely on.
2. **Component markup (reference only)** — the markup the component styles
   key on for every component of SPEC §8 (top bar, sidebar, hero, track table,
   menus, dialogs, toasts, sliders, player bar, mini/expanded player,
   phone/tablet overrides). Per the CSS ownership rule of SPEC §3 those styles
   no longer live in styles.css: the app components are part 1 of `app.css`
   and the player components (sliders, player bar, mini and expanded player)
   are part 0 of `player.css`, still as single-class selectors in the same
   order. styles.css itself holds only the contract layer above.

Conventions:

- Icons: `<svg class="icon" aria-hidden="true"><use href="#i-name"/></svg>`.
- Every play button holds **both** `i-play` and `i-pause`; the inactive one has
  the `hidden` attribute. CSS never flips icons; JS toggles `hidden`.
- State classes: `.is-current` (track/context is the loaded one), `.is-playing`
  (current *and* playing), `.is-selected` (clicked row), `.is-active` (open route
  / toggled button), `.is-liked` (like button of a liked track), `.is-open`
  (expanded inline input / submenu parent), `.is-visible` (strip title, tooltip),
  `.is-stuck` (table header), `.is-disabled` or the `disabled` attribute.
- Data attributes: `data-track-id` on anything representing a track;
  `data-context-uri` on anything playable as a context (cards, quick tiles,
  `.lib-row`, hero/strip play buttons, `.top-result`); `data-route` /
  `data-id` on navigation targets (your choice, CSS ignores them);
  `data-qid` on queue rows.
- Visibility: toggle with the `hidden` attribute (`[hidden]{display:none!important}`
  is in styles.css too), never inline `display`.
- Events: listen on the element named in each section ("receives click"). Use
  delegation on `#main` / `#sidebar`; CSS hover states need no JS.
- Colours per entity go in inline custom properties, never inline `background`:
  `style="--hero-color:#503750"`, `--browse-color`, `--mini-color`, `--xp-color`,
  `--home-tint` (on `#main`), `--strip-tint` / `--strip-opacity` (on `.main-header`).

---

## 1. Tokens, reset, grid

Tokens are exactly SPEC §2 plus these additions: `--avatar-bg`, `--shadow-menu`,
`--shadow-toast`, `--selected` (rgba 255,255,255,.3), `--tile-hover`,
`--overlay`, `--backdrop`.

`#app` grid (SPEC §10) is driven by attributes app.js sets on `#app`:

| attribute | values | effect |
|---|---|---|
| `data-right` | `now-playing` / `queue` / `none` (or missing) | three-column vs two-column grid; keep `hidden` on `#right-panel` when `none` |
| `data-sidebar` | `full` / `rail` (or missing) | sidebar column `--sidebar-w` vs `--sidebar-rail-w`; rail also hides sidebar text via the `--rail-*` variables (below) |
| `data-view` | route view | unused by styles.css, free for app.css |

Resizing: set `--sidebar-w` / `--right-w` inline on `#app`
(`app.style.setProperty('--sidebar-w', px + 'px')`). `#resizer-left` /
`#resizer-right` get `cursor: col-resize`, a hover line, and `.is-dragging`
keeps the line visible. They are display:none below 1024px and
`#resizer-right` is hidden whenever `data-right` is not a panel mode.

Scroll containers: `#sidebar`, `#main`, `#right-panel` (overflow-y auto,
overlay scrollbars), `#expanded-player`, `.context-menu`.

Breakpoints (verbatim strings, also for `matchMedia`):
`(max-width: 767px)` phone, `(min-width: 768px) and (max-width: 1023px)` tablet,
`(min-width: 1024px)` desktop.

Rail-mode variables (set by styles.css under `#app[data-sidebar="rail"]` and
in the tablet media query; app.css may reuse them):
`--rail-hide: none` (display value for text/chips/filter rows),
`--rail-cols: 48px` (lib-row columns), `--rail-pad: 4px`, `--rail-just: center`,
`--rail-dir: column` (the header stacks the library icon above the + button).

## 2. Primitives

### Icon
```html
<svg class="icon" aria-hidden="true"><use href="#i-play"/></svg>
<svg class="icon icon--sm" aria-hidden="true"><use href="#i-more"/></svg>   <!-- 16px -->
<svg class="icon icon--lg" aria-hidden="true"><use href="#i-add-circle"/></svg> <!-- 32px -->
<svg class="icon icon--xs" aria-hidden="true"><use href="#i-pin"/></svg>    <!-- 12px -->
```
24px, `fill: currentColor`, `flex: none`, `pointer-events: none` (clicks hit the button).

Sprite ids: `i-logo i-home i-home-filled i-search i-search-filled i-library
i-library-filled i-plus i-play i-pause i-next i-prev i-shuffle i-repeat
i-repeat-one i-add-circle i-check-circle i-heart i-heart-filled i-volume-high
i-volume-mid i-volume-low i-volume-off i-queue i-now-playing i-more i-close
i-chevron-left i-chevron-right i-chevron-down i-arrow-left i-clock i-list
i-grid i-speaker i-check i-sort i-browse i-pin i-trash i-edit i-explicit
i-expand i-collapse i-download i-share i-verified`.
`i-verified` draws its check in `var(--fg)`; colour the badge with
`class="icon badge-verified"` (`--verified`). `i-explicit` is a filled square
with a cut-out E: use `class="icon icon--sm badge-e"` (`--fg-sub`).

### Icon button
```html
<button class="icon-btn" aria-label="More options"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-more"/></svg></button>
<button class="icon-btn icon-btn--dot is-active" aria-label="Queue">…</button>   <!-- accent + 4px dot under the icon -->
<button class="icon-btn icon-btn--lg" …>   <!-- 40px hit area -->
<button class="icon-btn icon-btn--round" …> <!-- --bg-elevated disc -->
```
32×32, `--fg-sub`, hover `--fg`, `.is-active` `--accent`, `disabled` / `.is-disabled` `--fg-muted`. Receives click.

### Play button
```html
<button class="play-btn" aria-label="Play Daily Mix 1" data-context-uri="playlist:pl_dailymix1">
  <svg class="icon" aria-hidden="true"><use href="#i-play"/></svg>
  <svg class="icon" aria-hidden="true" hidden><use href="#i-pause"/></svg>
</button>
```
48px green. `.play-btn--lg` 56px (action bar), `.play-btn--xl` 64px,
`.play-btn--white` 32px white/black (player bar), `.play-btn--white.play-btn--xl`
64px white (expanded player). Hover `--accent-hover` + `scale(1.04)`;
`disabled` → grey. Inside `.card` / `.quick-tile` / `.top-result` the button is
absolutely positioned and revealed on hover, focus-within or `.is-playing`.

### Pill, chip
```html
<button class="pill">Follow</button>
<button class="pill pill--primary">Save</button>       <!-- white, black text -->
<button class="pill pill--outline">Add</button>        <!-- 1px --fg-muted border, white on hover -->
<button class="pill pill--sm">Popular releases</button>
<button class="chip" aria-pressed="true">Playlists</button>
<button class="chip chip--icon" aria-label="Clear filters"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-close"/></svg></button>
```
Chips: 32px, `--bg-tinted-strong`; `[aria-pressed="true"]` or `.is-active` → white.
Wrap chips in `<div class="chips">` (flex, 8px gap); add `chips--home` on Home.

### Cover
```html
<img class="cover cover--48" src="data:…" alt="">
<img class="cover cover--48 cover--round" src="data:…" alt="">
```
Sizes: `cover--24` (round), `--32`, `--40`, `--48`, `--56`, `--64`, `--92`.
No size class → sized by the parent (`.card__cover`, `.hero__cover`, …).

### Equaliser, eyebrow, avatar, utilities
```html
<span class="equaliser" aria-hidden="true"><i></i><i></i><i></i></span>
<span class="eyebrow">Playing from playlist</span>
<span class="avatar">N</span> <span class="avatar avatar--24">W</span>
```
Utilities: `.truncate`, `.clamp-2`, `.clamp-3`, `.sr-only`, `.tabular`,
`.text-link` (14px/700 `--fg-sub`, hover white underline), `.link` (underline on
hover), `.text-btn` (bold white text button, secondary dialog action).

---

## 3. Top bar (`#topbar`, app.js)

```html
<div class="topbar__left">
  <button class="topbar__logo" aria-label="Wavelength" data-route="home"><svg class="icon" aria-hidden="true"><use href="#i-logo"/></svg></button>
</div>
<div class="topbar__center">
  <button class="round-btn is-active" aria-label="Home" data-route="home"><svg class="icon" aria-hidden="true"><use href="#i-home-filled"/></svg></button>
  <div class="search-pill">
    <svg class="icon" aria-hidden="true"><use href="#i-search"/></svg>
    <input class="search-pill__input" type="search" placeholder="What do you want to play?" aria-label="Search">
    <button class="icon-btn search-pill__clear" aria-label="Clear search" hidden><svg class="icon icon--sm" aria-hidden="true"><use href="#i-close"/></svg></button>
    <span class="search-pill__divider" aria-hidden="true"></span>
    <button class="icon-btn search-pill__browse" aria-label="Browse"><svg class="icon" aria-hidden="true"><use href="#i-browse"/></svg></button>
  </div>
</div>
<div class="topbar__right">
  <button class="avatar-btn" aria-label="Account menu"><span class="avatar">N</span></button>
</div>
```
`#topbar` is already `.topbar` (3-column grid). `.round-btn` = 48px `--bg-elevated`
disc (`.is-active` white icon; swap `i-home` ↔ `i-home-filled` yourself).
`.search-pill` hover → `--bg-highlight` + `--fg-muted` border, `:focus-within`
→ 2px white inset ring. Show/hide `.search-pill__clear` with `hidden`. Events:
`input` on `.search-pill__input`, click on `.search-pill__clear`,
`.search-pill__browse`, `.avatar-btn`, `.round-btn`.

## 4. Library panel (`#sidebar`, app.js)

```html
<div class="lib-header">
  <button class="lib-title" aria-label="Collapse Your Library" title="Your Library"><svg class="icon" aria-hidden="true"><use href="#i-library-filled"/></svg><span>Your Library</span></button>
  <button class="icon-btn lib-add" aria-label="Create playlist"><svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg></button>
</div>
<div class="lib-chips">
  <button class="chip chip--icon" aria-label="Clear filters" hidden><svg class="icon icon--sm" aria-hidden="true"><use href="#i-close"/></svg></button>
  <button class="chip" aria-pressed="false">Playlists</button>
  <button class="chip" aria-pressed="false">Artists</button>
  <button class="chip" aria-pressed="false">Albums</button>
</div>
<div class="lib-filter">
  <div style="display:flex;align-items:center;gap:4px;min-width:0">
    <button class="icon-btn" aria-label="Search in Your Library"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-search"/></svg></button>
    <div class="lib-filter__input"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-search"/></svg><input type="text" placeholder="Search in Your Library" aria-label="Search in Your Library"></div>
  </div>
  <button class="lib-sort" aria-label="Sort by: Recents">Recents <svg class="icon icon--sm" aria-hidden="true"><use href="#i-chevron-down"/></svg></button>
</div>
<ul class="lib-list">
  <li>
    <button class="lib-row is-active is-current is-playing" data-context-uri="liked" title="Liked Songs" aria-label="Liked Songs">
      <span class="lib-row__cover"><img class="cover cover--48" src="…" alt=""><span class="lib-row__play" aria-hidden="true"><svg class="icon" aria-hidden="true"><use href="#i-play"/></svg><svg class="icon" aria-hidden="true" hidden><use href="#i-pause"/></svg></span></span>
      <span class="lib-row__text">
        <span class="name">Liked Songs</span>
        <span class="sub"><svg class="icon icon--xs" aria-hidden="true"><use href="#i-pin"/></svg>Playlist • 23 songs</span>
      </span>
      <span class="lib-row__end"><svg class="icon icon--sm lib-row__speaker" aria-hidden="true"><use href="#i-speaker"/></svg></span>
    </button>
    <button class="icon-btn lib-row__more" aria-label="More options for Liked Songs">…i-more…</button>  <!-- optional; put it inside the <li>, absolutely positioned over the row -->
  </li>
</ul>
<div class="lib-empty"><strong>Couldn't find "zzz"</strong>Try searching again using a different spelling or keyword.</div>
```
Artists: add `lib-row__cover--round` to `.lib-row__cover` and `cover--round` to the img.
States: hover `--bg-tinted`; `.is-active` (open route) `--bg-tinted-strong`;
`.is-current` green name; `.is-playing` shows `.lib-row__speaker` (green) and
keeps the play overlay hidden until hover. `.lib-filter__input.is-open` expands
to 190px. Rail mode (desktop `data-sidebar="rail"` or tablet) hides
`.lib-title span`, `.lib-chips`, `.lib-filter`, `.lib-row__text`,
`.lib-row__end`, `.lib-empty` and centres the 48px covers; the markup is identical.
Events: click on `.lib-row` (navigate), click on `.lib-row__play` (stopPropagation,
`Player.toggleContext`), contextmenu on `.lib-row`, click on `.lib-row__more`,
`.lib-title`, `.lib-add`, chips, `.lib-sort`, input on the filter.

## 5. Main panel chrome (`#main`, app.js)

Render on every route, in this order:
```html
<div class="main-header" style="--strip-tint:#1e3264;--strip-opacity:0">
  <div class="main-header__nav">
    <button class="nav-btn" aria-label="Go back"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-chevron-left"/></svg></button>
    <button class="nav-btn nav-btn--forward" aria-label="Go forward" disabled><svg class="icon icon--sm" aria-hidden="true"><use href="#i-chevron-right"/></svg></button>
  </div>
  <div class="main-header__ctx">                       <!-- add .is-visible once .hero h1 leaves view -->
    <button class="play-btn" aria-label="Play Late Night Drive" data-context-uri="playlist:pl_x">…both icons…</button>
    <span class="main-header__title">Late Night Drive</span>
  </div>
  <div class="main-header__end">…optional right-side content…</div>
</div>
<div class="home-head" aria-hidden="true"></div>       <!-- Home only: 300px tint fade; tint = --home-tint on #main -->
<div class="page">…content with 24px side padding (16px on phone)…</div>
```
`.main-header` is sticky (64px, z-index 5). Its background is a pseudo-element:
set `--strip-tint` (page tint colour) and `--strip-opacity` (0…1, from
`scrollTop / 300`) inline as the view scrolls. Pages with a hero use
`<section class="page page--hero" style="--hero-color:#503750">` and put the
`.hero` first (it bleeds under the strip by itself). `#main` is a size
container: hero titles and quick picks step down when `#main` is narrow.

## 6. Home

```html
<div class="chips chips--home"><span class="avatar" hidden>N</span><button class="chip" aria-pressed="true">All</button><button class="chip" aria-pressed="false">Music</button><button class="chip" aria-pressed="false">Podcasts</button></div>
<div class="quick-grid">
  <button class="quick-tile" data-context-uri="playlist:pl_dailymix1" data-color="#8d67ab">
    <img class="cover" src="…" alt="">
    <span class="quick-tile__name">Daily Mix 1</span>
    <span class="play-btn" aria-hidden="true"><svg class="icon" aria-hidden="true"><use href="#i-play"/></svg><svg class="icon" aria-hidden="true" hidden><use href="#i-pause"/></svg></span>
  </button>
</div>
```
Tiles: 48px (56px phone), 4 per row (2 on phone / narrow main), hover
`--tile-hover` reveals the play button; `.is-current` green name,
`.is-playing` keeps the button visible. Click on `.play-btn` inside = play
(check `e.target.closest('.play-btn')`), elsewhere = navigate; `mouseenter` on
a tile → `main.style.setProperty('--home-tint', color)`, `mouseleave` on
`.quick-grid` → `removeProperty`.

Shelves and cards:
```html
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
`card-grid--row` shows one row only (extra rows are clipped); use plain
`card-grid` for "Show all" section pages. Artist cards: `card card--round` +
`cover cover--round`. Recent-search cards add
`<button class="icon-btn card__close" aria-label="Remove …">i-close</button>`
as the first child. States: `.is-playing` keeps the play button up,
`.is-current` green title. On phone the grid becomes a horizontal scroller of
150px cards (play buttons hidden). Events: click on `.card .play-btn`,
click/contextmenu on `.card`.

## 7. Search

```html
<h2 class="section-title" style="margin-bottom:16px">Browse all</h2>
<div class="browse-grid">
  <button class="browse-card" style="--browse-color:#e13300" data-route="genre" data-id="ge_pop">Pop<img class="cover" src="…" alt=""></button>
</div>

<div class="search-top">
  <div class="search-col"><h2 class="search-col__title">Top result</h2>
    <div class="top-result" role="button" tabindex="0" data-context-uri="artist:ar_1">
      <img class="cover cover--92 cover--round" src="…" alt="">
      <div class="top-result__name">Marlow Vane</div>
      <div class="top-result__meta"><a href="#">Artist name (songs only)</a><span class="type-pill">Artist</span></div>
      <button class="play-btn" aria-label="Play Marlow Vane">…both icons…</button>
    </div>
  </div>
  <div class="search-col"><h2 class="search-col__title">Songs</h2>
    <div class="song-list">
      <div class="song-row" data-track-id="tr_1" tabindex="0">
        <span class="song-row__cover"><img class="cover" src="…" alt=""><button class="song-row__play" aria-label="Play"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-play"/></svg><svg class="icon icon--sm" aria-hidden="true" hidden><use href="#i-pause"/></svg></button></span>
        <span class="song-row__text"><span class="song-row__title">Glass Houses</span><span class="song-row__artist"><svg class="icon icon--sm badge-e" aria-hidden="true"><use href="#i-explicit"/></svg><a href="#">The Hollow Lights</a></span></span>
        <span class="song-row__end"><button class="icon-btn song-row__like" aria-label="Add to Liked Songs"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-add-circle"/></svg></button><span class="song-row__dur">3:42</span><button class="icon-btn song-row__more" aria-label="More options">…i-more…</button></span>
      </div>
    </div>
  </div>
</div>
<div class="no-results"><div class="no-results__title">No results found for 'xqzv'</div><div class="no-results__text">Please make sure your words are spelled correctly, or use fewer or different keywords.</div></div>
```
`.song-row` states: `.is-current`, `.is-playing` (overlay stays), `.is-selected`,
`.song-row__like.is-liked` (always visible, green). The same `.song-row` is used
in the right panel queue card. Phone search header:
```html
<div class="search-header"><h1 class="search-header__title">Search</h1>
  <div class="search-field"><svg class="icon" aria-hidden="true"><use href="#i-search"/></svg><input type="search" placeholder="What do you want to listen to?" aria-label="Search"><button class="icon-btn" aria-label="Clear search" hidden>…i-close…</button></div>
</div>
```
(`.search-header` / `.search-field` are only styled under the phone query; render them only there.)

## 8. Hero + action bar (playlist / album / artist / liked / genre / user playlist)

```html
<section class="page page--hero" style="--hero-color:#503750">
  <div class="hero">                                   <!-- add: hero--artist | hero--liked | hero--genre | hero--editable -->
    <div class="hero__cover"><img class="cover" src="…" alt=""></div>     <!-- artist: hero__cover hero__cover--round -->
    <div class="hero__info">
      <span class="hero__type">Playlist</span>         <!-- "Album" / "Single" / "EP" / "Public Playlist" -->
      <h1 class="hero__title title-96">Late Night Drive</h1>   <!-- title-96 (≤15 chars) | title-72 (≤25) | title-48 (≤40) | title-32 -->
      <p class="hero__desc">Neon-lit synths for the open road.</p>
      <div class="hero__meta"><span class="avatar avatar--24">W</span><b>Wavelength</b><span>•</span><span>1,234,567 saves</span><span>•</span><span>50 songs,</span><span>about 2 hr 50 min</span></div>
    </div>
  </div>
  <div class="hero-band" aria-hidden="true"></div>    <!-- 232px gradient band behind the action bar -->
  <div class="actions">
    <button class="play-btn play-btn--lg" aria-label="Play Late Night Drive" data-context-uri="playlist:pl_x">…both icons…</button>
    <button class="icon-btn" aria-label="Enable shuffle"><svg class="icon icon--lg" aria-hidden="true"><use href="#i-shuffle"/></svg></button>
    <button class="icon-btn" aria-label="Add to Your Library"><svg class="icon icon--lg" aria-hidden="true"><use href="#i-add-circle"/></svg></button>
    <button class="icon-btn" aria-label="Download"><svg class="icon icon--lg" aria-hidden="true"><use href="#i-download"/></svg></button>
    <button class="icon-btn" aria-label="More options for Late Night Drive"><svg class="icon icon--lg" aria-hidden="true"><use href="#i-more"/></svg></button>
    <div class="actions__right">
      <button class="icon-btn" aria-label="Search in playlist"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-search"/></svg></button>
      <div class="inline-filter"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-search"/></svg><input type="text" placeholder="Search in playlist" aria-label="Search in playlist"></div>  <!-- add .is-open to expand to 200px -->
      <button class="view-toggle" aria-label="View as: List">List <svg class="icon icon--sm" aria-hidden="true"><use href="#i-chevron-down"/></svg></button>
    </div>
  </div>
  …track table…
</section>
```
Variants:
- Artist: `hero hero--artist`, round cover, type line
  `<span class="hero__type"><svg class="icon badge-verified" aria-hidden="true"><use href="#i-verified"/></svg>Verified Artist</span>`,
  meta replaced by `<span class="hero__listeners">12,345,678 monthly listeners</span>`;
  action bar: a `<button class="pill">Follow</button>` / `Following` replaces the save circle.
- Album meta: `<img class="cover cover--24" …><a href="#">Artist</a><span>•</span><span>2025</span><span>•</span><span>12 songs,</span><span>47 min 12 sec</span>`.
- Liked Songs: `hero hero--liked` (sets `--hero-color: var(--liked-hero)`), heart cover, meta `<b>You</b> • 23 songs`.
- User playlist: `hero hero--editable`, cover gets
  `role="button" tabindex="0" aria-label="Edit details"` on `.hero__cover` and a hover hint
  `<span class="hero__cover-edit" aria-hidden="true"><svg class="icon" aria-hidden="true"><use href="#i-edit"/></svg>Edit details</span>`
  after the img; title/desc get `role="button" tabindex="0"`; type "Public Playlist".
- Genre: `<div class="hero hero--genre"><div class="hero__info"><h1 class="hero__title title-72">Pop</h1></div></div>` (no cover, flat colour).
Save state: swap `i-add-circle` → `i-check-circle` and add `.is-active` to the
icon-btn (green). Shuffle on: `.is-active`. On phone the hero stacks (150px
centred cover, 28px title, type line hidden except artists) and the big play
button moves to the right of the action bar; `.actions__right` is hidden.
Events: click on `.actions .play-btn`, the icon buttons, `.hero__cover` /
`.hero__title` / `.hero__desc` (edit dialog on user playlists), contextmenu on
`.hero__cover`.

## 9. Track table

```html
<div class="track-table" role="grid" aria-label="Late Night Drive">        <!-- modifiers: track-table--album | --popular | --songs | --queue | --compact -->
  <div class="track-table__head" role="row">
    <span class="cell cell--index">#</span><span class="cell">Title</span><span class="cell">Album</span><span class="cell cell--date">Date added</span>
    <span class="cell cell--dur"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-clock"/></svg></span>
  </div>
  <div class="track-row" role="row" data-track-id="tr_1" tabindex="0">
    <span class="track-row__index">
      <span class="track-row__num">1</span>
      <span class="equaliser" aria-hidden="true"><i></i><i></i><i></i></span>
      <button class="track-row__play" aria-label="Play"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-play"/></svg><svg class="icon icon--sm" aria-hidden="true" hidden><use href="#i-pause"/></svg></button>
    </span>
    <span class="track-row__main">
      <img class="cover track-row__cover" src="…" alt="">
      <span class="track-row__text">
        <span class="track-row__title">Glass Houses</span>
        <span class="track-row__artist"><svg class="icon icon--sm badge-e" aria-hidden="true"><use href="#i-explicit"/></svg><a href="#" data-route="artist" data-id="ar_1">The Hollow Lights</a></span>
      </span>
    </span>
    <span class="track-row__album"><a href="#" data-route="album" data-id="al_1">Glass Houses</a></span>
    <span class="track-row__date">3 days ago</span>
    <span class="track-row__end">
      <button class="track-row__like" aria-label="Add to Liked Songs"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-add-circle"/></svg></button>
      <span class="track-row__dur">3:42</span>
      <button class="track-row__more" aria-label="More options for Glass Houses"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-more"/></svg></button>
    </span>
  </div>
</div>
```
Column templates (`--row-cols`): default playlist/liked `# | title | album | date | dur`;
`track-table--album` / `--popular` / `--songs` / `--queue` = `# | title | middle | dur`
(middle cell: `<span class="track-row__plays">12,345,678</span>` on albums/popular,
`.track-row__album` on songs/queue; album pages omit `.track-row__cover`).
`track-table--compact` hides covers and artists and adds
`<span class="track-row__artist-col">Artist</span>` after `.track-row__main`
(header gets a matching `<span class="cell">Artist</span>`).
Header: sticky at 64px (z-index 4); add `.is-stuck` while stuck for the panel
background + border. Row states: `.is-current` (green title + index),
`.is-playing` (equaliser replaces the number), `.is-selected` (`--selected`
background, like/more visible), hover shows `.track-row__play` and the end
buttons; `.track-row__like.is-liked` (green check, always visible). Tablet
hides `.track-row__date` / `.cell--date`; phone hides the header, index, album,
date, duration and like and shows `.track-row__more` always (rows are
`cursor: pointer`, 60px). Below the table: `<a class="table-more" href="#">See more</a>`,
and on albums
```html
<div class="copyright"><div class="copyright__date">March 4, 2025</div><div>© 2025 Label</div><div>℗ 2025 Label</div></div>
```
Events: click / dblclick / contextmenu on `.track-row`; click on
`.track-row__play`, `.track-row__like`, `.track-row__more`, and the links.

## 10. Playlist finder, recommended, empty states

```html
<div class="playlist-finder">
  <h2 class="playlist-finder__title">Let's find something for your playlist</h2>
  <div class="finder-search"><svg class="icon" aria-hidden="true"><use href="#i-search"/></svg><input type="text" placeholder="Search for songs" aria-label="Search for songs"><button class="icon-btn" aria-label="Clear" hidden>…i-close…</button></div>
  <div class="finder-list">
    <div class="finder-row" data-track-id="tr_1">
      <img class="cover cover--40" src="…" alt="">
      <span class="finder-row__text"><span class="finder-row__title">Glass Houses</span><span class="finder-row__artist"><a href="#">The Hollow Lights</a></span></span>
      <span class="finder-row__album"><a href="#">Glass Houses</a></span>
      <button class="pill pill--outline">Add</button>
    </div>
  </div>
</div>
<!-- Recommended (non-empty user playlists): same rows under a title + .playlist-finder__sub, then: -->
<div class="finder-foot"><button class="text-btn">Refresh</button><a class="text-link" href="#">Find more</a></div>

<div class="empty">
  <svg class="icon empty__icon" aria-hidden="true"><use href="#i-heart"/></svg>
  <div class="empty__title">Songs you like will appear here</div>
  <div class="empty__text">Save songs by tapping the heart icon.</div>
  <button class="pill pill--primary">Find songs</button>
</div>
<div class="empty empty--sm"><div class="empty__title">Add to your queue</div><div class="empty__text">…</div></div>
```

## 11. Queue view and right panel

Queue view (`#main`):
```html
<h1 class="page-title">Queue</h1>
<section class="queue-section">
  <div class="queue-section__head"><h2 class="queue-section__title">Next in queue</h2><button class="pill">Clear queue</button></div>
  <div class="track-table track-table--queue">…track-rows with data-qid="…"…</div>
</section>
<section class="queue-section"><div class="queue-section__head"><h2 class="queue-section__title"><span class="muted">Next from:</span> <a href="#">Late Night Drive</a></h2></div>…</section>
```
Right panel (`#right-panel`):
```html
<div class="rp__head"><h2 class="rp__title"><a href="#">Late Night Drive</a></h2><button class="icon-btn" aria-label="Close">…i-close…</button></div>
<div class="rp__body">
  <img class="cover rp__cover" src="…" alt="">
  <div class="rp__track">
    <div class="rp__track-text"><div class="rp__track-title"><a href="#">Glass Houses</a></div><div class="rp__track-artist"><a href="#">The Hollow Lights</a></div></div>
    <button class="icon-btn" aria-label="Add to Liked Songs"><svg class="icon" aria-hidden="true"><use href="#i-add-circle"/></svg></button>
  </div>
  <div class="rp-card">
    <div class="rp-card__img"><img class="cover" src="…" alt=""><span class="rp-card__img-label">About the artist</span></div>
    <div class="rp-card__body">
      <div class="rp-card__row"><div><a class="rp-card__name" href="#">The Hollow Lights</a><div class="rp-card__sub">4,210,331 monthly listeners</div></div><button class="pill">Follow</button></div>
      <p class="rp-card__bio">…bio, clamped to 3 lines…</p>
    </div>
  </div>
  <div class="rp-card">
    <div class="rp-card__head"><span class="rp-card__name">Next in queue</span><a class="text-link" href="#">Open queue</a></div>
    …one .song-row…
  </div>
</div>
```
Queue mode: the same `.rp__head`, then `.rp__body` holding `.queue-section`s
of `.song-row`s (compact). `#right-panel` is `display:flex; flex-direction:column`.

## 12. Context menu (`#context-menu`), dialog (`#dialog-root`), toast, tooltip (`#toast-root`)

```html
<!-- #context-menu already has class="context-menu" role="menu"; set style.left/top in viewport px and remove `hidden` -->
<div class="menu-list">
  <button class="menu-item" role="menuitem" aria-haspopup="true"><svg class="icon icon--sm menu-item__icon" aria-hidden="true"><use href="#i-plus"/></svg><span class="menu-item__label">Add to playlist</span><svg class="icon icon--sm menu-item__chev" aria-hidden="true"><use href="#i-chevron-right"/></svg></button>
  <button class="menu-item" role="menuitem"><svg class="icon icon--sm menu-item__icon" aria-hidden="true"><use href="#i-queue"/></svg><span class="menu-item__label">Add to queue</span></button>
  <div class="menu-sep" role="separator"></div>
  <button class="menu-item" role="menuitem" disabled><span class="menu-item__label">Go to album</span></button>
  <button class="menu-item menu-item--danger" role="menuitem"><span class="menu-item__label">Delete</span></button>
</div>
```
Submenu: a second element `<div class="context-menu context-menu--sub" role="menu">`
(append it to `#context-menu`'s parent, i.e. `document.body`, positioned fixed
beside the parent item; mark the parent item `.is-open`). Optional first
children: `<div class="menu-head">View as</div>` (eyebrow header),
`<div class="menu-search"><svg class="icon icon--sm" …i-search…></svg><input type="text" placeholder="Find a playlist" aria-label="Find a playlist"></div>`.
A checked item appends `<svg class="icon icon--sm menu-item__check" …i-check…>`.
Keyboard focus: add `.is-focused` to the active item (same look as hover).

Dialog:
```html
<div class="dialog-backdrop">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
    <button class="icon-btn dialog__close" aria-label="Close">…i-close…</button>      <!-- only with closeButton: true -->
    <h2 class="dialog__title" id="dlg-title">Delete from Your Library?</h2>
    <div class="dialog__body">This will delete <b>Rooftop Nights</b> from Your Library.</div>
    <div class="dialog__actions"><button class="text-btn">Cancel</button><button class="pill pill--primary">Delete</button></div>
  </div>
</div>
```
Edit details body:
```html
<div class="edit-details">
  <div class="edit-details__cover"><img class="cover" src="…mosaic…" alt=""></div>
  <div class="edit-details__fields">
    <label class="field"><span class="field__label">Name</span><input class="field__input" type="text" value="Rooftop Nights" placeholder="Add a name"></label>
    <label class="field"><span class="field__label">Description</span><textarea class="field__input" placeholder="Add an optional description"></textarea></label>
  </div>
</div>
```
Toast + tooltip (both live inside `#toast-root`, which is already `.toast-root`,
fixed bottom-centre with the SPEC §8.7 offsets):
```html
<div class="toast">Added to Liked Songs <a class="toast__action" href="#">Undo</a></div>   <!-- add .is-leaving before removing -->
<div class="tooltip" aria-hidden="true" style="left:…px;top:…px">Enable shuffle</div>    <!-- add .is-visible to show -->
```

## 13. Sliders (player.js / player.css)

```html
<input type="range" class="slider slider--progress" min="0" max="1000" step="1" value="0" aria-label="Seek">
<input type="range" class="slider slider--volume" min="0" max="100" step="1" value="70" aria-label="Volume">
```
JS sets `input.style.setProperty('--fill', pct + '%')` on every change. 4px
track (white fill, green on hover/focus/active), 12px thumb on hover/focus;
`slider--thumb` keeps the thumb always visible (expanded player);
`slider--volume` is 93px wide. `disabled` dims it.

## 14. Player bar (`#player-bar`, player.js)

```html
<div class="pb-left">
  <div class="pb-cover"><img class="cover" src="…" alt=""><button class="pb-cover__expand" aria-label="Expand"><svg class="icon" aria-hidden="true"><use href="#i-expand"/></svg></button></div>
  <div class="pb-text"><div class="pb-title"><a href="#">Glass Houses</a></div><div class="pb-artist"><a href="#">The Hollow Lights</a>, <a href="#">Vesper Ray</a></div></div>
  <button class="icon-btn" aria-label="Add to Liked Songs"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-add-circle"/></svg></button>   <!-- liked: i-check-circle + .is-active -->
</div>
<div class="pb-center">
  <div class="pb-controls">
    <button class="icon-btn icon-btn--dot" aria-label="Enable shuffle"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-shuffle"/></svg></button>
    <button class="icon-btn" aria-label="Previous"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-prev"/></svg></button>
    <button class="play-btn play-btn--white" aria-label="Play"><svg class="icon" aria-hidden="true"><use href="#i-play"/></svg><svg class="icon" aria-hidden="true" hidden><use href="#i-pause"/></svg></button>
    <button class="icon-btn" aria-label="Next"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-next"/></svg></button>
    <button class="icon-btn icon-btn--dot" aria-label="Enable repeat"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-repeat"/></svg></button>
  </div>
  <div class="pb-progress"><span class="pb-time">0:00</span><input type="range" class="slider slider--progress" …><span class="pb-time pb-time--total">3:42</span></div>
</div>
<div class="pb-right">
  <button class="icon-btn icon-btn--dot" aria-label="Now playing view"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-now-playing"/></svg></button>
  <button class="icon-btn icon-btn--dot" aria-label="Queue"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-queue"/></svg></button>
  <div class="pb-volume"><button class="icon-btn" aria-label="Mute"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-volume-high"/></svg></button><input type="range" class="slider slider--volume" …></div>
</div>
```
`#player-bar` is already `.player-bar` (grid 30% / 40% / 30%). Add `.is-empty`
to `#player-bar` when nothing is loaded (hides the left column; disable the
buttons yourself). Mode buttons: `.is-active` on the `.icon-btn--dot`.

## 15. Phone: bottom nav, mini player, expanded player

```html
<!-- #bottom-nav -->
<a class="bottom-nav__item is-active" href="#" data-route="home"><svg class="icon" aria-hidden="true"><use href="#i-home-filled"/></svg>Home</a>
<a class="bottom-nav__item" href="#" data-route="search"><svg class="icon" aria-hidden="true"><use href="#i-search"/></svg>Search</a>
<a class="bottom-nav__item" href="#" data-route="library"><svg class="icon" aria-hidden="true"><use href="#i-library"/></svg>Your Library</a>

<!-- #mini-player: set style="--mini-color:#14224a" (darkened album colour); add `hidden` when nothing is loaded -->
<div class="mini-player__inner">
  <img class="cover cover--40" src="…" alt="">
  <div class="mini-player__text">
    <div class="marquee mini-player__title"><span class="marquee__inner"><span>Glass Houses</span></span></div>   <!-- add .is-scrolling and duplicate the inner <span> when it overflows -->
    <div class="mini-player__artist">The Hollow Lights</div>
  </div>
  <button class="icon-btn" aria-label="Add to Liked Songs"><svg class="icon" aria-hidden="true"><use href="#i-add-circle"/></svg></button>
  <button class="icon-btn" aria-label="Play">…both icons…</button>
</div>
<div class="mini-player__progress" aria-hidden="true"><i style="--fill:38%"></i></div>

<!-- #expanded-player: set style="--xp-color:#1e3264"; remove `hidden` to open (phone only; display:none at >= 768px) -->
<div class="xp__top"><button class="icon-btn" aria-label="Close">…i-chevron-down…</button><div class="xp__context"><span class="eyebrow">Playing from playlist</span><span class="xp__context-name">Late Night Drive</span></div><button class="icon-btn" aria-label="More options">…i-more…</button></div>
<div class="xp__cover"><img class="cover" src="…" alt=""></div>            <!-- .is-slide-left / .is-slide-right for the 200ms skip transition -->
<div class="xp__title-row"><div class="xp__text"><div class="xp__title">Glass Houses</div><div class="xp__artist"><a href="#">The Hollow Lights</a></div></div><button class="icon-btn" aria-label="Add to Liked Songs">…</button></div>
<div class="xp__progress"><input type="range" class="slider slider--progress slider--thumb" …><div class="xp__times"><span>1:24</span><span>-2:18</span></div></div>
<div class="xp__controls"><button class="icon-btn" aria-label="Enable shuffle">…</button><button class="icon-btn" aria-label="Previous">…</button><button class="play-btn play-btn--white play-btn--xl" aria-label="Play">…both icons…</button><button class="icon-btn" aria-label="Next">…</button><button class="icon-btn" aria-label="Enable repeat">…</button></div>
<div class="xp__bottom"><button class="icon-btn" aria-label="Queue">…i-queue…</button></div>
```
Grid placement, panel chrome and per-breakpoint hiding of all `#app` children
come from styles.css §3; the inner layout above is a default that player.css
may restyle.

## 16. Z-index scale

sticky strip 5, table header 4, resizer 10, mini player / bottom nav 20,
expanded player 30, dialog backdrop 40, context menu 50 (submenu 51), toast 60,
tooltip 70.
