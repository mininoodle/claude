#!/usr/bin/env node
// Engine integration (SPEC 3, 4.4): the page holds engine-final.js between the BOT ENGINE markers, the game sends
// init once with its own tables (the same cfg referee.js builds in setup()) on both backends, the worker runs the
// inlined source, every bot piece gets one think right after it spawns, and the worker and a main-thread instance
// give the same answers to the same requests (apart from ms) at every level.
//   node engine.js [--engine ../engine-final.js]
const fs = require('fs');
const path = require('path');
const {launch, open, main, opt, GAME} = require('./lib');
const BOT = path.join(__dirname, '..');

main('engine', async r => {
  const enginePath = path.resolve(opt('engine', path.join(BOT, 'engine-final.js')));
  const want = fs.readFileSync(enginePath, 'utf8').replace(/\s+$/, '');
  const html = fs.readFileSync(GAME, 'utf8');
  const START = '/* BOT ENGINE START */', END = '/* BOT ENGINE END */';
  const a = html.indexOf('\n' + START + '\n'), b = html.indexOf('\n' + END + '\n');
  r.check('markers are on their own lines, once each', a > 0 && b > a && html.split(START).length === 2 && html.split(END).length === 2);
  r.check(`the file holds ${path.basename(enginePath)} between the markers, byte for byte`, html.slice(a + START.length + 2, b) === want, {chars: want.length});

  const browser = await launch();
  // the cfg exactly as referee.js setup() builds it, from the referee page's own tables
  const refCtx = await browser.newContext();
  const refPage = await refCtx.newPage();
  await refPage.goto('file://' + path.join(BOT, 'referee.html'));
  const refCfg = await refPage.evaluate(() => {
    const pieces = {};
    for (const t in SHAPES) {
      pieces[t] = [];
      let m = SHAPES[t].map(r => r.slice());
      for (let r = 0; r < 4; r++) { pieces[t].push(m.map(row => row.slice())); if (t !== 'O') m = rot(m, 1); }
    }
    return JSON.stringify({cols: COLS, rows: ROWS, hidden: HIDDEN, pieces, kicks: {JLSTZ: KJ, I: KI, R180: K180}, atk: ATK, comboAtk: COMBO_ATK});
  });
  await refCtx.close();

  // ---- main backend: init goes through globalThis.BlockfallBot (captured with a setter) ----
  {
    const {page, errors, context} = await open(browser, {seed: 31, init: () => {
      let v; window.__inits = [];
      Object.defineProperty(window, 'BlockfallBot', {configurable: true, get() { return v; }, set(x) {
        const init = x.init; x.init = cfg => { __inits.push(JSON.stringify(cfg)); return init(cfg); }; v = x;
      }});
    }});
    await page.fill('#botLevel', '10');
    const m = await page.evaluate(() => {
      const T = blockfallTest, res = [];
      const og = window.got; window.got = x => { res.push(x); return og(x); };
      T.setBackend('main');
      document.querySelector('#mVersus').click();
      T.step(10000);
      const P = T.players[0];       // end round 1, play on in round 2: the engine must not be set up again
      for (let y = 0; y < 24; y++) P.board[y] = Array.from({length: 10}, (_, x) => y && !x ? 'J' : null);
      P.inc = []; P.take(8); P.inc[0].t = 0; P.spawn('O'); P.hardDrop();
      const st = T.state; T.step(5000);
      return {inits: __inits, st, round: T.vs.round, backend: T.backend, n: res.length, depth: res.filter(x => x.depth >= 1).length,
        depth7: res.filter(x => x.depth === 7).length, stops: res.filter(x => x.stop).length, dead: res.filter(x => x.dead).length, mism: T.botMismatch, spin: T.botSpinMismatch};
    });
    r.check('main backend: init called once over two rounds', m.inits.length === 1 && m.st === 'round' && m.round === 2 && m.backend === 'main', {inits: m.inits.length, st: m.st, round: m.round});
    r.check('main backend: init cfg = the referee cfg (game tables: pieces from rot(), kicks, attack, combo)', m.inits[0] === refCfg, {chars: m.inits[0] && m.inits[0].length});
    const {inits, ...ms} = m;
    r.check('main backend: answers come from the real engine (they carry depth; level 10 searches 7 pieces)', m.n > 20 && m.depth === m.n && m.depth7 > 0 && m.dead === 0, ms);
    r.check('main backend: mismatch 0 (safety stops reported)', m.mism === 0 && m.spin === 0, ms);
    r.check('main backend: no page or console errors', !errors.length, errors.slice(0, 3));
    await context.close();
  }

  // ---- worker backend: one worker from a Blob of #bot-engine, one init, one think per bot piece ----
  const {page, errors, context} = await open(browser, {seed: 32, init: () => {
    const W = window.Worker; window.__workers = []; window.__posts = [];
    window.Worker = function (url, o) {
      const w = new W(url, o), pm = w.postMessage.bind(w);
      __workers.push(url);
      w.postMessage = m => { __posts.push(m.type === 'init' ? {type: 'init', cfg: JSON.stringify(m.cfg)} : {type: m.type, id: m.req && m.req.id}); return pm(m); };
      return w;
    };
  }});
  await page.fill('#botLevel', '10');
  await page.evaluate(() => {
    window.__reqs = new Map(); window.__res = [];
    const ot = window.think; window.think = q => { __reqs.set(q.id, JSON.parse(JSON.stringify(q))); return ot(q); };
    const og = window.got; window.got = x => { __res.push(x); return og(x); };
    // spawn check: every request is sent while the bot piece is still at its spawn position
    window.__spawnBad = 0;
    const ob = Bot.prototype.begin;
    Bot.prototype.begin = function () { const c = this.p.cur; ob.call(this); const q = this.req; if (!q || q.curPos.x !== (c.t === 'O' ? 4 : 3) || q.curPos.r !== 0 || q.queue.length < 5 || q.cur !== c.t) __spawnBad++; };
  });
  await page.click('#mVersus');
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    const P = blockfallTest.players[0];
    for (let y = 0; y < 24; y++) P.board[y] = Array.from({length: 10}, (_, x) => y && !x ? 'J' : null);
    P.inc = []; P.take(8); P.inc[0].t = 0; P.spawn('O'); P.hardDrop();
  });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);     // let the last answer arrive
  const w = await page.evaluate(async () => {
    const T = blockfallTest, src = document.querySelector('#bot-engine').textContent;
    const blob = __workers.length ? await (await fetch(__workers[0])).text() : '';
    const thinks = __posts.filter(p => p.type === 'think').length;
    return {workers: __workers.length, blobSame: blob === src, inits: __posts.filter(p => p.type === 'init'), firstPost: __posts[0] && __posts[0].type, thinks,
      round: T.vs.round, state: T.state, backend: T.backend, botPieces: [T.vs.tot[1].pieces, T.players[1].pieces], answers: __res.length, spawnBad: __spawnBad,
      depth: __res.filter(x => x.depth >= 1).length, stops: __res.filter(x => x.stop).length, mism: T.botMismatch, spin: T.botSpinMismatch};
  });
  const blobText = await page.evaluate(() => document.querySelector('#bot-engine').textContent);
  r.check('worker backend: one worker for the whole match, made from a Blob of #bot-engine', w.workers === 1 && w.blobSame && blobText.includes(want), {workers: w.workers, blobSame: w.blobSame});
  r.check('worker backend: init sent once, first, with the referee cfg', w.inits.length === 1 && w.firstPost === 'init' && w.inits[0].cfg === refCfg, {inits: w.inits.length, first: w.firstPost});
  const {inits, ...ws} = w;
  // each round: one think per placed bot piece, plus one for the piece in play
  r.check('worker backend: one think per bot piece, sent right after the piece spawns', w.spawnBad === 0 && w.thinks === w.botPieces[0] + 1 + w.botPieces[1] + 1 && w.round === 2, ws);
  r.check('worker backend: answers come from the real engine, no fallback, mismatch 0', w.backend === 'worker' && w.answers >= w.thinks - 1 && w.depth === w.answers && w.mism === 0 && w.spin === 0, ws);

  // the same requests at every level, through the game's own worker, then on a fresh main-thread instance
  const d = await page.evaluate(async () => {
    const base = [...__reqs.values()].filter((q, i) => i % 2 === 0).slice(0, 8), sent = [];
    let id = 1e6;
    // maxMs unlimited: the contract promises the same answer only without the time-based safety stop
    for (let lv = 1; lv <= 10; lv++) for (const q of base) { const x = JSON.parse(JSON.stringify(q)); x.id = ++id; x.difficulty = lv; x.seed = (x.seed + lv * 7919) >>> 0; x.maxMs = 1e5; sent.push(x); }
    const n0 = __res.length;
    for (const q of sent) think(JSON.parse(JSON.stringify(q)));
    const t0 = performance.now();
    while (__res.filter(x => x.id > 1e6).length < sent.length && performance.now() - t0 < 30000) await new Promise(res => setTimeout(res, 50));
    const fromWorker = new Map(__res.filter(x => x.id > 1e6).map(x => [x.id, x]));
    // fresh main-thread instance of the same source, set up with the game's tables
    new Function(document.querySelector('#bot-engine').textContent)();
    const E = globalThis.BlockfallBot; E.init(engineCfg());
    const strip = x => JSON.stringify(Object.assign({}, x, {ms: 0}));
    let same = 0, diff = 0, stops = 0, holds = 0, spins = 0, firstDiff = null;
    for (const q of sent) {
      const a = fromWorker.get(q.id), b = E.think(JSON.parse(JSON.stringify(q)));
      if (!a) { diff++; continue; }
      if (a.stop || b.stop) stops++;
      if (a.hold) holds++;
      if (a.expect && a.expect.spin) spins++;
      if (strip(a) === strip(b)) same++; else { diff++; firstDiff = firstDiff || {q: q.id, a, b}; }
    }
    return {sent: sent.length, got: fromWorker.size, same, diff, stops, holds, spins, firstDiff, extra: __res.length - n0 - fromWorker.size};
  });
  console.log('worker vs main:', JSON.stringify(d));
  r.check('worker and main-thread instance give identical answers (apart from ms) at levels 1-10', d.sent === 80 && d.got === 80 && d.same === 80 && d.diff === 0, d);
  r.check('no page or console errors', !errors.length, errors.slice(0, 3));
  await context.close();
  await browser.close();
});
