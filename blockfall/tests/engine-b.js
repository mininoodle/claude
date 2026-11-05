// Blockfall bot engine "b": shallow search, rich evaluation.
// It searches the current piece and the hold option plus up to 2 next pieces. The strength is in the
// evaluation: T-spin slots that a T can really reach, one well for quads, B2B and combo value, perfect
// clears, and garbage-aware weights that switch to survival when the stack or the incoming garbage is high.
(function (G) {
  'use strict';
  const clock = typeof performance !== 'undefined' && typeof performance.now === 'function' ? () => performance.now() : () => Date.now();
  const PN = 'IJLOSTZ', P_I = 0, P_O = 3, P_T = 5, DEAD = -1e9, NOSP = -99;
  const MV = ['left', 'right', 'cw', 'ccw', '180', 'sonic', 'down'];
  const DIRS = [1, 3, 2];
  let COLS = 10, ROWS = 24, HID = 4, FULL = 1023, GB = 1024, WALL = 2049, TM = 2047;
  let ATK = [[0, 0, 1, 2, 4], [0, 0, 1], [0, 2, 4, 6]], CATK = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];

  // Piece tables. pr = piece * 4 + rotation. Masks are shifted per x (x + 3 in 0..15), one per filled matrix row.
  const NROW = new Int8Array(28), ROW0 = new Int8Array(28), XMIN = new Int8Array(28), XMAX = new Int8Array(28);
  const MSK = new Int32Array(28 * 16 * 4), BOT = new Int8Array(28 * 4);
  const CR = new Int8Array(28), CDX = new Int8Array(28), CDY = new Int8Array(28);
  const KN = new Int8Array(28 * 3), KX = new Int8Array(28 * 3 * 8), KY = new Int8Array(28 * 3 * 8);
  const POP = new Uint8Array(4096);
  for (let i = 1; i < 4096; i++) POP[i] = POP[i >> 1] + (i & 1);

  // Weights. Step terms are added per placement along a search path, board terms at the leaf.
  // WA = attack mode, WS = survival mode; the search blends them by the danger at the root.
  const F_ATK = 0, F_C1 = 1, F_C2 = 2, F_C3 = 3, F_C4 = 4, F_TS1 = 5, F_TS2 = 6, F_TS3 = 7, F_MINI = 8, F_PC = 9,
    F_WT = 10, F_BRK = 11, F_HOLE = 12, F_HROW = 13, F_COV = 14, F_BUMP = 15, F_BUMP2 = 16, F_RT = 17, F_HSUM = 18,
    F_T10 = 19, F_T15 = 20, F_WELL = 21, F_WELL2 = 22, F_SL0 = 23, F_B2B = 27, F_CMB = 28, F_PEND = 29, F_MAXH = 30,
    F_PCP = 31, F_OVH = 32, F_TH = 33, F_WEDGE = 34, F_SLF = 35, F_QR = 36, F_IH = 37, F_PRE = 38, NF = 39;
  const WA = /*WA*/[1, -0.6, -0.5, -0.1, 0.6, 0.3, 0.8, 1, -0.4, 2, -0.6, -0.5, -1.62, -0.8, -0.12, -0.08, -0.04, -0.06, -0.004, -0.15,
    -0.6, 0.25, -0.8, 0.4, 1.2, 4.86, 4.8, 2.4, 0, -0.1, -0.02, 0.3, -0.5, 0.4, 0.2, 0.6, 0, 0, 1]/*WA*/;
  const WS = /*WS*/[1.2, 0.2, 0.2, 0.2, 0.8, 0.3, 0.6, 0.8, 0, 2, -0.1, -0.1, -1.8, -1.2, -0.2, -0.1, -0.05, -0.08, -0.03, -0.4,
    -1.2, 0.1, -0.6, 0, 0.4, 1.6, 2, 1.2, 0.3, -0.3, -0.1, 0, -1, 0.1, 0.1, 0.6, 0, 0, 0]/*WS*/;
  // WB = simple beginner weights for levels 1-3: clear lines as they come, stay low, avoid holes, no well, no B2B
  const WB = /*WB*/[0.1, 0.21, 0.42, 0.63, 0.84, 0, 0, 0, 0, 2, 0, 0, -1, -0.3, -0.05, -0.05, -0.01, 0, -0.14, -0.1,
    -0.3, 0, -0.3, 0, 0, 0, 0, 0, 0, -0.14, 0, 0, -0.8, 0, 0, 1, 0, 0, 0]/*WB*/;
  const DANGER = /*DG*/[6, 14]/*DG*/;
  const WCAP = 5;
  const W = new Float64Array(NF);

  // Levels: depth, root nodes expanded (0 = all), beam for the last ply, hold, slots, spins, mistake chance, noise, top-k,
  // plain drops only (no tucks or spins after a soft drop), share of the beginner weights (the rest is the full
  // weights), largest value loss of a mistake, most last-ply beam nodes below one root move (0 = no cap)
  const LV = [null,
    [1, 0, 0, 0, 0, 0, 0.2, 0.1, 3, 1, 1, 0.5],
    [1, 0, 0, 0, 0, 0, 0.18, 0.1, 3, 1, 0.85, 0.5],
    [1, 0, 0, 1, 0, 0, 0.15, 0.08, 3, 1, 0.4, 0.4],
    [1, 0, 0, 1, 1, 1, 0.35, 0.25, 4, 0, 0.35, 1],
    [1, 0, 0, 1, 1, 1, 0.2, 0.12, 3, 0, 0.1, 0.7],
    [1, 0, 0, 1, 1, 1, 0.05, 0.05, 2, 0, 0, 0.4],
    [2, 6, 0, 1, 1, 1, 0.1, 0.08, 3, 0, 0, 0.5],
    [2, 0, 0, 1, 1, 1, 0.03, 0.03, 2, 0, 0, 0.3],
    [3, 12, 8, 1, 1, 1, 0, 0, 1, 0, 0, 0, 4],
    [3, 0, 48, 1, 1, 1, 0, 0, 1, 0, 0, 0, 6]];

  function init(cfg) {
    COLS = cfg.cols; ROWS = cfg.rows; HID = cfg.hidden; FULL = (1 << COLS) - 1; GB = 1 << COLS;
    WALL = 1 | (1 << (COLS + 1)); TM = (1 << (COLS + 1)) - 1;
    ATK = [cfg.atk.none, cfg.atk.mini, cfg.atk.full]; CATK = cfg.comboAtk;
    const C0 = new Int8Array(28);
    for (let p = 0; p < 7; p++) {
      const ms = cfg.pieces[PN[p]], keys = [];
      for (let r = 0; r < 4; r++) {
        const m = ms[r], pr = p * 4 + r;
        let c0 = 99, c1 = -1, r0 = 99, r1 = -1;
        for (let i = 0; i < m.length; i++) for (let j = 0; j < m[i].length; j++) if (m[i][j]) {
          if (j < c0) c0 = j; if (j > c1) c1 = j; if (i < r0) r0 = i; if (i > r1) r1 = i;
        }
        NROW[pr] = r1 - r0 + 1; ROW0[pr] = r0; XMIN[pr] = -c0; XMAX[pr] = COLS - 1 - c1; C0[pr] = c0;
        for (let j = 0; j < 4; j++) {
          BOT[pr * 4 + j] = -1;
          for (let i = 0; i < m.length; i++) if (j < m[i].length && m[i][j]) BOT[pr * 4 + j] = i;
        }
        for (let i = 0; i < NROW[pr]; i++) {
          let bits = 0;
          const row = m[r0 + i];
          for (let j = 0; j < row.length; j++) if (row[j]) bits |= 1 << j;
          for (let x = XMIN[pr]; x <= XMAX[pr]; x++) MSK[(pr * 16 + x + 3) * 4 + i] = x >= 0 ? bits << x : bits >> -x;
        }
        const cells = [];
        for (let i = 0; i < m.length; i++) for (let j = 0; j < m[i].length; j++) if (m[i][j]) cells.push((i - r0) * 8 + j - c0);
        keys.push(cells.sort((a, b) => a - b).join(','));
        let cr = r;
        for (let q = 0; q < r; q++) if (keys[q] === keys[r]) { cr = q; break; }
        CR[pr] = cr; CDX[pr] = c0 - C0[p * 4 + cr]; CDY[pr] = r0 - ROW0[p * 4 + cr];
      }
      if (p === P_O) continue;
      for (let r = 0; r < 4; r++) for (let di = 0; di < 3; di++) {
        const to = (r + DIRS[di]) & 3, k = (p * 4 + r) * 3 + di;
        const list = (di === 2 ? cfg.kicks.R180 : p === P_I ? cfg.kicks.I : cfg.kicks.JLSTZ)['' + r + to];
        KN[k] = list.length;
        for (let i = 0; i < list.length; i++) { KX[k * 8 + i] = list[i][0]; KY[k * 8 + i] = list[i][1]; }
      }
    }
    return true;
  }

  function fits(b, o, pr, x, y) {
    if (x < XMIN[pr] || x > XMAX[pr]) return false;
    const n = NROW[pr], mi = (pr * 16 + x + 3) * 4;
    let yy = y + ROW0[pr];
    for (let i = 0; i < n; i++, yy++) {
      if (yy >= ROWS) return false;
      if (yy >= 0 && (b[o + yy] & MSK[mi + i]) !== 0) return false;
    }
    return true;
  }
  function solid(b, o, x, y) { return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && ((b[o + y] >> x) & 1) === 1); }
  // The game's tspin(): 0 none, 1 mini, 2 full
  function spinAt(b, o, x, y, r, k4) {
    const tl = solid(b, o, x, y), tr = solid(b, o, x + 2, y), br = solid(b, o, x + 2, y + 2), bl = solid(b, o, x, y + 2);
    if (tl + tr + br + bl < 3) return 0;
    const front = r === 0 ? tl && tr : r === 1 ? tr && br : r === 2 ? br && bl : bl && tl;
    return front || k4 ? 2 : 1;
  }
  function spawnY(b, o, p) {
    const pr = p * 4, x = p === P_O ? 4 : 3;
    let y = HID - 2;
    while (!fits(b, o, pr, x, y) && y > -1) y--;
    if (!fits(b, o, pr, x, y)) return NOSP;
    if (fits(b, o, pr, x, y + 1)) y++;
    return y;
  }

  // ---- move generation: shortest input paths to every resting outcome, one per (cells, spin) ----
  // A search over all 7 inputs, ordered by input count (bucket queue). In the free band (rows where no input can
  // touch a block) every input except down only meets the walls, so the rows in between are skipped: down from the
  // band is one edge of k downs to the first row below the band. Paths stay exactly as short as a plain BFS.
  // state = flag << 11 | r << 9 | (y + 4) << 4 | (x + 3); flag: 0 = last input not a rotation, 1 = rotation, 2 = rotation with kick 4
  const NST = 3 << 11, MAXD = 128;
  const vis = new Int32Array(NST), par = new Int32Array(NST), mov = new Int8Array(NST), cnt = new Int8Array(NST), dist = new Int16Array(NST);
  const drp = new Uint8Array(NST);   // 1 once the path has dropped (sonic or down)
  const ost = new Int32Array(NST);
  const bHead = new Int32Array(MAXD), bTail = new Int32Array(MAXD), eS = new Int32Array(NST * 8), eNx = new Int32Array(NST * 8);
  const MAXO = 1024;
  const OX = new Int8Array(MAXO), OY = new Int8Array(MAXO), ORT = new Int8Array(MAXO), OSP = new Int8Array(MAXO), OID = new Int32Array(MAXO);
  const OSIM = new Uint8Array(MAXO); // 1 = a plain drop: no input after the first sonic or down
  let NO = 0, stamp = 0, bfsN = 0, eN = 0, maxD = 0;

  // Lowest row a sonic drop reaches; uses the column tops when the piece is above them
  const gtop = new Int32Array(16), lband = new Int32Array(16);
  function landing(b, o, pr, x, y) {
    let ly = 99;
    for (let j = 0; j < 4; j++) {
      const bt = BOT[pr * 4 + j];
      if (bt < 0) continue;
      const t = gtop[x + j];
      if (y + bt >= t) { ly = -99; break; }
      if (t - 1 - bt < ly) ly = t - 1 - bt;
    }
    if (ly !== -99) return ly;
    ly = y + 1;
    while (fits(b, o, pr, x, ly + 1)) ly++;
    return ly;
  }
  function relax(n, s, d, m, k) {
    if (vis[n] === stamp && dist[n] <= d) return;
    vis[n] = stamp; dist[n] = d; par[n] = s; mov[n] = m; cnt[n] = k; drp[n] = (s >= 0 && drp[s]) || m >= 5 ? 1 : 0;
    if (d >= MAXD) d = MAXD - 1;
    const e = eN++;
    eS[e] = n; eNx[e] = -1;
    if (bHead[d] < 0) bHead[d] = e; else eNx[bTail[d]] = e;
    bTail[d] = e;
    if (d > maxD) maxD = d;
  }

  function genMoves(b, o, p, sx, sy, sr) {
    const st = ++stamp;
    NO = 0; bfsN++; eN = 0; maxD = 0;
    for (let d = 0; d < MAXD; d++) bHead[d] = -1;
    for (let c = 0; c < COLS; c++) gtop[c] = ROWS;
    let acc = 0;
    for (let y = 0; y < ROWS && acc !== FULL; y++) {
      let nw = b[o + y] & FULL & ~acc;
      if (!nw) continue;
      acc |= nw;
      do { const lb = nw & -nw; gtop[31 - Math.clz32(lb)] = y; nw ^= lb; } while (nw);
    }
    // lband[x + 3]: last row of the free band for a piece at x (no input from there can touch columns x - 2 .. x + 5)
    for (let x = -3; x <= 12; x++) {
      let t = ROWS;
      for (let c = x - 2 < 0 ? 0 : x - 2, ce = x + 5 < COLS ? x + 5 : COLS - 1; c <= ce; c++) if (gtop[c] < t) t = gtop[c];
      lband[x + 3] = t - 6;
    }
    relax((sr << 9) | ((sy + 4) << 4) | (sx + 3), -1, 0, -1, 0);
    const isT = p === P_T, canRot = p !== P_O, p4 = p * 4;
    for (let d = 0; d <= maxD; d++) for (let e = bHead[d]; e >= 0; e = eNx[e]) {
      const s = eS[e];
      if (dist[s] !== d) continue;
      const x = (s & 15) - 3, y = ((s >> 4) & 31) - 4, r = (s >> 9) & 3, f = s >> 11, pr = p4 + r, rb = r << 9, d1 = d + 1;
      const down = fits(b, o, pr, x, y + 1);
      if (!down) {
        const sp = isT && f ? spinAt(b, o, x, y, r, f === 2) : 0;
        const k = (sp << 11) | (CR[pr] << 9) | ((y + CDY[pr] + 4) << 4) | (x + CDX[pr] + 3);
        if (ost[k] !== st && NO < MAXO) {
          ost[k] = st; OX[NO] = x; OY[NO] = y; ORT[NO] = r; OSP[NO] = sp; OID[NO] = s; OSIM[NO] = par[s] < 0 || !drp[par[s]] ? 1 : 0; NO++;
        }
      }
      if (fits(b, o, pr, x - 1, y)) relax(rb | ((y + 4) << 4) | (x + 2), s, d1, 0, 1);
      if (fits(b, o, pr, x + 1, y)) relax(rb | ((y + 4) << 4) | (x + 4), s, d1, 1, 1);
      if (canRot) for (let di = 0; di < 3; di++) {
        const to = (r + DIRS[di]) & 3, ki = (pr * 3 + di) * 8, kn = KN[pr * 3 + di], tp = p4 + to;
        for (let j = 0; j < kn; j++) {
          const nx = x + KX[ki + j], ny = y + KY[ki + j];
          if (!fits(b, o, tp, nx, ny)) continue;
          if (ny >= -4) relax(((isT ? (di !== 2 && j === 4 ? 2 : 1) : 0) << 11) | (to << 9) | ((ny + 4) << 4) | (nx + 3), s, d1, 2 + di, 1);
          break;
        }
      }
      if (down) {
        relax(rb | ((landing(b, o, pr, x, y) + 4) << 4) | (x + 3), s, d1, 5, 1);
        const yb = lband[x + 3];
        if (y < yb) relax(rb | ((yb + 5) << 4) | (x + 3), s, d + yb + 1 - y, 6, yb + 1 - y);
        else relax(rb | ((y + 5) << 4) | (x + 3), s, d1, 6, 1);
      }
    }
    return NO;
  }
  function pathOf(s) {
    const a = [];
    while (mov[s] >= 0) { for (let i = 0; i < cnt[s]; i++) a.push(MV[mov[s]]); s = par[s]; }
    return a.reverse();
  }

  // ---- board updates ----
  let lockOut = false;
  // Copies board o to no, locks the piece, clears full rows; returns the number of lines
  function place(b, o, p, r, x, y, no) {
    for (let i = 0; i < ROWS; i++) b[no + i] = b[o + i];
    const pr = p * 4 + r, n = NROW[pr], y0 = y + ROW0[pr], mi = (pr * 16 + x + 3) * 4;
    lockOut = y0 + n - 1 < HID;
    let lines = 0;
    for (let i = 0; i < n; i++) {
      const yy = y0 + i;
      if (yy >= 0) { const v = b[no + yy] | MSK[mi + i]; b[no + yy] = v; if (v === FULL) lines++; }
    }
    if (lines) {
      let w = no + ROWS - 1;
      for (let q = no + ROWS - 1; q >= no; q--) { const v = b[q]; if (v !== FULL) b[w--] = v; }
      while (w >= no) b[w--] = 0;
    }
    return lines;
  }
  // Ready garbage rises as solid rows that cannot be cleared (the hole column is unknown). False = topped out.
  function rise(b, o, g) {
    for (let i = 0; i < g; i++) if (b[o + i]) return false;
    for (let i = 0; i < ROWS - g; i++) b[o + i] = b[o + i + g];
    for (let i = ROWS - g; i < ROWS; i++) b[o + i] = FULL | GB;
    return true;
  }
  function empty(b, o) {
    if (b[o + ROWS - 1]) return false;
    for (let i = 0; i < ROWS; i++) if (b[o + i]) return false;
    return true;
  }

  // ---- evaluation ----
  const top = new Int32Array(16), hgt = new Int32Array(16);
  let slX = 0, slY = 0, slR = 0, useSlot = true;
  function tops(b, o) {
    for (let c = 0; c < COLS; c++) top[c] = ROWS;
    let acc = 0;
    for (let y = 0; y < ROWS; y++) {
      let nw = b[o + y] & FULL & ~acc;
      if (!nw) continue;
      acc |= nw;
      do { const lb = nw & -nw; top[31 - Math.clz32(lb)] = y; nw ^= lb; } while (nw);
      if (acc === FULL) break;
    }
  }
  // Can the piece drop straight down from the top to (x, y)?
  function sky(pr, x, y) {
    for (let j = 0; j < 4; j++) { const bt = BOT[pr * 4 + j]; if (bt >= 0 && top[x + j] <= y + bt) return false; }
    return true;
  }
  // Can a T reach (x, y, r) with a final rotation, from a straight drop or a drop plus a short slide?
  function reach(b, o, x, y, r) {
    const tp = P_T * 4 + r;
    for (let di = 0; di < 3; di++) {
      const rf = (r - DIRS[di] + 4) & 3, pr = P_T * 4 + rf, k = (pr * 3 + di), ki = k * 8, n = KN[k];
      for (let i = 0; i < n; i++) {
        const px = x - KX[ki + i], py = y - KY[ki + i];
        if (!fits(b, o, pr, px, py)) continue;
        let ok = true;
        for (let j = 0; j < i; j++) if (fits(b, o, tp, px + KX[ki + j], py + KY[ki + j])) { ok = false; break; }
        if (!ok) continue;
        if (sky(pr, px, py)) return true;
        for (let s = -1; s <= 1; s += 2) for (let q = 1; q <= 3; q++) {
          const qx = px + s * q;
          if (!fits(b, o, pr, qx, py)) break;
          if (sky(pr, qx, py)) return true;
        }
      }
    }
    return false;
  }
  // Best reachable full T-spin slot: returns lines it would clear (0..3) or -1; position in slX, slY, slR
  let preN = 0;
  function findSlot(b, o, mt) {
    let best = -1;
    preN = 0;
    for (let y = mt < 0 ? 0 : mt; y <= ROWS - 3; y++) {
      const R0 = b[o + y] & FULL, R1 = b[o + y + 1] & FULL, R2 = b[o + y + 2] & FULL;
      const E0 = ~R0 & FULL, E1 = ~R1 & FULL, E2 = ~R2 & FULL;
      // pointing down (r2): flat part in row y + 1, stem in row y + 2, overhang in row y
      let c = E1 & (E1 >> 1) & (E1 >> 2) & (E2 >> 1) & R2 & (R2 >> 2) & (R0 | (R0 >> 2)) & 0xff;
      // precursor: the same shape with both rows complete but no overhang yet (one more piece makes it a slot)
      if (!preN) {
        let pc = E1 & (E1 >> 1) & (E1 >> 2) & (E2 >> 1) & R2 & (R2 >> 2) & E0 & (E0 >> 1) & (E0 >> 2) & 0xff;
        while (pc) {
          const lb = pc & -pc, x = 31 - Math.clz32(lb);
          pc ^= lb;
          if ((R1 | (7 << x)) === FULL && (R2 | (2 << x)) === FULL) { preN = 1; break; }
        }
      }
      while (c) {
        const lb = c & -c, x = 31 - Math.clz32(lb);
        c ^= lb;
        const n = ((R1 | (7 << x)) === FULL ? 1 : 0) + ((R2 | (2 << x)) === FULL ? 1 : 0);
        if (n > best && reach(b, o, x, y, 2)) { best = n; slX = x; slY = y; slR = 2; }
      }
      if (best >= 3) break;
      // vertical (r1 nub right, r3 nub left): stem in rows y..y+2; only counted for 2+ lines
      c = (E0 >> 1) & (E1 >> 1) & (E1 >> 2) & (E2 >> 1) & (R0 >> 2) & (R2 >> 2) & (R0 | R2) & 0xff;
      while (c) {
        const lb = c & -c, x = 31 - Math.clz32(lb);
        c ^= lb;
        const n = ((R0 | (2 << x)) === FULL ? 1 : 0) + ((R1 | (6 << x)) === FULL ? 1 : 0) + ((R2 | (2 << x)) === FULL ? 1 : 0);
        if (n >= 2 && n > best && reach(b, o, x, y, 1)) { best = n; slX = x; slY = y; slR = 1; }
      }
      c = (E0 >> 1) & E1 & (E1 >> 1) & (E2 >> 1) & R0 & R2 & ((R0 | R2) >> 2) & 0xff;
      while (c) {
        const lb = c & -c, x = 31 - Math.clz32(lb);
        c ^= lb;
        const n = ((R0 | (2 << x)) === FULL ? 1 : 0) + ((R1 | (3 << x)) === FULL ? 1 : 0) + ((R2 | (2 << x)) === FULL ? 1 : 0);
        if (n >= 2 && n > best && reach(b, o, x, y, 3)) { best = n; slX = x; slY = y; slR = 3; }
      }
    }
    return best;
  }

  let pool = new Int32Array(24 * 1024), SCR = 0, SCR2 = 0;
  function evaluate(b, o, b2b, combo, pend, hold, hasT) {
    tops(b, o);
    let v = 0, bo = o, mt = ROWS;
    for (let c = 0; c < COLS; c++) if (top[c] < mt) mt = top[c];
    if (useSlot && mt < ROWS) {
      const n = findSlot(b, o, mt);
      if (n < 2 && preN) v += W[F_PRE];
      if (n >= 0) {
        v += hasT ? W[F_SL0 + n] : W[F_SL0 + n] * W[F_SLF];
        place(b, o, P_T, slR, slX, slY, SCR2);
        bo = SCR2; tops(b, bo);
        mt = ROWS;
        for (let c = 0; c < COLS; c++) if (top[c] < mt) mt = top[c];
      }
    }
    let maxH = 0, hs = 0, t10 = 0, t15 = 0;
    for (let c = 0; c < COLS; c++) {
      const h = ROWS - top[c], e = h + pend;
      hgt[c] = h; hs += h;
      if (h > maxH) maxH = h;
      if (e > 10) { t10 += e - 10; if (e > 15) t15 += e - 15; }
    }
    let acc = 0, holes = 0, ovh = 0, hrows = 0, cov = 0, rt = 0, seen = 0, cells = 0;
    for (let y = mt; y < ROWS; y++) {
      const r = b[bo + y] & FULL, hm = acc & ~r;
      cells += POP[r];
      if (hm) {
        const open = FULL & ~(acc | r), side = hm & ((open << 1) | (open >> 1));
        ovh += POP[side]; holes += POP[hm ^ side]; hrows++;
        let nh = hm & ~seen;
        if (nh) {
          seen |= nh;
          do { const lb = nh & -nh, d = y - top[31 - Math.clz32(lb)]; cov += d < 6 ? d : 6; nh ^= lb; } while (nh);
        }
      }
      const w = (r << 1) | WALL;
      rt += POP[(w ^ (w >> 1)) & TM];
      acc |= r;
    }
    let wc = 0;
    for (let c = 1; c < COLS; c++) if (hgt[c] < hgt[wc]) wc = c;
    const lh = wc > 0 ? hgt[wc - 1] : 99, rh = wc < COLS - 1 ? hgt[wc + 1] : 99;
    let wd = (lh < rh ? lh : rh) - hgt[wc];
    if (wd > WCAP) wd = WCAP;
    let qr = 0;
    for (let y = top[wc] - 1, m = FULL & ~(1 << wc); y >= 0 && qr < 4 && (b[bo + y] & FULL) === m; y--) qr++;
    let bump = 0, bump2 = 0, prev = -1, w2 = 0;
    for (let c = 0; c < COLS; c++) {
      if (c === wc) continue;
      if (prev >= 0) { const d = hgt[c] - hgt[prev], a = d < 0 ? -d : d; bump += a; bump2 += a * a; }
      prev = c;
      const l = c > 0 ? hgt[c - 1] : 99, rr = c < COLS - 1 ? hgt[c + 1] : 99, dd = (l < rr ? l : rr) - hgt[c];
      if (dd >= 3) w2 += dd - 2;
    }
    v += W[F_HOLE] * holes + W[F_OVH] * ovh + W[F_HROW] * hrows + W[F_COV] * cov + W[F_BUMP] * bump + W[F_BUMP2] * bump2 + W[F_RT] * rt +
      W[F_HSUM] * hs + W[F_QR] * qr + W[F_T10] * t10 + W[F_T15] * t15 + W[F_WELL] * wd + W[F_WELL2] * w2 + W[F_PEND] * pend +
      W[F_MAXH] * (maxH + pend);
    if (b2b >= 0) v += W[F_B2B];
    if (combo >= 0) v += W[F_CMB];
    if (hold === P_T) v += W[F_TH];
    else if (hold === P_I) v += W[F_IH];
    if (wc === 0 || wc === COLS - 1) v += W[F_WEDGE];
    if (holes + ovh === 0 && maxH <= 4 && cells > 0 && (maxH * COLS - cells) % 4 === 0) v += W[F_PCP];
    return v;
  }

  // ---- search ----
  const NCAP = 1 << 16;
  const nPar = new Int32Array(NCAP), nRoot = new Int32Array(NCAP), nBo = new Int32Array(NCAP);
  const nP = new Int8Array(NCAP), nX = new Int8Array(NCAP), nY = new Int8Array(NCAP), nR = new Int8Array(NCAP), nSp = new Int8Array(NCAP);
  const nHold = new Int8Array(NCAP), nCur = new Int8Array(NCAP), nQi = new Int8Array(NCAP), nRise = new Int8Array(NCAP);
  const nB2b = new Int16Array(NCAP), nCmb = new Int16Array(NCAP), nPend = new Int16Array(NCAP), nRdy = new Int16Array(NCAP);
  const nRew = new Float64Array(NCAP), nVal = new Float64Array(NCAP), nOpt = new Int8Array(NCAP), nOut = new Int16Array(NCAP);
  const tFrom = new Uint8Array(32);
  let N = 0, poolN = 0, Q = [], QN = 0, spins = true, plain = false, canHold0 = true, start0x = 0, start0y = 0, start0r = 0;

  function alloc() {
    const o = poolN * ROWS;
    poolN++;
    if (o + ROWS > pool.length) { const np = new Int32Array(pool.length * 2); np.set(pool); pool = np; }
    return o;
  }
  // Piece, start state and the following state for option opt (0 = play the current piece, 1 = use hold) of node k
  let oP = 0, oX = 0, oY = 0, oR = 0, oHold = 0, oCur = 0, oQi = 0;
  function option(k, opt) {
    const cur = nCur[k], hold = nHold[k], qi = nQi[k];
    if (opt === 0) {
      oP = cur; oHold = hold; oCur = qi < QN ? Q[qi] : -1; oQi = qi + 1;
      if (k === 0) { oX = start0x; oY = start0y; oR = start0r; return true; }
    } else {
      if (k === 0 && !canHold0) return false;
      if (hold >= 0) {
        if (hold === cur) return false;
        oP = hold; oHold = cur; oCur = qi < QN ? Q[qi] : -1; oQi = qi + 1;
      } else {
        if (qi >= QN || Q[qi] === cur) return false;
        oP = Q[qi]; oHold = cur; oCur = qi + 1 < QN ? Q[qi + 1] : -1; oQi = qi + 2;
      }
    }
    oX = oP === P_O ? 4 : 3; oR = 0; oY = spawnY(pool, nBo[k], oP);
    return oY !== NOSP;
  }
  let nb2b = 0, ncmb = 0;
  function expand(k, depth, useHold) {
    const bo = nBo[k];
    for (let opt = 0; opt < 2; opt++) {
      if (opt === 1 && !useHold) break;
      if (!option(k, opt)) continue;
      const p = oP, nh = oHold, nc = oCur, nq = oQi;
      genMoves(pool, bo, p, oX, oY, oR);
      for (let i = 0; i < NO; i++) {
        if (N >= NCAP) return;
        if (plain && depth === 1 && !OSIM[i]) continue;
        const x = OX[i], y = OY[i], r = ORT[i], spTrue = OSP[i], sp = spins ? spTrue : 0;
        const lines = place(pool, bo, p, r, x, y, SCR);
        let dead = lockOut, pend = nPend[k], rdy = nRdy[k], g = 0, atk = 0, rew = 0;
        const b2b = nB2b[k], cmb = nCmb[k];
        if (lines) {
          atk = ATK[sp][lines] || 0;
          if (lines === 4 || sp > 0) { nb2b = b2b + 1; if (nb2b > 0) atk += 1; } else nb2b = -1;
          ncmb = cmb + 1;
          if (ncmb > 0) atk += CATK[ncmb < CATK.length ? ncmb : CATK.length - 1];
          const pc = empty(pool, SCR);
          if (pc) atk += 10;
          rew = W[F_ATK] * atk + (sp === 2 ? W[F_TS1 + lines - 1] : sp === 1 ? W[F_MINI] : W[F_C1 + lines - 1]);
          if (b2b >= 0 && nb2b < 0) rew += W[F_BRK];
          if (pc) rew += W[F_PC];
          const cr = rdy < atk ? rdy : atk;
          rdy -= cr; pend -= pend < atk ? pend : atk;
        } else {
          nb2b = b2b; ncmb = -1;
          if (rdy > 0 && !dead) {
            g = rdy < 8 ? rdy : 8;
            if (!rise(pool, SCR, g)) dead = true;
            pend -= g; rdy -= g;
          }
        }
        if (p === P_T && !(sp === 2 && lines)) rew += W[F_WT];
        if (!dead && nc >= 0 && spawnY(pool, SCR, nc) === NOSP) dead = true;
        const c = N++;
        nPar[c] = k; nRoot[c] = depth === 1 ? c : nRoot[k]; nBo[c] = -1;
        nP[c] = p; nX[c] = x; nY[c] = y; nR[c] = r; nSp[c] = spTrue; nRise[c] = g;
        nHold[c] = nh; nCur[c] = nc; nQi[c] = nq;
        nB2b[c] = nb2b; nCmb[c] = ncmb; nPend[c] = pend; nRdy[c] = pend;
        nOpt[c] = opt; nOut[c] = i;
        nRew[c] = nRew[k] + rew;
        nVal[c] = dead ? DEAD : nRew[c] + evaluate(pool, SCR, nb2b, ncmb, pend, nh, nh === P_T || nc === P_T || tFrom[nq] === 1);
      }
    }
  }
  function materialize(k) {
    if (nBo[k] >= 0) return;
    const o = alloc();
    place(pool, nBo[nPar[k]], nP[k], nR[k], nX[k], nY[k], o);
    if (nRise[k]) rise(pool, o, nRise[k]);
    nBo[k] = o;
  }
  const perRoot = new Int32Array(NCAP);
  // Best w nodes of [s, e) (0 = all); cap > 0 keeps at most cap nodes below each root move
  function topNodes(s, e, w, cap) {
    const a = [];
    for (let i = s; i < e; i++) if (nVal[i] > DEAD && nCur[i] >= 0) a.push(i);
    a.sort((x, y) => nVal[y] - nVal[x] || x - y);
    if (cap > 0) {
      const b = [];
      for (let i = 0; i < a.length; i++) perRoot[nRoot[a[i]]] = 0;
      for (let i = 0; i < a.length && (w <= 0 || b.length < w); i++) if (perRoot[nRoot[a[i]]]++ < cap) b.push(a[i]);
      return b;
    }
    if (w > 0 && a.length > w) a.length = w;
    return a;
  }

  function rng(seed) {
    let a = seed | 0;
    return function () {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function think(req) {
    const t0 = clock();
    const lv = LV[Math.max(1, Math.min(10, Math.round(req.difficulty) || 10))];
    const depth = lv[0], w1 = lv[1], w2 = lv[2], useHold = !!lv[3];
    useSlot = !!lv[4]; spins = !!lv[5]; plain = !!lv[9];
    const maxMs = req.maxMs > 0 ? req.maxMs : 1e9;
    // root board, danger and blended weights
    poolN = 0;
    const ro = alloc(); SCR = alloc(); SCR2 = alloc();
    let maxH = 0;
    for (let y = 0; y < ROWS; y++) {
      const v = (req.board[y] | 0) & FULL;
      pool[ro + y] = v;
      if (v && ROWS - y > maxH) maxH = ROWS - y;
    }
    const inc = req.incoming | 0;
    let u = (maxH + inc - DANGER[0]) / (DANGER[1] - DANGER[0]);
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    for (let i = 0; i < NF; i++) W[i] = lv[10] * WB[i] + (1 - lv[10]) * (WA[i] * (1 - u) + WS[i] * u);
    Q = req.queue.map(t => PN.indexOf(t)); QN = Q.length;
    tFrom.fill(0);
    for (let i = QN - 1; i >= 0; i--) tFrom[i] = Q[i] === P_T || tFrom[i + 1] === 1 ? 1 : 0;
    canHold0 = !!req.canHold && useHold;
    start0x = req.curPos.x; start0y = req.curPos.y; start0r = req.curPos.r;
    N = 1;
    nBo[0] = ro; nPar[0] = -1; nCur[0] = PN.indexOf(req.cur); nHold[0] = req.hold ? PN.indexOf(req.hold) : -1; nQi[0] = 0;
    nB2b[0] = typeof req.b2b === 'number' ? req.b2b : -1; nCmb[0] = typeof req.combo === 'number' ? req.combo : -1;
    nPend[0] = inc; nRdy[0] = Math.min(inc, req.incomingReady | 0); nRew[0] = 0;
    bfsN = 0;
    expand(0, 1, canHold0);
    const r1 = N;
    if (r1 === 1) return {id: req.id, hold: false, inputs: [], expect: null, dead: true, nodes: 0, ms: clock() - t0};
    let ls = 1, le = r1;
    const layers = [1, r1];
    for (let d = 2; d <= depth; d++) {
      const fr = topNodes(ls, le, d === 2 ? w1 : w2, d === 2 ? 0 : lv[12] | 0);
      if (!fr.length) break;
      const s = N;
      for (let i = 0; i < fr.length; i++) {
        if (clock() - t0 > maxMs * 0.6) break;
        materialize(fr[i]);
        expand(fr[i], d, true);
      }
      if (N === s) break;
      ls = s; le = N;
      layers.push(s, N);
    }
    // value of each root option = best leaf below it, in the deepest layer that still has a live leaf
    const best = new Float64Array(r1);
    for (let L = layers.length - 2; L >= 0; L -= 2) {
      best.fill(-Infinity);
      let live = false;
      for (let i = layers[L]; i < layers[L + 1]; i++) {
        const rt = nRoot[i];
        if (nVal[i] > best[rt]) best[rt] = nVal[i];
        if (nVal[i] > DEAD) live = true;
      }
      if (live) break;
    }
    let pick = -1;
    for (let i = 1; i < r1; i++) if (best[i] > -Infinity && (pick < 0 || best[i] > best[pick])) pick = i;
    if (pick < 0) { pick = 1; for (let i = 2; i < r1; i++) if (nVal[i] > nVal[pick]) pick = i; }
    // mistakes for the lower levels: noise on the values, and sometimes a lower-ranked choice
    if (lv[6] > 0 || lv[7] > 0) {
      const R = rng((req.seed | 0) ^ 0x5bd1e995);
      const c = [];
      for (let i = 1; i < r1; i++) if (best[i] > DEAD && best[i] > -Infinity) {
        let g = 0;
        if (lv[7] > 0) { const u1 = R() || 1e-9, u2 = R(); g = lv[7] * Math.sqrt(-2 * Math.log(u1)) * Math.cos(6.283185307 * u2); }
        c.push([best[i] + g, i]);
      }
      if (c.length) {
        c.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
        let j = 0, k = 1;
        while (k < c.length && k < lv[8] && c[k][0] >= c[0][0] - lv[11]) k++;
        if (R() < lv[6] && k > 1) j = 1 + Math.floor(R() * (k - 1));
        pick = c[j][1];
      }
    }
    // rebuild the input path of the chosen root outcome
    option(0, nOpt[pick]);
    genMoves(pool, ro, oP, oX, oY, oR);
    const oi = nOut[pick];
    const inputs = pathOf(OID[oi]);
    return {
      id: req.id, hold: nOpt[pick] === 1, inputs,
      expect: {t: PN[oP], x: OX[oi], y: OY[oi], r: ORT[oi], spin: OSP[oi]},
      dead: false, nodes: N - 1, ms: +(clock() - t0).toFixed(2),
    };
  }

  G.BlockfallBot = {init, think};
  if (typeof importScripts === 'function' && typeof postMessage === 'function') {
    G.onmessage = e => {
      const m = e.data;
      if (m.type === 'init') init(m.cfg);
      else if (m.type === 'think') postMessage(think(m.req));
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : self);
