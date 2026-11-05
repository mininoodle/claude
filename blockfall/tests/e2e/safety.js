#!/usr/bin/env node
// Bot top-out safety against garbage (SPEC 2.3, 2.5, 4.2), real page, main backend, step():
// (A) incomingReady in each request = the lines that really rise at that piece's lock, per level and garbage
//     timer, for a piece that spawns at the round start and for one that spawns in the tick of a drop;
// (B) a recorded level-8 top-out: 11 lines that become ready during the piece's slot must count as ready, and the
//     bot then cancels them instead of topping out;
// (C) bot vs bot at levels 9 and 10: every lock that clears nothing raises exactly min(8, incomingReady);
// (D) levels 1-3 (straight drops only) on crafted high stacks: when every straight drop tops out, the bot still
//     finds the surviving tuck or hold placement.
//   node safety.js
const {launch, open, main} = require('./lib');

// A recorded level-8 top-out (bot board as row bitmasks, bit c = column c)
const STALE = {board: [0,0,0,0,0,112,1017,1017,1019,506,507,507,1019,1019,1019,1019,1019,1021,1021,1021,1021,1021,1007,1007],
  cur: 'T', hold: 'O', queue: ['I','J','Z','J','T','L'], b2b: 0, combo: -1};
// Crafted high stacks where every straight drop tops out but another placement survives (ready / waiting lines)
const LOW = [
  {board: [0,0,0,0,16,144,144,656,720,728,504,504,1016,988,1017,1007,1007,1022,487,1015,1015,959,827,895], cur: 'I', hold: 'Z', canHold: true, queue: ['T','L','I','S','O','S'], b2b: 1, ready: 4, wait: 4},
  {board: [0,0,256,256,352,481,484,357,503,1011,887,1022,1019,1007,1007,767,895,1021,895,1021,767,1015,895,1015], cur: 'J', hold: null, canHold: false, queue: ['T','Z','Z','L','Z','J'], b2b: -1, ready: 7, wait: 0},
  {board: [0,0,0,0,4,0,5,389,453,981,967,991,991,991,991,983,1019,1015,895,991,1021,1007,767,701], cur: 'J', hold: null, canHold: true, queue: ['Z','L','Z','L','T','Z'], b2b: -1, ready: 8, wait: 0},
  {board: [0,0,0,0,256,448,448,448,448,1001,1011,1018,1019,1003,1017,1022,991,1019,1021,1021,1015,895,767,767], cur: 'J', hold: 'Z', canHold: true, queue: ['S','S','Z','J','T','O'], b2b: -1, ready: 6, wait: 0},
  {board: [0,0,0,40,816,828,536,831,831,831,575,831,943,959,895,767,479,343,1007,959,991,1022,1021,991], cur: 'S', hold: null, canHold: true, queue: ['S','S','J','J','J','J'], b2b: -1, ready: 3, wait: 4},
  {board: [0,0,8,8,8,56,250,255,239,251,127,495,495,989,959,1021,1021,511,895,1007,511,767,1022,991], cur: 'L', hold: 'Z', canHold: true, queue: ['Z','J','Z','I','S','J'], b2b: -1, ready: 8, wait: 0},
  {board: [0,0,0,32,32,288,355,359,359,995,999,935,995,999,959,1021,1022,1015,895,991,895,255,959,1022], cur: 'I', hold: null, canHold: true, queue: ['T','O','I','L','Z','O'], b2b: -1, ready: 5, wait: 0},
];

main('safety', async r => {
  const browser = await launch();
  const {page, errors, context} = await open(browser, {seed: 7});

  const t0 = Date.now(), lap = n => console.log(`${n} done after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  // ---------- A: incomingReady = lines raised at the drop ----------
  const A = await page.evaluate(() => {
    const T = blockfallTest, out = [], TIMERS = [0, 1, 100, 250, 330, 331, 333, 334, 336, 340, 399, 400, 401, 480, 488, 489, 490, 495, 496, 500];
    T.setBackend('main');
    const ob = Bot.prototype.begin, ot = window.think;
    let inject = null, capture = false, sent = null;
    // the bot's next request sees one waiting entry with timer t, on an empty board (so the lock clears nothing)
    Bot.prototype.begin = function () {
      if (inject !== null && this.p.i === 1) {
        this.p.board = Array.from({length: 24}, () => Array(10).fill(null));
        this.p.inc = [{lines: 1, hole: 0, t: inject, k: 0}];
        inject = null; capture = true;
      }
      return ob.call(this);
    };
    window.think = q => { if (capture) { sent = q.incomingReady; capture = false; } return ot(q); };
    for (const lv of [1, 4, 7, 8, 9, 10]) for (const piece of [1, 2]) for (const t of TIMERS) {
      cfg.botLevel = lv; sent = null;
      if (piece === 1) inject = t;      // first piece: its request is sent from start(), outside a tick
      start('versus');
      if (piece === 2) inject = t;      // second piece: its request is sent in the tick of the first drop
      const B = T.players[1];
      while (B.pieces < piece && T.state === 'play' && T.playMs < 10000) T.step(16);
      out.push({lv, piece, t, sent, raised: B.raised, alive: B.alive, pieces: B.pieces});
    }
    Bot.prototype.begin = ob; window.think = ot;
    return out;
  });
  for (const lv of [1, 4, 7, 8, 9, 10]) for (const piece of [1, 2]) {
    const rows = A.filter(x => x.lv === lv && x.piece === piece);
    console.log(`A: level ${lv}, piece ${piece} (timer: incomingReady sent / lines raised): ${rows.map(x => `${x.t}:${x.sent}/${x.raised}`).join(' ')}`);
  }
  lap('A');
  const badA = A.filter(x => x.sent !== x.raised || !x.alive || x.pieces !== x.piece);
  r.check('A: every request counts exactly the waiting lines that rise at its drop (levels 1, 4, 7, 8, 9, 10; 20 timers; 2 spawn phases)', A.length === 240 && !badA.length, badA.slice(0, 6));
  r.check('A: lines ready by the drop count as ready although their delay was not over at the spawn', A.some(x => x.t >= 100 && x.sent === 1) && A.filter(x => x.lv <= 7).every(x => x.sent === 1));
  r.check('A: at levels 9 and 10 lines that are still waiting at the drop do not count', A.some(x => x.lv >= 9 && x.t === 500 && x.sent === 0 && x.raised === 0));

  // ---------- B: recorded level-8 top-out ----------
  const B = await page.evaluate(C => {
    const T = blockfallTest;
    T.setBackend('main'); T.humanBot(null); cfg.botLevel = 8;
    start('versus');
    const P = T.players[0], O = T.players[1];
    P.inc = [];
    Object.assign(O, {board: C.board.map(m => Array.from({length: 10}, (_, c) => (m >> c) & 1 ? 'G' : null)), hold: C.hold, canHold: true,
      queue: C.queue.slice(), b2b: C.b2b, combo: C.combo, inc: [{lines: 11, hole: 3, t: 180, k: 0}]});   // sent 320 ms ago: ready in 180 ms
    let req = null;
    const ot = window.think; window.think = q => { req = JSON.parse(JSON.stringify(q)); return ot(q); };
    O.spawn(C.cur); T.bots[1].begin();
    window.think = ot;
    const plan = T.bots[1].q.map(s => s.k), n = O.pieces;
    while (O.pieces === n && T.state === 'play' && T.playMs < 2000) T.step(16);
    return {incoming: req.incoming, ready: req.incomingReady, plan, alive: O.alive, cause: O.cause, state: T.state, placed: O.pieces - n,
      cancelled: O.cancelled, left: O.inc.reduce((a, e) => a + e.lines, 0)};
  }, STALE);
  lap('B');
  console.log('B:', JSON.stringify(B));
  r.check('B: 11 lines that become ready 180 ms into a 500 ms slot are sent as ready', B.incoming === 11 && B.ready === 11, B);
  r.check('B: the level-8 bot clears and cancels instead of topping out by garbage', B.alive && B.state === 'play' && B.placed === 1 && B.cancelled > 0, B);

  // ---------- C: bot vs bot, levels 9 and 10 ----------
  const C = await page.evaluate(() => {
    const T = blockfallTest;
    T.setBackend('main'); cfg.botLevel = 9; T.humanBot(10);
    const ot = window.think, orise = Player.prototype.rise;
    const st = {plans: 0, locks: 0, withReady: 0, raised: 0, bad: 0, first: [], matches: 0};
    window.think = q => { const b = T.bots.find(b => b && b.id === q.id); if (b) { b.__ready = q.incomingReady; st.plans++; } return ot(q); };
    Player.prototype.rise = function () {
      const b = T.bots[this.i], r0 = this.raised, ok = orise.call(this);
      if (b) {
        const got = this.raised - r0, want = Math.min(8, b.__ready);
        st.locks++; st.raised += got; if (want) st.withReady++;
        if (got !== want) { st.bad++; if (st.first.length < 5) st.first.push({i: this.i, want, got, ms: T.playMs}); }
      }
      return ok;
    };
    const m0 = T.botMismatch, s0 = T.botSpinMismatch;
    // about 800 pieces in all; step() goes on to the next round, a finished match starts a new one
    for (let n = 0; st.plans < 800 && n < 4000; n++) {
      if (!n || T.state === 'done') { document.querySelector('#mVersus').click(); st.matches++; }
      T.step(250);
    }
    window.think = ot; Player.prototype.rise = orise; T.humanBot(null);
    return {...st, mism: T.botMismatch - m0, spin: T.botSpinMismatch - s0};
  });
  lap('C');
  console.log('C:', JSON.stringify(C));
  r.check('C: levels 9 and 10: every lock that clears nothing raises min(8, incomingReady)', C.locks > 100 && C.withReady > 20 && C.raised > 0 && C.bad === 0, C);
  r.check('C: botMismatch 0 and botSpinMismatch 0', C.mism === 0 && C.spin === 0, [C.mism, C.spin]);

  // ---------- D: levels 1-3 on crafted high stacks ----------
  const D = await page.evaluate(L => {
    const T = blockfallTest, out = [];
    T.setBackend('main'); T.humanBot(null);
    const ot = window.think, og = window.got;
    let req = null, res = null;
    window.think = q => { req = q; return ot(q); };
    window.got = x => { res = x; return og(x); };
    const m0 = T.botMismatch, s0 = T.botSpinMismatch;
    L.forEach((c, k) => {
      for (const lv of [1, 2, 3, 4]) {
        cfg.botLevel = lv;
        start('versus');
        const P = T.players[0], O = T.players[1];
        P.inc = [];
        const inc = [{lines: c.ready, hole: 0, t: 0, k: 0}];
        if (c.wait) inc.push({lines: c.wait, hole: 1, t: 1e9, k: 0});
        Object.assign(O, {board: c.board.map(m => Array.from({length: 10}, (_, x) => (m >> x) & 1 ? 'G' : null)), hold: c.hold, canHold: c.canHold,
          queue: c.queue.slice(), b2b: c.b2b, combo: -1, inc});
        O.spawn(c.cur); T.bots[1].begin();
        const ready = req.incomingReady, plan = (res.hold ? 'hold ' : '') + (res.inputs || []).join(' '), n = O.pieces;
        while (O.pieces === n && O.alive && T.state === 'play' && T.playMs < 4000) T.step(16);
        out.push({k, lv, ready, plan, alive: O.alive, cause: O.cause, placed: O.pieces - n});
      }
    });
    window.think = ot; window.got = og;
    return {out, mism: T.botMismatch - m0, spin: T.botSpinMismatch - s0};
  }, LOW);
  lap('D');
  for (const x of D.out) console.log('D:', JSON.stringify(x));
  const badD = D.out.filter(x => !x.alive || x.placed !== 1);
  r.check('D: levels 1-3 never top out where a tuck or hold placement survives (7 crafted stacks, levels 1-4)', D.out.length === 28 && !badD.length && D.out.every(x => x.ready === LOW[x.k].ready), badD);
  r.check('D: botMismatch 0 and botSpinMismatch 0', D.mism === 0 && D.spin === 0, [D.mism, D.spin]);
  r.check('no page or console errors', !errors.length, errors.slice(0, 3));
  await context.close();
  await browser.close();
});
