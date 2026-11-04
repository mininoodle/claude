'use strict';
/* usage: node study-site/test/nav.test.js <index.html>

Navigation and usability of the page shell (rail, breadcrumb, address, search, place, toasts). Exit code 0 = pass, 1 = fail.
  - the student's place: a lesson shown again opens where it was left; the pager, the current lesson again and a rebuild open at the top
  - the address: #/<section>/<lesson>, a new history entry per page, Back opens the previous lesson, an address opens its lesson at load
  - keyboard focus goes to the new page's h1 after a breadcrumb menu choice
  - 'On this page' lists the headed cards and scrolls the chosen one below the bar
  - the site search finds lesson titles and reference terms, '/' goes to it, and a phone has a search button
  - the course units: every unit of SUBJECTS is listed as on the site, on the Today card
  - the rail at 1366x768: Review and the mode/account buttons are in view in every section
  - a phone: the breadcrumb is sticky and the rail is one row
  - dark mode: the text on the accent fill is dark (contrast 4.5:1 or more)
  - achievements: a Bronze tier is a toast, a Gold tier a modal <dialog> that Escape closes
  - 'Formulas' opens the section's reference sheet in a modal dialog; Escape closes it and the page has not moved
  - the search stays quick with many lessons built; the bar keeps room for the lesson's name at 360, 640 and 905 px
  - focus that reaches the sticky bar (Tab, Escape from its menu) does not scroll the page
  - with a <base href> (as in a srcdoc frame) the page does not unload itself when it writes its address, and Back still works
Everything is read from SUBJECTS and SUBJ, thus new sections are covered without a change here. */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const file = process.argv[2];
if (!file) { console.log('usage: node study-site/test/nav.test.js <index.html>'); process.exit(1); }
const url = 'file://' + path.resolve(file);
const fails = [];
const check = (ok, what) => { if (!ok) fails.push(what); console.log((ok ? 'ok   ' : 'FAIL ') + what); };

async function openPage(b, o = {}) {
  const ctx = await b.newContext(o.phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, colorScheme: o.dark ? 'dark' : 'light' }
    : { viewport: { width: o.width || 1366, height: o.height || 768 }, deviceScaleFactor: 1, colorScheme: o.dark ? 'dark' : 'light' });
  await ctx.route(/^https?:\/\//, r => r.abort());
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(String(e && e.message || e)));
  p.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(url + (o.hash || ''));
  await p.waitForFunction(() => typeof SUBJ !== 'undefined' && typeof tabSeg !== 'undefined' && tabSeg && document.querySelector('#main > article:not([hidden])'), null, { timeout: 20000 });
  await p.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await p.waitForTimeout(200);
  return { ctx, p, errs };
}
const frames = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

(async () => {
  const b = await chromium.launch();
  try {
    /* ---------- laptop ---------- */
    {
      const { ctx, p, errs } = await openPage(b);
      const units = await p.evaluate(() => SUBJECTS.flatMap(S => S.units).filter(k => SUBJ[k]));
      const k = await p.evaluate(units => units.find(u => SUBJ[u].lessons.filter(l => l.qz).length >= 3) || units[0], units);
      /* the place */
      const r1 = await p.evaluate(async k => {
        const f = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        goLesson(k, 1); await f(); scrollTo(0, 3000); await f(); const y0 = Math.round(scrollY);
        showLesson(2); await f(); const yNew = Math.round(scrollY);
        showLesson(1); await f(); const yBack = Math.round(scrollY);
        showLesson(1); await f(); const yAgain = Math.round(scrollY);
        return { y0, yNew, yBack, yAgain };
      }, k);
      check(r1.y0 > 1000 && Math.abs(r1.yBack - r1.y0) <= 2, `place kept: ${k}-1 left at ${r1.y0}, back at ${r1.yBack}`);
      check(r1.yNew === 0, `a lesson shown the first time opens at the top (${r1.yNew})`);
      check(r1.yAgain === 0, `the current lesson chosen again goes to the top (${r1.yAgain})`);
      await p.evaluate(() => scrollTo(0, 2000)); await frames(p);
      const pg = await p.evaluate(() => { const b = document.querySelector('#main > article:not([hidden]) .pager .btn:last-child'); if (!b) return null; b.click(); return Math.round(scrollY); });
      check(pg === null || pg === 0, `the pager opens the next lesson at the top (${pg})`);
      /* the address */
      const h = await p.evaluate(async k => {
        const f = () => new Promise(r => setTimeout(r, 120));
        goLesson(k, 0); await f(); const a = location.hash, n0 = history.length;
        goLesson(k, 1); await f(); const b = location.hash, n1 = history.length;
        history.back(); await new Promise(r => setTimeout(r, 400)); const back = curS + '-' + curL[curS];
        return { a, b, grew: n1 - n0, back };
      }, k);
      check(h.a === `#/${k}/0` && h.b === `#/${k}/1`, `the address names the lesson (${h.a}, ${h.b})`);
      check(h.grew === 1, `a new page adds one history entry (${h.grew})`);
      check(h.back === `${k}-0`, `Back opens the previous lesson (${h.back})`);
      /* focus after a breadcrumb menu choice */
      await p.focus('.crumb-b[data-lv="l"]'); await p.keyboard.press('ArrowDown'); await frames(p); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await frames(p);
      const fo = await p.evaluate(() => { const e = document.activeElement; return e && e.tagName === 'H1' && !!e.closest('#main > article:not([hidden])'); });
      check(fo, 'focus goes to the new lesson\'s h1 after a breadcrumb menu choice');
      /* On this page */
      await p.evaluate(() => scrollTo(0, 0)); await p.click('.crumb-o'); await frames(p);
      const n = await p.evaluate(() => document.querySelectorAll('.crumb-menu .cm-i').length);
      check(n >= 3, `'On this page' lists the top and the headed cards (${n} items)`);
      await p.keyboard.press('End'); await p.keyboard.press('Enter'); await p.waitForTimeout(800);
      const oc = await p.evaluate(() => { const e = document.activeElement, bar = document.querySelector('.crumb').getBoundingClientRect().bottom; return { h: /^H[23]$/.test(e.tagName), below: e.closest('.card').getBoundingClientRect().top >= bar - 1 }; });
      check(oc.h && oc.below, 'the chosen card\'s heading has focus and the card is below the bar');
      /* the search */
      const s = await p.evaluate(units => {
        const t = units.map(k => SUBJ[k].lessons[0].t), hits = t.filter(x => findTopics(x).some(r => r.t === x)).length;
        const k = units.find(u => REF[u] && REF[u].t && REF[u].t.length), term = k ? findIndex().find(x => x.kind === 1 && x.k === k) : null;
        return { n: t.length, hits, term: term ? findTopics(term.t).some(r => r.kind === 1 && r.t === term.t) : true, none: findTopics('qqxxzz').length };
      }, units);
      check(s.hits === s.n, `the search finds the first lesson of every section (${s.hits} of ${s.n})`);
      check(s.term, 'the search finds a reference term');
      check(s.none === 0, 'a query that matches nothing gives no result');
      await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.keyboard.press('/');
      check(await p.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label') === 'Find a topic'), "'/' goes to the search box");
      await p.keyboard.press('Escape');
      /* the course units */
      await p.evaluate(() => { tabSeg.set(0); showTab(0); }); await frames(p);
      const c = await p.evaluate(() => { const card = document.querySelector('#main > article:not([hidden]) .cov-card'); if (!card) return null;
        const txt = card.textContent, S = SUBJECTS.filter(s => s.units.length);
        return { rows: card.querySelectorAll('.cov-s').length, subjects: S.length, missing: S.flatMap(s => s.units).filter(k => !txt.includes(SUBJ[k].name)) }; });
      check(c && c.rows === c.subjects && !c.missing.length, `the Today card lists the course units of every subject (${c && c.rows} rows; not listed: ${c ? c.missing.join(', ') || 'none' : 'no card'})`);
      /* the rail at 1366x768 */
      const rail = [];
      for (const u of units) {
        await p.evaluate(u => goLesson(u, 0), u); await frames(p);
        rail.push(await p.evaluate(u => { const r = document.getElementById('rail'), q = r.getBoundingClientRect(), rv = [...document.querySelectorAll('#rail .chips button')].find((b, i) => SUBJ[u].lessons[i] && SUBJ[u].lessons[i].rv), t = document.querySelector('#rail .rail-tools');
          return { u, review: rv ? rv.getBoundingClientRect().bottom <= q.bottom : true, tools: t.getBoundingClientRect().bottom <= q.bottom }; }, u));
      }
      const bad = rail.filter(x => !x.review || !x.tools).map(x => x.u);
      check(!bad.length, `Review and the mode/account buttons are in view in the rail at 1366x768 (not in: ${bad.join(', ') || 'none'})`);
      /* achievements */
      const a = await p.evaluate(async () => {
        const t0 = document.querySelectorAll('.toast').length, A = ACH.find(x => x.tiers.length > 3 && !x.secret);
        ACH_Q.push({ a: A, k: 0 }); celebrateNext(); const toast = document.querySelectorAll('.toast').length > t0 || TQ.length > 0, dlg0 = !!document.querySelector('dialog.cele');
        ACH_Q.push({ a: A, k: 2 }); celebrateNext(); const d = document.querySelector('dialog.cele'); const modal = !!(d && d.matches(':modal'));
        return { toast, dlg0, modal };
      });
      check(a.toast && !a.dlg0, 'a Bronze tier is a toast, not a dialog');
      check(a.modal, 'a Gold tier opens a modal <dialog>');
      await p.keyboard.press('Escape'); await p.waitForTimeout(400);
      check(await p.evaluate(() => !document.querySelector('dialog.cele')), 'Escape closes the achievement dialog');
      check(!errs.length, 'no page errors at 1366 px' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
      await ctx.close();
    }
    /* ---------- an address at load ---------- */
    {
      const { ctx, p, errs } = await openPage(b, { hash: '#/' + 'placeholder' });
      const k = await p.evaluate(() => SUBJECTS.flatMap(S => S.units).filter(u => SUBJ[u] && SUBJ[u].lessons.length > 2).pop());
      await ctx.close();
      const o = await openPage(b, { hash: `#/${k}/2` });
      check(await o.p.evaluate(k => curS === k && curL[k] === 2 && location.hash === `#/${k}/2`, k), `the address #/${k}/2 opens that lesson at load`);
      check(!errs.length && !o.errs.length, 'no page errors with an address');
      await o.ctx.close();
    }
    /* ---------- phone, dark ---------- */
    {
      const { ctx, p, errs } = await openPage(b, { phone: true, dark: true });
      const k = await p.evaluate(() => SUBJECTS.flatMap(S => S.units).find(u => SUBJ[u]));
      await p.evaluate(k => goLesson(k, 1), k); await frames(p);
      const ph = await p.evaluate(() => ({ rail: Math.round(document.getElementById('rail').getBoundingClientRect().height), pos: getComputedStyle(document.querySelector('.crumb')).position,
        pill: !!document.querySelector('#main > article:not([hidden]) button.lvl') || !document.querySelector('#main > article:not([hidden]) [data-lvl]'), search: !!document.querySelector('.crumb-s') && getComputedStyle(document.querySelector('.crumb-s')).display !== 'none' }));
      check(ph.rail <= 80, `the phone rail is one row (${ph.rail} px)`);
      check(ph.pos === 'sticky', `the phone breadcrumb is sticky (${ph.pos})`);
      check(ph.pill, 'the level pill is a button');
      check(ph.search, 'the phone breadcrumb has a search button');
      const dark = await p.evaluate(() => {
        const parse = s => s.match(/[\d.]+/g).slice(0, 3).map(Number), lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }, L = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
        const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Check'; document.querySelector('#main > article:not([hidden]) .grid').append(b);
        const cs = getComputedStyle(b), x = L(parse(cs.color)), y = L(parse(cs.backgroundColor)); b.remove(); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); });
      check(dark >= 4.5, `dark mode: the text on the accent fill is ${dark.toFixed(2)}:1`);
      await p.evaluate(() => scrollTo(0, 4000)); await frames(p);
      check(await p.evaluate(() => Math.round(document.querySelector('.crumb').getBoundingClientRect().top) === 0), 'the breadcrumb stays at the top of the window');
      check(!errs.length, 'no page errors at 390 px' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
      await ctx.close();
    }
    /* ---------- 'Formulas': the section's reference sheet in a dialog over the page ---------- */
    {
      const { ctx, p, errs } = await openPage(b);
      const k = await p.evaluate(() => SUBJECTS.flatMap(S => S.units).find(u => SUBJ[u] && typeof REF !== 'undefined' && REF[u]));
      await p.evaluate(k => goLesson(k, 1), k); await frames(p); await p.evaluate(() => scrollTo(0, 2000)); await frames(p);
      const y0 = await p.evaluate(() => Math.round(scrollY));
      const f = await p.evaluate(() => { const fb = document.querySelector('.crumb-f'); if (!fb || fb.hidden) return null; fb.click(); const d = document.querySelector('dialog.refdlg');
        return { modal: !!(d && d.matches(':modal')), box: !!(d && d.querySelector('input[aria-label="Search the formulas and terms"]')) }; });
      check(f && f.modal && f.box, `${k}-1: 'Formulas' opens the section's reference sheet in a modal dialog`);
      await p.keyboard.press('Escape'); await frames(p);
      const z = await p.evaluate(() => ({ open: !!document.querySelector('dialog.refdlg'), focus: document.activeElement && document.activeElement.classList.contains('crumb-f'), y: Math.round(scrollY) }));
      check(!z.open && z.focus && z.y === y0, `Escape closes it, focus is back on the button, the page did not move (${y0} -> ${z.y})`);
      await p.evaluate(k => { const rv = SUBJ[k].lessons.findIndex(l => l.rv); goLesson(k, rv - 1); }, k); await frames(p);
      const hid = await p.evaluate(() => { const fb = document.querySelector('.crumb-f'); return !!fb && fb.hidden; });
      check(hid, "'Formulas' is not shown on the reference sheet itself");
      /* the search stays quick when many lessons are built: each lesson's card headings are read once */
      const ms = await p.evaluate(() => { let n = 0; for (const S of SUBJECTS) for (const u of S.units) for (let i = 0; i < SUBJ[u].lessons.length && n < 60; i++, n++) goLesson(u, i);
        findTopics('cell'); const t = performance.now(); ['a', 'ma', 'mag', 'magnet', 'the cell', 'force', 'acid', 'nerve', 'law', 'zzz'].forEach(q => findTopics(q)); return performance.now() - t; });
      check(ms < 150, `10 searches with 60 lessons built take ${Math.round(ms)} ms (under 150)`);
      check(!errs.length, "no page errors with 'Formulas'" + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
      await ctx.close();
    }
    /* ---------- the bar keeps room for the lesson's name (the longest lesson title, at 360, 640 and 905 px) ---------- */
    for (const w of [360, 640, 905]) {
      const { ctx, p } = await openPage(b, { width: w, height: 700 });
      const id = await p.evaluate(() => { let best = null; for (const S of SUBJECTS) for (const u of S.units) SUBJ[u].lessons.forEach((l, i) => { if (!best || l.t.length > best[2]) best = [u, i, l.t.length]; });
        goLesson(best[0], best[1]); return best[0] + '-' + best[1]; });
      await frames(p);
      const r = await p.evaluate(id => { const c = document.querySelector('.crumb-b.cur'); return { id, t: c.textContent.trim(), w: Math.round(c.getBoundingClientRect().width) }; }, id);
      check(r.w >= 40 && r.t === await p.evaluate(id => { const m = /^(.+)-(\d+)$/.exec(id); return SUBJ[m[1]].lessons[+m[2]].t; }, r.id), `${w} px: the bar shows the lesson's name of ${r.id} in ${r.w} px (40 or more)`);
      await ctx.close();
    }
    /* ---------- focus that reaches the sticky bar (Tab into it, Escape from its menu) does not scroll the page ---------- */
    for (const phone of [false, true]) {
      const { ctx, p } = await openPage(b, { phone });
      const k = await p.evaluate(() => { const u = SUBJECTS.flatMap(S => S.units).filter(x => SUBJ[x]).sort((a, c) => SUBJ[c].lessons.length - SUBJ[a].lessons.length)[0]; goLesson(u, 1); return u; });
      await frames(p);
      const r = await p.evaluate(async () => { const f = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const y0 = Math.min(3000, document.documentElement.scrollHeight - innerHeight - 10); scrollTo(0, y0); await f();
        const c = [...document.querySelectorAll('#rail button,#rail input')].filter(e => e.offsetParent && e.tabIndex >= 0); c[c.length - 1].focus({ preventScroll: true }); return y0; });
      await p.keyboard.press('Tab'); await frames(p);
      const t = await p.evaluate(() => ({ bar: !!document.activeElement.closest('.crumb'), y: Math.round(scrollY) }));
      await p.evaluate(() => document.querySelector('.crumb-b[data-lv="l"]').click()); await frames(p); await p.keyboard.press('Escape'); await frames(p);
      const e = await p.evaluate(() => ({ back: document.activeElement.matches('.crumb-b[data-lv="l"]'), y: Math.round(scrollY) }));
      check(t.bar && t.y === r && e.back && e.y === r, `${phone ? 390 : 1366} px, ${k}-1: Tab into the bar and Escape from its menu keep the page at ${r} (${t.y}, ${e.y})`);
      await ctx.close();
    }
    /* ---------- the page stays itself when its base address is another one (a srcdoc frame, a <base href>) ---------- */
    {
      const fs = require('fs'), os = require('os');
      const tmp = path.join(os.tmpdir(), 'nav-base-' + process.pid + '.html');
      fs.writeFileSync(tmp, fs.readFileSync(path.resolve(file), 'utf8').replace('<head>', '<head><base href="nowhere/">'));
      const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } }); await ctx.route(/^https?:\/\//, r => r.abort());
      const p = await ctx.newPage(); await p.goto('file://' + tmp); await p.waitForTimeout(1500);
      const st = async () => { try { return await p.evaluate(() => ({ site: typeof SUBJ !== 'undefined', file: location.pathname, pg: (document.querySelector('#main > article:not([hidden])') || {}).id })); } catch (e) { return { site: false, err: e.message }; } };
      const a = await st();
      check(a.site && a.file === tmp, `with a <base href>, the page is still the site after it starts (${a.site ? a.file : a.err || 'the site is gone'})`);
      if (a.site) {
        const k = await p.evaluate(() => { const u = SUBJECTS.flatMap(S => S.units).find(x => SUBJ[x]); goLesson(u, 0); goLesson(u, 1); return u; });
        await p.waitForTimeout(200); await p.evaluate(() => history.back()); await p.waitForTimeout(600);
        const z = await st();
        check(z.site && z.pg === k + '-0', `with a <base href>, Back opens the previous lesson (${z.pg || z.err})`);
      }
      await ctx.close(); try { fs.unlinkSync(tmp); } catch (e) {}
    }
  } catch (e) { fails.push('the test stopped: ' + (e && e.message || e)); console.log('FAIL the test stopped: ' + (e && e.stack || e)); }
  await b.close();
  console.log(fails.length ? `\nnav: FAIL (${fails.length})` : '\nnav: PASS');
  process.exit(fails.length ? 1 : 0);
})();
