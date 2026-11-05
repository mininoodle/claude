#!/usr/bin/env node
// Test 8, hot-reload snapshot (window.claude?.hot): the guards work when the API is missing or partial, a running
// versus game comes back paused with both boards and the match score and plays on, and a snapshot from the
// pre-versus game (flat fields) still restores a Marathon game.
const {launch, open, main} = require('./lib');

main('hot', async r => {
  const browser = await launch();
  // guards: partial or empty APIs must not break the boot
  for (const [name, init] of [['window.claude = {}', () => { window.claude = {}; }], ['hot: {}', () => { window.claude = {hot: {}}; }],
    ['hot.data null', () => { window.claude = {hot: {data: null, snapshot: 1, ready: 'no'}}; }]]) {
    const {page, errors, context} = await open(browser, {init});
    const ok = await page.evaluate(() => blockfallTest.state === 'ready' && document.querySelector('#ovTitle').textContent === 'Blockfall');
    await page.click('#mVersus');
    const play = await page.evaluate(() => blockfallTest.state === 'play' && blockfallTest.players.length === 2);
    r.check(`guard (${name}): boots to the start screen and plays`, ok && play && !errors.length, errors.slice(0, 2));
    await context.close();
  }

  // take a snapshot of a running versus game
  const a = await open(browser, {seed: 9, init: () => { window.claude = {hot: {snapshot(fn) { window.__snap = fn; }}}; }});
  const snap = await a.page.evaluate(() => {
    const T = blockfallTest;
    T.setBackend('main'); T.humanBot(10);
    document.querySelector('#mVersus').click();
    // 30 s of play; incoming garbage is dropped so that no round ends before the snapshot, whatever the engine's strength
    for (let t = 0; t < 30000; t += 16) { T.step(16); for (const p of T.players) p.inc.length = 0; }
    T.humanBot(null);
    T.players[0].take(2);                       // something on your incoming queue too
    return JSON.parse(JSON.stringify(__snap()));
  });
  r.check('snapshot is plain JSON data with both players and the match', snap.mode === 'versus' && snap.state === 'play' && snap.players.length === 2 && snap.vs && snap.vs.round === 1
    && snap.players[0].inc.length === 1 && typeof snap.players[1].rs === 'number', {mode: snap.mode, state: snap.state, n: snap.players.length});
  r.check('snapshot: no errors', !a.errors.length, a.errors.slice(0, 2));
  await a.context.close();

  for (const how of ['hot.data', 'hot.ready(cb)']) {
    const init = how === 'hot.data' ? d => { window.claude = {hot: {snapshot() {}, data: d}}; } : d => { window.claude = {hot: {snapshot() {}, ready(cb) { setTimeout(() => cb(d), 0); }}}; };
    const b = await open(browser, {seed: 10, init, initArg: snap});
    await b.page.waitForFunction(() => blockfallTest.players.length === 2, null, {timeout: 3000}).catch(() => {});
    const s = await b.page.evaluate(() => {
      const T = blockfallTest, [P, B] = T.players;
      return {state: T.state, mode: cfg.mode, round: T.vs && T.vs.round, playMs: T.playMs, pieces: T.players.map(p => p.pieces), board0: JSON.stringify(P.board),
        cur0: P.cur && [P.cur.t, P.cur.x, P.cur.y, P.cur.r], board1: JSON.stringify(B.board), inc0: P.inc.length, title: document.querySelector('#ovTitle').textContent,
        opp: !document.querySelector('#opp').hidden, botPlan: !!(T.bots[1] && (T.bots[1].req || T.bots[1].q.length)), cur1: B.cur && [B.cur.t, B.cur.y]};
    });
    const p0 = snap.players[0];
    r.check(`restore via ${how}: comes back paused in versus, same boards, pieces, clock and match`,
      s.state === 'pause' && s.title === 'Paused' && s.round === 1 && s.opp && s.playMs === snap.playMs && s.pieces.join() === snap.players.map(p => p.pieces).join()
      && s.board0 === JSON.stringify(p0.board) && s.board1 === JSON.stringify(snap.players[1].board) && s.cur0.join() === [p0.cur.t, p0.cur.x, p0.cur.y, p0.cur.r].join() && s.inc0 === 1, s);
    r.check(`restore via ${how}: the bot asked for a plan for its piece, from the spawn position`, s.botPlan && s.cur1[0] === snap.players[1].cur.t, s.cur1);
    await b.page.keyboard.press('Escape');
    await b.page.waitForTimeout(2500);
    const t = await b.page.evaluate(() => ({state: blockfallTest.state, pieces: blockfallTest.players.map(p => p.pieces), y: blockfallTest.players[0].cur.y, mism: blockfallTest.botMismatch}));
    r.check(`restore via ${how}: after resume the bot plays on and your piece falls`, t.state === 'play' && t.pieces[1] > s.pieces[1] && t.y > s.cur0[2] && t.mism === 0, t);
    r.check(`restore via ${how}: no errors`, !b.errors.length, b.errors.slice(0, 2));
    await b.context.close();
  }

  // a snapshot from the game before versus: flat fields, Marathon
  const p = snap.players[0];
  const old = {board: p.board, cur: p.cur, hold: p.hold, canHold: p.canHold, queue: p.queue, bag: p.bag, score: 1234, lines: 7, level: 1, attack: 3,
    combo: -1, b2b: -1, playMs: 5000, pieces: 20, mode: 'marathon', state: 'play'};
  const c = await open(browser, {init: d => { window.claude = {hot: {snapshot() {}, data: d}}; }, initArg: old});
  const s = await c.page.evaluate(() => { const T = blockfallTest, P = T.players[0]; return {state: T.state, n: T.players.length, score: P.score, pieces: P.pieces, y: P.cur.y, opp: !document.querySelector('#opp').hidden, scoreText: document.querySelector('#score').textContent}; });
  r.check('old flat snapshot: Marathon comes back paused with its score', s.state === 'pause' && s.n === 1 && s.score === 1234 && s.pieces === 20 && !s.opp && s.scoreText === '1,234', s);
  await c.page.keyboard.press('Escape');
  await c.page.waitForTimeout(1300);
  const y1 = await c.page.evaluate(() => blockfallTest.players[0].cur.y);
  await c.page.keyboard.press('Space');
  const s2 = await c.page.evaluate(() => ({state: blockfallTest.state, pieces: blockfallTest.players[0].pieces}));
  r.check('old flat snapshot: gravity and hard drop work after resume', y1 > s.y && s2.pieces === 21, {y0: s.y, y1, pieces: s2.pieces});
  r.check('old flat snapshot: no errors', !c.errors.length, c.errors.slice(0, 2));
  await c.context.close();
  await browser.close();
});
