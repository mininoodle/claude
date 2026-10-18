# Wavelength

A working music streaming player modelled on the Spotify desktop and mobile apps, dressed as a monochrome terminal full of flowers. It is built with plain HTML, CSS and JavaScript, has no dependencies, and makes no network requests apart from loading two pixel fonts from Google Fonts.

Open `index.html` in a browser to use it. Press any play button to start sound, because browsers block audio until the first click.

## What it does

- Three-panel desktop layout: your library, the main view, an optional now playing or queue panel, and the `/media` player bar. Each region is a terminal window with a prompt title, a hairline rule and a `- x` pair.
- Home, live search with genre browsing, and playlist, album, artist, Liked Songs, genre and queue views.
- A full player: play and pause, next and previous, seek, shuffle, repeat, a manual queue, volume and mute, auto-advance and keyboard shortcuts.
- A personal library kept in `localStorage` under keys starting with `wl:`. It holds liked songs, your own playlists, followed artists, saved albums and playlists, recent plays, the player state and your display preferences.
- Tablet layout with a collapsed library rail. Phone layout with bottom navigation, a mini player and a full-screen player.

## The look

- The interface is black, white and grey, set in DotGothic16 and VT323. Every cover carries a VHS tape look: a soft horizontal smear, red and blue fringing, tape grain and a scanline raster, applied before the mode filter so the monochrome modes stay colour-free.
- Anything that carries colour, such as cover art, goes through a media filter. The switcher at the top right offers `mono` (the default), `dither`, `invert`, `color`, `cyano` and `ink`. Only `color` and `cyano` let any hue through.
- Every cover, artist image, genre tile, branch, sprig and petal is a real image: monochrome flower photographs, white ink drawings on black, petals on dark water, painted ponds and embroidered garlands. Six were supplied by the user and 47 were generated with an AI image model in the same styles; `imagery/` holds the originals and the pipeline that cuts them into `src/img/`. Each genre has its own species.
- Home has a system readout beside a flowering branch, a live clock and quick picks. Petals drift behind the interface. They can be switched off next to the filters and stop entirely when the system asks for reduced motion.

All artists, albums, tracks and labels are invented. Every track is synthesised with the Web Audio API from its seed and genre, so each one has its own tempo, key, chords, melody, drums and arrangement.

## Files

| Path | Contents |
|---|---|
| `index.html` | Standalone build. Open it directly or serve it. |
| `src/index.html` | Page shell, pixel icon sprite, SVG filters and script tags. |
| `src/styles.css`, `src/player.css`, `src/app.css` | Tokens, layout and filters; player styles; view styles. |
| `src/img/`, `src/imagery.js` | The cut covers, decorations and petals, and the manifest the app reads them through. |
| `src/flora.js` | `Flora`: places the decoration images and animates the petals. |
| `imagery/` | Source images (user-supplied and generated) and the pipeline that produces `src/img/`. See `IMAGERY.md` and `imagery/pipeline/README.md`. |
| `src/data.js` | `Catalog`: the generated catalogue, search, formatters and cover art. |
| `src/audio.js` | `AudioEngine`: the generative music engine. |
| `src/player.js` | `Player`: playback state machine and the player bar, mini player and full-screen player. |
| `src/app.js` | `App` and `Library`: routing, views, menus, dialogs, toasts, filters, petals and persistence. |
| `SPEC.md` | The behaviour contract, including the acceptance checklist in section 12. |
| `DESIGN.md` | The visual contract for the monochrome restyle. |
| `design/mocks/` | The three design directions that were compared. `terminal` was chosen and borrows ideas from the other two. |
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

`tools/regress/` holds browser tests for each acceptance item in `SPEC.md`. They drive a headless Microsoft Edge through `tools/cdp.js` and print what they observe instead of asserting. Run `node serve.js` in another terminal (set `PORT` and `WL_PORT` to use a port other than 8765), record a baseline from a known-good build, and compare later runs against it:

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

## Desktop app

`desktop/` holds an Electron shell that packages the page as a single portable Windows executable with the images and fonts bundled, so it runs offline. See `desktop/README.md` for the two commands that build it.
