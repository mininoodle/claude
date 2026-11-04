'use strict';
const USAGE = `usage: node study-site/test/smoke.test.js <index.html> [--only mom,ff] [--width 1366] [--full]

Opens every page the way a student does (subject tab, unit or section bar, lesson chip) and scrolls through it.
Fails on any page error or console error, and on a page that does not open or shows no cards.
  pass 1  Today; every lesson, reference sheet and Review page of every section; the Test tab; Today again.
          A lesson with questions must show all of them, a pager, its how-to guide (HT) and its challenge card (CH).
          One multiple-choice and one numeric question of each quiz are answered: the numeric one with its own n,
          which must be marked correct. On each Review page a mixed test is started, two questions are answered,
          and the test is ended (the results must show). The Test tab starts a test and the daily challenge starts.
  pass 2  a fresh page: each Review page starts a timed exam, answers question 1 and goes to question 2.
  pass 3  a fresh page with a stand-in for the Claude account (window.claude): the page must read the account copy
          at boot, and an answer must reach it.
--only    only these sections (pass 1 and 2); Today, the Test tab and pass 3 always run
--width   viewport width of pass 1 and 2 (default 1366)
--full    pass 1 also at 390 px (phone)`;
const lib = require('./lib');
const a = lib.cli(USAGE);
const only = a.opt('--only') ? new Set(a.opt('--only').split(',')) : null;
const width = +a.opt('--width', 1366);

/* in the page: window.__answer(q, v) answers one question element (.q): MC the first option, numeric the value v (or 1),
   four-box numeric response 1111, written response a sentence. window.__btn(re, root) is the first enabled button whose text matches. */
function helpers() {
  window.__answer = (q, v) => {
    const op = q.querySelector('.op');
    if (op) { op.click(); return 'mc'; }
    const inp = q.querySelector('.num input'), b = q.querySelector('.num button');
    if (inp && b) { inp.value = v == null ? '1' : String(v); b.click(); return 'num'; }
    const nr = q.querySelectorAll('.nr input');
    if (nr.length) { nr.forEach(x => { x.value = '1'; x.dispatchEvent(new Event('input', { bubbles: true })); }); return 'nr'; }
    const ta = q.querySelector('textarea');
    if (ta) { ta.value = 'A test answer.'; ta.dispatchEvent(new Event('input', { bubbles: true })); return 'wr'; }
    return null;
  };
  window.__btn = (re, root) => [...(root || document).querySelectorAll('button')].find(b => re.test(b.textContent) && !b.disabled);
}

/* in the page: the checks of the page that is shown */
function checkShown(pg) {
  const out = [], A = document.querySelector('#main > article:not([hidden])');
  if (!A) return ['no page is shown'];
  const want = pg.k ? pg.k + '-' + pg.i : pg.kind === 'home' ? 'home-0' : 'test-0';
  if (A.id !== want) out.push(A.id + ' is shown instead of ' + want);
  if (!A.querySelector('.card')) out.push('no cards');
  if (!A.querySelector('h1')) out.push('no heading');
  if (!pg.k) return out;
  const le = SUBJ[pg.k].lessons[pg.i];
  if (le.qz && !le.rv) {
    const n = A.querySelectorAll('.quiz .q').length;
    if (n !== le.qz.length) out.push('the quiz shows ' + n + ' of ' + le.qz.length + ' questions');
  }
  const pager = A.querySelector('.pager');
  if (!pager || !pager.querySelector('button')) out.push('no pager');
  if (typeof HT !== 'undefined' && HT[pg.k] && HT[pg.k][pg.i] && !A.querySelector('.ht')) out.push('HT has a how-to guide for this lesson, but the page does not show it');
  if (typeof CH !== 'undefined' && CH[pg.k] && CH[pg.k][pg.i] && ![...A.querySelectorAll('.card h3')].some(h => /challenge problem/i.test(h.textContent))) out.push('CH has a challenge problem for this lesson, but the page shows no challenge card');
  return out;
}

/* in the page: answer the first multiple-choice and the first numeric question of the quiz */
function answerQuiz(pg) {
  const out = [], le = SUBJ[pg.k].lessons[pg.i], A = document.getElementById(pg.k + '-' + pg.i), qs = [...A.querySelectorAll('.quiz .q')];
  const jm = le.qz.findIndex(it => it.o), jn = le.qz.findIndex(it => !it.o && typeof it.n === 'number' && isFinite(it.n));
  const id = j => pg.k + '_' + pg.i + '_' + j;
  if (jm >= 0 && qs[jm]) {
    const q = qs[jm];
    if (window.__answer(q) !== 'mc') out.push('question ' + (jm + 1) + ' (' + id(jm) + ') has no option buttons');
    else {
      const fb = q.querySelector('.fb');
      if (!fb || fb.hidden) out.push('question ' + (jm + 1) + ' (' + id(jm) + '): no feedback after an option was selected');
      if (q.querySelectorAll('.op.ok').length !== 1) out.push('question ' + (jm + 1) + ' (' + id(jm) + '): ' + q.querySelectorAll('.op.ok').length + ' options are marked correct after an answer');
      if (!Store.get(id(jm))) out.push('question ' + (jm + 1) + ' (' + id(jm) + '): the answer was not saved');
    }
  }
  if (jn >= 0 && qs[jn]) {
    const q = qs[jn], it = le.qz[jn];
    if (window.__answer(q, it.n) !== 'num') out.push('question ' + (jn + 1) + ' (' + id(jn) + ') has no answer box');
    else {
      const fb = q.querySelector('.fb');
      if (!fb || fb.hidden || !fb.classList.contains('ok')) out.push('question ' + (jn + 1) + ' (' + id(jn) + '): its own answer ' + it.n + ' is not marked correct (' + (fb ? fb.textContent.slice(0, 90) : 'no feedback') + ')');
      if (!Store.get(id(jn))) out.push('question ' + (jn + 1) + ' (' + id(jn) + '): the answer was not saved');
    }
  }
  return out;
}

/* in the page: on a Review page, a mixed test: answer, Next, answer, End the test now, results */
function reviewTest() {
  const out = [], A = document.querySelector('#main > article:not([hidden])');
  const start = window.__btn(/start a mixed test/i, A);
  if (!start) return ['no "Start a mixed test" button on the Review page'];
  start.click();
  for (let n = 1; n <= 2; n++) {
    const card = A.querySelector('.rv-q'), q = card && card.querySelector('.q');
    if (!q) { if (n === 1) out.push('the review test did not start'); break; }
    if (!window.__answer(q)) { out.push('review test question ' + n + ' cannot be answered'); break; }
    const nx = window.__btn(/next question|see the results/i, card);
    if (!nx) { out.push('review test question ' + n + ': Next stays disabled after an answer'); break; }
    if (n === 1) nx.click();
  }
  const end = window.__btn(/end the test now/i, A);
  if (end) end.click();
  if (![...A.querySelectorAll('.card h3')].some(h => /^results/i.test(h.textContent.trim()))) out.push('the review test shows no results after "End the test now"');
  return out;
}

/* in the page: on a Review page, start the timed exam, answer question 1, go to question 2 */
function examStart() {
  const out = [], A = document.querySelector('#main > article:not([hidden])');
  const s = window.__btn(/start the exam/i, A);
  if (!s) return ['no "Start the exam" button on the Review page'];
  s.click();
  const card = A.querySelector('.rv-q'), h = card && card.querySelector('h3'), m = h && h.textContent.match(/question 1 of (\d+)/i);
  if (!m) return ['the timed exam did not start (' + (h ? h.textContent : 'no question card') + ')'];
  const q = card.querySelector('.q');
  if (!q || !window.__answer(q)) out.push('exam question 1 cannot be answered');
  if (+m[1] > 1) {
    const nx = window.__btn(/^next$/i, card);
    if (!nx) out.push('the exam has no Next button');
    else { nx.click(); const h2 = A.querySelector('.rv-q h3'); if (!h2 || !/question 2 of/i.test(h2.textContent)) out.push('Next did not go to exam question 2'); }
  }
  return out;
}

/* in the page: the Test tab: start a test, answer, Next */
function testTab() {
  const A = document.getElementById('test-0'), go = A && window.__btn(/start the test/i, A);
  if (!go) return ['no enabled "Start the test" button on the Test tab'];
  go.click();
  const q = A.querySelector('.q');
  if (!q) return ['the test did not start'];
  if (!window.__answer(q)) return ['the first test question cannot be answered'];
  const chip = A.querySelector('.confrow:not([hidden]) .chip');
  if (chip) chip.click();
  const nx = window.__btn(/next question|finish/i, A);
  if (!nx) return ['Next stays disabled after the first test answer'];
  nx.click();
  return A.querySelector('.q') ? [] : ['the second test question did not appear'];
}

/* in the page: the daily challenge on the Today page */
function daily() {
  const A = document.getElementById('home-0'), c = A && [...A.querySelectorAll('.card')].find(x => /daily challenge/i.test((x.querySelector('h3') || {}).textContent || '')), b = c && window.__btn(/daily challenge|continue/i, c);
  if (!b) return ['no button to start the daily challenge, after questions were answered'];
  b.click();
  const q = A.querySelector('.q');
  if (!q) return ['the daily challenge did not start'];
  return window.__answer(q) ? [] : ['the first daily question cannot be answered'];
}

lib.run('smoke', async ({ launch }) => {
  const browser = await launch(), problems = [], errors = [];
  const say = (where, list) => list.forEach(x => problems.push(where + ': ' + x));
  let opened = 0;

  async function visit(h, pg, scroll = true) {
    h.at(pg.name);
    try { await lib.openPageItem(h.page, pg); } catch (e) { say(pg.name, [String(e.message || e).split('\n')[0]]); return false; }
    opened++;
    await lib.frames(h.page);
    if (scroll) await lib.scrollThrough(h.page);
    say(pg.name, await h.page.evaluate(checkShown, pg));
    return true;
  }

  async function pass1(w) {
    /* the achievement overlay is built (its code runs) but not shown: it stays open over the page, and its backdrop blur
       makes every later frame slow */
    const t0 = Date.now(), h = await lib.openPage(browser, a.file, { width: w, height: 900, css: '.cele{display:none!important}' });
    await h.page.evaluate(helpers);
    const pages = await lib.pageList(h.page), home = pages.find(p => p.kind === 'home'), test = pages.find(p => p.kind === 'test');
    const tag = w === width ? '' : ' [' + w + ' px]';
    await visit(h, Object.assign({}, home, { name: 'Today' + tag }));
    let n = 0;
    for (const pg of pages.filter(p => p.k && (!only || only.has(p.k)))) {
      const P = Object.assign({}, pg, { name: pg.name + tag });
      if (!await visit(h, P)) continue;
      n++;
      if (pg.kind === 'lesson' && pg.qz) say(P.name, await h.page.evaluate(answerQuiz, pg));
      if (pg.kind === 'review') { h.at(P.name + ' (review test)'); say(P.name, await h.page.evaluate(reviewTest)); }
    }
    if (await visit(h, Object.assign({}, test, { name: 'Test' + tag }))) { h.at('Test' + tag + ' (a test)'); say('Test' + tag, await h.page.evaluate(testTab)); }
    if (await visit(h, Object.assign({}, home, { name: 'Today' + tag + ' (second visit)' }), false)) { h.at('Today' + tag + ' (daily challenge)'); say('Today' + tag, await h.page.evaluate(daily)); }
    h.at('after pass 1' + tag);
    await h.page.waitForTimeout(1200);
    errors.push(...h.errors);
    await h.close();
    console.log('pass 1' + tag + ': ' + n + ' lessons, Today and Test opened and scrolled through at ' + w + ' px, in ' + lib.secs(t0));
  }

  async function pass2() {
    const t0 = Date.now(), h = await lib.openPage(browser, a.file, { width, height: 900 });
    await h.page.evaluate(helpers);
    const pages = (await lib.pageList(h.page)).filter(p => p.kind === 'review' && (!only || only.has(p.k)));
    for (const pg of pages) {
      const P = Object.assign({}, pg, { name: pg.name + ' (timed exam)' });
      if (!await visit(h, P, false)) continue;
      say(P.name, await h.page.evaluate(examStart));
    }
    h.at('after pass 2');
    await h.page.waitForTimeout(600);
    errors.push(...h.errors);
    await h.close();
    console.log('pass 2: a timed exam started on ' + pages.length + ' Review pages, in ' + lib.secs(t0));
  }

  async function pass3() {
    const t0 = Date.now(), h = await lib.openPage(browser, a.file, { width, height: 900, claude: {} });
    await h.page.evaluate(helpers);
    h.at('Claude account: boot');
    try { await h.page.waitForFunction(() => window.__claude.log.some(x => x.op === 'get' || x.op === 'query'), null, { timeout: 8000 }); }
    catch (e) { say('Claude account', ['the page did not read the account copy within 8 s of loading']); }
    const pages = await lib.pageList(h.page), pg = pages.find(p => p.kind === 'lesson' && p.qz);
    if (pg && await visit(h, Object.assign({}, pg, { name: 'Claude account: ' + pg.name }), false)) {
      const id = await h.page.evaluate(pg => { const le = SUBJ[pg.k].lessons[pg.i], j = le.qz.findIndex(it => it.o), q = document.querySelectorAll('#' + pg.k + '-' + pg.i + ' .quiz .q')[j]; return q && window.__answer(q) === 'mc' ? pg.k + '_' + pg.i + '_' + j : null; }, pg);
      if (!id) say('Claude account', ['no multiple-choice question to answer in ' + pg.name]);
      else {
        h.at('Claude account: upload of ' + id);
        try { await h.page.waitForFunction(id => JSON.stringify(window.__claude.docs()).includes('"' + id + '"'), id, { timeout: 10000 }); }
        catch (e) { say('Claude account', ['the answer to ' + id + ' did not reach the account copy within 10 s (calls: ' + (await h.page.evaluate(() => window.__claude.log.map(x => x.op).join(' '))) + ')']); }
      }
    }
    h.at('after pass 3');
    await h.page.waitForTimeout(300);
    errors.push(...h.errors);
    await h.close();
    console.log('pass 3: the Claude account stand-in, in ' + lib.secs(t0));
  }

  await pass1(width);
  if (a.full && width !== 390) await pass1(390);
  await pass2();
  await pass3();

  console.log('\npages opened: ' + opened + ', problems: ' + problems.length + ', page and console errors: ' + errors.length);
  if (problems.length) { console.log('\nPROBLEMS'); lib.list(problems, 60); }
  if (errors.length) { console.log('\nPAGE AND CONSOLE ERRORS (where: what)'); lib.list(errors.map(e => e.at + ': ' + e.type + ': ' + e.text.slice(0, 400)), 40); }
  return problems.length + errors.length;
});
