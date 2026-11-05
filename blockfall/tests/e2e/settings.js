#!/usr/bin/env node
// Test 5, settings: the Opponent section (difficulty slider with a live label, Best of, Same pieces, Garbage
// messiness) has the right defaults, persists across reload, is covered by "Reset all settings", rejects bad
// stored values, and the versus mode is remembered. A difficulty change applies from the bot's next piece.
const {launch, open, main} = require('./lib');
const PPS = [0, .4, .55, .7, .9, 1.1, 1.4, 1.7, 2, 2.5, 3];

main('settings', async r => {
  const browser = await launch();
  const {page, errors, context} = await open(browser, {seed: 3});
  const read = () => page.evaluate(() => {
    const q = s => document.querySelector(s);
    return {lv: q('#botLevel').value, text: q('#botText').textContent, bestOf: q('#bestOf').value, same: q('#samePieces').checked,
      mess: q('#messiness').value, messText: q('#messText').textContent, das: q('#das').value, ghost: q('#ghost').value,
      saved: JSON.parse(localStorage.getItem('blockfall') || 'null')};
  });
  const label = v => `Level ${v} - about ${PPS[v]} pieces per second`;
  let s = await read();
  r.check('Opponent section with heading', await page.evaluate(() => [...document.querySelectorAll('h2')].some(h => h.textContent === 'Opponent')));
  r.check('defaults: level 5, best of 3, same pieces on, messiness 0%', s.lv === '5' && s.text === label(5) && s.bestOf === '3' && s.same === true && s.mess === '0' && s.messText === '0%', s);
  r.check('slider is a 1..10 range with id botLevel', await page.evaluate(() => { const e = document.querySelector('#botLevel'); return e.type === 'range' && e.min === '1' && e.max === '10'; }));
  r.check('messiness is a 0..100 range in steps of 10', await page.evaluate(() => { const e = document.querySelector('#messiness'); return e.type === 'range' && e.min === '0' && e.max === '100' && e.step === '10'; }));
  r.check('Best of offers 1, 3, 5, 7', JSON.stringify(await page.$$eval('#bestOf option', o => o.map(x => x.value))) === '["1","3","5","7"]');

  // live label for every level, set like a user would (fill dispatches input events)
  const seen = [];
  for (let v = 1; v <= 10; v++) { await page.fill('#botLevel', String(v)); seen.push((await read()).text === label(v)); }
  r.check('slider label updates live for levels 1..10', seen.every(Boolean), seen);
  // mouse: click at the left end, then the right end of the slider track
  const box = await page.locator('#botLevel').boundingBox();
  await page.mouse.click(box.x + 2, box.y + box.height / 2);
  const left = await read();
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
  const right = await read();
  r.check('mouse clicks on the slider set level 1 and 10 and the label follows', left.lv === '1' && left.text === label(1) && right.lv === '10' && right.text === label(10), [left.text, right.text]);
  // keyboard: Home / End are not game keys, so they move the focused slider
  await page.focus('#botLevel'); await page.keyboard.press('Home');
  const home = await read();
  await page.keyboard.press('End');
  const end = await read();
  r.check('Home / End on the focused slider work and update the label', home.lv === '1' && home.text === label(1) && end.lv === '10' && end.text === label(10), [home.text, end.text]);
  await page.$eval('#botLevel', el => el.blur());

  await page.fill('#botLevel', '8');
  await page.selectOption('#bestOf', '7');
  await page.click('#samePieces');
  await page.fill('#messiness', '30');
  s = await read();
  r.check('changes show at once: level 8 label, best of 7, same pieces off, 30%', s.text === label(8) && s.bestOf === '7' && !s.same && s.messText === '30%', s);
  r.check('changes are saved in localStorage', s.saved.botLevel === 8 && s.saved.bestOf === 7 && s.saved.samePieces === false && s.saved.messiness === 30, s.saved);

  await page.reload();
  s = await read();
  r.check('after reload the Opponent settings are kept', s.lv === '8' && s.text === label(8) && s.bestOf === '7' && !s.same && s.mess === '30' && s.messText === '30%', s);

  await page.fill('#das', '200'); await page.$eval('#das', el => { el.dispatchEvent(new Event('change')); el.blur(); });
  await page.click('#reset');
  s = await read();
  r.check('Reset all settings resets the Opponent settings (and the others)', s.lv === '5' && s.text === label(5) && s.bestOf === '3' && s.same && s.mess === '0' && s.messText === '0%' && s.das === '133', s);
  r.check('Reset saves the defaults', s.saved.botLevel === 5 && s.saved.bestOf === 3 && s.saved.samePieces === true && s.saved.messiness === 0, s.saved);
  await page.reload();
  s = await read();
  r.check('after reset and reload the defaults stay', s.lv === '5' && s.bestOf === '3' && s.same && s.mess === '0', s);

  // versus mode is remembered: the Versus button is current and Enter starts versus
  await page.click('#mVersus');
  await page.reload();
  r.check('after reload Versus is the current mode button', await page.evaluate(() => document.querySelector('#mVersus').classList.contains('current') && !document.querySelector('#mMarathon').classList.contains('current')));
  await page.keyboard.press('Enter');
  r.check('Enter starts versus again', await page.evaluate(() => blockfallTest.state === 'play' && blockfallTest.players.length === 2 && !document.querySelector('#opp').hidden));

  // bad stored values are not used
  await page.evaluate(() => localStorage.setItem('blockfall', JSON.stringify({botLevel: 42, bestOf: 4, messiness: -5, samePieces: 'yes', mode: 'versus', das: 150})));
  await page.reload();
  s = await read();
  r.check('bad stored values fall back: level 42 -> 10, best of 4 -> 3, messiness -5 -> 0, same pieces "yes" -> on', s.lv === '10' && s.text === label(10) && s.bestOf === '3' && s.mess === '0' && s.same && s.das === '150', s);
  await page.evaluate(() => localStorage.setItem('blockfall', JSON.stringify({botLevel: 6.6, bestOf: '5', mode: 'nope'})));
  await page.reload();
  s = await read();
  r.check('non-integer level is rounded, a string Best of is ignored, an unknown mode gives Marathon', s.lv === '7' && s.bestOf === '3' && await page.evaluate(() => cfg.mode) === 'marathon', s);
  await page.evaluate(() => localStorage.removeItem('blockfall'));
  await page.reload();

  // a difficulty change applies from the bot's next piece (main backend, game time)
  await page.fill('#botLevel', '2');
  const d = await page.evaluate(() => {
    const T = blockfallTest, q = s => document.querySelector(s);
    T.setBackend('main'); q('#mVersus').click(); T.step(100);
    const b = T.bots[1], n0 = T.players[1].pieces, out = {lv0: b.level, period0: b.period, label0: q('#botName').textContent};
    const el = q('#botLevel'); el.value = '9'; el.dispatchEvent(new Event('input'));
    T.step(16);
    out.lvSame = b.level; out.nSame = T.players[1].pieces;
    let k = 0; while (T.players[1].pieces === n0 && k++ < 300) T.step(16);
    T.step(16);
    out.lv1 = b.level; out.period1 = b.period; out.label1 = q('#botName').textContent; out.cfg = cfg.botLevel;
    return out;
  });
  r.check('difficulty change applies from the next piece, period follows the speed table', d.lv0 === 2 && Math.abs(d.period0 - 1000 / PPS[2]) < 1e-9 && d.lvSame === 2 && d.lv1 === 9 && Math.abs(d.period1 - 1000 / PPS[9]) < 1e-9, d);
  r.check('opponent label follows: Bot, level 2 then Bot, level 9', d.label0 === 'Bot, level 2' && d.label1 === 'Bot, level 9', [d.label0, d.label1]);
  r.check('no page or console errors', !errors.length, errors.slice(0, 3));
  await context.close();
  await browser.close();
});
