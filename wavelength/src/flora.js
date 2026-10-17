/* flora.js — window.Flora: the botanical decorations of the chrome (IMAGERY.md section 3, DESIGN.md section 5).
 * Every flower is a real raster image now: sprite() / draw() compose the keyed decoration bitmaps that
 * src/imagery.js (window.Imagery) lists, petals() animates the petal cut-outs, and the runtime media filter makes
 * them monochrome. Nothing here draws a flower on a canvas any more; the only canvas art left is the 13x12 pixel
 * blossom ('mark'). Pure and seeded where it chooses: the same arguments always pick the same bitmap, flip and scale
 * (FNV-1a + mulberry32, as data.js).
 * No DOM access at evaluation time; every drawing entry point returns '' / does nothing without a document.
 */
(function (G) {
  'use strict';

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---------------------------------------------------------------------------------------------- seeded randomness
  function hash(str) {
    str = String(str);
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {   // mulberry32 over FNV-1a of String(seed)
    let a = hash(String(seed));
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hasDom() { return typeof document !== 'undefined' && !!document && typeof document.createElement === 'function'; }
  function hasImage() { return hasDom() && typeof Image === 'function'; }

  // ---------------------------------------------------------------------------------------------- species (table 5.3)
  const SPECIES = {};
  [
    ['sakura', 'sakura', 'Prunus serrulata', 'pop', 'woody', 'serrate', '5 notched petals, stamen burst'],
    ['chrysanthemum', 'kiku', 'Chrysanthemum morifolium', 'hiphop', 'stalks', 'lobed', '4 rings of narrow rays (24/20/16/11)'],
    ['rose', 'rose', 'Rosa chinensis', 'rock', 'stalks', 'serrate', '2 guard rings + a 2.4-turn spiral centre'],
    ['wisteria', 'wisteria', 'Wisteria floribunda', 'indie', 'hanging', 'pinnate', 'racemes of paired pea-flowers shrinking to the tip'],
    ['moonflower', 'moonflower', 'Ipomoea alba', 'electronic', 'vine', 'heart', 'pentagonal trumpet with star folds, heart leaves, tendrils'],
    ['camellia', 'camellia', 'Camellia japonica', 'lofi', 'woody', 'round', '4 spiralled rings of round petals, dotted boss'],
    ['magnolia', 'star magnolia', 'Magnolia stellata', 'jazz', 'woody', 'lance', '2 rings of strap petals, cone'],
    ['lily', 'lily', 'Lilium longiflorum', 'classical', 'stalks', 'blade', '6 tepals with veins and spots, long stamens'],
    ['lotus', 'lotus', 'Nelumbo nucifera', 'ambient', 'pad', 'pad', 'side view of 3 lance rings over a round pad'],
    ['peony', 'peony', 'Paeonia lactiflora', 'rnb', 'woody', 'lobed', '4 rings of ruffled petals (9/8/7/5)'],
    ['daisy', 'daisy', 'Leucanthemum vulgare', 'folk', 'stalks', 'lance', '2 rings of 18 rays, seeded disc'],
    ['hibiscus', 'hibiscus', 'Hibiscus rosa-sinensis', 'latin', 'woody', 'serrate', '5 veined ruffles, staminal column'],
    ['sunflower', 'sunflower', 'Helianthus annuus', 'funk', 'stalks', 'heart', '2 rings + a phyllotaxis disc'],
    ['thistle', 'thistle', 'Cirsium vulgare', 'metal', 'stalks', 'spiny', 'bract globe + brush, spiny leaves'],
    ['iris', 'iris', 'Iris germanica', 'ge_newreleases', 'stalks', 'blade', '3 standards and 3 bearded falls'],
    ['dandelion', 'dandelion', 'Taraxacum officinale', 'ge_charts', 'stalks', 'toothed', 'seed head with pappus rays'],
    ['ume', 'ume', 'Prunus mume', null, 'woody', 'lance', '5 round petals, long stamens'],
    ['hydrangea', 'hydrangea', 'Hydrangea macrophylla', null, 'cluster', 'serrate', 'dome of 22-30 four-petal florets'],
    ['cosmos', 'cosmos', 'Cosmos bipinnatus', null, 'stalks', 'pinnate', '8 three-toothed petals, dotted disc'],
  ].forEach((r) => { SPECIES[r[0]] = Object.freeze({ key: r[0], label: r[1], latin: r[2], genre: r[3], form: r[4], leaf: r[5], note: r[6] }); });
  const KEYS = Object.keys(SPECIES);
  const GENRE_SPECIES = {
    pop: 'sakura', hiphop: 'chrysanthemum', rock: 'rose', indie: 'wisteria', electronic: 'moonflower', lofi: 'camellia',
    jazz: 'magnolia', classical: 'lily', ambient: 'lotus', rnb: 'peony', folk: 'daisy', latin: 'hibiscus', funk: 'sunflower',
    metal: 'thistle', newreleases: 'iris', charts: 'dandelion',
  };
  // companion species: a decoration tagged with one of these stands in for a species that has no art of its own
  const ALT = { sakura: 'ume', ume: 'sakura', peony: 'camellia', camellia: 'peony', chrysanthemum: 'daisy', daisy: 'cosmos', cosmos: 'daisy', rose: 'peony', wisteria: 'sakura', moonflower: 'ume', magnolia: 'sakura', lily: 'iris', lotus: 'lily', hibiscus: 'camellia', sunflower: 'daisy', thistle: 'dandelion', iris: 'lily', dandelion: 'daisy', hydrangea: 'camellia' };

  function speciesFor(x) {
    const viaKey = (k) => {
      if (k == null) return null;
      const s = String(k).replace(/^ge_/, '');
      if (GENRE_SPECIES[s]) return GENRE_SPECIES[s];
      if (SPECIES[s]) return s;
      return null;
    };
    if (x == null) return 'sakura';
    if (typeof x === 'object') {
      const viaArr = Array.isArray(x.genreIds) && x.genreIds.length ? viaKey(x.genreIds[0]) : null;
      return viaKey(x.styleKey) || (/^ge_/.test(String(x.id || '')) ? viaKey(x.id) : null) || viaKey(x.genreId) || viaArr ||
        KEYS[hash(x.id != null ? x.id : (x.name || 'flora')) % KEYS.length];
    }
    return viaKey(x) || KEYS[hash(x) % KEYS.length];
  }
  function normSpecies(sp, fallback) {
    const arr = (Array.isArray(sp) ? sp : [sp]).filter((k) => typeof k === 'string' && SPECIES[k]);
    return arr.length ? arr : [fallback || 'sakura'];
  }

  // ---------------------------------------------------------------------------------------------- the manifest (window.Imagery)
  // Read at call time, never at evaluation time: imagery.js is loaded before this file, Node has none.
  function manifest() {
    const M = typeof window !== 'undefined' ? window.Imagery : (typeof globalThis !== 'undefined' ? globalThis.Imagery : null);
    return M && typeof M === 'object' && (Array.isArray(M.deco) || Array.isArray(M.petals)) ? M : null;
  }
  const SIDES = ['left', 'right', 'top', 'bottom', 'topleft', 'topright', 'bottomleft', 'bottomright', 'center'];
  const DECO_KINDS = { branch: 1, sprig: 1, spray: 1, bud: 1, twig: 1, seedling: 1 };
  // bitmap records: { entry, src, w, h, kind, species[], stem, img, state (0 idle, 1 loading, 2 loaded, 3 failed),
  // waiters[] (draw() calls to repeat when it lands), run, bulk (started by the background preload) }
  //
  // Loading is in two parts so the decorations never compete with the page's own bytes or the first viewport's
  // covers (1.8 MB of PNG used to start while the inline page was still streaming, moving the first render by
  // seconds on ordinary mobile links):
  //   1. on demand: sprite() / draw() start just the bitmap they picked (pickEntry needs only the manifest, so the
  //      choice is the same whatever has loaded), and Flora.onLoaded listeners fire as each bitmap lands, so the app
  //      paints a waiting flower within that one file's download;
  //   2. in the background: after the window's load event, in idle time (at the latest BULK_FALLBACK_MS after
  //      evaluation), the rest is fetched two at a time at low priority. Flora.ready resolves when every bitmap has
  //      loaded or failed, as before; the petal cut-outs are started by petals() (they are data URLs in the manifest).
  let loadedFrom = null;   // the manifest object the records below came from
  let decoList = [], petalList = [];
  let readyState = 0;      // 0 not started, 1 loading, 2 every bitmap loaded or failed
  let loadRun = 0;         // which load() run the records belong to (a replaced manifest starts a new one)
  let left = 0;            // records of the current run still to settle
  let resolveReady = null;
  const ready = new Promise((res) => { resolveReady = res; });
  const readyFns = [], loadedFns = [];
  let bulkState = 0;       // 0 not scheduled, 1 waiting for the window's load event + idle time, 2 started
  let bulkTimer = 0, bulkInFlight = 0;
  const BULK_PARALLEL = 2, BULK_FALLBACK_MS = 10000;
  function record(e, i, run) {
    if (!e || typeof e !== 'object' || typeof e.src !== 'string' || !e.src) return null;
    const sp = normSpeciesList(e.species);
    const inline = typeof e.data === 'string' && /^data:image\//.test(e.data) ? e.data : '';   // petals: no request at all
    return {
      entry: e, id: typeof e.id === 'string' ? e.id : ('deco-' + i), src: inline || e.src, w: +e.w > 0 ? +e.w : 0, h: +e.h > 0 ? +e.h : 0,
      kind: DECO_KINDS[e.kind] ? e.kind : 'sprig', species: sp, stem: SIDES.indexOf(e.stem) >= 0 ? e.stem : 'center',
      img: null, state: 0, waiters: [], run: run, bulk: false,
    };
  }
  function normSpeciesList(sp) {
    if (sp == null) return [];
    return (Array.isArray(sp) ? sp : [sp]).filter((k) => typeof k === 'string' && SPECIES[k]);
  }
  function finishReady() {
    readyState = 2;
    try { resolveReady(); } catch (e) { /* ignore */ }
    const fns = readyFns.splice(0, readyFns.length);
    fns.forEach((fn) => { try { fn(); } catch (e) { /* a listener's error never stops the others */ } });
  }
  // one bitmap of the current run landed or failed: its waiters, the per-bitmap listeners, the preload queue, ready
  function settle(r) {
    if (r.run !== loadRun) return;
    const w = r.waiters.splice(0, r.waiters.length);
    w.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
    loadedFns.slice().forEach((fn) => { try { fn(r.id, r.state === 2); } catch (e) { /* ignore */ } });
    if (r.bulk) { bulkInFlight--; if (bulkState === 2) bulkNext(); }
    if (--left === 0 && readyState === 1) finishReady();
  }
  // start one bitmap now (idempotent); `low` marks a background preload (fetch priority low), otherwise the bitmap
  // is wanted on screen now and goes ahead of the covers (priority high: a detached Image would queue behind them)
  function ensure(r, low) {
    if (!r || r.state !== 0) return;
    let img = null;
    r.bulk = !!low;
    try {
      img = new Image();
      img.decoding = 'async';
      try { img.fetchPriority = low ? 'low' : 'high'; } catch (e) { /* ignore */ }
      img.onload = () => { r.state = 2; if (!r.w || !r.h) { r.w = img.naturalWidth; r.h = img.naturalHeight; } settle(r); };
      img.onerror = () => { r.state = 3; settle(r); };
      r.img = img; r.state = 1;
      img.src = r.src;
    } catch (e) { r.state = 3; settle(r); }
  }
  // the background preload: the next idle records, BULK_PARALLEL at a time
  function bulkNext() {
    while (bulkInFlight < BULK_PARALLEL) {
      const r = decoList.find((x) => x.state === 0) || petalList.find((x) => x.state === 0);
      if (!r) return;
      bulkInFlight++;
      ensure(r, true);
    }
  }
  function startBulk() {
    if (bulkState === 2) return;
    bulkState = 2;
    if (bulkTimer) { clearTimeout(bulkTimer); bulkTimer = 0; }
    bulkNext();
  }
  // after the window's load event (or at once when it has fired), in idle time; a stalled page starts it anyway
  // after BULK_FALLBACK_MS so Flora.ready always settles
  function scheduleBulk() {
    if (bulkState) return;
    bulkState = 1;
    const win = typeof window !== 'undefined' ? window : null;
    const doc = typeof document !== 'undefined' ? document : null;
    const idle = () => {
      if (bulkState === 2) return;
      if (win && typeof win.requestIdleCallback === 'function') { try { win.requestIdleCallback(startBulk, { timeout: 1500 }); return; } catch (e) { /* fall through */ } }
      setTimeout(startBulk, 500);
    };
    if (doc && doc.readyState === 'complete') idle();
    else if (win && typeof win.addEventListener === 'function') {
      try { win.addEventListener('load', idle, { once: true }); } catch (e) { win.addEventListener('load', idle); }
      bulkTimer = setTimeout(startBulk, BULK_FALLBACK_MS);
    } else setTimeout(startBulk, 500);
  }
  // Parse the manifest into records (idempotent per manifest object) and schedule the background preload; no request
  // starts here. Without a document or a manifest it is ready at once.
  function load() {
    const M = manifest();
    if (readyState && loadedFrom === M) return;
    if (readyState === 2 && !M) return;
    loadedFrom = M;
    readyState = 1;
    decoList = []; petalList = [];
    const run = ++loadRun;
    bulkInFlight = 0;
    if (!M || !hasImage()) { finishReady(); return; }
    (M.deco || []).forEach((e, i) => { const r = record(e, i, run); if (r) decoList.push(r); });
    (M.petals || []).forEach((e, i) => { const r = record(e, i, run); if (r) petalList.push(r); });
    left = decoList.length + petalList.length;
    if (!left) { finishReady(); return; }
    if (bulkState === 2) bulkNext(); else scheduleBulk();
  }
  // Flora.preload(): start the background preload now (tests, or a caller that knows the page is idle)
  function preload() { load(); if (readyState === 1) startBulk(); }
  function onReady(fn) {
    if (typeof fn !== 'function') return;
    load();
    if (readyState === 2) { try { fn(); } catch (e) { /* ignore */ } } else readyFns.push(fn);
  }
  // Flora.onLoaded(fn): fn(id, ok) after each bitmap lands or fails (the app repaints the flowers that were waiting);
  // returns a function that removes the listener
  function onLoaded(fn) {
    if (typeof fn !== 'function') return function () {};
    load();
    loadedFns.push(fn);
    return function () { const i = loadedFns.indexOf(fn); if (i >= 0) loadedFns.splice(i, 1); };
  }
  // read the manifest right after the page's scripts have run (nothing touches the DOM at evaluation time)
  if (typeof setTimeout === 'function') setTimeout(() => { try { load(); } catch (e) { /* ignore */ } }, 0);

  // ---------------------------------------------------------------------------------------------- sprites
  const INK = Object.freeze({ fill: '#ffffff', sep: '#000000', cut: true, lw: 1, dot: '#000000', center: '#ffffff', leaf: '#ffffff', leaf2: '#ffffff', stem: '#ffffff', bud: '#ffffff', petal: '#ffffff' });
  const HOME_SEED = 'home-20';   // the Home readout branch's seed (picks its bitmap, flip and scale)
  const KIND_ANCHOR = { branch: 'center', sprig: 'bottomleft', spray: 'bottomleft', bud: 'bottom', twig: 'center', seedling: 'bottom', tile: 'bottomright', specimen: 'center', mark: 'center' };
  const KIND_SPECIES = { branch: ['peony', 'sakura', 'ume'], sprig: ['sakura'], spray: ['sakura'], bud: ['sakura'], twig: ['ume'], seedling: ['sakura'], tile: ['sakura'], specimen: ['sakura'] };
  // which decoration kinds may stand in for a requested kind, in order (tile and specimen have no art of their own)
  const KIND_FALLBACK = {
    branch: ['branch', 'sprig', 'spray'], sprig: ['sprig', 'spray', 'branch'], spray: ['spray', 'sprig', 'branch'],
    bud: ['bud', 'twig', 'seedling', 'sprig'], twig: ['twig', 'bud', 'seedling', 'sprig'], seedling: ['seedling', 'bud', 'twig', 'sprig'],
    tile: ['sprig', 'spray', 'branch'], specimen: ['sprig', 'spray', 'branch'],
  };
  function deviceRatio() { return Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1); }
  function normSpriteOpts(opts) {
    const o = opts || {};
    const kind = KIND_ANCHOR[o.kind] ? o.kind : 'sprig';
    const n = {
      kind: kind,
      w: clamp(Math.round(+o.w || 120), 1, 2048),
      h: clamp(Math.round(+o.h || 120), 1, 2048),
      seed: o.seed == null ? (kind === 'branch' ? HOME_SEED : kind) : String(o.seed),
      species: kind === 'mark' ? [] : normSpecies(o.species, KIND_SPECIES[kind][0]),
      anchor: typeof o.anchor === 'string' ? o.anchor : KIND_ANCHOR[kind],
      angle: o.angle == null || !isFinite(+o.angle) ? null : Math.round(+o.angle * 1e4) / 1e4,
      dpr: o.dpr != null && isFinite(+o.dpr) ? clamp(+o.dpr, 0.5, 4) : deviceRatio(),
    };
    if (kind !== 'mark' && o.species == null) n.species = KIND_SPECIES[kind].slice();
    return n;
  }
  const sideH = (s) => (/left/.test(s) ? 'left' : /right/.test(s) ? 'right' : '');
  const sideV = (s) => (/top/.test(s) ? 'top' : /bottom/.test(s) ? 'bottom' : '');
  // Choose the decoration for a normalised request: by kind (with the fallback chain), then the best species match
  // (the first requested species, any requested species, a companion species, anything), preferring entries whose stem
  // sits on the anchor's side of the box; among equals the seed decides. Failed bitmaps are skipped.
  function pickEntry(n) {
    const chain = KIND_FALLBACK[n.kind] || [n.kind];
    let pool = [];
    for (let i = 0; i < chain.length && !pool.length; i++) pool = decoList.filter((r) => r.kind === chain[i] && r.state !== 3);
    if (!pool.length) pool = decoList.filter((r) => r.state !== 3);
    if (!pool.length) return null;
    const want = n.species, alts = want.map((k) => ALT[k]).filter(Boolean);
    const score = (r) => {
      if (!r.species.length) return 1;
      if (r.species.indexOf(want[0]) >= 0) return 4;
      if (want.some((k) => r.species.indexOf(k) >= 0)) return 3;
      if (alts.some((k) => r.species.indexOf(k) >= 0)) return 2;
      return 0;
    };
    const best = pool.reduce((m, r) => Math.max(m, score(r)), 0);
    let list = pool.filter((r) => score(r) === best);
    // stem side vs anchor side: the same vertical side first, then stems without one, then the opposite (flipped)
    const av = sideV(n.anchor);
    const fit = (r) => { const sv = sideV(r.stem); return !av || !sv ? 1 : av === sv ? 2 : 0; };
    const bestFit = list.reduce((m, r) => Math.max(m, fit(r)), 0);
    list = list.filter((r) => fit(r) === bestFit);
    const R = rng('pick:' + n.kind + ':' + n.seed);
    const r = list[Math.floor(R() * list.length) % list.length];
    const sh = sideH(r.stem), ah = sideH(n.anchor), sv = sideV(r.stem);
    return { rec: r, flipX: !!(sh && ah && sh !== ah), flipY: !!(sv && av && sv !== av), scale: n.kind === 'branch' || n.kind === 'mark' ? 1 : 0.9 + R() * 0.1 };
  }
  // the 13x12 pixel blossom, as large as whole device pixels allow (pixel art, not a flower drawing)
  function renderMark(c, n) {
    const W = Math.round(n.w * n.dpr), H = Math.round(n.h * n.dpr), cell = Math.max(1, Math.floor(Math.min(W / 13, H / 12)));
    const x0 = Math.floor((W - 13 * cell) / 2), y0 = Math.floor((H - 12 * cell) / 2);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#ffffff';
    BLOSSOM.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') c.fillRect(x0 + i * cell, y0 + j * cell, cell, cell); });
  }
  // compose one decoration into a w x h CSS px box (object-fit: contain, placed by the anchor, flipped when the stem
  // sits on the other side, slightly scaled by the seed)
  function renderDeco(c, n, p) {
    const r = p.rec, iw = r.w || (r.img && r.img.naturalWidth) || 1, ih = r.h || (r.img && r.img.naturalHeight) || 1;
    const k = Math.min(n.w / iw, n.h / ih) * p.scale, dw = iw * k, dh = ih * k;
    let ox = (n.w - dw) / 2, oy = (n.h - dh) / 2;
    if (/bottom/.test(n.anchor)) oy = n.h - dh;
    if (/top/.test(n.anchor)) oy = 0;
    if (/left/.test(n.anchor)) ox = 0;
    if (/right/.test(n.anchor)) ox = n.w - dw;
    c.setTransform(n.dpr, 0, 0, n.dpr, 0, 0);
    c.clearRect(0, 0, n.w, n.h);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.imageSmoothingEnabled = true;
    try { c.imageSmoothingQuality = 'high'; } catch (e) { /* ignore */ }
    c.save();
    c.translate(ox + (p.flipX ? dw : 0), oy + (p.flipY ? dh : 0));
    c.scale(p.flipX ? -1 : 1, p.flipY ? -1 : 1);
    c.drawImage(r.img, 0, 0, dw, dh);
    c.restore();
  }
  const spriteCache = new Map();
  let scratch = null, tainted = false;
  function cachePut(key, url) {
    spriteCache.set(key, url);
    while (spriteCache.size > 96) spriteCache.delete(spriteCache.keys().next().value);
  }
  // Flora.sprite(opts): a cached PNG data URL of the composed decoration; '' before its bitmap has loaded (that one
  // bitmap starts loading; ask again on Flora.onLoaded / onReady) and '' when nothing can be shown (no manifest,
  // every bitmap failed), which the app treats as "no flower".
  function sprite(opts) {
    if (!hasDom()) return '';
    const n = normSpriteOpts(opts), key = JSON.stringify(n);
    if (spriteCache.has(key)) { const hit = spriteCache.get(key); spriteCache.delete(key); spriteCache.set(key, hit); return hit; }
    load();
    let url = '';
    try {
      if (!scratch) scratch = document.createElement('canvas');
      scratch.width = Math.max(1, Math.round(n.w * n.dpr)); scratch.height = Math.max(1, Math.round(n.h * n.dpr));
      const c = scratch.getContext('2d', { willReadFrequently: true });   // read back by toDataURL: keep it off the GPU
      if (!c) return '';
      if (n.kind === 'mark') { renderMark(c, n); url = scratch.toDataURL('image/png'); cachePut(key, url); return url; }
      const p = pickEntry(n);
      if (!p) { if (readyState === 2) cachePut(key, ''); return ''; }   // nothing to show: cached once loading is over
      if (p.rec.state !== 2) { ensure(p.rec, false); return ''; }       // its bitmap loads now: ask again on Flora.onLoaded
      if (tainted) { url = p.rec.src; cachePut(key, url); return url; }
      renderDeco(c, n, p);
      try { url = scratch.toDataURL('image/png'); }
      catch (e) { tainted = true; url = p.rec.src; }   // file:// taints the canvas: the raw decoration file still shows
    } catch (e) { url = ''; }
    cachePut(key, url);
    return url;
  }
  // Flora.prefetch(opts): start loading the bitmap sprite(opts) will use, without composing anything (the app calls
  // it for the flowers of a fresh render before it sets the covers' src, so the one or two files the first paint
  // needs are first in the network queue instead of behind the covers). True when that bitmap has already loaded.
  function prefetch(opts) {
    if (!hasDom()) return false;
    try {
      const n = normSpriteOpts(opts);
      if (n.kind === 'mark') return true;
      load();
      const p = pickEntry(n);
      if (!p) return false;
      if (p.rec.state === 0) ensure(p.rec, false);
      return p.rec.state === 2;
    } catch (e) { return false; }
  }
  // Flora.draw(canvas, opts): the same composition into a given canvas (resized to w x h x dpr, CSS size set); when
  // the bitmap is still loading the canvas is painted as soon as it arrives.
  function draw(canvas, opts) {
    if (!hasDom() || !canvas || typeof canvas.getContext !== 'function') return canvas;
    const n = normSpriteOpts(opts);
    canvas.width = Math.max(1, Math.round(n.w * n.dpr)); canvas.height = Math.max(1, Math.round(n.h * n.dpr));
    if (canvas.style) { canvas.style.width = n.w + 'px'; canvas.style.height = n.h + 'px'; }
    const c = canvas.getContext('2d');
    if (!c) return canvas;
    try {
      if (n.kind === 'mark') { renderMark(c, n); return canvas; }
      load();
      const p = pickEntry(n);
      if (!p) { if (readyState !== 2) onReady(() => draw(canvas, opts)); return canvas; }
      if (p.rec.state !== 2) { ensure(p.rec, false); p.rec.waiters.push(() => draw(canvas, opts)); return canvas; }
      renderDeco(c, n, p);
    } catch (e) { /* leave the canvas blank */ }
    return canvas;
  }

  // ---------------------------------------------------------------------------------------------- falling petals (5.7)
  // The petal cut-outs drift down the page; fill '#fff' shows them as cut, any other fill (the app passes '#000'
  // under invert) draws them as flat silhouettes of that colour (source-in on a per-colour copy).
  const TAU = Math.PI * 2;
  const silhouettes = new Map();   // fill -> [canvas per petal bitmap]
  function silhouetteOf(fill, i) {
    let list = silhouettes.get(fill);
    if (!list) { list = []; silhouettes.set(fill, list); }
    if (list[i] !== undefined) return list[i];
    const r = petalList[i];
    let cv = null;
    try {
      cv = document.createElement('canvas');
      cv.width = Math.max(1, r.w || r.img.naturalWidth); cv.height = Math.max(1, r.h || r.img.naturalHeight);
      const c = cv.getContext('2d');
      c.drawImage(r.img, 0, 0, cv.width, cv.height);
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = fill; c.fillRect(0, 0, cv.width, cv.height);
    } catch (e) { cv = null; }
    list[i] = cv;
    return cv;
  }
  function petals(canvas, opts) {
    opts = opts || {};
    let count = Math.max(0, Math.round(opts.count == null ? 14 : +opts.count) || 0);
    let fill = opts.fill || '#fff';
    const R = rng(opts.seed || 'petals');
    let frames = 0, running = false, raf = 0, last = 0, W = 0, H = 0, dpr = 1, resizeT = 0, hiddenT = 0, sinceCheck = 0, destroyed = false;
    const list = [];
    const api = {
      start: function () {}, stop: function () {}, setCount: function () {}, setFill: function () {}, destroy: function () {},
      get running() { return running; }, get frames() { return frames; },
    };
    if (!hasDom() || !canvas || typeof canvas.getContext !== 'function') return api;
    const ctx = canvas.getContext('2d');
    if (!ctx) return api;
    load();
    petalList.forEach((r) => ensure(r, false));   // the cut-outs are needed now (inline data URLs: no request)
    const win = typeof window !== 'undefined' ? window : null;
    const raff = (f) => (win && win.requestAnimationFrame ? win.requestAnimationFrame(f) : setTimeout(() => f(Date.now()), 16));
    const caf = (id) => (win && win.cancelAnimationFrame ? win.cancelAnimationFrame(id) : clearTimeout(id));
    const isPlain = () => /^#(fff|ffffff)$/i.test(fill) || /^white$/i.test(fill);   // '#fff': the cut-outs as they are
    function size() {
      dpr = Math.min(1.5, (win && win.devicePixelRatio) || 1);
      W = canvas.clientWidth || (win && win.innerWidth) || 800;
      H = canvas.clientHeight || (win && win.innerHeight) || 600;
      canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr));
    }
    function spawn(p, top) {
      p.len = 10 + R() * 6;   // 10-16 px: large enough that the cut-out reads as a petal, not a speck
      p.bi = Math.floor(R() * 1024);   // which cut-out (modulo the bitmaps that loaded)
      p.x = R() * (W + 160) - 20; p.y = top ? -12 - R() * 60 : R() * H;
      p.vy = 12 + R() * 16; p.vx = -(4 + R() * 8);
      p.amp = 10 + R() * 20; p.per = 3 + R() * 3; p.ph = R() * TAU;
      p.rot = R() * TAU; p.vr = (0.2 + R() * 0.4) * (R() < 0.5 ? -1 : 1);
      p.tum = R() * TAU; p.vt = 1.2 + R() * 1.8; p.t = 0;
      // gentle, capped at .45 (DESIGN 5.7: a petal passing behind text never hides it); the few largest a little brighter
      p.alpha = Math.min(0.45, p.len > 14.5 ? 0.38 + R() * 0.07 : 0.3 + R() * 0.15);
      return p;
    }
    function fit(n) {
      while (list.length < n) list.push(spawn({}, false));
      list.length = n;
    }
    function visible() { return !(typeof document !== 'undefined' && document.hidden); }
    function displayed() { try { return canvas.getClientRects().length > 0; } catch (e) { return true; } }
    let loaded = [];   // indexes of the petal bitmaps that are ready
    function frame(now) {
      raf = 0;
      if (!running) return;
      if (!visible()) return;   // resumed by visibilitychange
      if (++sinceCheck >= 30) {
        sinceCheck = 0;
        if (!displayed()) { clearTimeout(hiddenT); hiddenT = setTimeout(() => { if (running && !raf) { last = 0; raf = raff(frame); } }, 1000); return; }
      }
      const dt = last ? Math.min(0.05, Math.max(0, (now - last) / 1000)) : 0.016;
      last = now;
      if (loaded.length !== petalList.filter((r) => r.state === 2).length) loaded = petalList.map((r, i) => (r.state === 2 ? i : -1)).filter((i) => i >= 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const plain = isPlain();
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        p.t += dt; p.y += p.vy * dt; p.x += p.vx * dt; p.rot += p.vr * dt; p.tum += p.vt * dt;
        if (p.y > H + 16 || p.x < -24) { spawn(p, true); continue; }
        if (!loaded.length) continue;   // cut-outs still loading: nothing to draw yet
        const bi = loaded[p.bi % loaded.length], r = petalList[bi];
        const src = plain ? r.img : silhouetteOf(fill, bi);
        if (!src) continue;
        const bw = r.w || r.img.naturalWidth || 1, bh = r.h || r.img.naturalHeight || 1, k = p.len / Math.max(bw, bh);
        const sx = p.x + Math.sin(p.t * TAU / p.per + p.ph) * p.amp;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(sx, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.max(0.25, Math.abs(Math.cos(p.tum))));
        try { ctx.drawImage(src, -bw * k / 2, -bh * k / 2, bw * k, bh * k); } catch (e) { /* a broken bitmap draws nothing */ }
        ctx.restore();
      }
      frames++;
      raf = raff(frame);
    }
    function onResize() { clearTimeout(resizeT); resizeT = setTimeout(() => { size(); }, 150); }
    function onVis() { if (running && visible() && !raf) { last = 0; raf = raff(frame); } }
    function clear() { try { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); } catch (e) { /* ignore */ } }
    size(); fit(count);
    if (win && win.addEventListener) win.addEventListener('resize', onResize);
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', onVis);
    api.start = function () {
      if (running || destroyed) return;
      running = true; last = 0; sinceCheck = 0;
      size();
      raf = raff(frame);
    };
    api.stop = function () {
      running = false;
      if (raf) caf(raf);
      raf = 0; clearTimeout(hiddenT);
      clear();
    };
    api.setCount = function (n) { count = Math.max(0, Math.round(+n) || 0); fit(count); };
    api.setFill = function (col) { if (typeof col === 'string' && col) fill = col; };
    api.destroy = function () {
      api.stop(); destroyed = true;
      if (win && win.removeEventListener) win.removeEventListener('resize', onResize);
      if (typeof document !== 'undefined' && document.removeEventListener) document.removeEventListener('visibilitychange', onVis);
    };
    return api;
  }

  // ---------------------------------------------------------------------------------------------- pixel art
  const BLOSSOM = Object.freeze([
    '.....###.....',
    '....#####....',
    '....#####....',
    '.###.###.###.',
    '.####.#.####.',
    '#####...#####',
    '.####.#.####.',
    '....#...#....',
    '..####.####..',
    '..####.####..',
    '..####.####..',
    '...###.###...',
  ]);
  function gridPath(rows) {
    let d = '';
    (rows || []).forEach((row, y) => {
      row = String(row);
      const on = (ch) => ch === '#' || ch === 'X' || ch === '1';
      let x = 0;
      while (x < row.length) {
        if (on(row[x])) { let e = x; while (e < row.length && on(row[e])) e++; d += 'M' + x + ' ' + y + 'h' + (e - x) + 'v1h-' + (e - x) + 'z'; x = e; } else x++;
      }
    });
    return d;
  }

  // ---------------------------------------------------------------------------------------------- legacy helpers
  // The procedural canvas drawing of the previous Flora (heads, leaves, buds, branches, tonal covers) is gone: these
  // names stay for callers that still guard on them, but they draw nothing (IMAGERY.md: no flower is drawn on a
  // canvas any more). paintCover only clears its square so a stale caller never shows garbage.
  const HEAD_NAMES = Object.freeze(KEYS.concat(['bud']));
  function paintCover(c, size) {
    const S = +size > 0 ? +size : 300;
    if (c && typeof c.clearRect === 'function') { try { c.clearRect(0, 0, S, S); } catch (e) { /* ignore */ } }
    return { usesText: false };
  }
  function noop() {}
  function branchStats() { return { blooms: 0, leaves: 0, buds: 0, petals: 0, maxOverlap: 0, petalsLeft: 0, scale: 1 }; }

  // ---------------------------------------------------------------------------------------------- export
  G.Flora = {
    version: 1,
    SPECIES: Object.freeze(SPECIES),
    GENRE_SPECIES: Object.freeze(GENRE_SPECIES),
    HOME_SEED: HOME_SEED,
    BLOSSOM: BLOSSOM,
    speciesFor: speciesFor,
    rng: rng,
    hash: hash,
    // legacy canvas primitives (no-ops: nothing draws a flower on a canvas any more)
    bloom: noop,
    leaf: noop,
    bud: noop,
    petal: noop,
    branch: function (ctx) { return ctx ? branchStats() : null; },
    // decorations composed from the bitmaps of window.Imagery
    sprite: sprite,
    draw: draw,
    prefetch: prefetch,
    ready: ready,
    onReady: onReady,
    onLoaded: onLoaded,
    preload: preload,
    // legacy covers (no-op; data.js serves the cover files of the manifest)
    paintCover: paintCover,
    // falling petals (the petal cut-outs)
    petals: petals,
    // pixel art
    gridPath: gridPath,
    // extras (not in the contract): the silhouette style, the head list, the sprite cache size, the bitmap inventory
    INK: INK,
    HEADS: HEAD_NAMES,
    cacheSize: function () { return spriteCache.size; },
    inventory: function () {
      return { ready: readyState === 2, bulk: bulkState, deco: decoList.map((r) => ({ id: r.id, kind: r.kind, species: r.species.slice(), stem: r.stem, w: r.w, h: r.h, state: r.state })), petals: petalList.map((r) => ({ w: r.w, h: r.h, state: r.state })) };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
