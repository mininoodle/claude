'use strict';
const USAGE = `usage: node study-site/test/layout.test.js <index.html> [--full] [--widths 390,1366]

The layout of every page (Today, every lesson, reference sheet and Review page of every section, Test) at each width,
opened the way a student does (subject tab, unit or section bar, lesson chip), with animations off. A page fails when
  - the lesson column is not centred in the main area (more than 1 px)
  - a row of cards is not centred in its grid (more than 1.5 px)
  - a card, or an element in a card, sticks out of its card (unless a box between them scrolls or clips it)
  - the page scrolls sideways
  - at 900 px and wider, the breadcrumb text is not aligned with the column
It also fails on page errors and console errors, and on a page that does not open.
Widths: 390 and 1366 by default (quick); --full: the 24 widths of the centring review,
360 414 480 520 540 560 600 620 660 760 820 900 960 1180 1200 1366 1680 2048 2200 2400 3000 3440 3840 5120;
--widths: your own list.`;
const lib = require('./lib');
const a = lib.cli(USAGE);
const FULL = [360, 414, 480, 520, 540, 560, 600, 620, 660, 760, 820, 900, 960, 1180, 1200, 1366, 1680, 2048, 2200, 2400, 3000, 3440, 3840, 5120];
const widths = a.opt('--widths') ? a.opt('--widths').split(',').map(Number) : a.full ? FULL : [390, 1366];

/* in the page: the measures of the page that is shown (the check of measure-all.js, unchanged) */
const check = () => {
  /* the question figures of a quiz card are drawn when they come near the view: draw them all, so that each one is measured */
  if (typeof qfigAll === 'function') qfigAll();
  const out = { rows: 0, off: [], overflow: [], col: 0, crumb: [0, 0], hs: false };
  const main = document.getElementById('main'), cs = getComputedStyle(main), mr = main.getBoundingClientRect(), inL = mr.left + parseFloat(cs.paddingLeft), inR = mr.right - parseFloat(cs.paddingRight);
  const L = document.querySelector('#main > article:not([hidden])'); if (!L) return { err: 'no article' };
  const lr = L.getBoundingClientRect(); out.id = L.id; out.colW = Math.round(lr.width);
  out.col = Math.round((lr.left - inL) - (inR - lr.right));
  const c = document.querySelector('.crumb'); if (c && c.offsetParent) { const cc = getComputedStyle(c), cr = c.getBoundingClientRect(); out.crumb = [Math.round(cr.left + parseFloat(cc.paddingLeft) - lr.left), Math.round(lr.right - (cr.right - parseFloat(cc.paddingRight)))]; }
  const conts = [...L.querySelectorAll(':scope > .grid, :scope > .grid > div:not(.card)')];
  conts.forEach(ct => {
    const cr = ct.getBoundingClientRect(); if (!cr.width) return;
    const kids = [...ct.children].filter(k => k.classList.contains('card') && k.offsetParent !== null);
    const rows = {};
    kids.forEach(k => { const r = k.getBoundingClientRect(); const t = Math.round(r.top / 4); (rows[t] = rows[t] || []).push({ r, t: (k.querySelector('h3') || {}).textContent || k.className }); if (r.right > cr.right + 1 || r.left < cr.left - 1) out.overflow.push((k.querySelector('h3') || {}).textContent || 'card'); });
    Object.values(rows).forEach(rs => { out.rows++; const l = Math.min(...rs.map(x => x.r.left)) - cr.left, rt = cr.right - Math.max(...rs.map(x => x.r.right)); if (Math.abs(l - rt) > 1.5) out.off.push({ gaps: [Math.round(l), Math.round(rt)], cards: rs.map(x => x.t.slice(0, 40)) }); });
  });
  /* any element that sticks out of its card, unless a box between it and the card scrolls or clips it. Only the outermost element is reported */
  L.querySelectorAll('.card').forEach(k => {
    const kr = k.getBoundingClientRect(); if (!kr.width) return; const hit = new Set();
    k.querySelectorAll('*').forEach(e => {
      const er = e.getBoundingClientRect(); if (!er.width || !er.height) return; if (!(er.right > kr.right + 1 || er.left < kr.left - 1)) return;
      for (let p = e.parentElement; p && p !== k; p = p.parentElement) { if (hit.has(p)) return; if (getComputedStyle(p).overflowX !== 'visible') return; }
      if (getComputedStyle(e).position === 'fixed') return; hit.add(e);
      out.overflow.push(((k.querySelector('h3') || {}).textContent || 'card').slice(0, 40) + ' > ' + e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '') + ' +' + Math.round(Math.max(er.right - kr.right, kr.left - er.left)) + 'px');
    });
  });
  out.hs = document.documentElement.scrollWidth > innerWidth + 1; return out;
};

lib.run('layout', async ({ launch }) => {
  const browser = await launch(), summary = [], errors = [];
  let total = 0;
  for (const w of widths) {
    const t0 = Date.now(), h = await lib.openPage(browser, a.file, { width: w, height: 1000, noMotion: true });
    await h.page.waitForTimeout(600);
    const pages = await lib.pageList(h.page), bad = [];
    let rows = 0;
    for (const pg of pages) {
      h.at(w + ' px ' + pg.name);
      try { await lib.openPageItem(h.page, pg); } catch (e) { bad.push({ page: pg.name, err: String(e.message || e).split('\n')[0] }); continue; }
      /* as measure-all.js: 60 ms for the page to settle, then two frames, so that the table fitting and the resize
         observers have run even when the machine is busy */
      await h.page.waitForTimeout(60);
      await lib.frames(h.page);
      const r = await h.page.evaluate(check);
      if (r.err) { bad.push({ page: pg.name, err: r.err }); continue; }
      rows += r.rows;
      const crumbBad = w >= 900 && (Math.abs(r.crumb[0]) > 1 || Math.abs(r.crumb[1]) > 1);
      if (r.off.length || r.overflow.length || r.hs || Math.abs(r.col) > 1 || crumbBad) bad.push({ page: pg.name, col: r.col, colW: r.colW, crumb: r.crumb, hs: r.hs, off: r.off, overflow: r.overflow });
    }
    errors.push(...h.errors);
    await h.close();
    total += bad.length; summary.push([w, pages.length, rows, bad.length]);
    console.log(`${String(w).padStart(5)} px: ${pages.length} pages, ${rows} rows, ${bad.length} pages with a problem (${lib.secs(t0)})`);
    lib.list(bad.map(x => JSON.stringify(x).slice(0, 330)), 40);
  }
  console.log('\nSUMMARY width/pages/rows/problem pages: ' + JSON.stringify(summary));
  if (errors.length) { console.log('\nPAGE AND CONSOLE ERRORS (where: what)'); lib.list(errors.map(e => e.at + ': ' + e.type + ': ' + e.text.slice(0, 300)), 20); }
  return total + errors.length;
});
