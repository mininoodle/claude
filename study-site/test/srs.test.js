#!/usr/bin/env node
/* The learning engine with a controlled clock: spaced repetition, mastery, lesson checks, generators, the daily challenge,
   the weekly goal and streak, the redraw at midnight, clears as cut-offs, the review queue, the mistake log and numerical response.
   It uses Playwright's page.clock, so the page itself is not changed. It needs no other file of the test suite.
   usage: node study-site/test/srs.test.js [path to index.html]   (exit code 0 = pass, 1 = fail; VERBOSE=1 lists every check) */
'use strict';
const path = require('path');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const H = 3600e3, D = 24 * H;
const fails = [];
let count = 0;
function ok(cond, msg, info) {
  count++;
  if (!cond) { fails.push(msg); console.log('FAIL ' + msg + (info !== undefined ? '  -> ' + JSON.stringify(info) : '')); }
  else if (process.env.VERBOSE) console.log('ok   ' + msg);
}

/* a fresh page (own storage) with its clock installed at time t */
async function open(browser, t) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date(t) });
  await p.route(/^https?:\/\//, r => r.abort());
  await p.goto('file://' + FILE);
  await p.waitForFunction(() => typeof SUBJ !== 'undefined' && typeof Store !== 'undefined' && document.querySelector('.lesson:not([hidden])'));
  await p.addStyleTag({ content: '.cele{display:none!important}' });
  return { ctx, p, errs };
}
/* move the clock forward and run the timers that fall due (in steps: one jump must stay below 2^31 ms) */
async function ff(p, ms) { while (ms > 0) { const s = Math.min(ms, 20 * D); await p.clock.fastForward(s); ms -= s; } }
/* move the clock to a later local time, without running timers on the way */
const at = (p, t) => p.clock.setSystemTime(new Date(t));

/* ----- 1. the spaced-repetition schedule ----- */
async function schedule(b) {
  const { ctx, p, errs } = await open(b, '2026-11-10T10:00:00');
  const id = 'th_1_r0';
  const st = () => p.evaluate(id => { const e = Store.sr(id); return e ? { b: e.b, k: e.k, days: Math.round((e.d - Date.now()) / 864e5 * 100) / 100 } : null; }, id);
  const out0 = () => p.evaluate(() => gN('srOut'));
  await p.evaluate(id => srMark(id, false), id);
  let s = await st();
  ok(s && s.b === 0 && s.days === 1, 'schedule: a miss is due after 1 day', s);
  await ff(p, 12 * H);
  await p.evaluate(id => srMark(id, true), id);
  s = await st();
  ok(s && s.b === 0 && s.days === 0.5, 'schedule: a correct answer before the due date does not move it', s);
  await ff(p, 12 * H);
  const gaps = [3, 7, 16, 35, 60, 60];
  for (let i = 0; i < gaps.length; i++) {
    const before = await out0();
    await p.evaluate(id => srMark(id, true), id);
    s = await st();
    ok(s && s.b === i + 1 && s.days === gaps[i], `schedule: review ${i + 1} passed, the next one comes after ${gaps[i]} days`, s);
    const after = await out0();
    ok(after - before === (i === 2 ? 1 : 0), `schedule: 'It stuck' counts the question only when it passes its 7-day review (review ${i + 1})`, { before, after });
    await ff(p, gaps[i] * D);
  }
  await p.evaluate(id => srMark(id, false), id);
  s = await st();
  ok(s && s.b === 0 && s.days === 1, 'schedule: a wrong answer starts it again at 1 day', s);
  /* boxes 0 to 2 of a saved entry keep their meaning */
  await p.evaluate(() => Store.srSet('th_1_r1', { b: 2, d: Date.now() - 1000 }));
  await p.evaluate(() => srMark('th_1_r1', true));
  const e2 = await p.evaluate(() => { const e = Store.sr('th_1_r1'); return { b: e.b, days: Math.round((e.d - Date.now()) / 864e5) }; });
  ok(e2.b === 3 && e2.days === 16, 'schedule: an old entry in box 2 goes on to the 16-day step', e2);
  ok(!errs.length, 'schedule: no page errors', errs);
  await ctx.close();
}

/* ----- 2. Mastered: two correct days at least 2 days apart; the lesson check; Needs review ----- */
async function mastery(b) {
  const { ctx, p, errs } = await open(b, '2026-11-10T23:55:00');
  const sk = 'th', L = 2;
  const answerAll = good => p.evaluate(([sk, L, good]) => { const n = SUBJ[sk].lessons[L].qz.length;
    for (let j = 0; j < n; j++) { const id = sk + '_' + L + '_' + j, before = lessonLevel(sk, L); srMark(id, good); onAnswer(id, good, { sk, L, before, v: '1' }); } }, [sk, L, good]);
  const lv = () => p.evaluate(([sk, L]) => lessonLevel(sk, L), [sk, L]);
  await answerAll(true);
  ok((await lv()).lv === 2, 'mastery: all correct on day 1 gives Practised');
  await ff(p, 10 * 60e3);
  await answerAll(true);
  ok((await lv()).lv === 2, 'mastery: correct again 10 minutes later, after midnight, is still Practised');
  const need = await p.evaluate(([sk, L]) => masteryNeeds(sk, L).length, [sk, L]);
  ok(need === 0, 'mastery: the day after, no question can move toward Mastered', need);
  await at(p, '2026-11-12T09:00:00');
  const need2 = await p.evaluate(([sk, L]) => masteryNeeds(sk, L).length, [sk, L]);
  ok(need2 === (await lv()).n, 'mastery: 2 days after the first correct day every question can count again', need2);
  await answerAll(true);
  const v = await lv();
  ok(v.lv === 3 && v.nr === 0, 'mastery: correct on a day 2 days after the first gives Mastered', v);
  /* the lesson check: 3 questions after 7 days */
  const checks = () => p.evaluate(([sk, L]) => SUBJ[sk].lessons[L].qz.map((_, j) => sk + '_' + L + '_' + j).map(id => [id, Store.sr(id)]).filter(([, e]) => e && e.k).map(([id, e]) => ({ id, k: e.k, days: Math.round((e.d - Date.now()) / 864e5) })), [sk, L]);
  let c = await checks();
  ok(c.length === 3 && c.every(x => x.k === 1 && x.days === 7), 'lesson check: mastery puts 3 questions in spaced repetition for 7 days later', c);
  ok(await p.evaluate(([sk, L]) => !!Store.sr(lcKey(sk, L)), [sk, L]), 'lesson check: the lesson is marked as started');
  await ff(p, 7 * D + H);
  const first = c[0].id;
  await p.evaluate(([id, sk, L]) => { srMark(id, true); onAnswer(id, true, { sk, L }); }, [first, sk, L]);
  c = await checks();
  ok(!c.some(x => x.id === first) && c.filter(x => x.k === 2 && x.days === 21).length === 1, 'lesson check: a passed check goes on to another question 21 days later', c);
  const hop = c.find(x => x.k === 2).id;
  await ff(p, 21 * D + H);
  await p.evaluate(([id, sk, L]) => { srMark(id, true); onAnswer(id, true, { sk, L }); }, [hop, sk, L]);
  c = await checks();
  ok(c.filter(x => x.k === 3 && x.days === 60).length === 1, 'lesson check: the next step comes 60 days later', c);
  /* a missed check question: normal schedule, Needs review without a lower level */
  const miss = c.find(x => x.k === 1).id;
  await p.evaluate(([id, sk, L]) => { srMark(id, false); onAnswer(id, false, { sk, L, v: '0' }); }, [miss, sk, L]);
  const m = await p.evaluate(([id, sk, L]) => { const v = lessonLevel(sk, L), e = Store.sr(id); return { lv: v.lv, nr: v.nr, name: lvName(v), b: e.b, k: e.k || 0 }; }, [miss, sk, L]);
  ok(m.lv === 3 && m.nr === 1 && m.name === 'Needs review' && m.b === 0 && !m.k, 'needs review: a missed check keeps Mastered, shows Needs review and goes on the normal schedule', m);
  await p.evaluate(([id, sk, L]) => onAnswer(id, true, { sk, L }), [miss, sk, L]);
  const m2 = await p.evaluate(([sk, L]) => lvName(lessonLevel(sk, L)), [sk, L]);
  ok(m2 === 'Mastered', 'needs review: a correct answer clears it', m2);
  /* the old rule for days saved before the change, the new rule after it */
  const old = await p.evaluate(() => { const set = (sk, L, d) => SUBJ[sk].lessons[L].qz.forEach((_, j) => Store.xs('h', sk + '_' + L + '_' + j, { d, c: 2, m: 0 }));
    set('eq', 1, ['2026-11-01', '2026-11-02']); set('eq', 2, ['2026-11-05', '2026-11-06']); set('eq', 3, ['2026-11-05', '2026-11-07']);
    return [lessonLevel('eq', 1).lv, lessonLevel('eq', 2).lv, lessonLevel('eq', 3).lv]; });
  ok(old[0] === 3 && old[1] === 2 && old[2] === 3, 'mastery: two days in a row before 2026-11-05 still count (old rule); after it they must be 2 days apart', old);
  ok(!errs.length, 'mastery: no page errors', errs);
  await ctx.close();
}

/* ----- 3. the lesson quiz: hints, no filled-in answer on a later day, Try again, the two-tap clear ----- */
async function quiz(b) {
  const { ctx, p, errs } = await open(b, '2026-11-10T10:00:00');
  const sk = 'th', L = 1;
  const info = await p.evaluate(([sk, L]) => { goLesson(sk, L); const items = SUBJ[sk].lessons[L].qz, A = document.getElementById(sk + '-' + L), qs = [...A.querySelectorAll('section.quiz .q')];
    const nj = items.findIndex((it, j) => !it.o && qs[j].querySelector('[data-h]')), mj = items.findIndex(it => it.o), nj2 = items.findIndex((it, j) => !it.o && j !== nj);
    return { nj, mj, nj2 }; }, [sk, L]);
  ok(info.nj >= 0 && info.mj >= 0 && info.nj2 >= 0, 'quiz: the lesson has a numeric question with hints, another numeric one and a multiple-choice one', info);
  const r1 = await p.evaluate(([sk, L, nj, nj2]) => { const items = SUBJ[sk].lessons[L].qz, A = document.getElementById(sk + '-' + L), qs = () => [...A.querySelectorAll('section.quiz .q')];
    const q = qs()[nj]; q.querySelector('[data-h]').click(); q.querySelector('.num input').value = String(items[nj].n); q.querySelector('.num .btn').click();
    const q2 = qs()[nj2]; q2.querySelector('.num input').value = String(items[nj2].n); q2.querySelector('.num .btn').click();
    const id = sk + '_' + L + '_' + nj, h = Store.x('h', id), v = lessonLevel(sk, L);
    return { hd: h && h.hd, days: h && h.d, okDays: okDays(id).size, ok1: v.ok1, saved: Store.get(id), fb: q.querySelector('.fb').textContent }; }, [sk, L, info.nj, info.nj2]);
  ok(r1.hd === '2026-11-10' && r1.days.length === 0 && r1.okDays === 0 && r1.ok1 >= 1 && r1.saved.hi >= 1, 'quiz: a correct answer after a hint counts for Practised, not as a mastery day', r1);
  ok(/You used a hint/.test(r1.fb), 'quiz: the feedback says that the hint keeps it from counting as a mastery day', r1.fb);
  /* two days later the numeric answers are not filled in */
  await at(p, '2026-11-12T10:00:00');
  const r2 = await p.evaluate(([sk, L, nj, nj2]) => { document.getElementById(sk + '-' + L).remove(); goLesson(sk, L); const A = document.getElementById(sk + '-' + L), qs = [...A.querySelectorAll('section.quiz .q')];
    return [nj, nj2].map(j => ({ value: qs[j].querySelector('.num input').value, note: qs[j].querySelector('.fb').textContent })); }, [sk, L, info.nj, info.nj2]);
  ok(r2.every(x => x.value === '' && /^Correct on /.test(x.note)), 'quiz: on a later day a correct numeric answer is not filled in', r2);
  ok(/with a hint/.test(r2[0].note) && /without a hint/.test(r2[0].note), 'quiz: the note asks to solve it again without the hint', r2[0].note);
  /* a wrong multiple-choice answer: Try again resets only that answer and keeps its spaced repetition */
  const r3 = await p.evaluate(([sk, L, mj]) => { const items = SUBJ[sk].lessons[L].qz, A = document.getElementById(sk + '-' + L), qs = () => [...A.querySelectorAll('section.quiz .q')], id = sk + '_' + L + '_' + mj;
    [...qs()[mj].querySelectorAll('.op')].find(o => o.innerHTML !== optLbl(items[mj], items[mj].a)).click();
    const sr0 = !!Store.sr(id), tb = [...qs()[mj].querySelectorAll('button')].find(x => /Try again/.test(x.textContent));
    tb.click(); const fresh = !qs()[mj].dataset.done && Store.get(id) === null;
    [...qs()[mj].querySelectorAll('.op')].find(o => o.innerHTML === optLbl(items[mj], items[mj].a)).click();
    const h = Store.x('h', id); return { sr0, fresh, sr1: !!Store.sr(id), saved: Store.get(id) && Store.get(id).ok, masteryDay: h.d.includes(today()) }; }, [sk, L, info.mj]);
  ok(r3.sr0 && r3.fresh && r3.sr1 && r3.saved === 1 && !r3.masteryDay, 'quiz: Try again clears only that answer; its spaced repetition stays and the retry adds no mastery day', r3);
  /* the lesson clear: one tap arms it, a second one clears the answers; spaced repetition stays */
  const tap = () => p.evaluate(([sk, L]) => { const b = [...document.getElementById(sk + '-' + L).querySelectorAll('section.quiz button')].find(x => /Clear my answers|Select again to clear/.test(x.textContent)); b.click(); return b.textContent; }, [sk, L]);
  const cnt = () => p.evaluate(([sk, L]) => ({ a: SUBJ[sk].lessons[L].qz.filter((_, j) => Store.get(sk + '_' + L + '_' + j)).length, s: Store.srAll().filter(([k]) => k.startsWith(sk + '_' + L + '_')).length }), [sk, L]);
  const c0 = await cnt();
  const t1 = await tap();
  const c1 = await cnt();
  ok(/Select again/.test(t1) && c1.a === c0.a && c0.a > 0, 'clear: the first tap only asks for a second one', { t1, c0, c1 });
  await ff(p, 1000);
  await tap();
  const c2 = await cnt();
  ok(c2.a === 0 && c2.s === c0.s && c0.s > 0, 'clear: the second tap clears the answers and keeps spaced repetition', { c0, c2 });
  ok(!errs.length, 'quiz: no page errors', errs);
  await ctx.close();
}

/* ----- 4. generators: a missed calculation comes back with new numbers ----- */
async function generators(b) {
  const { ctx, p, errs } = await open(b, '2026-11-10T10:00:00');
  const g = await p.evaluate(() => { const ids = Object.keys(GEN).flatMap(sk => genList(sk).map(x => x.id)), id = genList('mom').find(x => x.L === 2).id;
    srMark(id, false); onAnswer(id, false, { sk: 'mom', L: 2, v: '3.0' });
    const qs = new Set();for (let i = 0; i < 6; i++) qs.add(qItem(id).it.q);
    return { n: ids.length, unique: new Set(ids).size, ok: ids.every(x => /^[a-z]+_\d+_g\d+$/.test(x)), id, x: qItem(id), distinct: qs.size, h: Store.x('h', id) }; });
  ok(g.n > 0 && g.unique === g.n && g.ok, 'generators: every generator has its own id unit_lesson_g<k>', g.n);
  ok(g.x && g.x.gen === 1 && g.x.L === 2 && g.x.id === g.id && typeof g.x.it.n === 'number', 'generators: the id gives a question of that lesson', g.x && g.x.id);
  ok(g.distinct >= 2, 'generators: the question comes with new numbers', g.distinct);
  ok(g.h && g.h.m === 1, 'generators: a miss is kept in the history', g.h);
  await ff(p, D + H);
  const due = await p.evaluate(id => dueAll().includes(id), g.id);
  ok(due, 'generators: one day later the missed calculation is due in the review queue');
  ok(!errs.length, 'generators: no page errors', errs);
  await ctx.close();
}

/* ----- 5. the daily challenge counts once a day and continues where it stopped ----- */
async function daily(b) {
  const { ctx, p, errs } = await open(b, '2026-11-10T10:00:00');
  await p.evaluate(() => { ['mom', 'th'].forEach(sk => [0, 1].forEach(L => { const n = SUBJ[sk].lessons[L].qz.length; for (let j = 0; j < n; j += 2) { const id = sk + '_' + L + '_' + j; onAnswer(id, j % 4 === 0, { sk, L }); } })); tabSeg.set(0); showTab(0); });
  const card = () => p.evaluate(() => { const c = [...document.querySelectorAll('#home-0 .card')].find(c => /Daily challenge/.test((c.querySelector('h3') || {}).textContent || '')); return c ? c.innerText.replace(/\s+/g, ' ') : ''; });
  const answer = k => p.evaluate(async k => { const c = [...document.querySelectorAll('#home-0 .card')].find(c => /Daily challenge/.test((c.querySelector('h3') || {}).textContent || ''));
    c.querySelector('.row .btn').click();
    for (let i = 0; i < k; i++) { const q = c.querySelector('.q'); if (!q) break; const op = q.querySelector('.op'); if (op) op.click(); else { q.querySelector('.num input').value = '1'; q.querySelector('.num .btn').click(); }
      const nx = [...c.querySelectorAll('.row .btn')].find(x => /Next|Finish/.test(x.textContent)); nx.click(); } }, k);
  ok(/Start the daily challenge/.test(await card()), 'daily: a challenge is offered', await card());
  await answer(2);
  await p.evaluate(() => homeRender(document.getElementById('home-0')));
  const mid = await card();
  ok(/You answered 2 of 5/.test(mid) && /3 questions/.test(mid), 'daily: after 2 answers and a redraw it continues where it stopped', mid);
  await answer(3);
  const n1 = await p.evaluate(() => gN('dailyN'));
  await p.evaluate(() => homeRender(document.getElementById('home-0')));
  const done = await card(), n2 = await p.evaluate(() => gN('dailyN'));
  ok(n1 === 1 && n2 === 1 && /Done for today/.test(done), 'daily: it counts once when finished, also after a redraw', { n1, n2, done });
  await ff(p, D);
  await p.evaluate(() => homeRender(document.getElementById('home-0')));
  ok(/Start the daily challenge/.test(await card()), 'daily: the next day a new challenge is offered');
  ok(!errs.length, 'daily: no page errors', errs);
  await ctx.close();
}

/* ----- 6. the weekly goal and the streak across a week boundary (Monday to Sunday) ----- */
async function week(b) {
  const { ctx, p, errs } = await open(b, '2026-11-06T10:00:00');
  const study = () => p.evaluate(() => markStudy());
  const st = () => p.evaluate(() => ({ day: today(), wk: weekCount(weekStart(new Date())), streak: streakNow(), met: totalWeeksMet(), row: weeksInRow() }));
  for (let i = 0; i < 3; i++) { await study(); if (i < 2) await ff(p, D); }
  let s = await st();
  ok(s.day === '2026-11-08' && s.wk === 3 && s.streak === 3 && s.met === 0, 'week: Friday to Sunday are 3 days of the week of Nov 2', s);
  await ff(p, D);
  await study();
  s = await st();
  ok(s.day === '2026-11-09' && s.wk === 1 && s.streak === 4, 'week: Monday starts a new week; the streak goes on', s);
  for (let i = 0; i < 3; i++) { await ff(p, D); await study(); }
  s = await st();
  ok(s.day === '2026-11-12' && s.wk === 4 && s.streak === 7 && s.met === 1 && s.row === 1, 'week: 4 days in the week of Nov 9 meet the goal; streak 7', s);
  await ff(p, 2 * D);
  s = await st();
  ok(s.day === '2026-11-14' && s.streak === 0 && s.row === 1, 'week: a missed day ends the streak but not the met week', s);
  ok(!errs.length, 'week: no page errors', errs);
  await ctx.close();
}

/* ----- 7. a page left open past midnight redraws what depends on the date ----- */
async function midnight(b) {
  const { ctx, p, errs } = await open(b, '2026-11-10T10:00:00');
  const sk = 'th', L = 1;
  const nj = await p.evaluate(([sk, L]) => { goLesson(sk, L); const items = SUBJ[sk].lessons[L].qz, j = items.findIndex(it => !it.o), q = document.querySelectorAll('#' + sk + '-' + L + ' section.quiz .q')[j];
    q.querySelector('.num input').value = String(items[j].n); q.querySelector('.num .btn').click(); return j; }, [sk, L]);
  await at(p, '2026-11-11T23:58:00');
  const before = await p.evaluate(([sk, L, j]) => { document.getElementById(sk + '-' + L).remove(); goLesson(sk, L); tabSeg.set(0); showTab(0);
    return { lede: document.querySelector('#home-0 .lede').textContent, value: document.querySelectorAll('#' + sk + '-' + L + ' section.quiz .q')[j].querySelector('.num input').value }; }, [sk, L, nj]);
  await ff(p, 3 * 60e3);
  const after = await p.evaluate(([sk, L, j]) => ({ today: today(), lede: document.querySelector('#home-0 .lede').textContent, value: document.querySelectorAll('#' + sk + '-' + L + ' section.quiz .q')[j].querySelector('.num input').value }), [sk, L, nj]);
  ok(before.value !== '' && after.value === '', 'midnight: the open quiz stops filling in yesterday-but-one answer after midnight', { before: before.value, after: after.value });
  ok(after.today === '2026-11-12' && after.lede !== before.lede && /12/.test(after.lede), 'midnight: the Today page shows the new date', { before: before.lede, after: after.lede });
  ok(!errs.length, 'midnight: no page errors', errs);
  await ctx.close();
}

/* ----- 8. clears are cut-offs: an older entry that arrives later from another copy stays cleared ----- */
async function clears(b) {
  const { ctx, p, errs } = await open(b, '2026-11-10T10:00:00');
  const r = await p.evaluate(() => {
    const KEY = Object.keys(localStorage).find(k => { try { const o = JSON.parse(localStorage.getItem(k)); return o && typeof o === 'object' && o.a && o.h; } catch (e) { return false; } });
    const t0 = Date.now();
    Store.set('th_1_0', { v: '1', ok: 1 }); srMark('th_2_0', false); Store.set('th_2_0', { v: 0, ok: 0 });
    const old = JSON.parse(localStorage.getItem(KEY));
    Store.clear(clearScope('u:th'), 'u:th');
    const lessonOld = JSON.parse(localStorage.getItem(KEY));
    /* another copy (a tab or device that has not seen the clear) sends an older answer, then a newer one */
    const send = o => dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: JSON.stringify(o) }));
    const o1 = JSON.parse(JSON.stringify(old)); o1.a['th_1_0'] = { v: '2', ok: 1, t: t0 - 5000 }; delete o1.c; send(o1);
    const keptOut = Store.get('th_1_0');
    const o2 = JSON.parse(localStorage.getItem(KEY)); o2.a['th_1_0'] = { v: '3', ok: 1, t: Date.now() + 1000 }; send(o2);
    const newer = Store.get('th_1_0');
    /* the lesson clear keeps spaced repetition: an older spaced-repetition entry from another copy is not cut by it */
    srMark('eq_1_0', false); Store.set('eq_1_0', { v: 0, ok: 0 });
    Store.clear(clearScope('l:eq_1'), 'l:eq_1');
    const afterLesson = { a: Store.get('eq_1_0'), s: !!Store.sr('eq_1_0') };
    return { KEY: !!KEY, keptOut, newer: newer && newer.v, afterLesson };
  });
  ok(r.KEY, 'clears: the saved copy is found in localStorage');
  ok(r.keptOut === null, 'clears: an answer older than a section clear stays cleared when another copy sends it later', r.keptOut);
  ok(r.newer === '3', 'clears: an answer newer than the clear is taken', r.newer);
  ok(r.afterLesson.a === null && r.afterLesson.s, 'clears: the lesson clear removes the answers and keeps spaced repetition', r.afterLesson);
  ok(!errs.length, 'clears: no page errors', errs);
  await ctx.close();
}

/* ----- 9. the review queue, the mistake log, the cache and numerical response ----- */
async function queue(b) {
  const { ctx, p, errs } = await open(b, '2026-11-10T10:00:00');
  await p.evaluate(() => { [['mom', 1, 'mom_1_r0', 1], ['ns', 3, 'ns_3_r1', 2], ['th', 1, 'th_1_0', '12']].forEach(([sk, L, id, v]) => { srMark(id, false); onAnswer(id, false, { sk, L, v }); });
    onAnswer('ns_3_r1', true, { sk: 'ns', L: 3 }); });
  await ff(p, D + H);
  const q = await p.evaluate(() => { tabSeg.set(0); showTab(0); const c = [...document.querySelectorAll('#home-0 .card')].find(c => /^\s*Review/.test((c.querySelector('h3') || {}).textContent || ''));
    const tab = document.querySelector('#tabs [role=tab]'), log = mistakes();
    return { due: dueAll().length, text: c ? c.innerText.replace(/\s+/g, ' ') : '', dot: tab.classList.contains('tdue'), aria: tab.getAttribute('aria-label') || '',
      log: log.map(r => ({ id: r.id, fixed: r.fixed, va: r.va })), h: Store.x('h', 'th_1_0') }; });
  ok(q.due === 3 && /3 questions are due/.test(q.text) && /from 3 sections/.test(q.text), 'queue: the Today page lists the due questions of every section', q.text);
  ok(q.dot && /3 review questions due/.test(q.aria), 'queue: the Today tab dot names the due questions', q.aria);
  ok(q.h && q.h.l === 0 && q.h.lv === '12' && q.h.lm > 0, 'mistakes: a miss keeps the latest result, the wrong answer and its time', q.h);
  ok(q.log.length === 3 && q.log.find(r => r.id === 'ns_3_r1').fixed && !q.log.find(r => r.id === 'th_1_0').fixed, 'mistakes: the log lists each missed question and marks one answered right since as fixed', q.log);
  /* one round from the queue: one question from each section */
  const round = await p.evaluate(() => { const c = [...document.querySelectorAll('#home-0 .card')].find(c => /^\s*Review/.test((c.querySelector('h3') || {}).textContent || '')); c.querySelector('.row .btn').click();
    const secs = []; for (let i = 0; i < 5 && c.querySelector('.q'); i++) { secs.push(c.querySelector('p.hint').textContent.split(' · ')[0]); const op = c.querySelector('.q .op'); if (op) op.click(); else { c.querySelector('.num input').value = '1'; c.querySelector('.num .btn').click(); }
      [...c.querySelectorAll('.row .btn')].find(x => /Next|Finish/.test(x.textContent)).click(); } return { secs, left: dueAll().length }; });
  ok(round.secs.length === 3 && new Set(round.secs).size === 3 && round.left === 0, 'queue: a round mixes the sections and clears the due list', round);
  const again = await p.evaluate(() => { goLesson('th', 1); tabSeg.set(0); showTab(0); const c = [...document.querySelectorAll('#home-0 .card')].find(c => /^\s*Review/.test((c.querySelector('h3') || {}).textContent || '')); return c ? c.innerText.replace(/\s+/g, ' ') : ''; });
  ok(/Nothing is due now/.test(again), 'queue: the card is drawn again when the Today page is shown again', again);
  /* the lessonLevel cache gives the same levels as the raw computation */
  const same = await p.evaluate(() => ORDER.every(k => SUBJ[k].lessons.every((le, L) => !le.qz || JSON.stringify(lessonLevel(k, L)) === JSON.stringify(lessonLevel0(k, L)))));
  ok(same, 'cache: every cached lesson level equals the raw one');
  /* numerical response: the key in the boxes, plus or minus one in the last box; codes; the Biology exams */
  const nr = await p.evaluate(() => { const it = { n: 37.7, u: 'J' }, sp = nrSpec(37.7), code = { code: '2514', n: 2514, tol: 0, abs: 0 }, any = { code: '457', any: 1, n: 457, tol: 0, abs: 0 };
    const exams = ['ns', 'sn', 'en', 'ri1'].map(sk => { goLesson(sk, SUBJ[sk].lessons.findIndex(l => l.rv)); const c = [...document.querySelectorAll('.lesson:not([hidden]) .card')].find(c => /Timed unit exam/.test(c.textContent)); return c ? c.querySelector('p').textContent : ''; });
    return { key: [37.6, 37.7, 37.8, 37.5, 37.9].map(v => nrOK(sp, v, it)), code: [nrOK(nrOf(code), '2514', code), nrOK(nrOf(code), '2513', code), nrOK(nrOf(any), '745', any)], exams }; });
  ok(JSON.stringify(nr.key) === '[true,true,true,false,false]', 'exam: four boxes take the key give or take 1 in the last box', nr.key);
  ok(JSON.stringify(nr.code) === '[true,false,true]', 'exam: a code answer is exact, or in any order when the item allows it', nr.code);
  ok(nr.exams.slice(0, 3).every(t => /^10 multiple-choice/.test(t) && /4 numeric-response/.test(t)) && /^14 multiple-choice/.test(nr.exams[3]) && !/numeric-response/.test(nr.exams[3]), 'exam: Biology exams have 4 numerical-response questions, Social Studies none', nr.exams);
  const dip = await p.evaluate(() => DIP.map(d => { const it = dipPick(d, 20), us = new Set(dipUnits(d)); return { mc: it.filter(x => x.kind === 'mc' && x.it.o).length, nr: it.filter(x => x.kind === 'nr' && nrOf(x.it) || x.gen).length, n: it.length, inCourse: it.every(x => us.has(x.sk)) }; }));
  ok(dip.every(x => x.n === 20 && x.inCourse) && dip.map(x => x.nr).join() === '6,5,4', 'exam: a diploma practice exam of 20 has the diploma ratio of numerical response (Physics 6, Chemistry 5, Biology 4) from its course only', dip);
  ok(!errs.length, 'queue: no page errors', errs);
  await ctx.close();
}

(async () => {
  const t0 = Date.now();
  const browser = await pw.chromium.launch();
  try {
    for (const t of [schedule, mastery, quiz, generators, daily, week, midnight, clears, queue]) {
      try { await t(browser); } catch (e) { ok(false, t.name + ': ' + String(e && e.message || e).split('\n')[0]); }
    }
  } finally { await browser.close(); }
  console.log(`srs.test.js: ${count - fails.length} of ${count} checks passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(fails.length ? 1 : 0);
})();
