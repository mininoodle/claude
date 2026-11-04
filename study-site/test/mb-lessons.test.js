/* Molecular biology lessons (mb): try-its, reference sheet, how-to cards, hints and the multiple-choice length cue.
   usage: node study-site/test/mb-lessons.test.js <path to index.html>   (exit 0 = pass, 1 = fail; other flags are ignored)
   In the real page (file://, network blocked):
   - every content lesson of mb builds with no page error and has at least one try-it
   - every try-it is solved with its own answer and gives the success message: ordering (Show the order, Check), matching
     (Show the answers, Check), sorter (each tile set to its category, Check) and nrCode (the answer typed, Check; a wrong
     first digit is not accepted). No two try-its of the section share a saved key.
   - the three numerical responses are recomputed from the text of their questions: the hydrogen bonds from the base
     pairs and the % adenine, the amino-acid code from the template strand (with the page's own mbComp and mbAA) and the
     numbered list, and the PCR copies from the molecules and the cycles
   - REF.mb has rules and unique terms, with a 64-codon table; HT.mb has a card for each content lesson; METHOD.mb has a
     hint for each lesson with a numerical question
   - the lesson multiple choice has no length cue: the key is the unique longest option in at most 25 % of the items, and
     always picking the longest option (ties split) scores at most 30 % */
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const path = require('path');
const file = path.resolve(process.argv[2] || 'study-site/index.html');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1250, height: 900 } }); const errs = [];
  p.on('pageerror', e => errs.push('page error: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::|favicon/.test(m.text())) errs.push('console error: ' + m.text()); });
  await p.route(/^https?:\/\//, r => r.abort());
  await p.goto('file://' + file); await p.waitForTimeout(800);
  const res = await p.evaluate(async () => {
    const fails = [], info = [], U = 'mb', S = SUBJ[U], sleep = t => new Promise(r => setTimeout(r, t));
    const txt = h => { const d = document.createElement('div'); d.innerHTML = String(h); return d.textContent.replace(/\s+/g, ' ').trim(); };
    /* record the widget calls with their arguments */
    const calls = [];
    for (const k of ['ordering', 'matching', 'sorter', 'nrCode']) { const f = window[k]; window[k] = function (...a) { const n = a[0].children.length; const r = f.apply(this, a); calls.push({ k, a, n }); return r; }; }
    const content = S.lessons.map((le, L) => ({ le, L })).filter(x => x.le.qz && !x.le.rv);
    const keys = new Map(); let solved = 0;
    showUnit(U);
    for (const { le, L } of content) {
      const old = document.getElementById(U + '-' + L); if (old) old.remove();
      calls.length = 0; showLesson(L); await sleep(120);
      if (!document.getElementById(U + '-' + L)) { fails.push('lesson ' + L + ' did not render'); continue; }
      if (!calls.length) fails.push('lesson ' + L + ' (' + le.t + ') has no try-it');
      for (const w of calls) {
        const card = w.a[0].closest('.card'), title = card && card.querySelector('h3') ? card.querySelector('h3').textContent : '(no title)', id = 'L' + L + ' ' + w.k + ' "' + title + '"';
        const key = w.k === 'ordering' ? 'ord_' + U + '-' + L + (w.a[3] ? '_' + w.a[3] : '') : w.k === 'matching' ? 'mt_' + U + '-' + L + (w.a[3] ? '_' + w.a[3] : '') : w.k === 'nrCode' ? 'mt_' + U + '-' + L + '_nr' + (w.a[2] || 0) : null;
        if (key) { if (keys.has(key)) fails.push(id + ': saved key ' + key + ' is also used by ' + keys.get(key)); keys.set(key, id); }
        let ok = false, msg = '';
        if (w.k === 'ordering' || w.k === 'matching') {
          const box = w.a[0].children[w.n]; box.querySelector('[data-a=show]').click(); box.querySelector('[data-a=check]').click();
          msg = box.querySelector('[aria-live]').textContent; ok = w.k === 'ordering' ? /All steps are in the correct order/.test(msg) : /^All \d+ are correct/.test(msg);
          if (new Set(w.a[1].map(x => txt(Array.isArray(x) ? x[0] : x))).size !== w.a[1].length) { ok = false; msg += ' (two rows have the same text)'; }
        }
        if (w.k === 'sorter') {
          const items = w.a[1], cats = w.a[2], tiles = [...w.a[0].querySelectorAll('.tiles .tile')].slice(-items.length);
          for (const t of tiles) { const it = items.find(x => txt(x[0]) === t.firstChild.textContent.trim()); if (!it) { msg = 'a tile has no item'; break; } for (let c = 0; c <= it[1]; c++) t.click(); }
          const chk = [...w.a[0].querySelectorAll('button')].filter(x => x.textContent === 'Check').pop(); chk.click();
          msg = msg || [...w.a[0].querySelectorAll('[aria-live]')].pop().textContent; ok = new RegExp('^' + items.length + ' of ' + items.length + ' are correct').test(msg);
          if (!items.every(x => Number.isInteger(x[1]) && x[1] >= 0 && x[1] < cats.length)) { ok = false; msg += ' (a category index is out of range)'; }
        }
        if (w.k === 'nrCode') {
          const o = w.a[1], box = w.a[0].children[w.n], bx = [...box.querySelectorAll('.nr input')], put = s => [...s].forEach((c, i) => { bx[i].value = c; bx[i].dispatchEvent(new Event('input')); });
          if (typeof o.a !== 'string' || o.a.length !== 4) { msg = 'the answer is not four characters: ' + o.a; }
          else {
            put(o.a); box.querySelector('[data-a=check]').click(); msg = box.querySelector('[aria-live]').textContent; ok = msg === 'Correct.';
            put(String((+o.a[0] + 1) % 10) + o.a.slice(1)); box.querySelector('[data-a=check]').click();
            if (box.querySelector('[aria-live]').textContent === 'Correct.') { ok = false; msg += ' (a wrong answer is accepted)'; }
            /* recompute the answer from the question text */
            const q = String(o.q).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); let want = null;
            let m;
            if ((m = q.match(/(\d+) base pairs\. (\d+)% of its bases are adenine/))) { const bp = +m[1], A = 2 * bp * m[2] / 100; want = String(2 * A + 3 * (bp - A)); }
            else if ((m = q.match(/template strand 3′ ([ACGT ]+) 5′/))) {
              const list = {}; (q.match(/Amino acids: ([^.]*?)(?= A gene|$)/) || [, ''])[1].split(',').forEach(s => { const r = s.trim().match(/^(\d) ([a-z]+)$/); if (r) list[r[2]] = r[1]; });
              const mrna = mbComp(m[1].replace(/ /g, ''), 1), st = mrna.indexOf('AUG'); let code = '';
              for (let i = st; st >= 0 && i + 3 <= mrna.length; i += 3) { const aa = mbAA(mrna.slice(i, i + 3)); if (aa === 'stop') break; const full = Object.keys(MB_AA).find(k => MB_AA[k] === aa); code += list[MB_AAN[full]] || '?'; }
              want = code;
            }
            else if ((m = q.match(/starts with (\d+) molecules? of DNA.*?after (\d+) cycles/))) want = String(+m[1] * 2 ** +m[2]);
            if (want == null) { ok = false; msg += ' (the test cannot recompute this answer: add a rule for it)'; }
            else if (want !== o.a) { ok = false; msg += ' (recomputed from the question: ' + want + ', answer key: ' + o.a + ')'; }
          }
        }
        if (ok) solved++; else fails.push(id + ': ' + msg);
      }
    }
    info.push('try-its solved: ' + solved + ', saved keys: ' + keys.size);
    /* reference sheet, how-to cards, hints */
    const R = REF[U];
    if (!R || !Array.isArray(R.f) || !R.f.length || !Array.isArray(R.t) || R.t.length < 40) fails.push('REF.mb needs rules (f) and at least 40 terms (t)');
    else {
      const names = R.t.map(r => txt(r[0]).toLowerCase()), dup = names.filter((x, i) => names.indexOf(x) !== i); if (dup.length) fails.push('REF.mb: terms that are there two times: ' + dup.join(', '));
      if (![...R.f, ...R.t].every(r => Array.isArray(r) && r.length === 2 && typeof r[0] === 'string' && typeof r[1] === 'string' && r[1].trim())) fails.push('REF.mb: every row must be [name, text]');
      const ct = R.t.find(r => /codon table/i.test(r[0])), d = document.createElement('div'); if (ct) d.innerHTML = ct[1];
      const cells = ct ? [...d.querySelectorAll('td')].filter(c => /^[UCAG]{3} /.test(c.textContent.trim())).length : 0;
      if (cells !== 64) fails.push('REF.mb: the codon table term must show the 64 codons (found ' + cells + ')');
      info.push('reference sheet: ' + R.f.length + ' rules, ' + R.t.length + ' terms');
    }
    for (const { le, L } of content) {
      const h = HT[U] && HT[U][L]; if (!h || !Array.isArray(h.items) || !h.items.length || !h.items.every(it => it.q && Array.isArray(it.s) && it.s.length)) fails.push('HT.mb[' + L + '] (' + le.t + '): a how-to card with items {q, s} is missing');
      if (le.qz.some(it => !it.o) && !(METHOD[U] && METHOD[U][L])) fails.push('METHOD.mb[' + L + '] (' + le.t + '): the lesson has a numerical question but no hint');
    }
    /* the length cue of the lesson multiple choice */
    const mc = content.flatMap(({ le }) => le.qz).filter(it => it.o && Number.isInteger(it.a));
    let exp = 0, lon = 0; for (const it of mc) { const L = it.o.map(o => txt(o).length), m = Math.max(...L), top = L.map((v, i) => v === m ? i : -1).filter(i => i >= 0); if (top.includes(it.a)) exp += 1 / top.length; if (top.length === 1 && top[0] === it.a) lon++; }
    const pl = 100 * exp / mc.length, ul = 100 * lon / mc.length;
    info.push('lesson MC: ' + mc.length + ' items, key unique longest ' + lon + ' (' + ul.toFixed(1) + ' %), always-pick-longest ' + pl.toFixed(1) + ' %');
    if (ul > 25) fails.push('length cue: the key is the unique longest option in ' + ul.toFixed(1) + ' % of the lesson MC (at most 25 %)');
    if (pl > 30) fails.push('length cue: always picking the longest option scores ' + pl.toFixed(1) + ' % on the lesson MC (at most 30 %)');
    return { fails, info };
  });
  await b.close();
  const fails = res.fails.concat(errs);
  res.info.forEach(x => console.log(x));
  fails.forEach(x => console.log('FAIL ' + x));
  console.log('mb-lessons: ' + (fails.length ? 'FAIL (' + fails.length + ')' : 'PASS'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
