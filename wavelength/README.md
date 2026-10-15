# Wavelength

A working music streaming player modelled on the Spotify desktop and mobile apps, built with plain HTML, CSS and JavaScript. It has no dependencies and makes no network requests apart from loading the Figtree font from Google Fonts.

Open `index.html` in a browser to use it. Press any play button to start sound, because browsers block audio until the first click.

## What it does

- Three-panel desktop layout: Your Library, the main view, an optional Now Playing or Queue panel, and the player bar.
- Home, live search with genre browsing, and playlist, album, artist, Liked Songs, genre and queue views.
- A full player: play and pause, next and previous, seek, shuffle, repeat, a manual queue, volume and mute, auto-advance and keyboard shortcuts.
- A personal library kept in `localStorage` under keys starting with `wl:`. It holds liked songs, your own playlists, followed artists, saved albums and playlists, recent plays, and the player state, which is restored on reload.
- Tablet layout with a collapsed library rail. Phone layout with bottom navigation, a mini player and a full-screen player.

All artists, albums, tracks and labels are invented. Cover art is drawn on a canvas from a seed. Every track is synthesised with the Web Audio API from its seed and genre, so each one has its own tempo, key, chords, melody, drums and arrangement.

## Files

| Path | Contents |
|---|---|
| `index.html` | Standalone build. Open it directly or serve it. |
| `src/index.html` | Page shell, icon sprite and script tags. |
| `src/styles.css`, `src/player.css`, `src/app.css` | Tokens and layout, player styles, view styles. |
| `src/data.js` | `Catalog`: the generated catalogue, search, formatters and cover art. |
| `src/audio.js` | `AudioEngine`: the generative music engine. |
| `src/player.js` | `Player`: playback state machine and the player bar, mini player and full-screen player. |
| `src/app.js` | `App` and `Library`: routing, views, menus, dialogs, toasts and persistence. |
| `SPEC.md` | The full behaviour contract, including the acceptance checklist in section 12. |
| `src/COMPONENTS.md` | Markup and class reference for the shared components. |

## Build

Edit files in `src/`, then rebuild. The build inlines everything into one page.

```bash
node build.js
cp dist/local.html index.html
```

`dist/index.html` is a fragment without `<html>` and `<body>` tags, meant for hosts that supply their own skeleton. `dist/local.html` is the standalone page.

## Tests

```bash
node src/test-data.js
```

This checks the catalogue's integrity, the search and formatters, and that the data loads in Node.

`tools/regress/` holds browser tests for each acceptance item in `SPEC.md`. They drive a headless Microsoft Edge through `tools/cdp.js` and print what they observe instead of asserting. Run `node serve.js` in another terminal, record a baseline from a known-good build, and compare later runs against it:

```bash
node tools/regress/run-all.js baseline
node tools/regress/run-all.js after-change
node tools/regress/compare.js after-change
```

`tools/tour.js` takes screenshots of the main views at desktop, tablet and phone sizes:

```bash
node tools/cdp.js tools/tour.js --fresh --out=tools/shots/tour
```

The Edge lookup in `tools/cdp.js` uses Windows install paths.
