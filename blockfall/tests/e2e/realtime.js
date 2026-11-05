#!/usr/bin/env node
// Test 4, real time with the worker backend: the bot keeps its target speed at difficulty 10 and 1 for at
// least 10 s each (game time and wall-clock), a slider change applies from the bot's next piece, pause holds
// the bot, and stale worker answers (old piece, earlier round) are ignored. You stay idle.
//   node realtime.js [--secs 12]
const {launch, open, main, opt} = require('./lib');
const PPS = [0, .4, .55, .7, .9, 1.1, 1.4, 1.7, 2, 2.5, 3];

main('realtime', async r => {
  const secs = +opt('secs', 12);
  const browser = await launch();
  const {page, errors, context} = await open(browser, {seed: 11});
  // count worker answers that reach the game, and the ones no bot is waiting for (test-only wrapper)
  await page.evaluate(() => {
    window.__got = {all: 0, stale: 0};
    const og = window.got;
    window.got = res => { __got.all++; if (!blockfallTest.bots.some(b => b && b.id === res.id && b.req)) __got.stale++; return og(res); };
  });
  // samples [wall ms, game ms, bot pieces, bot level, state] every 50 ms
  const sample = ms => page.evaluate(ms => new Promise(res => {
    const T = blockfallTest, out = [], t0 = performance.now();
    const id = setInterval(() => {
      T.players[0].inc.length = 0;     // keep the idle human alive, so a strong engine cannot end the round while we measure
      out.push([performance.now() - t0, T.playMs, T.players[1].pieces, T.bots[1].level, T.state]);
      if (performance.now() - t0 >= ms) { clearInterval(id); res(out); }
    }, 50);
  }), ms);
  // speed from the first to the last piece drop seen
  const speed = s => {
    const drops = s.filter((x, i) => i && x[2] > s[i - 1][2]);
    if (drops.length < 3) return {drops: drops.length};
    const a = drops[0], b = drops[drops.length - 1], n = b[2] - a[2];
    return {drops: drops.length, pieces: n, game: +(n / (b[1] - a[1]) * 1000).toFixed(3), wall: +(n / (b[0] - a[0]) * 1000).toFixed(3), gameMs: Math.round(s[s.length - 1][1] - s[0][1]), wallMs: Math.round(s[s.length - 1][0])};
  };

  await page.fill('#botLevel', '10');
  await page.click('#mVersus');
  const s10 = await sample(secs * 1000);
  const v10 = speed(s10);
  const st = await page.evaluate(() => ({backend: blockfallTest.backend, mism: blockfallTest.botMismatch, spin: blockfallTest.botSpinMismatch, state: blockfallTest.state}));
  console.log('level 10:', JSON.stringify(v10), JSON.stringify(st));
  r.check('worker backend in use (no fallback)', st.backend === 'worker', st.backend);
  r.check(`level 10: ran ${secs} s of game time`, v10.gameMs >= secs * 1000 * 0.9 && s10.every(x => x[4] === 'play'), v10);
  r.check('level 10: about 3 pieces per second in game time (within 5%)', Math.abs(v10.game / PPS[10] - 1) < 0.05, v10.game);
  r.check('level 10: about 3 pieces per second by the wall clock (within 15%)', Math.abs(v10.wall / PPS[10] - 1) < 0.15, v10.wall);
  r.check('level 10: plans match the game (mismatch 0)', st.mism === 0 && st.spin === 0, st);

  // the slider change applies from the bot's next piece
  const before = await page.evaluate(() => ({lv: blockfallTest.bots[1].level, n: blockfallTest.players[1].pieces}));
  await page.fill('#botLevel', '1');
  const same = await page.evaluate(() => ({lv: blockfallTest.bots[1].level, n: blockfallTest.players[1].pieces}));
  await page.waitForFunction(n => blockfallTest.players[1].pieces > n, before.n + (same.n > before.n ? 1 : 0), {timeout: 3000}).catch(() => {});
  const after = await page.evaluate(() => ({lv: blockfallTest.bots[1].level, label: document.querySelector('#botName').textContent}));
  r.check('slider change: current piece keeps level 10, the next piece uses level 1', before.lv === 10 && (same.n > before.n || same.lv === 10) && after.lv === 1, {before, same, after});
  await page.waitForFunction(() => document.querySelector('#botName').textContent === 'Bot, level 1', null, {timeout: 2000}).catch(() => {});
  r.check('opponent label shows the new level', await page.textContent('#botName') === 'Bot, level 1');

  const s1 = await sample(secs * 1000);
  const v1 = speed(s1);
  console.log('level 1:', JSON.stringify(v1));
  r.check(`level 1: ran ${secs} s of game time`, v1.gameMs >= secs * 1000 * 0.9 && s1.every(x => x[3] === 1 && x[4] === 'play'), v1);
  r.check('level 1: about 0.4 pieces per second in game time (within 5%)', Math.abs(v1.game / PPS[1] - 1) < 0.05, v1.game);
  r.check('level 1: about 0.4 pieces per second by the wall clock (within 15%)', Math.abs(v1.wall / PPS[1] - 1) < 0.15, v1.wall);

  // pause holds the bot and the clock, resume goes on
  await page.keyboard.press('Escape');
  const p0 = await page.evaluate(() => [blockfallTest.state, blockfallTest.playMs, blockfallTest.players[1].pieces]);
  await page.waitForTimeout(3000);
  const p1 = await page.evaluate(() => [blockfallTest.state, blockfallTest.playMs, blockfallTest.players[1].pieces]);
  r.check('pause: 3 s pass with no game time and no bot pieces', p0[0] === 'pause' && p1[0] === 'pause' && p0[1] === p1[1] && p0[2] === p1[2], [p0, p1]);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(3000);
  const p2 = await page.evaluate(() => [blockfallTest.state, blockfallTest.playMs, blockfallTest.players[1].pieces]);
  r.check('resume: the bot plays on', p2[0] === 'play' && p2[2] > p1[2] && p2[1] > p1[1], p2);

  // stale answers: two starts in one task (old piece), and a round that ends while a plan is on its way
  await page.fill('#botLevel', '10');
  const g0 = await page.evaluate(() => ({...__got}));
  await page.evaluate(() => { start('versus'); start('versus'); });
  await page.waitForTimeout(1500);
  const g1 = await page.evaluate(() => ({...__got, pieces: blockfallTest.players[1].pieces, mism: blockfallTest.botMismatch}));
  r.check('stale answer from the first start is ignored, the bot plays the new match', g1.stale - g0.stale >= 1 && g1.pieces >= 3 && g1.mism === 0, {g0, g1});
  const g2 = await page.evaluate(() => {
    const T = blockfallTest, P = T.players[0];
    T.bots[1].begin();                                    // a plan request is now on its way
    for (let y = 0; y < 24; y++) P.board[y] = Array.from({length: 10}, (_, x) => y && !x ? 'J' : null);
    P.inc = []; P.take(8); P.inc[0].t = 0; P.spawn('O'); P.hardDrop();   // you top out: round over
    const s = T.state;
    nextRound();                                          // the next round starts before the answer comes
    return {state: s, round: T.vs.round, ...__got};
  });
  await page.waitForTimeout(1500);
  const g3 = await page.evaluate(() => ({...__got, pieces: blockfallTest.players[1].pieces, mism: blockfallTest.botMismatch, state: blockfallTest.state}));
  r.check('stale answer from an earlier round is ignored, round 2 plays normally', g2.state === 'round' && g2.round === 2 && g3.stale - g2.stale >= 1 && g3.pieces >= 3 && g3.mism === 0 && g3.state === 'play', {g2, g3});
  r.check('no page or console errors', !errors.length, errors.slice(0, 3));
  await context.close();
  await browser.close();
});
