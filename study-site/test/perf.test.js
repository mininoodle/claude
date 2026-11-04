'use strict';
/* usage: node study-site/test/perf.test.js <index.html>

The speed work on the page (perf items P1, P3, P4, P5 and P7). Exit code 0 = pass, 1 = fail.
  - P1: the sidebar skin's <style> comes before the script line that calls boot(), thus the first view is laid out once, with the skin
  - P1, P5: no accent transition and no old background animation run at load; a light/dark switch starts no transition of the accent
    colours; a mouse move over a card writes no --mx/--my
  - P4: the cards of a lesson that was seen get the class cvr when the page is idle, and those off screen skip rendering. Shown again, the
    lesson has the same height and a jump to a card lands where it lands on a first visit. Resizes with skipped cards give no ResizeObserver
    loop error (an error event on the window) and the lesson height of a fresh page at that width
  - P3: the looping drawings of en-2 play in view, rest after about 5 s, play again after a click in their card, and rest off screen
  - P7: the canvases of a hidden lesson hold no pixels, and a canvas in view is drawn in the first frame when its lesson is shown again
Lessons are named by their position (eq-3, en-2 and a lesson with a canvas near its top), which the id lock keeps. */
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const file = process.argv[2];
if (!file) { console.log('usage: node study-site/test/perf.test.js <index.html>'); process.exit(1); }
const url = 'file://' + path.resolve(file);
const fails = [];
const check = (ok, what) => { if (!ok) fails.push(what); console.log((ok ? 'ok   ' : 'FAIL ') + what); };
/* the same shuffles in every page, thus two pages of one lesson have the same height */
const SEED = '(()=>{let s=12345;Math.random=()=>{s=(s*1103515245+12345)%2147483648;return s/2147483648;};})();';
const ERRS = '(()=>{window.__err=[];addEventListener("error",e=>window.__err.push(String(e.message||e.error||e).slice(0,120)));})();';

async function openPage(b, width, height) {
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await ctx.addInitScript(SEED); await ctx.addInitScript(ERRS);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route(/^https?:\/\//, r => r.abort());
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#main > article:not([hidden])'), null, { timeout: 30000 });
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}
/* in the page: wait until cond() is true (polling), at most ms */
const until = (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true, () => false);

(async () => {
  const html = fs.readFileSync(file, 'utf8').split('\n');
  const skin = html.findIndex(l => l.startsWith('<style id="sidebar-skin">')), boot = html.findIndex(l => l.trim() === 'boot();');
  check(skin > 0 && boot > 0 && skin < boot, `P1: the sidebar skin <style> (line ${skin + 1}) comes before the boot() call (line ${boot + 1})`);
  const b = await chromium.launch();
  try {
    let { ctx, page, errors } = await openPage(b, 1366, 900);
    const atLoad = await page.evaluate(() => document.getAnimations().filter(a => a.animationName === 'drift' || /^--a[123]$/.test(a.transitionProperty || '')).length);
    check(atLoad === 0, `P1/P5: no accent transition and no drift animation at load (${atLoad})`);
    const tr = await page.evaluate(async () => { document.getElementById('mode').click(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const n = document.getAnimations().filter(a => /^--a[123]$/.test(a.transitionProperty || '')).length; document.getElementById('mode').click(); return n; });
    check(tr === 0, `P5: a light/dark switch starts no transition of --a1, --a2, --a3 (${tr})`);
    const card = await page.$('#main > article:not([hidden]) .card');
    if (card) { const bx = await card.boundingBox(); for (let i = 0; i < 6; i++) await page.mouse.move(bx.x + 20 + i * 15, bx.y + 20 + i * 5); await page.waitForTimeout(100);
      const mx = await card.evaluate(c => c.style.getPropertyValue('--mx') + c.style.getPropertyValue('--my'));
      check(mx === '', 'P5: a mouse move over a card writes no --mx/--my'); }

    /* P4 is for the lessons only: the cards of the Today page, drawn again often and read by other tests through innerText, never skip */
    const today = await page.evaluate(async () => { tabSeg.set(0); showTab(0); await new Promise(r => setTimeout(r, 2500)); const cs = [...document.querySelectorAll('#home-0>.grid>.card')];
      return { n: cs.length, cvr: cs.filter(c => c.classList.contains('cvr')).length, empty: cs.filter(c => !c.innerText.trim()).length }; });
    check(today.n > 0 && today.cvr === 0 && today.empty === 0, `P4: no card of the Today page gets cvr, and each has its text (${today.n} cards, ${today.cvr} with cvr, ${today.empty} without innerText)`);

    /* P4: eq-3 seen, marked, skipped; shown again; jumps; resizes */
    await page.evaluate(() => goLesson('eq', 3));
    const marked = await until(page, () => { const cs = [...document.querySelectorAll('#eq-3>.grid>.card')]; return cs.length && cs.filter(c => c.classList.contains('cvr')).length >= cs.length * .7; }, null, 9000);
    const st = await page.evaluate(() => { const L = document.getElementById('eq-3'), cs = [...L.querySelectorAll(':scope>.grid>.card')];
      const sk = cs.filter(c => { const f = c.firstElementChild; return f && f.checkVisibility && !f.checkVisibility({ contentVisibilityAuto: true }); }).length;
      return { n: cs.length, cvr: cs.filter(c => c.classList.contains('cvr')).length, sk, H: L.offsetHeight, cv: !!(CSS.supports && CSS.supports('content-visibility', 'auto')) }; });
    check(marked, `P4: when the page is idle the cards of eq-3 get cvr (${st.cvr} of ${st.n})`);
    if (st.cv) check(st.sk > 0, `P4: cards of eq-3 that are off screen skip rendering (${st.sk} of ${st.n})`);
    /* a jump during the entrance animation lands off by the animation's offset (also without content-visibility): wait for its end */
    const jump = j => page.evaluate(async j => { const t0 = performance.now(); while (document.getAnimations().some(a => a.animationName === 'rise') && performance.now() - t0 < 5000) await new Promise(r => setTimeout(r, 100));
      window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 200)); const cs = [...document.querySelectorAll('#eq-3>.grid>.card')], h = cs[Math.min(j, cs.length - 1)].querySelector('h3') || cs[j];
      h.scrollIntoView({ block: 'start' }); await new Promise(r => setTimeout(r, 1300)); return Math.round(h.getBoundingClientRect().top); }, j);
    const first = await jump(8);
    await page.evaluate(() => goLesson('eq', 4)); await page.waitForTimeout(500);
    await page.evaluate(() => goLesson('eq', 3)); await page.waitForTimeout(700);
    const again = await page.evaluate(() => document.getElementById('eq-3').offsetHeight);
    check(Math.abs(again - st.H) <= 2, `P4: shown again, eq-3 has the same height (${st.H} -> ${again} px)`);
    const second = await jump(8);
    check(Math.abs(second - first) <= 3, `P4: a jump to card 9 of eq-3 shown again lands where it lands before (${first} -> ${second} px)`);
    /* resizes while the cards skip, from the top of the lesson (a window made narrower, a phone turned) */
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
    for (const w of [900, 700, 390, 1366, 1100, 700]) { await page.setViewportSize({ width: w, height: 900 });
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForTimeout(700); }
    const h700 = await page.evaluate(() => document.getElementById('eq-3').offsetHeight);
    await page.setViewportSize({ width: 1366, height: 900 }); await page.waitForTimeout(1200);
    /* the same lesson seen at 1366, hidden, then shown at 700 (a phone turned while another lesson was open) */
    await page.evaluate(() => goLesson('eq', 4)); await page.waitForTimeout(400); await page.setViewportSize({ width: 700, height: 900 }); await page.waitForTimeout(600);
    await page.evaluate(() => goLesson('eq', 3)); await page.waitForTimeout(1500);
    const h700b = await page.evaluate(() => document.getElementById('eq-3').offsetHeight);
    const roErr = await page.evaluate(() => window.__err.slice());
    check(roErr.length === 0, 'P4: no error event on the window while the cards skip and the window is resized' + (roErr.length ? ': ' + roErr.slice(0, 2).join(' | ') : ''));
    const f = await openPage(b, 700, 900);
    await f.page.evaluate(() => goLesson('eq', 3)); await f.page.waitForTimeout(1200);
    const hf = await f.page.evaluate(() => document.getElementById('eq-3').offsetHeight);
    errors.push(...f.errors); await f.ctx.close();
    const tol = Math.max(8, hf * .003);
    check(Math.abs(h700 - hf) <= tol && Math.abs(h700b - hf) <= tol, `P4: after a resize to 700 px eq-3 is as high as on a fresh page at 700 px (${h700} and ${h700b} against ${hf} px)`);

    /* P3: en-2 */
    const loops = await page.evaluate(async () => { const N = ['en2-move'], w = ms => new Promise(r => setTimeout(r, ms));
      const st = () => { const a = [...document.querySelectorAll('#en-2 svg')].flatMap(s => s.getAnimations({ subtree: true })).filter(a => N.includes(a.animationName)); return [a.filter(x => x.playState === 'running').length, a.length]; };
      goLesson('en', 2); await w(500); const p = document.querySelector('#en-2 .en2-flow'); if (!p) return null; const s = p.closest('svg'); s.scrollIntoView({ block: 'center' }); await w(800);
      const out = { inView: st() }; const t0 = performance.now();
      while (st()[0] && performance.now() - t0 < 12000) await w(250);
      out.restAfter = Math.round((performance.now() - t0) / 100) / 10; out.rested = st();
      s.closest('.card').querySelector('h3').click(); await w(400); out.afterClick = st();
      window.scrollTo(0, document.documentElement.scrollHeight); await w(900); out.away = st(); return out; });
    if (loops === null) check(false, 'P3: en-2 has its flow drawing');
    else {
      check(loops.inView[0] > 0, `P3: the flows of en-2 play in view (${loops.inView.join('/')})`);
      check(loops.rested[0] === 0 && loops.restAfter <= 9, `P3: they rest after about 5 s in view (${loops.rested.join('/')} running ${loops.restAfter} s later)`);
      check(loops.afterClick[0] > 0, `P3: a click in their card plays them again (${loops.afterClick.join('/')})`);
      check(loops.away[0] === 0, `P3: scrolled away they rest (${loops.away.join('/')})`);
    }

    /* P7: a lesson with a canvas near its top */
    const cv = await page.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)), frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
      let id = null; for (const k of ['ns', 'eq', 'sn', 'th', 'mom', 'ff']) { if (id || !SUBJ[k]) continue; for (let i = 0; i < SUBJ[k].lessons.length && !id; i++) { if (SUBJ[k].lessons[i].rv) continue; goLesson(k, i); await w(60);
        const c = document.querySelector('#' + k + '-' + i + ' canvas'); if (c && c.getBoundingClientRect().top < innerHeight - 200) id = k + '-' + i; } }
      if (!id) return null; const [k, i] = id.split('-');
      goLesson(k, +i); await w(500); goLesson('eq', 0); await w(500);
      const hid = [...document.querySelectorAll('#' + id + ' canvas')].reduce((s, c) => s + c.width * c.height, 0);
      goLesson(k, +i); await frame(); const c = document.querySelector('#' + id + ' canvas');
      let px = 0; if (c.width) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let j = 3; j < d.length; j += 4 * 31) if (d[j]) px++; }
      return { id, hid, w: c.width, px }; });
    if (cv === null) check(false, 'P7: a lesson with a canvas near its top was found');
    else {
      check(cv.hid === 0, `P7: the canvases of ${cv.id}, hidden, hold no pixels (${cv.hid})`);
      check(cv.w > 0 && cv.px > 0, `P7: shown again, its canvas in view is drawn in the first frame (width ${cv.w}, ${cv.px} painted samples)`);
    }
    check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  } finally { await b.close(); }
  console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nall perf checks passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
