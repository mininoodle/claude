// imagery/pipeline/png.js — a small PNG encoder for the decorations and petals: 8-bit greyscale + alpha
// (colour type 4), values quantised to `step` levels so the deflate stream stays small, adaptive scanline filters.
// White art on transparent has no colour to lose; the canvas's own RGBA PNGs were 3-5x heavier.
'use strict';
const zlib = require('zlib');

const CRC = new Int32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; }
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii'), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

// ga: Uint8Array/Buffer of w*h*2 bytes (grey, alpha); step: quantisation step (1 = none)
function encodeGreyAlpha(w, h, ga, step = 8) {
  const bpp = 2, stride = w * bpp;
  const q = (v) => step <= 1 ? v : Math.min(255, Math.round(v / step) * step);
  const px = Buffer.alloc(stride * h);
  for (let i = 0; i < w * h; i++) {
    let a = ga[i * 2 + 1], g = ga[i * 2];
    a = a >= 250 ? 255 : q(a);
    g = a === 0 ? 0 : (g >= 250 ? 255 : q(g));
    px[i * 2] = g; px[i * 2 + 1] = a;
  }
  const out = Buffer.alloc((stride + 1) * h);
  const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
  for (let y = 0; y < h; y++) {
    const row = px.subarray(y * stride, (y + 1) * stride), prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const c = cand[f];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? row[i - bpp] : 0, b = prev ? prev[i] : 0, cc = prev && i >= bpp ? prev[i - bpp] : 0;
        let v;
        if (f === 0) v = row[i];
        else if (f === 1) v = row[i] - a;
        else if (f === 2) v = row[i] - b;
        else if (f === 3) v = row[i] - ((a + b) >> 1);
        else { const p = a + b - cc, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc); v = row[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : cc); }
        v &= 255; c[i] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    out[y * (stride + 1)] = best;
    cand[best].copy(out, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 4; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit, grey+alpha, deflate, adaptive, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(out, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { encodeGreyAlpha };
