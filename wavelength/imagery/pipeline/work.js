// imagery/pipeline/work.js — the tools/cdp.js module that renders every shipped file (run through run.js).
// Decorations and petals are keyed and cut on the page; covers are planned here (assign.js) from the page's
// frame measurements and rendered on the page; the data URLs come back through c.eval and are written to src/img/.
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./assign.js');
const PNG = require('./png.js');

const IMG = path.join(A.ROOT, 'src', 'img');
const PNG_STEP = 8;   // grey/alpha quantisation step for decorations and petals
const writeGreyAlpha = (file, r) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const buf = PNG.encodeGreyAlpha(r.w, r.h, Buffer.from(r.ga, 'base64'), PNG_STEP);
  fs.writeFileSync(file, buf);
  return buf.length;
};
const writeDataUrl = (file, dataUrl) => {
  const i = dataUrl.indexOf(',');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const buf = Buffer.from(dataUrl.slice(i + 1), 'base64');
  fs.writeFileSync(file, buf);
  return buf.length;
};
const kb = (n) => Math.round(n / 1024);

module.exports = async (c) => {
  const t0 = Date.now();
  await c.goto(c.URL);
  const fonts = await c.eval('Pipeline.ready()');
  c.out('fonts', fonts);
  if (!fonts.fontOk) c.out('WARNING: DotGothic16 did not load; labels and numerals would use the fallback font');

  // a clean slate: every shipped file is regenerated
  fs.rmSync(IMG, { recursive: true, force: true });
  ['covers', 'deco', 'petals'].forEach((d) => fs.mkdirSync(path.join(IMG, d), { recursive: true }));
  const sizes = { covers: 0, deco: 0, petals: 0 };
  const manifest = { version: 1, base: 'img/', covers: {}, deco: [], petals: [] };
  const log = { deco: [], petals: [], covers: [] };

  // ---- decorations
  for (const d of A.DECO) {
    const opts = Object.assign({}, d, { source: d.source, maxSide: d.maxSide || A.DECO_MAX_SIDE });
    delete opts.id; delete opts.kind; delete opts.species; delete opts.stem;
    const r = await c.eval(`Pipeline.deco(${JSON.stringify(opts)})`);
    const file = path.join(IMG, 'deco', d.id + '.png');
    const n = writeGreyAlpha(file, r);
    sizes.deco += n;
    manifest.deco.push({ id: d.id, src: 'img/deco/' + d.id + '.png', w: r.w, h: r.h, kind: d.kind, species: d.species, stem: d.stem, source: d.source });
    log.deco.push({ id: d.id, w: r.w, h: r.h, kb: kb(n), frame: r.frame, bg: r.bg, box: r.box, comps: r.comps, kept: r.kept });
    c.out(`deco ${d.id}: ${r.w}x${r.h} ${kb(n)} KB frame=${JSON.stringify(r.frame)} bg=${r.bg} comps=${r.comps}/${r.kept}`);
  }

  // ---- petals (the files ship as before; the manifest also carries each cut-out as a data URL, so the first render
  // needs no petal requests at all: 16 files of ~700 bytes cost a round trip each on slow links)
  let pn = 0;
  for (const sheet of A.PETAL_SHEETS) {
    const list = await c.eval(`Pipeline.petals(${JSON.stringify({ source: sheet.source, minArea: sheet.minArea, max: sheet.max, size: A.PETAL_SIZE })})`);
    for (const p of list) {
      pn++;
      const file = path.join(IMG, 'petals', pn + '.png');
      const n = writeGreyAlpha(file, p);
      sizes.petals += n;
      manifest.petals.push({ src: 'img/petals/' + pn + '.png', w: p.w, h: p.h, data: 'data:image/png;base64,' + fs.readFileSync(file).toString('base64') });
      log.petals.push({ n: pn, w: p.w, h: p.h, bytes: n, source: sheet.source });
    }
    c.out(`petals from ${sheet.source}: ${list.length}`);
  }

  // ---- covers: measure every source once (frame; bright mass inside the focus for the portrait crops), plan, render
  const infos = {};
  for (const key of Object.keys(A.SRC)) {
    const s = A.SRC[key];
    infos[key] = await c.eval(`Pipeline.info(${JSON.stringify(s.file)}, true, ${JSON.stringify(s.focus || null)})`);
  }
  let plan = A.planCovers(infos);
  // portraits (artists, Liked): the bright mass inside the circle the crop will show must sit in its middle
  // (|offset| <= 0.1 r); a crop whose mass is off-centre is moved onto it and the plan is made again with that crop
  // fixed, so every later crop keeps its distance from the final one (up to four rounds)
  const overrides = {}, best = {}, settled = {};
  log.centring = [];
  for (let round = 0; round < 5; round++) {
    let moved = 0;
    for (const p of plan) {
      if (p.kind !== 'artist' && p.kind !== 'liked') continue;
      const m = await c.eval(`Pipeline.cropMass(${JSON.stringify(p.file)}, ${JSON.stringify(p.crop)})`);
      if (!m || m.n < 50) continue;
      const off = Math.hypot(m.ox, m.oy) / (p.crop.side / 2);
      p.centring = { off: +off.toFixed(2), halves: m.halves };
      if (settled[p.id]) continue;
      // a move that did not bring the mass closer is undone (the best crop so far stays) and the portrait settles
      if (best[p.id] && off >= best[p.id].off - 0.01) { overrides[p.id] = { key: p.source, crop: best[p.id].crop }; settled[p.id] = true; moved++; log.centring.push({ round, id: p.id, revert: true, off: +off.toFixed(2), to: best[p.id].crop }); continue; }
      best[p.id] = { crop: p.crop, off };
      if (off <= 0.1) { settled[p.id] = true; continue; }
      const crop = A.recentreCrop(p, infos, { ox: m.ox * 0.8, oy: m.oy * 0.8 });
      if (!crop) { settled[p.id] = true; continue; }
      overrides[p.id] = { key: p.source, crop };
      log.centring.push({ round, id: p.id, source: p.source, off: +off.toFixed(2), from: p.crop, to: crop });
      moved++;
    }
    if (!moved) break;
    plan = A.planCovers(infos, overrides);
  }
  const markPath = A.Flora.gridPath(A.Flora.BLOSSOM);
  const specOf = (p) => ({ src: p.file, crop: p.crop, size: 400, quality: 0.82, lift: p.lift, dim: p.dim, liked: !!p.liked, overlay: p.overlay, markPath });
  // readability at 48 px (library rows, track tables): a crop whose downsample is flat (std < 30) or dark (mean < 40)
  // is re-rolled up to four times (portraits, Liked, the empty mosaic and the genre tiles keep their crops)
  const flat = (s) => s.std < 30 || s.mean < 40;
  for (const p of plan) {
    let stats = await c.eval(`Pipeline.coverStats(${JSON.stringify(specOf(p))})`);
    if (flat(stats) && p.kind !== 'artist' && p.kind !== 'liked' && p.kind !== 'mosaic-empty' && p.kind !== 'genre') {
      const first = { source: p.source, crop: p.crop, stats };
      let best = { source: p.source, file: p.file, crop: p.crop, lift: p.lift, overlap: p.overlap, stats };
      for (let attempt = 1; attempt <= 4; attempt++) {
        if (!A.rerollCrop(plan, p, infos, attempt)) continue;
        stats = await c.eval(`Pipeline.coverStats(${JSON.stringify(specOf(p))})`);
        if (stats.std > best.stats.std && stats.mean >= Math.min(40, best.stats.mean)) best = { source: p.source, file: p.file, crop: p.crop, lift: p.lift, overlap: p.overlap, stats };
        if (!flat(stats)) break;
      }
      ['source', 'file', 'crop', 'lift', 'overlap'].forEach((k) => { if (best[k] === undefined) delete p[k]; else p[k] = best[k]; });
      stats = best.stats;
      log.rerolls = log.rerolls || [];
      log.rerolls.push({ id: p.id, from: first, to: { source: p.source, crop: p.crop, stats } });
      c.out(`reroll ${p.id}: ${first.source} (mean ${first.stats.mean}, std ${first.stats.std}) -> ${p.source} (mean ${stats.mean}, std ${stats.std})`);
    }
    p.stats = stats;
  }
  for (const p of plan) {
    const spec = specOf(p);
    const full = await c.eval(`Pipeline.cover(${JSON.stringify(spec)})`);
    const n = writeDataUrl(path.join(IMG, 'covers', p.id + '.jpg'), full);
    sizes.covers += n;
    const entry = { src: 'img/covers/' + p.id + '.jpg' };
    let tn = 0;
    if (p.thumb) {
      const tspec = Object.assign({}, spec, { overlay: { mark: true } });
      const thumb = await c.eval(`Pipeline.cover(${JSON.stringify(tspec)})`);
      tn = writeDataUrl(path.join(IMG, 'covers', p.id + '.thumb.jpg'), thumb);
      sizes.covers += tn;
      entry.thumb = 'img/covers/' + p.id + '.thumb.jpg';
    }
    manifest.covers[p.id] = entry;
    log.covers.push({ id: p.id, kind: p.kind, species: p.species, source: p.source, crop: p.crop, overlap: p.overlap, kin: p.kin, stats48: p.stats, centring: p.centring, kb: kb(n), thumbKb: tn ? kb(tn) : undefined });
  }
  log.mass = {};
  Object.keys(infos).forEach((k) => { if (infos[k].mass) log.mass[k] = infos[k].mass; });
  c.out(`covers: ${plan.length} (${Object.values(manifest.covers).filter((e) => e.thumb).length} thumbs)`);

  // ---- the manifest (src/imagery.js: one global, no DOM) and the plan for inspection
  const js = [
    '/* imagery.js — window.Imagery: the shipped flower imagery manifest (IMAGERY.md section 2).',
    ' * Generated by imagery/pipeline/run.js; do not edit by hand. Loaded before flora.js; attaches exactly one global',
    ' * at evaluation time and touches no DOM. Paths are relative to the page (build.js copies src/img to dist/img).',
    ' */',
    '(function (G) {',
    "  'use strict';",
    '  G.Imagery = {',
    '    version: 1,',
    "    base: 'img/',",
    '    covers: {',
    ...Object.keys(manifest.covers).map((id) => `      ${JSON.stringify(id)}: ${JSON.stringify(manifest.covers[id])},`),
    '    },',
    '    deco: [',
    ...manifest.deco.map((d) => `      ${JSON.stringify(d)},`),
    '    ],',
    '    petals: [',
    ...manifest.petals.map((p) => `      ${JSON.stringify(p)},`),
    '    ],',
    '  };',
    "})(typeof window !== 'undefined' ? window : globalThis);",
    '',
  ].join('\n');
  fs.writeFileSync(path.join(A.ROOT, 'src', 'imagery.js'), js);
  fs.writeFileSync(path.join(__dirname, 'plan.json'), JSON.stringify({ generated: new Date().toISOString(), fonts, sizes, log }, null, 1));

  const total = sizes.covers + sizes.deco + sizes.petals;
  c.out(`weight: covers ${kb(sizes.covers)} KB, deco ${kb(sizes.deco)} KB, petals ${kb(sizes.petals)} KB, total ${kb(total)} KB (${(total / 1048576).toFixed(2)} MB)`);
  c.out(`done in ${Math.round((Date.now() - t0) / 1000)} s`);
};
