'use strict';
const USAGE = `usage: node study-site/test/ids.test.js <index.html> [--write] [--allow <file>] [--lock <file>] [--from <label>]

The id lock. Saved answers, spaced repetition and history are stored under ids that come from POSITIONS: lesson question
j of lesson L of section u is u_L_j (the EXTRA items follow the lesson's own questions), review item j is u_L_rj, the
challenge problem of a lesson is ch_u_L, the correct-count of a lesson cnt_u_L, an ICE table ice_i, and every try-it key
holds the lesson's element id (mt_u-L_2, hs_u-L, ord_u-L, spd_u-L_name, note_u-L_name). Moving an item moves the answers
of every item after it onto other questions. ids.lock.json maps each id to what it names:
  questions  kind (mc or num), for MC the answer index a and the option count, a hash of the stem (HTML and spacing removed)
  try-its    kind, the rows or parts and the answer pattern, a hash of the row texts (option and term texts are not locked)
--check (the default) fails (exit 1) when a locked id
  - moved:     its question or try-it is now at another id
  - vanished:  no longer exists
  - structure: changed kind, answer index a, option count, or the rows, order or answers of a try-it
  - changed:   names a reworded or different question, unless the id is listed in the --allow file (one id per line, # comments)
  and when two try-its share one key. New ids pass (they are listed).
--write   refreshes the lock from this page (after an intended change: add a scoped clear like RB2 for the ids whose
          meaning changed, and commit the new lock with it). It refuses when the page reports errors.
--lock    another lock file (default: ids.lock.json next to this script)
--from    the label stored as made_from in a written lock (default: the git commit of the page)`;
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const lib = require('./lib');
const a = lib.cli(USAGE);
const LOCK = path.resolve(a.opt('--lock', path.join(__dirname, 'ids.lock.json')));

/* text as the lock sees it: tags removed, the common entities decoded, white space folded */
const norm = s => String(s == null ? '' : s).normalize('NFC').replace(/<[^>]*>/g, '')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (m, x) => String.fromCodePoint(parseInt(x, 16))).replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();
const H = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const cut = (s, n = 48) => { const c = [...s]; return c.length > n ? c.slice(0, n - 1).join('') + '…' : s; };

/* in the page: every question id, and every try-it key with what its widget was given. Each lesson is rebuilt through
   the app shell (goLesson, as the breadcrumb menu does) while the widgets are wrapped; the keys come from what each
   widget reads with Store.w, else from the widget's own formula */
async function collect(page) {
  return page.evaluate(() => {
    const out = { q: [], w: [], stray: [], lessons: [], ice: [], errors: [], wrapped: [], storeHook: false };
    const units = [...new Set([...(typeof ORDER !== 'undefined' ? ORDER : []), ...Object.keys(SUBJ)])].filter(k => SUBJ[k] && SUBJ[k].lessons);
    const kind = it => !it || typeof it !== 'object' ? 'none' : Array.isArray(it.o) ? 'mc' : typeof it.n === 'number' ? 'num' : 'other';
    const qrec = (id, it) => ({ id, k: kind(it), q: it && it.q != null ? String(it.q) : '', a: it && Array.isArray(it.o) ? it.a : null, no: it && Array.isArray(it.o) ? it.o.length : null });
    for (const k of units) {
      SUBJ[k].lessons.forEach((le, L) => {
        out.lessons.push({ k, L, t: String(le.t || ''), qz: !!le.qz && !le.rv });
        (le.qz || []).forEach((it, j) => out.q.push(qrec(k + '_' + L + '_' + j, it)));
        (le.rq || []).forEach((it, j) => out.q.push(qrec(k + '_' + L + '_r' + j, it)));
      });
      if (typeof CH !== 'undefined' && CH[k]) Object.keys(CH[k]).forEach(L => { if (CH[k][L]) out.q.push(qrec('ch_' + k + '_' + L, CH[k][L])); });
    }
    if (typeof ICE !== 'undefined') ICE.forEach((P, i) => out.ice.push({ id: 'ice_' + i, n: String(P.n || ''), text: String(P.text || ''), sp: (P.sp || []).map(String), K: P.K != null }));
    /* the widgets that save under a key, and what identifies their content */
    const lidOf = h => (h && h.closest && h.closest('.lesson') || {}).id || 'x';
    const W = {
      hotspot: ([h, svg, parts], lid) => ({ fkey: 'hs_' + lid, names: (parts || []).map(p => String(p.n)) }),
      ordering: ([h, items, intro, slot], lid) => ({ fkey: 'ord_' + lid + (slot ? '_' + slot : ''), items: (items || []).map(String) }),
      matching: ([h, pairs, intro, slot], lid) => { const terms = [...new Set(pairs.map(p => p[1]))].sort((x, y) => String(x).localeCompare(String(y))); return { fkey: 'mt_' + lid + (slot ? '_' + slot : ''), rows: pairs.map(p => String(p[0])), nterms: terms.length, ans: pairs.map(p => terms.indexOf(p[1])) }; },
      nrCode: ([h, o, slot], lid) => ({ fkey: 'mt_' + lid + '_nr' + (slot || 0), q: String(o && o.q || ''), a: String(o && o.a || '') }),
      eqTable: ([h, o, slot], lid) => ({ fkey: 'mt_' + lid + '_tb' + (slot || 0), cols: (o.cols || []).map(String), rows: (o.rows || []).map(r => String(r[0])), ans: (o.rows || []).map(r => (r[1] || []).join(',')), opt: (o.opt || []).map(x => x.length) }),
      notesBox: ([h, name], lid) => ({ fkey: 'note_' + lid + '_' + name, name: String(name) }),
      speed: ([h, name, o], lid) => ({ fkey: 'spd_' + lid + '_' + name, name: String(name), title: String(o && o.title || '') }),
    };
    let cur = null, building = null;
    const origW = Store.w, hook = function (key) { if (cur) cur.add(key); else if (building) out.stray.push({ lid: building, key }); return origW.apply(this, arguments); };
    try { Store.w = hook; out.storeHook = Store.w === hook; } catch (e) { /* a frozen Store: the formulas give the keys */ }
    const orig = {};
    for (const name in W) {
      const f = window[name];
      if (typeof f !== 'function') continue;
      orig[name] = f; out.wrapped.push(name);
      window[name] = function (...args) {
        const prev = cur, mine = new Set(); cur = mine;
        try { return f.apply(this, args); }
        finally {
          cur = prev;
          try { const card = args[0] && args[0].closest && args[0].closest('.card'), lid = lidOf(args[0]);
            out.w.push(Object.assign({ kind: name, lid, keys: [...mine], card: card ? ((card.querySelector('h3') || {}).textContent || '') : '' }, W[name](args, lid))); }
          catch (e) { out.errors.push(name + ' in ' + building + ': ' + e.message); }
        }
      };
    }
    /* rebuild every lesson: drop the articles built so far, then open each lesson */
    document.querySelectorAll('#main > article.lesson').forEach(A => { if (/^[a-z0-9]+-\d+$/.test(A.id) && !/^(home|test)-/.test(A.id)) A.remove(); });
    for (const k of units) for (let L = 0; L < SUBJ[k].lessons.length; L++) {
      building = k + '-' + L;
      try { goLesson(k, L); } catch (e) { out.errors.push(building + ': ' + (e && e.message || e)); }
    }
    building = null;
    for (const name in orig) window[name] = orig[name];
    try { Store.w = origW; } catch (e) { /* frozen */ }
    return out;
  });
}

/* the lock entries: id -> [kind, structure, hash, text] (+ a hash of the sorted rows for lists, to tell a reorder from a rewording) */
function entries(c) {
  const E = {}, title = {}, keyUse = {}, notes = [];
  c.lessons.forEach(l => { title[l.k + '-' + l.L] = norm(l.t); });
  for (const r of c.q) { const t = norm(r.q); E[r.id] = [r.k, r.k === 'mc' ? r.a + '/' + r.no : '', H(t), cut(t)]; }
  c.lessons.forEach(l => { if (l.qz) E['cnt_' + l.k + '_' + l.L] = ['cnt', '', H(title[l.k + '-' + l.L]), cut(title[l.k + '-' + l.L])]; });
  c.ice.forEach(P => { E[P.id] = ['ice', P.sp.join(',') + (P.K ? '|K' : ''), H(norm(P.n) + '\n' + norm(P.text)), cut(norm(P.n) + ': ' + norm(P.text))]; });
  for (const w of c.w) {
    const keys = w.keys.length ? w.keys : [w.fkey], lt = title[w.lid] || w.lid, card = norm(w.card);
    let e;
    if (w.kind === 'hotspot') { const n = w.names.map(norm); e = ['hs', String(n.length), H(n.slice().sort().join('\n')), cut(card || n.join(', '))]; }
    else if (w.kind === 'ordering') { const n = w.items.map(norm); e = ['ord', String(n.length), H(n.join('\n')), cut(card || n[0] || ''), H(n.slice().sort().join('\n'))]; }
    else if (w.kind === 'matching') { const n = w.rows.map(norm); e = ['mt', n.length + '/' + w.nterms + ':' + w.ans.join(','), H(n.join('\n')), cut(card || n[0] || ''), H(n.slice().sort().join('\n'))]; }
    else if (w.kind === 'nrCode') { const q = norm(w.q); e = ['nr', '', H(q + '\n' + w.a), cut(q || card)]; }
    else if (w.kind === 'eqTable') { const n = w.rows.map(norm); e = ['tb', n.length + 'x' + w.opt.join(',') + ':' + w.ans.join(';'), H(w.cols.map(norm).join('\n') + '\n' + n.join('\n')), cut(card || n.join(', ')), H(n.slice().sort().join('\n'))]; }
    else if (w.kind === 'notesBox') e = ['note', '', H(lt + '\n' + w.name), cut(lt + ': ' + w.name)];
    else if (w.kind === 'speed') e = ['spd', '', H(lt + '\n' + w.name + '\n' + norm(w.title)), cut(lt + ': ' + norm(w.title))];
    if (w.keys.length && w.keys[0] !== w.fkey) notes.push(w.kind + ' in ' + w.lid + ' reads ' + w.keys.join(', ') + ' (its formula gives ' + w.fkey + ')');
    for (const key of keys) { (keyUse[key] = keyUse[key] || []).push(w.kind + ' in ' + w.lid + (card ? ' "' + cut(card, 40) + '"' : '')); E[key] = e; }
  }
  /* a key that a lesson reads outside the known widgets: locked by its lesson only */
  const seen = new Set();
  for (const s of c.stray) { if (E[s.key] || seen.has(s.key) || /^ice_/.test(s.key)) continue; seen.add(s.key); const lt = title[s.lid] || s.lid; E[s.key] = ['w', '', H(lt + '\n' + s.key), cut(lt)]; notes.push('the key ' + s.key + ' is read in ' + s.lid + ' outside the known widgets: it is locked by its lesson only'); }
  const shared = Object.entries(keyUse).filter(([k, v]) => v.length > 1);
  return { E, shared, notes };
}

const fp = e => e[0] + '|' + e[1] + '|' + e[2];
function compare(L, C, allow) {
  const R = { moved: [], vanished: [], structure: [], reordered: [], changed: [], allowed: [], fresh: [], same: 0 };
  const curBy = {}, lockCount = {};
  for (const id in C) (curBy[fp(C[id])] = curBy[fp(C[id])] || []).push(id);
  for (const id in L) lockCount[fp(L[id])] = (lockCount[fp(L[id])] || 0) + 1;
  const movedTo = id => lockCount[fp(L[id])] === 1 ? (curBy[fp(L[id])] || []).filter(y => y !== id && (!L[y] || fp(L[y]) !== fp(C[y]))) : [];
  const was = id => '"' + L[id][3] + '"';
  for (const id in L) {
    const l = L[id], c = C[id], to = movedTo(id);
    if (!c) { if (to.length) R.moved.push(id + ': ' + was(id) + ' is now ' + to.join(', ')); else R.vanished.push(id + ': ' + was(id) + ' no longer exists'); continue; }
    if (fp(c) === fp(l)) { R.same++; continue; }
    if (to.length) { R.moved.push(id + ': ' + was(id) + ' is now ' + to.join(', ') + ', and ' + id + ' names "' + c[3] + '"'); continue; }
    if (c[0] !== l[0] || c[1] !== l[1]) { R.structure.push(id + ': ' + (c[0] !== l[0] ? 'kind ' + l[0] + ' -> ' + c[0] : (l[0] === 'mc' ? 'answer index / options ' : 'rows / answers ') + l[1] + ' -> ' + c[1]) + ' (' + was(id) + ')'); continue; }
    if (l[4] && c[4] === l[4]) { R.reordered.push(id + ': the same rows in another order (' + was(id) + ')'); continue; }
    (allow.has(id) ? R.allowed : R.changed).push(id + ': was ' + was(id) + ', now "' + c[3] + '"');
  }
  for (const id in C) if (!L[id]) R.fresh.push(id + ' (' + C[id][0] + ') "' + C[id][3] + '"');
  return R;
}

function writeLock(file, E, made) {
  const ids = Object.keys(E), count = {};
  ids.forEach(id => { count[E[id][0]] = (count[E[id][0]] || 0) + 1; });
  const head = { about: 'The saved-answer ids of study-site/index.html and what each one names. Checked by ids.test.js; refreshed with ids.test.js --write. Each entry: [kind, structure, hash of the text, start of the text, (lists) hash of the sorted rows]. kind: mc, num (questions), cnt (lesson correct-count), ice, hs, ord, mt, nr, tb, note, spd, w (try-its). structure: a/option count for mc; rows/terms:answers for mt; rows x options:answers for tb; item count for hs and ord; species for ice.', made_from: made, made_at: new Date().toISOString().slice(0, 10), count: Object.assign({ total: ids.length }, count) };
  const s = '{\n' + Object.entries(head).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',\n') + ',\n"ids":{\n' + ids.map(id => JSON.stringify(id) + ':' + JSON.stringify(E[id])).join(',\n') + '\n}}\n';
  fs.writeFileSync(file, s);
}

function gitLabel(file) {
  const d = path.dirname(file), g = args => cp.spawnSync('git', ['-C', d].concat(args), { encoding: 'utf8' });
  const r = g(['rev-parse', '--short', 'HEAD']);
  if (r.status !== 0) return 'unknown';
  return r.stdout.trim() + (g(['diff', '--quiet', 'HEAD', '--', file]).status === 0 ? '' : ' with changes');
}

lib.run('ids', async ({ launch }) => {
  const browser = await launch(), h = await lib.openPage(browser, a.file, { width: 1366, height: 900 });
  h.at('rebuilding every lesson');
  const c = await collect(h.page);
  await h.page.waitForTimeout(300);
  await h.close();
  const { E, shared, notes } = entries(c), ids = Object.keys(E), kinds = {};
  ids.forEach(id => { kinds[E[id][0]] = (kinds[E[id][0]] || 0) + 1; });
  const pageErrs = h.errors.map(e => e.at + ': ' + e.type + ': ' + e.text.slice(0, 300)).concat(c.errors);
  console.log('ids in the page: ' + ids.length + ' (' + Object.entries(kinds).map(([k, n]) => k + ' ' + n).join(', ') + ')');
  console.log('try-its: ' + c.w.length + ' widget calls in ' + c.lessons.length + ' lessons; widgets wrapped: ' + c.wrapped.join(', ') + (c.storeHook ? '' : ' (Store.w could not be wrapped: keys come from the widget formulas)'));
  if (notes.length) { console.log('notes:'); lib.list(notes, 20); }
  if (pageErrs.length) { console.log('\nThe page reported errors while the lessons were rebuilt (the smoke test checks these):'); lib.list(pageErrs, 15); }
  let L = null;
  try { L = JSON.parse(fs.readFileSync(LOCK, 'utf8')); } catch (e) { if (!a.has('--write')) { console.log('\nNo lock to check against: ' + LOCK + ' (' + e.message + '). Write one with --write.'); return 1; } }
  const allow = new Set();
  if (a.opt('--allow')) fs.readFileSync(path.resolve(a.opt('--allow')), 'utf8').split('\n').map(s => s.replace(/#.*/, '').trim()).filter(Boolean).forEach(id => allow.add(id.split(/\s+/)[0]));
  let bad = shared.length;
  if (L) {
    const R = compare(L.ids, E, allow);
    console.log('\nagainst ' + path.relative(process.cwd(), LOCK) + ' (made from ' + L.made_from + ', ' + Object.keys(L.ids).length + ' ids): ' + R.same + ' unchanged');
    const show = (label, arr, fail) => { console.log('  ' + (label + ':').padEnd(44) + arr.length + (arr.length && fail ? '   <- FAIL' : '')); };
    show('moved (now at another id)', R.moved, 1);
    show('vanished', R.vanished, 1);
    show('structure changed (kind, a, options, rows)', R.structure, 1);
    show('try-it rows reordered', R.reordered, 1);
    show('stem or rows changed, not in --allow', R.changed, 1);
    show('stem or rows changed, allowed', R.allowed, 0);
    show('shared try-it keys', shared, 1);
    show('new ids (not locked yet)', R.fresh, 0);
    for (const [label, arr] of [['MOVED', R.moved], ['VANISHED', R.vanished], ['STRUCTURE CHANGED', R.structure], ['REORDERED', R.reordered], ['CHANGED (add the id to an --allow file if the question is the same, else clear its old answers and --write)', R.changed], ['ALLOWED', R.allowed], ['NEW', R.fresh]])
      if (arr.length) { console.log('\n' + label); lib.list(arr, 30); }
    const unused = [...allow].filter(id => !R.allowed.some(x => x.startsWith(id + ':')));
    if (unused.length) { console.log('\nin the --allow file but not changed: ' + unused.length); lib.list(unused, 10); }
    if (!a.has('--write')) bad += R.moved.length + R.vanished.length + R.structure.length + R.reordered.length + R.changed.length;
  }
  if (shared.length) { console.log('\nSHARED KEYS (two try-its save under one key: give each its own slot)'); lib.list(shared.map(([k, v]) => k + ' <- ' + v.join(' | ')), 20); }
  if (a.has('--write')) {
    if (pageErrs.length || shared.length) { console.log('\nThe lock was NOT written, because ' + (pageErrs.length ? 'the page reported errors.' : 'two try-its share a key.')); return 1; }
    writeLock(LOCK, E, a.opt('--from', gitLabel(a.file)));
    console.log('\nwrote ' + ids.length + ' ids to ' + LOCK);
  }
  return bad;
});
