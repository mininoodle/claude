#!/usr/bin/env node
// New test d: the versus layout with the real engine, at 400 px and 1280 px wide, in light and dark. Checks: no
// horizontal scroll; the opponent column as in SPEC 4.5 (right of your Next column on wide screens, below your well at
// phone width; a smaller well of min(200px, 44vw), its incoming meter, "Bot, level N", small hold and next pieces,
// attack text, Attack / APM / PPS); the wells draw the theme's colors. Saves e2e/out/versus-<width>-<scheme>.png.
const fs = require('fs');
const path = require('path');
const {launch, open, main, OUT} = require('./lib');

main('screens', async r => {
  fs.mkdirSync(OUT, {recursive: true});
  const browser = await launch();
  for (const width of [400, 1280]) for (const colorScheme of ['light', 'dark']) {
    const tag = `${width} px ${colorScheme}`;
    const {page, errors, context} = await open(browser, {viewport: {width, height: 900}, colorScheme, seed: 23, fonts: true});
    await page.fill('#botLevel', '8');
    await page.$eval('#botLevel', el => el.blur());
    // a game in play: you (humanBot 10) and the bot (level 8) for 30 s, garbage dropped so no round ends; then grey
    // garbage on both boards, waiting lines on your meter, ready and waiting lines on the bot's meter
    const g = await page.evaluate(() => {
      const T = blockfallTest;
      T.setBackend('main'); T.humanBot(10);
      document.querySelector('#mVersus').click();
      for (let t = 0; t < 30000; t += 16) { T.step(16); for (const p of T.players) p.inc.length = 0; }
      for (const p of T.players) { p.take(3); p.inc[p.inc.length - 1].t = 0; }
      for (let i = 0; i < 200 && T.players.some(p => p.inc.length); i++) T.step(16);
      T.humanBot(null);
      for (const p of T.players) p.inc = [];
      T.players[0].take(3); T.players[1].take(2); T.players[1].inc[0].t = 0; T.players[1].take(3);
      T.players[1].showAction(['T-Spin Double', 'B2B ×1', '+5 attack']);
      stats(); draw();
      // measured in the same task: the game runs on in real time afterwards
      const st = {state: T.state, G: T.players.map(p => p.board.flat().filter(v => v === 'G').length), pieces: T.players.map(p => p.pieces), mism: T.botMismatch};
      const b = s => document.querySelector(s).getBoundingClientRect().toJSON(), d = document.documentElement, cs = getComputedStyle(d);
      const vis = s => { const e = document.querySelector(s), x = e.getBoundingClientRect(); return !!(x.width && x.height) && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]'); };
      const opp = document.querySelector('#opp').getBoundingClientRect();
      // the meter is drawn 7 px left of the well's border (as yours is), so it may stick out of the column on the left
      const inOpp = s => { const x = document.querySelector(s).getBoundingClientRect(), dl = s === '#meter2' ? 7.5 : 0.5; return x.left >= opp.left - dl && x.right <= opp.right + 0.5 && x.top >= opp.top - 0.5 && x.bottom <= opp.bottom + 0.5; };
      // colors drawn on the bot's well: a grey garbage cell and the empty well, compared with the theme tokens
      const hex = v => { v = v.trim().replace('#', ''); return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16)).join(','); };
      const B = blockfallTest.players[1], cv = document.querySelector('#board2'), ctx = cv.getContext('2d'), k = cv.width / 300;
      const px = (x, y) => [...ctx.getImageData(Math.floor((x * 30 + 15) * k), Math.floor(((y - 4) * 30 + 15) * k), 1, 1).data].slice(0, 3).join(',');
      let gCell = null, eCell = null;
      for (let y = 23; y >= 4 && !gCell; y--) for (let x = 0; x < 10; x++) if (B.board[y][x] === 'G') { gCell = [x, y]; break; }
      const busy = new Set();
      const c = B.cur, gy = B.ghostY();
      c.m.forEach((row, r) => row.forEach((on, cc) => { if (on) { busy.add((c.y + r) + ',' + (c.x + cc)); busy.add((gy + r) + ',' + (c.x + cc)); } }));
      for (let y = 4; y < 24 && !eCell; y++) for (let x = 0; x < 10; x++) if (!B.board[y][x] && !busy.has(y + ',' + x)) { eCell = [x, y]; break; }
      const meter = [...document.querySelectorAll('#meter2 i')].map(e => [getComputedStyle(e).backgroundColor, e.getBoundingClientRect().height]);
      return {sw: d.scrollWidth, cw: d.clientWidth, bodySw: document.body.scrollWidth, iw: innerWidth,
        overflow: [...document.querySelectorAll('main *')].filter(e => { const x = e.getBoundingClientRect(); return x.width && (x.right > innerWidth + 0.5 || x.left < -0.5); }).map(e => e.id || e.className || e.tagName).slice(0, 5),
        field: document.querySelector('.game > .field').getBoundingClientRect().toJSON(), next: document.querySelector('#next').closest('.side').getBoundingClientRect().toJSON(),
        opp: opp.toJSON(), well: b('#board'), well2: b('#board2'), meter2: b('#meter2'), hold: b('#hold'), hold2: b('#hold2'), next1: b('#next'), next2: b('#next2'),
        oppVisible: vis('#opp'), parts: ['#botName', '#board2', '#meter2', '#hold2', '#next2', '#action2', '#attack2', '#apm2', '#pps2'].map(s => [s, vis(s), inOpp(s)]),
        label: document.querySelector('#botName').textContent, stats: ['#attack2', '#apm2', '#pps2'].map(s => document.querySelector(s).textContent),
        action: [document.querySelector('#action2').textContent, getComputedStyle(document.querySelector('#action2')).fontSize, document.querySelector('#action2').classList.contains('fade')],
        bg: getComputedStyle(document.body).backgroundColor, tok: {bg: hex(cs.getPropertyValue('--bg')), garbage: hex(cs.getPropertyValue('--garbage')), well: hex(cs.getPropertyValue('--well')),
          danger: cs.getPropertyValue('--danger').trim(), warn: cs.getPropertyValue('--warn').trim()},
        gCell, eCell, gPx: gCell && px(...gCell), ePx: eCell && px(...eCell), meter, st};
    });
    const st = g.st;
    console.log(tag, JSON.stringify({st, label: g.label, stats: g.stats, action: g.action, opp: g.opp, well2: g.well2.width, gPx: g.gPx, ePx: g.ePx, tok: g.tok, meter: g.meter}));
    r.check(`${tag}: a versus game in play, both boards with garbage, mismatch 0`, st.state === 'play' && st.G[0] > 0 && st.G[1] > 0 && st.mism === 0, st);
    r.check(`${tag}: no horizontal scroll`, g.sw <= g.cw && g.bodySw <= g.cw && !g.overflow.length, {sw: g.sw, cw: g.cw, bodySw: g.bodySw, overflow: g.overflow});
    if (width === 1280) r.check(`${tag}: opponent column right of your Next column, on the same row`, g.opp.left >= g.next.right && Math.abs(g.opp.top - g.field.top) < 40, {oppLeft: g.opp.left, nextRight: g.next.right, oppTop: g.opp.top, fieldTop: g.field.top});
    else r.check(`${tag}: opponent column wraps below your well`, g.opp.top >= g.field.bottom - 0.5 && g.opp.top >= g.well.bottom, {oppTop: g.opp.top, fieldBottom: g.field.bottom});
    const want = Math.min(200, 0.44 * width) + 2;
    r.check(`${tag}: both columns inside the 16 px side gutters`, g.opp.left >= 15.5 && g.opp.right <= width - 15.5 && g.field.left >= 15.5 && g.field.right <= width - 15.5, {opp: [g.opp.left, g.opp.right], field: [g.field.left, g.field.right]});
    r.check(`${tag}: smaller bot well, min(200px, 44vw) + border = ${want} px`, Math.abs(g.well2.width - want) <= 1.5 && g.well2.width < g.well.width, g.well2.width);
    r.check(`${tag}: label, well, meter, hold, next, attack text and stats are shown in the opponent column`, g.oppVisible && g.parts.every(([, v, i]) => v && i) && g.label === 'Bot, level 8', g.parts.filter(([, v, i]) => !v || !i));
    r.check(`${tag}: bot hold and next pieces are smaller than yours`, g.hold2.width < g.hold.width && g.next2.width < g.next1.width, [g.hold2.width, g.hold.width, g.next2.width, g.next1.width]);
    r.check(`${tag}: Attack / APM / PPS are numbers, attack text in the small font`, g.stats.every(s => /^\d+(\.\d+)?$/.test(s)) && g.action[0].includes('T-Spin Double') && g.action[1] === '11px' && !g.action[2], {stats: g.stats, action: g.action});
    r.check(`${tag}: bot meter sits just left of its well, full well height`, Math.abs(g.meter2.right - g.well2.left) <= 4 && g.meter2.width === 4 && Math.abs(g.meter2.height - (g.well2.height - 2)) <= 1.5, [g.meter2, g.well2.left]);
    r.check(`${tag}: bot meter shows 2 ready lines (danger) under 3 waiting lines (warn)`, g.meter[0][1] > 0 && g.meter[1][1] > g.meter[0][1] && g.meter[0][0] !== g.meter[1][0], g.meter);
    r.check(`${tag}: theme colors: page background, grey garbage and empty well drawn from the tokens`, g.bg === `rgb(${g.tok.bg.split(',').join(', ')})` && g.gPx === g.tok.garbage && g.ePx === g.tok.well, {bg: g.bg, tok: g.tok, gPx: g.gPx, ePx: g.ePx});
    const file = path.join(OUT, `versus-${width}-${colorScheme}.png`);
    await page.screenshot({path: file, fullPage: true});
    r.check(`${tag}: screenshot saved`, fs.statSync(file).size > 10000, file);
    r.check(`${tag}: no page or console errors`, !errors.length, errors.slice(0, 3));
    await context.close();
  }
  await browser.close();
});
