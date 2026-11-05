'use strict';
const USAGE = `usage: node study-site/test/lint.test.js <index.html> [--strict] [--units mom,ff] [--samples 200] [--allow <file>] [--json <file>] [--all]

The content lint. It loads the page (file://, network blocked) and checks every lesson question (with the EXTRA items),
review-bank item, challenge problem, written-response item and generator (200 samples each, fixed random seed) with the
site's own grader (numOK, parseNum, ansText, numsIn, hintLeaks). It prints:
  - the counts of each section (lessons, questions, review items, ...) and of the whole site, for the README
  - the multiple-choice length cue of each section: how often the key is the unique longest option, and the score of a
    student who always picks the longest option (ties split), against chance
  - the length rank of the key in each section (1 = longest, ties split) and the score of each simple length strategy
    (always the option of rank 1, 2, 3 or 4; the middle two; not the longest and not the shortest; the two longest; the
    two shortest), against chance: the target is every strategy at most chance + 5 points
  - the findings, by check. ERRORS are defects: --strict fails (exit 1) when there is one. WARNINGS are heuristic.
By default it only reports (exit 0). An allow file (default: lint-allow.txt next to this script) lists accepted
findings, one per line: "<id> <check>" or "<id>" for every check of that id; # starts a comment.
--units   only these sections    --samples  generator samples (default 200)    --json  write every finding to a file
--all     print every finding (default: at most 25 for each check)`;
const fs = require('fs'), path = require('path');
const lib = require('./lib');
const a = lib.cli(USAGE);
const SAMPLES = +a.opt('--samples', 200), UNITS = a.opt('--units') ? new Set(a.opt('--units').split(',')) : null;

/* check id -> [severity, what it means] */
const CHECKS = {
  'kind':      ['error', 'neither multiple choice (o and a) nor numeric (a number n)'],
  'q-missing': ['error', 'no question text'],
  'mc-a':      ['error', 'the answer index a is not the index of an option'],
  'mc-n':      ['error', 'fewer than 2 options'],
  'mc-dup':    ['error', 'two options have the same text, or an option is empty'],
  'num-n':     ['error', 'n is not a finite number, or tol / abs is not a number of 0 or more'],
  'num-own':   ['error', 'n is not accepted by its own tolerance'],
  'num-shown': ['error', 'the shown answer is not accepted by the grader'],
  'w-short':   ['error', 'the explanation is missing or under 15 characters'],
  'w-unit':    ['error', 'the explanation ends in another unit than the one asked (no value in the asked unit)'],
  'same-stem': ['error', 'the stem starts with "The same", "For the same", "In the same" or "In the previous question" (it is not answerable on its own: questions are shuffled into tests)'],
  'gen-throw': ['error', 'a generator throws'],
  'gen-bad':   ['error', 'a generated item has a non-finite n, NaN / undefined / Infinity in its text, or a lesson L that does not exist'],
  'wrq':       ['error', 'a written-response item has no question, marking points or model answer'],
  'readme':    ['error', 'README.md says something else than the page'],
  'w-none':    ['warning', 'the explanation states no value that the grader accepts (also with the opposite sign); answers in words are fine'],
  'digits':    ['warning', 'the value the explanation ends with is not the answer n rounded to its own digits (more than half a unit of its last digit away), so it disagrees with the shown answer'],
  'hint':      ['warning', 'a numeric lesson question has no hint (no method m and no explanation sentence before the answer)'],
  'mc-long':   ['warning', 'the key is 1.5 times its longest distractor or more'],
  'mc-pos':    ['warning', 'an option refers to other options ("all of the above", "A and B") in a list that is shuffled'],
  'w-pos':     ['warning', 'the explanation of a shuffled multiple-choice item names an option by its place ("the second row", "the second and fourth options", "options 2 and 4", "answer B"): the options are shuffled, thus the place is wrong. The page keeps the order (and shows A, B, C, D) only when the explanation says "option B" or "the second option"'],
  'dup-same':  ['warning', 'two items have the same stem (the message says if the answer is the same too)'],
  'dup-near':  ['warning', 'a review item repeats a lesson question of its section: word 3-gram Jaccard 0.7 or more, or a numeric item with the same data and the same answer'],
  'cue':       ['warning', 'the multiple-choice length cue of a section is over the target (key unique longest above 25 %, or pick-longest above max(30 %, chance + 5))'],
  'cue-rank':  ['warning', 'a simple length strategy scores more than chance + ' + 5 + ' points in a section: always the option of length rank 1, 2, 3 or 4 (1 = longest), a guess between ranks 2 and 3, not the longest and not the shortest, a guess between the two longest or the two shortest (ties split)'],
};
/* the length-rank strategies of the cue-rank check (the measure of SP/w2/fix-content/rank.py), with their names */
const RANKS = [['R1', 'always the longest (rank 1)'], ['R2', 'always the second-longest (rank 2)'], ['R3', 'always rank 3'], ['R4', 'always the shortest (rank 4)'],
  ['mid2', 'a guess between ranks 2 and 3'], ['notext', 'not the longest and not the shortest'], ['top2', 'a guess between the two longest'], ['bot2', 'a guess between the two shortest']], RANK_MAX = 5;

/* in the page: everything the lint needs. o: {samples, seed} */
function analyse(o) {
  const out = { f: [], counts: [], cue: [], globals: {}, gens: [], subjects: [] };
  const P = s => plain(s).replace(/\s+/g, ' ').trim();
  /* the text measure of mc-metrics.py: tags removed, &nbsp; to a space, white space folded; length in code points */
  const T = s => String(s == null ? '' : s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(), len = s => [...T(s)].length;
  const add = (id, k, check, msg) => out.f.push({ id, k, check, msg });
  const units = [...new Set([...(typeof ORDER !== 'undefined' ? ORDER : []), ...Object.keys(SUBJ)])].filter(k => SUBJ[k] && SUBJ[k].lessons);
  const items = [];
  for (const k of units) {
    SUBJ[k].lessons.forEach((le, L) => {
      (le.qz || []).forEach((it, j) => items.push({ id: k + '_' + L + '_' + j, k, L, src: 'lesson', it }));
      (le.rq || []).forEach((it, j) => items.push({ id: k + '_' + L + '_r' + j, k, L, src: 'review', it }));
    });
    if (typeof CH !== 'undefined' && CH[k]) Object.keys(CH[k]).forEach(L => { if (CH[k][L]) items.push({ id: 'ch_' + k + '_' + L, k, L: +L, src: 'challenge', it: CH[k][L] }); });
  }
  const SAME = /^(the same|for the same|in the same|in the previous question)\b/i;
  const POSO = /\b(all|none|both|neither) of (the )?(above|these|them)\b|^(both|neither) [A-D]\b|\b[A-D] and [A-D]\b|\b(options?|answers?) [A-D]\b/i;
  /* an explanation that names options by their place in a form that the page's fixedOrd does not know (thus the options stay shuffled) */
  const ORD = 'first|second|third|fourth|fifth|last', NOUN = 'options?|answers?|choices?|rows?|statements?|sentences?|responses?|alternatives?';
  /* the letter form only with a capital letter ("answer B", not "answer a question"); a number not followed by its decimals ("options 2 and 4", not "the answer 2.5 m/s") */
  const POSW = new RegExp('\\b(?:' + ORD + ')(?: (?:two|three))?(?:,? (?:and|or) (?:the )?(?:' + ORD + '))? (?:' + NOUN + ')\\b|\\b(?:options?|answers?|choices?|responses?|alternatives?) [1-6](?:,? (?:and|or) [1-6])*\\b(?![.,]\\d)', 'i'),
    POSL = /\b(?:[Cc]hoices?|[Aa]nswers?|[Rr]esponses?|[Aa]lternatives?) [A-F]\b/;
  const F10 = [1e-9, 1e-6, 1e-3, 1e-2, 1e2, 1e3, 1e6, 1e9];
  const fin = x => typeof x === 'number' && isFinite(x);
  /* the numbers of a text with their written form (the same reading as the site's numsIn) */
  const toks = t => (String(t || '').replace(/10<sup>(.*?)<\/sup>/g, '10^$1').replace(/<(su[bp])>.*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[−–]/g, '-').replace(/10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+)/g, (m, e) => '10^' + [...e].map(c => SUP[c]).join(''))
    .match(/-?(?:\d+\/\d+|\d{1,3}(?: \d{3})+(?:\.\d+)?|\d*\.?\d+)(?:\s*[×x]\s*10\^?-?\d+)?(?![\dA-Za-z])/g) || []).map(s => ({ s, v: parseNum(s) })).filter(x => isFinite(x.v));
  /* significant figures of a written number; the trailing zeros of a whole number do not count */
  const sf = s => { const m = String(s).replace(/^[-+]/, '').split(/\s*[×x]/)[0].replace(/ /g, ''); if (m.includes('/')) return 0; const d = m.replace('.', '').replace(/^0+/, ''); return m.includes('.') ? d.length : d.replace(/0+$/, '').length; };
  /* the checks of one item; returns the check ids with a message */
  function check(it, src) {
    const r = [];
    if (!it || typeof it !== 'object') return [['kind', 'not an object']];
    const q = P(it.q), w = P(it.w);
    if (!q) r.push(['q-missing', '']);
    if (SAME.test(q)) r.push(['same-stem', '"' + q.slice(0, 70) + '"']);
    if (w.length < 15) r.push(['w-short', it.w == null ? 'no explanation' : '"' + w + '"']);
    if (Array.isArray(it.o)) {
      if (it.o.length < 2) r.push(['mc-n', it.o.length + ' option(s)']);
      if (!Number.isInteger(it.a) || it.a < 0 || it.a >= it.o.length) r.push(['mc-a', 'a = ' + it.a + ' with ' + it.o.length + ' options']);
      const ot = it.o.map(x => P(x).toLowerCase());
      if (ot.some(x => !x)) r.push(['mc-dup', 'an option is empty']);
      else if (new Set(ot).size !== ot.length) r.push(['mc-dup', 'options: ' + it.o.map(x => '"' + P(x).slice(0, 40) + '"').join(', ')]);
      if (Number.isInteger(it.a) && it.o[it.a] != null) {
        const Ls = it.o.map(len), c = Ls[it.a], mx = Math.max(0, ...Ls.filter((_, j) => j !== it.a));
        if (mx && c >= 1.5 * mx) r.push(['mc-long', 'key ' + c + ' characters, longest distractor ' + mx + ' (' + (c / mx).toFixed(1) + ' times)']);
      }
      if (!fixedOrd(it)) it.o.forEach(x => { if (POSO.test(P(x))) r.push(['mc-pos', '"' + P(x).slice(0, 60) + '"']); });
      const pw = !fixedOrd(it) && (w.match(POSW) || w.match(POSL));
      if (pw) r.push(['w-pos', '"…' + w.slice(Math.max(0, pw.index - 40), pw.index + pw[0].length + 30) + '…"']);
      return r;
    }
    if (!fin(it.n) || ['tol', 'abs'].some(k => it[k] != null && !(fin(it[k]) && it[k] >= 0))) { r.push(['num-n', 'n = ' + it.n + (it.tol != null ? ', tol = ' + it.tol : '') + (it.abs != null ? ', abs = ' + it.abs : '')]); return r; }
    if (!numOK(it.n, it)) r.push(['num-own', 'n = ' + it.n]);
    const shown = ansText(it).replace(it.u ? ' ' + it.u : '', '').replace(/<sup>(.*?)<\/sup>/g, '^$1').replace(/<[^>]+>/g, '').replace(/−/g, '-');
    const dv = parseNum(shown.replace(/ × 10\^/, 'e'));
    if (isFinite(dv) && !numOK(dv, it)) r.push(['num-shown', 'shows ' + shown + ', n = ' + it.n]);
    const vals = numsIn(it.w || '');
    if (w.length >= 15 && !vals.some(v => numOK(v, it) || numOK(-v, it))) {
      const last = vals[vals.length - 1];
      if (it.u && fin(last) && F10.some(f => numOK(last * f, it))) r.push(['w-unit', 'asks for ' + it.u + ' (n = ' + it.n + '), the explanation ends in ' + last + ': "…' + w.slice(-60) + '"']);
      else r.push(['w-none', 'n = ' + it.n + (it.u ? ' ' + it.u : '') + ': "…' + w.slice(-70) + '"']);
    }
    /* the last value of the explanation that the grader accepts must be n rounded to its own digits (the shown answer is n
       rounded to 3), else the two disagree: for example 2.27 shown and 2.28 in the explanation */
    if (isFinite(dv) && !it.ans) {
      const acc = toks(it.w).filter(t => numOK(t.v, it) || numOK(-t.v, it)), t = acc[acc.length - 1], p = t ? sf(t.s) : 0, x = t ? Math.abs(t.v) : 0, n = Math.abs(it.n);
      if (p && x > 0 && Math.abs(x - n) > .5 * Math.pow(10, Math.floor(Math.log10(x)) - p + 1) * (1 + 1e-6) + 1e-12 * n) r.push(['digits', 'n = ' + it.n + ' (shown ' + shown + '), the explanation ends with ' + t.s.trim()]);
    }
    if (src === 'lesson') {
      const ws = sentences(it.w).slice(0, -1), cut = ws.findIndex(t => hintLeaks(t, it)), steps = (it.m ? [it.m] : []).concat(cut < 0 ? ws : ws.slice(0, cut));
      if (!steps.length) r.push(['hint', '"' + q.slice(0, 70) + '"']);
    }
    return r;
  }
  for (const x of items) {
    const it = x.it;
    if (it && typeof it === 'object' && !Array.isArray(it.o) && typeof it.n !== 'number') { add(x.id, x.k, 'kind', 'fields: ' + Object.keys(it).join(', ')); continue; }
    check(it, x.src).forEach(([c, m]) => add(x.id, x.k, c, m));
  }
  /* the same stem */
  const keyOf = it => Array.isArray(it.o) ? 'o:' + P(it.o[it.a]).toLowerCase() : 'n:' + it.n + ' ' + (it.u || ''), ans = it => Array.isArray(it.o) ? '"' + P(it.o[it.a]).slice(0, 40) + '"' : it.n + (it.u ? ' ' + it.u : '');
  const stems = new Map();
  for (const x of items) {
    if (!x.it || !x.it.q) continue;
    const s = P(x.it.q).toLowerCase().replace(/\s+/g, ' ').trim();
    if (s.length < 20) continue;
    const y = stems.get(s);
    if (y) add(x.id, x.k, 'dup-same', 'the same stem as ' + y.id + (keyOf(x.it) === keyOf(y.it) ? ', and the same answer' : ' (answers ' + ans(y.it) + ' and ' + ans(x.it) + ')') + ': "' + P(x.it.q).slice(0, 60) + '"');
    else stems.set(s, x);
  }
  /* review items against the lesson questions of their section: word 3-grams, and for numeric items the data and the answer */
  const sh = it => { const t = P(it.q).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean), s = new Set(); for (let i = 0; i + 2 < t.length; i++) s.add(t[i] + ' ' + t[i + 1] + ' ' + t[i + 2]); return s; };
  /* the data of a calculation: the distinct numbers of its stem (3 or more, or 2 with a decimal); its answer value: n, or the number that starts the key */
  const data = it => { const v = [...new Set(numsIn(it.q).map(x => +x.toPrecision(6)))].sort((x, y) => x - y); return v.length >= 3 || (v.length === 2 && v.some(x => !Number.isInteger(x))) ? v.join(' ') : ''; };
  const aval = it => { if (!Array.isArray(it.o)) return it.n; const m = P(it.o[it.a] || '').replace(/[−–]/g, '-').match(/^[-+]?(\d+\.?\d*|\.\d+)(\s*[×x]\s*10\^?[-+]?\d+)?/); return m ? parseNum(m[0]) : NaN; };
  const sameVal = (x, y) => isFinite(x) && isFinite(y) && Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x));
  for (const k of units) {
    const les = items.filter(x => x.k === k && x.src === 'lesson' && x.it && x.it.q).map(x => ({ x, s: sh(x.it), d: data(x.it) }));
    for (const r of items.filter(x => x.k === k && x.src === 'review' && x.it && x.it.q)) {
      const s = sh(r.it), d = data(r.it);
      let best = null;
      for (const l of les) {
        if (d && d === l.d && sameVal(aval(r.it), aval(l.x.it))) { best = { J: null, l }; break; }
        if (s.size < 4 || l.s.size < 4 || Math.min(s.size, l.s.size) / Math.max(s.size, l.s.size) < .7) continue;
        let c = 0; for (const g of s) if (l.s.has(g)) c++;
        const J = c / (s.size + l.s.size - c); if (J >= .7 && (!best || J > best.J)) best = { J, l };
      }
      if (best) add(r.id, k, 'dup-near', (best.J == null ? 'the same data and answer as ' + best.l.x.id : 'Jaccard ' + best.J.toFixed(2) + ' with ' + best.l.x.id + (keyOf(r.it) === keyOf(best.l.x.it) ? ', with the same answer' : '')) + ': "' + P(r.it.q).slice(0, 60) + '"');
    }
  }
  /* generators: o.samples items each, with a fixed random seed */
  const rnd = Math.random;
  let seed = o.seed >>> 0;
  Math.random = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  try {
    for (const k of units) (typeof GEN !== 'undefined' && GEN[k] || []).forEach((g, gi) => {
      const id = 'gen_' + k + '_' + gi, bad = {}, ex = {};
      let L = null, n = 0;
      for (let s = 0; s < o.samples; s++) {
        let it;
        try { it = g(); } catch (e) { add(id, k, 'gen-throw', 'sample ' + s + ': ' + (e && e.message || e)); break; }
        n++;
        const probs = [];
        if (!it || typeof it !== 'object') probs.push(['gen-bad', 'not an object']);
        else {
          if (L == null) L = it.L;
          if (!SUBJ[k].lessons[it.L] || !SUBJ[k].lessons[it.L].qz) probs.push(['gen-bad', 'L = ' + it.L + ' is not a lesson with questions']);
          /* a value that is not a number stands as a word of its own in the text (tags removed), or right after a number (2.5undefined): the formula NaNO<sub>3</sub> is not one */
          if (/(^|[^A-Za-z_])(NaN|undefined|Infinity)(?![A-Za-z0-9_₀-₉])/.test(P(String(it.q) + ' ' + String(it.w) + ' ' + String(it.o || '')))) probs.push(['gen-bad', 'NaN, undefined or Infinity in the text: "' + P(it.q).slice(0, 60) + '"']);
          check(it, 'gen').forEach(p => probs.push(p));
        }
        for (const [c, m] of probs) { bad[c] = (bad[c] || 0) + 1; if (!ex[c]) ex[c] = m; }
      }
      for (const c in bad) add(id, k, c, bad[c] + ' of ' + n + ' samples, for example: ' + ex[c]);
      out.gens.push({ id, k, L, n });
    });
  } finally { Math.random = rnd; }
  /* written response */
  for (const k of units) (typeof WRQ !== 'undefined' && WRQ[k] || []).forEach((it, j) => {
    const miss = [!P(it && it.q) && 'q', !(it && Array.isArray(it.marks) && it.marks.length && it.marks.every(m => P(m))) && 'marks', !P(it && it.model) && 'model'].filter(Boolean);
    if (miss.length) add('wrq_' + k + '_' + j, k, 'wrq', 'missing or empty: ' + miss.join(', '));
  });
  /* counts of each section */
  for (const k of units) {
    const S = SUBJ[k], les = S.lessons, ref = typeof REF !== 'undefined' && REF[k] && les.length >= 2 && !les[les.length - 2].qz && !les[les.length - 2].rv ? 1 : 0;
    const content = les.filter(le => !le.rv).length - ref, qz = les.filter(le => le.qz && !le.rv), Q = qz.flatMap(le => le.qz);
    const ex = les.reduce((s, le, L) => s + (le.qz && typeof EXTRA !== 'undefined' && EXTRA[k] && EXTRA[k][L] ? EXTRA[k][L].length : 0), 0);
    const R = les.flatMap(le => le.rq || []), sub = SUBJECTS.find(s => s.units.includes(k));
    out.counts.push({ k, name: S.name, subject: sub ? sub.name : '', lessons: content, quizzes: qz.length, questions: Q.length, mc: Q.filter(it => it && Array.isArray(it.o)).length, num: Q.filter(it => it && !Array.isArray(it.o)).length, extra: ex,
      review: R.length, challenge: typeof CH !== 'undefined' && CH[k] ? Object.keys(CH[k]).filter(L => CH[k][L]).length : 0, gen: typeof GEN !== 'undefined' && GEN[k] ? GEN[k].length : 0,
      wrq: typeof WRQ !== 'undefined' && WRQ[k] ? WRQ[k].length : 0, howto: typeof HT !== 'undefined' && HT[k] ? Object.keys(HT[k]).length : 0, terms: ref ? (REF[k].t || []).length : 0, ref });
  }
  /* the multiple-choice length cue, as mc-metrics.py: lesson questions (with EXTRA), review items and challenge problems */
  for (const k of units) {
    const mc = items.filter(x => x.k === k && x.it && Array.isArray(x.it.o) && Number.isInteger(x.it.a));
    let lon = 0, exp = 0, ch = 0, sho = 0;
    const rk = { R1: 0, R2: 0, R3: 0, R4: 0, mid2: 0, notext: 0, top2: 0, bot2: 0 };
    for (const x of mc) {
      const Ls = x.it.o.map(len), m = Math.max(...Ls), top = Ls.map((v, j) => v === m ? j : -1).filter(j => j >= 0), mn = Math.min(...Ls), bot = Ls.map((v, j) => v === mn ? j : -1).filter(j => j >= 0);
      ch += 1 / Ls.length;
      if (top.includes(x.it.a)) exp += 1 / top.length;
      if (top.length === 1 && top[0] === x.it.a) lon++;
      if (bot.length === 1 && bot[0] === x.it.a) sho++;
      /* the length rank of the key: the options sorted longest first; a tie group shares the ranks it spans (ties split) */
      const K = Ls.length, a = x.it.a, ord = Ls.map((v, j) => j).sort((i, j) => Ls[j] - Ls[i]), pos = ord.map((j, p) => Ls[j] === Ls[a] ? p : -1).filter(p => p >= 0), sh = Ls.map(() => 0);
      pos.forEach(p => { sh[p] += 1 / pos.length; });
      for (let r = 0; r < 4; r++) rk['R' + (r + 1)] += r < K ? sh[r] : 0;
      rk.mid2 += K === 4 ? (sh[1] + sh[2]) / 2 : 1 / K;
      const rest = Ls.map((v, j) => v !== m && v !== mn ? j : -1).filter(j => j >= 0);
      rk.notext += rest.length ? (rest.includes(a) ? 1 / rest.length : 0) : 1 / K;
      rk.top2 += K >= 2 ? (sh[0] + sh[1]) / 2 : 1;
      rk.bot2 += K >= 2 ? (sh[K - 1] + sh[K - 2]) / 2 : 1;
    }
    out.cue.push({ k, mc: mc.length, lon, exp, ch, sho, rk });
  }
  out.subjects = SUBJECTS.filter(s => !s.home && !s.test).map(s => ({ name: s.name, units: s.units.map(k => SUBJ[k] ? SUBJ[k].name : k) }));
  out.globals = { ach: typeof ACH !== 'undefined' ? ACH.length : null, cats: typeof ACH_CATS !== 'undefined' ? ACH_CATS.length : null, tiers: typeof ACH_TOTAL !== 'undefined' ? ACH_TOTAL : null,
    wk: typeof WK !== 'undefined' ? Object.keys(WK).length : null, ice: typeof ICE !== 'undefined' ? ICE.length : null };
  return out;
}

/* README.md next to the page: the numbers it states, against the page */
function readmeFindings(file, r) {
  const f = [], p = path.join(path.dirname(file), 'README.md');
  if (!fs.existsSync(p)) return f;
  const md = fs.readFileSync(p, 'utf8'), say = m => f.push({ id: 'README.md', k: '', check: 'readme', msg: m });
  const WORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }, num = s => WORD[String(s).toLowerCase()] || +String(s).replace(/,/g, '');
  const sum = k => r.counts.reduce((s, c) => s + c[k], 0), tot = sum('review'), g = r.globals;
  /* every number of these sentences, wherever it is in the README */
  const N = [
    [/(\d[\d,]*) sections with (\d[\d,]*) lessons/gi, m => [[m[1], r.counts.length, 'sections'], [m[2], sum('lessons'), 'lessons']]],
    [/(\d[\d,]*) lesson questions \((\d[\d,]*) multiple choice, (\d[\d,]*) numeric\)/gi, m => [[m[1], sum('questions'), 'lesson questions'], [m[2], sum('mc'), 'multiple-choice lesson questions'], [m[3], sum('num'), 'numeric lesson questions']]],
    [/review bank of (\d[\d,]*)/gi, m => [[m[1], tot, 'review-bank questions']]],
    [/(\d[\d,]*) challenge problems/gi, m => [[m[1], sum('challenge'), 'challenge problems']]],
    [/(\d[\d,]*) question generators/gi, m => [[m[1], sum('gen'), 'question generators']]],
    [/(\d[\d,]*) written-response items/gi, m => [[m[1], sum('wrq'), 'written-response items']]],
  ];
  for (const [re, f] of N) for (const m of md.matchAll(re)) f(m).forEach(([said, has, what]) => { if (num(said) !== has) say('it says ' + said + ' ' + what + '; the page has ' + has); });
  if (!/review bank of \d/i.test(md)) say('no "review bank of N" sentence was found (the page has ' + tot + ' review items)');
  const m2 = md.match(/(\w+) achievements in (\w+) categories/i), m3 = md.match(/\((\d+) tiers\)/i);
  if (m2 && g.ach != null && num(m2[1]) !== g.ach) say('it says ' + m2[1] + ' achievements; the page has ' + g.ach);
  if (m2 && g.cats != null && num(m2[2]) !== g.cats) say('it says ' + m2[2] + ' achievement categories; the page has ' + g.cats);
  if (m3 && g.tiers != null && +m3[1] !== g.tiers) say('it says ' + m3[1] + ' tiers; the page has ' + g.tiers);
  const m4 = md.match(/\((\d+) question types\)/i);
  if (m4 && g.wk != null && +m4[1] !== g.wk) say('it says ' + m4[1] + ' Math question types; the page has ' + g.wk);
  /* the Contents table: each subject row names each of its units */
  for (const s of r.subjects) {
    const row = md.split('\n').find(l => new RegExp('^\\|\\s*' + s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\|', 'i').test(l));
    if (!row) { say('the Contents table has no row for ' + s.name); continue; }
    s.units.forEach(u => { if (!row.toLowerCase().includes(u.toLowerCase())) say('the Contents row of ' + s.name + ' does not name the section "' + u + '"'); });
  }
  return f;
}

const pct = (x, n) => n ? (100 * x / n).toFixed(1) : '-';
const pad = (s, n) => String(s).padEnd(n), lpad = (s, n) => String(s).padStart(n);

lib.run('lint', async ({ launch }) => {
  const browser = await launch(), h = await lib.openPage(browser, a.file, { width: 1366, height: 900 });
  h.at('analysing');
  const r = await h.page.evaluate(analyse, { samples: SAMPLES, seed: 20261104 });
  await h.close();
  r.f.push(...readmeFindings(a.file, r));
  if (h.errors.length) { console.log('The page reported errors (the smoke test checks these):'); lib.list(h.errors.map(e => e.type + ': ' + e.text.slice(0, 200)), 5); }

  /* counts */
  const C = r.counts.filter(c => !UNITS || UNITS.has(c.k)), cols = ['lessons', 'quizzes', 'questions', 'mc', 'num', 'extra', 'review', 'challenge', 'gen', 'wrq', 'howto', 'terms'];
  const head = { lessons: 'lessons', quizzes: 'quizzes', questions: 'questions', mc: 'MC', num: 'numeric', extra: 'of them EXTRA', review: 'review', challenge: 'challenge', gen: 'generators', wrq: 'WR', howto: 'how-to', terms: 'terms' };
  console.log('COUNTS (lessons: content lessons without the reference sheet and Review; questions: lesson questions with EXTRA; review: review bank;');
  console.log('        challenge: challenge problems; generators: question makers; WR: written-response items; how-to: guides; terms: reference sheet terms)');
  const w0 = 30, ws = cols.map(c => Math.max(head[c].length, 5) + 1);
  console.log(pad('section', w0) + cols.map((c, i) => lpad(head[c], ws[i])).join(''));
  const tot = {}; C.forEach(c => cols.forEach(k => { tot[k] = (tot[k] || 0) + c[k]; }));
  C.forEach(c => console.log(pad(c.k + '  ' + c.name, w0) + cols.map((k, i) => lpad(c[k], ws[i])).join('')));
  console.log(pad('total (' + C.length + ' sections)', w0) + cols.map((k, i) => lpad(tot[k], ws[i])).join(''));
  console.log('site: ' + r.globals.ach + ' achievements in ' + r.globals.cats + ' categories, ' + r.globals.tiers + ' tiers; ' + r.globals.wk + ' Math worked-example types; ' + r.globals.ice + ' ICE tables; ' + r.gens.length + ' generators');

  /* cue */
  console.log('\nMULTIPLE-CHOICE LENGTH CUE (lesson questions with EXTRA, review items, challenge problems; target: key unique longest at most 25 %, pick-longest at most max(30 %, chance + 5))');
  console.log(pad('section', 8) + lpad('MC', 6) + lpad('key unique longest', 22) + lpad('pick-longest score', 21) + lpad('chance', 9) + lpad('key unique shortest', 23));
  const cueF = [];
  for (const c of r.cue.filter(c => !UNITS || UNITS.has(c.k))) {
    const L = 100 * c.lon / (c.mc || 1), E = 100 * c.exp / (c.mc || 1), X = 100 * c.ch / (c.mc || 1), over = c.mc && (L > 25 || E > Math.max(30, X + 5));
    console.log(pad(c.k, 8) + lpad(c.mc, 6) + lpad(c.lon + ' (' + pct(c.lon, c.mc) + ' %)', 22) + lpad(pct(c.exp, c.mc) + ' %', 21) + lpad(pct(c.ch, c.mc) + ' %', 9) + lpad(c.sho + ' (' + pct(c.sho, c.mc) + ' %)', 23) + (over ? '   over' : ''));
    if (over) cueF.push({ id: 'cue_' + c.k, k: c.k, check: 'cue', msg: 'key unique longest ' + L.toFixed(1) + ' %, pick-longest ' + E.toFixed(1) + ' % (chance ' + X.toFixed(1) + ' %)' });
  }
  r.f.push(...cueF);

  /* length rank of the key */
  console.log('\nLENGTH RANK OF THE KEY (the same items; 1 = longest option, ties split; target: every simple length strategy at most chance + ' + RANK_MAX + ' points)');
  console.log(pad('section', 8) + lpad('MC', 6) + ['rank 1', 'rank 2', 'rank 3', 'rank 4', 'middle 2', 'not ext.', 'top 2', 'bottom 2', 'chance'].map(h => lpad(h, 10)).join('') + '   best strategy');
  for (const c of r.cue.filter(c => !UNITS || UNITS.has(c.k))) {
    if (!c.mc) continue;
    const P = v => 100 * v / c.mc, X = P(c.ch), best = RANKS.reduce((b, [s]) => P(c.rk[s]) > P(c.rk[b[0]]) ? [s] : b, ['R1'])[0], over = P(c.rk[best]) - X;
    console.log(pad(c.k, 8) + lpad(c.mc, 6) + RANKS.map(([s]) => lpad(P(c.rk[s]).toFixed(1), 10)).join('') + lpad(X.toFixed(1), 10) + '   ' + (over >= 0 ? '+' : '') + over.toFixed(1) + ' ' + RANKS.find(x => x[0] === best)[1] + (over > RANK_MAX ? '   over' : ''));
    if (over > RANK_MAX) r.f.push({ id: 'cue_' + c.k, k: c.k, check: 'cue-rank', msg: RANKS.find(x => x[0] === best)[1] + ' scores ' + P(c.rk[best]).toFixed(1) + ' % (chance ' + X.toFixed(1) + ' %); key length ranks 1-4: ' + ['R1', 'R2', 'R3', 'R4'].map(s => P(c.rk[s]).toFixed(1)).join(' / ') + ' %' });
  }

  /* findings */
  const allowFile = a.opt('--allow', path.join(__dirname, 'lint-allow.txt')), allow = [];
  if (fs.existsSync(allowFile)) fs.readFileSync(allowFile, 'utf8').split('\n').map(s => s.replace(/#.*/, '').trim()).filter(Boolean).forEach(l => { const [id, c] = l.split(/\s+/); allow.push([id, c || null]); });
  const allowed = f => allow.some(([id, c]) => id === f.id && (!c || c === f.check));
  const F = r.f.filter(f => !UNITS || !f.k || UNITS.has(f.k)), live = F.filter(f => !allowed(f)), by = {};
  live.forEach(f => (by[f.check] = by[f.check] || []).push(f));
  const nErr = live.filter(f => (CHECKS[f.check] || ['error'])[0] === 'error').length, nWarn = live.length - nErr;
  console.log('\nFINDINGS (' + nErr + ' errors, ' + nWarn + ' warnings' + (F.length - live.length ? ', ' + (F.length - live.length) + ' accepted in ' + path.basename(allowFile) : '') + ')');
  console.log(pad('check', 11) + pad('severity', 9) + lpad('count', 6) + '  what it means');
  Object.keys(CHECKS).forEach(c => { const n = (by[c] || []).length; console.log(pad(c, 11) + pad(CHECKS[c][0], 9) + lpad(n, 6) + '  ' + CHECKS[c][1]); });
  const perUnit = {};
  live.forEach(f => { const u = f.k || '-'; perUnit[u] = perUnit[u] || { e: 0, w: 0 }; perUnit[u][(CHECKS[f.check] || ['error'])[0] === 'error' ? 'e' : 'w']++; });
  console.log('by section: ' + Object.entries(perUnit).map(([u, x]) => u + ' ' + x.e + ' errors / ' + x.w + ' warnings').join(', '));
  for (const c of Object.keys(CHECKS)) if (by[c]) { console.log('\n' + c + ' (' + CHECKS[c][0] + ', ' + by[c].length + ')'); lib.list(by[c].map(f => f.id + ': ' + f.msg), a.has('--all') ? 1e9 : 25); }
  if (a.opt('--json')) { fs.writeFileSync(path.resolve(a.opt('--json')), JSON.stringify({ counts: r.counts, cue: r.cue, globals: r.globals, findings: F.map(f => Object.assign({ severity: (CHECKS[f.check] || ['error'])[0], accepted: allowed(f) }, f)) }, null, 1)); console.log('\nwrote ' + a.opt('--json')); }
  console.log('\n' + (a.has('--strict') ? '--strict: ' + (nErr ? nErr + ' errors fail the check' : 'no errors') : 'report only: ' + nErr + ' errors and ' + nWarn + ' warnings (pass --strict to fail on errors)'));
  return a.has('--strict') ? nErr + h.errors.length : 0;
});
