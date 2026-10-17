// imagery/pipeline/page.js — browser side of the imagery pipeline (inlined into dist/imagery/pipeline.html by run.js).
// All pixel work happens here on canvases: frame measurement, keying, despeckling, content cropping, petal cutting,
// cover crops with the DESIGN 5.6 overlays, and PNG/JPEG export as data URLs handed back to Node through c.eval.
(function () {
  'use strict';
  const cache = new Map();
  const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

  function load(src) {
    if (cache.has(src)) return Promise.resolve(cache.get(src));
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => { cache.set(src, im); res(im); };
      im.onerror = () => rej(new Error('cannot load ' + src));
      im.src = src;
    });
  }
  function canvas(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }
  function ctx2d(cv) { return cv.getContext('2d', { willReadFrequently: true }); }
  function pixelsOf(im, invert) {
    const cv = canvas(im.naturalWidth, im.naturalHeight), x = ctx2d(cv);
    x.drawImage(im, 0, 0);
    const id = x.getImageData(0, 0, cv.width, cv.height);
    if (invert) { const d = id.data; for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; } }
    return id;
  }
  function lumaArray(id) {
    const d = id.data, n = id.width * id.height, L = new Uint8ClampedArray(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) L[i] = 0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2];
    return L;
  }

  // ---------------------------------------------------------------------------------------------- frames
  // Scan inward from an edge. A line is frame when it is uniform (range <= 40) and near white (or, when blackToo,
  // near black), or when >= 80% of it is near white (a thick white mat that art crosses). Up to 6 uniform transition
  // lines of any level (the grey anti-alias line between a white mat and the black inside) are swallowed with it.
  function scanEdge(get, n, len, blackToo, cap) {
    let band = 0, trans = 0;
    const limit = Math.floor(n * cap);
    for (let i = 0; i < limit; i++) {
      let mn = 255, mx = 0, sum = 0, white = 0;
      for (let j = 0; j < len; j++) { const v = get(i, j); if (v < mn) mn = v; if (v > mx) mx = v; sum += v; if (v >= 205) white++; }
      const mean = sum / len, uni = mx - mn <= 40;
      if ((uni && (mean >= 195 || (blackToo && mean <= 50))) || white / len >= 0.8) { band = i + 1; trans = 0; }
      else if (band > 0 && mx - mn <= 56 && trans < 6) trans++;
      else { if (trans > 0) band += trans; break; }
    }
    // JPEG ringing hugs a hard mat edge for a few pixels: step 6 px past any real band
    return band > 2 ? Math.min(limit, band + 6) : band;
  }
  function measureFrame(L, w, h, blackToo) {
    const cap = 0.45;
    const t = scanEdge((i, j) => L[i * w + j], h, w, blackToo, cap);
    const b = scanEdge((i, j) => L[(h - 1 - i) * w + j], h, w, blackToo, cap);
    const l = scanEdge((i, j) => L[j * w + i], w, h, blackToo, cap);
    const r = scanEdge((i, j) => L[j * w + (w - 1 - i)], w, h, blackToo, cap);
    return { l, t, r, b };
  }

  // ---------------------------------------------------------------------------------------------- background level
  // the dominant luma of a rectangle (histogram mode in 4-level bins, refined to the mean of pixels within +-8),
  // plus the mean colour of those pixels (so the un-premultiply step can use the ground's own tint)
  function background(id, L, rect) {
    const hist = new Uint32Array(64), d = id.data, w = id.width;
    for (let y = rect.y0; y < rect.y1; y++) for (let x = rect.x0; x < rect.x1; x++) hist[L[y * w + x] >> 2]++;
    let mode = 0; for (let i = 1; i < 64; i++) if (hist[i] > hist[mode]) mode = i;
    const centre = mode * 4 + 2;
    let n = 0, sl = 0, sr = 0, sg = 0, sb = 0;
    for (let y = rect.y0; y < rect.y1; y++) for (let x = rect.x0; x < rect.x1; x++) {
      const i = y * w + x, v = L[i];
      if (Math.abs(v - centre) <= 8) { n++; sl += v; sr += d[i * 4]; sg += d[i * 4 + 1]; sb += d[i * 4 + 2]; }
    }
    return n ? { luma: sl / n, rgb: [sr / n, sg / n, sb / n] } : { luma: centre, rgb: [centre, centre, centre] };
  }

  // ---------------------------------------------------------------------------------------------- components
  // 4-connected components of mask (Uint8Array, 1 = art) inside a w x h grid; returns { labels, comps }
  function components(mask, w, h) {
    const labels = new Int32Array(w * h), comps = [], stack = new Int32Array(w * h);
    let next = 1;
    for (let p = 0; p < w * h; p++) {
      if (!mask[p] || labels[p]) continue;
      const c = { id: next, area: 0, x0: w, y0: h, x1: 0, y1: 0 };
      let sp = 0; stack[sp++] = p; labels[p] = next;
      while (sp) {
        const q = stack[--sp], qx = q % w, qy = (q - qx) / w;
        c.area++; if (qx < c.x0) c.x0 = qx; if (qx > c.x1) c.x1 = qx; if (qy < c.y0) c.y0 = qy; if (qy > c.y1) c.y1 = qy;
        if (qx > 0 && mask[q - 1] && !labels[q - 1]) { labels[q - 1] = next; stack[sp++] = q - 1; }
        if (qx < w - 1 && mask[q + 1] && !labels[q + 1]) { labels[q + 1] = next; stack[sp++] = q + 1; }
        if (qy > 0 && mask[q - w] && !labels[q - w]) { labels[q - w] = next; stack[sp++] = q - w; }
        if (qy < h - 1 && mask[q + w] && !labels[q + w]) { labels[q + w] = next; stack[sp++] = q + w; }
      }
      comps.push(c); next++;
    }
    return { labels, comps };
  }

  // ---------------------------------------------------------------------------------------------- keying
  // Keys a region of a source to RGBA: alpha from luma relative to the measured ground (IMAGERY.md 2 keying rule),
  // colour un-premultiplied against the ground (the source is art composited over its ground), transparent pixels
  // zeroed, despeckled, cropped to the content box + 2 px. Returns a canvas plus the measurements.
  async function keyRegion(opts) {
    const im = await load(opts.source);
    const id = pixelsOf(im, !!opts.invert), W = id.width, H = id.height, d = id.data;
    const L = lumaArray(id);
    const frame = measureFrame(L, W, H, false);
    const rg = opts.region || [0, 0, 1, 1];
    const rect = {
      x0: Math.max(frame.l, Math.round(rg[0] * W)), y0: Math.max(frame.t, Math.round(rg[1] * H)),
      x1: Math.min(W - frame.r, Math.round(rg[2] * W)), y1: Math.min(H - frame.b, Math.round(rg[3] * H)),
    };
    const rw = rect.x1 - rect.x0, rh = rect.y1 - rect.y0;
    if (rw < 8 || rh < 8) throw new Error('empty region for ' + opts.source);
    const bg = background(id, L, rect);
    const grey = opts.mode === 'grey' || opts.mode === 'grey-dark';
    // alpha = clamp((distance - lo) / span): pure black art (12, 60), a measured ground (10, 50), grey (12, 40);
    // 'grey-dark' keys only the ink darker than the grey (pencil lines, painted white later); lo/span can be set
    // per decoration for faint pencil work
    const lo = opts.lo != null ? opts.lo : grey ? 12 : bg.luma < 8 ? 12 : 10;
    const span = opts.span != null ? opts.span : grey ? 40 : bg.luma < 8 ? 60 : 50;
    const A = new Float32Array(rw * rh), mask = new Uint8Array(rw * rh);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const v = L[(rect.y0 + y) * W + rect.x0 + x];
      const dist = opts.mode === 'grey-dark' ? bg.luma - v : grey ? Math.abs(v - bg.luma) : bg.luma < 8 ? v : v - bg.luma;
      const a = clamp01((dist - lo) / span);
      A[y * rw + x] = a; mask[y * rw + x] = a >= 0.35 ? 1 : 0;
    }
    // erase: rectangles (source fractions) of neighbouring art that must never appear (e.g. the branch blossoms
    // beside the 7.webp lily)
    (opts.erase || []).forEach((e) => {
      const ex0 = Math.max(0, Math.round(e[0] * W) - rect.x0), ey0 = Math.max(0, Math.round(e[1] * H) - rect.y0);
      const ex1 = Math.min(rw, Math.round(e[2] * W) - rect.x0), ey1 = Math.min(rh, Math.round(e[3] * H) - rect.y0);
      for (let y = ey0; y < ey1; y++) for (let x = ex0; x < ex1; x++) { A[y * rw + x] = 0; mask[y * rw + x] = 0; }
    });
    // despeckle: drop small components and components crossing a named region edge
    const minArea = opts.minArea != null ? opts.minArea : 24;
    const drop = opts.dropTouching || [];
    const { labels, comps } = components(mask, rw, rh);
    const kill = new Uint8Array(comps.length + 1);
    let kept = 0;
    comps.forEach((c) => {
      let bad = c.area < minArea;
      if (!bad && drop.length) {
        if (drop.includes('left') && c.x0 <= 0) bad = true;
        if (drop.includes('right') && c.x1 >= rw - 1) bad = true;
        if (drop.includes('top') && c.y0 <= 0) bad = true;
        if (drop.includes('bottom') && c.y1 >= rh - 1) bad = true;
      }
      if (bad) kill[c.id] = 1; else kept++;
    });
    // feather: the alpha fades to zero over the last ~7 % of the region toward each named edge (a crop through
    // continuous art, such as the embroidered garland, never ends in a straight line); the components were measured
    // on the unfeathered mask above, so the fade never changes what is kept
    const feather = opts.feather || [];
    if (feather.length) {
      const fw = Math.max(8, Math.round((opts.featherPx != null ? opts.featherPx : 0.07 * Math.min(rw, rh))));
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        let k = 1;
        if (feather.includes('left')) k = Math.min(k, (x + 0.5) / fw);
        if (feather.includes('right')) k = Math.min(k, (rw - x - 0.5) / fw);
        if (feather.includes('top')) k = Math.min(k, (y + 0.5) / fw);
        if (feather.includes('bottom')) k = Math.min(k, (rh - y - 0.5) / fw);
        if (k < 1) A[y * rw + x] *= clamp01(k) * clamp01(k);   // ease-in: most of the fade happens at the very edge
      }
    }
    // soft pixels (alpha < .35) survive only next to a kept component: dilate the kept mask by 2 px
    const keep = new Uint8Array(rw * rh);
    for (let p = 0; p < rw * rh; p++) if (labels[p] && !kill[labels[p]]) keep[p] = 1;
    const near = new Uint8Array(rw * rh);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      if (!keep[y * rw + x]) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy >= 0 && yy < rh && xx >= 0 && xx < rw) near[yy * rw + xx] = 1;
      }
    }
    // content box
    let bx0 = rw, by0 = rh, bx1 = -1, by1 = -1;
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const p = y * rw + x;
      if (!near[p]) A[p] = 0;
      if (A[p] > 0.04) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    }
    if (bx1 < 0) throw new Error('nothing survived keying for ' + opts.source);
    bx0 = Math.max(0, bx0 - 2); by0 = Math.max(0, by0 - 2); bx1 = Math.min(rw - 1, bx1 + 2); by1 = Math.min(rh - 1, by1 + 2);
    const cw = bx1 - bx0 + 1, ch = by1 - by0 + 1;
    const out = ctx2d(canvas(cw, ch)), oid = out.createImageData(cw, ch), od = oid.data;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const p = (by0 + y) * rw + bx0 + x, a = A[p], o = (y * cw + x) * 4;
      if (a <= 0) { od[o] = od[o + 1] = od[o + 2] = 0; od[o + 3] = 0; continue; }
      const s = ((rect.y0 + by0 + y) * W + rect.x0 + bx0 + x) * 4;
      if (opts.paint === 'white') od[o] = od[o + 1] = od[o + 2] = 255;   // black ink on grey becomes white line art
      else {
        for (let k = 0; k < 3; k++) {
          const c = d[s + k], g = bg.rgb[k];
          od[o + k] = a >= 1 ? c : Math.max(0, Math.min(255, Math.round(g + (c - g) / a)));
        }
        // liftDark (the grey-keyed flash branch): ink darker than 90 is lifted to 72-90 so the trunk keeps a body on
        // the black page (and inverts to a light grey) instead of vanishing inside its own white halo
        if (opts.liftDark) {
          const l = 0.2126 * od[o] + 0.7152 * od[o + 1] + 0.0722 * od[o + 2];
          if (l < 90) { const t = 72 + l * 0.2, v = Math.round(l > 1 ? t : 72); od[o] = Math.round(l > 1 ? od[o] * t / l : v); od[o + 1] = Math.round(l > 1 ? od[o + 1] * t / l : v); od[o + 2] = Math.round(l > 1 ? od[o + 2] * t / l : v); }
        }
      }
      od[o + 3] = Math.round(a * 255);
    }
    out.putImageData(oid, 0, 0);
    return { canvas: out.canvas, frame, bg, rect, box: { x: rect.x0 + bx0, y: rect.y0 + by0, w: cw, h: ch }, comps: comps.length, kept };
  }

  function transform(cv, opts) {   // rotate 180 and/or flip horizontally, then fit the long side to maxSide
    let w = cv.width, h = cv.height;
    const maxSide = opts.maxSide || 640, scale = Math.min(1, maxSide / Math.max(w, h));
    const ow = Math.max(1, Math.round(w * scale)), oh = Math.max(1, Math.round(h * scale));
    const o = ctx2d(canvas(ow, oh));
    o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
    o.save();
    o.translate(ow / 2, oh / 2);
    if (opts.rotate === 180) o.rotate(Math.PI);
    if (opts.flip) o.scale(-1, 1);
    o.drawImage(cv, -ow / 2, -oh / 2, ow, oh);
    o.restore();
    return o.canvas;
  }

  // grey + alpha bytes of a canvas (luma of the un-premultiplied colour), base64 for the trip to Node
  function greyAlpha(cv) {
    const id = ctx2d(cv).getImageData(0, 0, cv.width, cv.height), d = id.data, n = cv.width * cv.height;
    const ga = new Uint8Array(n * 2);
    for (let i = 0, j = 0; i < n; i++, j += 4) { ga[i * 2] = Math.round(0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2]); ga[i * 2 + 1] = d[j + 3]; }
    let s = '';
    for (let i = 0; i < ga.length; i += 0x8000) s += String.fromCharCode.apply(null, ga.subarray(i, i + 0x8000));
    return btoa(s);
  }

  async function deco(opts) {
    const r = await keyRegion(opts);
    const cv = transform(r.canvas, opts);
    const out = { w: cv.width, h: cv.height, frame: r.frame, bg: Math.round(r.bg.luma), box: r.box, comps: r.comps, kept: r.kept };
    if (opts.png) out.dataUrl = cv.toDataURL('image/png'); else out.ga = greyAlpha(cv);
    return out;
  }

  // petal sheets: every component of a keyed sheet, row-major, each fitted to `size` px on its long side
  async function petals(opts) {
    const r = await keyRegion({ source: opts.source, minArea: opts.minArea || 300 });
    const cv = r.canvas, w = cv.width, h = cv.height;
    const id = ctx2d(cv).getImageData(0, 0, w, h), d = id.data;
    const mask = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) mask[p] = d[p * 4 + 3] > 40 ? 1 : 0;
    const { comps } = components(mask, w, h);
    const list = comps.filter((c) => c.area >= (opts.minArea || 300)).sort((a, b) => (Math.round(a.y0 / 60) - Math.round(b.y0 / 60)) || (a.x0 - b.x0));
    const size = opts.size || 32;
    return list.slice(0, opts.max || 16).map((c) => {
      const cw = c.x1 - c.x0 + 3, ch = c.y1 - c.y0 + 3, s = size / Math.max(cw, ch);
      const ow = Math.max(1, Math.round(cw * s)), oh = Math.max(1, Math.round(ch * s));
      const o = ctx2d(canvas(ow, oh));
      o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
      o.drawImage(cv, c.x0 - 1, c.y0 - 1, cw, ch, 0, 0, ow, oh);
      return { ga: greyAlpha(o.canvas), w: ow, h: oh, area: c.area };
    });
  }

  // ---------------------------------------------------------------------------------------------- covers
  // the bright mass inside a circle (centre cx, cy, radius rad, in px): the subject is what is brighter than the
  // ground (threshold = max(median + 40, (median + p90) / 2) of the circle's luma), its centroid, and the radius
  // around that centroid holding 85 % of it. Portrait crops (artists, Liked) are centred on it.
  function measureMass(L, W, H, cx, cy, rad) {
    const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(W - 1, Math.ceil(cx + rad));
    const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(H - 1, Math.ceil(cy + rad));
    const vals = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy <= rad * rad) vals.push(L[y * W + x]); }
    if (!vals.length) return null;
    const sorted = vals.slice().sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)], p90 = sorted[Math.floor(sorted.length * 0.9)];
    const thr = Math.max(med + 40, (med + p90) / 2);
    let sx = 0, sy = 0, n = 0, top = 0, left = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy <= rad * rad && L[y * W + x] >= thr) { n++; sx += x; sy += y; if (dy < 0) top++; if (dx < 0) left++; } }
    if (!n) return null;
    const mx = sx / n, my = sy / n, dist = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy <= rad * rad && L[y * W + x] >= thr) dist.push(Math.hypot(x - mx, y - my)); }
    dist.sort((a, b) => a - b);
    const pc = (v) => Math.round(v / n * 100);
    return { cx: Math.round(mx), cy: Math.round(my), r: Math.round(dist[Math.floor(dist.length * 0.85)]), thr: Math.round(thr), n, halves: [pc(top), pc(n - top), pc(left), pc(n - left)] };
  }
  // the same measurement inside the inscribed circle of a planned crop (what the artist circle will show): the
  // centroid's offset from the circle's centre in px, and the mass share of each half
  async function cropMass(src, crop) {
    const im = await load(src);
    const id = pixelsOf(im, false), L = lumaArray(id);
    const R = crop.side / 2, cx = crop.x + R, cy = crop.y + R;
    const m = measureMass(L, id.width, id.height, cx, cy, R);
    if (!m) return null;
    return { ox: m.cx - cx, oy: m.cy - cy, r: m.r, n: m.n, thr: m.thr, halves: m.halves };
  }
  async function info(src, blackToo, focus) {
    const im = await load(src);
    const id = pixelsOf(im, false), L = lumaArray(id);
    const out = { w: id.width, h: id.height, frame: measureFrame(L, id.width, id.height, blackToo !== false) };
    if (focus) {
      const minWH = Math.min(id.width, id.height);
      out.mass = measureMass(L, id.width, id.height, focus[0] * id.width, focus[1] * id.height, focus[2] * minWH * 1.15);
    }
    return out;
  }

  const COVER_FONT = (px) => px + 'px DotGothic16, "MS Gothic", monospace';
  let fontOk = false;
  async function ready() {
    try { await document.fonts.load('30px DotGothic16'); await document.fonts.load('224px DotGothic16'); await document.fonts.ready; } catch (e) {}
    fontOk = document.fonts.check('30px DotGothic16');
    return { fontOk };
  }

  // the DESIGN 5.6 overlays, the same geometry as Flora.paintCover: numeral, label strip, pixel blossom mark
  function overlays(c, S, ov, markPath) {
    if (!ov) return;
    if (ov.numeral) {
      c.font = COVER_FONT(Math.round(S * 0.56));
      c.textAlign = 'right'; c.textBaseline = 'alphabetic'; c.lineJoin = 'miter';
      c.lineWidth = S * 0.06; c.strokeStyle = '#000000'; c.strokeText(String(ov.numeral), S * 0.95, S * 0.9);
      c.fillStyle = '#ffffff'; c.fillText(String(ov.numeral), S * 0.95, S * 0.9);
      c.textAlign = 'left';
    }
    if (ov.label) {
      const fs = Math.max(8, Math.round(S * 0.075));
      c.font = COVER_FONT(fs); c.textBaseline = 'middle'; c.textAlign = 'left';
      let txt = '> ' + String(ov.label).toLowerCase();
      const max = S * 0.84;
      if (c.measureText(txt).width > max) { while (txt.length > 3 && c.measureText(txt + '…').width > max) txt = txt.slice(0, -1); txt += '…'; }
      const tw = c.measureText(txt).width;
      c.fillStyle = '#000000'; c.fillRect(0, S - fs * 2, Math.ceil(tw + fs * 1.2), fs * 2);
      c.fillStyle = '#ffffff'; c.fillText(txt, Math.round(fs * 0.6), Math.round(S - fs));
    }
    if (ov.mark && markPath) {
      const cell = Math.max(1, Math.round(S / 128)), m = Math.round(S * 0.045);
      const x0 = S - 13 * cell - m, y0 = m, p = new Path2D(markPath);
      c.save();
      c.fillStyle = '#000000';
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {   // the 3x3-cell halo
        c.save(); c.translate(x0 + dx * cell, y0 + dy * cell); c.scale(cell, cell); c.fill(p); c.restore();
      }
      c.fillStyle = '#ffffff';
      c.translate(x0, y0); c.scale(cell, cell); c.fill(p);
      c.restore();
    }
  }

  // spec: { src, crop: {x, y, side, flip}, size, quality, lift (ctx.filter), dim (ctx.filter), liked, overlay, markPath }
  async function cover(spec) {
    const cv = await renderCover(spec);
    return cv.toDataURL('image/jpeg', spec.quality || 0.82);
  }
  // readability at row size: the mean and standard deviation of the luma of the crop (no overlay) downsampled to
  // 48 px, as the library rows and track tables show it; work.js re-rolls flat (std < 30) or dark (mean < 40) crops
  async function coverStats(spec) {
    const cv = await renderCover(Object.assign({}, spec, { overlay: null }));
    const n = 48, o = ctx2d(canvas(n, n));
    o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
    const mid = canvas(192, 192), mc = mid.getContext('2d');
    mc.imageSmoothingEnabled = true; mc.imageSmoothingQuality = 'high';
    mc.drawImage(cv, 0, 0, 192, 192);
    o.drawImage(mid, 0, 0, n, n);
    const d = o.getImageData(0, 0, n, n).data;
    let sum = 0, sq = 0;
    for (let i = 0; i < n * n; i++) { const l = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]; sum += l; sq += l * l; }
    const mean = sum / (n * n), std = Math.sqrt(Math.max(0, sq / (n * n) - mean * mean));
    return { mean: Math.round(mean), std: Math.round(std) };
  }
  async function renderCover(spec) {
    const im = await load(spec.src);
    const S = spec.size || 400, cv = canvas(S, S), c = cv.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.fillStyle = '#000000'; c.fillRect(0, 0, S, S);
    c.save();
    const filters = [spec.lift, spec.dim].filter(Boolean).join(' ');
    if (filters) c.filter = filters;
    if (spec.crop.flip) { c.translate(S, 0); c.scale(-1, 1); }
    // two-step downscale for crops more than twice the output size (cleaner than one bilinear pass)
    const ratio = spec.crop.side / S;
    if (ratio > 2) {
      const mid = canvas(S * 2, S * 2), mc = mid.getContext('2d');
      mc.imageSmoothingEnabled = true; mc.imageSmoothingQuality = 'high';
      mc.drawImage(im, spec.crop.x, spec.crop.y, spec.crop.side, spec.crop.side, 0, 0, S * 2, S * 2);
      c.drawImage(mid, 0, 0, S * 2, S * 2, 0, 0, S, S);
    } else c.drawImage(im, spec.crop.x, spec.crop.y, spec.crop.side, spec.crop.side, 0, 0, S, S);
    c.restore();
    if (spec.liked) {   // the old diagonal violet-to-mint gradient, multiplied at low opacity (the lotus stays >= #cfcfcf)
      c.save();
      const g = c.createLinearGradient(0, 0, S, S);
      g.addColorStop(0, '#3b12d6'); g.addColorStop(0.55, '#8f7ae8'); g.addColorStop(1, '#c4efd9');
      c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.25;
      c.fillStyle = g; c.fillRect(0, 0, S, S);
      c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.16;
      c.fillRect(0, 0, S, S);
      c.restore();
    }
    overlays(c, S, spec.overlay, spec.markPath);
    return cv;
  }

  window.Pipeline = { load, info, cropMass, deco, petals, cover, coverStats, ready, fontOk: () => fontOk };
})();
