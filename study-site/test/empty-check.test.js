'use strict';
const USAGE = `usage: node study-site/test/empty-check.test.js <index.html>

An empty Check: a try-it whose Check is pressed before anything is chosen asks for an answer first ("... first.") and marks
nothing: no part of its card turns green or red, no answer is underlined, and no study day is counted.
1. The widgets one by one (the sorter tiles, the mom Scalar-or-vector tiles, the FF_ADD fill-in tables, the eq ICE table, the
   eq conjugate-pair tiles, pickText; eqTable, matching and nrCode), each also checked with one choice made: then it grades.
   Where the choice can be taken back (a cell or a list), it is, and an empty Check again asks first and leaves no mark of the
   earlier Check.
2. A sweep on a fresh page: every Check button of every lesson (outside the lesson quiz and the challenge card), pressed with
   nothing entered, may not report a count ("0 of 12 are correct") nor mark anything. Lists in order ("Check the order") and the
   pH slider ("Check my estimate") are left out: they always hold an answer (the shuffled order, the slider value).
   Then, for each Check with a list or a text box: one choice, Check (it grades and marks), the choice taken back, Check again:
   it asks first, and no mark of the earlier Check stays.`;
const lib = require('./lib');
const a = lib.cli(USAGE);

lib.run('empty-check', async ({ launch }) => {
  const browser = await launch(), h = await lib.openPage(browser, a.file, { width: 1366, height: 900, noMotion: true });
  let fail = 0;
  const ok = (c, m, i) => { if (!c) fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
  await h.page.waitForFunction(() => typeof SUBJ !== 'undefined' && document.querySelector('.lesson:not([hidden])'));
  /* 1. the widgets one by one: [name, section, lesson, card title, the part that one choice changes] */
  const cases = [
    ['sorter tiles (th-0)', 'th', 0, 'Exothermic or endothermic?', '.tile'],
    ['sorter tiles (ri1-1)', 'ri1', 1, 'Which branch does what?', '.tile'],
    ['Scalar or vector? tiles (mom-6)', 'mom', 6, 'Scalar or vector?', '.tile'],
    ['FF_ADD fill-in table (ff-0)', 'ff', 0, 'Charge-to-mass ratio', 'select'],
    ['ICE table (eq-2)', 'eq', 2, 'Interactive ICE table', 'input'],
    ['conjugate-pair tiles (eq-4)', 'eq', 4, 'Label the conjugate pairs', '.tile'],
    ['pickText (pr-0)', 'pr', 0, 'Warm-up: two speakers', '.pkw'],
    ['matching (ff-2)', 'ff', 2, 'The field near a charged conductor', 'select']];
  h.at('the widgets one by one');
  for (const [name, k, L, title, part] of cases) {
    const r = await h.page.evaluate(async ([k, L, title, part]) => {
      const W = ms => new Promise(r => setTimeout(r, ms)); goLesson(k, L); await W(80); const A = document.getElementById(k + '-' + L);
      const card = [...A.querySelectorAll('.card')].find(c => ((c.querySelector('h3') || {}).textContent || '').trim().startsWith(title)); if (!card) return { err: 'no card "' + title + '"' };
      const bt = [...card.querySelectorAll('button')].find(x => /^\s*Check\b/.test(x.textContent)); if (!bt) return { err: 'no Check button' };
      const say = () => [...card.querySelectorAll('[aria-live],.fb')].map(x => x.textContent.trim()).filter(Boolean).join(' | ');
      const marks = () => card.querySelectorAll('.ok,.bad,.miss,[aria-invalid=true]').length, days = () => JSON.stringify((Store.x('g', 'days') || {}).v || []), d0 = days();
      bt.click(); await W(40); const empty = { msg: say(), marks: marks(), day: days() !== d0 };
      const x = card.querySelector(part); if (!x) return { err: 'no ' + part, empty };
      if (x.tagName === 'SELECT') { x.value = '0'; x.dispatchEvent(new Event('change', { bubbles: true })); } else if (x.tagName === 'INPUT') { x.value = '1'; x.dispatchEvent(new Event('input', { bubbles: true })); } else x.click();
      await W(30); bt.click(); await W(40); const after = { msg: say(), marks: marks() };
      /* the choice taken back (a cell emptied, a list back to Select...), then Check again */
      let again = null;
      if (x.tagName === 'SELECT' || x.tagName === 'INPUT') {
        if (x.tagName === 'SELECT') { x.value = '-1'; x.dispatchEvent(new Event('change', { bubbles: true })); } else { x.value = ''; x.dispatchEvent(new Event('input', { bubbles: true })); }
        await W(30); bt.click(); await W(40); again = { msg: say(), marks: marks() };
      }
      return { empty, after, again };
    }, [k, L, title, part]);
    ok(!r.err && /first\.$/.test(r.empty.msg) && r.empty.marks === 0 && !r.empty.day, name + ': an empty Check asks for an answer first and marks nothing', r.err || r.empty);
    ok(!r.err && r.after.marks > 0 && r.after.msg && !/first\.$/.test(r.after.msg), name + ': with one choice made, Check grades', r.err || r.after);
    if (!r.err && r.again) ok(/first\.$/.test(r.again.msg) && r.again.marks === 0, name + ': the choice taken back, an empty Check asks first and no mark of the earlier Check stays', r.again);
  }
  /* 2. the sweep (a new page: nothing is saved) */
  await h.close();
  const g = await lib.openPage(browser, a.file, { width: 1366, height: 900, noMotion: true });
  await g.page.waitForFunction(() => typeof SUBJ !== 'undefined' && document.querySelector('.lesson:not([hidden])'));
  g.at('the sweep of every lesson');
  const sw = await g.page.evaluate(async () => {
    const W = ms => new Promise(r => setTimeout(r, ms)), res = [];
    for (const k of ORDER) for (let L = 0; L < SUBJ[k].lessons.length; L++) {
      goLesson(k, L); await W(40); const A = document.getElementById(k + '-' + L); if (!A) continue;
      for (const bt of [...A.querySelectorAll('button')].filter(x => /^\s*Check\b/.test(x.textContent) && !/^\s*Check (the order|my estimate)/.test(x.textContent) && !x.closest('.quiz') && !x.closest('.q'))) {
        const card = bt.closest('.card') || bt.parentElement, title = ((card.querySelector('h3') || {}).textContent || '').trim().slice(0, 50);
        const m0 = card.querySelectorAll('.ok,.bad,.miss,[aria-invalid=true]').length; bt.click(); await W(20);
        const msg = [...card.querySelectorAll('[aria-live],.fb')].map(x => x.textContent.trim()).filter(Boolean).join(' | ').slice(0, 120), marked = card.querySelectorAll('.ok,.bad,.miss,[aria-invalid=true]').length - m0;
        /* one choice, Check, the choice taken back, Check again: no mark of the earlier Check may stay */
        let box = bt.parentElement; while (box && box !== card && !box.querySelector('select,input[type=text],input:not([type])')) box = box.parentElement;
        const x = box && box.querySelector('select,input[type=text],input:not([type])');
        let stale = null;
        if (x && !x.disabled && !x.readOnly) {
          const set = v => { if (x.tagName === 'SELECT') { x.selectedIndex = v ? Math.min(1, x.options.length - 1) : 0; x.dispatchEvent(new Event('change', { bubbles: true })); } else { x.value = v ? '1' : ''; x.dispatchEvent(new Event('input', { bubbles: true })); } };
          set(1); await W(10); bt.click(); await W(20); set(0); await W(10); bt.click(); await W(20);
          const left = box.querySelectorAll('.ok,.bad,.miss,[aria-invalid=true]').length - box.querySelectorAll('.fb.ok,.fb.bad').length, say = [...box.querySelectorAll('[aria-live],.fb')].map(z => z.textContent.trim()).filter(Boolean).join(' | ').slice(0, 120);
          stale = { left, say };
        }
        res.push({ where: k + '-' + L, title, msg, marked, stale });
      }
    }
    return res;
  });
  const bad = sw.filter(r => r.marked > 0 || /\b\d+ of \d+\b|You found|Not correct/.test(r.msg));
  ok(sw.length > 100 && bad.length === 0, 'the sweep: ' + sw.length + ' Check buttons pressed with nothing entered; ' + bad.length + ' of them count or mark');
  if (bad.length) lib.list(bad.map(r => r.where + ' "' + r.title + '": marked ' + r.marked + ', says "' + r.msg + '"'), 30);
  const cyc = sw.filter(r => r.stale), stale = cyc.filter(r => r.stale.left > 0 && /first\./.test(r.stale.say));
  ok(cyc.length > 80 && stale.length === 0, 'the sweep: ' + cyc.length + ' Checks with a list or a text box: one choice, Check, the choice taken back, Check again: ' + stale.length + ' of them ask first and keep marks of the earlier Check');
  if (stale.length) lib.list(stale.map(r => r.where + ' "' + r.title + '": ' + r.stale.left + ' marks, says "' + r.stale.say + '"'), 30);
  const errs = h.errors.concat(g.errors);
  ok(errs.length === 0, 'no page errors', errs.slice(0, 3));
  await g.close();
  return fail;
});
