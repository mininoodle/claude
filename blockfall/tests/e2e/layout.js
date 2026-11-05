#!/usr/bin/env node
// Test 6, layout: at 400 px and 1280 px wide there is no horizontal page scroll; at 1280 px the opponent sits to
// the right of your Next column, at 400 px it wraps below your well. Saves screenshots of a versus game in light
// and dark mode at 1280 px (and a 400 px one) to e2e/out/ for a visual check.
const fs = require('fs');
const path = require('path');
const {launch, open, main, OUT} = require('./lib');

main('layout', async r => {
  fs.mkdirSync(OUT, {recursive: true});
  const browser = await launch();
  const geo = page => page.evaluate(() => {
    const b = s => document.querySelector(s).getBoundingClientRect().toJSON(), d = document.documentElement;
    const field = document.querySelector('.game > .field').getBoundingClientRect().toJSON();
    const next = document.querySelector('#next').closest('.side').getBoundingClientRect().toJSON();
    return {sw: d.scrollWidth, cw: d.clientWidth, bodySw: document.body.scrollWidth, field, next, opp: b('#opp'), well: b('#board'), well2: b('#board2'),
      meter: b('#meter'), meter2: b('#meter2'), oppHidden: document.querySelector('#opp').hidden,
      overflow: [...document.querySelectorAll('main *')].filter(e => { const x = e.getBoundingClientRect(); return x.width && (x.right > innerWidth + 0.5 || x.left < -0.5); }).map(e => e.id || e.className || e.tagName).slice(0, 5)};
  });
  // a versus game with some stack and garbage: both players driven by the bot, main backend, 40 s of game time.
  // Incoming garbage is dropped while they play, so no round ends (the real engine at level 10 wins a match in 40 s).
  const play = page => page.evaluate(() => {
    const T = blockfallTest;
    T.setBackend('main'); T.humanBot(10);
    document.querySelector('#mVersus').click();
    for (let t = 0; t < 40000; t += 16) { T.step(16); for (const p of T.players) p.inc.length = 0; }
    // for the picture: grey garbage on both boards, then incoming lines on both meters (waiting for you, ready for the bot)
    for (const p of T.players) { p.take(4); p.inc[p.inc.length - 1].t = 0; }
    for (let i = 0; i < 200 && T.players.some(p => p.inc.length); i++) T.step(16);
    T.humanBot(null);
    T.players[0].take(3); T.players[1].take(2); T.players[1].inc[T.players[1].inc.length - 1].t = 0; T.step(16);
  });

  // boxes of single-player elements, to compare with the frozen pre-versus game (referee.html)
  const SAME = ['#hold', '#board', '#next', '#time', '#score', '#lines', '#level', '#attack', '#apm', '#pps', '#action', '#overlay', '#binds', '#das', '#irs'];
  const SAME_X = ['#ghost', '#grid', '#outline', '#reset'];
  const boxes = page => page.evaluate(([a, b]) => {
    const f = (s, keys) => { const x = document.querySelector(s).getBoundingClientRect(); return keys.map(k => Math.round(x[k] * 100) / 100); };
    return Object.fromEntries([...a.map(s => [s, f(s, ['x', 'y', 'width', 'height'])]), ...b.map(s => [s, f(s, ['x', 'width'])])]);
  }, [SAME, SAME_X]);
  const REFEREE = require('path').join(__dirname, '..', 'referee.html');
  const diff = (a, b) => Object.keys(a).filter(k => a[k].some((v, i) => Math.abs(v - b[k][i]) > 0.5)).map(k => `${k} ${a[k]} vs ${b[k]}`);

  for (const width of [400, 1280]) {
    const {page, errors, context} = await open(browser, {viewport: {width, height: 900}, seed: 21});
    let g = await geo(page);
    r.check(`${width} px start screen: no horizontal scroll`, g.sw <= g.cw && g.bodySw <= g.cw && !g.overflow.length, g);
    // the original game, same viewport and fonts
    const orig = await browser.newContext({viewport: {width, height: 900}});
    await orig.route(/fonts\.(googleapis|gstatic)\.com/, rt => rt.fulfill({status: 200, contentType: 'text/css', body: ''}));
    const op = await orig.newPage();
    await op.goto('file://' + REFEREE);
    const before = await boxes(op), now = await boxes(page);
    r.check(`${width} px start screen: single-player layout matches the original game`, !diff(now, before).length, diff(now, before));
    await page.click('#mMarathon'); await op.click('#mMarathon');
    const before2 = await boxes(op), now2 = await boxes(page);
    r.check(`${width} px Marathon: single-player layout matches the original game`, !diff(now2, before2).length, diff(now2, before2));
    await orig.close();
    g = await geo(page);
    r.check(`${width} px Marathon: no horizontal scroll, opponent hidden`, g.sw <= g.cw && g.oppHidden && !g.overflow.length, {sw: g.sw, cw: g.cw, overflow: g.overflow});
    r.check(`${width} px Marathon: your columns stay inside the 16 px side gutters`, g.field.left >= 16 - 0.5 && g.field.right <= width - 16 + 0.5, [g.field.left, g.field.right]);
    await play(page);
    g = await geo(page);
    r.check(`${width} px versus: no horizontal scroll`, g.sw <= g.cw && g.bodySw <= g.cw && !g.overflow.length, {sw: g.sw, cw: g.cw, overflow: g.overflow});
    r.check(`${width} px versus: opponent column shown`, !g.oppHidden && g.opp.width > 0);
    if (width === 400) {
      r.check('400 px: opponent wraps below your well', g.opp.top >= g.field.bottom - 0.5 && g.opp.top >= g.well.bottom, {oppTop: g.opp.top, fieldBottom: g.field.bottom});
      r.check('400 px: opponent well is about 44vw wide (176 px)', Math.abs(g.well2.width - 178) <= 3, g.well2.width);
      r.check('400 px: both columns stay inside the 16 px side gutters', g.opp.left >= 15.5 && g.opp.right <= 384.5 && g.field.left >= 15.5 && g.field.right <= 384.5, {opp: [g.opp.left, g.opp.right], field: [g.field.left, g.field.right]});
    } else {
      r.check('1280 px: opponent sits right of your Next column, same row', g.opp.left >= g.next.right && Math.abs(g.opp.top - g.field.top) < 40, {oppLeft: g.opp.left, nextRight: g.next.right, oppTop: g.opp.top, fieldTop: g.field.top});
      r.check('1280 px: opponent well is 200 px (+ border)', Math.abs(g.well2.width - 202) <= 1, g.well2.width);
    }
    r.check(`${width} px: incoming meters sit just left of each well`, Math.abs(g.meter.right - g.well.left) <= 4 && Math.abs(g.meter2.right - g.well2.left) <= 4 && g.meter.width === 4, [g.meter, g.well.left]);
    r.check(`${width} px: no page or console errors`, !errors.length, errors.slice(0, 3));
    if (width === 400) await page.screenshot({path: path.join(OUT, 'versus-400.png'), fullPage: true});
    await context.close();
  }

  // the round and match overlays hold more text: on small phones nothing may be cut off (it may scroll inside the well)
  for (const width of [320, 360, 400]) {
    const {page, errors, context} = await open(browser, {viewport: {width, height: 800}, seed: 4});
    const fit = () => page.evaluate(() => {
      const o = document.querySelector('#overlay'), kids = [...o.children].filter(e => getComputedStyle(e).display !== 'none'), r = o.getBoundingClientRect();
      const top = Math.min(...kids.map(e => e.getBoundingClientRect().top)), bot = Math.max(...kids.map(e => e.getBoundingClientRect().bottom));
      return {state: blockfallTest.state, top: top - r.top, bottom: bot - r.top, height: o.clientHeight, scroll: o.scrollHeight};
    });
    const kill = () => page.evaluate(() => { const P = blockfallTest.players[0]; for (let y = 0; y < 24; y++) P.board[y] = Array.from({length: 10}, (_, x) => y && !x ? 'J' : null); P.inc = []; P.take(8); P.inc[0].t = 0; P.spawn('O'); P.hardDrop(); });
    await page.click('#mVersus');
    await kill();
    const round = await fit();
    await page.keyboard.press('Enter'); await kill();
    await page.evaluate(() => { blockfallTest.vs.tot = [{attack: 1290, pieces: 17520, ms: 5840000}, {attack: 1054, pieces: 14090, ms: 5840000}]; ui(); });
    const done = await fit();
    const ok = f => f.top >= -0.5 && f.bottom <= Math.max(f.height, f.scroll) + 0.5;
    r.check(`${width} px: round and match overlays fit or scroll, nothing cut off`, round.state === 'round' && done.state === 'done' && ok(round) && ok(done), {round, done});
    r.check(`${width} px overlays: no page or console errors`, !errors.length, errors.slice(0, 3));
    await context.close();
  }

  // start screen on small phones with saved bests (the ready text wraps to 5-6 lines in the narrow well): all four
  // mode buttons fully visible, no scrolling, and some space above the title. The real font runs when the network allows it.
  const BESTS = {both: {best: 45230, bestBlitz: 1234567}, sprint: {best: 45230}, blitz: {bestBlitz: 1234567}};
  const SMALL = [['both', [317, 320, 325, 330, 335, 340, 360]], ['sprint', [310, 316, 320]], ['blitz', [310, 316, 320]]];
  for (const fonts of [false, true]) {
    const bad = [], seen = [];
    let plex = false;
    for (const [k, widths] of SMALL) for (const width of (fonts ? widths.filter(w => w <= 330) : widths)) {
      const {page, errors, context} = await open(browser, {viewport: {width, height: 800}, fonts, init: s => localStorage.setItem('blockfall', s), initArg: JSON.stringify(BESTS[k])});
      if (fonts) await page.evaluate(() => document.fonts.ready);
      const f = await page.evaluate(() => {
        const o = document.querySelector('#overlay'), b = o.getBoundingClientRect(), t = document.querySelector('#ovTitle').getBoundingClientRect();
        const cut = [...o.querySelectorAll('.modes button')].filter(e => { const x = e.getBoundingClientRect(); return x.top < b.top - 0.5 || x.bottom > b.bottom + 0.5; }).map(e => e.textContent);
        return {over: o.scrollHeight - o.clientHeight, title: Math.round((t.top - b.top) * 10) / 10, cut, buttons: o.querySelectorAll('.modes button').length,
          text: document.querySelector('#ovText').textContent, plex: [...document.fonts].some(x => x.family.replace(/"/g, '') === 'IBM Plex Mono' && x.status === 'loaded')};
      });
      plex = plex || f.plex;
      seen.push(`${k} ${width}: title ${f.title}`);
      if (f.over > 0.5 || f.cut.length || f.title < 4 || f.buttons !== 4 || !f.text.includes('best') || errors.length) bad.push({k, width, ...f, errors: errors.slice(0, 2)});
      await context.close();
    }
    r.check(`start screen with saved bests at 310-${fonts ? 330 : 360} px, ${fonts ? 'real font if it loads' : 'fallback font'}: all four mode buttons visible, title 4 px or more below the top`,
      !bad.length, bad.length ? bad.slice(0, 4) : (fonts ? `IBM Plex Mono ${plex ? 'loaded' : 'not loaded'}; ` : '') + seen.join(', '));
  }

  // light and dark screenshots at 1280 px, with the real font when the network allows it
  for (const colorScheme of ['light', 'dark']) {
    const {page, errors, context} = await open(browser, {viewport: {width: 1280, height: 900}, colorScheme, seed: 21, fonts: true});
    await page.waitForTimeout(300);
    await play(page);
    const colors = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement), v = k => s.getPropertyValue(k).trim();
      return {bg: getComputedStyle(document.body).backgroundColor, garbage: v('--garbage'), danger: v('--danger'), warn: v('--warn'), well: v('--well'),
        meterReady: getComputedStyle(document.querySelector('#meter2 i')).backgroundColor, meterWait: getComputedStyle(document.querySelector('#meter i + i')).backgroundColor};
    });
    console.log(colorScheme, JSON.stringify(colors));
    r.check(`${colorScheme}: theme tokens --garbage, --danger, --warn resolve`, colors.garbage && colors.danger && colors.warn && colors.meterReady !== colors.meterWait, colors);
    const file = path.join(OUT, `versus-${colorScheme}.png`);
    await page.screenshot({path: file, fullPage: false});
    r.check(`${colorScheme}: screenshot saved`, fs.statSync(file).size > 10000, file);
    r.check(`${colorScheme}: no page or console errors`, !errors.length, errors.slice(0, 3));
    await context.close();
  }
  await browser.close();
});
