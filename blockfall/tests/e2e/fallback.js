#!/usr/bin/env node
// Test 7, worker fallback (SPEC 4.4): if creating the worker throws or the worker errors (at load or later),
// the game switches to the main-thread backend, asks again for the plan it was waiting for, and the bot plays on.
const {launch, open, main} = require('./lib');

main('fallback', async r => {
  const browser = await launch();
  const cases = [
    ['Worker constructor throws', {init: () => { window.Worker = function () { throw new Error('workers blocked'); }; }}],
    ['worker reports an error after 100 ms', {init: () => {
      window.Worker = class { constructor() { setTimeout(() => this.onerror && this.onerror({preventDefault() {}}), 100); } postMessage() {} terminate() {} };
    }}],
    ['real worker: engine source fails to load in a worker', {src: s => "if (typeof importScripts === 'function') throw new Error('worker boom');\n" + s}],
    ['real worker: engine fails on its 5th plan', {src: s => s + "\nif (typeof importScripts === 'function') { const om = self.onmessage; let n = 0; self.onmessage = e => { if (e.data.type === 'think' && ++n === 5) throw new Error('late boom'); om(e); }; }\n"}],
  ];
  for (const [name, c] of cases) {
    const {page, errors, context} = await open(browser, {seed: 5, init: c.init});
    if (c.src) await page.evaluate(code => { const el = document.querySelector('#bot-engine'); el.textContent = new Function('s', 'return (' + code + ')(s)')(el.textContent); }, c.src.toString());
    await page.fill('#botLevel', '10');
    await page.click('#mVersus');
    const b0 = await page.evaluate(() => blockfallTest.backend);
    await page.waitForTimeout(3000);
    const s = await page.evaluate(() => ({backend: blockfallTest.backend, pieces: blockfallTest.players[1].pieces, playMs: blockfallTest.playMs, mism: blockfallTest.botMismatch, spin: blockfallTest.botSpinMismatch, state: blockfallTest.state}));
    const due = Math.floor(s.playMs * 3 / 1000);   // level 10 = 3 pieces per second of game time
    const expected = errors.filter(e => !/worker boom|late boom/.test(e));
    console.log(name, JSON.stringify({b0, ...s}), 'console:', errors);
    r.check(`${name}: falls back to the main thread`, s.backend === 'main', s.backend);
    r.check(`${name}: the bot keeps playing at level 10 (3 pieces per second of game time)`, s.pieces >= due - 1 && s.pieces >= 5 && s.state === 'play', {pieces: s.pieces, due});
    r.check(`${name}: plans still match (mismatch 0)`, s.mism === 0 && s.spin === 0, [s.mism, s.spin]);
    r.check(`${name}: no unexpected page or console errors`, !expected.length, expected.slice(0, 3));
    await context.close();
  }
  await browser.close();
});
