# Wavelength — a Spotify-style music player clone. Build spec and module contract

This document is the contract between every agent working on the project. Read it fully before touching a file.

## 0. Ground rules for every agent

- Project root: this `wavelength/` folder. Run every command from it.
- Source lives in `src/`. `node build.js` (run in the project root) writes `dist/index.html` (the publishable fragment) and `dist/local.html` (the same page wrapped in a standalone skeleton for local testing). Never hand-edit `dist/`.
- Vanilla HTML, CSS and JavaScript only. No frameworks, no bundler, no npm packages, no external scripts. The only external resource is the Google Fonts stylesheet already in `src/index.html`. ES2020 syntax is fine. No ES modules (`import`/`export`): each JS file attaches only the globals listed for it in section 3 to `window` (one each, except app.js which defines both `App` and `Library`).
- Each agent edits ONLY the files it owns (listed in its task). Every other file is read-only for that agent. If the contract does not give you something you need, solve it inside your own files and report the gap in your final message. Do not rename or change the signature of anything in this contract; you may ADD extra methods and events.
- Never call `alert()`, `confirm()`, `prompt()`, `window.print()`, or `window.open()`. Dialogs and confirmations are built into the page.
- Every `localStorage` read and write is wrapped in try/catch; the app must work normally when storage is unavailable or empty.
- Everything is fictional: no real artist names, song titles, album titles, label names or lyrics. The word "Spotify" never appears in any source file, comment or UI text. The app's own name is "Wavelength". Its logo is a simple four-bar equaliser mark (not three curved lines, not a green circle).
- Node 22 is installed. Use `node --check src/<file>.js` for syntax checks and plain Node scripts for unit tests. Python is NOT installed. Windows command lines are limited in length: write files with heredocs in small pieces or with a file-writing tool, never as one giant inline command.
- The published page is wrapped by the host in a `<!doctype html><html><head>…</head><body>` skeleton, so `src/index.html` has NO doctype, html, head or body tags. It starts with `<title>`, then the font `<link>`, then the stylesheet `<link>`, then markup, then the `<script>` tags. The host's skeleton sets `:root { color-scheme: light; padding-top/bottom: env(safe-area-inset-*) }`, `body { margin: 0; font: 14px system-ui }`, `img { max-width: 100% }`, and `[hidden] { display: none !important }`. Toggle visibility with the `hidden` attribute, not inline `display`.
- The page runs in a sandbox: no `fetch` to other hosts, no iframes, no downloads, no `location.hash` state, and sound only after a user gesture. All data is generated in `data.js`; all audio is synthesised in `audio.js`.
- Parallel work: the shell/css agent writes `src/index.html` first. During init, each module checks the globals it calls into (`typeof window.Player === 'object'`, `typeof window.Library === 'object'`, `typeof window.App === 'object'`, etc.) and skips those calls silently when a module is absent, so the page loads with partial sources. For local testing an agent may create a throwaway stub of a missing module in its own scratch folder (outside `src/`), never in `src/`.

## 1. What we are building

A single-page, dark, desktop-and-mobile music streaming app that recreates the layout, visual language and core flows of the current Spotify desktop web player and its mobile app, under the name Wavelength:

- Three-panel desktop layout on a black page: top bar, "Your Library" left panel, main panel, optional right "Now Playing / Queue" panel, and a bottom player bar.
- Views: Home, Search (browse categories + live results), Playlist, Album, Artist, Liked Songs, Genre/category page, "Show all" section grids, Queue, and (phone) Library.
- A fully working player: play/pause, next/previous, seek, shuffle, repeat (off / context / one), queue, volume and mute, auto-advance, keyboard shortcuts, history, and document-title updates.
- Real audio: every track is procedurally synthesised with the Web Audio API from a deterministic seed, so each track sounds different, has a real duration and supports seeking.
- A personal library persisted in localStorage: liked songs, user-created playlists (create, rename, add, remove, delete), followed artists, saved albums and playlists, recently played.
- Generated artwork: every album, artist and playlist gets deterministic Canvas-drawn cover art (no external images) and a dominant colour used for hero gradients.
- Fully responsive: desktop (>= 1024px), tablet (768–1023px: sidebar collapses to an icon rail) and phone (< 768px: bottom navigation, mini player, full-screen now-playing view).

## 2. Design tokens (owned by styles.css; every file uses them)

The look is a faithful dark Spotify clone. This is a deliberately single-theme (dark only) design: `:root` sets `color-scheme: dark` and every colour is set explicitly through these tokens. `body` sets `background: var(--bg-base)` and `color: var(--fg)`.

```css
:root {
  color-scheme: dark;
  --bg-base: #000000;                /* page background seen in the gaps between panels */
  --bg-panel: #121212;               /* sidebar, main, right panel */
  --bg-elevated: #1f1f1f;            /* cards at rest, top bar controls */
  --bg-menu: #282828;                /* context menus, dropdowns, dialogs */
  --bg-highlight: #3e3e3e;           /* hovered menu rows */
  --bg-tinted: rgba(255,255,255,.07); /* hovered table rows and cards */
  --bg-tinted-strong: rgba(255,255,255,.1);
  --bg-tinted-press: rgba(255,255,255,.04);
  --fg: #ffffff;
  --fg-sub: #b3b3b3;                 /* secondary text */
  --fg-muted: #7f7f7f;               /* disabled / tertiary */
  --accent: #1ed760;                 /* play buttons, active icons, now-playing text */
  --accent-hover: #3be477;
  --accent-press: #1fdf64;
  --on-accent: #000000;
  --liked-a: #450af5;                /* Liked Songs gradient start */
  --liked-b: #c4efd9;                /* Liked Songs gradient end */
  --liked-hero: #5038a0;             /* Liked Songs page hero / action-bar colour */
  --verified: #3d91f4;               /* verified-artist badge */
  --danger: #f15e6c;
  --border: rgba(255,255,255,.1);
  --shadow-cover: 0 8px 40px rgba(0,0,0,.5);
  --radius-panel: 8px;
  --radius-card: 6px;
  --radius-pill: 500px;
  --font: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --gap: 8px;                        /* gap between panels */
  --topbar-h: 64px;
  --player-h: 80px;                  /* desktop player bar */
  --sidebar-w: 300px;                /* desktop library panel */
  --sidebar-rail-w: 72px;            /* tablet icon rail */
  --right-w: 300px;                  /* right panel */
  --bottom-nav-h: 56px;              /* phone */
  --mini-player-h: 56px;             /* phone */
  --focus-ring: 0 0 0 2px #ffffff;
}
```

Typography: Figtree (loaded from Google Fonts in index.html) with the fallback stack above. Weights: 400 body, 500 labels, 700 section titles and names, 800/900 hero titles. Hero title sizes: 96px for titles up to 15 characters, 72px up to 25, 48px up to 40, 32px beyond; on phones always 28px. Base body 14px, secondary 13px, row text 16px/14px. Use `font-variant-numeric: tabular-nums` on durations and times. Uppercase labels get `letter-spacing: .1em`.

Motion: card play buttons slide up 8px and fade in on hover; everything respects `prefers-reduced-motion: reduce` (no transitions, no equaliser animation, no marquee).

Scrollbars (styles.css, applied to every internally scrolling panel: `#sidebar`, `#main`, `#right-panel`, `#expanded-player` and the context menu): `scrollbar-width: thin; scrollbar-color: transparent transparent` and `::-webkit-scrollbar { width: 12px } ::-webkit-scrollbar-track { background: transparent } ::-webkit-scrollbar-thumb { background: transparent; border: 3px solid transparent; background-clip: content-box; border-radius: 6px }`; while the panel is hovered (`:hover`) the thumb colour and `scrollbar-color` become `rgba(255,255,255,.3) transparent`.

## 3. Files, ownership, load order

```
src/index.html    shell + SVG icon sprite + script tags            owner: shell/css agent
src/styles.css    tokens, base reset, #app grid/layout, primitives ONLY (see "CSS ownership" below)   owner: shell/css agent
src/COMPONENTS.md documents the styles.css primitives only (NOT a contract for app.js/player.js)     owner: shell/css agent
src/data.js       window.Catalog                                   owner: data agent
src/test-data.js  Node unit tests for data.js                      owner: data agent
src/audio.js      window.AudioEngine                               owner: audio agent
src/player.js     window.Player (+ player bar / mini / expanded UI) owner: player agent
src/player.css    every selector inside #player-bar, #mini-player, #expanded-player (incl. .slider)   owner: player agent
src/app.js        window.App, window.Library (routing, views, menus, dialogs, toasts, persistence) owner: app agent
src/app.css       every selector inside #topbar, #sidebar, #main, #right-panel, #bottom-nav, #context-menu, #dialog-root, #toast-root   owner: app agent
build.js, serve.js, SPEC.md                                        owner: orchestrator (read-only for agents, except the spec finaliser)
```

Load order in index.html (all plain `<script src>` tags at the end of the fragment): `data.js`, `audio.js`, `player.js`, `app.js`. `build.js` inlines `styles.css`, then `player.css`, then `app.css` into one `<style>` in that order, and inlines each script in place.

Globals and startup: `window.Catalog`, `window.AudioEngine`, `window.Player`, `window.App` and `window.Library` are all defined at script-evaluation time (`Library` is created when app.js evaluates, not inside `App.init()`). `player.js` and `audio.js` may reference `window.App`, `window.Library` and `window.Catalog` only inside function bodies, never at top level, and only after `Player.init()` has been called. `Player.on/off` and `Library.on/off` work before `init()`. `player.js` must not touch the DOM until `Player.init()` is called. `app.js` runs `App.init()` on `DOMContentLoaded` (or immediately if the document is already loaded). `App.init()` runs in this exact order:
1. `Library` reads storage (`wl:*`) and writes the first-run defaults.
2. `App` restores prefs and sets `data-view`, `data-right` and `data-sidebar` on `#app`.
3. `App` subscribes to `Player` and `Library` events and adds its `keydown` listener on `document`.
4. `Player.init()` builds its UI, restores `Library.loadPlayer()` silently (no Player events are emitted during init; `isPlaying` is false; `AudioEngine` is not touched) and reads `App.rightPanelMode()` once for its toggle-button states.
5. `App` renders the initial route `home`, reading `Player.getState()`, `Player.isCurrentTrack()` and `Player.isCurrentContext()` synchronously for highlights.

Every later render of a view also reads these synchronously; events are only used for incremental updates.

The static shell in `src/index.html` (ids are fixed; everything inside them is rendered by JS):

```html
<title>Wavelength</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800;900&display=swap">
<link rel="stylesheet" href="styles.css">
<svg class="sprite" aria-hidden="true" ...> <symbol id="i-…" viewBox="0 0 24 24">…</symbol> … </svg>
<div id="app" class="app">
  <header id="topbar" class="topbar"></header>
  <aside id="sidebar" class="sidebar"></aside>
  <main id="main" class="main" tabindex="-1"></main>
  <aside id="right-panel" class="right-panel" hidden></aside>
  <div id="resizer-left" class="resizer" aria-hidden="true"></div>
  <div id="resizer-right" class="resizer" aria-hidden="true"></div>
  <footer id="player-bar" class="player-bar"></footer>
  <div id="mini-player" class="mini-player"></div>
  <nav id="bottom-nav" class="bottom-nav" aria-label="Primary"></nav>
  <div id="expanded-player" class="expanded-player" hidden></div>
</div>
<div id="context-menu" class="context-menu" role="menu" hidden></div>
<div id="dialog-root"></div>
<div id="toast-root" class="toast-root" aria-live="polite"></div>
<script src="data.js"></script>
<script src="audio.js"></script>
<script src="player.js"></script>
<script src="app.js"></script>
```

DOM ownership: `player.js` owns everything inside `#player-bar`, `#mini-player` and `#expanded-player`. `app.js` owns everything inside `#topbar`, `#sidebar`, `#main`, `#right-panel`, `#bottom-nav`, `#context-menu`, `#dialog-root`, `#toast-root`, the pointer behaviour of `#resizer-left` / `#resizer-right` (section 10), and the `data-view` / `data-right` / `data-sidebar` attributes on `#app`.

Data attributes on `#app`: `data-view` = `route.view`; `data-right` is one of `now-playing | queue | none`; `data-sidebar` is one of `full | rail`. `App.init()` sets all three before `Player.init()`. styles.css treats a missing attribute as `none` / `full`: the default desktop grid has two columns `var(--sidebar-w) 1fr` with areas `"topbar topbar" "sidebar main" "player player"`; `#app[data-right="now-playing"]` and `#app[data-right="queue"]` switch to the three-column template of section 10; `#app[data-sidebar="rail"]` replaces `var(--sidebar-w)` with `var(--sidebar-rail-w)`. `#right-panel` keeps the `hidden` attribute whenever `data-right` is `none`. app.js sets `data-sidebar` from `prefs.sidebarCollapsed` only, never from the viewport width (the tablet rail is a media query in styles.css).

Exact tag forms: the four script tags are exactly `<script src="data.js"></script>`, `<script src="audio.js"></script>`, `<script src="player.js"></script>` and `<script src="app.js"></script>` with no other attributes, and the stylesheet link is exactly `<link rel="stylesheet" href="styles.css">`, because `build.js` matches these literal forms. The sprite element is `<svg class="sprite" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">`, hidden by styles.css with `position:absolute;width:0;height:0;overflow:hidden` (never `display:none`, which breaks `<use>` references in Safari). Icons use `<use href="#id"/>` (no `xlink`).

CSS ownership. `styles.css` contains ONLY (a) the tokens of section 2, (b) the base reset below, (c) the `#app` grid, the responsive layout and media-query hiding of section 10 including the `data-sidebar` / `data-right` column rules, the `.resizer` placement and the scrollbar rules of section 2, and (d) the primitives below. Every other selector is written by the agent that renders the markup: `app.css` styles everything inside `#topbar`, `#sidebar`, `#main`, `#right-panel`, `#bottom-nav`, `#context-menu`, `#dialog-root` and `#toast-root` (`.main-header`, `.card`, `.shelf`, `.hero`, `.actions`, `.track-table`, `.track-row`, `.lib-row`, `.quick-tile`, `.browse-card`, `.top-result`, `.playlist-finder`, `.finder-row`, `.context-menu`, `.dialog`, `.toast`, `.tooltip`, and all of their child elements and state classes); `player.css` styles everything inside `#player-bar`, `#mini-player` and `#expanded-player` (including `.slider`). `COMPONENTS.md` documents the primitives only; app.js and player.js must not depend on anything else being in styles.css. The containers themselves split the same way: styles.css gives every `#app` child its grid placement, size, panel radius/background, overflow and media-query hiding (section 10); app.css styles the inner layout of its containers plus the fixed positioning of `#context-menu`, the dialog backdrop/card inside `#dialog-root` and `#toast-root`; player.css styles the inner layout of `#player-bar` and `#mini-player` and the fixed full-screen positioning of `#expanded-player`.

Base reset (styles.css, verbatim):
```css
*,*::before,*::after{box-sizing:border-box}
html,body,#app{height:100%}
body{font-family:var(--font);background:var(--bg-base);color:var(--fg);overflow:hidden}
button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
button:disabled{cursor:default;color:var(--fg-muted)}
a{color:inherit;text-decoration:none}
ul,ol{list-style:none;margin:0;padding:0}
h1,h2,h3,h4,p{margin:0}
img{display:block}
:focus-visible{outline:none;box-shadow:var(--focus-ring)}
.sprite{position:absolute;width:0;height:0;overflow:hidden}
```
(`html` gets `box-sizing: border-box` from the first rule, so the host's safe-area padding on `:root` fits inside `height: 100%` and the page does not scroll.)

Primitives (styles.css; exact markup, usable by every file):
- Icon: `<svg class="icon" aria-hidden="true"><use href="#i-x"/></svg>` — 24×24, `fill: currentColor`, `flex: none`; `.icon--sm` 16px, `.icon--lg` 32px.
- Icon button: `<button class="icon-btn" aria-label="…">icon</button>` — 32×32, colour `--fg-sub`, hover `--fg`, `.is-active` `--accent`; `.icon-btn--dot.is-active::after` draws a 4px `--accent` dot centred under the icon.
- Green play button: `<button class="play-btn" aria-label="Play">icons</button>` — 48px `--accent` circle, `--on-accent` icon, hover `--accent-hover` and `scale(1.04)`; `.play-btn--lg` 56px, `.play-btn--xl` 64px, `.play-btn--white` 32px white circle with a black icon. Every play button contains both an `i-play` and an `i-pause` icon; the inactive one carries the `hidden` attribute, so flipping needs no re-render.
- Pill: `<button class="pill">Text</button>` — `--radius-pill`, 1px `--border`, 700 14px, padding 4px 16px; `.pill--primary` white background and black text; `.pill--sm` 12px.
- Chip: `<button class="chip" aria-pressed="true|false">Text</button>` — 32px high, `--bg-tinted-strong`; `[aria-pressed="true"]` white background and black text.
- Cover: `<img class="cover" src="data:…" alt="">` — `--radius-card`, `object-fit: cover`, `flex: none`; `.cover--round`; `.cover--40`, `.cover--48`, `.cover--56`, `.cover--64`, `.cover--92` fixed sizes.
- Equaliser: `<span class="equaliser" aria-hidden="true"><i></i><i></i><i></i></span>` — three `--accent` bars, animated; static under reduced motion.
- `<span class="eyebrow">` — 12px 700 uppercase `letter-spacing: .1em`.
- Utilities: `.truncate`, `.clamp-2`, `.clamp-3`, `.sr-only`, `.tabular`.

Stacking: sticky strips and table headers inside `#main` use `z-index` 1–5; `.resizer` 10; `#mini-player` and `#bottom-nav` 20; `#expanded-player` 30; the dialog backdrop and card 40; `#context-menu` 50; `#toast-root` 60; tooltips 70. `#context-menu`, dialogs, toasts and tooltips are `position: fixed` and positioned in viewport coordinates (`clientX`/`clientY` or `getBoundingClientRect()` of the anchor), never relative to `#main`. `#expanded-player` is `position: fixed; inset: 0`.

Icon sprite: symbols with `viewBox="0 0 24 24"`, used as `<svg class="icon" aria-hidden="true"><use href="#i-play"/></svg>`. Required symbol ids: `i-logo`, `i-home`, `i-home-filled`, `i-search`, `i-search-filled`, `i-library`, `i-library-filled`, `i-plus`, `i-play`, `i-pause`, `i-next`, `i-prev`, `i-shuffle`, `i-repeat`, `i-repeat-one`, `i-add-circle` (plus in a circle outline, "not saved"), `i-check-circle` (filled circle with check, "saved"), `i-heart`, `i-heart-filled`, `i-volume-high`, `i-volume-mid`, `i-volume-low`, `i-volume-off`, `i-queue`, `i-now-playing`, `i-more` (three dots), `i-close`, `i-chevron-left`, `i-chevron-right`, `i-chevron-down`, `i-arrow-left`, `i-clock`, `i-list`, `i-grid`, `i-speaker`, `i-check`, `i-sort`, `i-browse`, `i-pin`, `i-trash`, `i-edit`, `i-explicit` (an "E" in a rounded square), `i-expand`, `i-collapse`, `i-download`, `i-share`, `i-verified` (a scalloped badge with a check). Icons are simple geometric paths in the style of Spotify's icon set, 24px grid, `fill="currentColor"`.

## 4. data.js — `window.Catalog`

`data.js` must also load in Node (`require('./src/data.js')`): attach to `globalThis` when `window` is undefined, and guard every use of `document` / `canvas` (return `''` for images when there is no DOM).

### 4.1 Entities

```js
Genre    { id:'ge_pop', name:'Pop', color:'#e13300', description:'...', styleKey:'pop' }
Artist   { id:'ar_x', name, genreIds:[...], bio (2–3 sentences), monthlyListeners (number), followers (number), verified:true|false, imageSeed (int), color:'#hex' }
Album    { id:'al_x', title, artistId, year (2015–2026), releaseDate:'YYYY-MM-DD', type:'album'|'single'|'ep', trackIds:[...], coverSeed (int), color:'#hex' (dominant colour used for hero gradients), label:'<fictional label>' }
Track    { id:'tr_x', title, albumId, artistId, featuringIds:[artistId...] (usually empty), durationMs (130000–280000), explicit:bool, plays (number, 10k–900M), popularity (0–100), genreId, trackNumber (1-based), audioSeed (int), styleKey }
Playlist { id:'pl_x', name, description, owner:'Wavelength', kind:'editorial'|'mix'|'chart', trackIds:[...] (20–50), addedAt:['YYYY-MM-DD', ...] (parallel to trackIds), coverSeed (int), color:'#hex', genreId?, saves (number, 50,000–40,000,000) }
```

Every `color` on every entity is a 6-digit lowercase `#rrggbb` string (JS darkens it for gradients and tints).

Catalog size: 16 genre/browse entries; 18 artists (2–3 albums each, mixed album/EP/single types); about 36 albums with 300–360 tracks total; 15 playlists: four "Daily Mix 1–4" (kind 'mix', each built around 1–2 genres), a "Fresh Finds" and a "New Releases" list (kind 'editorial'), eight mood/activity lists (Chill Vibes, Deep Focus, Late Night Drive, Morning Coffee, Workout Pulse, Rainy Day Jazz, Indie Gold, Electronic Essentials), and "Top 50 Global" (kind 'chart'). Playlist descriptions read like real editorial copy ("Chill beats, lo-fi vibes, new tracks every week…").

Playlist ids and names are fixed (app.js relies on them, never on name matching): `pl_dailymix1` "Daily Mix 1", `pl_dailymix2` "Daily Mix 2", `pl_dailymix3` "Daily Mix 3", `pl_dailymix4` "Daily Mix 4", `pl_freshfinds` "Fresh Finds", `pl_newreleases` "New Releases", `pl_chillvibes` "Chill Vibes", `pl_deepfocus` "Deep Focus", `pl_latenightdrive` "Late Night Drive", `pl_morningcoffee` "Morning Coffee", `pl_workoutpulse` "Workout Pulse", `pl_rainydayjazz` "Rainy Day Jazz", `pl_indiegold` "Indie Gold", `pl_electronicessentials` "Electronic Essentials", `pl_top50global` "Top 50 Global". The eight mood/activity lists (`pl_chillvibes` … `pl_electronicessentials`) are "the mood playlists" wherever this document says so.

Genres (ids `ge_<styleKey>`): pop, hiphop, rock, indie, electronic, lofi, jazz, classical, ambient, rnb, folk, latin, funk, metal; plus two non-genre browse categories: `ge_newreleases` (name 'New Releases', styleKey null) and `ge_charts` (name 'Charts', styleKey null). Every entry has a distinct saturated colour for its browse card (a good pool: #e13300, #1e3264, #8d67ab, #e8115b, #148a08, #ba5d07, #dc148c, #006450, #8c1932, #f037a5, #0d73ec, #d84000, #27856a, #503750, #777777, #e91429).

Fictional names must feel real: artist names like "Marlow Vane", "The Hollow Lights", "Nia Solace", "Kestrel & Finch", "DJ Orrery", "Ivy Marchetti", "Saint Lumen", "Oriel Quartet", "Tomas Reyes", "Lune Noire", "Harbor Street", "Vesper Ray", "Cass Ridley", "Amara Oyelaran", "Ghost Parade", "Delta Vale", "Juniper Hale", "Rook Mendoza" (use these or equally plausible ones). Song titles are short and varied ("Glass Houses", "Midnight Tram", "Static Bloom", "Rooftop, 3am"). About 1 in 8 tracks is explicit. Popularity and plays correlate loosely.

### 4.2 API

```js
Catalog.genres, Catalog.artists, Catalog.albums, Catalog.tracks, Catalog.playlists   // arrays
Catalog.get(id)                 // any entity by id, or undefined
Catalog.track(id) / album(id) / artist(id) / playlist(id) / genre(id)
Catalog.tracksOf(albumId)       // Track[] in trackNumber order
Catalog.albumsOf(artistId)      // Album[] newest first (albums first, then singles/EPs)
Catalog.discography(artistId)   // { albums:[], singles:[] } newest first
Catalog.topTracks(artistId, n=10)      // by popularity
Catalog.relatedArtists(artistId, n=8)  // shared genres first
Catalog.genreContent(genreId)   // { playlists:[], albums:[], tracks:[] (top 20 by popularity), artists:[] } — also defined for the two non-genre categories, see below
Catalog.popularAlbums(n)        // by summed plays
Catalog.popularArtists(n)       // by monthlyListeners
Catalog.newReleases(n)          // by releaseDate desc
Catalog.search(query)           // { tracks:[], artists:[], albums:[], playlists:[], top: {type:'track'|'artist'|'album'|'playlist', item} | null }
                                // ranking: exact name > startsWith > word-startsWith > includes; tracks also match artist and album names; case-insensitive and diacritic-insensitive; max 20 per type
Catalog.cover(entity)           // data: URL (PNG) of 300x300 generated art for an Album | Playlist | Artist | Track (returns its album's cover) | {kind:'liked'}; cached per entity; '' when no DOM
Catalog.artistImage(artist)     // alias of cover(artist): a portrait-like abstract composition (used in circles)
Catalog.playlistMosaic(trackIds) // data: URL — 2x2 mosaic of the first four distinct album covers (for user playlists); with fewer than 4 albums, the first cover full-size; with none, a flat --bg-menu square with a music-note glyph
Catalog.formatDuration(ms)      // '3:05' ; with hours when >= 1h: '1:02:33'
Catalog.formatTotal(ms)         // 'about 2 hr 14 min' when >= 1h, else '47 min 12 sec'
Catalog.formatPlays(n)          // '12,345,678' with thousands separators
Catalog.formatCount(n)          // '1.2M' / '340K' / '2,340'
Catalog.formatDate(iso)         // 'Mar 4, 2025'
Catalog.formatLongDate(iso)     // 'March 4, 2025'
Catalog.relativeDate(iso, now)  // '3 days ago' / '2 weeks ago' / 'Mar 4, 2025' when older than 4 weeks; `now` optional ISO for tests
Catalog.seededRandom(seed)      // returns a function () => [0,1) ; deterministic (mulberry32 or similar)
Catalog.pluralize(n, word)      // '1 song' / '12 songs'
```

Non-genre browse categories: `genreContent('ge_newreleases')` returns `{ playlists: [playlist('pl_newreleases'), playlist('pl_freshfinds')], albums: newReleases(12), tracks: the 20 most popular tracks of those albums, artists: the artists of those albums }`; `genreContent('ge_charts')` returns `{ playlists: [playlist('pl_top50global')], albums: popularAlbums(12), tracks: the top 20 tracks by plays, artists: popularArtists(8) }`.

### 4.3 Cover art

Deterministic from `coverSeed` / `imageSeed` and `color`. Draw on an offscreen `<canvas>` 300x300, export `toDataURL('image/png')`, cache. Styles chosen by seed: duotone gradient with large soft circles; diagonal bands; concentric rings; blurred colour fields with grain (noise drawn with low alpha); a grid of squares with one highlighted; a single large typographic initial. Editorial playlist covers overlay the playlist name in a bold sans (`bold 34px 'Figtree', Arial, sans-serif`) on a solid or two-tone background, the way editorial covers do. Artist images are warmer compositions: an off-centre radial "spotlight" with a dark vignette. The Liked Songs cover is a diagonal gradient from `#450af5` to `#c4efd9` with a white heart shape centred. Every cover must look good at 48px and at 232px. Covers must not depend on the font having loaded (text is an overlay, never the only content).

### 4.4 Tests (`src/test-data.js`, run with `node src/test-data.js`, exit code 1 on failure)

Assert: unique ids; every reference resolves both ways (album.trackIds ⇄ track.albumId, track.artistId exists, playlist trackIds exist, artist genreIds exist); counts within spec; durations within range; `search('a')` returns results in each type; `search('')` returns empty arrays and null top; formatters produce the exact strings above for sample inputs; `cover()` returns `''` in Node without throwing; `seededRandom(42)()` is stable across two calls to `seededRandom(42)`; the word "Spotify" does not appear in the file.

## 5. audio.js — `window.AudioEngine`

A deterministic generative music engine. One global, one AudioContext created lazily (inside `init()`, which `Player` calls from a user gesture). Never auto-create on load.

```js
AudioEngine.init()                 // creates the AudioContext (once), master chain, analyser; resumes if suspended; returns the context
AudioEngine.load(track)            // track: Catalog Track. Builds the Song for this track (deterministic from track.audioSeed, track.styleKey, track.durationMs). Stops any current song. position = 0. state 'paused'. Safe to call before init(): it builds the Song, sets `duration` and state 'paused' without an AudioContext (see the semantics below).
AudioEngine.play()                 // starts/resumes the scheduler from `position`. Creates/resumes the context itself when init() has not run. state 'playing'. Returns a Promise<boolean> that never rejects (see below).
AudioEngine.pause()                // stops scheduling, stops already-scheduled nodes, keeps position. state 'paused'
AudioEngine.seek(seconds)          // clamps to [0, duration]; if playing, continues seamlessly from the new position
AudioEngine.stop()                 // pause + position 0, state 'idle'
AudioEngine.currentTime            // getter, seconds (float), accurate while playing (ctx.currentTime - startedAt + offset)
AudioEngine.duration               // getter, seconds (track.durationMs / 1000), 0 when nothing is loaded
AudioEngine.state                  // 'idle' | 'paused' | 'playing'
AudioEngine.track                  // the loaded track or null
AudioEngine.song                   // getter: the Song for the loaded track or null: { styleKey, bpm, key (0-11), mode ('major'|'minor'|'dorian'|'mixolydian'), progression: number[] (scale degrees), instruments: string[] (e.g. ['kick','snare','hat','bass','epiano','lead','vinyl']), sections: [{ name, startBar, bars }] }. Available right after load(), before init().
AudioEngine.setVolume(v)           // 0..1 on the master gain, perceptual curve (v*v); remembered across loads and before init
AudioEngine.analyser               // AnalyserNode (fftSize 256) for optional visualisers; null before init
AudioEngine.activeNodeCount()      // number of currently tracked source nodes (for leak tests)
AudioEngine.on(event, fn) / off(event, fn)   // 'timeupdate' (~every 250ms while playing, arg: currentTime), 'ended' (once, when currentTime >= duration), 'statechange' (arg: state), 'loaded' (arg: track)
```

Design:
- Lookahead scheduler: `setInterval` 25ms, schedule 120ms ahead, 16th-note steps. `stepDuration = 60 / bpm / 4`. On `seek`, cancel and stop all scheduled sources (keep a Set of active nodes and stop them), then continue from `floor(position / stepDuration)`.
- `Song` is derived purely from the seed: bpm by style (lofi 70–85, hiphop 80–100, rnb 85–105, jazz 100–140 with swing, pop 100–125, indie/rock 110–150, electronic 120–132, funk 100–115, latin 95–120, folk 90–120, classical 60–90, ambient 60–75, metal 140–170), key (12), mode (major / minor / dorian / mixolydian; minor-leaning for lofi, ambient, metal), one of about 12 chord progressions (I–V–vi–IV, vi–IV–I–V, ii–V–I–vi, I–vi–IV–V, i–VII–VI–VII, i–iv–v–i, and so on), a 2-bar melodic motif with seeded variations, a drum pattern per style, a bass pattern per style.
- Arrangement by section across the full duration: intro (pads/keys only, 4 bars), verse, chorus (full, melody an octave up or doubled, busier hats), verse, chorus, bridge (sparser, a new chord colour), final chorus, outro (fades over the last 6 seconds via a scheduled gain ramp, never a hard cut). Section boundaries are computed from the total bar count so every track has a start, a middle and an end.
- Instruments (all synthesised, each through its own GainNode into the master chain):
  - Drums: kick (sine with exponential pitch drop 150→45Hz, 0.3s), snare (noise burst through a bandpass + 180Hz tone, 0.18s), closed hat (highpassed noise 6kHz, 0.05s), open hat (0.25s), clap (3 short noise bursts, for pop/rnb/hiphop), rim/shaker for latin. Drum level per style; lofi drums go through a lowpass at 3kHz with slight timing swing; electronic uses four-on-the-floor; jazz uses ride plus swung hats and a brushy snare; classical and ambient use no drums (classical may use a soft pizzicato pulse instead).
  - Bass: triangle+saw blend with a lowpass envelope; root/fifth patterns, walking bass for jazz, offbeat for latin/funk, sustained for ambient.
  - Chords/pads: 3–4 voice chords from detuned saws (electronic, pop) or triangle+sine "e-piano" (lofi, rnb, jazz) or plucked short filtered noise + sine (folk, latin) or slow-attack pads (ambient, classical string substitute). A gentle lowpass sweep over each section.
  - Lead melody: sine/triangle with vibrato for pop/rnb; square-ish for electronic; soft "flute" for folk; piano-like (sine + decaying 2nd/3rd harmonics) for classical and lofi. Melody follows the motif and lands on chord tones on strong beats.
  - Style colour: lofi adds a looped vinyl-crackle noise bed (filtered noise, low level) and slight detune; ambient adds a long reverb via a ConvolverNode with a generated noise impulse (2.5s decay); metal uses distorted (WaveShaper) saw power chords and double-kick; funk uses a wah (bandpass sweep) on the chord stabs.
- Master chain: instruments → style EQ (BiquadFilter) → DynamicsCompressor (threshold -12, ratio 4) → masterGain (volume) → fadeGain (for outro and pause clicks) → analyser → destination. Pause ramps fadeGain to 0 over 30ms before stopping nodes to avoid clicks; play ramps back up.
- Memory: every scheduled source node is tracked and removed from the Set on `ended`; `load()` disconnects the previous song's per-instrument nodes. Nothing leaks across 50 track changes.
- `timeupdate` is emitted from the scheduler tick (not rAF). `ended` fires exactly once per playback reaching the end; after it, state is 'idle' and position = duration.
- Tracks must sound distinct from one another and recognisably different per style. Keep levels sane: master peak around -6 dBFS; no clipping.

Semantics before `init()` and around the ends (binding for audio.js and player.js):
- `play()` creates/resumes the context itself when `init()` has not run (it is always called from a user gesture), so callers need not call `init()` first. `load(track)` before `init()` stores the track, builds the Song, sets `duration` to `track.durationMs / 1000` and state to `'paused'`. `seek(s)` after `load()` but before `init()` stores the clamped position and the first `play()` starts there; `seek()` with no track is a no-op. `pause()` and `stop()` with no track are no-ops.
- `play()` when `state === 'idle'` (after `stop()` or `ended`) restarts from position 0. `play()` never rejects: when the context cannot be resumed it resolves `false` and the state stays `'paused'`; otherwise it resolves `true`. Player still attaches a `.catch` to every `play()` promise.
- `load()` emits only `loaded` (never `statechange`); the state becomes `'paused'` silently. `ended` is emitted before `statechange('idle')`; Player handles `ended` synchronously by calling `next()` (or the repeat-track replay) before emitting anything, and emits its own `statechange` only when its `isPlaying` actually flips.
- `pause()`, `stop()` and `seek()` remove the nodes they stop from the tracked Set synchronously, so `activeNodeCount()` is 0 immediately after `stop()`.

## 6. player.js — `window.Player`

Playback state machine + the player bar UI (desktop), the mini player (phone) and the expanded full-screen now-playing view (phone). Logic and UI may live in the same file but logic must not depend on the DOM.

### 6.1 State

```js
{
  currentTrackId: string|null,
  context: { uri: string, name: string, trackIds: string[] } | null,   // uri: 'playlist:pl_x' | 'album:al_x' | 'artist:ar_x' | 'liked' | 'user:plu_x' | 'genre:ge_x' | 'search' | 'track:tr_x'
  index: number,            // position in the (shuffled or ordered) play order
  order: string[],          // current play order of context.trackIds (shuffled when shuffle is on; shuffle keeps the current track first)
  queue: [{ qid: string, trackId: string }],   // manual "Next in queue", played before the context continues
  history: string[],        // previously played track ids (max 50)
  isPlaying: boolean,
  position: number,         // seconds
  duration: number,
  volume: number,           // 0..1 (default 0.7)
  muted: boolean,
  shuffle: boolean,
  repeat: 'off'|'context'|'track',
}
```

Context per surface (every surface passes the same `trackIds` for the same uri, so `isCurrentContext()` highlights agree): cards, quick tiles and library rows pass the entity uri (`playlist:pl_x`, `user:plu_x`, `album:al_x`, `artist:ar_x`, `liked`) with the entity's full track list (for artists: `Catalog.topTracks(id, 10)`); rows in a playlist/album/liked/genre page pass that page's uri and full list with `startTrackId`; artist page rows pass `artist:ar_x` with `Catalog.topTracks(id, 10)`; genre pages pass `genre:ge_x` with `genreContent(id).tracks`; search song rows and the top-result song pass `{ uri: 'search', name: 'Search', trackIds: the listed result tracks }`; `track:tr_x` is used only by Player itself when a single track plays with no list (a queue item started while `context` is null). There is no `section:` context: section grids only contain cards, which pass their entity uri.

### 6.2 API

```js
Player.init()                                    // builds the UI inside #player-bar, #mini-player, #expanded-player; binds its keyboard shortcuts (section 9); restores persisted state silently via Library.loadPlayer() (paused, no events emitted, no AudioContext)
Player.playContext({ uri, name, trackIds, startIndex = 0, startTrackId })   // replaces the context, keeps the manual queue, starts playing. startTrackId wins over startIndex when given. Empty trackIds: does nothing.
Player.playTrack(trackId)                        // plays the track with its album as the context: { uri: 'album:' + albumId, name: album.title, trackIds: Catalog.tracksOf(albumId).map(t => t.id), startTrackId: trackId }
Player.toggleContext({ uri, name, trackIds })    // if uri is the current context: toggle play/pause; otherwise playContext (used by card and hero play buttons)
Player.play() / pause() / togglePlay()
Player.next()                                    // manual queue first; then order[index+1]; at the end: repeat 'context' wraps, otherwise stops on the last track (position 0, paused)
Player.previous()                                // if position > 3s: seek(0); else the previous track in order (or from history when at index 0)
Player.seek(seconds) / seekRatio(0..1)
Player.setVolume(v) / toggleMute()               // mute remembers the last non-zero volume
Player.toggleShuffle()                           // reshuffles the remaining order; the current track stays current
Player.cycleRepeat()                             // off -> context -> track -> off
Player.addToQueue(trackIdOrIds)                  // appends; the caller shows the toast
Player.playNext(trackId)                         // inserts at the front of the queue
Player.removeFromQueue(qid) / clearQueue()
Player.playQueueItem(qid)                        // jumps to that queue item (removing the ones before it)
Player.upcoming(n = 50)                          // [{ qid|null, trackId, source:'queue'|'context' }] what will play next, in order
Player.getState()                                // snapshot (copy)
Player.currentTrack()                            // Catalog Track or null
Player.isCurrentContext(uri)                     // boolean
Player.isCurrentTrack(trackId)                   // boolean
Player.on(event, fn) / off(event, fn)            // 'trackchange' (track|null), 'statechange' (isPlaying), 'timeupdate' (position, duration), 'queuechange', 'modechange' ({shuffle, repeat}), 'volumechange' ({volume, muted}), 'contextchange' (context)
Player.openExpanded() / closeExpanded()          // phone full-screen view
```

Behaviour details:
- `Player.play()` does, in order: `AudioEngine.init()`; `load(track)` if `AudioEngine.track` is null or its id differs from `currentTrackId`; `setVolume(muted ? 0 : volume)`; `seek(position)` when a load just happened and `position > 0`; `play()` (with a `.catch`). Until `AudioEngine.track` is the current track, Player is the source of truth: `position` comes from the restored state, `duration` from `Catalog.track(currentTrackId).durationMs / 1000`, `Player.seek()` only updates `position` and emits `timeupdate`, and the UI draws from `Player.getState()`.
- Track end: `AudioEngine.on('ended')` → if repeat === 'track' replay the same track (seek 0 + play); else `next()`. `next()` and `previous()` always start playback of the new track (they are user gestures or follow `ended`). On the last track with repeat 'off', `next()` calls `AudioEngine.stop()`, keeps the current track, sets position 0 and `isPlaying` false, and emits `statechange` and `timeupdate`.
- When the current track changes: emit 'trackchange', push the previous one to history; set `navigator.mediaSession` metadata and action handlers (play, pause, previoustrack, nexttrack, seekto) when the API exists, inside try/catch. `document.title` is `"<Title> • <Artist>"` while `isPlaying` and `"Wavelength"` otherwise (paused, stopped or nothing loaded). Only player.js writes `document.title`.
- Recents: `Player.playContext()` calls `Library.addRecent(uri)` when the uri starts with `playlist:`, `user:`, `album:`, `artist:` or equals `liked`. app.js never calls `addRecent`.
- Queue and shuffle edge cases: when shuffle is on and neither `startTrackId` nor `startIndex` is passed, the first track is random; `order` is always `[start, ...shuffled rest]`. When a manual queue item starts it is removed from `queue`, `currentTrackId` becomes its track, `index` is unchanged, and the following `next()` continues at `order[index + 1]`. `previous()` from a queue item goes to history (never back into the queue). `upcoming()` wraps around the context only when repeat is 'context'.
- Persist through `Library.savePlayer(state)` on every trackchange, modechange, volumechange, queuechange and every 5s of timeupdate (`savePlayer` never emits a Library change). Stored shape: `{ version: 1, currentTrackId, context, index, order, queue, position, volume, muted, shuffle, repeat }`. On `init()`, restore everything paused and silently (no events; do not create an AudioContext until the user presses play; the first `play()` after a restore loads the track and seeks to the stored position). Player ignores a blob whose `version` is not 1, drops every id in `currentTrackId`, `order`, `queue` and `context.trackIds` that `Catalog.track()` does not resolve, clears `context` and `currentTrackId` when the current track was dropped, and always restores with `isPlaying` false.
- The like button in the player bar calls `Library.toggleLike(trackId)` (which returns the new state) and shows the fixed toast of section 8.7 via `App.toast(...)`; it listens to `Library.on('change')` (type `like`) to stay in sync.

### 6.3 Player bar UI (desktop and tablet, `#player-bar`)

Three columns (grid `30% 40% 30%`, `min-width: 0` everywhere):
- Left: 56px cover with 4px radius that shows, at its top-right on hover, a 24px `--bg-elevated` round expand button (`i-expand`, aria-label "Expand") which opens the Now Playing panel via `App.setRightPanel('now-playing')`; title 14px white (click → album; hover underline); artist names 11px `--fg-sub` (hover white underline, each clickable → artist); then the add/check circle button (`i-add-circle` → `i-check-circle` in accent when liked). Title and artist truncate with an ellipsis.
- Centre: a row of controls: shuffle (accent plus a small dot under it when on), previous, play/pause (32px white circle, black icon, scales 1.04 on hover), next, repeat (accent plus dot when on; `i-repeat-one` when 'track'). Below: the progress row: elapsed time (tabular, `--fg-sub`), an `<input type="range" class="slider slider--progress">` (track 4px, fill white, accent on hover, 12px thumb shown on hover/focus), total duration. Max width 722px, centred.
- Right: now-playing-view toggle (`i-now-playing`, an `.icon-btn--dot`: accent plus a 4px dot under the icon when the right panel shows Now Playing), queue toggle (`i-queue`, `.icon-btn--dot`: accent plus dot when the right panel shows the queue), volume icon button (mutes; icon changes with level: off / low < .33 / mid < .66 / high), a volume `<input type="range" class="slider slider--volume">` 93px wide, and an expand button that is optional (may be omitted). The two toggles call `App.setRightPanel(mode)` and set their `.is-active` class from the App `rightpanel` event and from `App.rightPanelMode()` once at init.
- When nothing is loaded the bar shows an empty left column and disabled controls.
- Sliders are rendered by player.js and styled by player.css only. Markup: `<input type="range" class="slider slider--progress" min="0" max="1000" step="1" value="0" aria-label="Seek">` and `<input type="range" class="slider slider--volume" min="0" max="100" step="1" aria-label="Volume">`. player.js sets `input.style.setProperty('--fill', pct + '%')` on every value change; player.css uses `appearance: none` and draws the track with `background: linear-gradient(to right, var(--fg) var(--fill, 0%), var(--bg-tinted-strong) 0)` (`--accent` instead of `--fg` on hover/focus), 4px high, with a 12px white thumb visible only on hover/focus. While the pointer is down on the progress slider, `timeupdate` does not move the thumb; the elapsed label previews the dragged time on `input` and the seek is applied on `change`.
- Tooltip labels (shown by the app.js tooltip of section 8.7 from `aria-label`): 'Enable shuffle' / 'Disable shuffle', 'Previous', 'Play' / 'Pause', 'Next', 'Enable repeat' / 'Enable repeat one' / 'Disable repeat', 'Mute' / 'Unmute', 'Now playing view', 'Queue', 'Add to Liked Songs' / 'Remove from Liked Songs'.

### 6.4 Phone UI

- `#mini-player` (visible < 768px, sits above `#bottom-nav`): rounded 8px bar coloured with the current album's `color` (darkened), 40px cover (4px radius), title 14px/700 and artist 12px `--fg-sub` stacked (a title wider than its cell scrolls as a marquee: duplicate the text and animate `translateX`, paused under `prefers-reduced-motion`), the add/check circle (`i-add-circle` → `i-check-circle` in accent, 24px; never a heart), play/pause (white icon, 24px). A 2px progress line along the bottom. Tapping the bar (not its buttons) opens `#expanded-player`. Hidden when nothing is loaded. Touch: a horizontal swipe of ≥ 60px on the bar calls `Player.next()` (swipe left) / `Player.previous()` (swipe right); a swipe up or a tap opens `#expanded-player`.
- `#expanded-player`: full-screen overlay (`position: fixed; inset: 0`) with a gradient from the album colour to `--bg-panel`; top row: chevron-down (close) button, context name centred (eyebrow + name), more button (opens the track menu from `App.trackMenuItems`); large square cover (max 88vw); title + artist (left aligned; tapping the artist name navigates to the artist and closes the view) with the add/check circle at the right; progress slider (4px, white fill, 12px thumb always visible) with the elapsed time at the left and the remaining time as `-m:ss` at the right (12px `--fg-sub`, tabular); controls row (shuffle, prev, a 64px white circle play/pause with a 32px black icon, next, repeat); bottom row: a queue button (navigates to the Queue view, which closes the overlay). Escape or the chevron closes it. Eyebrow by uri prefix: `playlist:`, `user:` and `liked` → "PLAYING FROM PLAYLIST"; `album:` → "PLAYING FROM ALBUM"; `artist:` → "PLAYING FROM ARTIST"; `genre:` → "PLAYING FROM GENRE"; `search` and `track:` → "PLAYING FROM SEARCH". The name line is `context.name`; the queue view's "Next from:" label uses the same `context.name`. Touch: a horizontal swipe of ≥ 60px on the cover calls next/previous with a 200ms slide transition; a downward swipe of ≥ 80px or the chevron closes it.
- Navigation closes the overlay: `App.navigate()`, `App.back()` and `App.forward()` call `Player.closeExpanded()` before rendering, so every "Go to …" item and the queue button close it without player.js having to know the route.

## 7. app.js — `window.App` and `window.Library`

### 7.1 Library (persistence + personal collection)

Storage key prefix `wl:`. One JSON blob per concern: `wl:liked`, `wl:playlists`, `wl:follows`, `wl:albums`, `wl:savedPlaylists`, `wl:recents`, `wl:recentSearches`, `wl:player`, `wl:prefs`, `wl:version` (= 1). All reads/writes in try/catch. `window.Library` exists at script-evaluation time; it reads storage in step 1 of `App.init()` (section 3).

```js
Library.isLiked(trackId) / toggleLike(trackId) / likedTrackIds()          // newest first; likedAddedAt(trackId) -> ISO date string
Library.playlists()                                                        // [{ id:'plu_x', name, description, trackIds, addedAt:{trackId: iso}, createdAt }]
Library.playlist(id)
Library.createPlaylist(name?)                                              // default name 'My Playlist #N'; returns the playlist
Library.renamePlaylist(id, name) / describePlaylist(id, text) / deletePlaylist(id)
Library.addToPlaylist(id, trackId, { force = false })                      // returns false (and does nothing) when the track is already present and force is false
Library.removeFromPlaylist(id, trackId) / moveInPlaylist(id, from, to)
Library.isFollowing(artistId) / toggleFollow(artistId) / followedArtistIds()
Library.isSavedAlbum(albumId) / toggleSaveAlbum(albumId) / savedAlbumIds()
Library.isSavedPlaylist(playlistId) / toggleSavePlaylist(playlistId) / savedPlaylistIds()   // editorial playlists can be saved to the library; four are saved on first run (pl_dailymix1, pl_chillvibes, pl_deepfocus, pl_top50global) so the library is not empty
Library.addRecent(contextUri) / recents()                                  // most recent first, max 12 context uris (playlist/album/artist/liked/user); called ONLY by Player.playContext (section 6.2); App skips entries that no longer resolve (deleted user playlists)
Library.recentSearches() / addRecentSearch({ type, id }) / removeRecentSearch({ type, id }) / clearRecentSearches()   // [{ type:'track'|'artist'|'album'|'playlist', id }] newest first, max 8, de-duplicated; stored under wl:recentSearches; written by app.js when a search result is opened or played
Library.savePlayer(obj) / loadPlayer()                                     // savePlayer stores obj unchanged as JSON under wl:player and never emits 'change'; loadPlayer returns the parsed object, or null when nothing is stored or parsing fails. Library never interprets or validates it (Player does, section 6.2)
Library.prefs() / setPref(key, value)                                      // keys: sidebarFilter ('playlists'|'artists'|'albums'|null), sidebarSort ('recents'|'added'|'alpha'|'creator'), rightPanel ('now-playing'|'queue'|null), sidebarCollapsed (bool), sidebarWidth (px), rightWidth (px)
Library.on('change', fn) / off                                             // fired after a mutation with { type, id }; type is one of 'like' | 'playlist' | 'follow' | 'album' | 'savedPlaylist' | 'recent' | 'recentSearch' | 'pref'
```

All `toggle*` methods return the new boolean state (`true` = now liked / followed / saved). `savePlayer()` never emits. `setPref()` emits `pref`, which `App.rerender()` ignores. `recent` only refreshes `#sidebar` and the Home shelves; `recentSearch` only refreshes the search view when it is the current route. Every other type triggers `App.rerender()`.

First-run defaults: no liked songs, no user playlists, the four saved editorial playlists above (`pl_dailymix1`, `pl_chillvibes`, `pl_deepfocus`, `pl_top50global`) in the library.

### 7.2 App

```js
App.init()
App.navigate(route, { replace = false } = {})   // route: { view, id?, query? } — section grids are { view:'section', id:'made-for-you' | ... }, search is { view:'search', query }; pushes onto an in-app history stack (never location.hash); updates back/forward button states; calls Player.closeExpanded() and emits 'route' before rendering
App.back() / App.forward()                       // same closeExpanded + 'route' behaviour
App.currentRoute()
App.toast(message, { action?: { label, onClick } } = {})   // bottom-centre above the player bar (offset in 8.7), auto-hides after 3s; only the newest toast is shown; copy is fixed in 8.7
App.openContextMenu(items, { x, y } | { anchor: Element })   // items: [{ label, icon?, onClick, disabled?, submenu?: items, danger?, separatorAfter? }]; icon is a sprite symbol id string such as 'i-plus'; onClick(item, event) is called and the menu closes afterwards unless the item has a submenu or disabled is true; Escape / click-outside closes; arrow keys navigate; a submenu opens on hover or click to the side
App.closeContextMenu()
App.openDialog({ title, body (string|Node), actions:[{ label, primary?, onClick }], closeButton? })   // modal with backdrop, Escape closes, focus trapped; a string body is rendered as text (never HTML); the dialog closes after any action onClick and on Escape / backdrop click; closeButton: true adds an × (i-close) at the top-right
App.closeDialog()
App.setRightPanel('now-playing' | 'queue' | null)   // toggles when called with the current mode; sets data-right, the hidden attribute of #right-panel and prefs.rightPanel; emits 'rightpanel'
App.rightPanelMode()                             // 'now-playing' | 'queue' | null
App.rerender()                                   // re-renders #main, #sidebar and #right-panel for the current route, preserving #main.scrollTop, the selected row and any open inline filter input
App.trackMenuItems(trackId, { playlistId? })     // the standard track menu items (so player.js can reuse them)
App.on(event, fn) / App.off(event, fn)           // 'rightpanel' (arg: mode | null; emitted after every change made by setRightPanel, NOT during prefs restore — Player reads rightPanelMode() at init instead), 'route' (arg: route; emitted after every navigate/back/forward, before rendering)
```

Routes: `home`, `search` (+ `query`), `playlist` (id = pl_x or plu_x), `album`, `artist`, `liked`, `genre`, `section` (id = 'made-for-you' | 'recent' | 'popular-albums' | 'popular-artists' | 'new-releases' | 'jump-back-in' | 'discover'), `queue`, `library` (phone only; on wider screens it redirects to home).

Rendering: template strings or DOM building, a `render(route)` dispatcher, delegated event handling on `#main`. Preserve `#main` scroll position per history entry when going back.

Library changes: `App.rerender()` runs on every `Library` change except `pref` (ignored), `recent` (refreshes only `#sidebar` and the Home shelves) and `recentSearch` (refreshes only the search view). `rerender()` keeps `#main.scrollTop`, the selected row and any open inline filter input.

Player changes (no full re-render): elements representing a track carry `data-track-id`; elements representing a playable context (cards, quick tiles, `.lib-row`, the hero/action-bar play button, the sticky-strip play button, `.top-result`) carry `data-context-uri`. On Player `trackchange`, `statechange` and `contextchange`, App sets on every such element in `#main`, `#sidebar` and `#right-panel` the class `is-current` when its track/context is the current one and `is-playing` when additionally `isPlaying`. Every play button contains both an `i-play` and an `i-pause` icon and shows one of them via the `hidden` attribute, so flipping needs no re-render. app.css styles: `.track-row.is-current .track-title { color: var(--accent) }`; `.track-row.is-playing` shows the `.equaliser` in the index cell; `.card.is-playing`, `.quick-tile.is-playing`, `.top-result.is-playing` and the hero / sticky-strip play buttons show `i-pause` (and keep the card button visible); `.lib-row.is-current .name { color: var(--accent) }` and `.lib-row.is-playing` shows the `i-speaker` icon. The queue route and the right panel (both modes) re-render on Player `trackchange`, `queuechange` and `contextchange`; the hero shuffle button and the player-bar mode icons update on `modechange`.

## 8. Screens (desktop behaviour; see section 10 for phone)

### 8.1 Top bar (`#topbar`, 64px, black)
Left: the logo mark button (→ home). Centre: a Home icon button (filled icon when on home; 48px round, `--bg-elevated`), then the search field: a pill, 474px max, `--bg-elevated`, search icon at the left, placeholder "What do you want to play?", a vertical divider and a Browse icon button at the right end (→ search view with no query). Typing navigates to `search` with the query (debounced 150ms, replacing the history entry while typing); clearing shows Browse. Pressing `/` or Ctrl+K anywhere outside inputs focuses it; Escape clears and blurs. When the field holds text an `i-close` clear button appears at its right (before the divider); hover lightens the field to `--bg-highlight` with a 1px `--fg-muted` border; focus shows a 2px white inset outline. Right: a 48px `--bg-elevated` round avatar button containing a 32px coloured disc with the initial "N" (hover scale 1.04); clicking opens a small menu (Account, Settings, Log out) whose items only show the toast "Not available in this demo". Back/forward chevron buttons live at the top-left of `#main` in the sticky header strip `.main-header` (section 8.5): 32px dark translucent circles, disabled state in `--fg-muted`.

### 8.2 Library panel (`#sidebar`)
Header row: `i-library` + "Your Library" (bold; clicking it toggles the collapsed rail on desktop) and a `+` button (menu: "Create a new playlist" → `Library.createPlaylist()` then navigate to it). Filter chips row: "Playlists", "Artists", "Albums" (one active at a time; when one is active an × chip appears before it to clear). Then a row with a search icon button (expands into an inline filter input) and a sort button "Recents ▾" (menu: Recents, Recently added, Alphabetical, Creator). List rows (`.lib-row`): 48px cover (round for artists; Liked Songs uses the gradient cover), name (16px, accent when its context is current), subtitle "Playlist • Wavelength" / "Playlist • You" for user playlists / "Artist" / "Album • Artist". A pinned "Liked Songs" row comes first with a pin icon (`i-pin` in `--accent`) in its subtitle ("Playlist • 23 songs"); it is the only row with a song count. A green `i-speaker` at the right of the row whose context is currently playing (`.is-playing`, section 7.2). Row states: hover `--bg-tinted`; the row of the currently open route (`.is-active`) has `background: var(--bg-tinted-strong)` and a white name; hovering a row shows a dark overlay on its cover with a white 24px play (or pause) icon that calls `Player.toggleContext` for that entity. Every `.lib-row` carries `data-context-uri`, `title="<name>"` and an `aria-label`. Right-click a row or its `i-more` → menu (editorial playlists / albums / artists: Add to queue, Remove from Your Library, Share ▸; user playlists: Add to queue, Edit details, Delete (confirm dialog), Share ▸). Empty filter results show the "Couldn't find …" copy. There is no footer (the library is in its logged-in form).

Rail mode: the sidebar markup is identical in full and rail mode. Rail mode is CSS only: `#app[data-sidebar="rail"] #sidebar` (desktop, from `prefs.sidebarCollapsed`) and the tablet media query hide the header text, chips, filter/sort row, names and subtitles, leaving the library icon, the `+` button and the 48px covers centred in a 72px column (names via `title`). app.js never sets `data-sidebar` from the viewport width.

### 8.3 Home
`#main` has a gradient header: the top 300px fades from a tint into `--bg-panel`; the tint is `var(--home-tint, var(--bg-elevated))` with `transition: background 1s`. The sticky top strip (`.main-header`, section 8.5) holds the back/forward buttons; nothing extra appears on Home, the strip only turns opaque as the view scrolls. Content padding 24px. There is no greeting heading.
- Filter chips: "All", "Music", "Podcasts" (Podcasts shows the toast "Podcasts aren't available in this demo" and stays on All). The quick picks grid starts 16px below the chips.
- Quick picks: 2 rows × 4 horizontal tiles (`.quick-tile`): 48px tall (56px on phone), 48px cover flush left with 4px radius, name 16px/700 with 1-line ellipsis, `--bg-tinted-strong` background, hover `rgba(255,255,255,.2)`, hover reveals a 48px green play button at the right; built from Liked Songs + recents + saved playlists, padded with editorial playlists to 8. Hovering a tile sets the CSS variable `--home-tint` on `#main` to the item's `color` (Liked Songs: `--liked-hero`); leaving the grid removes it, returning the header to the default tint.
- Shelves (`.shelf`): a header with the title (24px bold, hover underline, navigates to the section) and a "Show all" link at the right. Cards in a grid (`repeat(auto-fill, minmax(180px, 1fr))`) limited to one row (hide the items beyond the first row). Order: "Made For You" (`pl_dailymix1`–`pl_dailymix4`, `pl_freshfinds`, `pl_newreleases`), "Recently played" (recents; hidden when empty), "Jump back in" (saved playlists + popular albums), "Popular albums", "Popular artists" (round covers), "Discover picks for you" (the eight mood playlists of section 4.1).
- Card (`.card`): padding 12px, radius 6px, hover `--bg-tinted`; a cover with 6px radius (round for artists) and a shadow; 16px bold title (1 line ellipsis), 14px `--fg-sub` subtitle (2-line clamp); the 48px green play button (black `i-play`) appears at the cover's bottom-right on hover/focus (slides up), shows `i-pause` when that context is playing; clicking the play button plays the context, clicking anywhere else navigates. Subtitles: editorial/mix/chart playlists → the description (2-line clamp); user playlists → "By You"; albums in Home and genre shelves → the artist name; albums in "More by", "Discography" and search → `${year} • Album` / `${year} • Single` / `${year} • EP`; artists → "Artist". Right-clicking a `.card`, a `.quick-tile` or the hero cover opens the entity menu (the same items as that entity's hero `i-more` menu) at the pointer position via `App.openContextMenu`.

### 8.4 Search
No query: above "Browse all", when non-empty, a "Recent searches" shelf: cards for the last 8 results the user opened or played from search (`Library.recentSearches()`, `{ type, id }`, newest first; app.js calls `Library.addRecentSearch` when a result card, row or top result is clicked or played), each with an `i-close` button at its top-right on hover that calls `Library.removeRecentSearch`, and a "Clear recent searches" outlined pill at the end of the row (`Library.clearRecentSearches`). Clicking a card navigates like any card. Then the "Browse all" heading and a grid of category cards (`.browse-card`): square, flat genre colour, 24px bold name at the top-left, a 100×100 cover (the genre's first playlist or album cover) rotated 25° overflowing the bottom-right corner. Clicking → `genre` route (including `ge_newreleases` and `ge_charts`, which use the `genreContent` results of section 4.2).
With a query: filter chips (All, Songs, Artists, Albums, Playlists). "All" layout: two columns at the top: the "Top result" card (`.top-result`: `--bg-elevated`, 92px cover (round for artists), 32px bold name, a type pill "Artist" / "Song" / "Album" / "Playlist" (a song shows its artist name before the pill), a big play button at the bottom-right on hover) and "Songs" (the top 4 tracks as compact rows with cover, title, artist, duration, hover play). Then shelves: Artists, Albums, Playlists. Empty: "No results found for '…'" + "Please make sure your words are spelled correctly, or use fewer or different keywords." The individual chips show the full lists (tracks use the standard track table).

### 8.5 Playlist / Album / Artist / Liked Songs / Genre
Hero (`.hero`): a gradient from the entity colour (top) through its 50% darker version into the panel, 340px tall on desktop; cover 232px with a shadow (round for artists; genre pages have a flat colour hero with the name only); eyebrow ("Playlist" / "Album" / "Single" / "EP" / "Public Playlist" for user playlists / "Verified Artist" with a 24px `i-verified` badge in `var(--verified)` with a white check for verified artists); title (sizes from section 2; `font-weight: 900; letter-spacing: -.04em; line-height: 1`, letter-spacing `-.02em` at 48px and below; clamped to 3 lines); the description line (`--fg-sub`); a meta line (14px; owner/artist names bold and white, the rest `--fg-sub`): for editorial/mix/chart playlists `[24px round avatar] Wavelength • 1,234,567 saves • 50 songs, about 2 hr 50 min` (`saves` formatted with `formatPlays`, the total with `formatTotal`; a comma, not a bullet, between the song count and the duration); for user playlists `[avatar] You • 12 songs, 45 min 2 sec`; for albums `[artist avatar] Artist (link) • 2025 • 12 songs, 47 min 12 sec`; for artists "12,345,678 monthly listeners". A user playlist's colour is the `color` of its first track's album, or `#282828` (the value of `--bg-menu`) when empty; its cover is `Catalog.playlistMosaic(trackIds)`. Liked Songs uses `--liked-hero` as its entity colour for the hero gradient and the action-bar band (its cover stays the `--liked-a` → `--liked-b` gradient with the heart). The hero cover and the hero `i-more` button open the entity menu on right-click / click (section 8.3).

Edit details (user playlists only): clicking the cover, the title or the description, and the "Edit details" item in the hero `i-more` menu and in the sidebar row menu, open `App.openDialog` titled "Edit details" with `closeButton: true`: a 180px mosaic cover at the left; at the right a text input labelled "Name" (value = current name, placeholder "Add a name", floating-label style) above a textarea labelled "Description" (placeholder "Add an optional description"); a white "Save" pill at the bottom-right. Enter in the Name field saves; an empty name keeps the previous name; saving calls `Library.renamePlaylist` and `Library.describePlaylist`. There is no inline editing anywhere in the app.

Sticky strip (`.main-header`, 64px, `position: sticky; top: 0`, z-index 5, rendered by app.js at the top of `#main` on every route; holds the back/forward buttons): transparent while the hero is in view. As `#main` scrolls, cross-fade its background over the first 300px of scroll to the page tint: the entity colour darkened 30% on playlist/album/artist/liked/genre pages, `--bg-panel` on home/search/section/queue/library. Once `.hero h1` has left the viewport (IntersectionObserver with `#main` as root), the strip shows, after the arrows, a 48px green play/pause button for the page context (same behaviour as the hero button; carries `data-context-uri`) and the page title in 24px/700, both fading and sliding up 8px in; they disappear when the title scrolls back into view. The `.track-table` header sticks at `top: 64px` (z-index 4) and, when stuck, gets `background: var(--bg-panel)` and `border-bottom: 1px solid var(--border)`.
Action bar (`.actions`, 24px padding, below the hero on a translucent band continuing the gradient). Order: play, shuffle, save/follow, download, `i-more`: the 56px green play button (toggles pause when this context is playing; aria-label "Play <name>" / "Pause <name>"; carries `data-context-uri`), a shuffle icon button (toggles Player shuffle, accent when on; shown on playlists, albums, Liked Songs and artists, immediately after the play button), a save button (albums and editorial playlists: `i-add-circle` / `i-check-circle` in accent, aria-label "Add to Your Library" / "Remove from Your Library"; on artist pages a "Follow" / "Following" pill replaces the save circle), a download icon (toast "Downloads aren't available in this demo"), `i-more` (aria-label "More options for <name>"; menu: Add to queue, Add to Your Library / Remove from Your Library, Add to playlist ▸, Go to artist (albums only, right after Add to playlist ▸), Edit details (user playlists), Delete playlist (user playlists, with the confirm dialog of 8.7), Share ▸). Share ▸ is a submenu wherever it appears: "Copy link to <playlist|album|artist|song>" copies the fictional `https://wavelength.example/<type>/<id>` when the clipboard API exists and shows "Link copied to clipboard"; "Embed <type>" shows "Not available in this demo". Right side (playlists, user playlists and Liked Songs): a search icon button that expands into an inline filter input (placeholder "Search in playlist" / "Search in Liked Songs", `--bg-tinted-strong`, 200px, Escape collapses) filtering rows by title, artist or album as the user types; then the "List ▾" view toggle (menu header "View as", items Compact / List with a check on the active one; Compact hides covers and shows the artist in its own column).
Track table (`.track-table`): a sticky header (`#`, `Title`, `Album`, `Date added`, clock icon) that sticks below the `.main-header` strip (see above); the Album column is absent on album pages, Date added only on playlists and liked; artist pages show "Popular" with 5 rows (+ a "See more" / "Show less" link to 10) with play counts instead of the album. Rows (`.track-row`, each carrying `data-track-id`): grid `[16px index] [cover 40px + title/artist 6fr] [album 4fr] [date 3fr] [duration 120px]`; album pages use the grid `[16px index] [title + artist 6fr] [plays 4fr] [duration 120px]` where the plays column shows `Catalog.formatPlays(track.plays)` in `--fg-sub` 14px and its header cell is empty; artist "Popular" rows use that same grid with the 40px cover in the title cell. The index turns into a play icon on hover. Row states: the current track (`.is-current`) has an accent title; while playing (`.is-playing`) its index cell shows the animated equaliser (`.equaliser`, 3 bars), while paused it shows the number; hovering the current row shows `i-pause` (playing) or `i-play` (paused) in the index cell and clicking it toggles; the selected row (`.is-selected`) has `background: rgba(255,255,255,.3)`. The last cell is a flex row `[add/check 16px] [duration, 4ch, right-aligned, tabular] [i-more 16px]` with 16px gaps: the add/check circle to the left of the time and `i-more` to the right of it; both are `visibility: hidden` until the row is hovered, focus-within or selected, except that the check-circle of a liked track is always visible (in `--accent`). At >= 768px: double-click plays from that row in the context; single click selects. On phone (< 768px): a single tap on a `.track-row` anywhere outside its `i-more` button plays it in the page context via `Player.playContext({ ..., startTrackId })`; there is no selected state and no double-click handling; rows get `touch-action: manipulation`. The width breakpoint of section 10 decides (no pointer media query). Right-click or `i-more` opens the track menu: Add to playlist ▸ (a "Find a playlist" text field at the top filtering the list, then "New playlist" with `i-plus`, a separator, then the user playlists newest first; "New playlist" creates a playlist named after the track title, adds the track, shows "Added to <name>" and navigates to it), Save to your Liked Songs / Remove from your Liked Songs, Add to queue, Remove from this playlist (user playlists only), Go to artist, Go to album, Share ▸. Explicit tracks show the `i-explicit` badge before the artist name. Albums: a copyright footer: a release date line ("March 4, 2025") and "© 2025 <label>" / "℗ 2025 <label>" in 11px `--fg-sub`. Below albums: a "More by <Artist>" shelf. Below artists: a "Discography" shelf (chips: Popular releases / Albums / Singles and EPs), a "Fans also like" shelf (round cards), and an "About" card with the artist image, monthly listeners and bio. Liked Songs: the gradient hero with the heart cover, eyebrow "Playlist", title "Liked Songs", meta "You • N songs"; empty state: "Songs you like will appear here" + "Save songs by tapping the heart icon." + a "Find songs" button → search.

User playlist with 0 tracks: instead of the track table render `.playlist-finder`: heading "Let's find something for your playlist" (24px/700), a search input (pill, `--bg-menu`, search icon at the left, placeholder "Search for songs", × clears) that runs `Catalog.search` live (150ms debounce) and lists up to 10 matching tracks as `.finder-row`s: 40px cover, title + artist, album name, and an outlined "Add" pill (border 1px `--fg-muted`, hover white border) at the right that calls `Library.addToPlaylist(id, trackId)` and shows the toast "Added to <playlist name>"; added rows disappear from the results. User playlist with tracks: below the table, a "Recommended" section (title 24px/700, subtitle "Based on what's in this playlist" in `--fg-sub`) listing 10 tracks of the playlist's dominant genres (the most frequent `genreId`s among its tracks) that are not yet in it, each as a `.finder-row` with the same "Add" pill, plus a "Refresh" text button that picks another 10 and a "Find more" link that reveals the finder search field.
Genre page: a flat colour hero with the genre name; shelves "Popular playlists", "Popular albums", "Popular artists", then a track table "Top songs" (context `genre:ge_x`). The same page renders `ge_newreleases` and `ge_charts` from their `genreContent` results (section 4.2).

### 8.6 Queue view (route `queue`) and the right panel
Queue view: title "Queue"; "Now playing" (one row with the equaliser), "Next in queue" (manual items as `.track-row`s with index numbers continuing from 1; hovering a row shows `i-more`, whose menu is the track menu plus "Remove from queue" as the first item (toast "Removed from queue"); the header has a "Clear queue" outlined pill button), "Next from: <context name>" (the context name is a link to the context; upcoming context tracks, up to 50). Empty: "Add to your queue" copy. The queue view and both right-panel modes re-render on Player `trackchange`, `queuechange` and `contextchange`.
Right panel (`#right-panel`): a header with the context name (bold, link) and a close ×. Mode 'now-playing': a large cover, title/artist (+ like button), an "About the artist" card (artist image at the top, "About the artist" label, name, monthly listeners, a Follow button, bio clamped to 3 lines), then a "Next in queue" card showing the next track with an "Open queue" link. Mode 'queue': the same queue list as the queue view, compact. Toggled from the player bar buttons; the panel stays open across navigation; the mode is persisted in prefs.

### 8.7 Dialogs, menus, toasts
Context menu: `--bg-menu`, 4px padding, radius 4px, items 40px high with a 12px gap to the icon, hover `--bg-highlight`, danger items in `--danger`; submenus open to the right (flip left near the edge); the menu never overflows the viewport. An item's `onClick(item, event)` runs and the menu closes afterwards unless the item has a submenu or is disabled.

Dialog: a centred `--bg-menu` card, 24px padding, radius 8px, 24px/700 title, 16px `--fg-sub` body, actions right-aligned: the primary action as a white pill button with black text, secondary as text; closes after any action `onClick`, on Escape and on backdrop click; `closeButton: true` adds an × at the top-right. Fixed copy — Already added: title "Already added", body `This is already in your '<playlist name>' playlist.`, actions "Don't add" (secondary) and "Add anyway" (primary, calls `addToPlaylist(..., { force: true })`). Delete playlist: title "Delete from Your Library?", body `This will delete <name> from Your Library.`, actions "Cancel" (secondary) and "Delete" (primary). Edit details: see 8.5.

Toast: a white (`--fg`) box, `border-radius: 8px`, padding 12px 16px, 14px/700 `--bg-panel` text, shadow `0 4px 12px rgba(0,0,0,.4)`, bottom-centre, fade/slide-up 150ms. Bottom offset: `calc(var(--player-h) + 16px)` at >= 768px; `calc(var(--bottom-nav-h) + var(--mini-player-h) + 16px + env(safe-area-inset-bottom))` on phone widths, regardless of whether the mini player is currently shown. Exact copy, used by every file (player.js and app.js alike): "Added to Liked Songs" / "Removed from Liked Songs"; "Added to queue"; "Added to <playlist name>" / "Removed from <playlist name>"; "Added to Your Library" / "Removed from Your Library"; "Link copied to clipboard"; "Removed from queue"; "Playlist deleted"; "Podcasts aren't available in this demo"; "Downloads aren't available in this demo"; "Not available in this demo". Every like/save control uses `i-add-circle` (not saved) and `i-check-circle` in `--accent` (saved); `i-heart` / `i-heart-filled` appear only on the Liked Songs cover and empty state.

Tooltip: every icon button with an `aria-label` shows it in a tooltip after 300ms of hover (`--bg-menu`, 14px/700, padding 8px, radius 4px, shadow, above the button, `pointer-events: none`, z-index 70, `position: fixed`); implemented once in app.js on `mouseover` / `focusin` of `[aria-label]` anywhere in the document (so player-bar buttons get it too) and styled in app.css as `.tooltip`, a single element kept inside `#toast-root` with `aria-hidden="true"` (so the live region never announces it). Player-bar labels are listed in 6.3; hero labels: "Play <name>" / "Pause <name>", "Add to Your Library" / "Remove from Your Library", "More options for <name>".

## 9. Keyboard shortcuts (ignored while typing in inputs)
Bindings: Space: play/pause. Shift+ArrowRight/Left: seek ±5s. Ctrl+ArrowRight/Left: next/previous. Ctrl+ArrowUp/Down: volume ±0.05. Ctrl+Shift+ArrowDown: mute; Ctrl+Shift+ArrowUp: full volume. Alt+S: shuffle. Alt+R: repeat. Alt+Shift+B: like the current track. Alt+Shift+Q: toggle the queue panel. Ctrl+K or `/`: focus search. Alt+ArrowLeft/Right: back/forward. Escape: close menus, dialogs, the expanded player. Extras, kept in addition to the bindings above (never as the only binding): bare ArrowRight/Left seek ±5s, bare ArrowUp/Down volume ±0.05, M mute, S shuffle, R repeat, L like, Q queue panel.

Ownership: player.js binds Space, ArrowLeft/ArrowRight (bare, with Shift, with Ctrl), ArrowUp/ArrowDown (bare, with Ctrl, with Ctrl+Shift), M, S, R, L, Alt+S, Alt+R, Alt+Shift+B, and Escape only to close `#expanded-player`. app.js binds `/`, Ctrl+K, Q, Alt+Shift+Q, Alt+ArrowLeft/ArrowRight, and Escape to close (in this order of priority, one target per keypress) the context menu, the dialog, the search field. Both listen for `keydown` on `document`; `App.init()` adds its listener before calling `Player.init()`, so app.js runs first. Shared guard, implemented identically in both files: return without acting when `e.defaultPrevented`, `e.isComposing`, `e.metaKey`, or `e.altKey` (except the Alt combinations listed above), when `e.target` is an input, textarea, select or contenteditable element (except Escape inside the search input, handled by app.js), or when a dialog is open (`#dialog-root` has a child element; then only app.js handles Escape). Space, the bare arrow keys and the bare letter keys act only when `document.activeElement` is null, `document.body`, `#main`, or an element that is not a button, a, input or [role=menuitem]; the modified combinations (Shift/Ctrl/Alt) act regardless of focus, outside inputs. A handler that acts calls `e.preventDefault()`, which is how the other file knows the key was consumed. Every interactive element is a real `<button>`, `<a>` or `<input>` with an accessible name (`aria-label` for icon buttons), and `:focus-visible` shows `--focus-ring`.

## 10. Responsive layout (`#app` is a CSS grid; `html, body, #app { height: 100% }`; the page never scrolls, panels scroll internally)

Breakpoints are the exact strings `(max-width: 767px)` phone, `(min-width: 768px) and (max-width: 1023px)` tablet, `(min-width: 1024px)` desktop, used verbatim in CSS and in `matchMedia()` in JS (library redirect, tap-to-play, expanded player, toast offset). `html { box-sizing: border-box }` (from the base reset) so the host's safe-area padding fits inside `height: 100%`.

Desktop (>= 1024px): grid areas
```
"topbar  topbar topbar"  var(--topbar-h)
"sidebar main   right"   1fr
"player  player player"  var(--player-h)
```
columns `var(--sidebar-w) 1fr var(--right-w)` only when `#app[data-right="now-playing"]` or `#app[data-right="queue"]`; otherwise (missing attribute or `none`) the grid is the two-column `var(--sidebar-w) 1fr` with areas `"topbar topbar" "sidebar main" "player player"` and `#right-panel` is `hidden`, so no trailing gap remains. The sidebar column is `var(--sidebar-rail-w)` under `#app[data-sidebar="rail"]`. 8px gaps, panels have `border-radius: var(--radius-panel)` and `background: var(--bg-panel)`. `#bottom-nav`, `#mini-player`, `#expanded-player` are hidden.

Resizers (desktop only): the 8px gaps left and right of `#main` are drag handles. `#resizer-left` and `#resizer-right` (static shell elements, section 3) are placed by styles.css inside the grid gaps (`#resizer-left { grid-area: sidebar; justify-self: end; width: var(--gap); margin-right: calc(-1 * var(--gap)) }`, `#resizer-right { grid-area: right; justify-self: start; width: var(--gap); margin-left: calc(-1 * var(--gap)) }`, `cursor: col-resize`, z-index 10, a 1px white line centred in the gap appears on hover; `#resizer-right` is hidden when `data-right` is `none`; both are hidden below 1024px). app.js handles their pointer events: dragging sets `--sidebar-w` (clamped 280–420px; dragging below 200px collapses to the rail by setting `prefs.sidebarCollapsed`, dragging the rail outward expands it) and `--right-w` (280–420px) as inline custom properties on `#app`, persisted in prefs as `sidebarWidth` / `rightWidth` and restored in step 2 of `App.init()`.

Tablet (768–1023px): the same, but the sidebar is the 72px icon rail (CSS only, section 8.2: same markup, covers only, names via `title`), the right panel is hidden, the resizers are hidden, hero covers are 192px, the table hides the Date added column.

Phone (< 768px): grid areas
```
"main"         1fr
"mini-player"  auto
"bottom-nav"   var(--bottom-nav-h)
```
No gaps, no panel radius, `#topbar` hidden (the search view renders a sticky header at the top of `#main`: title "Search" (24px/700) and a white 8px-radius field with `--bg-panel` text and icon, 48px tall, placeholder "What do you want to listen to?", with the same live-query behaviour and × clear button as the desktop field; Home on phone shows the avatar disc at the left of the filter chips instead), `#sidebar` hidden (the `library` route renders the library list inside `#main`), `#right-panel` hidden, `#player-bar` hidden, resizers hidden; `#bottom-nav` shows Home / Search / Your Library with filled icons for the active one on a black background; the mini player sits above it. The hero stacks: cover 150px centred, title left-aligned below; the action bar puts the big play button at the right; track rows show cover, title, artist and an always-visible `i-more` with no index/album/date/duration columns, and a single tap on a row (outside `i-more`) plays it in the page context (section 8.5; no selection on phone); shelves scroll horizontally (`overflow-x: auto`, cards 150px) instead of wrapping; browse cards 2 per row; quick picks 2 per row (56px tall). Body and html never scroll horizontally; `min-width: 0` on every grid/flex child that holds text; 16px side padding inside `#main`. Keep `env(safe-area-inset-bottom)` padding on `#bottom-nav`.

## 11. Build and test

- `node build.js` → `dist/index.html` (the fragment for publishing) and `dist/local.html` (standalone). A static server for `dist/` is already running at `http://127.0.0.1:8765/` (started with `node serve.js`; it sends no-cache headers, so just reload after a build). Test at `http://127.0.0.1:8765/local.html`. Never open `file://` URLs in the browser pane: local files render as static snapshots without scripts. If the server is down (connection refused), start it again with `node serve.js` as a background command from the project root.
- `node --check src/<file>.js` must pass for every file; `node src/test-data.js` must pass.
- The console must be clean (no errors, no uncaught promise rejections) on load, during playback, and through navigation.

## 12. Acceptance checklist (QA runs every item at 1280×800 and at 390×844)

1. Loads with no console errors; Home shows the filter chips, 8 quick picks and at least 4 shelves with covers rendered (not blank); the sidebar lists Liked Songs plus the four first-run playlists (`pl_dailymix1`, `pl_chillvibes`, `pl_deepfocus`, `pl_top50global`).
2. Clicking a card's play button starts audio: `AudioEngine.state === 'playing'`, `Player.getState().isPlaying === true`, the position advances over 2s, the player bar shows the track, title/artist are correct, document.title updates, the card shows a pause icon.
3. Pause/resume keeps the position (within 0.3s). Seeking via the progress slider moves the position and audio keeps playing. Previous after more than 3s restarts the track; previous within 3s goes to the previous track.
4. Next advances; on the last track with repeat off playback stops; repeat 'context' wraps; repeat 'track' replays; shuffle reorders the upcoming list while the current track stays.
5. Add to queue (menu) then Next plays the queued track before the context continues; the Queue view and the right panel list it; remove and clear work.
6. Like from a table row, the player bar and the hero: the add/check state syncs across all three, the Liked Songs count updates in the sidebar, the Liked Songs view lists the track with its date added; unlike removes it.
7. Create playlist → navigates to it (the empty page shows the "Let's find something for your playlist" finder), the Edit details dialog renames and re-describes it, add a track via the context menu (a toast appears), add the same track again → the "Already added" dialog with "Add anyway", remove via the menu, delete via the more menu's confirm dialog → returns home and the sidebar updates.
8. Search: typing shows results live (top result + songs + shelves), chips filter, an empty query shows Browse, a genre card opens its page, the "No results" copy appears for gibberish.
9. Navigation: back/forward buttons and Alt+arrows work, the scroll position is restored on back, clicking artist/album names in rows navigates, the hero/action-bar play button toggles pause for the current context.
10. Keyboard: Space toggles play when focus is on the body; `/` focuses search; Escape closes a menu and a dialog; M mutes and the volume icon changes.
11. Reload: the library, volume, shuffle/repeat and the last track (paused at its position) are restored; pressing play resumes from there.
12. Phone width: the bottom nav switches views, tapping a track row in a playlist starts that track, the mini player appears when a track is loaded, tapping it opens the expanded player, controls work there, the chevron closes it, no horizontal scrolling (`document.documentElement.scrollWidth <= window.innerWidth`), the hero and tables use the stacked layout, shelves scroll horizontally.
13. Tablet width: the sidebar is an icon rail, the right panel is hidden, the layout is intact.
14. Audio: three tracks from different genres sound different in tempo and timbre (verify that `AudioEngine.song.bpm` and `AudioEngine.song.instruments` differ after each `load()`); a track plays through to its end and `ended` triggers the next track without an intermediate `isPlaying: false` flicker; 30 rapid track changes raise no errors and `activeNodeCount()` is 0 immediately after `stop()`.
15. Static checks: no "Spotify" anywhere in `dist/index.html`; no `alert(`, `confirm(`, `prompt(`; `<title>` is the first tag; no doctype/html/head/body tags in `dist/index.html`; colours in CSS come from tokens (no literal colours outside `:root` except rgba overlays, gradients derived from entity colours, and canvas drawing code).

## 13. Resolutions from spec review

Each line is one change made in response to the spec review. Where two proposals conflicted, the option chosen is stated.

1. §0: added the parallel-work rule (shell writes `src/index.html` first; modules skip absent globals silently; stubs only outside `src/`).
2. §2: added tokens `--liked-hero: #5038a0` and `--verified: #3d91f4` (two proposals gave `#2e77d0` and `#3d91f4` for the badge; `#3d91f4` wins).
3. §2: added the overlay-style scrollbar rules for every internally scrolling panel.
4. §3: file table now states that styles.css holds tokens, reset, grid and primitives only; COMPONENTS.md documents primitives only and is not a contract for app.js/player.js.
5. §3: the load-order paragraph is replaced by "Globals and startup": all five globals exist at script-evaluation time, no top-level cross-references, and the exact five-step order of `App.init()` (Library storage → prefs and data attributes → subscriptions and keydown listener → silent `Player.init()` → first render reading Player state synchronously).
6. §3: the shell gains two static elements `#resizer-left` / `#resizer-right` (pointer behaviour owned by app.js, placement by styles.css).
7. §3: defined `data-view` / `data-right` (`now-playing | queue | none`) / `data-sidebar` (`full | rail`), the default two-column grid, the attribute-driven three-column and rail templates, and that `data-sidebar` never follows the viewport.
8. §3: fixed the exact literal script/link tag forms build.js matches, the sprite element markup and its non-`display:none` hiding, and `<use href>` without xlink.
9. §3: added the CSS ownership rule (styles.css = tokens, reset, grid/layout, resizer placement, scrollbars, primitives; app.css = everything inside app.js's containers; player.css = everything inside player.js's containers including `.slider`).
10. §3: added the verbatim base reset and the primitive markup list (icon, icon-btn with `--dot`, play-btn sizes with both icons present, pill, chip, cover sizes, equaliser, eyebrow, utilities).
11. §3: added the z-index scale (1–5 sticky, 10 resizer, 20 mini/bottom-nav, 30 expanded, 40 dialog, 50 menu, 60 toast, 70 tooltip) and the fixed/viewport-coordinate positioning rule.
12. §4.1: Playlist entity gains `saves`; every `color` is a 6-digit lowercase hex; the playlist count is corrected from 14 to 15 (the listed names were already 15).
13. §4.1: playlist ids and names are fixed (`pl_dailymix1` … `pl_top50global`); "the eight mood playlists" is defined.
14. §4.2: `genreContent` defined for `ge_newreleases` and `ge_charts`; `cover(track)` returns the album cover.
15. §5: added `AudioEngine.song` (bpm, key, mode, progression, instruments, sections; available after `load()`).
16. §5: `play()` self-initialises the context, never rejects (resolves boolean), restarts from 0 when idle; `load()` before `init()` stores and sets duration/paused; `seek()` before `init()` stores the position; no-track calls are no-ops.
17. §5: `load()` emits only `loaded`; `ended` precedes `statechange('idle')` and Player handles it synchronously; `pause/stop/seek` untrack nodes synchronously so `activeNodeCount()` is 0 right after `stop()`.
18. §6.1: `section:<id>` removed from the uri list (nothing produced it); added the per-surface context table (entity uri for cards/tiles/rows, page uri for page rows, `artist:` with top 10, `genre:` with genreContent tracks, `search` for search rows, `track:` only for Player-internal single plays).
19. §6.2: `Player.init()` restores silently; `playContext` with empty `trackIds` does nothing; `playTrack` builds the album context exactly as stated.
20. §6.2: exact `Player.play()` sequence (init → load if different → setVolume → seek if restored → play) and "Player is the source of truth until the engine holds the current track".
21. §6.2: `next()`/`previous()` always start playback; last track with repeat off stops via `AudioEngine.stop()` with statechange + timeupdate.
22. §6.2: `document.title` is "<Title> • <Artist>" only while `isPlaying`, "Wavelength" otherwise, written only by player.js.
23. §6.2: `Player.playContext()` is the only caller of `Library.addRecent` (for playlist/user/album/artist/liked uris).
24. §6.2: shuffle/queue edge cases (random first track when shuffled without a start, queue items removed on start with `index` unchanged, `previous()` never re-enters the queue, `upcoming()` wraps only on repeat context).
25. §6.2: persisted blob shape `{ version: 1, … }`, `savePlayer` never emits, restore drops unresolvable ids, clears context when the current track is gone, always restores paused.
26. §6.2: the player-bar like button uses the boolean returned by `toggleLike` and the fixed toast strings.
27. §6.3: left column changed to the hover "Expand" button on the cover (opens Now Playing), 14px title, 11px artists; the now-playing/queue toggles are `.icon-btn--dot`, call `App.setRightPanel`, and sync from the App `rightpanel` event plus `rightPanelMode()` at init.
28. §6.3: slider contract (exact markup, 0–1000 / 0–100 scales, `--fill` custom property set by JS, gradient track drawn by player.css, no thumb fighting while dragging, preview on `input`, seek on `change`).
29. §6.3: player-bar tooltip labels listed.
30. §6.4: mini player uses the add/check circle (never a heart), stacked 14/12px text with marquee, swipe left/right to skip and swipe-up/tap to expand.
31. §6.4: expanded player shows remaining time as `-m:ss`, a 64px white play circle, cover swipe to skip, swipe-down to close, artist tap navigates; the eyebrow-by-uri-prefix mapping is fixed and shared with the queue view.
32. §6.4: `App.navigate/back/forward` call `Player.closeExpanded()` before rendering.
33. §7.1: `Library` exists at evaluation time; added `wl:recentSearches` with `recentSearches/addRecentSearch/removeRecentSearch/clearRecentSearches`.
34. §7.1: `savePlayer(obj)` stores unchanged and never emits; `loadPlayer()` returns the parsed object or null; Library never interprets it.
35. §7.1: prefs keys named (`sidebarFilter`, `sidebarSort`, `rightPanel`, `sidebarCollapsed`, `sidebarWidth`, `rightWidth`).
36. §7.1: `change` types enumerated (`like | playlist | follow | album | savedPlaylist | recent | recentSearch | pref`) with the rerender rules per type; all `toggle*` methods return the new boolean.
37. §7.1: first-run saved playlists given by id.
38. §7.2: route shape fixed to `{ view, id?, query? }` (section grids use `id`); `navigate/back/forward` emit `route` and close the expanded player.
39. §7.2: `openContextMenu` item `icon` is a sprite id string, `onClick(item, event)`, auto-close unless submenu/disabled; `openDialog` closes after any action/Escape/backdrop, string bodies are text, optional `closeButton`.
40. §7.2: `setRightPanel` sets `data-right`, the `hidden` attribute, `prefs.rightPanel` and emits `rightpanel`; `rerender()` covers `#main`, `#sidebar`, `#right-panel` and preserves scroll/selection/filter input.
41. §7.2: added `App.on/off` with events `rightpanel` (not emitted during prefs restore) and `route`.
42. §7.2: the highlight mechanism (`data-track-id` / `data-context-uri`, `is-current` / `is-playing`, driven by trackchange/statechange/contextchange, both play icons present with `hidden`) and the app.css state styles; queue/right panel re-render on trackchange/queuechange/contextchange; modechange updates the hero shuffle button.
43. §8.1: search field clear ×, hover/focus states, Ctrl+K; avatar is a 48px `--bg-elevated` circle with a 32px disc; the strip is named `.main-header`.
44. §8.2: user-playlist subtitle "Playlist • You"; only Liked Songs shows a count and its pin is `--accent`; row states (`hover`, `.is-active`, cover play overlay via `Player.toggleContext`); rows carry `data-context-uri`, `title` and `aria-label`; row menus fixed (editorial: Add to queue / Remove from Your Library / Share ▸; user: Add to queue / Edit details / Delete / Share ▸); footer removed; rail mode is CSS only with identical markup.
45. §8.3: greeting deleted; Home gradient uses `--home-tint` set on hover of a quick tile; the strip shows nothing extra on Home; quick tiles are 48px (56px on phone) with a 48px flush cover; Made For You and Discover shelves use the fixed ids; card subtitles per entity type; right-click on cards, quick tiles and the hero cover opens the entity menu.
46. §8.4: "Recent searches" shelf (cards with hover ×, "Clear recent searches" pill) above Browse all, backed by `Library.recentSearches`; genre route also serves `ge_newreleases` / `ge_charts`.
47. §8.5 Hero: verified badge is `i-verified` in `--verified`; hero title typography (900, -.04em / -.02em, 3-line clamp); meta line formats with saves and a comma before the duration; user-playlist colour (first track's album or `#282828`) and mosaic cover; Liked Songs uses `--liked-hero`.
48. §8.5: inline editing replaced everywhere by the "Edit details" dialog (cover, title, description, hero menu and sidebar menu open it; Enter saves; empty name keeps the old one).
49. §8.5: the sticky `.main-header` strip behaviour (transparent → tint over 300px, collapsed play button + title once `.hero h1` leaves view, table header sticking at 64px with panel background and border).
50. §8.5 Action bar: order play / shuffle / save-follow / download / more; shuffle also on albums; aria-labels; Share ▸ submenu with the fictional link and "Embed"; Go to artist on albums; Edit details on user playlists; right side gains the "Search in playlist / Liked Songs" filter and the "View as" menu.
51. §8.5 Track table: album and artist "Popular" grids with the plays column; row states (`.is-current` accent title, equaliser only while playing, hover pause/play in the index cell, `.is-selected` at rgba(255,255,255,.3)); last cell `[add/check] [duration] [i-more]` with visibility rules; desktop double-click vs phone single tap decided by the 768px width breakpoint (the `pointer: fine` suggestion was not adopted); Add to playlist ▸ with the "Find a playlist" field and "New playlist" naming after the track; Share ▸ in the track menu.
52. §8.5: empty user playlists render `.playlist-finder` (live song search with "Add" pills); non-empty ones get a "Recommended" section with Refresh and Find more.
53. §8.5: genre page context is `genre:ge_x` and the page also renders the two non-genre categories.
54. §8.6: queue rows are `.track-row`s with `i-more` (first item "Remove from queue", toast "Removed from queue"), "Clear queue" outlined pill, "Next from:" name is a link; refresh on trackchange/queuechange/contextchange.
55. §8.7: menu auto-close rule; dialog typography, close rules and fixed copy for "Already added" and "Delete from Your Library?"; toast restyled as a white 8px-radius box with the fixed bottom offsets (desktop vs phone) and the complete fixed copy list (both toast proposals merged); like/save icons are add/check circles only, hearts only on the Liked Songs cover and empty state.
56. §8.7: tooltip behaviour implemented once in app.js for every `[aria-label]` icon button, with the hero labels.
57. §9: bindings replaced by the product set (Shift+arrows seek, Ctrl+arrows next/prev, Ctrl+arrows up/down volume, Ctrl+Shift+arrows mute/full, Alt+S/R, Alt+Shift+B/Q, Ctrl+K, Alt+arrows, Escape) while keeping the old bare keys as extras (acceptance item 10 still uses M); ownership per file, listener order, the shared guard (defaultPrevented, isComposing, metaKey, altKey except listed combos, inputs, open dialog), the focus rule for bare keys and the `preventDefault()` consumption signal.
58. §10: exact breakpoint strings for CSS and `matchMedia()`; `html` box-sizing note; desktop grid depends on `data-right` (no trailing gap) and `data-sidebar`; resizer placement, clamps (280–420px, collapse below 200px), prefs persistence; tablet rail is CSS only.
59. §10 Phone: sticky "Search" header with the white field and placeholder "What do you want to listen to?"; Home shows the avatar disc beside the chips; single tap on rows plays; quick tiles 56px.
60. §12: item 1 checks chips (no greeting) and the four first-run playlists by id; item 7 checks the finder and the Edit details dialog instead of inline rename; item 12 checks tap-to-play; item 14 reads `AudioEngine.song` and checks for no isPlaying flicker and `activeNodeCount() === 0` right after `stop()`.
61. §0 (consistency re-read): "exactly one global per file" corrected, since app.js defines both `App` and `Library` as section 3 always said.
62. §3 (consistency re-read): the CSS ownership rule now also says who styles the containers themselves (styles.css: grid placement/size/panel chrome/hiding; app.css: inner layout plus the fixed positioning of the menu, dialog and toast root; player.css: inner layout plus the fixed full-screen `#expanded-player`).
63. §5 and §8.7 (consistency re-read): the `load()` API comment no longer says it "just stores" the track before `init()` (it builds the Song and sets duration); the tooltip element is `aria-hidden` inside the live `#toast-root`.
