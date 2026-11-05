'use strict';
const USAGE = `usage: node study-site/test/click-guard.test.js <index.html>

The ghost-click guard (the capture click listener before quizKeep): a second click or tap within 400 ms (200 ms in a speed round),
less than 30 px from a first one whose element was removed, is dropped when it lands on an answer option (.op) or a pager button.
It keeps a double-click or a double tap that redraws the page from answering what is drawn under the second click.
Checked with real input (Playwright mouse, touchscreen and keyboard):
  - a mouse double-click and two quick taps on a button that is replaced by an option: the second click does not reach the option
  - a tap 30 px or more away, or after 400 ms, reaches it
  - Enter or Space (a click with detail 0 and no position) always reaches the option, at once after the first key
  - the lesson quiz: a wrong answer by keyboard, Enter on Try again, then Enter on an option at once: it is answered`;
const lib = require('./lib');
const a = lib.cli(USAGE);

lib.run('click-guard', async ({ launch }) => {
  const browser = await launch();
  let fail = 0;
  const ok = (c, m, i) => { if (!c) fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, hasTouch: true, deviceScaleFactor: 1 });
  await ctx.route(/^https?:\/\//, r => r.abort());
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(lib.fileUrl(a.file));
  await page.waitForFunction(() => typeof SUBJ !== 'undefined' && document.querySelector('.lesson:not([hidden])'));
  /* a test pair: button A (at 100,100) removes itself on click and draws an option .op in its place; the option counts its clicks */
  const setup = () => page.evaluate(() => {
    document.getElementById('cg-host') && document.getElementById('cg-host').remove();
    const h = document.createElement('div'); h.id = 'cg-host'; h.style.cssText = 'position:fixed;left:60px;top:60px;width:300px;height:200px;z-index:99999;background:#fff';
    const A = document.createElement('button'); A.type = 'button'; A.textContent = 'First'; A.id = 'cg-a'; A.style.cssText = 'position:absolute;left:0;top:0;width:200px;height:80px';
    window.__cg = 0;
    A.onclick = () => { const o = document.createElement('button'); o.type = 'button'; o.className = 'op'; o.id = 'cg-op'; o.textContent = 'Option'; o.style.cssText = A.style.cssText; o.onclick = () => { window.__cg++; }; A.replaceWith(o); o.focus(); };
    h.append(A); document.body.append(h);
  });
  const hits = () => page.evaluate(() => window.__cg);
  /* 1. a mouse double-click: the second click is dropped */
  await setup(); await page.mouse.dblclick(140, 100); await page.waitForTimeout(50);
  ok(await hits() === 0, 'a mouse double-click: the second click does not answer the option drawn under it');
  /* 2. two quick taps at the same place: the second is dropped */
  await setup(); await page.touchscreen.tap(140, 100); await page.waitForTimeout(80); await page.touchscreen.tap(142, 101); await page.waitForTimeout(50);
  ok(await hits() === 0, 'two quick taps: the second tap does not answer the option drawn under it');
  /* 3. a tap 30 px or more away, and a tap after 400 ms, reach the option */
  await setup(); await page.touchscreen.tap(140, 100); await page.waitForTimeout(80); await page.touchscreen.tap(140 + 45, 100); await page.waitForTimeout(50);
  ok(await hits() === 1, 'a second tap 45 px away reaches the option');
  await setup(); await page.touchscreen.tap(140, 100); await page.waitForTimeout(450); await page.touchscreen.tap(140, 100); await page.waitForTimeout(50);
  ok(await hits() === 1, 'a second tap after 450 ms reaches the option');
  /* 4. the keyboard: Enter, then Enter or Space at once */
  for (const k of ['Enter', 'Space']) {
    await setup(); await page.focus('#cg-a'); await page.keyboard.press('Enter'); await page.keyboard.press(k); await page.waitForTimeout(50);
    ok(await hits() === 1, 'Enter on the first button, then ' + k + ' on the option at once: the option acts');
  }
  /* 5. a tap, then the keyboard at once: the key acts */
  await setup(); await page.touchscreen.tap(140, 100); await page.focus('#cg-op'); await page.keyboard.press('Enter'); await page.waitForTimeout(50);
  ok(await hits() === 1, 'a tap on the first button, then Enter on the option at once: the option acts');
  await page.evaluate(() => document.getElementById('cg-host').remove());
  /* 6. the lesson quiz with the keyboard: a wrong answer, Try again, then an answer at once */
  const r = await page.evaluate(async () => {
    const W = ms => new Promise(r => setTimeout(r, ms)); goLesson('th', 0); await W(200);
    const card = document.querySelector('#th-0 .quiz'), items = SUBJ.th.lessons[0].qz, qs = [...card.children].filter(x => x.classList.contains('q'));
    const i = qs.findIndex((q, j) => items[j] && items[j].o && !q.dataset.done); if (i < 0) return { err: 'no open question' };
    return { i, id: 'th_0_' + i, a: items[i].a, o: items[i].o };
  });
  if (r.err) ok(false, 'the lesson quiz: ' + r.err);
  else {
    const txt = h => page.evaluate(h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.trim(); }, h);
    const wrong = await txt(r.o[r.a === 0 ? 1 : 0]), key = await txt(r.o[r.a]);
    const q = () => page.locator('#th-0 .quiz > .q').nth(r.i);
    await q().locator('button.op', { hasText: wrong }).first().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
    await q().locator('button', { hasText: 'Try again' }).focus(); await page.keyboard.press('Enter');
    /* Try again draws the question again and focuses its first option: move to the key with Tab, then Enter at once */
    const ord = await q().locator('button.op').allTextContents(), at = ord.map(s => s.trim()).indexOf(key);
    for (let k = 0; k < at; k++) await page.keyboard.press('Tab');
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    const e = await page.evaluate(id => Store.get(id), r.id);
    ok(!!e && e.ok === 1 && e.v === r.a, 'the lesson quiz: a wrong answer by keyboard, Enter on Try again, then Enter on the key at once: it is answered', e);
  }
  ok(errs.length === 0, 'no page errors', errs.slice(0, 3));
  await ctx.close();
  return fail;
});
