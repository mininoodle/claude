# Wavelength desktop

An Electron shell that turns the built page into a Windows executable. The app is fully offline: the page, the images and the two pixel fonts are bundled, and the shell blocks every network request except its own files. Links to other websites open in the system browser.

## Build

From this folder, with Node 22 installed:

```bash
npm install
npm run dist
```

`npm run dist` first runs `assemble.js`, which copies `../dist/local.html` and `../dist/img` into `app/` and downloads the DotGothic16 and VT323 font files from Google Fonts into `app/fonts/` (only on the first run; later runs reuse them). Then `electron-builder` writes a single portable file, `release/Wavelength.exe`. Build the page first with `node build.js` in the parent folder whenever the sources change.

Other scripts: `npm start` runs the unpacked app; `npm run smoke` opens it, writes `smoke.png` after the first render, prints what loaded and quits.

## Notes

- The executable is unsigned, so Windows SmartScreen shows a warning on first launch. Choose "More info" and "Run anyway".
- The portable build unpacks itself to a temporary folder on each launch, so it starts a little slower than an installed app. Library and settings persist in the user's app data folder, as in any Electron app.
- `build/icon.png` is the window and file icon, rendered from one of the flower cut-outs.
