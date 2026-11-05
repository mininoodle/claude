#!/usr/bin/env node
// Referee: runs a bot engine against the REAL game rules. It loads referee.html (a copy of Blockfall
// before the versus work) in headless Chromium, drives the game's own functions (shift, rotate, fall,
// doHold, hardDrop, lock, tspin) with the engine's plans, and reports strength, speed and rule parity.
//
//   node referee.js --engine stub-engine.js [--seeds 1,2,3] [--pieces 500] [--difficulty 10]
//                   [--garbage 4/13] [--maxMs 250] [--parallel 1] [--json]
//
// --garbage S/E adds S garbage lines to the pending queue every E pieces. As in versus, a lock that
// clears lines cancels pending lines with its attack, and a lock that clears nothing raises up to 8.
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i < 0 ? def : argv[i + 1]; };
const flag = name => argv.includes('--' + name);
const engine = opt('engine');
if (!engine) { console.error('usage: node referee.js --engine <file> [options]'); process.exit(2); }
const engineSrc = fs.readFileSync(path.resolve(engine), 'utf8');
const seeds = opt('seeds', '1,2,3').split(',').map(Number);
const [gSize, gEvery] = (opt('garbage', '0/1')).split('/').map(Number);
const conf = {
  pieces: +opt('pieces', 500), difficulty: +opt('difficulty', 10), maxMs: +opt('maxMs', 250),
  gSize, gEvery,
};
const parallel = +opt('parallel', 1);
const REFEREE = path.join(__dirname, 'referee.html');

function setup(o) {
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  Math.random = mulberry32(o.seed);            // the game's 7-bag uses Math.random
  const holeRng = mulberry32(o.seed * 7919 + 1);
  const pieces = {};
  for (const t in SHAPES) {
    pieces[t] = [];
    let m = SHAPES[t].map(r => r.slice());
    for (let r = 0; r < 4; r++) { pieces[t].push(m.map(row => row.slice())); if (t !== 'O') m = rot(m, 1); }
  }
  BlockfallBot.init({cols: COLS, rows: ROWS, hidden: HIDDEN, pieces, kicks: {JLSTZ: KJ, I: KI, R180: K180}, atk: ATK, comboAtk: COMBO_ATK});
  cfg.irs = false;
  start('marathon');
  state = 'pause';                               // stop the frame loop; the referee calls the game functions itself

  const R = {pending: 0, since: 0, linesBefore: 0, attackBefore: 0, mism: 0, spinMism: 0, holdMism: 0, think: [],
    tss: 0, tsd: 0, tst: 0, minis: 0, quads: 0, pcs: 0, maxB2b: -1, maxCombo: -1, garbageIn: 0, cancelled: 0,
    topped: false, placed: 0, firstMismatch: null};
  const origNext = window.next;
  window.next = function () {                    // runs inside lock(), after the clear and before the next spawn
    const cleared = lines > R.linesBefore, atk = attack - R.attackBefore;
    if (cleared) { const c = Math.min(R.pending, atk); R.pending -= c; R.cancelled += c; }
    else if (R.pending > 0) {
      const n = Math.min(R.pending, 8);
      R.pending -= n; R.garbageIn += n;
      for (let y = 0; y < n; y++) if (board[y].some(Boolean)) { R.topped = 'garbage'; return end(); }
      const hole = (holeRng() * COLS) | 0;
      board.splice(0, n);
      for (let i = 0; i < n; i++) { const row = Array(COLS).fill('G'); row[hole] = null; board.push(row); }
    }
    origNext();
  };
  const mask = row => row.reduce((a, v, c) => v ? a | (1 << c) : a, 0);
  function apply(k) {
    switch (k) {
      case 'left': shift(-1); break;
      case 'right': shift(1); break;
      case 'cw': rotate(1); break;
      case 'ccw': rotate(-1); break;
      case '180': rotate(2); break;
      case 'down': if (fits(cur.m, cur.x, cur.y + 1)) fall(cur.y + 1); break;
      case 'sonic': fall(ghostY()); break;
      default: R.badInput = String(k);
    }
  }
  window.__ref = {
    run(n) {
      for (let i = 0; i < n && R.placed < o.pieces && state !== 'over'; i++) {
        const req = {id: R.placed, board: board.map(mask), cur: cur.t, curPos: {x: cur.x, y: cur.y, r: cur.r},
          hold, canHold, queue: queue.slice(), b2b, combo, incoming: R.pending, incomingReady: R.pending,
          difficulty: o.difficulty, seed: o.seed * 100003 + R.placed, maxMs: o.maxMs};
        const snapshot = JSON.stringify(req);
        const t0 = performance.now();
        let plan;
        try { plan = BlockfallBot.think(JSON.parse(snapshot)); }
        catch (e) { R.error = String(e && e.stack || e); end(); break; }
        R.think.push(performance.now() - t0);
        if (!plan || plan.dead) { R.dead = (R.dead || 0) + 1; hardDrop(); R.placed++; continue; }
        if (plan.hold) { if (!canHold) R.holdMism++; doHold(); if (state === 'over') break; }
        for (const k of plan.inputs) apply(k);
        const e = plan.expect;
        const okPos = e && cur.t === e.t && cur.x === e.x && cur.y === e.y && cur.r === e.r;
        const sp = tspin();
        if (!okPos) { R.mism++; if (!R.firstMismatch) R.firstMismatch = {req: JSON.parse(snapshot), plan, actual: {t: cur.t, x: cur.x, y: cur.y, r: cur.r}}; }
        else if (sp !== e.spin) { R.spinMism++; if (!R.firstMismatch) R.firstMismatch = {req: JSON.parse(snapshot), plan, actualSpin: sp}; }
        R.linesBefore = lines; R.attackBefore = attack;
        hardDrop();
        R.placed++;
        const cl = lines - R.linesBefore;
        if (sp === 2 && cl === 1) R.tss++;
        if (sp === 2 && cl === 2) R.tsd++;
        if (sp === 2 && cl === 3) R.tst++;
        if (sp === 1 && cl > 0) R.minis++;
        if (cl === 4) R.quads++;
        if (cl && board.every(r => r.every(v => !v))) R.pcs++;
        R.maxB2b = Math.max(R.maxB2b, b2b); R.maxCombo = Math.max(R.maxCombo, combo);
        if (o.gSize > 0 && ++R.since >= o.gEvery) { R.since = 0; R.pending += o.gSize; }
      }
      return {done: state === 'over' || R.placed >= o.pieces, placed: R.placed};
    },
    stats() {
      const ms = R.think.slice().sort((a, b) => a - b);
      const q = p => ms.length ? +ms[Math.min(ms.length - 1, Math.floor(p * ms.length))].toFixed(2) : 0;
      return {placed: R.placed, topped: state === 'over' ? (R.topped || 'topout') : false, attack, lines,
        app: R.placed ? +(attack / R.placed).toFixed(3) : 0, tss: R.tss, tsd: R.tsd, tst: R.tst, minis: R.minis,
        quads: R.quads, pcs: R.pcs, maxB2b: R.maxB2b, maxCombo: R.maxCombo, garbageIn: R.garbageIn, cancelled: R.cancelled,
        mismatches: R.mism, spinMismatches: R.spinMism, holdMismatches: R.holdMism, dead: R.dead || 0,
        badInput: R.badInput || null, error: R.error || null, firstMismatch: R.firstMismatch,
        thinkMedian: q(0.5), thinkP95: q(0.95), thinkMax: ms.length ? +ms[ms.length - 1].toFixed(2) : 0};
    },
  };
}

async function runGame(browser, seed) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + REFEREE);
  await page.addScriptTag({content: engineSrc});
  await page.evaluate(`(${setup})(${JSON.stringify(Object.assign({seed}, conf))})`);
  for (;;) {
    const r = await page.evaluate(() => __ref.run(25));
    if (!flag('json')) process.stderr.write(`\rseed ${seed}: ${r.placed} pieces   `);
    if (r.done) break;
  }
  const s = await page.evaluate(() => __ref.stats());
  await page.close();
  if (!flag('json')) process.stderr.write('\n');
  return Object.assign({seed}, s, {pageErrors: errors});
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  for (let i = 0; i < seeds.length; i += parallel) {
    results.push(...await Promise.all(seeds.slice(i, i + parallel).map(s => runGame(browser, s))));
  }
  await browser.close();
  const sum = k => results.reduce((a, r) => a + (r[k] || 0), 0);
  const total = {
    engine: path.basename(engine), difficulty: conf.difficulty, garbage: gSize ? `${gSize}/${gEvery}` : 'none',
    games: results.length, pieces: sum('placed'), topouts: results.filter(r => r.topped).length,
    app: +(sum('attack') / Math.max(1, sum('placed'))).toFixed(3),
    tsd: sum('tsd'), tst: sum('tst'), tss: sum('tss'), minis: sum('minis'), quads: sum('quads'), pcs: sum('pcs'),
    mismatches: sum('mismatches'), spinMismatches: sum('spinMismatches'), holdMismatches: sum('holdMismatches'),
    errors: results.filter(r => r.error || r.pageErrors.length || r.badInput).length,
    thinkMedianWorst: Math.max(...results.map(r => r.thinkMedian)), thinkP95Worst: Math.max(...results.map(r => r.thinkP95)),
  };
  if (flag('json')) console.log(JSON.stringify({total, results}, null, 1));
  else {
    for (const r of results) {
      const {firstMismatch, pageErrors, ...rest} = r;
      console.log(JSON.stringify(rest));
      if (firstMismatch) console.log('  first mismatch:', JSON.stringify(firstMismatch));
      if (pageErrors.length) console.log('  page errors:', pageErrors.slice(0, 3));
    }
    console.log('TOTAL', JSON.stringify(total));
  }
})().catch(e => { console.error(e); process.exit(1); });
