// imagery/pipeline/assign.js — the source table, the species -> candidate table, the decoration and petal
// inventory, and the deterministic cover plan (IMAGERY.md sections 1, 2 and the quality notes).
// Pure Node: no canvas here. The browser side (page.js) measures frames and renders; this module decides.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
require(path.join(ROOT, 'src', 'flora.js'));
const Flora = globalThis.Flora;
const Catalog = require(path.join(ROOT, 'src', 'data.js'));

// ---------------------------------------------------------------------------------------------- cover sources
// focus: [fx, fy, r] — the subject centre (fractions of width/height) and its radius as a fraction of min(w, h);
// the page measures the bright-mass centroid inside that circle (info.mass), which the portrait crops centre on;
// region: [x0, y0, x1, y1] — the only area a crop may come from (fractions); frames are measured on top of it.
// type: photo | ink | paint | texture — artists prefer a focused photo, then a focused ink drawing.
const SRC = {
  camellia_bw:        { file: 'generated/cov_camellia_bw.jpg', type: 'photo', focus: [0.48, 0.42, 0.30] },
  chrysanthemum_ink:  { file: 'generated/cov_chrysanthemum_ink.jpg', type: 'ink', focus: [0.5, 0.5, 0.48] },
  cosmos_ink:         { file: 'generated/cov_cosmos_ink.jpg', type: 'ink', focus: [0.5, 0.48, 0.44] },
  daisy_ink:          { file: 'generated/cov_daisy_ink.jpg', type: 'ink', focus: [0.5, 0.5, 0.45] },
  dandelion_bw:       { file: 'generated/cov_dandelion_bw.jpg', type: 'photo', focus: [0.5, 0.5, 0.40] },
  garland1:           { file: 'generated/cov_garland1.jpg', type: 'texture' },
  garland2:           { file: 'generated/cov_garland2.jpg', type: 'texture' },
  // the big embroidered flower on the wreath's top band: a centred subject for a second chrysanthemum artist
  garland2_bloom:     { file: 'generated/cov_garland2.jpg', type: 'photo', focus: [0.5, 0.20, 0.12], noFrame: true },
  hibiscus_bw:        { file: 'generated/cov_hibiscus_bw.jpg', type: 'photo', focus: [0.5, 0.5, 0.42] },
  hydrangea_colour:   { file: 'generated/cov_hydrangea_colour.jpg', type: 'photo', focus: [0.40, 0.45, 0.40] },
  hydrangea_ink:      { file: 'generated/cov_hydrangea_ink.jpg', type: 'ink', focus: [0.5, 0.5, 0.42] },
  iris_ink:           { file: 'generated/cov_iris_ink.jpg', type: 'ink', focus: [0.5, 0.5, 0.45] },
  lace:               { file: 'generated/cov_lace.jpg', type: 'texture' },
  lilies_colour:      { file: 'generated/cov_lilies_colour.jpg', type: 'photo', focus: [0.72, 0.50, 0.22] },
  lily_bw2:           { file: 'generated/cov_lily_bw2.jpg', type: 'photo', focus: [0.5, 0.5, 0.32] },
  lotus_bw:           { file: 'generated/cov_lotus_bw.jpg', type: 'photo', focus: [0.5, 0.55, 0.28] },
  magnolia_bw:        { file: 'generated/cov_magnolia_bw.jpg', type: 'photo', focus: [0.70, 0.50, 0.42] },
  moonflower_ink:     { file: 'generated/cov_moonflower_ink.jpg', type: 'ink', focus: [0.5, 0.5, 0.45] },
  peony_bw:           { file: 'generated/cov_peony_bw.jpg', type: 'photo', focus: [0.5, 0.5, 0.42] },
  peony_ink:          { file: 'generated/cov_peony_ink.jpg', type: 'ink', focus: [0.5, 0.5, 0.46] },
  petals_water1:      { file: 'generated/cov_petals_water1.jpg', type: 'texture' },
  // very dark: lifted hard and cropped around the reflection with the petal cluster so it still reads at 48 px
  petals_water2:      { file: 'generated/cov_petals_water2.jpg', type: 'texture', lift: 'brightness(1.7) contrast(1.2)', focus: [0.55, 0.50, 0.30] },
  petals_water3:      { file: 'generated/cov_petals_water3.jpg', type: 'texture', lift: 'brightness(1.25) contrast(1.15)', focus: [0.62, 0.55, 0.26] },
  pond_paint1:        { file: 'generated/cov_pond_paint1.jpg', type: 'paint', focus: [0.5, 0.70, 0.26] },
  pond_paint2:        { file: 'generated/cov_pond_paint2.jpg', type: 'paint', focus: [0.5, 0.72, 0.22] },
  rose_bw:            { file: 'generated/cov_rose_bw.jpg', type: 'photo', focus: [0.5, 0.40, 0.32] },
  sakura_colour:      { file: 'generated/cov_sakura_colour.jpg', type: 'photo', lift: 'brightness(1.12)', focus: [0.45, 0.52, 0.28] },
  sakura_ink:         { file: 'generated/cov_sakura_ink.jpg', type: 'ink', focus: [0.5, 0.5, 0.45] },
  sunflower_bw:       { file: 'generated/cov_sunflower_bw.jpg', type: 'photo', focus: [0.5, 0.5, 0.42] },
  thistle_bw:         { file: 'generated/cov_thistle_bw.jpg', type: 'photo', focus: [0.5, 0.45, 0.45] },
  ume_ink:            { file: 'generated/cov_ume_ink.jpg', type: 'ink', focus: [0.5, 0.5, 0.40] },
  wisteria_colour:    { file: 'generated/cov_wisteria_colour.jpg', type: 'photo', focus: [0.60, 0.50, 0.24] },
  wisteria_ink:       { file: 'generated/cov_wisteria_ink.jpg', type: 'ink', focus: [0.33, 0.42, 0.30] },
  probe_lily:         { file: 'probe/lily.jpg', type: 'photo', focus: [0.5, 0.5, 0.34] },
  probe_branch:       { file: 'probe/branch.jpg', type: 'ink', focus: [0.5, 0.5, 0.44] },
  // the user's images
  pond_painting:      { file: 'source/2.jpg', type: 'paint', region: [0.04, 0.42, 0.96, 0.87], focus: [0.5, 0.64, 0.25] },   // never the white top
  lotus_photo:        { file: 'source/3.jpg', type: 'photo', focus: [0.5, 0.46, 0.30] },
  petals_blue_left:   { file: 'source/4.jpg', type: 'photo', region: [0, 0, 0.54, 1], focus: [0.33, 0.52, 0.30] },        // watermark is at 55-85% x 52-58%
  petals_blue_top:    { file: 'source/4.jpg', type: 'photo', region: [0, 0, 1, 0.50] },
  petals_blue_bottom: { file: 'source/4.jpg', type: 'photo', region: [0, 0.60, 1, 1], focus: [0.42, 0.80, 0.22] },
  lilies_pink_left:   { file: 'source/5.jpg', type: 'photo', focus: [0.30, 0.55, 0.30] },
  lilies_pink_right:  { file: 'source/5.jpg', type: 'photo', focus: [0.67, 0.46, 0.20] },
  garland_embroidery: { file: 'source/6.jpg', type: 'texture', focus: [0.55, 0.52, 0.30] },
};

// species -> candidates (>= 2 each; a photograph and an ink drawing where both exist; pond, petal, garland and lace
// images are wildcards). Order matters only through hash(id).
const CANDIDATES = {
  sakura:        ['sakura_colour', 'sakura_ink', 'petals_blue_left', 'probe_branch', 'petals_water1', 'petals_blue_top'],
  chrysanthemum: ['chrysanthemum_ink', 'garland2_bloom', 'garland2', 'petals_water3', 'lace'],
  rose:          ['rose_bw', 'garland_embroidery', 'garland1', 'petals_water1'],
  wisteria:      ['wisteria_colour', 'wisteria_ink', 'pond_paint2', 'garland_embroidery'],
  moonflower:    ['moonflower_ink', 'petals_water2', 'pond_paint1', 'petals_blue_top'],
  camellia:      ['camellia_bw', 'garland2', 'lace', 'petals_water3'],
  magnolia:      ['magnolia_bw', 'pond_painting', 'pond_paint1', 'sakura_ink'],
  lily:          ['lily_bw2', 'lilies_colour', 'probe_lily', 'iris_ink', 'lilies_pink_right'],
  lotus:         ['lotus_bw', 'lotus_photo', 'lilies_pink_left', 'lilies_colour', 'probe_lily'],
  peony:         ['peony_bw', 'peony_ink', 'garland1', 'pond_paint2'],
  daisy:         ['daisy_ink', 'cosmos_ink', 'garland1', 'petals_water3'],
  hibiscus:      ['hibiscus_bw', 'lace', 'petals_water3', 'lilies_pink_right'],
  sunflower:     ['sunflower_bw', 'daisy_ink', 'chrysanthemum_ink', 'garland2', 'petals_water1'],
  thistle:       ['thistle_bw', 'lace', 'petals_blue_bottom', 'dandelion_bw'],
  iris:          ['iris_ink', 'pond_paint2', 'wisteria_colour', 'lily_bw2'],
  dandelion:     ['dandelion_bw', 'petals_water1', 'lace', 'thistle_bw'],
  ume:           ['ume_ink', 'pond_painting', 'petals_blue_bottom', 'pond_paint1', 'probe_branch'],
  hydrangea:     ['hydrangea_colour', 'hydrangea_ink', 'garland2', 'petals_blue_left'],
  cosmos:        ['cosmos_ink', 'daisy_ink', 'petals_water3', 'garland1'],
};

// ---------------------------------------------------------------------------------------------- decorations
// stem: the edge or corner the art attaches to (Flora.sprite flips horizontally when it is opposite the anchor).
// region: fractions of the source; mode 'grey' keys by distance to the measured ground (7.webp); invert first for
// black-on-white art; minArea drops components (speckles, the cherub's feathers); dropTouching drops components that
// cross the named region edges (fragments of neighbouring art); feather fades the alpha to zero over the last ~7 %
// toward the named region edges (a crop through continuous art never ends in a straight line); erase blanks
// rectangles (source fractions) of neighbouring art; rotate 180 turns a hanging sprig into a rising one.
const DECO = [
  // branches (Home readout): peony / sakura / ume
  // the 7.webp blossom branch: the lily beside it is erased (the same boundaries the lily entry uses, inverted), so
  // the branch ends in its own outline instead of a straight cut; its black trunk is lifted to a dark grey on export
  { id: 'branch-flash-1', source: 'source/7.webp', kind: 'branch', species: ['sakura', 'ume', 'peony'], stem: 'topleft', mode: 'grey', region: [0, 0, 0.76, 0.74], minArea: 2500,
    erase: [[0.705, 0, 1, 0.17], [0.678, 0.17, 1, 0.36], [0.705, 0.36, 1, 0.62], [0.60, 0.62, 1, 0.74]], liftDark: true },
  { id: 'branch-ink-1', source: 'probe/branch.jpg', kind: 'branch', species: ['sakura', 'ume'], stem: 'bottomleft' },
  { id: 'branch-home-1', source: 'generated/deco_branch_home.jpg', kind: 'branch', species: ['peony', 'ume', 'sakura'], stem: 'bottomleft' },
  { id: 'branch-home-2', source: 'generated/deco_branch_home2.jpg', kind: 'branch', species: ['sakura', 'ume'], stem: 'left', invert: true },
  // sprigs: hero (topright, hanging), expanded-player floor and library (bottomleft, rising), queue empty (center)
  { id: 'sprig-sakura-hang', source: 'generated/deco_sprig_sakura.jpg', kind: 'sprig', species: ['sakura', 'ume', 'magnolia'], stem: 'topright' },
  { id: 'sprig-ume-rise', source: 'generated/cov_ume_ink.jpg', kind: 'sprig', species: ['ume', 'sakura'], stem: 'bottomleft' },
  { id: 'sprig-peony-hang', source: 'generated/deco_sprig_peony.jpg', kind: 'sprig', species: ['peony', 'camellia', 'hibiscus', 'magnolia'], stem: 'topright' },
  { id: 'sprig-peony-rise', source: 'generated/cov_peony_ink.jpg', kind: 'sprig', species: ['peony', 'camellia', 'rose'], stem: 'bottom' },
  // the embroidered garland is continuous: its free ends are feathered where the region cuts through it
  { id: 'sprig-rose-rise', source: 'source/6.jpg', kind: 'sprig', species: ['rose', 'hydrangea', 'peony'], stem: 'bottomleft', region: [0, 0.60, 0.80, 1], feather: ['top', 'right'] },
  { id: 'sprig-rose-hang', source: 'source/6.jpg', kind: 'sprig', species: ['rose', 'hydrangea'], stem: 'topleft', region: [0.36, 0, 1, 0.52], feather: ['bottom', 'left'] },
  { id: 'sprig-kiku-hang', source: 'generated/deco_sprig_chrysanthemum.jpg', kind: 'sprig', species: ['chrysanthemum', 'dandelion', 'thistle'], stem: 'topright' },
  { id: 'sprig-kiku-rise', source: 'generated/deco_sprig_chrysanthemum.jpg', kind: 'sprig', species: ['chrysanthemum', 'dandelion', 'thistle'], stem: 'bottomleft', rotate: 180 },
  { id: 'sprig-wisteria-hang', source: 'generated/deco_sprig_wisteria.jpg', kind: 'sprig', species: ['wisteria', 'moonflower'], stem: 'topright' },
  // the rightmost raceme of the wisteria drawing: the region starts in the gap left of it, fragments crossing that
  // edge are dropped, and its top is the stem side (hanging from the top-right)
  { id: 'sprig-wisteria-right', source: 'generated/cov_wisteria_ink.jpg', kind: 'sprig', species: ['wisteria', 'iris'], stem: 'topright', region: [0.70, 0.28, 1, 0.74], dropTouching: ['left'], erase: [[0.70, 0.28, 0.785, 0.52]], feather: ['left'] },
  { id: 'sprig-wisteria-rise', source: 'generated/deco_sprig_wisteria.jpg', kind: 'sprig', species: ['wisteria', 'iris'], stem: 'bottomleft', rotate: 180 },
  { id: 'sprig-lily-rise', source: 'generated/deco_sprig_lily.jpg', kind: 'sprig', species: ['lily', 'lotus', 'iris'], stem: 'bottomleft' },
  { id: 'sprig-lily-hang', source: 'generated/deco_sprig_lily.jpg', kind: 'sprig', species: ['lily', 'lotus', 'iris'], stem: 'topright', rotate: 180 },
  // (the lily of 7.webp is not used: its petals are pencil-shaded, so keyed at any threshold it is a white blob, not
  // line art; the generated lily drawing serves lily/lotus/iris in both directions)
  { id: 'sprig-daisy-rise', source: 'generated/deco_sprig_daisy.jpg', kind: 'sprig', species: ['daisy', 'cosmos', 'sunflower'], stem: 'bottomleft' },
  { id: 'sprig-daisy-hang', source: 'generated/deco_sprig_daisy.jpg', kind: 'sprig', species: ['daisy', 'cosmos', 'sunflower'], stem: 'topright', rotate: 180 },
  { id: 'sprig-cosmos-rise', source: 'generated/cov_cosmos_ink.jpg', kind: 'sprig', species: ['cosmos', 'daisy', 'hibiscus'], stem: 'bottom' },
  // sprays (first empty slot of a short shelf)
  { id: 'spray-blossom-1', source: 'generated/deco_spray.jpg', kind: 'spray', species: ['sakura', 'ume'], stem: 'bottomleft', maxSide: 400 },
  { id: 'spray-hydrangea-1', source: 'generated/cov_hydrangea_ink.jpg', kind: 'spray', species: ['hydrangea', 'peony'], stem: 'bottomleft', maxSide: 400 },
  { id: 'spray-sakura-2', source: 'generated/cov_sakura_ink.jpg', kind: 'spray', species: ['sakura', 'ume', 'magnolia'], stem: 'center', maxSide: 400 },
  // empty states
  { id: 'bud-1', source: 'generated/deco_bud.jpg', kind: 'bud', species: ['sakura', 'rose', 'peony'], stem: 'bottom', maxSide: 400 },
  { id: 'twig-1', source: 'generated/deco_twig.jpg', kind: 'twig', species: ['ume', 'sakura'], stem: 'bottom', maxSide: 400 },
  { id: 'seedling-1', source: 'generated/deco_seedling.jpg', kind: 'seedling', species: ['sakura'], stem: 'bottom', maxSide: 400 },
];
// long side of a decoration PNG: 512 covers the largest placements at dpr 2 (library sprig 260 px wide: sakura/ume
// sprigs and the branches; Home branch 236 px); other sprigs show at <= 176 px (448), sprays at <= 192 px (400)
const DECO_MAX_SIDE = 512;
DECO.forEach((d) => { if (d.maxSide == null && d.kind === 'sprig' && !(d.species.includes('sakura') || d.species.includes('ume'))) d.maxSide = 448; });

const PETAL_SHEETS = [
  { source: 'generated/petals_sheet1.jpg', minArea: 400, max: 10 },
  { source: 'generated/petals_sheet2.jpg', minArea: 400, max: 6 },
];
const PETAL_SIZE = 32;   // long side in px (24-40 allowed)

// ---------------------------------------------------------------------------------------------- entities
// Every shipped cover: albums, artists, playlists, liked, mosaic-empty, genre tiles (DESIGN 5.6 overlays kept).
// kin: the artists whose own cover must not come from the same file (an album's artist; a playlist's first four
// featured artists), so one screen never shows the same photograph twice.
function listEntities() {
  const out = [];
  Catalog.albums.forEach((al) => out.push({ id: al.id, kind: 'album', species: Catalog.coverSpecies(al), name: al.title, kin: [al.artistId].filter(Boolean) }));
  Catalog.artists.forEach((ar) => out.push({ id: ar.id, kind: 'artist', species: Catalog.coverSpecies(ar), name: ar.name }));
  Catalog.playlists.forEach((pl) => {
    const e = { id: pl.id, kind: 'playlist', species: Catalog.coverSpecies(pl), name: pl.name, overlay: { mark: true }, kin: [] };
    (pl.trackIds || []).some((tid) => {
      const t = Catalog.track(tid);
      if (t && t.artistId && e.kin.indexOf(t.artistId) < 0) e.kin.push(t.artistId);
      return e.kin.length >= 4;
    });
    if (pl.kind === 'mix') e.overlay.numeral = (String(pl.name).match(/\d+/) || [''])[0] || undefined;
    else if (pl.kind === 'chart') e.overlay.numeral = (String(pl.name).match(/\d+/) || ['50'])[0];
    else { e.overlay.label = pl.name; e.thumb = true; }
    out.push(e);
  });
  out.push({ id: 'liked', kind: 'liked', species: 'lotus', name: 'Liked Songs' });
  out.push({ id: 'mosaic-empty', kind: 'mosaic-empty', species: 'sakura', name: 'empty mosaic' });
  Catalog.genres.forEach((ge) => out.push({ id: ge.id, kind: 'genre', species: Flora.speciesFor(ge.id), name: ge.name }));
  return out;
}

// ---------------------------------------------------------------------------------------------- crop planning
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const COVER_PX = 400;   // the shipped cover side: a crop is never smaller than this in source px when the source allows
const PORTRAIT_MIN = 360;   // a portrait crop may shrink to this (1.1x upscale) to keep its subject centred, never below

// the usable rectangle of a source in px: its region (fractions) inset past the measured frame
function usable(info, src) {
  const r = src.region || [0, 0, 1, 1], fr = src.noFrame ? { l: 0, t: 0, r: 0, b: 0 } : info.frame;
  const x0 = Math.max(fr.l, Math.round(r[0] * info.w)), y0 = Math.max(fr.t, Math.round(r[1] * info.h));
  const x1 = Math.min(info.w - fr.r, Math.round(r[2] * info.w)), y1 = Math.min(info.h - fr.b, Math.round(r[3] * info.h));
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// one crop: a square of `side` px at (x, y) in source px, optionally flipped
function makeCrop(R, info, src, kind, salt) {
  const u = usable(info, src);
  const minDim = Math.min(u.w, u.h), minWH = Math.min(info.w, info.h);
  const f = src.focus;
  let side, cx, cy;
  if ((kind === 'artist' || kind === 'liked') && f) {
    // portrait: the measured bright mass (its centroid and the radius holding 85 % of it, info.mass) sits inside the
    // inner 70 % of a round crop; artists vary the surround a little (zoom up to 1.4x the tight crop, a small offset)
    // so two artists on one photograph read differently; Liked is the tight crop
    const m = info.mass && info.mass.n > 50 ? info.mass : null;
    const r = m ? m.r / minWH : f[2];
    const fx = m ? m.cx / info.w : f[0], fy = m ? m.cy / info.h : f[1];
    const zoom = kind === 'liked' ? 1 : 1 + R() * 0.4;
    side = clamp(Math.round(2 * r * minWH / 0.70 * zoom), Math.round(minDim * 0.45), minDim);
    // a subject near the source's edge can only be centred by a crop that fits around it: cap the side so the crop
    // never has to be pushed off the subject by the usable rectangle (the mass stays in the middle of the circle)
    const px = fx * info.w, py = fy * info.h;
    const room = 2 * Math.max(16, Math.min(px - u.x0, u.x1 - px, py - u.y0, u.y1 - py));
    side = Math.max(Math.min(side, Math.round(room)), Math.min(minDim, PORTRAIT_MIN));
    const jit = kind === 'liked' ? 0 : 0.10;
    cx = px + (R() - 0.5) * side * jit;
    cy = py + (R() - 0.5) * side * jit;
  } else if (kind === 'artist') {
    // a texture or pattern as a portrait: a mid-sized square anywhere in the usable area
    side = Math.max(16, Math.round(minDim * (0.55 + R() * 0.3)));
    cx = u.x0 + side / 2 + R() * (u.w - side);
    cy = u.y0 + side / 2 + R() * (u.h - side);
  } else {
    // zoom 1.0-1.6, capped so the crop keeps >= 400 source px (the user's 736-px photos are never upscaled)
    const zoom = Math.max(1, Math.min(1 + R() * 0.6, minDim / COVER_PX));
    side = Math.max(16, Math.floor(minDim / zoom));
    if (f) {   // keep the subject near, with a jitter of up to +-30% of the crop
      cx = f[0] * info.w + (R() - 0.5) * side * 0.6;
      cy = f[1] * info.h + (R() - 0.5) * side * 0.6;
    } else {
      cx = u.x0 + side / 2 + R() * (u.w - side);
      cy = u.y0 + side / 2 + R() * (u.h - side);
    }
  }
  const x = Math.round(clamp(cx - side / 2, u.x0, u.x1 - side));
  const y = Math.round(clamp(cy - side / 2, u.y0, u.y1 - side));
  const flip = kind !== 'liked' && R() < 0.4;
  return { x, y, side, flip, salt };
}

function iou(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.side, b.x + b.side) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.side, b.y + b.side) - Math.max(a.y, b.y));
  const inter = ix * iy;
  return inter / (a.side * a.side + b.side * b.side - inter);
}

// the candidate pool of an entity, first choice first (artists prefer focused photographs, then focused ink,
// then the rest; everything else takes the species list in hashed order)
function sourcePool(e, R) {
  if (e.kind === 'liked') return ['lotus_photo'];
  if (e.kind === 'mosaic-empty') return ['lace'];
  const list = (CANDIDATES[e.species] || CANDIDATES.sakura).slice();
  const start = Math.floor(R() * list.length) % list.length;
  const rotated = list.slice(start).concat(list.slice(0, start));
  if (e.kind !== 'artist') return rotated;
  const rank = (k) => (SRC[k].type === 'photo' && SRC[k].focus ? 0 : SRC[k].type === 'ink' && SRC[k].focus ? 1 : 2);
  return rotated.slice().sort((a, b) => rank(a) - rank(b));
}
// the pool without the files the entity's kin already use (falls back to the whole pool when that empties it)
function kinPool(pool, e, chosen) {
  const files = (e.kin || []).map((id) => chosen[id]).filter(Boolean);
  if (!files.length) return pool;
  const out = pool.filter((k) => files.indexOf(SRC[k].file) < 0);
  return out.length ? out : pool;
}

// the best crop of an entity over its pool: 8 re-rolls per candidate, then the next candidate; `taken` lists the crops
// already on each file; `saltBase` offsets the re-roll seeds (the readability re-rolls of work.js use 100, 200, ...)
function bestCrop(e, pool, infos, byFile, R, saltBase) {
  let best = null, bestScore = Infinity, bestKey = null;
  for (let salt = 0; salt < 8 * pool.length; salt++) {
    const key = pool[Math.floor(salt / 8)];
    const src = SRC[key], info = infos[key];
    if (!info) throw new Error('no measurement for source ' + key);
    const taken = byFile[src.file] || [];
    const s = saltBase + salt;
    const Rs = s === 0 ? R : Flora.rng('imagery:cover:' + e.id + ':' + s);
    const crop = makeCrop(Rs, info, src, e.kind, s);
    crop.kind = e.kind;
    // genre tiles sit side by side in Browse: two of them never share a source file
    const score = e.kind === 'genre' && taken.some((t) => t.kind === 'genre') ? 1 : taken.reduce((m, t) => Math.max(m, iou(crop, t)), 0);
    if (score < bestScore) { best = crop; bestScore = score; bestKey = key; }
    if (score < 0.45) break;
  }
  return { crop: best, score: bestScore, key: bestKey };
}
function planItem(e, key, crop, score) {
  const src = SRC[key];
  const item = { id: e.id, kind: e.kind, species: e.species, name: e.name, source: key, file: src.file, crop: { x: crop.x, y: crop.y, side: crop.side, flip: crop.flip, salt: crop.salt }, overlap: +score.toFixed(2) };
  if (src.lift) item.lift = src.lift;
  if (e.overlay) item.overlay = e.overlay;
  if (e.thumb) item.thumb = true;
  if (e.kind === 'liked') item.liked = true;
  if (e.kind === 'mosaic-empty') item.dim = 'brightness(0.62)';
  if (e.kin && e.kin.length) item.kin = e.kin.slice();
  return item;
}

// infos: { [srcKey]: { w, h, frame: {l,t,r,b}, mass? } } measured by the page. Returns the full cover plan (with
// plan.byFile, the crops taken per file, for the readability re-rolls).
// Distinctness: crops of one file must overlap by less than 0.45 IoU; 8 re-rolls on the first candidate, then the
// next candidate source, then the next. Kin: an album never takes the file its artist's cover uses, a playlist
// never the file of one of its first four featured artists (artists are planned first, so their files are known).
// overrides: { [id]: { key, crop } } — crops fixed by an earlier pass (the centring refinement of the portraits in
// work.js); they are taken as they are and everything planned after them keeps its distance from them.
function planCovers(infos, overrides) {
  // artists need the focused photographs most, so they are planned first; albums (free crops) last
  const order = { 'mosaic-empty': 0, liked: 1, artist: 2, playlist: 3, genre: 4, album: 5 };
  const entities = listEntities().map((e, i) => [e, i]).sort((a, b) => (order[a[0].kind] - order[b[0].kind]) || (a[1] - b[1])).map((x) => x[0]);
  const byFile = {};    // file -> crops already taken, for the distinctness rule
  const chosen = {};    // entity id -> file
  const plan = [];
  entities.forEach((e) => {
    const R = Flora.rng('imagery:cover:' + e.id);
    const ov = overrides && overrides[e.id];
    let b;
    if (ov) {
      const taken = byFile[SRC[ov.key].file] || [];
      const crop = Object.assign({}, ov.crop, { kind: e.kind });
      b = { key: ov.key, crop, score: taken.reduce((m, t) => Math.max(m, iou(crop, t)), 0) };
    } else {
      const pool = kinPool(sourcePool(e, R), e, chosen);
      b = bestCrop(e, pool, infos, byFile, R, 0);
    }
    const src = SRC[b.key];
    (byFile[src.file] || (byFile[src.file] = [])).push(b.crop);
    chosen[e.id] = src.file;
    plan.push(planItem(e, b.key, b.crop, b.score));
  });
  Object.defineProperty(plan, 'byFile', { value: byFile, enumerable: false });
  Object.defineProperty(plan, 'chosen', { value: chosen, enumerable: false });
  return plan;
}

// Re-roll one planned cover (work.js: its 48-px downsample was too flat or too dark): a fresh crop from the entity's
// pool with the same distinctness and kin rules, seeded by `attempt` (1, 2, ...). Returns true when the item changed.
function rerollCrop(plan, item, infos, attempt) {
  const byFile = plan.byFile, chosen = plan.chosen;
  const e = { id: item.id, kind: item.kind, species: item.species, kin: item.kin || [] };
  const R = Flora.rng('imagery:cover:' + e.id);
  const pool = kinPool(sourcePool(e, R), e, chosen);
  const taken = byFile[item.file] || [];
  const mine = taken.findIndex((t) => t.x === item.crop.x && t.y === item.crop.y && t.side === item.crop.side);
  const removed = mine >= 0 ? taken.splice(mine, 1)[0] : null;
  const b = bestCrop(e, pool, infos, byFile, R, 100 * attempt);
  if (!b.crop || b.score >= 0.45) { if (removed) taken.push(removed); return false; }
  const src = SRC[b.key];
  (byFile[src.file] || (byFile[src.file] = [])).push(b.crop);
  chosen[e.id] = src.file;
  const fresh = planItem(e, b.key, b.crop, b.score);
  ['source', 'file', 'crop', 'overlap'].forEach((k) => { item[k] = fresh[k]; });
  if (fresh.lift) item.lift = fresh.lift; else delete item.lift;
  return true;
}

// Recentre a portrait crop on the bright mass the page measured inside its circle (offset ox, oy in source px):
// the crop moves by the offset; where the usable rectangle pins it, the crop shrinks (never below 45 % of the
// usable side) so the subject can still sit in the middle. Returns the new crop, or null when nothing can move.
function recentreCrop(item, infos, off) {
  const src = SRC[item.source], info = infos[item.source], u = usable(info, src);
  const minDim = Math.min(u.w, u.h);
  let side = item.crop.side;
  const dcx = item.crop.x + side / 2 + off.ox, dcy = item.crop.y + side / 2 + off.oy;
  const room = 2 * Math.min(dcx - u.x0, u.x1 - dcx, dcy - u.y0, u.y1 - dcy);
  side = Math.round(clamp(Math.min(side, room), Math.min(minDim, PORTRAIT_MIN), minDim));
  const x = Math.round(clamp(dcx - side / 2, u.x0, u.x1 - side)), y = Math.round(clamp(dcy - side / 2, u.y0, u.y1 - side));
  if (x === item.crop.x && y === item.crop.y && side === item.crop.side) return null;
  return { x, y, side, flip: item.crop.flip, salt: item.crop.salt };
}

module.exports = { ROOT, SRC, CANDIDATES, DECO, DECO_MAX_SIDE, PETAL_SHEETS, PETAL_SIZE, COVER_PX, listEntities, planCovers, rerollCrop, recentreCrop, usable, Flora, Catalog };
