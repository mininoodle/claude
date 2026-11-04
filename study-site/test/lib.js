'use strict';
/* Shared helpers for the checks in this folder (see README.md).
   Every check is a standalone node script: node study-site/test/<name>.test.js <path to index.html> [flags].
   Exit code 0 = pass, 1 = fail, 2 = the check could not run (bad arguments, no browser).

   What is here:
   - cli(usage): the path of index.html (first argument; default ../index.html) and the flags
   - launch(), openPage(browser, file, options): Chromium, the page opened by file:// with the network blocked,
     optionally with a stand-in for the Claude artifact runtime (window.claude), page and console errors collected
   - pageList(), openTab(), openLesson(), openPageItem(): open pages the way a student does, with the subject tabs,
     the unit and section bars and the lesson chips (they call showTab, showUnit / goSection and showLesson)
   - scrollThrough(), frames(): scroll a page from top to bottom so that canvases and lazy parts draw
   - claudeMock: the window.claude stand-in (use('db'), use('user'), use('downloads')); calls are logged in window.__claude */
const fs = require('fs'), path = require('path'), url = require('url');

function playwright() {
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { return require(p); } catch (e) { /* next */ } }
  console.error('Playwright is not installed. Install it with: npm install --no-save playwright && npx playwright install chromium');
  process.exit(2);
}

/* the command line: argv[0] is index.html (default: the page next to this folder); flags follow */
function cli(usage) {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) { console.log(usage); process.exit(0); }
  const first = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
  const file = path.resolve(first || path.join(__dirname, '..', 'index.html'));
  if (!fs.existsSync(file)) { console.error('No such file: ' + file + '\n\n' + usage); process.exit(2); }
  const rest = first ? argv.slice(1) : argv;
  const has = f => rest.includes(f);
  const opt = (f, d) => { const i = rest.indexOf(f); return i >= 0 && rest[i + 1] != null && !rest[i + 1].startsWith('--') ? rest[i + 1] : d; };
  return { file, rest, has, opt, full: has('--full') };
}

const fileUrl = f => url.pathToFileURL(path.resolve(f)).href;
const secs = t0 => ((Date.now() - t0) / 1000).toFixed(1) + ' s';

async function launch() { return playwright().chromium.launch(); }

/* the requests that the blocked network turns into console messages: not errors of the page */
const NOISE = /^Failed to load resource: net::ERR_(FAILED|ABORTED|INTERNET_DISCONNECTED|NAME_NOT_RESOLVED)/;

/* Open the page. o.width / o.height: viewport (1366 x 900); o.dark: dark colour scheme; o.noMotion: no animations or
   transitions (for measuring); o.claude: true or the options of claudeMock (a stand-in for window.claude);
   o.storage: {key: value} put into localStorage before the page loads; o.init: [function, arg] run before the page scripts;
   o.css: a style sheet added after boot (for example '.cele{display:none!important}' hides the achievement overlay).
   Returns {page, ctx, errors, at(label), close()}. errors collects page errors and console errors, each with the label
   given to at() when it happened. */
async function openPage(browser, file, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: o.width || 1366, height: o.height || 900 }, deviceScaleFactor: 1, colorScheme: o.dark ? 'dark' : 'light' });
  await ctx.route(/^https?:\/\//, r => r.abort());
  const page = await ctx.newPage();
  const h = { page, ctx, errors: [], label: 'loading the page' };
  h.at = l => { h.label = l; };
  page.on('pageerror', e => h.errors.push({ at: h.label, type: 'page error', text: String(e && e.message || e) + (e && e.stack ? ' | ' + String(e.stack).split('\n').slice(1, 3).map(s => s.trim()).join(' | ') : '') }));
  page.on('console', m => { if (m.type() !== 'error' || NOISE.test(m.text())) return; h.errors.push({ at: h.label, type: 'console error', text: m.text() }); });
  page.on('crash', () => h.errors.push({ at: h.label, type: 'crash', text: 'the page crashed' }));
  if (o.storage) await page.addInitScript(s => { try { for (const k in s) localStorage.setItem(k, s[k]); } catch (e) { /* storage blocked */ } }, o.storage);
  if (o.claude) await page.addInitScript(claudeMock, o.claude === true ? {} : o.claude);
  if (o.init) await page.addInitScript(o.init[0], o.init[1]);
  await page.goto(fileUrl(file));
  await waitBoot(page, h);
  if (o.noMotion) await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}.cele{display:none!important}' });
  if (o.css) await page.addStyleTag({ content: o.css });
  h.at('after boot');
  h.close = () => ctx.close().catch(() => {});
  return h;
}

/* boot() has run when the subjects exist and a page (Today or a lesson) is shown in #main */
async function waitBoot(page, h, ms = 20000) {
  try {
    await page.waitForFunction(() => typeof SUBJ !== 'undefined' && typeof SUBJECTS !== 'undefined' && typeof tabSeg !== 'undefined' && !!tabSeg && !!document.querySelector('#main > article:not([hidden])'), null, { timeout: ms });
  } catch (e) {
    const errs = h ? h.errors.map(x => x.type + ': ' + x.text).slice(0, 5).join('\n  ') : '';
    throw new Error('the page did not finish booting in ' + ms / 1000 + ' s' + (errs ? ':\n  ' + errs : ' (no page error was reported)'));
  }
  await frames(page);
}

/* wait for n animation frames, so that observers and redraws have run */
const frames = (page, n = 2) => page.evaluate(n => new Promise(r => { const f = k => k ? requestAnimationFrame(() => f(k - 1)) : r(); f(n); }), n);

/* every page a student can open, in the order of the subject tabs: Today, each lesson of each section (with the reference
   sheet and the Review page), Test. kind: home, lesson, ref, review, test */
const pageList = page => page.evaluate(() => {
  const L = [];
  SUBJECTS.forEach((S, si) => {
    if (S.home || S.test) { L.push({ si, k: null, i: null, kind: S.home ? 'home' : 'test', name: S.name }); return; }
    S.units.forEach(k => SUBJ[k].lessons.forEach((le, i) => L.push({ si, k, i, kind: le.rv ? 'review' : le.qz ? 'lesson' : (typeof REF !== 'undefined' && REF[k] && i === SUBJ[k].lessons.length - 2) ? 'ref' : 'lesson', name: k + '-' + i + ' ' + le.t, qz: le.qz ? le.qz.length : 0 })));
  });
  return L;
});

/* the subject tab si, as a click on its button */
const openTab = (page, si) => page.evaluate(si => {
  const b = [...tabSeg.el.querySelectorAll('[role=tab]')][si];
  if (!b) throw new Error('there is no subject tab ' + si);
  if (b.getAttribute('aria-selected') !== 'true') b.click();
  const S = SUBJECTS[si], want = S.home ? 'home-0' : S.test ? 'test-0' : null, A = document.querySelector('#main > article:not([hidden])');
  if (want && (!A || A.id !== want)) throw new Error('the ' + S.name + ' tab did not open its page (' + (A ? A.id : 'nothing') + ' is shown)');
  return A ? A.id : null;
}, si);

/* lesson i of section k, the way a student gets there: the subject tab, then the unit bar (and the section bar of a grouped
   unit), then the lesson chip. Returns the id of the article that is shown; throws when a control is missing or the
   lesson does not open. */
const openLesson = (page, k, i) => page.evaluate(([k, i]) => {
  const si = SUBJECTS.findIndex(s => s.units.includes(k));
  if (si < 0) throw new Error('section ' + k + ' is in no subject');
  const S = SUBJECTS[si], tab = [...tabSeg.el.querySelectorAll('[role=tab]')][si];
  if (!tab) throw new Error('there is no tab for ' + S.name);
  if (tab.getAttribute('aria-selected') !== 'true' || curS === 'home' || curS === 'test') tab.click();
  if (curS !== k) {
    const D = dispUnits(S), j = D.findIndex(d => d === k || (typeof d !== 'string' && d.units.includes(k)));
    const ub = [...document.querySelectorAll('#units > .seg > [role=tab]')][j];
    if (!ub) throw new Error('there is no button for ' + k + ' in the unit bar of ' + S.name);
    if (ub.getAttribute('aria-selected') !== 'true') ub.click();
    if (curS !== k) {
      const g = typeof D[j] === 'string' ? null : D[j], sb = g && [...document.querySelectorAll('#units .usec .seg > [role=tab]')][g.units.indexOf(k)];
      if (!sb) throw new Error('there is no button for ' + k + ' in the section bar');
      sb.click();
    }
  }
  if (curS !== k) throw new Error('section ' + k + ' did not open (' + curS + ' is open)');
  const chip = document.querySelectorAll('#chips > button')[i];
  if (!chip) throw new Error('there is no lesson chip ' + i + ' for ' + k);
  chip.click();
  const id = k + '-' + i, A = document.getElementById(id);
  if (!A || A.hidden || curL[k] !== i) throw new Error('lesson ' + id + ' did not open');
  return id;
}, [k, i]);

/* one entry of pageList */
const openPageItem = (page, pg) => pg.k ? openLesson(page, pg.k, pg.i) : openTab(page, pg.si);

/* scroll from the top to the bottom of the page, one screen at a time, two frames at each stop; then back to the top */
const scrollThrough = page => page.evaluate(async () => {
  const fr = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const step = Math.max(300, innerHeight);
  for (let y = 0, n = 0; n < 400; n++, y += step) {
    const max = document.documentElement.scrollHeight - innerHeight;
    window.scrollTo({ top: Math.min(y, max), behavior: 'instant' });
    await fr();
    if (y >= max) break;
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
  await fr();
});

/* A stand-in for the Claude artifact runtime, for tests. It runs in the page before the page's scripts (page.addInitScript)
   and follows the call contract of the platform's type definitions: window.claude has only use(name); use() resolves
   later (never during the first run of the page's scripts), to a frozen namespace or null.
   - use('db'): doc(path) / collection(path) with the path grammar (even segments = document), get, set (a full replace,
     at most 256 KiB), update (merge, the document must exist), delete, onSnapshot (fires soon after it is called, then
     on every change), acquire; collections with where / orderBy / limit / get / onSnapshot / add. Snapshot data is frozen.
   - use('user'): id() (o.user, default 'test-user'; null means signed out), me(), isOwner(), canEdit(), can(), profiles().
   - use('downloads'): save({filename, data}) resolves {status:'saved'} (or rejects 'declined' when o.declineDownloads).
   Options: o.caps (names served; default ['db','user','downloads']), o.user, o.docs ({path: body} at the start),
   o.delay (ms before use() resolves, default 5), o.failWrites (an error code: set, update and delete reject with it).
   Test hooks in window.__claude: log (every call: {op, path, bytes, t}), docs() (a copy of every document),
   write(path, body) (another device writes: the subscribers get it), fail(code or null) (start or stop failing writes). */
function claudeMock(o) {
  o = o || {};
  const caps = new Set(o.caps || ['db', 'user', 'downloads']), docs = new Map(), subs = new Map(), log = [], qsubs = new Set();
  let failCode = o.failWrites || null;
  for (const p in (o.docs || {})) docs.set(p, JSON.stringify(o.docs[p]));
  const later = f => setTimeout(f, 0);
  const rec = (op, p, x) => log.push(Object.assign({ op, path: p, t: Date.now() }, x || {}));
  const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
  const SEG = /^[A-Za-z0-9_\-.~:@+]+$/;
  const parts = (p, even, what) => {
    if (typeof p !== 'string') throw new TypeError(what + ': the path must be a string');
    const s = p.split('/');
    if (s.length > 16 || p.length > 1000 || s.some(x => !SEG.test(x) || x === '.' || x === '..' || x.length > 200)) throw new TypeError(what + ': bad path "' + p + '"');
    if ((s.length % 2 === 0) !== even) throw new TypeError(what + ': "' + p + '" has ' + s.length + ' segments; a ' + (even ? 'document' : 'collection') + ' path needs an ' + (even ? 'even' : 'odd') + ' number');
    return s;
  };
  const snap = p => { const j = docs.get(p), s = p.split('/'); return Object.freeze({ id: s[s.length - 1], exists: j != null, data: () => j != null ? freeze(JSON.parse(j)) : undefined, metadata: Object.freeze({ fromCache: false, hasPendingWrites: false }) }); };
  const bad = (code, message) => ({ code, message });
  const body = d => {
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw bad('invalid_argument', 'a document body must be an object');
    const j = JSON.stringify(d);
    if (j.length > 262144) throw bad('invalid_argument', 'the document is over 256 KiB (' + j.length + ' bytes)');
    return j;
  };
  const changed = p => {
    (subs.get(p) || new Set()).forEach(f => later(() => f(snap(p))));
    qsubs.forEach(q => { if (p.slice(0, p.lastIndexOf('/')) === q.path) later(q.run); });
  };
  const merge = (a, b) => { for (const k in b) { const v = b[k]; if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) merge(a[k], v); else a[k] = v; } return a; };
  function docRef(p) {
    const s = parts(p, true, 'doc');
    return Object.freeze({
      id: s[s.length - 1], path: p,
      get: async () => { rec('get', p); return snap(p); },
      set: async d => { if (failCode) { rec('set-failed', p); throw bad(failCode, 'writes fail in this test'); } const j = body(d); docs.set(p, j); rec('set', p, { bytes: j.length }); changed(p); },
      update: async d => { if (failCode) { rec('update-failed', p); throw bad(failCode, 'writes fail in this test'); } if (!docs.has(p)) throw bad('invalid_argument', 'update needs an existing document'); const j = body(merge(JSON.parse(docs.get(p)), JSON.parse(body(d)))); docs.set(p, j); rec('update', p, { bytes: j.length }); changed(p); },
      delete: async () => { if (failCode) { rec('delete-failed', p); throw bad(failCode, 'writes fail in this test'); } docs.delete(p); rec('delete', p); changed(p); },
      acquire: async a => ({ acquired: true, version: 1, expiresAt: new Date(Date.now() + ((a && a.ttlMs) || 30000)).toISOString(), holder: a && a.holder }),
      onSnapshot: (next, error) => { rec('subscribe', p); const set = subs.get(p) || new Set(); subs.set(p, set); const f = x => { try { next(x); } catch (e) { setTimeout(() => { throw e; }); } }; set.add(f); later(() => set.has(f) && f(snap(p))); return () => set.delete(f); },
      collection: sub => colRef(p + '/' + sub),
    });
  }
  function query(cp, filters, order, lim) {
    const OPS = { '==': (a, b) => a === b, '!=': (a, b) => a !== b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b, 'in': (a, b) => b.includes(a), 'not-in': (a, b) => !b.includes(a), 'array-contains': (a, b) => Array.isArray(a) && a.includes(b) };
    const run = () => {
      let L = [...docs.keys()].filter(k => k.slice(0, k.lastIndexOf('/')) === cp).sort().map(snap);
      filters.forEach(([f, op, v]) => { L = L.filter(d => OPS[op] && OPS[op](d.data()[f], v)); });
      if (order) L.sort((a, b) => { const x = a.data()[order[0]], y = b.data()[order[0]]; return (x === undefined) - (y === undefined) || (x < y ? -1 : x > y ? 1 : 0) * (order[1] === 'desc' ? -1 : 1); });
      if (lim) L = L.slice(0, lim);
      return L;
    };
    const qs = (L, prev) => Object.freeze({ docs: L, size: L.length, empty: !L.length, docChanges: () => L.filter(d => !prev || !prev.some(x => x.id === d.id)).map((d, i) => ({ type: 'added', doc: d, oldIndex: -1, newIndex: i })), metadata: Object.freeze({ fromCache: false, hasPendingWrites: false }) });
    return {
      where: (f, op, v) => query(cp, filters.concat([[f, op, v]]), order, lim),
      orderBy: (f, dir) => query(cp, filters, [f, dir || 'asc'], lim),
      limit: n => query(cp, filters, order, n),
      get: async () => { rec('query', cp); return qs(run()); },
      onSnapshot: (next) => { rec('subscribe', cp); let prev = null; const q = { path: cp, run: () => { const L = run(); next(qs(L, prev)); prev = L; } }; qsubs.add(q); later(() => qsubs.has(q) && q.run()); return () => qsubs.delete(q); },
    };
  }
  function colRef(p) {
    parts(p, false, 'collection');
    return Object.freeze(Object.assign(query(p, [], null, 0), {
      path: p,
      doc: id => docRef(p + '/' + (id || Math.random().toString(36).slice(2, 12))),
      add: async d => { const r = docRef(p + '/' + Math.random().toString(36).slice(2, 12)); await r.set(d); return r; },
    }));
  }
  const uid = o.user === undefined ? 'test-user' : o.user;
  const NS = {
    db: Object.freeze({ doc: docRef, collection: colRef }),
    user: Object.freeze({
      id: async () => uid, isOwner: async () => o.owner !== false, canEdit: async () => o.canEdit !== false, can: async () => o.can === undefined ? true : o.can,
      me: async () => ({ id: uid, name: 'Test student', avatarUrl: '', color: '#777777', email: null, isOwner: o.owner !== false, canEdit: o.canEdit !== false }),
      profiles: async ids => Object.fromEntries([].concat(ids).map(i => [i, { id: i, name: i === uid ? 'Test student' : '', avatarUrl: '', color: '#777777', email: null, isMe: i === uid, guest: false }])),
      name: async () => 'Test student', avatarUrl: async () => null, search: async () => [], email: async () => null,
    }),
    downloads: Object.freeze({ save: async r => { rec('download', r && r.filename); if (o.declineDownloads) throw bad('declined', 'the viewer declined'); return { status: 'saved' }; } }),
  };
  const memo = {};
  const use = name => {
    if (!caps.has(name) || !NS[name]) return new Promise(r => setTimeout(() => r(null), o.delay == null ? 5 : o.delay));
    return memo[name] || (memo[name] = new Promise(r => setTimeout(() => { rec('use', name); r(NS[name]); }, o.delay == null ? 5 : o.delay)));
  };
  Object.defineProperty(window, 'claude', { value: Object.freeze({ use }), configurable: false, writable: false });
  window.__claude = {
    log, docs: () => Object.fromEntries([...docs].map(([p, j]) => [p, JSON.parse(j)])),
    write: (p, d) => { parts(p, true, 'write'); docs.set(p, JSON.stringify(d)); rec('remote-write', p); changed(p); },
    fail: code => { failCode = code || null; },
  };
}

/* a short report helper: print at most max lines of a list, then the count of the rest */
function list(lines, max = 30, pad = '    ') {
  lines.slice(0, max).forEach(l => console.log(pad + l));
  if (lines.length > max) console.log(pad + '... and ' + (lines.length - max) + ' more');
}

/* run a check: fn receives {browser} and returns the number of failures. Prints the time, closes the browser, sets the exit code. */
async function run(name, fn) {
  const t0 = Date.now();
  let browser = null, failures = 0;
  try {
    failures = await fn({ launch: async () => (browser = browser || await launch()) });
  } catch (e) {
    console.error('\n' + name + ': the check stopped: ' + (e && e.stack || e));
    failures = failures || 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  console.log('\n' + name + ': ' + (failures ? 'FAIL (' + failures + ' problem' + (failures === 1 ? '' : 's') + ')' : 'PASS') + ' in ' + secs(t0));
  process.exitCode = failures ? 1 : 0;
}

module.exports = { playwright, cli, launch, openPage, waitBoot, frames, pageList, openTab, openLesson, openPageItem, scrollThrough, claudeMock, list, run, secs, fileUrl };
