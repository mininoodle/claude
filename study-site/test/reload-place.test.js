'use strict';
const USAGE = `usage: node study-site/test/reload-place.test.js <index.html>

A reload goes back to the place the student left (savePlace and the load handler after it). The place is the block at the top of
the window (a card, or a question of the quiz) and its offset on screen: after a raw jump (the End key, a scrollbar drag) the
question figures that were passed over are drawn only after the reload, thus a place kept as y alone would show another question.
Cases: ec-7 at 60 % of the page and after the End key at 1366 px, ec-8 at 85 % at 390 px, a natural scroll (mouse wheel) in ec-7,
and an older saved place (y only) that is restored by y. Each case: the same block at the same offset (4 px or less).
One more case: a reload while reading inside an open worked example of ec-7 (1366 px): the example is closed after the reload,
thus the saved offset is past its end; its card is shown at the top, under the bar.`;
const lib = require('./lib');
const a = lib.cli(USAGE);

/* in the page: the block at the top of the window, as the test sees it */
function topBlock() {
  const L = document.querySelector('#main > article:not([hidden])'), y = topBar() + 8;
  const qs = [...L.querySelectorAll('.quiz > .q')], cs = [...L.querySelectorAll('.card')].filter(c => !c.parentElement.closest('.card'));
  const q = qs.find(e => e.getBoundingClientRect().bottom > y), c = cs.find(e => e.getBoundingClientRect().bottom > y);
  const useQ = q && c && c.contains(q), e = useQ ? q : c;
  return { k: (useQ ? 'question ' + qs.indexOf(q) : 'card ' + cs.indexOf(c)), t: Math.round(e.getBoundingClientRect().top), y: Math.round(scrollY) };
}

lib.run('reload-place', async ({ launch }) => {
  const browser = await launch();
  let fail = 0;
  const ok = (c, m, i) => { if (!c) fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + m + (i !== undefined ? '  ' + JSON.stringify(i) : '')); };
  const ready = p => p.waitForFunction(() => typeof SUBJ !== 'undefined' && document.querySelector('.lesson:not([hidden])'));
  const cases = [['ec', 7, 1366, '60%'], ['ec', 7, 1366, 'End'], ['ec', 8, 390, '85%'], ['ec', 7, 1366, 'wheel'], ['mom', 1, 1366, 'old'], ['ec', 7, 1366, 'open']];
  for (const [sk, L, W, mode] of cases) {
    const h = await lib.openPage(browser, a.file, { width: W, height: W < 600 ? 844 : 900 }), p = h.page;
    await ready(p); await p.evaluate(([sk, L]) => goLesson(sk, L), [sk, L]); await p.waitForTimeout(900);
    const name = sk + '-' + L + ' at ' + W + ' px, ' + (mode === 'End' ? 'the End key' : mode === 'wheel' ? 'a natural scroll' : mode === 'old' ? 'an older saved place (y only)' : mode === 'open' ? 'inside an open worked example' : 'a jump to ' + mode + ' of the page');
    if (mode === 'old') {
      /* an older copy of the place: h and y only; the page that unloads may not write its own place over it */
      await p.evaluate(() => { sessionStorage.setItem('unit-study-site.place', JSON.stringify({ h: location.hash, y: 3000 })); const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'unit-study-site.place') return; return set.call(this, k, v); }; });
      await p.reload(); await ready(p); await p.waitForTimeout(900);
      const y = await p.evaluate(() => Math.round(scrollY));
      ok(Math.abs(y - 3000) <= 2, name + ': restored by y', { y });
    } else if (mode === 'open') {
      /* every worked example open; a jump to the middle of the middle one (far past the end of its closed card) */
      const y = await p.evaluate(() => { const ds = [...document.querySelectorAll('#ec-7 details')]; ds.forEach(d => { d.open = true; }); const d = ds[Math.floor(ds.length / 2)], r = d.getBoundingClientRect(); return Math.round(r.top + scrollY + r.height / 2); });
      await p.waitForTimeout(300); await p.evaluate(y => window.scrollTo(0, y), y); await p.waitForTimeout(900);
      const before = await p.evaluate(topBlock);
      await p.reload(); await ready(p); await p.waitForTimeout(1500);
      const after = await p.evaluate(topBlock), y0 = await p.evaluate(() => topBar() + 8);
      ok(before.k === after.k && before.t < -200 && Math.abs(after.t - y0) <= 4, name + ': the example is closed after the reload: its card at the top, under the bar', { before, after, y0 });
    } else {
      if (mode === 'End') await p.keyboard.press('End');
      else if (mode === 'wheel') for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, 700); await p.waitForTimeout(120); }
      else await p.evaluate(f => window.scrollTo(0, Math.round(document.documentElement.scrollHeight * f)), parseFloat(mode) / 100);
      await p.waitForTimeout(900);
      const before = await p.evaluate(topBlock);
      await p.reload(); await ready(p); await p.waitForTimeout(1500);
      const after = await p.evaluate(topBlock);
      ok(before.k === after.k && Math.abs(before.t - after.t) <= 4, name + ': the same block at the same offset after a reload', { before, after });
    }
    ok(h.errors.length === 0, name + ': no page errors', h.errors.slice(0, 2));
    await h.close();
  }
  return fail;
});
