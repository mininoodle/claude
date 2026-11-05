// Reference engine for the Blockfall bot contract (see SPEC.md).
// It is deliberately simple: full move search for the current piece and the hold piece, no lookahead,
// and a small El-Tetris style evaluation. It exists to show the contract and the movement rules exactly.
(function (G) {
  let C = null;

  function init(cfg) {
    C = Object.assign({}, cfg);
    C.cells = {};
    for (const t in cfg.pieces) {
      C.cells[t] = cfg.pieces[t].map(m => {
        const a = [];
        m.forEach((row, r) => row.forEach((v, c) => { if (v) a.push([c, r]); }));
        return a;
      });
    }
    C.full = (1 << cfg.cols) - 1;
    return true;
  }

  function fits(b, t, r, x, y) {
    const cells = C.cells[t][r];
    for (let i = 0; i < cells.length; i++) {
      const nx = x + cells[i][0], ny = y + cells[i][1];
      if (nx < 0 || nx >= C.cols || ny >= C.rows) return false;
      if (ny >= 0 && (b[ny] >> nx) & 1) return false;
    }
    return true;
  }

  // Same rule as the game's spawn(): start at y = hidden - 2, move up while blocked, then drop one row if possible
  function spawnPos(b, t) {
    const x = t === 'O' ? 4 : 3;
    let y = C.hidden - 2;
    while (!fits(b, t, 0, x, y) && y > -1) y--;
    if (!fits(b, t, 0, x, y)) return null;
    if (fits(b, t, 0, x, y + 1)) y++;
    return {x, y, r: 0, rot: false, k4: false};
  }

  // One input applied to a state, with the game's exact semantics. Returns null when the input does nothing.
  function step(b, t, s, mv) {
    if (mv === 'left' || mv === 'right') {
      const dx = mv === 'left' ? -1 : 1;
      return fits(b, t, s.r, s.x + dx, s.y) ? {x: s.x + dx, y: s.y, r: s.r, rot: false, k4: false} : null;
    }
    if (mv === 'down') return fits(b, t, s.r, s.x, s.y + 1) ? {x: s.x, y: s.y + 1, r: s.r, rot: false, k4: false} : null;
    if (mv === 'sonic') {
      let y = s.y;
      while (fits(b, t, s.r, s.x, y + 1)) y++;
      return y === s.y ? null : {x: s.x, y, r: s.r, rot: false, k4: false};
    }
    if (t === 'O') return null;
    const d = mv === 'cw' ? 1 : mv === 'ccw' ? -1 : 2;
    const to = (s.r + d + 4) % 4;
    const table = d === 2 ? C.kicks.R180 : t === 'I' ? C.kicks.I : C.kicks.JLSTZ;
    const kicks = table['' + s.r + to];
    for (let k = 0; k < kicks.length; k++) {
      const nx = s.x + kicks[k][0], ny = s.y + kicks[k][1];
      if (fits(b, t, to, nx, ny)) return {x: nx, y: ny, r: to, rot: true, k4: d !== 2 && k === 4};
    }
    return null;
  }

  // Same rule as the game's tspin(): 0 none, 1 mini, 2 full
  function spinOf(b, t, s) {
    if (t !== 'T' || !s.rot) return 0;
    const solid = (dx, dy) => {
      const x = s.x + dx, y = s.y + dy;
      return x < 0 || x >= C.cols || y >= C.rows || (y >= 0 && ((b[y] >> x) & 1) === 1);
    };
    const cs = [solid(0, 0), solid(2, 0), solid(2, 2), solid(0, 2)];
    if (cs.filter(Boolean).length < 3) return 0;
    const f = [[0, 1], [1, 2], [2, 3], [3, 0]][s.r];
    return (cs[f[0]] && cs[f[1]]) || s.k4 ? 2 : 1;
  }

  const MOVES = ['left', 'right', 'cw', 'ccw', '180', 'sonic', 'down'];

  // Breadth-first search over every reachable state; returns one entry per distinct resting outcome
  function placements(b, t, start) {
    const key = s => s.x + 3 + 16 * (s.y + 4) + 512 * s.r + (t === 'T' ? 2048 * (s.rot ? (s.k4 ? 2 : 1) : 0) : 0);
    const seen = new Map();
    const q = [start];
    seen.set(key(start), {s: start, prev: null, mv: null});
    const out = new Map();
    for (let i = 0; i < q.length; i++) {
      const s = q[i];
      if (!fits(b, t, s.r, s.x, s.y + 1)) {
        const spin = spinOf(b, t, s);
        const cells = C.cells[t][s.r].map(([c, r]) => (s.y + r) * 16 + s.x + c).sort((a, z) => a - z).join(',');
        const k = cells + '|' + spin;
        if (!out.has(k)) out.set(k, {s, spin, path: pathTo(seen, key, s)});
      }
      for (const mv of MOVES) {
        const n = step(b, t, s, mv);
        if (!n) continue;
        const nk = key(n);
        if (seen.has(nk)) continue;
        seen.set(nk, {s: n, prev: s, mv});
        q.push(n);
      }
    }
    return [...out.values()];
  }
  function pathTo(seen, key, s) {
    const p = [];
    let e = seen.get(key(s));
    while (e && e.mv) { p.push(e.mv); e = seen.get(key(e.prev)); }
    return p.reverse();
  }

  // Lock the piece, clear lines; same rules as the game's lock()
  function place(b, t, s) {
    const nb = b.slice();
    let above = true;
    for (const [c, r] of C.cells[t][s.r]) {
      const y = s.y + r;
      if (y >= 0) nb[y] |= 1 << (s.x + c);
      if (y >= C.hidden) above = false;
    }
    const rest = [];
    let n = 0;
    for (let y = 0; y < C.rows; y++) { if (nb[y] === C.full) n++; else rest.push(nb[y]); }
    while (rest.length < C.rows) rest.unshift(0);
    return {board: rest, lines: n, lockOut: above};
  }

  function evaluate(b, lines) {
    const h = [];
    let holes = 0;
    for (let x = 0; x < C.cols; x++) {
      let top = C.rows;
      for (let y = 0; y < C.rows; y++) if ((b[y] >> x) & 1) { top = y; break; }
      h.push(C.rows - top);
      for (let y = top + 1; y < C.rows; y++) if (!((b[y] >> x) & 1)) holes++;
    }
    let bump = 0, agg = 0;
    for (let x = 0; x < C.cols; x++) { agg += h[x]; if (x) bump += Math.abs(h[x] - h[x - 1]); }
    return -0.51 * agg + 0.76 * lines - 0.36 * holes * 10 - 0.18 * bump;
  }

  function think(req) {
    const t0 = Date.now();
    const b = req.board;
    const options = [{hold: false, t: req.cur, start: Object.assign({rot: false, k4: false}, req.curPos)}];
    if (req.canHold) {
      const t = req.hold || req.queue[0];
      if (t && t !== req.cur) {
        const sp = spawnPos(b, t);
        if (sp) options.push({hold: true, t, start: sp});
      }
    }
    let best = null, nodes = 0;
    for (const o of options) {
      for (const p of placements(b, o.t, o.start)) {
        nodes++;
        const r = place(b, o.t, p.s);
        const v = r.lockOut ? -1e9 : evaluate(r.board, r.lines);
        if (!best || v > best.v) best = {v, o, p};
      }
    }
    if (!best) return {id: req.id, hold: false, inputs: [], expect: null, dead: true, nodes, ms: Date.now() - t0};
    const s = best.p.s;
    return {
      id: req.id, hold: best.o.hold, inputs: best.p.path,
      expect: {t: best.o.t, x: s.x, y: s.y, r: s.r, spin: best.p.spin},
      nodes, ms: Date.now() - t0,
    };
  }

  G.BlockfallBot = {init, think};
  // Worker glue: {type: 'init', cfg} then {type: 'think', req} -> posts the response
  if (typeof importScripts === 'function' && typeof postMessage === 'function') {
    G.onmessage = e => {
      const m = e.data;
      if (m.type === 'init') init(m.cfg);
      else if (m.type === 'think') postMessage(think(m.req));
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : self);
