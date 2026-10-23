# imagery/pipeline — how the shipped flower imagery is made

Turns the sources under `imagery/` (the user's six images, the generated covers, decorations and petal sheets)
into the shipped files of IMAGERY.md section 2: `src/img/covers/*.jpg`, `src/img/deco/*.png`,
`src/img/petals/*.png` and the manifest `src/imagery.js` (`window.Imagery`). Every pixel operation runs on a
canvas inside the headless Edge harness (`tools/cdp.js`); Node only decides, encodes and writes.

## Re-run

```
node serve.js                      # once, in another shell: serves dist/ on http://127.0.0.1:8765
node imagery/pipeline/run.js       # 5-10 s
```

`run.js` does, in order:

1. **prep** — copies `imagery/{source,generated,probe}` to `dist/imagery/` (a processing copy, never shipped) and
   writes `dist/imagery/pipeline.html`, a blank page that loads DotGothic16 from Google Fonts and inlines `page.js`.
2. **render** — spawns `node tools/cdp.js imagery/pipeline/work.js --profile=imagery --fresh
   --url=http://127.0.0.1:8765/imagery/pipeline.html --out=tools/shots/imagery`. `work.js` wipes `src/img/`,
   renders every decoration, petal and cover through `c.eval('Pipeline.…')`, writes the files, `src/imagery.js`
   and `imagery/pipeline/plan.json` (the full plan with crops, sizes and overlaps, for inspection).
3. **mirror** — copies `src/img` to `dist/img` (what `build.js` does for a real build) so the preview works.
4. **preview** — writes `dist/preview-imagery.html` (`preview.js`, also runnable alone with `--preview-only`).

Flags: `--prep-only`, `--preview-only`. The run is deterministic: the same sources and tables give the same files
(seeded by `Flora.hash`/`Flora.rng` over the entity ids).

Screenshots of the preview: `node tools/cdp.js tools/work/imagery/preview-shots.js --profile=imagery-shots
--fresh --url=http://127.0.0.1:8765/preview-imagery.html --out=tools/shots/imagery` with the env vars
`MODES=mono,invert` (default all six), `SCALE=0.5`, `STEP=800`, `MAX=12`, or `FOCUS=sprig-lily-flash,ar_marlowvane`
to shoot named items only.

## Files

| file | role |
|---|---|
| `assign.js` | the source table (`SRC`: file, type, subject focus, allowed region, tone lift), the species → candidate table (`CANDIDATES`), the decoration inventory (`DECO`: source, kind, species, stem, keying options), the petal sheets, `listEntities()` (albums, artists, playlists with their DESIGN 5.6 overlays, liked, mosaic-empty, genre tiles from `src/data.js`), and `planCovers(infos)` |
| `page.js` | browser side: frame measurement, keying, despeckling, content crop, petal cutting, cover crops with overlays, export |
| `work.js` | the `tools/cdp.js` module that drives `page.js` and writes `src/img/**`, `src/imagery.js`, `plan.json` |
| `png.js` | greyscale + alpha PNG encoder (quantised, adaptive filters) for the decorations and petals |
| `preview.js` | writes `dist/preview-imagery.html`; copies the filter CSS and SVG defs from `src/styles.css` / `src/index.html` |
| `run.js` | the orchestration above |

## What the pipeline does

**Frames.** `measureFrame` scans inward from each edge. A line is frame when it is uniform (range ≤ 40) and near
white — or near black too for cover sources, where eating a black margin only tightens the crop — or when ≥ 80 % of
it is near white (the thick mats of `deco_sprig_peony` / `deco_sprig_wisteria`, which art crosses). Up to six uniform
transition lines of any level are swallowed with the band, and a detected band is stepped 6 px further in so JPEG
ringing along the mat never survives as a line. Every crop is inset past the band.

**Decorations.** `keyRegion` measures the ground as the histogram mode of the region (so the dark-green ground of
`deco_garland_vertical` and the mid grey of `source/7.webp` are keyed relative to their own level), computes
`alpha = clamp((distance − lo) / span)` per pixel (pure black art: `(luma − 12) / 60`; a measured ground:
`(luma − bg − 10) / 50`; the grey flash: `|luma − bg|` or, for `grey-dark`, `bg − luma`), un-premultiplies the colour
against the ground (the art is drawn over its ground, so compositing the result on black reproduces the source),
zeroes transparent pixels, drops components below `minArea` and components crossing a named region edge
(`dropTouching`), erases named rectangles of neighbouring art (`erase`), fades the alpha to zero over the last ~7 % toward
the edges named in `feather` (a region cut through continuous art, such as the embroidered garland of `source/6.jpg`,
never ends in a straight line; the fade is applied after the components were judged, so it never changes what is kept),
keeps soft pixels only within 2 px of a kept component, crops to the content box + 2 px, then rotates/flips and fits the
long side to `maxSide` (512 for branches and the sakura/ume sprigs that fill the 260 px library slot at dpr 2, 448 for
other sprigs, 400 for sprays and the small empty-state art). `deco_branch_home2` is inverted first. From `7.webp` only
the blossom branch is used (region `[0, 0, .76, .74]` with the lily beside it erased by rectangle, so the branch ends in
its own outline; one connected component thanks to its white halo; the cherub's feathers are small components and fall
to `minArea: 2500`); `liftDark` raises its black trunk ink to a dark grey (72-90) on export so the trunk keeps a body
on the black page and inverts to a light grey. The lily of `7.webp` is not used: its petals are pencil-shaded, so at any
threshold it keys as a white blob rather than line art; `deco_sprig_lily.jpg` serves lily/lotus/iris both ways.

**Petals.** The two sheets are keyed like black-ground art, split into components, each cut at its bounding box and
fitted to 32 px on its long side (10 from sheet 1, 6 from sheet 2). The files ship under `src/img/petals/` and the
manifest entries also carry each cut-out as a `data:` URL (`data`), so a first render makes no petal requests.

**Covers.** `Pipeline.info` measures every source once; `planCovers` picks, per entity, the candidate list of
`Catalog.coverSpecies(entity)` (genre tiles: `Flora.speciesFor(ge_*)`) rotated by `hash(id)`, and a crop from
`Flora.rng('imagery:cover:' + id)`: a square of `min(usable) / zoom` with zoom 1.0–1.6 (capped so the crop keeps ≥ 400 source
px: the user's 736-px photographs are never upscaled), positioned at random or jittered around the source's subject
focus, flipped 40 % of the time. Artists (and Liked) get a portrait crop centred on the measured subject: `Pipeline.info`
measures the bright mass inside the focus circle (threshold = max(median + 40, (median + p90) / 2) of its luma), its
centroid and the radius holding 85 % of it; the crop side is that radius / 0.7 (inside the inner 70 % of the circle), zoom
up to 1.4× for artists, a ±5 % offset, never larger than the room around the centroid and never below 360 px; artists
prefer focused photographs, then focused ink. After planning, `work.js` measures the same mass inside each portrait's
own circle (`Pipeline.cropMass`) and moves crops whose centroid is more than 0.1 r off, re-planning everything after
them with the moved crop fixed (up to five rounds; a move that does not help is undone). Distinctness: a crop may not
overlap an earlier crop of the same file by ≥ 0.45 IoU; eight re-rolls on the candidate, then the next candidate; two
genre tiles never share a file; artists are planned before playlists, genres and albums so they keep the focused
photographs. Kin: an album never takes the file its artist's cover uses, and a playlist never the file of one of its
first four featured artists, so one screen never shows the same photograph twice (`listEntities` lists each entity's
kin). Readability: every non-portrait cover's 48-px downsample is measured (`Pipeline.coverStats`); a flat (std < 30)
or dark (mean < 40) crop is re-rolled up to four times (`rerollCrop`, seeds 100, 200, …) and the best one kept. Covers are rendered at 400 × 400
(two-step downscale), JPEG quality 0.82, colour kept (`--fx` makes them grey at runtime). Per-source tone lifts:
`cov_petals_water2` brightness 1.7 / contrast 1.2, `cov_petals_water3` 1.25 / 1.15, `cov_sakura_colour` 1.12;
`mosaic-empty` is `cov_lace` at brightness 0.62; Liked is the user's lotus (`source/3.jpg`, the tight portrait crop)
with the old violet-to-mint diagonal multiplied at 0.25 (plus a 0.16 screen), so the flower stays above #cfcfcf.
`source/4.jpg` is only cropped from its left 54 %, top 50 % or bottom 40 % (the watermark sits at 55–85 % × 52–58 %);
`source/2.jpg` only from `[.04, .42, .96, .87]` (never the white top).

**Overlays** (DESIGN 5.6, the same geometry as `Flora.paintCover`, drawn after `document.fonts.ready` in
DotGothic16): mixes get the outlined numeral (0.56 S, black stroke 0.06 S, bottom-right), Top 50 gets `50`, editorial
playlists get the `> name` strip (0.075 S, black strip 2 fs tall at the bottom-left, ellipsised at 0.84 S) on the full
variant only — their `.thumb.jpg` is the same crop without it — and every playlist gets the 13 × 12 pixel blossom
mark (`Flora.gridPath(Flora.BLOSSOM)` as a `Path2D`, cell `round(S/128)`, margin 0.045 S, 3 × 3-cell black halo).

## Adding or replacing a source

Add it to `SRC` (and to the species lists it should serve) or to `DECO`, re-run, and check
`dist/preview-imagery.html` under `mono` and `invert` (no frame lines, no haze rectangles, no text or watermark, every
decoration white on transparent). `plan.json` lists every cover's source, crop, worst overlap, kin, 48-px statistics and centring, the measured subject
masses (`log.mass`), the centring rounds (`log.centring`) and the readability re-rolls (`log.rerolls`).
