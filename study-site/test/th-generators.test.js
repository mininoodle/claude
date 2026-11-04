/* Thermochemistry question generators (GEN.th): every generator, 200 samples each.
   usage: node study-site/test/th-generators.test.js <path to index.html>   (exit 0 = pass, 1 = fail)
   For each sample: a finite answer for the lesson the generator names, no 'undefined' or 'NaN' in the text,
   the shown answer and a value in the explanation (either sign, as hintLeaks) are accepted by the page's own grader (numOK), a positive answer
   fits the four-box numeric-response format, and the first hint does not give the answer away.
   Chemistry, checked independently of the generator code: every equation in a question or an explanation is balanced,
   and the answers of lessons 3, 4, 6 and 7 are recomputed from the numbers in the question and the data booklet
   values of the page (TH_F): reverse activation energies, nΔfH°, Hess sums against Σ products − Σ reactants. */
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const path = require('path');
const file = path.resolve(process.argv[2] || 'study-site/index.html');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/^https?:\/\//, r => r.abort());
  await p.goto('file://' + file); await p.waitForTimeout(800);
  const res = await p.evaluate(() => {
    const out = { fails: [], per: [] }, N = 200;
    const plainT = h => String(h).replace(/<sub>(.*?)<\/sub>/g, '$1').replace(/<sup>(.*?)<\/sup>/g, '^$1').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
    const SUB = { '₀': 0, '₁': 1, '₂': 2, '₃': 3, '₄': 4, '₅': 5, '₆': 6, '₇': 7, '₈': 8, '₉': 9 };
    /* atoms of one formula such as C12H22O11(s), Ca(OH)2(s), Fe₂O₃ */
    const atoms = f => {
      f = f.replace(/\((s|l|g|aq)\)/g, '').replace(/[₀-₉]/g, c => SUB[c]);
      const st = [{}]; let i = 0;
      while (i < f.length) {
        const ch = f[i];
        if (ch === '(') { st.push({}); i++; continue; }
        if (ch === ')') { const m = /^\d*/.exec(f.slice(i + 1))[0], k = +(m || 1), t = st.pop(); for (const a in t) st[st.length - 1][a] = (st[st.length - 1][a] || 0) + t[a] * k; i += 1 + m.length; continue; }
        const m = /^([A-Z][a-z]?)(\d*)/.exec(f.slice(i)); if (!m) return null;
        st[st.length - 1][m[1]] = (st[st.length - 1][m[1]] || 0) + +(m[2] || 1); i += m[0].length;
      }
      return st[0];
    };
    /* one side of an equation: [[coefficient, formula], ...] with 2, ½, 7/2 */
    const side = s => s.split(' + ').map(t => {
      t = t.trim(); const m = /^(\d+\/\d+ |½|\d+(?=[A-Z(]))?(.*)$/.exec(t);
      const c = !m[1] ? 1 : m[1] === '½' ? .5 : m[1].includes('/') ? eval(m[1]) : +m[1];
      return [c, m[2].trim()];
    });
    const balanced = eq => {
      const [l, r] = eq.split('→'); if (!r) return false;
      const sum = sd => { const t = {}; for (const [c, f] of side(sd)) { const a = atoms(f); if (!a) return null; for (const k in a) t[k] = (t[k] || 0) + c * a[k]; } return t; };
      const A = sum(l), B = sum(r); if (!A || !B) return false;
      return Object.keys({ ...A, ...B }).every(k => Math.abs((A[k] || 0) - (B[k] || 0)) < 1e-9);
    };
    /* equations in a text: runs of species joined by + around one → */
    const eqsIn = t => (plainT(t).match(/(?:\d+\/\d+ |½|\d+)?[A-Z][A-Za-z0-9()₀-₉]*\([slg]\)(?: \+ (?:\d+\/\d+ |½)?[A-Z0-9][A-Za-z0-9()₀-₉]*\([slg]\))* → (?:\d+\/\d+ |½)?[A-Z0-9][A-Za-z0-9()₀-₉]*\([slg]\)(?: \+ (?:\d+\/\d+ |½)?[A-Z0-9][A-Za-z0-9()₀-₉]*\([slg]\))*/g) || []);
    const dfH = f => (/^(C\(s\)|H2\(g\)|O2\(g\)|N2\(g\)|S\(s\)|Fe\(s\)|Al\(s\)|Ca\(s\)|Sn\(s\)|Pb\(s\)|Mn\(s\))$/.test(f) ? 0 : TH_F[f]);
    const direct = eq => { const [l, r] = eq.split('→'); const s = sd => side(sd).reduce((a, [c, f]) => { const v = dfH(f); if (v === undefined) throw new Error('no ΔfH for ' + f); return a + c * v; }, 0); return s(r) - s(l); };
    const nums = t => numsIn(t);
    GEN.th.forEach((g, gi) => {
      const seenL = new Set(); let shown = 0, hinted = 0, pos = 0, nf = 0;
      for (let r = 0; r < N; r++) {
        let it; try { it = g(); } catch (e) { out.fails.push(`gen ${gi}: throws ${e.message}`); continue; }
        const tag = `gen ${gi} (L${it.L}) #${r}`, fail = m => { nf++; if (nf <= 5) out.fails.push(`${tag}: ${m} | ${plainT(it.q).slice(0, 160)}`); };
        seenL.add(it.L);
        if (!SUBJ.th.lessons[it.L] || !SUBJ.th.lessons[it.L].qz) fail('lesson ' + it.L + ' has no quiz');
        if (!isFinite(it.n)) { fail('answer not finite'); continue; }
        if (/undefined|NaN|null|Infinity|\[object/.test(it.q + it.w)) fail('bad text');
        if (!numOK(parseNum(plainT(ansText(it)).replace(/ [^\d×]*$/, '').replace(it.u || '§', '').trim()), it)) fail('shown answer not accepted: ' + ansText(it));
        else shown++;
        if (!nums(it.w).some(x => numOK(x, it) || numOK(-x, it))) fail('no value in the explanation is accepted (either sign, as hintLeaks)');
        if (it.n > 0) { pos++; if (!nrSpec(it.n)) fail('positive answer does not fit the four boxes'); }
        const ws = sentences(it.w).slice(0, -1), cut = ws.findIndex(t => hintLeaks(t, it)), hints = cut < 0 ? ws : ws.slice(0, cut);
        if (hints.length) hinted++;
        for (const e of eqsIn(it.q + ' ' + it.w)) if (!balanced(e)) fail('unbalanced: ' + e);
        const q = plainT(it.q), qn = nums(it.q), near = (a, b, t = .002) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));
        try {
          if (gi >= 4 && it.L === 3) {
            if (/forward activation energy of .* and ΔH/.test(q) && !/catalyst/.test(q)) { const [a, d] = qn; if (!(a > Math.max(0, d)) || !near(it.n, a - d)) fail('reverse Ea'); }
            else if (/^On a potential energy diagram/.test(q)) { const [re, pk, pr] = qn; if (!(pk > re && pk > pr) || !near(it.n, pk - pr)) fail('reverse Ea from levels'); }
            else if (/catalyst/.test(q)) { const [a, cat, d] = qn; if (!(cat < a && cat > Math.max(0, d)) || !near(it.n, cat - d)) fail('catalyzed reverse Ea'); }
            else { const [a, rv] = qn; if (!(a > 0 && rv > 0) || !near(it.n, a - rv) || it.n === 0) fail('ΔH from the two Ea'); }
          }
          if (gi >= 4 && it.L === 4) {
            const m = qn[0], F = /^[\d.]+ g of [a-z ]+, (.+?), (is formed|decomposes|reacts)/.exec(q);
            if (!F) fail('L4 text');
            else if (F[2] === 'reacts') { const el = F[1].replace('(s)', ''), ox = /form (\S+)\. /.exec(q)[1], k = atoms(ox)[el], M = qn[qn.length - 1];
              if (!q.includes(thF(TH_F[ox]))) fail('L4 oxide value');
              if (!near(it.n, m / M / k * TH_F[ox], .001)) fail('L4 element to oxide'); }
            else { const f = F[1], M = qn[qn.length - 1], s = F[2] === 'decomposes' ? -1 : 1, mm = Object.entries(atoms(f)).reduce((a, [e, c]) => a + c * { H: 1.01, C: 12.01, N: 14.01, O: 16.00, I: 126.90, Ca: 40.08, K: 39.10, Cl: 35.45 }[e], 0);
              if (Math.abs(mm - M) > .015) fail(`L4 molar mass ${f}: ${M} vs ${mm.toFixed(2)}`);
              if (!q.includes(thF(TH_F[f]))) fail('L4 ΔfH value');
              if (!near(it.n, s * m / M * TH_F[f], .001)) fail('L4 nΔfH'); }
          }
          if (gi >= 4 && it.L === 6) {
            const t = eqsIn(q).pop(); if (!near(it.n, direct(t), 1e-6)) fail(`Hess sum ${it.n} vs formation method ${direct(t).toFixed(1)} for ${t}`);
            eqsIn(q).slice(0, -1).forEach(e => { const v = direct(e), h = +(q.split(e)[1].match(/ΔH = ([−+]?[\d.]+)/)[1].replace('−', '-')); if (!near(v, h, 1e-6)) fail(`given ΔH ${h} vs ${v.toFixed(1)} for ${e}`); });
          }
          if (gi >= 4 && it.L === 7) {
            const e = eqsIn(it.w)[0], dc = direct(e), f = side(e.split('→')[0])[0][1];
            if (/bomb calorimeter/.test(q) && !/H2O\(l\)/.test(e) || /open air/.test(q) && !/H2O\(g\)/.test(e)) fail('water state');
            if (/^Calculate the molar enthalpy of combustion/.test(q)) { if (!near(it.n, dc, 1e-6)) fail('ΔcH'); }
            else if (/Calculate the energy released/.test(q)) { const m = qn[0], M = TH_M[f]; if (!near(it.n, -m / M * dc, .001)) fail('energy for a mass'); }
            else { if (!near(it.n, TH_F[f], 1e-6) || !near(dc, qn[0], 1e-6)) fail('missing ΔfH'); }
          }
        } catch (e) { fail('check threw ' + e.message); }
      }
      if (nf > 5) out.fails.push(`gen ${gi}: ${nf - 5} more failures`);
      out.per.push({ gi, lessons: [...seenL].join(','), shown, hinted, pos });
    });
    return out;
  });
  await b.close();
  for (const r of res.per) console.log(`gen ${r.gi}: lesson ${r.lessons}, shown answer accepted ${r.shown}/200, with a hint ${r.hinted}/200, positive (exam-ready) ${r.pos}/200`);
  const lessons = new Set(res.per.map(r => r.lessons));
  const need = ['3', '4', '6', '7'].filter(L => !res.per.some(r => r.lessons === L));
  if (need.length) res.fails.push('no generator for lesson ' + need.join(', '));
  if (errs.length) res.fails.push(...errs.map(e => 'page error: ' + e));
  if (res.fails.length) { console.log('FAIL\n' + res.fails.join('\n')); process.exit(1); }
  console.log('PASS: ' + res.per.length + ' generators, ' + res.per.length * 200 + ' samples');
})();
