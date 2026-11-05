/* usage: node study-site/test/retire.test.js <path to index.html>
RETIRE and the mastery levels. A RETIRE id is a question that became another question at the same position: its old answers are cleared, but a student who had
answered the old version keeps the lesson's level and XP, no lower and no higher, until the new question is mastered on its own (Store.renewed, Store.was,
oldCredit, lessonLevel0). The page is copied twice: with RETIRE = {} and with RETIRE = {mom_2_12: one hour ago}. Momentum lesson 2 is seeded in this browser:
  - Mastered (every question correct on two days 4 days apart): still Mastered, shown as Needs review, the changed question offered; a first correct answer to the
    new question keeps Mastered (not Needs review) and the history entry keeps the old credit (rk 2); a first wrong answer: Needs review, level and XP kept
  - Learning, because the old mom_2_12 was only ever answered wrong: still Learning (the change must not raise the lesson to Mastered)
  - Practised (every question correct once): a wrong first answer to the new question keeps Practised
  - mom_2_12 never answered: an ordinary question, the same level as without the change
  - a copy of format 3 (an old page) with an answer to the old mom_2_12 after the RETIRE time: it does not count for the new question; the credit is kept
In each case the level and XP right after load are the same as with RETIRE = {}. Exit code 0 = pass. */
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), os = require('os');
const FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const src = fs.readFileSync(FILE, 'utf8'), RE = /^const RETIRE=\{.*\};$/m;
if (!RE.test(src)) { console.log('no one-line RETIRE list in the page'); process.exit(2); }
const NOW = Date.now(), DAY = 864e5, T = Math.floor((NOW - 3600e3) / 1000) * 1000, TI = new Date(T).toISOString().replace(/\.\d+Z$/, 'Z');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retire-')), RP = path.join(dir, 'retired.html'), FP = path.join(dir, 'frozen.html');
fs.writeFileSync(RP, src.replace(RE, `const RETIRE={'mom_2_12':'${TI}'};`)); fs.writeFileSync(FP, src.replace(RE, 'const RETIRE={};'));
const ds = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const T0 = T - 2 * DAY;
/* mom-2 (16 questions): every question correct on the days given (days before T0), but mom_2_12 as given by q12 (null: never answered) */
const seed = (days, q12, v = 4) => { const h = {}, a = {};
  for (let j = 0; j < 16; j++) { const id = 'mom_2_' + j; if (j === 12) { if (q12) { h[id] = q12.h; if (q12.a) a[id] = q12.a; } continue; }
    h[id] = { d: days.map(k => ds(T0 - k * DAY)), c: days.length, m: 0, l: 1, t: T0 }; }
  const o = { a, r: {}, s: {}, w: {}, h, g: {}, c: {} }; if (v) o.v = v; return JSON.stringify(o); };
const fails = []; let count = 0;
const check = (c, msg, info) => { count++; if (!c) fails.push(msg); console.log((c ? 'ok   ' : 'FAIL ') + msg + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); };
(async () => { const b = await chromium.launch(); const errs = [];
  try {
    const open = async (file, s) => { const ctx = await b.newContext({ viewport: { width: 1000, height: 800 } });
      await ctx.addInitScript(x => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('unit-study-site.v2', x); sessionStorage.setItem('seeded', '1'); } } catch (e) {} }, s);
      const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/net::|ERR_|Failed to load/.test(m.text())) errs.push(m.text()); });
      await p.route(/^https?:\/\//, r => r.abort()); await p.goto('file://' + file);
      await p.waitForFunction(() => typeof Store !== 'undefined' && document.querySelector('.lesson:not([hidden])'), null, { timeout: 60000 }); return { ctx, p }; };
    const st = p => p.evaluate(() => { const v = lessonLevel('mom', 2), h = Store.x('h', 'mom_2_12');
      return { lv: v.lv, name: lvName(v), nr: v.nr, nq: v.nq, miss: lcMissed('mom', 2), xp: xpState().xp, rt: h && h.rt, rk: h && h.rk, a: Store.get('mom_2_12') }; });
    const ans = (p, ok) => p.evaluate(ok => { Store.set('mom_2_12', { v: ok ? 0 : 1, ok: ok ? 1 : 0 }); onAnswer('mom_2_12', ok, { sk: 'mom', L: 2, v: ok ? 0 : 1 }); }, ok);
    const both = async (name, s) => { const f = await open(FP, s), sf = await st(f.p); await f.ctx.close(); const r = await open(RP, s), sr = await st(r.p);
      check(sr.lv === sf.lv && sr.xp === sf.xp, name + ': the same level and XP as without the change', { without: sf, with: sr }); return { r, sf, sr }; };
    const q16 = await (async () => { const o = await open(FP, seed([6, 2])); const n = await o.p.evaluate(() => SUBJ.mom.lessons[2].qz.length); await o.ctx.close(); return n; })();
    check(q16 === 16, 'Momentum lesson 2 has 16 questions (the seeds assume it)', q16);

    /* Mastered */
    const old2 = { h: { d: [ds(T0 - 6 * DAY), ds(T0 - 2 * DAY)], c: 2, m: 0, l: 1, t: T0 }, a: { v: 0, ok: 1, t: T0 } };
    let { r, sr } = await both('Mastered', seed([6, 2], old2));
    check(sr.lv === 3 && sr.name === 'Needs review' && sr.nq === 1 && sr.miss.join() === 'mom_2_12' && !sr.a, 'Mastered: shown as Needs review, the changed question offered, its old answer gone', sr);
    await ans(r.p, true); let s1 = await st(r.p);
    check(s1.lv === 3 && s1.name === 'Mastered' && s1.rt === 1 && s1.rk === 2 && s1.xp >= sr.xp, 'Mastered: a first correct answer to the new question keeps Mastered, and the history entry keeps the old credit (rk 2)', s1);
    await r.ctx.close();
    ({ r, sr } = await both('Mastered (a wrong first answer)', seed([6, 2], old2)));
    await ans(r.p, false); s1 = await st(r.p);
    check(s1.lv === 3 && s1.name === 'Needs review' && s1.nq === 0 && s1.miss.join() === 'mom_2_12' && s1.xp >= sr.xp, 'Mastered: a wrong first answer to the new question gives Needs review, level and XP kept', s1);
    await r.ctx.close();

    /* Learning only because of the old question (answered wrong): the change must not raise the lesson */
    ({ r, sr } = await both('Learning (the old question wrong)', seed([6, 2], { h: { d: [], c: 0, m: 2, l: 0, t: T0, lm: T0 }, a: { v: 1, ok: 0, t: T0 } })));
    check(sr.lv === 1 && sr.nq === 1, 'Learning: still Learning, the changed question counted as changed', sr);
    await r.ctx.close();

    /* Practised */
    ({ r, sr } = await both('Practised', seed([2], { h: { d: [ds(T0 - 2 * DAY)], c: 1, m: 0, l: 1, t: T0 } })));
    await ans(r.p, false); s1 = await st(r.p);
    check(sr.lv === 2 && s1.lv === 2 && s1.rk === 1, 'Practised: a wrong first answer to the new question keeps Practised (old credit 1)', { before: sr, after: s1 });
    await r.ctx.close();

    /* never answered */
    ({ r, sr } = await both('Never answered', seed([6, 2], null)));
    check(sr.lv === 1 && sr.nq === 0 && !sr.miss.length, 'Never answered: an ordinary question (not "changed")', sr);
    await r.ctx.close();

    /* a copy of format 3 (no v) with an answer to the OLD question after the RETIRE time (an old page still open) */
    const late = { h: { d: [ds(T0 - 6 * DAY), ds(T0 - 2 * DAY), ds(NOW)], c: 3, m: 0, l: 1, t: NOW - 60e3 }, a: { v: 0, ok: 1, t: NOW - 60e3 } };
    ({ r, sr } = await both('Format 3 copy', seed([6, 2], late, 0)));
    check(sr.lv === 3 && !sr.a && sr.nq === 1, 'Format 3 copy: the old page\'s answer after the RETIRE time does not count for the new question; the lesson stays Mastered', sr);
    await r.ctx.close();
    check(errs.length === 0, 'no page or console errors', errs.slice(0, 3));
  } catch (e) { check(false, 'the test ran to the end', String(e && e.stack || e).slice(0, 500)); }
  finally { await b.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(fails.length ? `\n${fails.length} of ${count} checks failed` : `\nall ${count} retire checks passed`); process.exit(fails.length ? 1 : 0); })();
