#!/usr/bin/env node
// New test c: real time with the real engine. Worker backend: 20 s at difficulty 10, then 20 s at difficulty 1.
// It measures the bot's pieces per second (game time and wall clock, target 3.0 and 0.4 within 15%) and the frame
// interval p95 from requestAnimationFrame timestamps (target under 25 ms, so the bot causes no stutter).
// Then the main-thread fallback (the Worker constructor throws) for 10 s at difficulty 10: its frame p95 is only
// reported (it is a fallback, a worse value is expected). A 5 s Marathon run without a bot gives a baseline.
//   node frames.js [--secs 20] [--mainSecs 10]
const {launch, open, main, opt} = require('./lib');
const PPS = [0, .4, .55, .7, .9, 1.1, 1.4, 1.7, 2, 2.5, 3];

// frame timestamps, long tasks and plan answers, collected in the page from the start
const probe = () => {
  window.__f = []; window.__long = []; window.__ans = [];
  requestAnimationFrame(function f(t) { __f.push(t); requestAnimationFrame(f); });
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) __long.push([e.startTime, e.duration]); }).observe({entryTypes: ['longtask']}); } catch (e) {}
};
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2) : 0; };

main('frames', async r => {
  const secs = +opt('secs', 20), mainSecs = +opt('mainSecs', 10);
  const browser = await launch();
  // samples [wall, game ms, bot pieces, bot level, state] every 50 ms, plus the frames in the same window
  const measure = (page, ms) => page.evaluate(ms => new Promise(res => {
    const T = blockfallTest, out = [], t0 = performance.now(), f0 = __f.length, l0 = __long.length, a0 = __ans.length;
    const id = setInterval(() => {
      T.players[0].inc.length = 0;     // you stay idle; drop the bot's garbage so the round cannot end while we measure
      out.push([performance.now() - t0, T.playMs, T.players[1].pieces, T.bots[1].level, T.state]);
      if (performance.now() - t0 >= ms) {
        clearInterval(id);
        const f = __f.slice(f0), iv = f.slice(1).map((t, i) => t - f[i]);
        res({s: out, iv, long: __long.slice(l0).filter(x => x[0] >= t0), ans: __ans.slice(a0), backend: T.backend, mism: T.botMismatch, spin: T.botSpinMismatch});
      }
    }, 50);
  }), ms);
  const speed = s => {
    const drops = s.filter((x, i) => i && x[2] > s[i - 1][2]);
    if (drops.length < 3) return {drops: drops.length};
    const a = drops[0], b = drops[drops.length - 1], n = b[2] - a[2];
    return {pieces: n, game: +(n / (b[1] - a[1]) * 1000).toFixed(3), wall: +(n / (b[0] - a[0]) * 1000).toFixed(3), gameMs: Math.round(s[s.length - 1][1] - s[0][1]), wallMs: Math.round(s[s.length - 1][0])};
  };
  const frames = m => ({frames: m.iv.length, median: pct(m.iv, .5), p95: pct(m.iv, .95), p99: pct(m.iv, .99), max: pct(m.iv, 1), over25: m.iv.filter(x => x > 25).length, over50: m.iv.filter(x => x > 50).length, longTasks: m.long.length, longMax: m.long.length ? +Math.max(...m.long.map(x => x[1])).toFixed(1) : 0});
  const think = m => { const a = m.ans.map(x => x.ms); return {plans: a.length, median: pct(a, .5), p95: pct(a, .95), max: pct(a, 1), stops: m.ans.filter(x => x.stop).length}; };

  // ---------- worker backend ----------
  {
    const {page, errors, context} = await open(browser, {seed: 41, init: probe});
    await page.evaluate(() => { const og = window.got; window.got = x => { if (x && x.ms != null) __ans.push({ms: x.ms, stop: x.stop || 0, t: performance.now()}); return og(x); }; });
    // baseline: Marathon, no bot, you idle
    await page.click('#mMarathon');
    const base = await page.evaluate(ms => new Promise(res => { const f0 = __f.length; setTimeout(() => { const f = __f.slice(f0); res(f.slice(1).map((t, i) => t - f[i])); }, ms); }), 5000);
    const fb = frames({iv: base, long: []});
    console.log('baseline, Marathon without a bot:', JSON.stringify(fb));
    r.check('baseline without a bot: frame interval p95 under 25 ms (headless frames run)', fb.p95 < 25 && fb.frames > 200, fb);

    await page.fill('#botLevel', '10');
    await page.$eval('#botLevel', el => el.blur());
    await page.keyboard.press('Escape');      // pause shows the mode buttons again
    const tClick = await page.evaluate(() => performance.now());
    await page.click('#mVersus', {timeout: 5000});
    const m10 = await measure(page, secs * 1000);
    // the first plan includes making the worker and the engine's init (its warm-up search)
    const firstPlan = +(m10.ans.length ? m10.ans[0].t - tClick : -1).toFixed(1);
    const v10 = speed(m10.s), f10 = frames(m10), k10 = think(m10);
    console.log('worker, level 10:', JSON.stringify({speed: v10, frames: f10, think: k10, firstPlan, backend: m10.backend}));
    r.check(`worker, level 10: ${secs} s of play on the worker backend, mismatch 0`, m10.backend === 'worker' && v10.gameMs >= secs * 900 && m10.s.every(x => x[4] === 'play') && m10.mism === 0 && m10.spin === 0, {backend: m10.backend, gameMs: v10.gameMs, mism: m10.mism, spin: m10.spin});
    r.check('worker, level 10: about 3.0 pieces per second in game time (within 15%)', Math.abs(v10.game / PPS[10] - 1) < 0.15, v10);
    r.check('worker, level 10: about 3.0 pieces per second by the wall clock (within 15%)', Math.abs(v10.wall / PPS[10] - 1) < 0.15, v10);
    r.check('worker, level 10: frame interval p95 under 25 ms (no stutter from the bot)', f10.p95 < 25, f10);
    r.check('worker, level 10: the first plan (new worker, engine init) arrives within one piece slot (333 ms)', firstPlan > 0 && firstPlan < 1000 / PPS[10], {firstPlan});

    await page.fill('#botLevel', '1');
    await page.$eval('#botLevel', el => el.blur());
    await page.waitForFunction(() => blockfallTest.bots[1].level === 1, null, {timeout: 3000}).catch(() => {});
    const m1 = await measure(page, secs * 1000);
    const v1 = speed(m1.s), f1 = frames(m1), k1 = think(m1);
    console.log('worker, level 1:', JSON.stringify({speed: v1, frames: f1, think: k1, backend: m1.backend}));
    r.check(`worker, level 1: ${secs} s of play at level 1, mismatch 0`, m1.backend === 'worker' && v1.gameMs >= secs * 900 && m1.s.every(x => x[3] === 1 && x[4] === 'play') && m1.mism === 0 && m1.spin === 0, {backend: m1.backend, gameMs: v1.gameMs});
    r.check('worker, level 1: about 0.4 pieces per second in game time (within 15%)', Math.abs(v1.game / PPS[1] - 1) < 0.15, v1);
    r.check('worker, level 1: about 0.4 pieces per second by the wall clock (within 15%)', Math.abs(v1.wall / PPS[1] - 1) < 0.15, v1);
    r.check('worker, level 1: frame interval p95 under 25 ms', f1.p95 < 25, f1);
    r.check('worker: no page or console errors', !errors.length, errors.slice(0, 3));
    await context.close();
  }

  // ---------- main-thread fallback: the Worker constructor throws ----------
  {
    const {page, errors, context} = await open(browser, {seed: 42, init: () => { window.Worker = function () { throw new Error('workers blocked'); }; }});
    await page.evaluate(probe);
    await page.evaluate(() => { const og = window.got; window.got = x => { if (x && x.ms != null) __ans.push({ms: x.ms, stop: x.stop || 0, t: performance.now()}); return og(x); }; });
    await page.fill('#botLevel', '10');
    await page.$eval('#botLevel', el => el.blur());
    await page.click('#mVersus');
    const mm = await measure(page, mainSecs * 1000);
    const vm = speed(mm.s), fm = frames(mm), km = think(mm);
    console.log('main fallback, level 10:', JSON.stringify({speed: vm, frames: fm, think: km, backend: mm.backend}));
    r.check('main fallback: the game fell back to the main thread and the bot plays (mismatch 0)', mm.backend === 'main' && vm.pieces >= mainSecs * 2 && mm.mism === 0 && mm.spin === 0, {backend: mm.backend, speed: vm});
    r.check('main fallback, level 10: about 3.0 pieces per second in game time (within 15%)', Math.abs(vm.game / PPS[10] - 1) < 0.15, vm);
    r.check(`main fallback, level 10: frame interval p95 reported (${fm.p95} ms, a fallback only)`, fm.frames > 0, fm);
    r.check('main fallback: no page or console errors', !errors.length, errors.slice(0, 3));
    await context.close();
  }
  await browser.close();
});
