/* flora.js — window.Flora: procedural botanical silhouettes and tonal flower covers (DESIGN.md section 5).
 * White silhouettes (layered petals cut by thin dark separations, tapered forking branches, leaves with veins,
 * buds, stamens, loose petals) for the chrome, tonal colour compositions for the covers, and the falling-petal layer.
 * Pure and seeded: the same arguments always give the same pixels (FNV-1a + mulberry32, as data.js).
 * No DOM access at evaluation time; every drawing entry point returns '' / does nothing without a document.
 */
(function (G) {
  'use strict';

  const TAU = Math.PI * 2, PI = Math.PI;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const angDiff = (a, b) => ((((a - b) % TAU) + TAU * 1.5) % TAU) - PI;   // signed a - b in (-PI, PI]

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
  const pick = (R, arr) => arr[Math.floor(R() * arr.length) % arr.length];
  function hasDom() { return typeof document !== 'undefined' && !!document && typeof document.createElement === 'function'; }

  // ---------------------------------------------------------------------------------------------- colour
  function hexToRgb(hex) {
    let s = String(hex || '').trim().replace('#', '');
    if (s.length === 3) s = s.replace(/./g, (ch) => ch + ch);
    if (!/^[0-9a-f]{6}$/i.test(s)) s = '777777';
    const n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    const c = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  // sRGB luma, the same weights the dither / cyano / ink filters use (they run in sRGB space)
  const lumaOf = (rgb) => (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  // a colour of hue h and saturation s whose luma is Y: every filter then sees the intended tone, whatever the hue
  function tone(h, s, Y) {
    let lo = 0, hi = 1, rgb = null;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      rgb = hslToRgb(h, s, mid);
      if (lumaOf(rgb) < Y) lo = mid; else hi = mid;
    }
    return rgbToHex.apply(null, hslToRgb(h, s, (lo + hi) / 2));
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
  }
  function rgbaOf(hex, a) { const c = hexToRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  // ---------------------------------------------------------------------------------------------- petal outlines
  // Every outline starts at the base (0,0) and reaches its tip at (0,-L); w is the half-width.
  const SHAPES = {
    round(c, L, w) {
      c.moveTo(0, 0);
      c.bezierCurveTo(-w * 1.28, -L * 0.1, -w * 1.32, -L * 0.96, 0, -L);
      c.bezierCurveTo(w * 1.32, -L * 0.96, w * 1.28, -L * 0.1, 0, 0);
    },
    notch(c, L, w) {
      c.moveTo(0, 0);
      c.bezierCurveTo(-w * 0.95, -L * 0.14, -w * 1.32, -L * 0.74, -w * 0.56, -L * 0.98);
      c.quadraticCurveTo(-w * 0.2, -L * 1.04, 0, -L * 0.85);
      c.quadraticCurveTo(w * 0.2, -L * 1.04, w * 0.56, -L * 0.98);
      c.bezierCurveTo(w * 1.32, -L * 0.74, w * 0.95, -L * 0.14, 0, 0);
    },
    pointed(c, L, w) {
      c.moveTo(0, 0);
      c.bezierCurveTo(-w * 1.32, -L * 0.3, -w * 0.86, -L * 0.78, 0, -L);
      c.bezierCurveTo(w * 0.86, -L * 0.78, w * 1.32, -L * 0.3, 0, 0);
    },
    strap(c, L, w) {
      c.moveTo(-w * 0.45, 0);
      c.lineTo(-w, -L * 0.8);
      c.quadraticCurveTo(-w, -L, 0, -L);
      c.quadraticCurveTo(w, -L, w, -L * 0.8);
      c.lineTo(w * 0.45, 0);
    },
    ray(c, L, w) {
      c.moveTo(0, 0);
      c.quadraticCurveTo(-w * 1.55, -L * 0.55, -w * 0.62, -L * 0.95);
      c.quadraticCurveTo(0, -L * 1.06, w * 0.62, -L * 0.95);
      c.quadraticCurveTo(w * 1.55, -L * 0.55, 0, 0);
    },
    spoon(c, L, w) {
      c.moveTo(-w * 0.32, 0);
      c.quadraticCurveTo(-w * 0.5, -L * 0.5, -w, -L + w);
      c.arc(0, -L + w, w, PI, 0);
      c.quadraticCurveTo(w * 0.5, -L * 0.5, w * 0.32, 0);
    },
    tooth(c, L, w) {
      c.moveTo(0, 0);
      c.bezierCurveTo(-w * 0.62, -L * 0.22, -w * 1.12, -L * 0.6, -w, -L * 0.9);
      c.lineTo(-w * 0.64, -L * 0.995); c.lineTo(-w * 0.34, -L * 0.9); c.lineTo(0, -L * 1.01);
      c.lineTo(w * 0.34, -L * 0.9); c.lineTo(w * 0.64, -L * 0.995); c.lineTo(w, -L * 0.9);
      c.bezierCurveTo(w * 1.12, -L * 0.6, w * 0.62, -L * 0.22, 0, 0);
    },
    ruffle(c, L, w, o) {
      const k = (o && o.lobes) || 4, amp = (o && o.amp) || 0.1;
      c.moveTo(0, 0);
      c.bezierCurveTo(-w * 0.7, -L * 0.12, -w * 1.08, -L * 0.42, -w * 0.92, -L * 0.62);
      for (let i = 1; i <= k; i++) {
        const t0 = PI + ((i - 1) / k) * PI, t1 = PI + (i / k) * PI, tm = (t0 + t1) / 2;
        const a = amp * (i % 2 ? 1 : 0.7);
        c.quadraticCurveTo(Math.cos(tm) * w * (0.92 + a * 1.7), -L * 0.62 + Math.sin(tm) * L * (0.38 + a * 1.3),
          Math.cos(t1) * w * 0.92, -L * 0.62 + Math.sin(t1) * L * 0.38);
      }
      c.bezierCurveTo(w * 1.08, -L * 0.42, w * 0.7, -L * 0.12, 0, 0);
    },
  };
  SHAPES.lance = SHAPES.pointed;
  SHAPES.oval = SHAPES.round;

  // ---------------------------------------------------------------------------------------------- paint helpers
  // style: { fill: colour | fn(layer, nLayers, k), sep, lw, cut, dot, center, leaf, leaf2, stem, bud, petal, leafKind }
  //   cut: true (silhouettes) draws separations and marks as transparent cuts (destination-out), so they show
  //   the page ground in every mode; false (covers) paints them in `sep` / `dot`.
  const fillOf = (st, layer, n, k) => (typeof st.fill === 'function' ? st.fill(layer, n, k) : st.fill);
  function cutOr(c, st, paint) {
    if (st.cut) {
      const g = c.globalCompositeOperation;
      c.globalCompositeOperation = 'destination-out';
      paint('#000');
      c.globalCompositeOperation = g;
    } else paint(null);
  }
  function sepLine(c, st, mul) {
    if (!(st.lw > 0)) return;
    c.lineWidth = st.lw * (mul || 1);
    cutOr(c, st, (k) => { c.strokeStyle = k || st.sep; c.stroke(); });
  }
  function markFill(c, st) { cutOr(c, st, (k) => { c.fillStyle = k || st.dot || st.sep; c.fill(); }); }
  function markStroke(c, st, w) {
    c.lineWidth = w;
    cutOr(c, st, (k) => { c.strokeStyle = k || st.dot || st.sep; c.stroke(); });
  }
  function paintPath(c, st, fill, mul) { c.fillStyle = fill; c.fill(); sepLine(c, st, mul); }
  // one petal at angle a (0 = up, clockwise), its base d from the head centre
  function pet(c, st, a, d, shape, L, w, fill, o) {
    c.save(); c.rotate(a); c.translate(0, -d);
    c.beginPath(); SHAPES[shape](c, L, w, o); c.closePath();
    c.restore();
    paintPath(c, st, fill);
  }
  // a mid-vein along a petal (dark line) from 15% to 80% of its length
  function petVein(c, st, a, d, L, bend) {
    c.save(); c.rotate(a); c.translate(0, -d);
    c.beginPath(); c.moveTo(0, -L * 0.14); c.quadraticCurveTo(L * (bend || 0.04), -L * 0.45, 0, -L * 0.8);
    c.restore();
    markStroke(c, st, st.lw * 0.8);
  }
  function circlePath(c, x, y, r) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
  // detail level: how many separation widths fit in the radius (gates stamens, seeds and veins at small sizes)
  const fineOf = (r, st) => r / Math.max(1e-6, st.lw || 1);

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
  // heads drawn side-on (their "up" follows the stem) rather than face-on with a perspective tilt
  const SIDE = { lotus: 1, iris: 1, thistle: 1, wisteria: 1, bud: 1 };
  // relative head size in mixed scenes (blossoms of fruit trees are small, peonies and hydrangeas big)
  const HEAD_SCALE = { sakura: 0.8, ume: 0.76, peony: 1.2, camellia: 1.05, hydrangea: 1.25, magnolia: 1.05, hibiscus: 1.12, sunflower: 1.15, wisteria: 0.85, dandelion: 1.05, cosmos: 0.95, daisy: 0.95 };
  // a companion species for bouquets and covers
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

  // ---------------------------------------------------------------------------------------------- flower heads
  // Each head is drawn around (0,0) with radius r. Face-on heads pick their own petal phase; side-on heads point up (-y).
  function stamens(c, st, r, n, len, R, anther) {
    const fine = fineOf(r, st);
    if (fine < 9) { c.beginPath(); circlePath(c, 0, 0, r * 0.1); markFill(c, st); return; }
    if (fine < 18) n = Math.ceil(n * 0.55);
    const tips = [];
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = i * TAU / n + (R() - 0.5) * 0.36, l = r * len * (0.68 + R() * 0.46);
      c.moveTo(Math.cos(a) * r * 0.06, Math.sin(a) * r * 0.06);
      const x = Math.cos(a) * l, y = Math.sin(a) * l;
      c.lineTo(x, y); tips.push(x, y);
    }
    markStroke(c, st, st.lw * 0.72);
    c.beginPath();
    const ar = r * (anther || 0.034);
    for (let i = 0; i < tips.length; i += 2) circlePath(c, tips[i], tips[i + 1], ar);
    circlePath(c, 0, 0, r * 0.075);
    markFill(c, st);
  }
  function seedDisc(c, st, rr, n, dr) {
    c.beginPath();
    for (let k = 1; k < n; k++) { const q = rr * Math.sqrt(k / n), a = k * 2.39996; circlePath(c, Math.cos(a) * q, Math.sin(a) * q, dr); }
    markFill(c, st);
  }

  const HEADS = {
    sakura(c, r, st, R) {
      const a0 = R() * TAU;
      for (let i = 0; i < 5; i++) pet(c, st, a0 + i * TAU / 5 + (R() - 0.5) * 0.16, r * 0.03, 'notch', r * (0.92 + R() * 0.1), r * 0.45, fillOf(st, 0, 1, i));
      if (fineOf(r, st) > 22) for (let i = 0; i < 5; i++) petVein(c, st, a0 + i * TAU / 5, r * 0.03, r * 0.5, 0);
      stamens(c, st, r, 16, 0.42, R);
    },
    ume(c, r, st, R) {
      const a0 = R() * TAU;
      for (let i = 0; i < 5; i++) pet(c, st, a0 + i * TAU / 5 + (R() - 0.5) * 0.12, r * 0.02, 'round', r * (0.92 + R() * 0.08), r * 0.5, fillOf(st, 0, 1, i));
      stamens(c, st, r, 24, 0.6, R, 0.03);
    },
    peony(c, r, st, R) {
      const rings = [[9, 1, 0.5], [8, 0.8, 0.5], [7, 0.62, 0.48], [5, 0.42, 0.52]];
      const fine = fineOf(r, st);
      rings.forEach((g, li) => {
        if (fine < 10 && li === 2) return;
        const a0 = R() * TAU, n = g[0];
        for (let i = 0; i < n; i++) {
          pet(c, st, a0 + i * TAU / n + (R() - 0.5) * 0.3, r * 0.03 * li, 'ruffle', r * g[1] * (0.9 + R() * 0.15), r * g[1] * g[2], fillOf(st, li, 4, i), { lobes: 3 + (i % 3), amp: 0.13 });
        }
      });
      if (fine > 14) for (let i = 0; i < 4; i++) pet(c, st, R() * TAU, 0, 'ruffle', r * 0.2, r * 0.13, fillOf(st, 3, 4, i), { lobes: 3, amp: 0.2 });
    },
    camellia(c, r, st, R) {
      let a0 = R() * TAU;
      [[7, 1, 0.56], [6, 0.78, 0.56], [6, 0.58, 0.56], [4, 0.38, 0.6]].forEach((g, li) => {
        a0 += 0.55;
        for (let i = 0; i < g[0]; i++) pet(c, st, a0 + i * TAU / g[0] + (R() - 0.5) * 0.1, 0, 'round', r * g[1], r * g[1] * g[2], fillOf(st, li, 4, i));
      });
      c.beginPath(); circlePath(c, 0, 0, r * 0.15); paintPath(c, st, st.center || fillOf(st, 0, 1, 0));
      if (fineOf(r, st) > 14) {
        c.beginPath();
        for (let i = 0; i < 12; i++) { const a = i * TAU / 12; circlePath(c, Math.cos(a) * r * 0.1, Math.sin(a) * r * 0.1, r * 0.022); }
        circlePath(c, 0, 0, r * 0.035);
        markFill(c, st);
      }
    },
    chrysanthemum(c, r, st, R) {
      const fine = fineOf(r, st);
      const rings = fine < 12 ? [[16, 1, 0.1, 'ray'], [12, 0.74, 0.12, 'ray'], [8, 0.48, 0.14, 'spoon']]
        : [[24, 1, 0.082, 'ray'], [20, 0.82, 0.088, 'ray'], [16, 0.64, 0.094, 'spoon'], [11, 0.46, 0.1, 'spoon']];
      rings.forEach((g, li) => {
        const a0 = R() * TAU;
        for (let i = 0; i < g[0]; i++) pet(c, st, a0 + i * TAU / g[0] + (R() - 0.5) * 0.07, 0, g[3], r * g[1] * (0.94 + R() * 0.1), r * g[2], fillOf(st, li, rings.length, i));
      });
      if (fine > 12) { for (let i = 0; i < 6; i++) pet(c, st, i * TAU / 6 + R(), 0, 'spoon', r * 0.24, r * 0.08, fillOf(st, 3, 4, i)); }
    },
    cosmos(c, r, st, R) {
      const a0 = R() * TAU;
      for (let i = 0; i < 8; i++) pet(c, st, a0 + i * TAU / 8 + (R() - 0.5) * 0.08, r * 0.08, 'tooth', r * (0.88 + R() * 0.1), r * 0.3, fillOf(st, 0, 1, i));
      if (fineOf(r, st) > 18) for (let i = 0; i < 8; i++) petVein(c, st, a0 + i * TAU / 8, r * 0.08, r * 0.62, 0.02);
      c.beginPath(); circlePath(c, 0, 0, r * 0.19); paintPath(c, st, st.center || fillOf(st, 1, 2, 0));
      if (fineOf(r, st) > 12) seedDisc(c, st, r * 0.16, 26, r * 0.022);
    },
    magnolia(c, r, st, R) {
      const a0 = R() * TAU;
      for (let i = 0; i < 10; i++) pet(c, st, a0 + i * TAU / 10 + (R() - 0.5) * 0.18, r * 0.06, 'strap', r * (0.84 + R() * 0.16), r * 0.12, fillOf(st, 0, 2, i));
      for (let i = 0; i < 7; i++) pet(c, st, a0 + (i + 0.5) * TAU / 7 + (R() - 0.5) * 0.2, r * 0.05, 'strap', r * (0.62 + R() * 0.1), r * 0.14, fillOf(st, 1, 2, i));
      c.beginPath(); c.ellipse(0, 0, r * 0.1, r * 0.14, 0, 0, TAU); paintPath(c, st, st.center || fillOf(st, 1, 2, 0));
      if (fineOf(r, st) > 16) { c.beginPath(); for (let i = 0; i < 7; i++) circlePath(c, (R() - 0.5) * r * 0.1, (R() - 0.5) * r * 0.16, r * 0.016); markFill(c, st); }
    },
    lily(c, r, st, R) {
      const a0 = R() * TAU, fine = fineOf(r, st);
      for (let i = 0; i < 3; i++) { const a = a0 + i * TAU / 3; pet(c, st, a, 0, 'pointed', r, r * 0.27, fillOf(st, 1, 2, i)); if (fine > 12) petVein(c, st, a, 0, r, 0.05); }
      for (let i = 0; i < 3; i++) { const a = a0 + TAU / 6 + i * TAU / 3; pet(c, st, a, 0, 'pointed', r * 0.92, r * 0.34, fillOf(st, 0, 2, i)); if (fine > 12) petVein(c, st, a, 0, r * 0.92, -0.04); }
      if (fine > 16) {
        c.beginPath();
        for (let i = 0; i < 20; i++) { const a = a0 + R() * TAU, d = r * (0.12 + R() * 0.28); circlePath(c, Math.sin(a) * d, -Math.cos(a) * d, r * 0.017); }
        markFill(c, st);
      }
      // six long stamens and the pistil
      c.beginPath();
      const tips = [];
      for (let i = 0; i < 6; i++) {
        const a = a0 + i * TAU / 6 + 0.3, l = r * (0.6 + R() * 0.12), x = Math.sin(a) * l, y = -Math.cos(a) * l;
        c.moveTo(0, 0); c.quadraticCurveTo(x * 0.5 + y * 0.12, y * 0.5 - x * 0.12, x, y); tips.push([x, y, a]);
      }
      markStroke(c, st, st.lw * 0.9);
      c.beginPath();
      tips.forEach((p) => { c.moveTo(p[0], p[1]); c.ellipse(p[0], p[1], r * 0.07, r * 0.024, p[2] + PI / 2, 0, TAU); });
      circlePath(c, 0, 0, r * 0.05);
      markFill(c, st);
    },
    lotus(c, r, st, R) {
      c.save(); c.translate(0, r * 0.45);
      const fine = fineOf(r, st);
      [-1.25, 1.25, -0.85, 0.85].forEach((a, i) => pet(c, st, a + (R() - 0.5) * 0.06, 0, 'pointed', r * 0.74, r * 0.25, fillOf(st, 2, 3, i)));
      [-0.45, 0.45, 0].forEach((a, i) => pet(c, st, a + (R() - 0.5) * 0.05, 0, 'pointed', r * 1.0, r * 0.3, fillOf(st, 1, 3, i)));
      [-0.64, 0.64, -0.22, 0.22].forEach((a, i) => {
        pet(c, st, a, 0, 'pointed', r * 0.82, r * 0.32, fillOf(st, 0, 3, i));
        if (fine > 14) petVein(c, st, a, 0, r * 0.82, 0.03);
      });
      c.restore();
    },
    rose(c, r, st, R) {
      const a0 = R() * TAU;
      for (let i = 0; i < 5; i++) pet(c, st, a0 + i * TAU / 5 + (R() - 0.5) * 0.1, 0, 'round', r, r * 0.6, fillOf(st, 0, 3, i));
      for (let i = 0; i < 5; i++) pet(c, st, a0 + (i + 0.5) * TAU / 5, 0, 'round', r * 0.8, r * 0.52, fillOf(st, 1, 3, i));
      for (let k = 0; k < 8; k++) pet(c, st, a0 + k * 2.4, r * 0.02, 'round', r * (0.6 - k * 0.055), r * (0.44 - k * 0.036), fillOf(st, 2, 3, k));
      if (fineOf(r, st) > 10) {   // the 2.4-turn spiral heart
        c.beginPath();
        const T = 2.4 * TAU;
        for (let t = 0; t <= T; t += 0.18) { const q = r * 0.42 * (t / T); c.lineTo(Math.cos(t + a0) * q, Math.sin(t + a0) * q); }
        markStroke(c, st, st.lw);
      }
    },
    daisy(c, r, st, R) {
      const a0 = R() * TAU, n = fineOf(r, st) < 12 ? 12 : 18;
      for (let i = 0; i < n; i++) pet(c, st, a0 + i * TAU / n + (R() - 0.5) * 0.05, r * 0.14, 'strap', r * (0.82 + R() * 0.08), r * 0.075, fillOf(st, 0, 2, i));
      for (let i = 0; i < n; i++) pet(c, st, a0 + (i + 0.5) * TAU / n, r * 0.12, 'strap', r * 0.74, r * 0.07, fillOf(st, 1, 2, i));
      c.beginPath(); circlePath(c, 0, 0, r * 0.26); paintPath(c, st, st.center || fillOf(st, 1, 2, 0));
      if (fineOf(r, st) > 12) seedDisc(c, st, r * 0.23, 48, r * 0.02);
    },
    hibiscus(c, r, st, R) {
      const a0 = R() * TAU, fine = fineOf(r, st);
      for (let i = 0; i < 5; i++) pet(c, st, a0 + i * TAU / 5 + 0.1, r * 0.02, 'ruffle', r, r * 0.52, fillOf(st, 0, 1, i), { lobes: 4, amp: 0.08 });
      if (fine > 12) {
        c.beginPath();
        for (let i = 0; i < 5; i++) for (let j = -1; j <= 1; j++) {
          const a = a0 + i * TAU / 5 + 0.1 + j * 0.22;
          c.moveTo(Math.sin(a) * r * 0.1, -Math.cos(a) * r * 0.1);
          c.quadraticCurveTo(Math.sin(a + j * 0.1) * r * 0.45, -Math.cos(a + j * 0.1) * r * 0.45, Math.sin(a + j * 0.12) * r * 0.78, -Math.cos(a + j * 0.12) * r * 0.78);
        }
        markStroke(c, st, st.lw * 0.7);
      }
      const ca = a0 + 0.7, ex = Math.cos(ca) * r * 0.95, ey = Math.sin(ca) * r * 0.95, cw = r * 0.075;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(ex, ey);
      markStroke(c, st, cw + st.lw * 2);
      c.lineWidth = cw; c.strokeStyle = st.center || fillOf(st, 0, 1, 1); c.stroke();
      c.beginPath();
      for (let i = 0; i < 10; i++) { const t = 0.55 + R() * 0.38, s = (R() - 0.5) * r * 0.18; circlePath(c, ex * t - Math.sin(ca) * s, ey * t + Math.cos(ca) * s, r * 0.032); }
      c.fillStyle = st.center || fillOf(st, 0, 1, 1); c.fill(); sepLine(c, st, 0.6);
      c.beginPath();
      for (let i = 0; i < 5; i++) { const a = ca + (i - 2) * 0.38; circlePath(c, ex + Math.cos(a) * r * 0.06, ey + Math.sin(a) * r * 0.06, r * 0.026); }
      markFill(c, st);
    },
    sunflower(c, r, st, R) {
      const a0 = R() * TAU, n = fineOf(r, st) < 12 ? 16 : 22;
      for (let i = 0; i < n; i++) pet(c, st, a0 + i * TAU / n + (R() - 0.5) * 0.05, r * 0.4, 'pointed', r * (0.58 + R() * 0.06), r * 0.1, fillOf(st, 1, 2, i));
      for (let i = 0; i < n; i++) pet(c, st, a0 + (i + 0.5) * TAU / n, r * 0.38, 'pointed', r * 0.54, r * 0.1, fillOf(st, 0, 2, i));
      c.beginPath(); circlePath(c, 0, 0, r * 0.45); paintPath(c, st, st.center || fillOf(st, 1, 2, 0));
      const fine = fineOf(r, st);
      if (fine > 10) seedDisc(c, st, r * 0.42, fine > 30 ? 150 : 70, r * (fine > 30 ? 0.017 : 0.026));
    },
    thistle(c, r, st, R) {
      const fill0 = fillOf(st, 0, 3, 0), fine = fineOf(r, st);
      c.beginPath();
      const nb = fine < 12 ? 22 : 46;
      for (let i = 0; i < nb; i++) {
        const a = -PI / 2 + (i / (nb - 1) - 0.5) * 2.0 + (R() - 0.5) * 0.08, l = r * (0.6 + R() * 0.38);
        c.moveTo(0, -r * 0.05);
        c.quadraticCurveTo(Math.cos(a) * l * 0.4, -r * 0.05 + Math.sin(a) * l * 0.6, Math.cos(a) * l, -r * 0.05 + Math.sin(a) * l);
      }
      c.lineWidth = Math.max(st.lw * 0.9, r * 0.032); c.strokeStyle = fill0; c.stroke();
      c.save(); c.translate(0, r * 0.3);
      c.beginPath(); c.ellipse(0, 0, r * 0.4, r * 0.34, 0, 0, TAU); paintPath(c, st, fillOf(st, 1, 3, 0));
      if (fine > 9) {
        for (let row = 0; row < 4; row++) for (let i = 0; i < 6; i++) {
          const x = (i - 2.5) * r * 0.13 + (row % 2) * r * 0.065, y = -r * 0.2 + row * r * 0.13;
          if ((x * x) / (0.34 * 0.34 * r * r) + (y * y) / (0.29 * 0.29 * r * r) > 1) continue;
          c.save(); c.translate(x, y + r * 0.09); pet(c, st, (R() - 0.5) * 0.4, 0, 'pointed', r * 0.17, r * 0.06, fillOf(st, 2, 3, i)); c.restore();
        }
      }
      c.beginPath();
      for (let i = 0; i < 14; i++) { const a = PI * (0.08 + i / 13 * 0.84), x0 = Math.cos(a) * r * 0.4, y0 = Math.sin(a) * r * 0.34; c.moveTo(x0, y0); c.lineTo(x0 * 1.5, y0 * 1.5); }
      c.lineWidth = Math.max(st.lw * 0.8, r * 0.022); c.strokeStyle = fill0; c.stroke();
      c.restore();
    },
    iris(c, r, st, R) {
      const fine = fineOf(r, st);
      c.save(); c.translate(0, r * 0.05);
      const fall = (a, L) => {
        pet(c, st, a, 0, 'round', L, r * 0.36, fillOf(st, 1, 2, 0));
        if (fine > 10) {
          petVein(c, st, a, 0, L, 0.02);
          c.beginPath();
          for (let k = 0; k < 6; k++) { const d = r * (0.1 + k * 0.055); circlePath(c, Math.sin(a) * d, -Math.cos(a) * d, r * 0.022); }
          markFill(c, st);
        }
      };
      fall(2.05, r * 0.95); fall(-2.05, r * 0.95);
      pet(c, st, 0, 0, 'round', r * 0.88, r * 0.27, fillOf(st, 0, 2, 0));
      pet(c, st, -0.44, 0, 'round', r * 0.8, r * 0.25, fillOf(st, 0, 2, 1));
      pet(c, st, 0.44, 0, 'round', r * 0.8, r * 0.25, fillOf(st, 0, 2, 2));
      if (fine > 14) { petVein(c, st, -0.44, 0, r * 0.8, 0.02); petVein(c, st, 0.44, 0, r * 0.8, -0.02); }
      fall(PI, r * 0.82);
      c.restore();
    },
    dandelion(c, r, st, R) {
      const fine = fineOf(r, st), n = fine > 25 ? 72 : fine > 12 ? 40 : 22;
      c.beginPath();
      for (let k = 0; k < n; k++) {
        const a = k * 2.39996 + R() * 0.1, l = r * (0.72 + R() * 0.26), ex = Math.cos(a) * l, ey = Math.sin(a) * l;
        c.moveTo(Math.cos(a) * r * 0.1, Math.sin(a) * r * 0.1); c.lineTo(ex, ey);
        if (fine > 12) for (let j = -2; j <= 2; j++) { const b = a + j * 0.26; c.moveTo(ex, ey); c.lineTo(ex + Math.cos(b) * r * 0.12, ey + Math.sin(b) * r * 0.12); }
      }
      c.lineWidth = Math.max(st.lw * 0.75, r * 0.012); c.strokeStyle = fillOf(st, 0, 2, 0); c.stroke();
      c.beginPath(); circlePath(c, 0, 0, r * 0.13); paintPath(c, st, fillOf(st, 1, 2, 0));
      if (fine > 14) seedDisc(c, st, r * 0.11, 14, r * 0.016);
    },
    hydrangea(c, r, st, R) {
      const fine = fineOf(r, st), n = fine < 10 ? 12 : 22 + Math.floor(R() * 8), fl = [];
      for (let i = 0; i < n; i++) {
        const a = R() * TAU, d = Math.sqrt((i + 0.5) / n) * r * 0.74;
        fl.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.86, s: r * (0.2 + R() * 0.07) * (fine < 10 ? 1.3 : 1), k: i });
      }
      fl.sort((p, q) => p.y - q.y);
      fl.forEach((f) => {
        c.save(); c.translate(f.x, f.y); c.rotate(R() * TAU);
        for (let j = 0; j < 4; j++) pet(c, st, j * PI / 2 + (R() - 0.5) * 0.2, 0, 'round', f.s, f.s * 0.52, fillOf(st, f.k % 3, 3, f.k + j));
        if (fine > 12) { c.beginPath(); circlePath(c, 0, 0, f.s * 0.12); markFill(c, st); }
        c.restore();
      });
    },
    wisteria(c, r, st, R) {   // a raceme hanging down (+y) from (0,0), 2.6 r long
      const fine = fineOf(r, st), m = fine < 10 ? 8 : fine < 18 ? 12 : 16, len = r * 2.6, bend = (R() - 0.5) * 0.6;
      const at = (t) => [Math.sin(t * PI * 0.9) * bend * len * 0.12, t * len];
      c.beginPath(); c.moveTo(0, 0);
      for (let i = 1; i <= 12; i++) { const p = at(i / 12 * 0.94); c.lineTo(p[0], p[1]); }
      c.lineWidth = Math.max(st.lw, r * 0.04); c.strokeStyle = st.stem || fillOf(st, 0, 3, 0); c.stroke();
      for (let i = m - 1; i >= 0; i--) {
        const t = i / (m - 1), p = at(t * 0.96), s = len * lerp(0.1, 0.03, Math.pow(t, 0.85)), side = i % 2 ? 1 : -1;
        const fx = p[0] + side * s * 0.8, fy = p[1];
        if (fine > 10) { c.beginPath(); c.moveTo(p[0], p[1] - s * 0.3); c.lineTo(fx, fy); c.lineWidth = Math.max(st.lw * 0.8, s * 0.08); c.strokeStyle = st.stem || fillOf(st, 0, 3, 0); c.stroke(); }
        c.save(); c.translate(fx, fy); c.rotate(side * 0.45 + (R() - 0.5) * 0.3);
        const f = fillOf(st, Math.min(2, Math.floor(t * 3)), 3, i);
        if (t > 0.82) { pet(c, st, PI, 0, 'pointed', s * 1.3, s * 0.5, f); c.restore(); continue; }   // buds at the tip
        pet(c, st, 0, -s * 0.1, 'round', s * 1.0, s * 0.62, fillOf(st, 0, 3, i + 1));   // banner
        pet(c, st, PI - 0.55, 0, 'round', s * 1.15, s * 0.5, f);                       // wings
        pet(c, st, PI + 0.55, 0, 'round', s * 1.15, s * 0.5, f);
        pet(c, st, PI, s * 0.05, 'pointed', s * 0.8, s * 0.32, fillOf(st, 2, 3, i));    // keel
        c.restore();
      }
    },
    moonflower(c, r, st, R) {
      const a0 = R() * TAU, fine = fineOf(r, st);
      c.beginPath();
      for (let i = 0; i <= 80; i++) { const a = i / 80 * TAU, q = r * (0.9 + 0.1 * Math.cos(5 * (a - a0))); c.lineTo(Math.cos(a) * q, Math.sin(a) * q); }
      c.closePath(); paintPath(c, st, fillOf(st, 0, 2, 0));
      if (fine > 8) {
        c.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = a0 + i * TAU / 5;
          c.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2); c.lineTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97);
          if (fine > 14) { c.moveTo(Math.cos(a + 0.24) * r * 0.24, Math.sin(a + 0.24) * r * 0.24); c.quadraticCurveTo(Math.cos(a + 0.2) * r * 0.5, Math.sin(a + 0.2) * r * 0.5, Math.cos(a + 0.08) * r * 0.78, Math.sin(a + 0.08) * r * 0.78); }
        }
        markStroke(c, st, st.lw * 0.85);
      }
      c.beginPath(); circlePath(c, 0, 0, r * 0.17); paintPath(c, st, fillOf(st, 1, 2, 0));
      c.beginPath(); circlePath(c, 0, 0, r * 0.055); markFill(c, st);
    },
    bud(c, r, st, R) {
      pet(c, st, -0.18, 0, 'pointed', r, r * 0.4, fillOf(st, 1, 2, 0));
      pet(c, st, 0.16, 0, 'pointed', r * 0.92, r * 0.38, fillOf(st, 0, 2, 1));
      const lf = st.leaf || fillOf(st, 0, 1, 0);
      pet(c, st, -0.75, 0, 'pointed', r * 0.42, r * 0.15, lf); pet(c, st, 0.75, 0, 'pointed', r * 0.42, r * 0.15, lf);
    },
  };

  // draw one head at (x, y): rot turns it (side-on heads: rot = stem direction + PI/2), tilt foreshortens it
  function head(c, sp, x, y, r, rot, tilt, st, R) {
    c.save();
    c.translate(x, y);
    if (rot) c.rotate(rot);
    if (tilt != null && tilt !== 1) c.scale(1, tilt);
    c.lineJoin = 'round'; c.lineCap = 'round';
    (HEADS[sp] || HEADS.sakura)(c, r, st, R);
    c.restore();
  }

  // ---------------------------------------------------------------------------------------------- leaves, buds, loose petals
  const LEAF_W = { lance: 0.36, serrate: 0.36, heart: 0.8, blade: 0.13, lobed: 0.5, pinnate: 0.5, spiny: 0.44, toothed: 0.36, pad: 1, round: 0.46 };
  function toothedOutline(teeth, amp, back) {
    const pts = [], N = teeth * 2;
    for (let i = 0; i <= N; i++) {
      const t = i / N, env = Math.sin(PI * Math.pow(t, 0.78));
      const tip = i % 2 === 1;
      pts.push([env * (tip ? 1 : 1 - amp), -t + (tip ? (back ? 0.035 : -0.025) : 0)]);
    }
    return pts;
  }
  const OUTLINES = { serrate: toothedOutline(11, 0.14, false), spiny: toothedOutline(6, 0.52, false), toothed: toothedOutline(5, 0.6, true) };
  function leafOutline(c, kind, L, W) {
    c.beginPath();
    if (kind === 'heart') {
      c.moveTo(0, 0);
      c.bezierCurveTo(-W * 0.55, L * 0.14, -W * 1.12, -L * 0.12, -W * 0.82, -L * 0.48);
      c.bezierCurveTo(-W * 0.55, -L * 0.78, -W * 0.12, -L * 0.86, 0, -L);
      c.bezierCurveTo(W * 0.12, -L * 0.86, W * 0.55, -L * 0.78, W * 0.82, -L * 0.48);
      c.bezierCurveTo(W * 1.12, -L * 0.12, W * 0.55, L * 0.14, 0, 0);
    } else if (OUTLINES[kind]) {
      const pts = OUTLINES[kind];
      c.moveTo(0, 0);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0] * W, pts[i][1] * L);
      for (let i = pts.length - 2; i > 0; i--) c.lineTo(-pts[i][0] * W, pts[i][1] * L);
    } else if (kind === 'round') {
      c.moveTo(0, 0);
      c.bezierCurveTo(-W * 1.32, -L * 0.08, -W * 1.3, -L * 0.82, 0, -L);
      c.bezierCurveTo(W * 1.3, -L * 0.82, W * 1.32, -L * 0.08, 0, 0);
    } else if (kind === 'blade') {
      c.moveTo(0, 0);
      c.bezierCurveTo(-W * 1.3, -L * 0.12, -W * 1.05, -L * 0.72, 0, -L);
      c.bezierCurveTo(W * 1.05, -L * 0.72, W * 1.3, -L * 0.12, 0, 0);
    } else {
      c.moveTo(0, 0);
      c.bezierCurveTo(-W * 1.36, -L * 0.2, -W * 0.96, -L * 0.78, 0, -L);
      c.bezierCurveTo(W * 0.96, -L * 0.78, W * 1.36, -L * 0.2, 0, 0);
    }
    c.closePath();
  }
  function leafVeins(c, st, L, W, pairs) {
    const fine = L / Math.max(1e-6, st.lw || 1);
    if (fine < 8) return;
    c.beginPath();
    c.moveTo(0, -L * 0.03); c.quadraticCurveTo(W * 0.12, -L * 0.5, 0, -L * 0.9);
    if (fine > 15) {
      for (let i = 0; i < pairs; i++) {
        const t = 0.22 + i * 0.2;
        c.moveTo(0, -L * t); c.quadraticCurveTo(-W * 0.3, -L * (t + 0.05), -W * 0.64, -L * (t + 0.17));
        c.moveTo(0, -L * (t + 0.04)); c.quadraticCurveTo(W * 0.3, -L * (t + 0.09), W * 0.64, -L * (t + 0.21));
      }
    }
    markStroke(c, st, st.lw * 0.8);
  }
  // leaf from (x, y) pointing along `angle`; style.leafKind picks the outline (lance by default)
  function leaf(c, x, y, ang, L, st) {
    st = st || INK;
    const kind = st.leafKind || 'lance', fill = st.leaf || fillOf(st, 0, 1, 0);
    c.save(); c.translate(x, y); c.rotate(ang + PI / 2); c.lineJoin = 'round'; c.lineCap = 'round';
    if (kind === 'lobed') {
      [-0.66, 0.66, 0].forEach((a, i) => {
        c.save(); c.rotate(a);
        const l = L * (i === 2 ? 1 : 0.7);
        leafOutline(c, 'lance', l, l * 0.27); paintPath(c, st, fill); leafVeins(c, st, l, l * 0.27, 2);
        c.restore();
      });
    } else if (kind === 'pinnate') {
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -L * 0.9);
      c.lineWidth = Math.max(st.lw || 1, L * 0.028); c.strokeStyle = fill; c.stroke();
      for (let k = 0; k < 4; k++) {
        const y0 = -L * (0.24 + k * 0.17), l = L * (0.3 - k * 0.025);
        [-1, 1].forEach((s) => { c.save(); c.translate(0, y0); c.rotate(s * 1.0); leafOutline(c, 'lance', l, l * 0.26); paintPath(c, st, fill); leafVeins(c, st, l, l * 0.26, 0); c.restore(); });
      }
      c.save(); c.translate(0, -L * 0.86); leafOutline(c, 'lance', L * 0.22, L * 0.06); paintPath(c, st, fill); c.restore();
    } else if (kind === 'pad') {
      const q = L / 2;
      c.beginPath(); c.moveTo(0, -q); c.arc(0, -q, q, PI / 2 + 0.16, PI / 2 - 0.16 + TAU); c.closePath(); paintPath(c, st, fill);
      if (q / Math.max(1e-6, st.lw || 1) > 8) {
        c.beginPath();
        for (let i = 0; i < 11; i++) { const a = PI / 2 + 0.4 + i / 10 * (TAU - 0.8); c.moveTo(0, -q); c.lineTo(Math.cos(a) * q * 0.9, -q + Math.sin(a) * q * 0.9); }
        markStroke(c, st, st.lw * 0.7);
      }
    } else {
      const W = L * (LEAF_W[kind] || 0.36);
      leafOutline(c, kind, L, W); paintPath(c, st, fill);
      leafVeins(c, st, L, W, kind === 'blade' ? 0 : kind === 'heart' ? 2 : 3);
    }
    c.restore();
  }
  // a closed bud: a teardrop with a fold line and three sepals, base at (x, y), pointing along `angle`
  function bud(c, x, y, ang, s, st) {
    st = st || INK;
    const bf = st.bud || fillOf(st, 1, 2, 0), lf = st.leaf || fillOf(st, 0, 1, 0);
    c.save(); c.translate(x, y); c.rotate(ang + PI / 2); c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); SHAPES.pointed(c, s * 1.9, s * 0.62); c.closePath(); paintPath(c, st, bf);
    if (s / Math.max(1e-6, st.lw || 1) > 5) { c.beginPath(); c.moveTo(0, -s * 0.3); c.quadraticCurveTo(s * 0.24, -s * 1.0, -s * 0.04, -s * 1.72); markStroke(c, st, st.lw * 0.8); }
    [-0.55, 0.55, 0].forEach((a, i) => { c.save(); c.rotate(a); c.beginPath(); SHAPES.pointed(c, s * (i === 2 ? 0.62 : 0.86), s * 0.24); c.closePath(); paintPath(c, st, lf); c.restore(); });
    c.restore();
  }
  // a single loose petal; flip squashes it (a tumbling petal seen edge-on)
  function petal(c, x, y, ang, s, st, shape, flip) {
    st = st || INK;
    c.save(); c.translate(x, y); c.rotate(ang || 0); c.scale(1, flip == null ? 1 : flip); c.lineJoin = 'round';
    c.beginPath(); (SHAPES[shape || 'notch'] || SHAPES.notch)(c, s, s * 0.44); c.closePath();
    paintPath(c, st, st.petal || fillOf(st, 1, 2, 0));
    c.restore();
  }

  // ---------------------------------------------------------------------------------------------- stems
  // pts: [[x, y, width], ...] -> one tapered polygon plus a round cap at each end (no stroke)
  function ribbon(c, pts, fill) {
    const n = pts.length;
    if (n < 2) return;
    const A = [], B = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[Math.min(i + 1, n - 1)], o = pts[Math.max(i - 1, 0)];
      let dx = q[0] - o[0], dy = q[1] - o[1];
      const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
      const hw = p[2] / 2;
      A.push(p[0] - dy * hw, p[1] + dx * hw); B.push(p[0] + dy * hw, p[1] - dx * hw);
    }
    c.fillStyle = fill;
    c.beginPath(); c.moveTo(A[0], A[1]);
    for (let i = 2; i < A.length; i += 2) c.lineTo(A[i], A[i + 1]);
    for (let i = B.length - 2; i >= 0; i -= 2) c.lineTo(B[i], B[i + 1]);
    c.closePath(); c.fill();
    c.beginPath(); circlePath(c, pts[n - 1][0], pts[n - 1][1], pts[n - 1][2] / 2); c.fill();
    c.beginPath(); circlePath(c, pts[0][0], pts[0][1], pts[0][2] / 2); c.fill();
  }
  function twigLine(c, x0, y0, x1, y1, w0, w1, fill) {
    const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(x0 + nx * w0 / 2, y0 + ny * w0 / 2); c.lineTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
    c.lineTo(x1 - nx * w1 / 2, y1 - ny * w1 / 2); c.lineTo(x0 - nx * w0 / 2, y0 - ny * w0 / 2);
    c.closePath(); c.fill();
  }

  // ---------------------------------------------------------------------------------------------- branch scenes
  const WOODY = { woody: 1, cluster: 1, hanging: 1 };
  function normSpecies(sp, fallback) {
    const arr = (Array.isArray(sp) ? sp : [sp]).filter((k) => typeof k === 'string' && SPECIES[k]);
    return arr.length ? arr : [fallback || 'sakura'];
  }
  // grow a seeded scene in abstract units (trunk length 1); everything is recorded, nothing is drawn yet
  function growPlan(o) {
    const R = rng('branch:' + o.seed);
    const sp = o.species, form = SPECIES[sp[0]].form, woody = !!WOODY[form], vine = form === 'vine', hanging = form === 'hanging';
    const bR = o.bloomR, lR = Math.min(bR, o.leafR || 0.15);
    const P = { segs: [], knobs: [], twigs: [], blooms: [], leaves: [], buds: [], petals: [], tendrils: [], pads: [], form: form };
    const spots = [], tips = [];
    const up = o.pull != null ? o.pull : (Math.sin(o.ang0) > 0.35 ? PI / 2 : -PI / 2);
    function grow(x, y, a, len, w, d) {
      const n = Math.max(6, Math.round(len * (woody ? 26 : 22)));
      const pts = [[x, y, w]];
      const turn = (R() - 0.5) * 0.06 * o.bend;
      const forks = [];
      if (d < o.depth) {
        const kids = d === 0 ? (o.depth >= 2 ? 2 + (R() < 0.35 ? 1 : 0) : 1 + (R() < 0.5 ? 1 : 0)) : (R() < 0.8 ? 1 : 0) + (R() < 0.25 ? 1 : 0);
        for (let k = 0; k < kids; k++) forks.push(Math.max(2, Math.min(n - 2, Math.round(n * (0.26 + (k + 0.15 + R() * 0.6) / kids * 0.56)))));
      }
      let side = R() < 0.5 ? -1 : 1;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        if (woody && R() < 0.14) a += (R() - 0.5) * 0.55 * o.bend;
        if (vine) a += Math.sin(i * 0.45 + d * 2) * 0.08;
        a += turn + (R() - 0.5) * (woody ? 0.09 : 0.035);
        a += angDiff(up, a) * (woody ? 0.018 : vine ? 0.012 : 0.03);
        x += Math.cos(a) * len / n; y += Math.sin(a) * len / n;
        const ww = w * (1 - 0.66 * Math.pow(t, 0.9));
        pts.push([x, y, ww]);
        if (forks.indexOf(i) >= 0) {
          const ca = a + side * (0.42 + R() * 0.5) * (o.spread || 1);
          grow(x, y, ca, len * (0.5 + R() * 0.22) * (1 - t * 0.3), ww * 0.74, d + 1);
          if (woody) P.knobs.push([x, y, ww * 0.62]);
          side = -side;
        } else if (i >= 2 && i <= n - 2 && R() < (woody ? 0.22 : 0.17)) {
          spots.push({ x: x, y: y, a: a, d: d, t: t, w: ww, s: R() < 0.5 ? -1 : 1, r: R() });
        }
      }
      P.segs.push(pts);
      tips.push({ x: x, y: y, a: a, d: d, w: pts[pts.length - 1][2] });
    }
    grow(0, 0, o.ang0, 1, o.w0 || (hanging ? 0.045 : woody ? 0.07 : vine ? 0.026 : 0.034), 0);

    const headSp = (main) => (main ? sp[0] : sp[Math.floor(R() * sp.length)]);
    const cands = [];
    tips.slice().sort((p, q) => p.d - q.d).forEach((tp) => {
      const s = headSp(tp.d <= 1);
      const r = bR * (tp.d === 0 ? 1.12 : 1) * (0.9 + R() * 0.22) * (HEAD_SCALE[s] || 1);
      cands.push({ x: tp.x + Math.cos(tp.a) * r * 0.2, y: tp.y + Math.sin(tp.a) * r * 0.2, r: r, sp: s, a: tp.a, tip: tp, kind: 'tip' });
    });
    const leafSpots = [], budSpots = [];
    spots.forEach((s) => {
      if (woody && s.r < 0.42) {
        const ta = s.a + s.s * (0.55 + R() * 0.5), tl = bR * (0.9 + R() * 0.8), x1 = s.x + Math.cos(ta) * tl, y1 = s.y + Math.sin(ta) * tl;
        const hs = headSp(false), r = bR * (0.72 + R() * 0.26) * (HEAD_SCALE[hs] || 1);
        cands.push({ x: x1, y: y1, r: r, sp: hs, a: ta, kind: 'spur', twig: [s.x, s.y, x1, y1, Math.max(s.w * 0.55, bR * 0.08), bR * 0.05] });
      } else if (s.r < 0.78) leafSpots.push(s);
      else budSpots.push(s);
    });
    if (o.extraBlooms && !hanging) {
      cands.filter((q) => q.kind === 'tip').forEach((q) => {
        const n = 1 + (R() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const a = q.a + (i ? -1 : 1) * (0.9 + R() * 0.9), d = q.r * (1.25 + R() * 0.4), s = headSp(false);
          cands.push({ x: q.x + Math.cos(a) * d, y: q.y + Math.sin(a) * d, r: bR * (0.62 + R() * 0.2) * (HEAD_SCALE[s] || 1), sp: s, a: a, kind: 'extra', from: q });
        }
      });
    }
    const disc = (b) => (b.hang ? { x: b.x, y: b.y + b.r * 1.3, r: b.r * 1.15 } : b);
    const fits = (b, relax) => P.blooms.every((q) => {
      const A = disc(b), B = disc(q), dd = Math.hypot(A.x - B.x, A.y - B.y);
      return A.r + B.r - dd <= (relax ? 0.6 : 0.25) * Math.min(A.r, B.r);
    });
    cands.forEach((b) => {
      if (hanging) { b.hang = true; b.r *= 1.2; b.sp = 'wisteria'; }
      if (P.blooms.length < o.maxBlooms && fits(b, b.kind === 'extra')) {
        P.blooms.push(b);
        if (b.twig) P.twigs.push(b.twig);
        if (b.kind === 'extra') P.twigs.push([b.from.x, b.from.y, b.x, b.y, bR * 0.06, bR * 0.035]);
      } else if (b.kind === 'tip' && o.buds) {
        P.buds.push({ x: b.tip.x, y: b.tip.y, ang: b.a + (R() - 0.5) * 0.4, s: bR * 0.3 });
      } else if (b.kind === 'spur' && o.buds && R() < 0.5) {
        P.twigs.push(b.twig); P.buds.push({ x: b.twig[2], y: b.twig[3], ang: b.a, s: bR * 0.26 });
      }
    });
    // orientation: side-on heads follow their stem, face-on heads are foreshortened along it
    P.blooms.forEach((b) => {
      if (b.hang) { b.rot = (R() - 0.5) * 0.12; b.tilt = 1; return; }
      b.rot = b.a + PI / 2;
      b.tilt = SIDE[b.sp] ? 1 : b.sp === 'hydrangea' ? 0.86 + R() * 0.1 : 0.58 + R() * 0.38;
    });
    if (o.buds) {
      budSpots.forEach((s) => {
        const ta = s.a + s.s * (0.5 + R() * 0.5), tl = bR * 0.5, x1 = s.x + Math.cos(ta) * tl, y1 = s.y + Math.sin(ta) * tl;
        P.twigs.push([s.x, s.y, x1, y1, Math.max(s.w * 0.5, bR * 0.06), bR * 0.04]);
        P.buds.push({ x: x1, y: y1, ang: ta, s: bR * (0.24 + R() * 0.08) });
      });
      for (let i = 0; P.buds.length < 2 && i < P.blooms.length; i++) {
        const b = P.blooms[i], a = b.a + (i % 2 ? 1 : -1) * 1.2, x0 = b.x - Math.cos(b.a) * b.r * 0.2, y0 = b.y - Math.sin(b.a) * b.r * 0.2;
        const x1 = x0 + Math.cos(a) * b.r * 1.15, y1 = y0 + Math.sin(a) * b.r * 1.15;
        P.twigs.push([x0, y0, x1, y1, bR * 0.06, bR * 0.035]);
        P.buds.push({ x: x1, y: y1, ang: a, s: bR * 0.27 });
      }
    }
    if (o.leaves) {
      const kind = SPECIES[sp[0]].leaf, Ls = kind === 'blade' ? 2.3 : kind === 'heart' ? 1.25 : kind === 'pinnate' ? 2 : 1.45;
      if (!woody && !vine && kind !== 'pad') {
        // herbaceous stems: leaves spaced along each stem, alternating sides (iris: long blades from the base)
        const at = (seg, t) => { const i = Math.min(seg.length - 2, Math.max(0, Math.floor((seg.length - 1) * t))); return [seg[i], seg[i + 1]]; };
        P.segs.forEach((seg, si) => {
          const main = si === P.segs.length - 1, basal = sp[0] === 'iris' && main;
          const ts = basal ? [0.02, 0.05, 0.3] : main ? [0.22, 0.4, 0.58] : [0.42];
          ts.forEach((t, k) => {
            const pq = at(seg, t), a = Math.atan2(pq[1][1] - pq[0][1], pq[1][0] - pq[0][0]), side = (k + si) % 2 ? 1 : -1;
            const spread = basal && k < 2 ? 0.16 + R() * 0.12 : 0.55 + R() * 0.35, len = basal && k < 2 ? 1.5 : main ? 1 : 0.8;
            P.leaves.push({ x: pq[0][0], y: pq[0][1], ang: a + side * spread, L: lR * Ls * (0.85 + R() * 0.3) * len });
          });
        });
        leafSpots.length = 0;
      }
      leafSpots.forEach((s) => {
        if (kind === 'pad') return;
        P.leaves.push({ x: s.x, y: s.y, ang: s.a + s.s * (0.55 + R() * 0.5), L: lR * Ls * (0.8 + R() * 0.45) });
      });
      tips.forEach((tp, i) => {
        if (R() < 0.45 || kind === 'pad' || (!woody && !vine)) return;
        const pts = P.segs.find((seg) => seg[seg.length - 1][0] === tp.x && seg[seg.length - 1][1] === tp.y);
        if (!pts) return;
        const p = pts[Math.max(1, Math.floor(pts.length * 0.78))];
        P.leaves.push({ x: p[0], y: p[1], ang: tp.a + (i % 2 ? 0.8 : -0.8), L: lR * Ls * (0.85 + R() * 0.3) });
      });
      for (let g = 0; P.leaves.length < 3 && kind !== 'pad' && g < 12; g++) {
        const seg = P.segs[g % P.segs.length], p = seg[Math.floor(seg.length * (0.35 + R() * 0.4))], q = seg[Math.min(seg.length - 1, seg.indexOf(p) + 1)];
        const a = Math.atan2(q[1] - p[1], q[0] - p[0]);
        P.leaves.push({ x: p[0], y: p[1], ang: a + (g % 2 ? 0.9 : -0.9), L: lR * Ls * (0.85 + R() * 0.3) });
      }
      P.leafKind = kind;
    }
    if (vine) {
      spots.forEach((s, i) => {
        if (i % 2) return;
        const pts = []; let x = s.x, y = s.y, a = s.a + s.s * 1.1, st = bR * 0.09;
        for (let k = 0; k < 26; k++) { pts.push([x, y]); a += s.s * (0.18 + k * 0.012); x += Math.cos(a) * st * (1 - k / 32); y += Math.sin(a) * st * (1 - k / 32); }
        P.tendrils.push(pts);
      });
    }
    if (form === 'pad') {
      const t0 = P.segs[P.segs.length - 1][0];
      P.pads.push({ x: t0[0] - 0.22, y: t0[1] - 0.02, r: 0.26, tilt: 0.34 });
      if (R() < 0.6) P.pads.push({ x: t0[0] + 0.24, y: t0[1] + 0.01, r: 0.19, tilt: 0.3 });
    }
    // loose petals drifting away from the blossoms (to the left when petalDir < 0)
    const np = o.petals | 0;
    if (np && P.blooms.length) {
      const dir = o.petalDir < 0 ? -1 : 1;
      const sorted = P.blooms.slice().sort((a, b) => dir * (b.x - a.x));
      const edge = sorted[0];
      for (let i = 0; i < np; i++) {
        const b = sorted[Math.floor(R() * Math.min(3, sorted.length))];
        const x0 = dir < 0 ? Math.min(b.x, edge.x) : Math.max(b.x, edge.x);
        P.petals.push({
          x: x0 + dir * (edge.r * (0.75 + R() * 0.3) + bR * (0.2 + i / np * 2.2 + R() * 0.5) * (o.spread || 1)),
          y: b.y + b.r * (-0.4 + (i % 3) * 0.9 + R() * 0.8),
          ang: R() * TAU, s: bR * (0.4 + R() * 0.2), flip: 0.42 + R() * 0.55,
        });
      }
    }
    return P;
  }
  // bleed: the lowest fraction of the trunk is left out of the box, so the stem runs off the edge (tiles)
  function planBox(P, bleed) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y, r) => { if (x - r < x0) x0 = x - r; if (y - r < y0) y0 = y - r; if (x + r > x1) x1 = x + r; if (y + r > y1) y1 = y + r; };
    P.segs.forEach((pts, si) => {
      const from = bleed && si === P.segs.length - 1 ? Math.floor((pts.length - 1) * bleed) : 0;
      for (let i = from; i < pts.length; i++) add(pts[i][0], pts[i][1], pts[i][2] / 2);
    });
    P.twigs.forEach((t) => { add(t[0], t[1], t[4] / 2); add(t[2], t[3], t[4] / 2); });
    P.leaves.forEach((l) => {
      const W = l.L * (LEAF_W[P.leafKind] || 0.4), cx = Math.cos(l.ang), cy = Math.sin(l.ang);
      add(l.x, l.y, W * 0.3); add(l.x + cx * l.L * 0.5, l.y + cy * l.L * 0.5, W * 1.05); add(l.x + cx * l.L, l.y + cy * l.L, W * 0.2);
    });
    P.buds.forEach((b) => { add(b.x, b.y, b.s * 0.7); add(b.x + Math.cos(b.ang) * b.s * 1.9, b.y + Math.sin(b.ang) * b.s * 1.9, b.s * 0.5); });
    P.blooms.forEach((b) => { if (b.hang) { add(b.x, b.y, b.r * 0.55); add(b.x, b.y + b.r * 2.65, b.r * 0.5); add(b.x, b.y + b.r * 1.3, b.r * 0.6); } else add(b.x, b.y, b.r * 1.06); });
    P.petals.forEach((p) => add(p.x, p.y, p.s));
    P.tendrils.forEach((pts) => pts.forEach((p) => add(p[0], p[1], 0.004)));
    P.pads.forEach((p) => { add(p.x - p.r, p.y, 0.01); add(p.x + p.r, p.y, 0.01); add(p.x, p.y - p.r * p.tilt, 0.01); add(p.x, p.y + p.r * p.tilt, 0.01); });
    if (!isFinite(x0)) return { x: 0, y: 0, w: 1, h: 1 };
    return { x: x0, y: y0, w: Math.max(1e-6, x1 - x0), h: Math.max(1e-6, y1 - y0) };
  }
  // fit the plan into rect (minus inset) by its anchor and draw it, back to front
  function drawPlan(c, P, rect, st, o, R) {
    const bx = planBox(P, o.bleed), ins = o.inset == null ? 4 : o.inset;
    const iw = Math.max(1, rect.w - 2 * ins), ih = Math.max(1, rect.h - 2 * ins);
    const k = Math.min(iw / bx.w, ih / bx.h);
    const anchor = o.anchor || 'center';
    let ox = rect.x + ins + (iw - bx.w * k) / 2, oy = rect.y + ins + (ih - bx.h * k) / 2;
    if (/bottom/.test(anchor)) oy = rect.y + ins + ih - bx.h * k;
    if (/top/.test(anchor)) oy = rect.y + ins;
    if (/left/.test(anchor)) ox = rect.x + ins;
    if (/right/.test(anchor)) ox = rect.x + ins + iw - bx.w * k;
    c.save();
    c.translate(ox, oy); c.scale(k, k); c.translate(-bx.x, -bx.y);
    c.lineJoin = 'round'; c.lineCap = 'round';
    const S = Object.assign({}, st, { lw: (o.lwPx || 1) / k, leafKind: P.leafKind || st.leafKind });
    const S2 = Object.assign({}, S, { leaf: st.leaf2 || st.leaf });
    const stem = st.stem || fillOf(st, 0, 1, 0);
    P.segs.slice().sort((a, b) => b[0][2] - a[0][2]).forEach((pts) => ribbon(c, pts, stem));
    c.fillStyle = stem;
    P.knobs.forEach((kn) => { c.beginPath(); circlePath(c, kn[0], kn[1], kn[2]); c.fill(); });
    P.twigs.forEach((t) => twigLine(c, t[0], t[1], t[2], t[3], t[4], t[5], stem));
    if (P.tendrils.length) {
      c.beginPath();
      P.tendrils.forEach((pts) => { c.moveTo(pts[0][0], pts[0][1]); pts.forEach((p) => c.lineTo(p[0], p[1])); });
      c.lineWidth = Math.max(S.lw, P.blooms.length ? P.blooms[0].r * 0.03 : S.lw); c.strokeStyle = stem; c.stroke();
    }
    P.pads.forEach((p) => {
      c.save(); c.translate(p.x, p.y); c.scale(1, p.tilt);
      c.beginPath(); c.arc(0, 0, p.r, 0.12 - PI / 2, TAU - 0.12 - PI / 2); c.lineTo(0, 0); c.closePath();
      paintPath(c, S, st.leaf || stem);
      if (p.r / S.lw > 8) { c.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; c.moveTo(0, 0); c.lineTo(Math.cos(a) * p.r * 0.92, Math.sin(a) * p.r * 0.92); } markStroke(c, S, S.lw * 0.7); }
      c.restore();
    });
    P.leaves.forEach((l, i) => leaf(c, l.x, l.y, l.ang, l.L, i % 2 ? S2 : S));
    P.buds.forEach((b) => bud(c, b.x, b.y, b.ang, b.s, S));
    const SA = o.accent ? Object.assign({}, o.accent, { lw: S.lw, leafKind: S.leafKind }) : S;
    P.blooms.slice().sort((a, b) => (a.hang || b.hang ? a.y - b.y : a.r - b.r)).forEach((b) => head(c, b.sp, b.x, b.y, b.r, b.rot, b.tilt, b.accent ? SA : S, R));
    P.petals.forEach((p) => petal(c, p.x, p.y, p.ang, p.s, S, 'notch', p.flip));
    c.restore();
    return k;
  }
  function branchOpts(opts) {
    const o = Object.assign({ seed: 'branch', depth: 2, bloomR: 0.12, maxBlooms: 7, extraBlooms: false, leaves: true, buds: true, petals: 6, petalDir: -1, bend: 1, ang0: -PI / 2 - 0.45, anchor: 'center', inset: 4 }, opts || {});
    o.species = normSpecies(o.species, 'sakura');
    return o;
  }
  function planStats(P) {
    let worst = 0;
    for (let i = 0; i < P.blooms.length; i++) for (let j = i + 1; j < P.blooms.length; j++) {
      const a = P.blooms[i], b = P.blooms[j], ov = (a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y)) / Math.min(a.r, b.r);
      if (ov > worst) worst = ov;
    }
    const minBloomX = P.blooms.reduce((m, b) => Math.min(m, b.x), Infinity);
    return { blooms: P.blooms.length, leaves: P.leaves.length, buds: P.buds.length, petals: P.petals.length, maxOverlap: Math.round(worst * 100) / 100, petalsLeft: P.petals.filter((p) => p.x < minBloomX).length };
  }
  // Flora.branch(ctx, rect, opts): grow a seeded branch and draw it fitted into rect; nothing is clipped
  function branch(c, rect, opts) {
    const o = branchOpts(opts);
    const P = growPlan(o);
    const k = drawPlan(c, P, rect || { x: 0, y: 0, w: 100, h: 100 }, o.style || INK, o, rng('draw:' + o.seed));
    return Object.assign(planStats(P), { scale: k });
  }

  // ---------------------------------------------------------------------------------------------- silhouettes (white on transparent)
  // INK: pure white masses; separations, veins and stamens are cut out of them (transparent), never painted
  const INK = Object.freeze({ fill: '#ffffff', sep: '#000000', cut: true, lw: 1, dot: '#000000', center: '#ffffff', leaf: '#ffffff', leaf2: '#ffffff', stem: '#ffffff', bud: '#ffffff', petal: '#ffffff' });
  const HOME_SEED = 'home-20';   // chosen from home-1 ... home-24: clusters at the top, left and right-middle, stem from the bottom right, petals to the left

  const KIND_ANCHOR = { branch: 'center', sprig: 'bottomleft', spray: 'bottomleft', bud: 'bottom', twig: 'center', seedling: 'bottom', tile: 'bottomright', specimen: 'center', mark: 'center' };
  const KIND_SPECIES = { branch: ['peony', 'sakura', 'ume'], sprig: ['sakura'], spray: ['sakura'], bud: ['sakura'], twig: ['ume'], seedling: ['sakura'], tile: ['sakura'], specimen: ['sakura'] };
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
  // design-space art: draw fn in a box of bw x bh units, fitted into the sprite by its anchor
  function fitBox(c, n, bw, bh, lw, fn) {
    const k = Math.min(n.w / bw, n.h / bh);
    let ox = (n.w - bw * k) / 2, oy = (n.h - bh * k) / 2;
    if (/bottom/.test(n.anchor)) oy = n.h - bh * k;
    if (/top/.test(n.anchor)) oy = 0;
    if (/left/.test(n.anchor)) ox = 0;
    if (/right/.test(n.anchor)) ox = n.w - bw * k;
    c.save(); c.translate(ox, oy); c.scale(k, k);
    fn(Object.assign({}, INK, { lw: lw / k }), k);
    c.restore();
  }
  function curvePts(p0, p1, p2, w0, w1, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1], lerp(w0, w1, t)]);
    }
    return pts;
  }
  function dashedGround(c, x0, x1, y, h) {
    c.fillStyle = '#ffffff';
    for (let x = x0; x < x1; x += 7) c.fillRect(x, y, Math.min(4, x1 - x), h);
  }
  const SPRITES = {
    branch(c, n, lw) {
      // a portrait box (the phone readout) grows the same seed more upright, so it fills the height
      const tall = n.h > n.w * 1.05;
      branch(c, { x: 0, y: 0, w: n.w, h: n.h }, { seed: n.seed, species: n.species, anchor: n.anchor, ang0: n.angle != null ? n.angle : tall ? -PI / 2 - 0.2 : -PI / 2 - 0.45, bend: tall ? 0.8 : 1, spread: tall ? 0.6 : 1, lwPx: lw, inset: 4 });
    },
    sprig(c, n, lw) {
      const ang = n.angle != null ? n.angle : /top/.test(n.anchor) ? PI / 2 + 0.35 : /right/.test(n.anchor) ? -PI / 2 - 0.55 : -PI / 2 + 0.55;
      const hangs = Math.sin(ang) > 0.35, f = SPECIES[n.species[0]].form;
      branch(c, { x: 0, y: 0, w: n.w, h: n.h }, {
        seed: 'sprig:' + n.seed, species: n.species, anchor: n.anchor, ang0: ang, pull: hangs ? lerp(ang, PI / 2, 0.4) : undefined,
        depth: 2, bloomR: f === 'woody' ? 0.1 : f === 'hanging' ? 0.11 : 0.12, maxBlooms: 6, extraBlooms: f === 'woody', petals: 3,
        petalDir: Math.cos(ang) > 0 ? -1 : 1, bend: 0.9, w0: f === 'woody' ? 0.05 : undefined, lwPx: lw, inset: 3,
      });
    },
    spray(c, n, lw) {
      branch(c, { x: 0, y: 0, w: n.w, h: n.h }, {
        seed: 'spray:' + n.seed, species: n.species, anchor: n.anchor, ang0: n.angle != null ? n.angle : -PI / 2 + 0.6,
        depth: 2, bloomR: 0.085, maxBlooms: 10, extraBlooms: true, petals: 4, petalDir: 1, w0: 0.05, lwPx: lw, inset: 3,
      });
    },
    tile(c, n, lw) {
      // the plant grows in from the corner: its base bleeds past the bottom-right edge, so the heads stay large
      const sp = n.species, f = SPECIES[sp[0]].form;
      let rect = { x: 0, y: 0, w: n.w, h: n.h };
      const base = { seed: 'tile:' + n.seed, species: sp, anchor: n.anchor, lwPx: lw, inset: 2, petals: 3, petalDir: -1, bleed: 0.32 };
      if (f === 'hanging') { rect = { x: 0, y: 0, w: n.w, h: n.h }; Object.assign(base, { bleed: 0.4, ang0: PI + 0.18, pull: PI + 0.1, depth: 1, bloomR: 0.22, maxBlooms: 5, anchor: 'topright', petals: 2 }); }
      else if (f === 'woody' || f === 'cluster') Object.assign(base, { ang0: -PI / 2 - 0.55, depth: 2, bloomR: f === 'cluster' ? 0.18 : 0.13, maxBlooms: f === 'cluster' ? 3 : 6, extraBlooms: sp[0] === 'sakura' || sp[0] === 'ume' });
      else if (f === 'vine') Object.assign(base, { ang0: -PI / 2 - 0.5, depth: 1, bloomR: 0.18, maxBlooms: 3 });
      else Object.assign(base, { ang0: -PI / 2 - 0.32, depth: 1, bloomR: 0.23, maxBlooms: 3, bend: 0.6, petals: sp[0] === 'dandelion' ? 0 : 2 });
      if (n.angle != null) base.ang0 = n.angle;
      branch(c, rect, base);
    },
    specimen(c, n, lw) {
      const sp = n.species, f = SPECIES[sp[0]].form;
      const o = { seed: 'specimen:' + n.seed, species: sp, anchor: n.anchor, lwPx: lw, inset: 3, petals: 0, buds: false, bend: 0.4 };
      if (f === 'hanging') Object.assign(o, { ang0: PI + 0.12, pull: PI, depth: 1, bloomR: 0.2, maxBlooms: 3 });
      else if (f === 'woody' || f === 'cluster') Object.assign(o, { ang0: -PI / 2 - 0.3, depth: 1, bloomR: f === 'cluster' ? 0.3 : 0.24, maxBlooms: f === 'cluster' ? 1 : 2, buds: true, petals: 2 });
      else Object.assign(o, { ang0: -PI / 2 - 0.08, depth: 0, bloomR: 0.3, maxBlooms: 1 });
      if (n.angle != null) o.ang0 = n.angle;
      branch(c, { x: 0, y: 0, w: n.w, h: n.h }, o);
    },
    // a closed bud on a gently drooping stem, two leaves, one fallen petal (Liked Songs is empty)
    bud(c, n, lw) {
      fitBox(c, n, 100, 112, lw, (st) => {
        ribbon(c, curvePts([50, 111], [42, 50], [70, 30], 3.4, 1.6, 18), '#ffffff');
        leaf(c, 47, 84, -PI / 2 - 0.95, 27, Object.assign({}, st, { leafKind: 'lance' }));
        leaf(c, 47, 66, -PI / 2 + 0.75, 23, Object.assign({}, st, { leafKind: 'lance' }));
        bud(c, 69, 30.5, -0.35, 9.5, st);
        petal(c, 82, 107, 1.25, 7, st, 'notch', 0.5);
      });
    },
    // a bare twig shedding its last petals (no results, not found)
    twig(c, n, lw) {
      const o = branchOpts({ seed: 'twig:' + n.seed, species: n.species, depth: 2, bloomR: 0.09, maxBlooms: 1, leaves: false, buds: true, petals: 0, ang0: n.angle != null ? n.angle : -PI / 2 - 0.85, bend: 1.2, anchor: n.anchor, inset: 3, lwPx: lw });
      const P = growPlan(o), R = rng('twig-petals:' + n.seed), bx = planBox(P);
      for (let i = 0; i < 6; i++) P.petals.push({ x: bx.x + bx.w * (0.15 + R() * 0.75), y: bx.y + bx.h * (0.55 + R() * 0.75), ang: R() * TAU, s: 0.035 + R() * 0.015, flip: 0.35 + R() * 0.6 });
      drawPlan(c, P, { x: 0, y: 0, w: n.w, h: n.h }, INK, o, rng('draw:' + o.seed));
    },
    // a stem, two leaves and a bud on a dashed ground line (generic empty, empty mosaic)
    seedling(c, n, lw) {
      fitBox(c, n, 100, 104, lw, (st, k) => {
        ribbon(c, curvePts([50, 100], [47, 70], [53, 36], 3, 1.6, 14), '#ffffff');
        leaf(c, 49, 80, -PI / 2 - 1.0, 24, Object.assign({}, st, { leafKind: 'lance' }));
        leaf(c, 50, 68, -PI / 2 + 0.85, 20, Object.assign({}, st, { leafKind: 'lance' }));
        bud(c, 53, 37, -PI / 2 + 0.12, 7.5, st);
        dashedGround(c, 16, 84, 101, Math.max(1.5, lw * 1.4 / k));
      });
    },
    // the 13x12 pixel blossom, as large as whole device pixels allow
    mark(c, n) {
      const W = Math.round(n.w * n.dpr), H = Math.round(n.h * n.dpr), cell = Math.max(1, Math.floor(Math.min(W / 13, H / 12)));
      const x0 = Math.floor((W - 13 * cell) / 2), y0 = Math.floor((H - 12 * cell) / 2);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = '#ffffff';
      BLOSSOM.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') c.fillRect(x0 + i * cell, y0 + j * cell, cell, cell); });
    },
  };
  function renderSprite(c, n) {
    c.setTransform(n.dpr, 0, 0, n.dpr, 0, 0);
    c.clearRect(0, 0, n.w, n.h);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.lineJoin = 'round'; c.lineCap = 'round';
    SPRITES[n.kind](c, n, 1.1 / n.dpr);
  }
  const spriteCache = new Map();
  let scratch = null;
  function sprite(opts) {
    if (!hasDom()) return '';
    const n = normSpriteOpts(opts), key = JSON.stringify(n);
    if (spriteCache.has(key)) { const hit = spriteCache.get(key); spriteCache.delete(key); spriteCache.set(key, hit); return hit; }
    let url = '';
    try {
      if (!scratch) scratch = document.createElement('canvas');
      scratch.width = Math.max(1, Math.round(n.w * n.dpr)); scratch.height = Math.max(1, Math.round(n.h * n.dpr));
      const c = scratch.getContext('2d', { willReadFrequently: true });   // read back by toDataURL: keep it off the GPU
      if (c) { renderSprite(c, n); url = scratch.toDataURL('image/png'); }
    } catch (e) { url = ''; }
    spriteCache.set(key, url);
    while (spriteCache.size > 96) spriteCache.delete(spriteCache.keys().next().value);
    return url;
  }
  function draw(canvas, opts) {
    if (!hasDom() || !canvas || typeof canvas.getContext !== 'function') return canvas;
    const n = normSpriteOpts(opts);
    canvas.width = Math.max(1, Math.round(n.w * n.dpr)); canvas.height = Math.max(1, Math.round(n.h * n.dpr));
    if (canvas.style) { canvas.style.width = n.w + 'px'; canvas.style.height = n.h + 'px'; }
    const c = canvas.getContext('2d');
    if (c) { try { renderSprite(c, n); } catch (e) { /* leave the canvas blank */ } }
    return canvas;
  }

  // ---------------------------------------------------------------------------------------------- covers (tonal colour)
  // Colour model (5.6): dark grounds (luma <= .27 fading to <= .12, a soft glow), light petals (luma .90 / .77 / .66),
  // separations .11, leaves the hue -60, one warm or complementary accent. Tones are set by sRGB luma, so every hue
  // reads the same through mono, thresholds cleanly under ink and gives dither a real gradient.
  const C0 = 300;
  function coverPalette(hex, R) {
    const hs = rgbToHsl.apply(null, hexToRgb(hex)), h = hs[0], s = clamp(hs[1], 0.3, 0.85);
    const ah = R() < 0.5 ? h + 38 : h + 180;
    return {
      h: h, s: s,
      g0: tone(h, s * 0.85, 0.2), g1: tone(h - 8, s * 0.7, 0.06), glow: tone(h + 6, s * 0.9, 0.27),
      p: [tone(h + 4, s * 0.42, 0.9), tone(h, s * 0.6, 0.77), tone(h - 6, s * 0.74, 0.66)],
      a: [tone(ah, 0.6, 0.88), tone(ah, 0.7, 0.75), tone(ah, 0.78, 0.65)],
      sep: tone(h, s * 0.6, 0.11), leaf: tone(h - 60, s * 0.55, 0.4), leaf2: tone(h - 52, s * 0.5, 0.53), stem: tone(h - 40, s * 0.45, 0.3),
      center: tone(h + 40, 0.75, 0.6), moon: tone(h + 20, 0.25, 0.82), night: tone(h, s * 0.7, 0.045),
    };
  }
  function toneFill(T) {
    return function (li, n, k) {
      if (n > 1) return T[Math.min(2, Math.round(li / (n - 1) * 2))];
      return T[k % 3 === 2 ? 1 : 0];
    };
  }
  function coverStyles(P) {
    const base = { sep: P.sep, lw: 1.4, cut: false, dot: P.sep, center: P.center, leaf: P.leaf, leaf2: P.leaf2, stem: P.stem };
    return {
      st: Object.assign({}, base, { fill: toneFill(P.p), bud: P.p[1], petal: P.p[1] }),
      ac: Object.assign({}, base, { fill: toneFill(P.a), bud: P.a[1], petal: P.a[1] }),
    };
  }
  // The ground is computed as a posterised field (18 linear x 15 glow levels) on a 150 x 150 grid and scaled up
  // without smoothing: flat terraces instead of a dithered canvas gradient, so the PNG stays small (a smooth
  // 300 px gradient alone costs ~85 KB) while dither and cyano still see a real tonal ramp.
  let groundCv = null;
  function ground(c, P, R, opt) {
    opt = opt || {};
    const N = 150, sc = C0 / N;
    if (!groundCv) { groundCv = document.createElement('canvas'); groundCv.width = groundCv.height = N; }
    const g = groundCv.getContext('2d', { willReadFrequently: true }), img = g.createImageData(N, N), d = img.data;
    const A = hexToRgb(P.g0), B = hexToRgb(P.g1), L = hexToRgb(P.glow);
    const ang = opt.radial ? 0 : 1.05 + R() * 0.9, dx = Math.cos(ang), dy = Math.sin(ang);
    const gx = (opt.gx != null ? opt.gx : opt.radial ? C0 * 0.5 : C0 * (0.25 + R() * 0.5)) / sc;
    const gy = (opt.gy != null ? opt.gy : opt.radial ? C0 * 0.46 : C0 * (0.2 + R() * 0.4)) / sc;
    const gr = (opt.gr || C0 * (opt.radial ? 0.5 : 0.62)) / sc, gs = opt.gs == null ? 0.9 : opt.gs;
    const p0 = Math.min(0, dx * N) + Math.min(0, dy * N), p1 = Math.max(0, dx * N) + Math.max(0, dy * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let t;
        if (opt.radial) t = Math.min(1, Math.hypot(x - N / 2, y - N / 2) / (N * 0.68));
        else t = (x * dx + y * dy - p0) / (p1 - p0);
        t = Math.round(t * 18) / 18;
        let w = 1 - Math.hypot(x - gx, y - gy) / gr;
        w = w > 0 ? Math.round(Math.pow(w, 1.4) * 15) / 15 * gs : 0;
        const i = (y * N + x) * 4;
        for (let k = 0; k < 3; k++) { const base = A[k] + (B[k] - A[k]) * t; d[i + k] = base + (L[k] - base) * w; }
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    c.save(); c.imageSmoothingEnabled = false; c.drawImage(groundCv, 0, 0, C0, C0); c.restore();
  }
  const leafKindOf = (sp) => { const k = SPECIES[sp].leaf; return k === 'pad' ? 'round' : k; };
  // a subject head: side-on heads stand up, a wisteria raceme hangs so that its middle sits at (x, y)
  function subject(c, sp, x, y, r, st, R, tilt) {
    if (sp === 'wisteria') { head(c, 'wisteria', x, y - r * 1.25, r * 0.95, (R() - 0.5) * 0.1, 1, st, R); return; }
    head(c, sp, x, y, r, SIDE[sp] ? (R() - 0.5) * 0.3 : R() * TAU, SIDE[sp] ? 1 : (tilt || 0.9), st, R);
  }
  function scatterPetals(c, st, R, n, size) {
    for (let i = 0; i < n; i++) petal(c, R() * C0, R() * C0, R() * TAU, size * (0.8 + R() * 0.5), st, 'notch', 0.4 + R() * 0.55);
  }
  function stemTo(c, x0, y0, x1, y1, bendX, w0, w1, fill) {
    const pts = curvePts([x0, y0], [lerp(x0, x1, 0.5) + bendX, lerp(y0, y1, 0.5)], [x1, y1], w0, w1, 12);
    ribbon(c, pts, fill);
    return pts;
  }
  const COMPS = {
    bloom(c, P, S, sp, R) {
      const alt = ALT[sp] || 'sakura', ls = Object.assign({}, S.st, { leafKind: leafKindOf(sp) }), ls2 = Object.assign({}, ls, { leaf: P.leaf2 });
      const cx = C0 * (0.42 + R() * 0.16), cy = C0 * (0.44 + R() * 0.12), r = C0 * (0.33 + R() * 0.05);
      for (let i = 0; i < 5; i++) leaf(c, cx, cy, PI / 2 + (i - 2) * 0.72 + (R() - 0.5) * 0.3, r * (1.1 + R() * 0.3), i % 2 ? ls2 : ls);
      const right = R() < 0.5, low = R() < 0.5;
      subject(c, alt, C0 * (right ? 0.93 : 0.07), C0 * (low ? 0.9 : 0.1), C0 * 0.17, S.ac, R, 0.85);
      subject(c, sp, cx, cy, r, S.st, R, 0.88 + R() * 0.1);
      scatterPetals(c, S.st, R, 3, 9);
    },
    portrait(c, P, S, sp, R) {   // round-crop safe: everything that matters inside the inner 70%
      const ls = Object.assign({}, S.st, { leafKind: leafKindOf(sp) }), ls2 = Object.assign({}, ls, { leaf: P.leaf2 });
      const cx = C0 * 0.5, cy = C0 * 0.5, r = C0 * (sp === 'wisteria' ? 0.27 : 0.29);
      for (let i = 0; i < 6; i++) leaf(c, cx, cy, -PI / 2 + i * TAU / 6 + R() * 0.4, r * (1.12 + R() * 0.18), i % 2 ? ls2 : ls);
      for (let i = 0; i < 3; i++) { const a = R() * TAU; bud(c, cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95, a, C0 * 0.028, S.st); }
      subject(c, sp, cx, cy, r, S.st, R, 0.94);
    },
    branch(c, P, S, sp, R, seed) {
      const left = R() < 0.5, ang = -PI / 2 + (left ? 0.55 : -0.55);
      const o = branchOpts({ seed: 'cover:' + seed, species: [sp, sp, ALT[sp] || sp], depth: 2, bloomR: 0.15, maxBlooms: 7, extraBlooms: sp === 'sakura' || sp === 'ume', petals: 4, petalDir: left ? 1 : -1, ang0: ang, anchor: left ? 'bottomleft' : 'bottomright', inset: 0, lwPx: 1.4, accent: S.ac });
      const plan = growPlan(o);
      if (plan.blooms.length) plan.blooms[Math.floor(R() * plan.blooms.length)].accent = true;
      drawPlan(c, plan, { x: -C0 * 0.04, y: C0 * 0.06, w: C0 * 1.08, h: C0 * 1.02 }, Object.assign({}, S.st, { leafKind: leafKindOf(sp) }), o, R);
    },
    bouquet(c, P, S, sp, R) {
      const alt = ALT[sp] || 'sakura', n = 5 + Math.floor(R() * 3), bx = C0 * (0.42 + R() * 0.16), by = C0 * 1.06, heads = [];
      const ls = Object.assign({}, S.st, { leafKind: leafKindOf(sp) }), ls2 = Object.assign({}, ls, { leaf: P.leaf2 });
      for (let i = 0; i < n; i++) {
        const a = -PI / 2 + (i / (n - 1) - 0.5) * 1.35 + (R() - 0.5) * 0.18, L = C0 * (0.52 + R() * 0.3);
        const tx = bx + Math.cos(a) * L, ty = by + Math.sin(a) * L;
        const pts = stemTo(c, bx, by, tx, ty, (R() - 0.5) * 30, C0 * 0.016, C0 * 0.008, P.stem);
        const p = pts[6];
        leaf(c, p[0], p[1], a + (R() < 0.5 ? -1 : 1) * 0.75, C0 * (0.12 + R() * 0.05), i % 2 ? ls2 : ls);
        const s = i % 3 === 1 ? alt : sp;
        heads.push({ x: tx, y: ty, r: C0 * (0.1 + R() * 0.06) * (HEAD_SCALE[s] || 1), sp: s, a: a });
      }
      const acc = Math.floor(R() * n);
      heads.map((h, i) => Object.assign(h, { acc: i === acc })).sort((p, q) => p.r - q.r).forEach((h) => {
        if (h.sp === 'wisteria') head(c, 'wisteria', h.x, h.y - h.r * 0.4, h.r * 0.8, 0, 1, h.acc ? S.ac : S.st, R);
        else head(c, h.sp, h.x, h.y, h.r, SIDE[h.sp] ? h.a + PI / 2 : R() * TAU, SIDE[h.sp] ? 1 : 0.72 + R() * 0.26, h.acc ? S.ac : S.st, R);
      });
      scatterPetals(c, S.st, R, 4, 8);
    },
    stalks(c, P, S, sp, R) {
      const n = 3 + Math.floor(R() * 3), ls = Object.assign({}, S.st, { leafKind: leafKindOf(sp) }), ls2 = Object.assign({}, ls, { leaf: P.leaf2 }), heads = [];
      for (let i = 0; i < n; i++) {
        const x0 = C0 * (0.14 + (i + R() * 0.6) / n * 0.74), x1 = x0 + (R() - 0.5) * C0 * 0.16, y1 = C0 * (0.18 + R() * 0.36);
        const pts = stemTo(c, x0, C0 * 1.04, x1, y1, (R() - 0.5) * 24, C0 * 0.017, C0 * 0.01, P.stem);
        for (let k = 0; k < 2; k++) { const p = pts[4 + k * 3 + Math.floor(R() * 2)]; leaf(c, p[0], p[1], -PI / 2 + (k % 2 ? 0.7 : -0.7) + (R() - 0.5) * 0.3, C0 * (leafKindOf(sp) === 'blade' ? 0.26 : 0.13), k % 2 ? ls2 : ls); }
        heads.push({ x: x1, y: y1, r: C0 * (0.11 + R() * 0.05) * (HEAD_SCALE[sp] || 1), a: Math.atan2(y1 - pts[9][1], x1 - pts[9][0]) });
      }
      const acc = Math.floor(R() * n);
      heads.forEach((h, i) => {
        const st = i === acc ? S.ac : S.st;
        if (sp === 'wisteria') head(c, 'wisteria', h.x, h.y - h.r * 0.3, h.r * 0.7, 0, 1, st, R);
        else head(c, sp, h.x, h.y, h.r, SIDE[sp] ? h.a + PI / 2 : R() * TAU, SIDE[sp] ? 1 : 0.7 + R() * 0.25, st, R);
      });
      scatterPetals(c, S.st, R, 3, 8);
    },
    field(c, P, S, sp, R) {
      const alt = ALT[sp] || 'sakura', ls = Object.assign({}, S.st, { leafKind: leafKindOf(sp) }), ls2 = Object.assign({}, ls, { leaf: P.leaf2 });
      for (let i = 0; i < 9; i++) leaf(c, R() * C0, R() * C0, R() * TAU, C0 * (0.09 + R() * 0.06), i % 2 ? ls2 : ls);
      const n = 13 + Math.floor(R() * 5), pts = [];
      for (let t = 0; t < 300 && pts.length < n; t++) {
        const x = R() * C0, y = R() * C0, r = C0 * (0.05 + R() * 0.06);
        if (pts.every((p) => Math.hypot(p.x - x, p.y - y) > (p.r + r) * 0.8)) pts.push({ x: x, y: y, r: r });
      }
      const acc = Math.floor(R() * pts.length);
      pts.sort((p, q) => p.r - q.r).forEach((p, i) => {
        const s = R() < 0.72 ? sp : alt;
        if (s === 'wisteria') head(c, 'wisteria', p.x, p.y - p.r, p.r * 0.7, 0, 1, i === acc ? S.ac : S.st, R);
        else head(c, s, p.x, p.y, p.r, R() * TAU, 0.66 + R() * 0.34, i === acc ? S.ac : S.st, R);
      });
      scatterPetals(c, S.st, R, 8, 7);
    },
    wallpaper(c, P, S, sp, R) {
      const rows = 4, step = C0 / 3.2, ls = Object.assign({}, S.st, { leafKind: leafKindOf(sp) === 'pinnate' ? 'lance' : leafKindOf(sp) });
      const rot0 = R() * TAU, hr = step * (sp === 'wisteria' ? 0.24 : 0.34) * (HEAD_SCALE[sp] > 1 ? 0.9 : 1), acc = [1 + Math.floor(R() * 2), 1 + Math.floor(R() * 2)];
      for (let y = 0; y <= rows; y++) for (let x = -1; x <= 3; x++) {
        const ox = x * step + (y % 2 ? step / 2 : 0) + step * 0.25, oy = y * step * 0.9 - step * 0.1;
        leaf(c, ox + step * 0.42, oy + step * 0.36, 0.6 + (y % 2) * 1.9, step * 0.3, ls);
        leaf(c, ox + step * 0.42, oy + step * 0.36, 2.4 + (y % 2) * 1.9, step * 0.24, Object.assign({}, ls, { leaf: P.leaf2 }));
      }
      for (let y = 0; y <= rows; y++) for (let x = -1; x <= 3; x++) {
        const ox = x * step + (y % 2 ? step / 2 : 0) + step * 0.25, oy = y * step * 0.9 - step * 0.1;
        const st = y === acc[0] && x === acc[1] ? S.ac : S.st;
        if (sp === 'wisteria') head(c, 'wisteria', ox, oy - hr, hr, 0, 1, st, rng('wp:' + x + ',' + y));
        else head(c, sp, ox, oy, hr, rot0 + (y % 2) * 0.6, SIDE[sp] ? 1 : 0.92, st, rng('wp:' + x + ',' + y));
      }
    },
    hanging(c, P, S, sp, R) {
      const bar = curvePts([-C0 * 0.05, C0 * 0.08], [C0 * 0.5, C0 * (0.12 + R() * 0.08)], [C0 * 1.05, C0 * 0.05], C0 * 0.03, C0 * 0.018, 24);
      const ls = Object.assign({}, S.st, { leafKind: sp === 'wisteria' ? 'pinnate' : leafKindOf(sp) }), ls2 = Object.assign({}, ls, { leaf: P.leaf2 });
      if (sp !== 'wisteria') {
        // a weeping spray: two seeded branches hang from the bar, the larger one in front
        [[0.12, 0.62, 0.32], [0.48, 0.98, -0.28]].forEach((q, k) => {
          const o = branchOpts({ seed: 'hang:' + k + ':' + R(), species: [sp, sp, ALT[sp] || sp], depth: 2, bloomR: 0.14, maxBlooms: 5, extraBlooms: SPECIES[sp].form === 'woody', petals: 2, petalDir: q[2] > 0 ? 1 : -1, ang0: PI / 2 + q[2], pull: PI / 2 + q[2] * 0.5, anchor: 'top', inset: 0, lwPx: 1.4, accent: S.ac });
          const plan = growPlan(o);
          if (k === 1 && plan.blooms.length) plan.blooms[0].accent = true;
          drawPlan(c, plan, { x: C0 * (q[0] - 0.14), y: C0 * 0.1, w: C0 * 0.68, h: C0 * (k ? 0.88 : 0.74) }, Object.assign({}, S.st, { leafKind: leafKindOf(sp) }), o, R);
        });
        ribbon(c, bar, P.stem);
        for (let i = 0; i < 5; i++) { const p = bar[2 + Math.floor(R() * 21)]; leaf(c, p[0], p[1], -PI / 2 + (R() - 0.5) * 2.2, C0 * 0.1, i % 2 ? ls2 : ls); }
        return;
      }
      const m = 6, acc = Math.floor(R() * m);
      for (let i = 0; i < m; i++) {
        const p = bar[Math.round((i + 0.5) / m * 24)], st = i === acc ? S.ac : S.st;
        if (sp === 'wisteria') { head(c, 'wisteria', p[0] + (R() - 0.5) * 10, p[1], C0 * (0.13 + R() * 0.12), (R() - 0.5) * 0.1, 1, st, R); continue; }
        const L = C0 * (0.3 + R() * 0.45), ex = p[0] + (R() - 0.5) * C0 * 0.1, ey = p[1] + L;
        const pts = stemTo(c, p[0], p[1], ex, ey, (R() - 0.5) * 30, C0 * 0.008, C0 * 0.006, P.stem);
        leaf(c, pts[5][0], pts[5][1], PI / 2 + (i % 2 ? 0.8 : -0.8), C0 * 0.1, i % 2 ? ls2 : ls);
        const r = C0 * (0.075 + R() * 0.04) * (HEAD_SCALE[sp] || 1);
        if (SIDE[sp]) head(c, sp, ex, ey + r * 0.4, r, PI + (R() - 0.5) * 0.4, 1, st, R);
        else head(c, sp, ex, ey + r * 0.3, r, R() * TAU, 0.6 + R() * 0.3, st, R);
      }
      ribbon(c, bar, P.stem);
      for (let i = 0; i < 6; i++) { const p = bar[2 + Math.floor(R() * 21)]; leaf(c, p[0], p[1], -PI / 2 + (R() - 0.5) * 2.2, C0 * 0.11, i % 2 ? ls2 : ls); }
    },
    moon(c, P, S, sp, R, seed, geo) {
      const mx = geo.mx, my = geo.my, mr = geo.mr;
      c.beginPath(); circlePath(c, mx, my, mr); c.fillStyle = P.moon; c.fill();
      const sil = { fill: P.night, sep: P.p[1], lw: 1.4, cut: false, dot: P.p[1], center: P.night, leaf: P.night, leaf2: P.night, stem: P.night, bud: P.night, petal: P.night, leafKind: leafKindOf(sp) };
      const o = branchOpts({ seed: 'moon:' + seed, species: [sp], depth: 2, bloomR: 0.15, maxBlooms: 7, extraBlooms: sp === 'sakura' || sp === 'ume', petals: 0, ang0: -PI / 2 + 0.95, pull: -PI / 2 + 0.75, anchor: 'bottomleft', inset: 0, lwPx: 1.4, bleed: 0.12 });
      drawPlan(c, growPlan(o), { x: -C0 * 0.02, y: C0 * 0.12, w: C0 * 1.0, h: C0 * 0.9 }, sil, o, R);
    },
  };
  // Liked Songs: a dark violet field (a radial glow in flat rings, peak luminance about 0.3 so mono, dither and ink
  // all read it as one dark tone) and a clear heart traced in sakura blossoms, centred in the square
  function paintLiked(c, R) {
    c.fillStyle = '#12052f'; c.fillRect(0, 0, C0, C0);
    const nb = 28;   // flat rings, not a smooth canvas gradient (that is dithered and bloats the PNG)
    for (let i = 0; i < nb; i++) {
      const t = i / (nb - 1);
      c.fillStyle = mix('#12052f', '#4b2bbd', t);
      c.beginPath(); circlePath(c, C0 * 0.5, C0 * 0.52, C0 * (0.74 - t * 0.6)); c.fill();
    }
    // the classic parametric heart: x = 16 sin^3 t, y = 13 cos t - 5 cos 2t - 2 cos 3t - cos 4t (y spans -17 .. 11.8)
    const hx = (t) => 16 * Math.pow(Math.sin(t), 3);
    const hy = (t) => 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const k = 0.0225, cy = 0.5;
    const at = (t) => [0.5 + hx(t) * k, cy - (hy(t) + 2.6) * k];
    // blossoms equally spaced along the outline (by arc length), starting at the top cusp
    const steps = 720, pts = [], cum = [0];
    let prev = at(0);
    for (let i = 1; i <= steps; i++) { const p = at(i / steps * TAU); cum.push(cum[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1])); prev = p; }
    const total = cum[steps], n = 17;
    for (let j = 0, i = 0; j < n; j++) {
      const want = j / n * total;
      while (i < steps && cum[i] < want) i++;
      pts.push(at(i / steps * TAU));
    }
    const st = { fill: (li, nn, kk) => (kk % 3 ? '#ffffff' : '#ffe3f1'), sep: '#2a0f7a', lw: 1.5, cut: false, dot: '#2a0f7a', center: '#ffffff' };
    pts.sort((p, q) => p[1] - q[1]).forEach((p) => head(c, 'sakura', p[0] * C0, p[1] * C0, C0 * (0.048 + R() * 0.012), R() * TAU, 0.85 + R() * 0.15, st, R));
  }
  const NOTE = ['...#....', '...##...', '...#.#..', '...#..#.', '...#..#.', '...#.#..', '...#....', '.###....', '####....', '.##.....'];
  // an empty user playlist: dark ground, a pale seedling, a small pixel eighth note
  function paintEmptyMosaic(c) {
    c.fillStyle = '#161616'; c.fillRect(0, 0, C0, C0);
    const st = { fill: '#bdbdbd', sep: '#161616', lw: 2.2, cut: false, dot: '#161616', center: '#bdbdbd', leaf: '#bdbdbd', leaf2: '#bdbdbd', stem: '#bdbdbd', bud: '#bdbdbd', petal: '#bdbdbd', leafKind: 'lance' };
    c.save(); c.translate(C0 * 0.25, C0 * 0.2); c.scale(1.5, 1.5);
    ribbon(c, curvePts([50, 100], [47, 70], [53, 36], 3, 1.6, 14), '#bdbdbd');
    leaf(c, 49, 80, -PI / 2 - 1.0, 24, st); leaf(c, 50, 68, -PI / 2 + 0.85, 20, st);
    bud(c, 53, 37, -PI / 2 + 0.12, 7.5, st);
    c.fillStyle = '#bdbdbd'; for (let x = 16; x < 84; x += 7) c.fillRect(x, 101, 4, 1.4);
    c.restore();
    c.fillStyle = '#bdbdbd';
    NOTE.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') c.fillRect(18 + i * 4, 18 + j * 4, 4, 4); });
  }
  const ALBUM_COMPS = [['bloom', 3], ['branch', 2], ['bouquet', 2], ['stalks', 1.4], ['wallpaper', 1.2], ['hanging', 1]];
  function compForAlbum(seed) {
    const total = ALBUM_COMPS.reduce((s, q) => s + q[1], 0);
    let x = (hash('comp:' + seed) % 10000) / 10000 * total;
    for (let i = 0; i < ALBUM_COMPS.length; i++) { x -= ALBUM_COMPS[i][1]; if (x < 0) return ALBUM_COMPS[i][0]; }
    return 'bloom';
  }
  const COVER_FONT = (px) => px + 'px DotGothic16, "MS Gothic", monospace';
  function pixelBlossom(c, x, y, cell, halo) {
    if (halo) {
      c.fillStyle = '#000000';
      BLOSSOM.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') c.fillRect(x + (i - 1) * cell, y + (j - 1) * cell, cell * 3, cell * 3); });
    }
    c.fillStyle = '#ffffff';
    BLOSSOM.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') c.fillRect(x + i * cell, y + j * cell, cell, cell); });
  }
  // Flora.paintCover(ctx, size, spec): an opaque size x size square at (0,0) of the current transform
  function paintCover(c, size, spec) {
    spec = spec || {};
    const S = +size > 0 ? +size : 300;
    if (!c) return { usesText: false };
    const kind = spec.kind || 'album', seed = String(spec.seed != null ? spec.seed : kind);
    const R = rng('cover:' + kind + ':' + seed);
    const sp = SPECIES[spec.species] ? spec.species : speciesFor(seed);
    let usesText = false;
    c.save();
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.rect(0, 0, S, S); c.clip();
    c.save();
    c.scale(S / C0, S / C0);
    if (kind === 'liked') paintLiked(c, R);
    else if (kind === 'mosaic-empty') paintEmptyMosaic(c);
    else {
      const P = coverPalette(spec.color || '#777777', R), styles = coverStyles(P);
      const comp = COMPS[spec.comp] ? spec.comp : kind === 'artist' ? 'portrait' : compForAlbum(seed);
      const geo = comp === 'moon' ? { mx: C0 * (0.56 + R() * 0.12), my: C0 * (0.36 + R() * 0.1), mr: C0 * (0.29 + R() * 0.05) } : null;
      ground(c, P, R, comp === 'portrait' ? { radial: true } : geo ? { gx: geo.mx, gy: geo.my, gr: geo.mr * 2.1, gs: 1 } : null);
      COMPS[comp](c, P, styles, sp, R, seed, geo);
    }
    c.restore();
    if (spec.numeral) {
      usesText = true;
      c.font = COVER_FONT(Math.round(S * 0.56));
      c.textAlign = 'right'; c.textBaseline = 'alphabetic'; c.lineJoin = 'miter';
      c.lineWidth = S * 0.06; c.strokeStyle = '#000000'; c.strokeText(String(spec.numeral), S * 0.95, S * 0.9);
      c.fillStyle = '#ffffff'; c.fillText(String(spec.numeral), S * 0.95, S * 0.9);
      c.textAlign = 'left';
    }
    if (spec.label && spec.variant !== 'thumb') {
      usesText = true;
      const fs = Math.max(8, Math.round(S * 0.075));
      c.font = COVER_FONT(fs); c.textBaseline = 'middle'; c.textAlign = 'left';
      let txt = '> ' + String(spec.label).toLowerCase();
      const max = S * 0.84;
      if (c.measureText(txt).width > max) { while (txt.length > 3 && c.measureText(txt + '…').width > max) txt = txt.slice(0, -1); txt += '…'; }
      const tw = c.measureText(txt).width;
      c.fillStyle = '#000000'; c.fillRect(0, S - fs * 2, Math.ceil(tw + fs * 1.2), fs * 2);
      c.fillStyle = '#ffffff'; c.fillText(txt, Math.round(fs * 0.6), Math.round(S - fs));
    }
    if (spec.mark) {
      const cell = Math.max(1, Math.round(S / 128)), m = Math.round(S * 0.045);
      pixelBlossom(c, S - 13 * cell - m, m, cell, true);
    }
    c.restore();
    return { usesText: usesText };
  }

  // ---------------------------------------------------------------------------------------------- falling petals (5.7)
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
    const win = typeof window !== 'undefined' ? window : null;
    const raff = (f) => (win && win.requestAnimationFrame ? win.requestAnimationFrame(f) : setTimeout(() => f(Date.now()), 16));
    const caf = (id) => (win && win.cancelAnimationFrame ? win.cancelAnimationFrame(id) : clearTimeout(id));
    function size() {
      dpr = Math.min(1.5, (win && win.devicePixelRatio) || 1);
      W = canvas.clientWidth || (win && win.innerWidth) || 800;
      H = canvas.clientHeight || (win && win.innerHeight) || 600;
      canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr));
    }
    function spawn(p, top) {
      p.len = 10 + R() * 6;   // 10-16 px: large enough that the notched petal reads as a petal, not a speck
      p.x = R() * (W + 160) - 20; p.y = top ? -12 - R() * 60 : R() * H;
      p.vy = 12 + R() * 16; p.vx = -(4 + R() * 8);
      p.amp = 10 + R() * 20; p.per = 3 + R() * 3; p.ph = R() * TAU;
      p.rot = R() * TAU; p.vr = (0.2 + R() * 0.4) * (R() < 0.5 ? -1 : 1);
      p.tum = R() * TAU; p.vt = 1.2 + R() * 1.8; p.t = 0;
      p.alpha = p.len > 14.5 ? 0.5 + R() * 0.1 : 0.3 + R() * 0.15;   // gentle; the few largest a little brighter
      return p;
    }
    function fit(n) {
      while (list.length < n) list.push(spawn({}, false));
      list.length = n;
    }
    function shape(c, L) {
      const w = L * 0.36;
      c.moveTo(0, 0);
      c.bezierCurveTo(-w * 0.95, -L * 0.14, -w * 1.32, -L * 0.74, -w * 0.56, -L * 0.98);
      c.quadraticCurveTo(-w * 0.2, -L * 1.04, 0, -L * 0.85);
      c.quadraticCurveTo(w * 0.2, -L * 1.04, w * 0.56, -L * 0.98);
      c.bezierCurveTo(w * 1.32, -L * 0.74, w * 0.95, -L * 0.14, 0, 0);
    }
    function visible() { return !(typeof document !== 'undefined' && document.hidden); }
    function displayed() { try { return canvas.getClientRects().length > 0; } catch (e) { return true; } }
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
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = fill;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        p.t += dt; p.y += p.vy * dt; p.x += p.vx * dt; p.rot += p.vr * dt; p.tum += p.vt * dt;
        if (p.y > H + 16 || p.x < -24) { spawn(p, true); continue; }
        const sx = p.x + Math.sin(p.t * TAU / p.per + p.ph) * p.amp;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(sx, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.max(0.25, Math.abs(Math.cos(p.tum))));
        ctx.beginPath(); shape(ctx, p.len); ctx.closePath(); ctx.fill();
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
    // canvas primitives
    bloom: function (ctx, x, y, r, species, style, R) {
      if (!ctx) return;
      const st = style || INK, sp = SPECIES[species] ? species : 'sakura';
      head(ctx, sp, x, y, r, st.rot || 0, st.tilt == null ? 1 : st.tilt, st, R || rng('bloom:' + sp + ':' + x + ':' + y + ':' + r));
    },
    leaf: function (ctx, x, y, angle, length, style) { if (ctx) leaf(ctx, x, y, angle, length, style || INK); },
    bud: function (ctx, x, y, angle, size, style) { if (ctx) bud(ctx, x, y, angle, size, style || INK); },
    petal: function (ctx, x, y, angle, size, style, shape, flip) { if (ctx) petal(ctx, x, y, angle, size, style || INK, shape || 'notch', flip == null ? 1 : flip); },
    branch: function (ctx, rect, opts) { return ctx ? branch(ctx, rect, opts) : null; },
    // silhouettes
    sprite: sprite,
    draw: draw,
    // covers
    paintCover: paintCover,
    // falling petals
    petals: petals,
    // pixel art
    gridPath: gridPath,
    // extras (not in the contract): the silhouette style, the head list and the sprite cache size
    INK: INK,
    HEADS: Object.freeze(Object.keys(HEADS)),
    cacheSize: function () { return spriteCache.size; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
