#!/usr/bin/env node
// Test 2, single-player regressions: Marathon / Sprint / Blitz start and end, keyboard play through real key
// events (move, DAS, rotate both ways, 180, hold, hard drop, soft drop, IRS / IHS, pause, restart), stats,
// line clears with attack, B2B, combo and perfect clear, level up, focus rules, no console errors.
const {launch, open, main} = require('./lib');

main('single', async r => {
  const browser = await launch();
  const {page, errors} = await open(browser, {seed: 7});
  const kb = page.keyboard, wait = ms => page.waitForTimeout(ms);
  const text = s => page.textContent(s);
  const st = () => page.evaluate(() => {
    const T = blockfallTest, P = T.players[0], c = P && P.cur;
    return {state: T.state, n: T.players.length, t: c && c.t, x: c && c.x, y: c && c.y, r: c && c.r, hold: P && P.hold, canHold: P && P.canHold,
      pieces: P && P.pieces, score: P && P.score, lines: P && P.lines, level: P && P.level, attack: P && P.attack, q: P && P.queue.slice(0, 5),
      inc: P && P.inc.length, playMs: T.playMs};
  });
  // DOM stats update on the next frame, so wait for them instead of reading at once
  const soon = (sel, v) => page.waitForFunction(([sel, v]) => document.querySelector(sel).textContent === v, [sel, v], {timeout: 2000}).then(() => true, () => false);
  const atWall = dx => page.evaluate(dx => { const P = blockfallTest.players[0], c = P.cur; return !P.fits(c.m, c.x + dx, c.y); }, dx);
  const dropUntil = async (cond, max = 8) => { for (let i = 0; i < max && !cond(await st()); i++) await kb.press('Space'); };

  // ---- start screen ----
  r.check('start overlay: title and text', await text('#ovTitle') === 'Blockfall' && (await text('#ovText')) === 'Choose a mode, or press Enter.');
  const btns = await page.$$eval('#overlay .modes button', b => b.map(x => x.textContent));
  r.check('mode buttons: Marathon, Sprint 40L, Blitz 2:00, Versus', JSON.stringify(btns) === '["Marathon","Sprint 40L","Blitz 2:00","Versus"]', btns);
  r.check('opponent column and Next round hidden', await page.isHidden('#opp') && await page.isHidden('#mNext'));
  await page.evaluate(() => { window.__dp = {}; addEventListener('keydown', e => { (__dp[e.code] = __dp[e.code] || []).push(e.defaultPrevented); }); });

  // ---- Marathon by click ----
  await page.click('#mMarathon');
  let s = await st();
  r.check('Marathon starts: play, overlay hidden, one player', s.state === 'play' && s.pieces === 0 && s.n === 1 && await page.isHidden('#overlay'), s);
  r.check('start button is blurred', await page.evaluate(() => document.activeElement === document.body));
  r.check('no opponent in single-player', await page.isHidden('#opp'));
  await dropUntil(s => s.t !== 'O' && s.q[0] !== 'O');
  s = await st();

  // ---- rotations at spawn ----
  await kb.press('ArrowUp'); let s2 = await st();
  r.check('rotate right (ArrowUp) turns to r=1', s2.r === 1, s2.r);
  await kb.press('KeyZ'); s2 = await st();
  r.check('rotate left (Z) turns back to r=0', s2.r === 0, s2.r);
  await kb.press('KeyA'); s2 = await st();
  r.check('rotate 180 (A) turns to r=2', s2.r === 2, s2.r);
  await kb.press('KeyX'); s2 = await st();
  r.check('second rotate right key (X) turns to r=3', s2.r === 3, s2.r);
  await kb.press('ControlLeft'); s2 = await st();
  r.check('second rotate left key (Left Ctrl) turns to r=2', s2.r === 2, s2.r);
  await kb.press('KeyA');

  // ---- moves and DAS ----
  s = await st();
  await kb.press('ArrowLeft'); s2 = await st();
  r.check('tap left moves one column', s2.x === s.x - 1, [s.x, s2.x]);
  await kb.press('ArrowRight'); s2 = await st();
  r.check('tap right moves one column', s2.x === s.x, [s.x, s2.x]);
  await kb.down('ArrowRight'); await wait(450); await kb.up('ArrowRight');
  s2 = await st();
  r.check('held right: DAS then ARR reach the right wall', s2.x > s.x + 1 && await atWall(1), s2.x);
  // A long DAS: a 400 ms hold moves only once
  await page.fill('#das', '1000'); await page.$eval('#das', el => { el.dispatchEvent(new Event('change')); el.blur(); });
  s = await st();
  await kb.down('ArrowLeft'); await wait(400); await kb.up('ArrowLeft');
  s2 = await st();
  r.check('DAS 1000 ms: a 400 ms hold moves once', s2.x === s.x - 1, [s.x, s2.x]);
  await page.fill('#das', '133'); await page.$eval('#das', el => { el.dispatchEvent(new Event('change')); el.blur(); });
  r.check('DAS setting saved', await page.evaluate(() => JSON.parse(localStorage.blockfall).das) === 133);

  // ---- hold ----
  s = await st();
  await kb.press('KeyC'); s2 = await st();
  r.check('hold (C) keeps the piece and takes the next one', s2.hold === s.t && !s2.canHold && s2.t === s.q[0], [s.t, s.q[0], s2.hold, s2.t]);
  await kb.press('ShiftLeft'); let s3 = await st();
  r.check('second hold key does nothing before a lock', s3.hold === s2.hold && s3.t === s2.t);

  // ---- hard drop ----
  s = await st();
  const dist = await page.evaluate(() => { const P = blockfallTest.players[0]; return P.ghostY() - P.cur.y; });
  await kb.press('Space'); s2 = await st();
  r.check('hard drop locks the piece, adds 2 points a row, allows hold again',
    s2.pieces === s.pieces + 1 && s2.canHold && [2 * dist, 2 * dist - 2].includes(s2.score - s.score), {d: dist, score: s2.score - s.score});

  // ---- soft drop ----
  s = await st();
  await kb.down('ArrowDown'); await wait(300); await kb.up('ArrowDown');
  s2 = await st();
  r.check('soft drop moves fast and scores 1 a row', s2.y - s.y >= 3 && s2.score - s.score === s2.y - s.y, [s2.y - s.y, s2.score - s.score]);

  // ---- gravity and lock delay ----
  s = await st();
  await wait(2200);
  s2 = await st();
  r.check('gravity at level 1: about 1 row a second', s2.y - s.y >= 1 && s2.y - s.y <= 3, s2.y - s.y);
  s = await st();
  await kb.down('ArrowDown'); await wait(2200); await kb.up('ArrowDown');
  s2 = await st();
  r.check('soft drop to the floor, then lock delay locks it', s2.pieces > s.pieces, [s.pieces, s2.pieces]);

  // ---- IRS and IHS ----
  await dropUntil(s => s.q[0] !== 'O');
  await kb.down('ArrowUp'); await kb.press('Space'); s2 = await st(); await kb.up('ArrowUp');
  r.check('IRS: holding rotate right spawns the next piece turned', s2.r === 1, s2);
  s = await st();
  await kb.down('KeyC'); const s1 = await st(); await kb.press('Space'); s2 = await st(); await kb.up('KeyC');
  r.check('IHS: holding hold sends the next piece straight to hold', s2.hold === s1.q[0] && s2.t === s1.hold && !s2.canHold, [s1.hold, s1.q[0], s2.hold, s2.t]);

  // ---- pause ----
  await kb.press('Escape');
  s = await st();
  r.check('pause: state and overlay', s.state === 'pause' && await page.isVisible('#overlay') && await text('#ovTitle') === 'Paused'
    && await text('#ovText') === 'Escape to resume. A mode button restarts.', await text('#ovText'));
  const t1 = await text('#time'); await wait(400); const t2 = await text('#time');
  r.check('time stops while paused', t1 === t2, [t1, t2]);
  await kb.press('Escape'); await wait(300);
  r.check('resume: time runs again', (await st()).state === 'play' && await text('#time') !== t2);

  // ---- stats ----
  await page.evaluate(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))));
  const shown = await page.evaluate(() => {
    const P = blockfallTest.players[0], g = id => document.getElementById(id).textContent;
    return {score: g('score') === P.score.toLocaleString(), lines: g('lines') === String(P.lines), level: g('level') === String(P.level),
      attack: g('attack') === String(P.attack), pps: Math.abs(+g('pps') - P.pieces / (blockfallTest.playMs / 1000)) < 0.05, ppsText: g('pps'), time: g('time')};
  });
  r.check('stats show score, lines, level, attack, PPS', shown.score && shown.lines && shown.level && shown.attack && shown.pps && shown.ppsText !== '0.00', shown);

  // ---- line clears through keys: quad, then quad + B2B + combo + perfect clear, then level 2 ----
  const quadSetup = leftover => page.evaluate(leftover => {
    const P = blockfallTest.players[0];
    for (let y = 0; y < 24; y++) P.board[y] = Array.from({length: 10}, (_, x) => y >= 20 && x ? 'L' : null);
    if (leftover) P.board[12][6] = 'T';
    P.spawn('I');
  }, leftover);
  const placeI = async () => {
    await kb.press('ArrowUp');
    await kb.down('ArrowLeft'); await wait(350); await kb.up('ArrowLeft');
    const c = await st();
    await kb.press('Space');
    return c;
  };
  await quadSetup(true); s = await st();
  let c = await placeI(); s2 = await st();
  const act1 = await text('#action');
  r.check('vertical I at the left wall', c.t === 'I' && c.r === 1 && c.x === -2, c);
  r.check('quad: 4 lines, 4 attack, action text', s2.lines - s.lines === 4 && s2.attack - s.attack === 4 && act1.includes('Quad') && act1.includes('+4 attack'), {lines: s2.lines - s.lines, atk: s2.attack - s.attack, act1});
  await quadSetup(false); s = await st();
  c = await placeI(); s2 = await st();
  const act2 = await text('#action');
  r.check('quad + B2B + combo + perfect clear: 15 attack, 4250 points',
    s2.attack - s.attack === 15 && s2.score - s.score - 2 * (20 - c.y) === 4250 && ['B2B ×1', '1 Combo', 'Perfect Clear', '+15 attack'].every(m => act2.includes(m)),
    {atk: s2.attack - s.attack, pts: s2.score - s.score, act2});
  await quadSetup(true); s = await st();
  await placeI(); s2 = await st();
  r.check('Marathon level goes up every 10 lines', s2.lines === 12 && s2.level === 2 && await soon('#level', '2'), [s2.lines, s2.level, await text('#level')]);
  r.check('no incoming garbage in single-player', s2.inc === 0 && s2.n === 1);

  // ---- restart key ----
  await kb.press('Space');
  await kb.press('KeyR'); s = await st();
  r.check('restart (R) starts a new game', s.state === 'play' && s.pieces === 0 && s.score === 0 && s.lines === 0);

  // ---- game over by stacking ----
  for (let i = 0; i < 60 && (await st()).state === 'play'; i++) await kb.press('Space');
  s = await st();
  const overText = await text('#ovText');
  r.check('Marathon ends with game over', s.state === 'over' && await text('#ovTitle') === 'Game over' && /^[\d,]+ points, \d+ attack, [\d.]+ PPS$/.test(overText), overText);
  r.check('the dead board is drawn faded (alive false)', await page.evaluate(() => blockfallTest.players[0].alive === false));
  await kb.press('Enter'); s = await st();
  r.check('Enter restarts the last mode', s.state === 'play' && s.pieces === 0 && await page.evaluate(() => cfg.mode) === 'marathon');

  // ---- Sprint ----
  await kb.press('Escape'); await page.click('#mSprint');
  await page.evaluate(() => { blockfallTest.setBackend('main'); blockfallTest.humanBot(10); });
  const sp = await page.evaluate(() => {
    const T = blockfallTest; let n = 0;
    while (T.state === 'play' && n++ < 400) T.step(500);
    const P = T.players[0];
    return {state: T.state, lines: P.lines, level: P.level, playMs: T.playMs, best: JSON.parse(localStorage.blockfall).best, linesText: document.getElementById('lines').textContent};
  });
  const spTitle = await text('#ovTitle'), spText = await text('#ovText');
  r.check('Sprint ends at 40 lines with the time', sp.state === 'done' && sp.lines >= 40 && sp.level === 1 && spTitle.startsWith('40 lines in ') && spText === 'New best', {sp, spTitle, spText});
  r.check('Sprint best time saved', sp.best === sp.playMs && sp.linesText === `${sp.lines}/40`, sp);

  // ---- Blitz ----
  await page.click('#mBlitz');
  const bl = await page.evaluate(() => {
    const T = blockfallTest; let n = 0;
    while (T.state === 'play' && n++ < 300) T.step(1000);
    const P = T.players[0];
    return {state: T.state, playMs: T.playMs, score: P.score, lines: P.lines, level: P.level, best: JSON.parse(localStorage.blockfall).bestBlitz, time: document.getElementById('time').textContent};
  });
  const blTitle = await text('#ovTitle'), blText = await text('#ovText');
  r.check('Blitz ends after 2:00', bl.state === 'done' && bl.playMs === 120000 && bl.time === '0:00.00', bl);
  r.check('Blitz result text and best score saved', blTitle === `${bl.score.toLocaleString()} points` && blText.startsWith(`${bl.lines} lines, `) && blText.endsWith('New best') && bl.best === bl.score, {blTitle, blText});
  r.check('Blitz levels up like Marathon', bl.level === Math.floor(bl.lines / 10) + 1, bl);
  await page.evaluate(() => blockfallTest.humanBot(null));

  // ---- focus rules ----
  const dp = await page.evaluate(() => __dp);
  const bound = ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyZ', 'KeyX', 'KeyA', 'KeyC', 'Escape', 'KeyR', 'ShiftLeft', 'ControlLeft'];
  r.check('bound keys call preventDefault', bound.every(k => dp[k] && dp[k].every(Boolean)), Object.fromEntries(bound.map(k => [k, dp[k] && dp[k].every(Boolean)])));
  await kb.press('KeyQ');
  r.check('unbound keys are left alone', (await page.evaluate(() => __dp.KeyQ)).every(v => !v));
  r.check('no page or console errors', !errors.length, errors.slice(0, 5));
  // ---- the start screen lists the saved bests after a reload ----
  await page.reload();
  const ready = await text('#ovText');
  r.check('after reload the start screen lists Sprint and Blitz bests', ready === `Choose a mode, or press Enter. Sprint best 0:${sp.playMs < 10000 ? '0' : ''}${(sp.playMs / 1000).toFixed(2)}. Blitz best ${bl.score.toLocaleString()}.`, ready);
  r.check('no page or console errors after reload', !errors.length, errors.slice(0, 5));
  await browser.close();
});
