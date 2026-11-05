// Blockfall bot engine "a": beam search over the whole queue with hold, and a cheap board evaluation.
// Move generation is a flood fill over row bitmasks (left, right, down, sonic, cw, ccw, 180 with kicks),
// so tucks and spins are found. The input path for the chosen move comes from a BFS with the game's step rules.
(function (G) {
  'use strict';
  const now = typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
    ? () => performance.now() : () => Date.now();
  const NAMES = 'IJLOSTZ', PI = 0, PO = 3, PT = 5;
  const OFF = 3, YO = 8, NY = 40, NR = 4 * NY, NB = 36;
  let COLS = 10, ROWS = 24, HID = 4, FULL = 1023, XM = 8191, WALL = 0, GROW = 2047;
  let ATKN = [0, 0, 1, 2, 4], ATKM = [0, 0, 1], ATKF = [0, 2, 4, 6], CMB = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];

  // ---- piece tables (pr = p * 4 + r, row entries pr * 4 + k) ----
  const NROW = new Int8Array(28), ROFF = new Int8Array(112), RC0 = new Int8Array(112), RLEN = new Int8Array(112);
  const OMAX = new Int8Array(28), OPENF = new Int32Array(28), CANR = new Int8Array(28), CANDX = new Int8Array(28), CANDY = new Int8Array(28);
  const KN = new Int8Array(84), KTO = new Int8Array(84), KX = new Int8Array(84 * 8), KY = new Int8Array(84 * 8);
  const SPX = new Int8Array(7), DUP = new Uint8Array(7);
  const POP = new Uint8Array(4096), RT = new Uint8Array(2048);

  // ---- move generation buffers ----
  const E = new Int32Array(NY), SP = new Int32Array(5 * NY);
  const FIT = new Int32Array(NR), REACH = new Int32Array(NR), PEND = new Int32Array(NR), RA = new Int32Array(NR), RK = new Int32Array(NR), CREST = new Int32Array(NR);
  const STK = new Int32Array(NR + 8);
  const MAXO = 512, OR_ = new Int8Array(MAXO), OX = new Int8Array(MAXO), OY = new Int8Array(MAXO), OS = new Int8Array(MAXO);
  let prevTop = 0, spawnYi = 0, fitOpen = 0, openOK = true, kdy = 2;

  // ---- weights ----
  const DEF = {
    holes: -104, covd: -14, hmax: -6, hsum: -0.975, bump: -18, bump2: -5, rowT: -9, colT: -9, well: 19.5, wellCap: 6,
    dangerAt: 10, danger: -40, tslot1: 120, tslot2: 330, b2b: 71.5, holdT: 40, holdI: 15,
    atk: 70, cl1: -120, cl2: -90, cl3: -60, cl4: 160, tss: 40, tsd: 220, tst: 320, mini1: -60, mini2: -20, pc: 600, wasteT: -110,
    comboK: 30,
  };
  let W = Object.assign({}, DEF);
  let TUNE = null;
  let wHo = 0, wCo = 0, wHm = 0, wHs = 0, wBu = 0, wBu2 = 0, wRt = 0, wCt = 0, wWe = 0, wWc = 0, wDa = 0, wDg = 0, wT1 = 0, wT2 = 0;
  let wB2b = 0, wHT = 0, wHI = 0, wAtk = 0, wC1 = 0, wC2 = 0, wC3 = 0, wC4 = 0, wTss = 0, wTsd = 0, wTst = 0, wM1 = 0, wM2 = 0, wPc = 0, wWt = 0, wCk = 0;
  function loadW() {
    wHo = +W.holes; wCo = +W.covd; wHm = +W.hmax; wHs = +W.hsum; wBu = +W.bump; wBu2 = +W.bump2; wRt = +W.rowT; wCt = +W.colT;
    wWe = +W.well; wWc = +W.wellCap; wDa = +W.dangerAt; wDg = +W.danger; wT1 = +W.tslot1; wT2 = +W.tslot2; wB2b = +W.b2b;
    wHT = +W.holdT; wHI = +W.holdI; wAtk = +W.atk; wC1 = +W.cl1; wC2 = +W.cl2; wC3 = +W.cl3; wC4 = +W.cl4; wTss = +W.tss;
    wTsd = +W.tsd; wTst = +W.tst; wM1 = +W.mini1; wM2 = +W.mini2; wPc = +W.pc; wWt = +W.wasteT; wCk = +W.comboK;
  }

  function init(cfg) {
    COLS = cfg.cols; ROWS = cfg.rows; HID = cfg.hidden; FULL = (1 << COLS) - 1;
    XM = (1 << (COLS + OFF)) - 1; WALL = ((1 << OFF) - 1) | (~0 << (COLS + OFF)); GROW = FULL | (1 << COLS);
    ATKN = cfg.atk.none; ATKM = cfg.atk.mini; ATKF = cfg.atk.full; CMB = cfg.comboAtk;
    for (let i = 0; i < 4096; i++) { let c = 0, v = i; while (v) { c += v & 1; v >>= 1; } POP[i] = c; }
    for (let i = 0; i < (1 << COLS); i++) { const w = (i << 1) | 1 | (1 << (COLS + 1)); RT[i] = POP[(w ^ (w >> 1)) & ((1 << (COLS + 1)) - 1)]; }
    for (let p = 0; p < 7; p++) {
      const t = NAMES[p], mats = cfg.pieces[t];
      SPX[p] = t === 'O' ? 4 : 3;
      DUP[p] = 0;
      const norm = [];
      for (let r = 0; r < 4; r++) {
        const m = mats[r], pr = p * 4 + r;
        let n = 0, omax = 0, minc = 99, minr = 99;
        const cells = [];
        for (let i = 0; i < m.length; i++) {
          let c = 0;
          while (c < m[i].length) {
            if (!m[i][c]) { c++; continue; }
            const c0 = c;
            while (c < m[i].length && m[i][c]) { cells.push([c, i]); c++; }
            ROFF[pr * 4 + n] = i; RC0[pr * 4 + n] = c0; RLEN[pr * 4 + n] = c - c0; n++; omax = i;
          }
        }
        NROW[pr] = n; OMAX[pr] = omax;
        let f = 0;
        for (let k = 0; k < n; k++) { let s = WALL; for (let j = 1; j < RLEN[pr * 4 + k]; j++) s |= WALL >> j; f |= s >> RC0[pr * 4 + k]; }
        OPENF[pr] = ~f & XM;
        for (const [c, i] of cells) { if (c < minc) minc = c; if (i < minr) minr = i; }
        const key = cells.map(([c, i]) => (c - minc) + ',' + (i - minr)).sort().join(' ');
        norm.push({key, minc, minr});
        let cr = r, dx = 0, dy = 0;
        if (t !== 'O') for (let q = 0; q < r; q++) if (norm[q].key === key) { cr = q; dx = minc - norm[q].minc; dy = minr - norm[q].minr; break; }
        CANR[pr] = cr; CANDX[pr] = dx; CANDY[pr] = dy;
        if (cr !== r) DUP[p] = 1;
        for (let dir = 0; dir < 3; dir++) {
          const kb = pr * 3 + dir, to = (r + [1, 3, 2][dir]) & 3;
          KTO[kb] = to;
          const tab = dir === 2 ? cfg.kicks.R180 : t === 'I' ? cfg.kicks.I : cfg.kicks.JLSTZ;
          const ks = (t === 'O' ? null : tab['' + r + to]) || [];
          KN[kb] = Math.min(ks.length, 8);
          for (let k = 0; k < KN[kb]; k++) { KX[kb * 8 + k] = ks[k][0]; KY[kb * 8 + k] = ks[k][1]; }
        }
      }
    }
    // The open-row shortcut of flood() needs: first kick (0, 0), and in open air (walls only) the first kick that
    // fits never moves the piece up. kdy = the largest row change of any kick.
    openOK = true; kdy = 0;
    for (let kb = 0; kb < 84; kb++) {
      const p = (kb / 12) | 0, r = ((kb / 3) | 0) & 3, to = KTO[kb];
      for (let k = 0; k < KN[kb]; k++) { const d = Math.abs(KY[kb * 8 + k]); if (d > kdy) kdy = d; }
      if (!KN[kb]) continue;
      if (KX[kb * 8] || KY[kb * 8]) openOK = false;
      for (let X = 0; X < 16; X++) {
        if (!((OPENF[p * 4 + r] >> X) & 1)) continue;
        for (let k = 0; k < KN[kb]; k++) {
          const tx = X + KX[kb * 8 + k];
          if (tx < 0 || tx > 15 || !((OPENF[p * 4 + to] >> tx) & 1)) continue;
          if (KY[kb * 8 + k] < 0) openOK = false;
          break;
        }
      }
    }
    for (let i = 0; i < NY; i++) { const e = i - YO >= ROWS ? -1 : WALL; E[i] = e; setSP(i, e); }
    prevTop = ROWS;
    TUNE = cfg.botTune || null;
    W = Object.assign({}, DEF, TUNE && TUNE.w || {});
    loadW();
    curLevel = -1;
    if (!(TUNE && TUNE.noWarm)) warm();
    return true;
  }
  // A short search at init so that the first real request does not pay for JIT compilation
  function warm() {
    try {
      const b = [];
      for (let y = 0; y < ROWS; y++) b.push(y < ROWS - 4 ? 0 : FULL & ~(1 << (y % COLS)) & ~(y === ROWS - 1 ? 6 : 0));
      const base = {board: b, curPos: {x: 3, y: HID - 1, r: 0}, hold: null, canHold: true, b2b: -1, combo: -1, incoming: 0, incomingReady: 0, seed: 1, maxMs: 300};
      think(Object.assign({}, base, {id: 0, cur: 'T', queue: ['I', 'O', 'L', 'J', 'S', 'Z'], difficulty: 9}));
      think(Object.assign({}, base, {id: 0, cur: 'S', queue: ['T', 'I', 'Z', 'L', 'O', 'J'], hold: 'T', difficulty: 10, incoming: 3, incomingReady: 3}));
    } catch (e) { /* warm-up only */ }
    curLevel = -1;
  }
  function setSP(i, e) { const s2 = e | (e >> 1), s3 = s2 | (e >> 2); SP[NY + i] = e; SP[2 * NY + i] = s2; SP[3 * NY + i] = s3; SP[4 * NY + i] = s3 | (e >> 3); }

  // Load a board (rows bo .. bo + ROWS - 1 of B) into the walled row buffers. Returns the top row index.
  function prep(B, bo, top) {
    if (top === undefined) { top = 0; while (top < ROWS && B[bo + top] === 0) top++; }
    for (let y = top < prevTop ? top : prevTop; y < ROWS; y++) { const e = (B[bo + y] << OFF) | WALL; E[y + YO] = e; setSP(y + YO, e); }
    prevTop = top;
    return top;
  }
  // FIT[r * NY + yi] = bitmask of X = x + OFF where piece p in rotation r fits at y = yi - YO
  function computeFit(p, top) {
    const nrot = p === PO ? 1 : 4, topi = top + YO;
    fitOpen = NB;
    for (let r = 0; r < nrot; r++) {
      const pr = p * 4 + r, n = NROW[pr], base = r * NY, of = OPENF[pr], open = topi - OMAX[pr];
      if (open < fitOpen) fitOpen = open;
      let yi = 0;
      for (; yi < open && yi < NB; yi++) FIT[base + yi] = of;
      for (; yi < NB; yi++) {
        let f = 0;
        for (let k = 0; k < n; k++) { const e = pr * 4 + k; f |= SP[RLEN[e] * NY + yi + ROFF[e]] >> RC0[e]; }
        FIT[base + yi] = ~f & XM;
      }
      for (; yi < NY; yi++) FIT[base + yi] = 0;
    }
  }
  // Spawn rule of the game (needs computeFit for p). Returns yi, or -1 for a block out.
  function spawnRow(p) {
    const X = SPX[p] + OFF;
    let y = HID - 2;
    while (!((FIT[y + YO] >> X) & 1) && y > -1) y--;
    if (!((FIT[y + YO] >> X) & 1)) return -1;
    if ((FIT[y + 1 + YO] >> X) & 1) y++;
    return y + YO;
  }
  // Flood fill of every reachable state from (r0, X0, yi0). Fills REACH, and for T the rotation arrivals RA / RK (kick 4).
  function flood(p, r0, X0, yi0) {
    REACH.fill(0); PEND.fill(0);
    const isT = p === PT, rot = p !== PO;
    if (isT) { RA.fill(0); RK.fill(0); }
    let sp = 0;
    // Rows above the stack are open for every rotation. Starting there, every position of the open rows below the start
    // is reachable (in open air no kick moves a piece up), and only the last kdy + 1 open rows can reach a resting
    // state or set a spin flag.
    const nrot = rot ? 4 : 1;
    let open = openOK && yi0 < fitOpen;
    for (let r = 0; r < nrot && open; r++) if (!((OPENF[p * 4 + r] >> X0) & 1)) open = false;
    if (open) {
      const yB = fitOpen - 1, ys = yB - kdy > yi0 ? yB - kdy : yi0;
      for (let r = 0; r < nrot; r++) {
        const of = OPENF[p * 4 + r], base = r * NY;
        for (let yi = yi0; yi < ys; yi++) REACH[base + yi] = of;
        for (let yi = ys; yi <= yB; yi++) { PEND[base + yi] = of; STK[sp++] = base + yi; }
      }
    } else { const i0 = r0 * NY + yi0; PEND[i0] = 1 << X0; STK[sp++] = i0; }
    while (sp > 0) {
      const idx = STK[--sp];
      const s = PEND[idx] & ~REACH[idx];
      PEND[idx] = 0;
      if (!s) continue;
      const f = FIT[idx];
      let g = s, q = f;
      g |= q & (g << 1); q &= q << 1; g |= q & (g << 2); q &= q << 2; g |= q & (g << 4); q &= q << 4; g |= q & (g << 8);
      let h = s; q = f;
      h |= q & (h >> 1); q &= q >> 1; h |= q & (h >> 2); q &= q >> 2; h |= q & (h >> 4); q &= q >> 4; h |= q & (h >> 8);
      const nb = (g | h) & ~REACH[idx];
      REACH[idx] |= nb;
      const dn = nb & FIT[idx + 1] & ~REACH[idx + 1];
      if (dn) { if (!PEND[idx + 1]) STK[sp++] = idx + 1; PEND[idx + 1] |= dn; }
      if (!rot) continue;
      const r = (idx / NY) | 0, yi = idx - r * NY, pr3 = (p * 4 + r) * 3;
      for (let dir = 0; dir < 3; dir++) {
        const kb = pr3 + dir, tb = KTO[kb] * NY + yi, kn = KN[kb];
        let rem = nb;
        for (let k = 0; k < kn; k++) {
          const kx = KX[kb * 8 + k], ti = tb + KY[kb * 8 + k], tf = FIT[ti];
          const hit = rem & (kx >= 0 ? tf >> kx : (tf << -kx) & XM);
          if (!hit) continue;
          rem ^= hit;
          const tg = kx >= 0 ? hit << kx : hit >> -kx;
          if (isT) { if (k === 4 && dir !== 2) RK[ti] |= tg; else RA[ti] |= tg; }
          const nt = tg & ~REACH[ti];
          if (nt) { if (!PEND[ti]) STK[sp++] = ti; PEND[ti] |= nt; }
          if (!rem) break;
        }
      }
    }
  }
  // Resting outcomes after flood(): one per distinct cell set, with the best spin. simple: only straight drops, no spins.
  function collect(p, simple) {
    let n = 0;
    const y0 = fitOpen > 0 ? fitOpen - 1 : 0;   // rows above the last open row cannot hold a resting piece
    if (p === PT) {
      for (let r = 0; r < 4; r++) {
        const base = r * NY;
        let drop = y0 > 0 ? OPENF[p * 4 + r] : XM;
        for (let yi = y0; yi < NB; yi++) {
          if (simple) drop &= FIT[base + yi];
          const reach = REACH[base + yi];
          if (!reach) continue;
          let rest = reach & ~FIT[base + yi + 1];
          if (simple) rest &= drop;
          if (!rest) continue;
          const rot = simple ? 0 : (RA[base + yi] | RK[base + yi]) & rest, k4 = RK[base + yi];
          const e0 = E[yi], e2 = E[yi + 2];
          while (rest) {
            const b = rest & -rest, X = 31 - Math.clz32(b);
            rest ^= b;
            let spin = 0;
            if (rot & b) {
              const tl = (e0 >> X) & 1, tr = (e0 >> (X + 2)) & 1, br = (e2 >> (X + 2)) & 1, bl = (e2 >> X) & 1;
              if (tl + tr + br + bl >= 3) {
                const front = r === 0 ? tl & tr : r === 1 ? tr & br : r === 2 ? br & bl : bl & tl;
                spin = front || (k4 & b) ? 2 : 1;
              }
            }
            OR_[n] = r; OX[n] = X; OY[n] = yi; OS[n] = spin; n++;
          }
        }
      }
      return n;
    }
    if (DUP[p]) {
      CREST.fill(0);
      for (let r = 0; r < 4; r++) {
        const base = r * NY, pr = p * 4 + r, cb = CANR[pr] * NY + CANDY[pr], dx = CANDX[pr];
        let drop = y0 > 0 ? OPENF[p * 4 + r] : XM;
        for (let yi = y0; yi < NB; yi++) {
          if (simple) drop &= FIT[base + yi];
          let rest = REACH[base + yi] & ~FIT[base + yi + 1];
          if (simple) rest &= drop;
          if (rest) CREST[cb + yi] |= dx >= 0 ? rest << dx : rest >> -dx;
        }
      }
      for (let r = 0; r < 2; r++) {
        const base = r * NY;
        for (let yi = y0; yi < NY; yi++) {
          let rest = CREST[base + yi];
          while (rest) { const b = rest & -rest; rest ^= b; OR_[n] = r; OX[n] = 31 - Math.clz32(b); OY[n] = yi; OS[n] = 0; n++; }
        }
      }
      return n;
    }
    const nrot = p === PO ? 1 : 4;
    for (let r = 0; r < nrot; r++) {
      const base = r * NY;
      let drop = y0 > 0 ? OPENF[p * 4 + r] : XM;
      for (let yi = y0; yi < NB; yi++) {
        if (simple) drop &= FIT[base + yi];
        let rest = REACH[base + yi] & ~FIT[base + yi + 1];
        if (simple) rest &= drop;
        while (rest) { const b = rest & -rest; rest ^= b; OR_[n] = r; OX[n] = 31 - Math.clz32(b); OY[n] = yi; OS[n] = 0; n++; }
      }
    }
    return n;
  }
  // All outcomes for piece p on board B, from (r0, x0, y0), or from the spawn if r0 < 0. Returns the count, -1 on block out.
  function gen(B, bo, p, r0, x0, y0, simple) { return gen2(prep(B, bo), p, r0, x0, y0, simple); }
  // Same, for the board loaded by the last prep() (top = its result)
  function gen2(top, p, r0, x0, y0, simple) {
    computeFit(p, top);
    let yi0;
    if (r0 < 0) { yi0 = spawnRow(p); if (yi0 < 0) return -1; r0 = 0; x0 = SPX[p]; }
    else yi0 = y0 + YO;
    spawnYi = yi0;
    flood(p, r0, x0 + OFF, yi0);
    let n = collect(p, simple);
    if (simple && n === 0) n = collect(p, false);
    return n;
  }

  // ---- placing pieces ----
  // Results of place(): lines, attack, b2b, combo, garbage left, perfect clear, top row, dead
  let rL = 0, rA = 0, rB = 0, rC = 0, rG = 0, rPC = 0, rTop = 0, rDead = 0, tmpLo = 0;
  // Place piece p at (r, X, yi) with spin on board S (top row = top) into D, then apply the clear, attack and garbage
  // rules. Rows of TMP above tmpLo are known to be empty, so only the rows below are copied.
  function place(S, so, top, D, dd, p, r, X, yi, spin, b2b, combo, gr, gl) {
    let lo = 0;
    if (D === TMP) { lo = top < tmpLo ? top : tmpLo; tmpLo = 0; }
    for (let y = lo; y < ROWS; y++) D[dd + y] = S[so + y];
    const pr = p * 4 + r, y0 = yi - YO, x = X - OFF;
    rDead = 0;
    if (y0 + OMAX[pr] < HID) { rDead = 1; return; }
    let full = 0;
    for (let k = 0; k < NROW[pr]; k++) {
      const e = pr * 4 + k, y = y0 + ROFF[e];
      if (y < 0) continue;
      const v = D[dd + y] | (((1 << RLEN[e]) - 1) << (x + RC0[e]));
      D[dd + y] = v;
      if (v === FULL) full++;
    }
    let mt = y0 + ROFF[pr * 4];
    if (mt < 0) mt = 0;
    if (top < mt) mt = top;
    let n = 0, atk = 0;
    rPC = 0;
    if (full) {
      let w = ROWS - 1;
      for (let y = ROWS - 1; y >= mt; y--) { const v = D[dd + y]; if (v === FULL) { n++; continue; } D[dd + w--] = v; }
      for (let y = w; y >= mt; y--) D[dd + y] = 0;
      mt = w + 1;
      atk = (spin === 2 ? ATKF[n] : spin === 1 ? ATKM[n] : ATKN[n]) || 0;
      if (n === 4 || spin > 0) { b2b++; if (b2b > 0) atk++; } else b2b = -1;
      combo++;
      if (combo > 0) atk += CMB[combo < CMB.length - 1 ? combo : CMB.length - 1];
      if (mt >= ROWS) { atk += 10; rPC = 1; }
      let c = atk < gr ? atk : gr; gr -= c;
      c = atk - c; gl -= c < gl ? c : gl;
    } else {
      combo = -1;
      if (gr > 0) {
        const g = gr < 8 ? gr : 8;
        if (mt < g) { rDead = 1; return; }
        for (let y = mt; y < ROWS; y++) D[dd + y - g] = D[dd + y];
        for (let y = ROWS - g; y < ROWS; y++) D[dd + y] = GROW;
        mt -= g; gr -= g;
      }
    }
    if (D === TMP) tmpLo = mt;
    rL = n; rA = atk; rB = b2b; rC = combo; rG = gr + gl; rTop = mt;
  }
  // Can piece p spawn on board B (block-out rule)?
  function canSpawn(B, bo, p) {
    if (!(B[bo] | B[bo + 1] | B[bo + 2] | B[bo + 3] | B[bo + 4])) return true;
    const pr = p * 4, x = SPX[p];
    for (let y = HID - 2; y >= -1; y--) {
      let ok = true;
      for (let k = 0; k < NROW[pr] && ok; k++) {
        const e = pr * 4 + k, yy = y + ROFF[e];
        if (yy >= 0 && (B[bo + yy] & (((1 << RLEN[e]) - 1) << (x + RC0[e])))) ok = false;
      }
      if (ok) return true;
    }
    return false;
  }

  // ---- evaluation ----
  // Board value: holes, cells above holes, heights, bumpiness, row / column transitions, well depth, danger.
  const H = new Int32Array(16);
  let fHo = 0, fCo = 0, fRt = 0, fCt = 0, fHm = 0, fHs = 0;
  // Features of board T from row top down: heights H, holes, cells above holes (up to 7 per hole), row and column
  // transitions, max and summed height.
  function scan(T, to, top) {
    for (let c = 0; c < COLS; c++) H[c] = 0;
    let cov = 0, holes = 0, covd = 0, rowT = 0, colT = 0, prev = 0, c0 = 0, c1 = 0, c2 = 0, hm = 0, hs = 0;
    for (let y = top; y < ROWS; y++) {
      const row = T[to + y] & FULL;
      let nb = row & ~cov;
      if (nb) {
        const hy = ROWS - y;
        if (!hm) hm = hy;
        hs += hy * POP[nb];
        do { const b = nb & -nb; H[31 - Math.clz32(b)] = hy; nb ^= b; } while (nb);
      }
      const hole = cov & ~row;
      if (hole) { holes += POP[hole]; covd += POP[hole & c0] + 2 * POP[hole & c1] + 4 * POP[hole & c2]; }
      let k = row, t = c0 & k; c0 ^= k; k = t; t = c1 & k; c1 ^= k; k = t; t = c2 & k; c2 ^= k; k = t;
      c0 |= k; c1 |= k; c2 |= k;
      cov |= row;
      rowT += RT[row]; colT += POP[row ^ prev]; prev = row;
    }
    fHo = holes; fCo = covd; fRt = rowT; fCt = colT + POP[FULL & ~prev]; fHm = hm; fHs = hs;
  }
  // The same, with a virtual T: rows yf / ys get the extra cells mF / mS; cF / cS = 1 if that row is then full
  // (it is skipped, and heights above it drop by one).
  function scanT(T, to, top, yf, ys, mF, mS, cF, cS) {
    for (let c = 0; c < COLS; c++) H[c] = 0;
    let cov = 0, holes = 0, covd = 0, rowT = 0, colT = 0, prev = 0, c0 = 0, c1 = 0, c2 = 0, hm = 0, hs = 0;
    for (let y = top; y < ROWS; y++) {
      let row = T[to + y] & FULL;
      if (y === yf) { if (cF) continue; row |= mF; } else if (y === ys) { if (cS) continue; row |= mS; }
      let nb = row & ~cov;
      if (nb) {
        const hy = ROWS - y - (y < yf ? cF : 0) - (y < ys ? cS : 0);
        if (!hm) hm = hy;
        hs += hy * POP[nb];
        do { const b = nb & -nb; H[31 - Math.clz32(b)] = hy; nb ^= b; } while (nb);
      }
      const hole = cov & ~row;
      if (hole) { holes += POP[hole]; covd += POP[hole & c0] + 2 * POP[hole & c1] + 4 * POP[hole & c2]; }
      let k = row, t = c0 & k; c0 ^= k; k = t; t = c1 & k; c1 ^= k; k = t; t = c2 & k; c2 ^= k; k = t;
      c0 |= k; c1 |= k; c2 |= k;
      cov |= row;
      rowT += RT[row]; colT += POP[row ^ prev]; prev = row;
    }
    fHo = holes; fCo = covd; fRt = rowT; fCt = colT + POP[FULL & ~prev]; fHm = hm; fHs = hs;
  }
  function value(pendLines) {
    let wc = 0, hmin = H[0], bump = 0, bump2 = 0, hp = H[0];
    for (let c = 1; c < COLS; c++) {
      const h = H[c], d = h - hp;
      if (h < hmin) { hmin = h; wc = c; }
      bump += d < 0 ? -d : d; bump2 += d * d; hp = h;
    }
    let lh = 99, rh = 99;
    if (wc > 0) { lh = H[wc - 1]; const d = lh - hmin; bump -= d < 0 ? -d : d; bump2 -= d * d; }
    if (wc < COLS - 1) { rh = H[wc + 1]; const d = rh - hmin; bump -= d < 0 ? -d : d; bump2 -= d * d; }
    let well = (lh < rh ? lh : rh) - hmin;
    if (well > wWc) well = wWc;
    const eh = fHm + pendLines, dg = eh > wDa ? (eh - wDa) * (eh - wDa) : 0;
    return wHo * fHo + wCo * fCo + wHm * fHm + wHs * fHs + wBu * bump + wBu2 * bump2 + wRt * fRt + wCt * fCt + wWe * well + wDg * dg;
  }
  // With tslots, the best T-slot (T in rotation 2 under an overhang, 3 solid corners, clearing 1-2 lines) is filled
  // virtually and the board after that T-spin is valued, plus a bonus.
  function evalBoard(T, to, top, pendLines, tslots) {
    scan(T, to, top);
    if (tslots) {
      let best = 0, yf = 0, ys = 0, mF = 0, mS = 0, cF = 0, cS = 0;
      for (let c = 0; c < COLS - 2; c++) {
        const s = ROWS - 1 - H[c + 1];
        if (s < 2) continue;
        const f = s - 1, rs = T[to + s], rf = T[to + f], ra = T[to + f - 1];
        if (((rs >> c) & 5) !== 5 || ((rf >> c) & 7) || ((ra >> (c + 1)) & 1) || !((ra >> c) & 5)) continue;
        const l1 = ((rs | (2 << c)) & FULL) === FULL ? 1 : 0, l2 = ((rf | (7 << c)) & FULL) === FULL ? 1 : 0;
        if (l1 + l2 > best) { best = l1 + l2; ys = s; yf = f; mS = 2 << c; mF = 7 << c; cS = l1; cF = l2; }
      }
      if (best) { scanT(T, to, top, yf, ys, mF, mS, cF, cS); return value(pendLines) + (best === 2 ? wT2 : wT1); }
    }
    return value(pendLines);
  }
  // Reward for one placement (uses the results of place())
  function moveReward(p, spin) {
    const n = rL;
    if (n === 0) return p === PT ? wWt : 0;
    let v = wAtk * rA;
    if (rPC) v += wPc;
    if (spin === 2) v += n === 1 ? wTss : n === 2 ? wTsd : wTst;
    else if (spin === 1) v += n === 1 ? wM1 : wM2;
    else {
      v += n === 1 ? wC1 : n === 2 ? wC2 : n === 3 ? wC3 : wC4;
      if (p === PT) v += wWt;
    }
    if (rC > 0) v += wCk * rC;
    return v;
  }
  function stateBonus(b2b, hold) { return (b2b >= 0 ? wB2b : 0) + (hold === PT ? wHT : hold === PI ? wHI : 0); }

  // ---- beam pools ----
  const MS = 8;   // metadata per state: cur, hold, qi, b2b, combo, garbage, root, top row
  let MAXW = 0, bA = null, bB = null, mA = null, mB = null, rewA = null, rewB = null, sA = null, sB = null;
  let hScore = null, hSeq = null, hPar = null, hOpt = null, hP = null, hR = null, hX = null, hY = null, hS = null, heap = null;
  const HS = 1 << 14, hashK1 = new Int32Array(HS), hashK2 = new Int32Array(HS), hashSt = new Int32Array(HS);
  let hashStamp = 0;
  const TMP = new Int32Array(32), RB = new Int32Array(32);
  function ensure(w) {
    if (w <= MAXW) return;
    MAXW = w;
    const K = w * 2 + 8;
    bA = new Int32Array(w * ROWS); bB = new Int32Array(w * ROWS);
    mA = new Int32Array(w * MS); mB = new Int32Array(w * MS);
    rewA = new Float64Array(w); rewB = new Float64Array(w); sA = new Float64Array(w); sB = new Float64Array(w);
    hScore = new Float64Array(K); hSeq = new Int32Array(K); hPar = new Int32Array(K); hOpt = new Int8Array(K);
    hP = new Int8Array(K); hR = new Int8Array(K); hX = new Int8Array(K); hY = new Int8Array(K); hS = new Int8Array(K); heap = new Int32Array(K);
  }
  // min-heap of slot ids ordered by (score, -seq): keeps the best hcap children
  let hn = 0, hcap = 0, seq = 0;
  function less(a, b) { const x = hScore[a], y = hScore[b]; return x < y || (x === y && hSeq[a] > hSeq[b]); }
  function offer(score) {
    seq++;
    if (hn < hcap) {
      const s = hn;
      hScore[s] = score; hSeq[s] = seq;
      let i = hn++;
      heap[i] = s;
      while (i > 0) { const pa = (i - 1) >> 1; if (!less(heap[i], heap[pa])) break; const t = heap[i]; heap[i] = heap[pa]; heap[pa] = t; i = pa; }
      return s;
    }
    const m = heap[0];
    if (score <= hScore[m]) return -1;
    hScore[m] = score; hSeq[m] = seq;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let k = i;
      if (l < hn && less(heap[l], heap[k])) k = l;
      if (r < hn && less(heap[r], heap[k])) k = r;
      if (k === i) break;
      const t = heap[i]; heap[i] = heap[k]; heap[k] = t; i = k;
    }
    return m;
  }
  // Insert the state key (board + extra) into the transposition set. Returns false if it was there already.
  function hashInsert(B, bo, x1, x2) {
    let a = 0x811c9dc5 ^ x1, b = 0x9e3779b9 ^ x2;
    for (let y = 0; y < ROWS; y++) { const v = B[bo + y]; a = Math.imul(a ^ v, 16777619); b = Math.imul(b ^ v, 0x85ebca6b) ^ (b >>> 13); }
    let i = (a ^ (b >>> 9)) & (HS - 1);
    for (;;) {
      if (hashSt[i] !== hashStamp) { hashSt[i] = hashStamp; hashK1[i] = a; hashK2[i] = b; return true; }
      if (hashK1[i] === a && hashK2[i] === b) return false;
      i = (i + 1) & (HS - 1);
    }
  }

  // ---- difficulty ----
  // depth: pieces placed in the search (1 = the current piece or the hold piece only); beam: states kept per depth;
  // hold: may use hold; tslots: T-slot bonus; simple: straight drops only (no tucks, no spins), unless there is none
  // or every one of them tops out;
  // noise: random spread added to each root move value; slip: chance to take another move within gap of the best;
  // miss: chance to drop one column off (within 2 * gap); w: weight changes for the level.
  const LEVELS = [null,
    {depth: 1, beam: 1, hold: true, tslots: false, simple: true, noise: 130, slip: 0.2, miss: 0.12, gap: 200,
      w: {well: 0, b2b: 0, tsd: 0, tss: 0, tst: 0, wasteT: 0, holdT: 0, holdI: 0, bump: -10, bump2: -2, holes: -80}},
    {depth: 1, beam: 1, hold: true, tslots: false, simple: true, noise: 100, slip: 0.16, miss: 0.09, gap: 170,
      w: {well: 8, b2b: 0, tsd: 0, tss: 0, tst: 0, wasteT: 0, holdT: 0, holdI: 0, bump: -13, bump2: -3, holes: -90}},
    {depth: 1, beam: 1, hold: true, tslots: false, simple: true, noise: 70, slip: 0.11, miss: 0.06, gap: 130,
      w: {well: 15, b2b: 30, tsd: 0, tss: 0, tst: 0, wasteT: 0}},
    {depth: 2, beam: 8, hold: true, tslots: true, simple: false, noise: 30, slip: 0.04, miss: 0.02, gap: 80},
    {depth: 3, beam: 10, hold: true, tslots: true, simple: false, noise: 22, slip: 0.03, miss: 0.015, gap: 70},
    {depth: 4, beam: 16, hold: true, tslots: true, simple: false, noise: 12, slip: 0.015, miss: 0, gap: 50},
    {depth: 5, beam: 35, hold: true, tslots: true, simple: false, noise: 0, slip: 0, miss: 0, gap: 0},
    {depth: 6, beam: 70, hold: true, tslots: true, simple: false, noise: 0, slip: 0, miss: 0, gap: 0},
    {depth: 7, beam: 150, hold: true, tslots: true, simple: false, noise: 0, slip: 0, miss: 0, gap: 0},
    {depth: 7, beam: 280, hold: true, tslots: true, simple: false, noise: 0, slip: 0, miss: 0, gap: 0},
  ];
  let curLevel = -1;
  function settings(d) {
    d = Math.max(1, Math.min(10, Math.round(+d) || 1));
    const s = Object.assign({}, LEVELS[d]);
    if (TUNE && TUNE.s && TUNE.s[d]) Object.assign(s, TUNE.s[d]);
    if (d !== curLevel) { curLevel = d; W = Object.assign({}, DEF, TUNE && TUNE.w || {}, s.w || {}); loadW(); }
    return s;
  }
  function rng(seed) {
    let a = seed | 0;
    return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // ---- exact BFS for the input path (the game's step rules, same move order as the stub) ----
  const MOVES = ['left', 'right', 'cw', 'ccw', '180', 'sonic', 'down'];
  const BN = NR * 16 * 3, BSt = new Int32Array(BN), BPar = new Int32Array(BN), BMv = new Int8Array(BN), BQ = new Int32Array(BN);
  let bStamp = 0;
  function fitAt(r, yi, X) { return yi >= 0 && yi < NY && X >= 0 && X < 16 && ((FIT[r * NY + yi] >> X) & 1) === 1; }
  function spinAt(r, X, yi, f) {
    if (!f) return 0;
    const e0 = E[yi], e2 = E[yi + 2];
    const tl = (e0 >> X) & 1, tr = (e0 >> (X + 2)) & 1, br = (e2 >> (X + 2)) & 1, bl = (e2 >> X) & 1;
    if (tl + tr + br + bl < 3) return 0;
    const front = r === 0 ? tl & tr : r === 1 ? tr & br : r === 2 ? br & bl : bl & tl;
    return front || f === 2 ? 2 : 1;
  }
  // Shortest input path from (r0, X0, yi0) to a resting state with the canonical cells (cr, cX, cyi) and this spin.
  // FIT and E must be loaded for piece p on the root board.
  function findPath(p, r0, X0, yi0, cr, cX, cyi, spin) {
    bStamp++;
    const isT = p === PT;
    let qh = 0, qt = 0;
    const s0 = ((r0 * NY + yi0) * 16 + X0) * 3;
    BSt[s0] = bStamp; BPar[s0] = -1; BQ[qt++] = s0;
    while (qh < qt) {
      const s = BQ[qh++];
      const f = s % 3, rest = (s - f) / 3, X = rest & 15, ry = rest >> 4, yi = ry % NY, r = (ry - yi) / NY;
      if (!fitAt(r, yi + 1, X)) {
        const pr = p * 4 + r;
        if (CANR[pr] === cr && X + CANDX[pr] === cX && yi + CANDY[pr] === cyi && (isT ? spinAt(r, X, yi, f) : 0) === spin) {
          const path = [];
          for (let e = s; BPar[e] >= 0; e = BPar[e]) path.push(MOVES[BMv[e]]);
          path.reverse();
          return {path, r, x: X - OFF, y: yi - YO};
        }
      }
      for (let mv = 0; mv < 7; mv++) {
        let nr = r, nx = X, ny = yi, nf = 0;
        if (mv < 2) { nx = X + (mv === 0 ? -1 : 1); if (!fitAt(r, yi, nx)) continue; }
        else if (mv === 5) { while (fitAt(r, ny + 1, X)) ny++; if (ny === yi) continue; }
        else if (mv === 6) { ny = yi + 1; if (!fitAt(r, ny, X)) continue; }
        else {
          if (p === PO) continue;
          const dir = mv - 2, kb = (p * 4 + r) * 3 + dir;
          let ok = false;
          nr = KTO[kb];
          for (let k = 0; k < KN[kb]; k++) {
            const tx = X + KX[kb * 8 + k], ty = yi + KY[kb * 8 + k];
            if (fitAt(nr, ty, tx)) { nx = tx; ny = ty; ok = true; nf = isT ? (dir !== 2 && k === 4 ? 2 : 1) : 0; break; }
          }
          if (!ok) continue;
        }
        const ns = ((nr * NY + ny) * 16 + nx) * 3 + nf;
        if (BSt[ns] === bStamp) continue;
        BSt[ns] = bStamp; BPar[ns] = s; BMv[ns] = mv; BQ[qt++] = ns;
      }
    }
    return null;
  }

  // ---- think ----
  const QP = new Int8Array(16);
  function think(req) {
    const t0 = now();
    const st = settings(req.difficulty);
    const maxMs = req.maxMs > 0 ? req.maxMs : 1e9;
    const rand = rng((req.seed | 0) ^ 0x5bd1e995);
    for (let y = 0; y < ROWS; y++) RB[y] = req.board[y] | 0;
    let rbTop = 0;
    while (rbTop < ROWS && RB[rbTop] === 0) rbTop++;
    tmpLo = 0;
    const qn = Math.min(req.queue.length, 14);
    for (let i = 0; i < qn; i++) QP[i] = NAMES.indexOf(req.queue[i]);
    const cur = NAMES.indexOf(req.cur), hold0 = req.hold ? NAMES.indexOf(req.hold) : -1;
    const canHold = !!req.canHold && st.hold;
    const gR = Math.max(0, req.incomingReady | 0), gL = Math.max(0, (req.incoming | 0) - gR);
    const b2b0 = req.b2b | 0, combo0 = req.combo | 0;
    const depth = Math.max(1, Math.min(st.depth, qn + 1));
    const W0 = Math.max(1, st.beam);
    ensure(Math.max(W0, 64, st.beams ? Math.max.apply(null, st.beams) : 0));
    let nodes = 0, reached = 1, stopped = 0;

    // root options: the current piece, and the hold piece (or queue[0] when the hold is empty)
    const opts = [{hold: false, p: cur, r0: req.curPos.r, x0: req.curPos.x, y0: req.curPos.y, yi0: 0}];
    if (canHold) {
      const hp = hold0 >= 0 ? hold0 : qn > 0 ? QP[0] : -1;
      if (hp >= 0 && hold0 !== cur) opts.push({hold: true, p: hp, r0: -1, x0: 0, y0: 0, yi0: 0});
    }
    const cand = [];
    let safe = 0;
    // simple levels try straight drops first; if every one of them tops out, all reachable placements
    for (let simple = st.simple; ; simple = false) {
      for (let oi = 0; oi < opts.length; oi++) {
        const o = opts[oi];
        const n = gen(RB, 0, o.p, o.r0, o.x0, o.y0, simple);
        if (n < 0) continue;
        o.yi0 = spawnYi;
        const nh = o.hold ? cur : hold0, nq = o.hold && hold0 < 0 ? 2 : 1, nc = nq - 1 < qn ? QP[nq - 1] : -1;
        for (let i = 0; i < n; i++) {
          nodes++;
          place(RB, 0, rbTop, TMP, 0, o.p, OR_[i], OX[i], OY[i], OS[i], b2b0, combo0, gR, gL);
          if (rDead) {   // a lock out or a garbage top out: legal, kept only for when every move loses
            cand.push({o: oi, p: o.p, r: OR_[i], X: OX[i], yi: OY[i], spin: OS[i], rew: 0, sc: -2e9, fatal: true, nh, nq, nc, b2b: -1, combo: -1, g: 0});
            continue;
          }
          const fatal = nc >= 0 && !canSpawn(TMP, 0, nc);
          if (!fatal) safe++;
          const rew = moveReward(o.p, OS[i]);
          const sc = rew + evalBoard(TMP, 0, rTop, rG, st.tslots) + stateBonus(rB, nh);
          cand.push({o: oi, p: o.p, r: OR_[i], X: OX[i], yi: OY[i], spin: OS[i], rew, sc, fatal, nh, nq, nc, b2b: rB, combo: rC, g: rG});
        }
      }
      if (safe || !simple) break;
      cand.length = 0;
    }
    if (!cand.length) return {id: req.id, hold: false, inputs: [], expect: null, dead: true, nodes, ms: now() - t0};
    const nc0 = cand.length;
    const val = new Float64Array(nc0).fill(-Infinity);
    for (let i = 0; i < nc0; i++) if (safe && cand[i].fatal) cand[i].sc -= 1e9;
    const order = cand.map((c, i) => i).sort((a, b) => cand[b].sc - cand[a].sc || a - b);

    if (depth === 1 || !safe) for (let i = 0; i < nc0; i++) val[i] = cand[i].sc;
    else {
      let na = 0;
      for (const ci of order) {
        if (na >= W0) break;
        const c = cand[ci];
        if (safe && c.fatal) continue;
        place(RB, 0, rbTop, bA, na * ROWS, c.p, c.r, c.X, c.yi, c.spin, b2b0, combo0, gR, gL);
        const m = na * MS;
        mA[m] = c.nc; mA[m + 1] = c.nh; mA[m + 2] = c.nq; mA[m + 3] = c.b2b; mA[m + 4] = c.combo; mA[m + 5] = c.g; mA[m + 6] = ci; mA[m + 7] = rTop;
        rewA[na] = c.rew; sA[na] = c.sc;
        na++;
      }
      // Safety stops (maxMs): no new depth after 35% of it, and a depth is dropped if it is still running at 45%
      const tA = t0 + maxMs * 0.35, tB = t0 + maxMs * 0.45;
      let done = false;
      for (let d = 1; d < depth && na > 0; d++) {
        if (now() > tA) { stopped = 1; break; }
        const last = d === depth - 1;
        const Wd = st.beams ? st.beams[Math.min(d, st.beams.length - 1)] : W0;
        hn = 0; hcap = Math.min(MAXW * 2, Math.ceil(Wd * 1.25) + 4); seq = 0;
        for (let s = 0; s < na; s++) {
          if ((s & 15) === 15 && now() > tB) { stopped = 2; break; }
          const m = s * MS, sc = mA[m], sh = mA[m + 1], sq = mA[m + 2], sb = mA[m + 3], scb = mA[m + 4], sg = mA[m + 5], root = mA[m + 6];
          const bo = s * ROWS;
          if (sc >= 0 && !canSpawn(bA, bo, sc)) continue;
          const top = prep(bA, bo, mA[m + 7]);
          for (let opt = 0; opt < 3; opt++) {
            let p, nh, nq;
            if (opt === 0) { if (sc < 0) continue; p = sc; nh = sh; nq = sq + 1; }
            else if (opt === 1) { if (sh < 0 || sh === sc) continue; p = sh; nh = sc; nq = sq + 1; }
            else { if (sh >= 0 || sc < 0 || sq >= qn) continue; p = QP[sq]; nh = sc; nq = sq + 2; }
            const nc = nq - 1 < qn ? QP[nq - 1] : -1;
            const n = gen2(top, p, -1, 0, 0, false);
            if (n < 0) continue;
            const base = rewA[s];
            for (let i = 0; i < n; i++) {
              nodes++;
              place(bA, bo, top, TMP, 0, p, OR_[i], OX[i], OY[i], OS[i], sb, scb, sg, 0);
              if (rDead) continue;
              if (last && nc >= 0 && !canSpawn(TMP, 0, nc)) continue;
              const score = base + moveReward(p, OS[i]) + evalBoard(TMP, 0, rTop, rG, st.tslots) + stateBonus(rB, nh);
              if (last) { if (score > val[root]) val[root] = score; done = true; continue; }
              const slot = offer(score);
              if (slot < 0) continue;
              hPar[slot] = s; hOpt[slot] = opt; hP[slot] = p; hR[slot] = OR_[i]; hX[slot] = OX[i]; hY[slot] = OY[i]; hS[slot] = OS[i];
            }
          }
        }
        if (stopped === 2) { if (done) { val.fill(-Infinity); done = false; } break; }
        if (last) { if (done) reached = depth; break; }
        // next beam: best children first, skipping transpositions
        const sl = Array.from(heap.subarray(0, hn));
        sl.sort((a, b) => hScore[b] - hScore[a] || hSeq[a] - hSeq[b]);
        hashStamp++;
        let nb = 0;
        for (let k = 0; k < sl.length && nb < Wd; k++) {
          const slot = sl[k], s = hPar[slot], m = s * MS, opt = hOpt[slot];
          const sc = mA[m], sh = mA[m + 1], sq = mA[m + 2];
          const nh = opt === 0 ? sh : sc, nq = opt === 2 ? sq + 2 : sq + 1;
          place(bA, s * ROWS, mA[m + 7], bB, nb * ROWS, hP[slot], hR[slot], hX[slot], hY[slot], hS[slot], mA[m + 3], mA[m + 4], mA[m + 5], 0);
          if (!hashInsert(bB, nb * ROWS, (nh + 2) * 64 + nq, ((rB + 2) * 64 + rC + 2) * 4096 + rG)) continue;
          const mm = nb * MS;
          mB[mm] = nq - 1 < qn ? QP[nq - 1] : -1; mB[mm + 1] = nh; mB[mm + 2] = nq; mB[mm + 3] = rB; mB[mm + 4] = rC; mB[mm + 5] = rG; mB[mm + 6] = mA[m + 6]; mB[mm + 7] = rTop;
          rewB[nb] = rewA[s] + moveReward(hP[slot], hS[slot]);
          sB[nb] = hScore[slot];
          nb++;
        }
        if (nb === 0) break;
        let t = bA; bA = bB; bB = t; t = mA; mA = mB; mB = t;
        let f = rewA; rewA = rewB; rewB = f; f = sA; sA = sB; sB = f;
        na = nb; reached = d + 1;
      }
      if (!done) for (let s = 0; s < na; s++) { const root = mA[s * MS + 6]; if (sA[s] > val[root]) val[root] = sA[s]; }
      let any = false;
      for (let i = 0; i < nc0; i++) if (val[i] > -Infinity) { any = true; break; }
      if (!any) for (let i = 0; i < nc0; i++) val[i] = cand[i].sc;
    }

    // choose the root move, with the mistakes of this level. They fade out as the stack grows (none from 13 rows)
    // and stop while garbage waits. A slip or a one-column misdrop only picks a move within st.gap of the best.
    const hgt = ROWS - rbTop, calm = gR + gL > 0 ? 0 : hgt <= 7 ? 1 : hgt >= 13 ? 0 : (13 - hgt) / 6;
    const ok = i => val[i] > -Infinity && !(safe && cand[i].fatal);
    let pick = -1, pv = -Infinity, best = -1;
    for (let i = 0; i < nc0; i++) {
      if (!ok(i)) continue;
      if (best < 0 || val[i] > val[best]) best = i;
      const v = val[i] + (calm && st.noise > 0 ? (rand() + rand() - 1) * st.noise * calm : 0);
      if (v > pv) { pv = v; pick = i; }
    }
    if (pick < 0) pick = best = order[0];
    if (calm && st.slip > 0 && rand() < st.slip * calm) {
      const near = [];
      for (let i = 0; i < nc0; i++) if (ok(i) && i !== pick && val[i] >= val[best] - st.gap) near.push(i);
      if (near.length) pick = near[Math.floor(rand() * near.length)];
    }
    if (calm && st.miss > 0 && rand() < st.miss * calm) {
      const c = cand[pick], side = rand() < 0.5 ? -1 : 1;
      for (const dx of [side, -side]) {
        const j = cand.findIndex((e, i) => ok(i) && e.o === c.o && e.r === c.r && e.X === c.X + dx && e.spin === 0);
        if (j >= 0 && val[j] >= val[best] - 2 * st.gap) { pick = j; break; }
      }
    }
    // input path for the chosen move (exact BFS); if that fails, the next best moves
    const ranked = [pick].concat(Array.from(val.keys()).sort((a, b) => val[b] - val[a] || a - b));
    const tried = new Uint8Array(nc0);
    for (const ci of ranked) {
      if (tried[ci]) continue;
      tried[ci] = 1;
      const c = cand[ci], o = opts[c.o];
      gen(RB, 0, o.p, o.r0, o.x0, o.y0, false);
      const r0 = o.r0 < 0 ? 0 : o.r0, X0 = (o.r0 < 0 ? SPX[o.p] : o.x0) + OFF;
      const res = findPath(o.p, r0, X0, o.yi0, c.r, c.X, c.yi, c.spin);
      if (!res) continue;
      return {id: req.id, hold: o.hold, inputs: res.path, expect: {t: NAMES[o.p], x: res.x, y: res.y, r: res.r, spin: c.spin},
        dead: false, nodes, ms: now() - t0, depth: reached, stop: stopped};
    }
    return {id: req.id, hold: false, inputs: [], expect: null, dead: true, nodes, ms: now() - t0};
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
