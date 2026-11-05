#!/usr/bin/env node
// Test 3, versus: (A) a full bot-vs-bot match with step() and the main backend: rounds end, the match ends with
// the right winner and score, garbage is sent, cancelled and raised (counters, 'G' cells, conservation), the
// incoming meters match the queues; (B) exact garbage rules on your board: delay, meter, rising, 8-line cap,
// hole per attack, messiness, cancel oldest first, send, top-out by garbage; (C) round flow with real keys
// and buttons: Enter / Next round, match result, restart, pause, Best of, Same pieces.
//   node versus.js [--seed 4] [--you 7] [--bot 6]
// With the real engine the levels must be close, or the weaker bot never gets garbage through (10 vs 3 sends 59 vs 0).
const {launch, open, main, opt} = require('./lib');

main('versus', async r => {
  const seed = +opt('seed', 4), you = +opt('you', 7), bot = +opt('bot', 6);
  const browser = await launch();

  // ---------- A: bot vs bot ----------
  {
    const {page, errors, context} = await open(browser, {seed});
    await page.fill('#botLevel', String(bot));
    const A = await page.evaluate(you => {
      const T = blockfallTest, q = s => document.querySelector(s), sum = a => a.reduce((x, y) => x + y, 0);
      T.setBackend('main'); T.humanBot(you);
      const m0 = T.botMismatch, s0 = T.botSpinMismatch, log = [], orig = window.topOut;
      // record each round end (test-only wrapper around the game's topOut)
      window.topOut = p => {
        const ps = T.players, f = k => ps.map(x => x[k]);
        log.push({loser: p.i, cause: p.cause, ms: T.playMs, alive: f('alive'), pieces: f('pieces'), attack: f('attack'), sent: f('sent'),
          cancelled: f('cancelled'), raised: f('raised'), left: ps.map(x => sum(x.inc.map(e => e.lines))), G: ps.map(x => x.board.flat().filter(v => v === 'G').length)});
        return orig(p);
      };
      q('#mVersus').click();
      const meter = {checks: 0, bad: 0, ready: 0, wait: 0, firstBad: null}, maxG = [0, 0];
      let n = 0;
      const t0 = performance.now();
      while (T.state !== 'done' && n++ < 7200) {
        T.step(500);
        T.players.forEach((p, i) => {
          let rd = 0, wt = 0;
          for (const e of p.inc) if (e.t <= 0) rd += e.lines; else wt += e.lines;
          const a = Math.min(rd, 20), b = Math.min(wt, 20 - a), el = q(i ? '#meter2' : '#meter');
          const h = [...el.children].map(c => parseFloat(c.style.height));
          meter.checks++;
          if (h[0] !== a * 5 || h[1] !== b * 5) { meter.bad++; meter.firstBad = meter.firstBad || {i, h, a, b}; }
          if (a) meter.ready++;
          if (b) meter.wait++;
          maxG[i] = Math.max(maxG[i], p.board.flat().filter(v => v === 'G').length);
        });
      }
      window.topOut = orig;
      return {state: T.state, vs: JSON.parse(JSON.stringify(T.vs)), log, meter, maxG, wall: Math.round(performance.now() - t0),
        mism: T.botMismatch - m0, spin: T.botSpinMismatch - s0, title: q('#ovTitle').textContent, text: q('#ovText').textContent,
        oppHidden: q('#opp').hidden, botName: q('#botName').textContent, overlay: !q('#overlay').hidden, nextHidden: q('#mNext').hidden};
    }, you);
    const {vs, log} = A;
    console.log('match:', JSON.stringify({state: A.state, wins: vs.wins, rounds: vs.round, wall: A.wall, maxG: A.maxG, meter: A.meter}));
    for (const l of log) console.log('  round end:', JSON.stringify(l));
    const need = (vs.bestOf + 1) / 2, w = vs.wins[0] === need ? 0 : 1;
    r.check('A: the match ends (state done)', A.state === 'done', A.state);
    r.check('A: winner has (bestOf + 1) / 2 wins, loser fewer', vs.wins[w] === need && vs.wins[1 - w] < need && vs.last === w, vs.wins);
    r.check('A: one log entry per round, rounds = wins total', log.length === vs.round && vs.round === vs.wins[0] + vs.wins[1], {log: log.length, round: vs.round});
    r.check('A: each round ends with the loser dead and the winner alive', log.every(l => !l.alive[l.loser] && l.alive[1 - l.loser]));
    r.check('A: round winners add up to the score', [0, 1].every(i => log.filter(l => l.loser !== i).length === vs.wins[i]));
    const tot = k => [0, 1].map(i => log.reduce((a, l) => a + l[k][i], 0));
    r.check('A: match totals = sum of rounds (pieces, attack, sent, cancelled, raised, time)',
      ['pieces', 'attack', 'sent', 'cancelled', 'raised'].every(k => [0, 1].every(i => vs.tot[i][k] === tot(k)[i])) && vs.tot.every(t => Math.abs(t.ms - log.reduce((a, l) => a + l.ms, 0)) < 1e-6),
      vs.tot);
    r.check('A: garbage was sent, cancelled and raised', tot('sent')[0] > 0 && tot('sent')[1] > 0 && tot('cancelled')[0] + tot('cancelled')[1] > 0 && tot('raised')[0] + tot('raised')[1] > 0,
      {sent: tot('sent'), cancelled: tot('cancelled'), raised: tot('raised')});
    r.check('A: garbage is conserved: sent = cancelled + raised + still waiting, each round',
      log.every(l => [0, 1].every(i => l.sent[i] === l.cancelled[1 - i] + l.raised[1 - i] + l.left[1 - i])));
    r.check('A: grey garbage cells appeared on the boards', A.maxG[0] + A.maxG[1] > 0, A.maxG);
    r.check('A: incoming meters always match the queues', A.meter.checks > 0 && A.meter.bad === 0, A.meter);
    r.check('A: meters showed both ready and waiting lines', A.meter.ready > 0 && A.meter.wait > 0, A.meter);
    const sc = `You ${vs.wins[0]} - ${vs.wins[1]} Bot`;
    const lines = vs.tot.map((t, i) => `${i ? 'Bot' : 'You'}: ${t.attack} attack, ${(t.attack / t.ms * 60000).toFixed(1)} APM, ${(t.pieces / t.ms * 1000).toFixed(2)} PPS, ${t.pieces} pieces`);
    r.check('A: result overlay: title, score and both totals', A.overlay && A.nextHidden && A.title === (w ? 'Bot wins the match' : 'You win the match') && A.text === [sc, ...lines].join('\n'), {title: A.title, text: A.text});
    r.check('A: opponent column shown with "Bot, level N"', !A.oppHidden && A.botName === `Bot, level ${bot}`, A.botName);
    r.check('A: botMismatch 0 and botSpinMismatch 0', A.mism === 0 && A.spin === 0, [A.mism, A.spin]);
    r.check('A: no page or console errors', !errors.length, errors.slice(0, 3));
    await context.close();
  }

  // ---------- B: exact garbage rules on your board (you idle, bot at level 1) ----------
  const {page, errors, context} = await open(browser, {seed: seed + 100});
  await page.fill('#botLevel', '1');
  await page.evaluate(() => blockfallTest.setBackend('main'));
  const B = await page.evaluate(() => {
    const T = blockfallTest, q = s => document.querySelector(s), out = {};
    q('#mVersus').click();
    const [P, O] = T.players;
    out.seeds = [P.seed, O.seed]; out.queues = [P.cur.t + P.queue.join(''), O.cur.t + O.queue.join('')];
    const clear = () => { for (let y = 0; y < 24; y++) P.board[y] = Array(10).fill(null); };
    const meter = id => [...q(id).children].map(e => parseFloat(e.style.height));
    const holes = (a, b) => P.board.slice(a, b).map(row => row.filter(v => v === 'G').length === 9 && row.indexOf(null) === row.lastIndexOf(null) ? row.indexOf(null) : 'bad');
    const counters = () => ({attack: P.attack, sent: P.sent, cancelled: P.cancelled, raised: P.raised});
    const delta = c => Object.fromEntries(Object.entries(counters()).map(([k, v]) => [k, v - c[k]]));
    // 1. the bot sends 3: one entry on your queue, waiting 500 ms, then ready
    O.send(3);
    out.entry = P.inc.map(e => ({lines: e.lines, t: e.t}));
    T.step(16); out.m16 = meter('#meter');
    T.step(464); out.t480 = P.inc[0].t; out.m480 = meter('#meter');
    T.step(32); out.m512 = meter('#meter');
    // 2. a lock that clears nothing raises it: 3 grey rows, one hole
    clear(); P.spawn('O');
    let c = counters(); const h = P.inc[0].hole;
    P.hardDrop();
    out.rise3 = {holes: holes(21, 24), h, d: delta(c), inc: P.inc.length, alive: P.alive, piece: P.board[19][4] + P.board[20][5]};
    // 3. at most 8 lines per lock, an attack may be split; the next attack has another hole
    clear(); P.inc = []; P.take(6); P.take(4); P.inc.forEach(e => e.t = 0);
    const [h1, h2] = P.inc.map(e => e.hole);
    P.spawn('O'); c = counters(); P.hardDrop();
    out.cap = {h1, h2, holes: holes(16, 24), d: delta(c), left: P.inc.map(e => [e.lines, e.hole])};
    P.spawn('O'); c = counters(); P.hardDrop();
    out.rest = {holes: holes(22, 24), d: delta(c), left: P.inc.length};
    // 4. messiness 100%: every line after the first moves its hole
    clear(); P.inc = []; cfg.messiness = 100; P.take(5); P.inc[0].t = 0; const hm = P.inc[0].hole;
    P.spawn('O'); P.hardDrop(); cfg.messiness = 0;
    out.messy = {first: hm, holes: holes(19, 24)};
    // 5. a quad (4 attack) cancels 2 incoming lines and sends 2
    const quad = () => { clear(); for (let y = 20; y < 24; y++) for (let x = 1; x < 10; x++) P.board[y][x] = 'L'; P.board[10][6] = 'T'; P.spawn('I'); P.rotate(1); while (P.shift(-1)); P.hardDrop(); };
    P.inc = []; P.take(2); c = counters(); const oBefore = O.inc.length;
    quad();
    out.cancelSend = {d: delta(c), inc: P.inc.length, oNew: O.inc.length - oBefore, oEntry: O.inc.length ? {lines: O.inc[O.inc.length - 1].lines, t: O.inc[O.inc.length - 1].t} : null};
    // 6. a bigger attack cancels the oldest entry first, then part of the next
    P.inc = []; P.take(3); P.take(3); const hb = P.inc[1].hole; c = counters();
    quad();
    out.oldest = {d: delta(c), left: P.inc.map(e => [e.lines, e.hole]), hb};
    // 7. a rising row that pushes blocks above the top tops you out: the bot wins the round
    clear(); for (let y = 1; y < 24; y++) P.board[y][0] = 'J';
    P.inc = []; P.take(8); P.inc[0].t = 0; P.spawn('O'); P.hardDrop();
    out.top = {state: T.state, alive: P.alive, cause: P.cause, wins: T.vs.wins.slice(), last: T.vs.last, round: T.vs.round,
      title: q('#ovTitle').textContent, text: q('#ovText').textContent, next: !q('#mNext').hidden, overlay: !q('#overlay').hidden};
    return out;
  });
  console.log('B:', JSON.stringify(B));
  r.check('B: same pieces: both players share the round seed and queue', B.seeds[0] === B.seeds[1] && B.queues[0] === B.queues[1], B.queues);
  r.check('B: an attack becomes one entry with a 500 ms delay', JSON.stringify(B.entry) === '[{"lines":3,"t":500}]', B.entry);
  r.check('B: meter shows 3 waiting lines (15%), then 3 ready lines', B.m16.join() === '0,15' && B.m480.join() === '0,15' && B.t480 === 20 && B.m512.join() === '15,0', [B.m16, B.m480, B.t480, B.m512]);
  r.check('B: a lock that clears nothing raises the ready lines, one hole each attack', B.rise3.holes.every(x => x === B.rise3.h) && B.rise3.d.raised === 3 && B.rise3.inc === 0 && B.rise3.alive && B.rise3.piece === 'OO', B.rise3);
  r.check('B: at most 8 lines a lock; the split attack keeps its hole, attacks get different holes',
    B.cap.h1 !== B.cap.h2 && B.cap.holes.join() === [...Array(6).fill(B.cap.h1), B.cap.h2, B.cap.h2].join() && B.cap.d.raised === 8 && JSON.stringify(B.cap.left) === JSON.stringify([[2, B.cap.h2]]), B.cap);
  r.check('B: the next lock raises the rest of a split attack', B.rest.d.raised === 2 && B.rest.left === 0 && B.rest.holes.every(x => x === B.cap.h2), B.rest);
  r.check('B: messiness 100%: each line after the first moves its hole', B.messy.holes[0] === B.messy.first && B.messy.holes.every((x, i) => x !== 'bad' && (!i || x !== B.messy.holes[i - 1])), B.messy);
  r.check('B: quad (4 attack) cancels 2 incoming lines, sends 2 to the bot as one 500 ms entry',
    B.cancelSend.d.attack === 4 && B.cancelSend.d.cancelled === 2 && B.cancelSend.d.sent === 2 && B.cancelSend.inc === 0 && B.cancelSend.oNew === 1 && B.cancelSend.oEntry.lines === 2 && B.cancelSend.oEntry.t === 500, B.cancelSend);
  r.check('B: cancelling takes the oldest entry first, nothing is sent while incoming lines remain',
    B.oldest.d.attack === 5 && B.oldest.d.cancelled === 5 && B.oldest.d.sent === 0 && JSON.stringify(B.oldest.left) === JSON.stringify([[1, B.oldest.hb]]), B.oldest);
  r.check('B: garbage pushing blocks above the top tops you out', !B.top.alive && B.top.cause === 'garbage' && B.top.state === 'round', B.top);
  r.check('B: the bot wins the round: score and round overlay with Next round', B.top.wins.join() === '0,1' && B.top.last === 1 && B.top.title === 'Bot wins round\u00a01'
    && B.top.text === 'You 0 - 1 Bot. First to 2 wins. Press Enter for the next round.' && B.top.next && B.top.overlay, B.top);

  // ---------- C: round flow with keys and buttons ----------
  const S = () => page.evaluate(() => {
    const T = blockfallTest, q = s => document.querySelector(s), [P, O] = T.players;
    return {state: T.state, round: T.vs && T.vs.round, wins: T.vs && T.vs.wins.slice(), bestOf: T.vs && T.vs.bestOf, seeds: T.players.map(p => p.seed),
      queues: T.players.map(p => p.cur.t + p.queue.join('')), pieces: T.players.map(p => p.pieces), alive: T.players.map(p => p.alive),
      playMs: T.playMs, title: q('#ovTitle').textContent, text: q('#ovText').textContent, overlay: !q('#overlay').hidden, next: !q('#mNext').hidden,
      blurred: document.activeElement === document.body, n: T.players.length};
  });
  const kill = () => page.evaluate(() => {
    const P = blockfallTest.players[0];
    for (let y = 0; y < 24; y++) P.board[y] = Array.from({length: 10}, (_, x) => y && !x ? 'J' : null);
    P.inc = []; P.take(8); P.inc[0].t = 0; P.spawn('O'); P.hardDrop();
  });
  await page.keyboard.press('Enter');
  let s = await S();
  r.check('C: Enter starts round 2 with fresh boards', s.state === 'play' && s.round === 2 && s.pieces.join() === '0,0' && s.alive.every(Boolean) && !s.overlay && !s.next, s);
  r.check('C: same pieces again, with a new seed each round', s.seeds[0] === s.seeds[1] && s.queues[0] === s.queues[1] && s.seeds[0] !== B.seeds[0], s.seeds);
  await kill();
  s = await S();
  const tot = await page.evaluate(() => blockfallTest.vs.tot.map(t => ({...t})));
  const totText = tot.map((t, i) => `${i ? 'Bot' : 'You'}: ${t.attack} attack, ${(t.ms > 1000 ? t.attack / t.ms * 60000 : 0).toFixed(1)} APM, ${(t.ms > 1000 ? t.pieces / t.ms * 1000 : 0).toFixed(2)} PPS, ${t.pieces} pieces`);
  r.check('C: losing round 2 of best of 3 ends the match: bot wins 2 - 0', s.state === 'done' && s.wins.join() === '0,2' && s.title === 'Bot wins the match'
    && s.text === ['You 0 - 2 Bot', ...totText].join('\n') && !s.next && s.overlay, {title: s.title, text: s.text});
  await page.keyboard.press('Enter');
  s = await S();
  r.check('C: Enter after the match starts a new match', s.state === 'play' && s.round === 1 && s.wins.join() === '0,0', s);
  await page.selectOption('#bestOf', '5');
  s = await S();
  r.check('C: Best of change waits for the next match', s.bestOf === 3 && await page.evaluate(() => cfg.bestOf) === 5);
  await page.$eval('#bestOf', el => el.blur());
  await page.keyboard.press('KeyR');
  s = await S();
  r.check('C: restart key starts a new best-of-5 match', s.state === 'play' && s.round === 1 && s.bestOf === 5, s);
  await kill();
  s = await S();
  r.check('C: round overlay in best of 5 says first to 3', s.state === 'round' && s.text === 'You 0 - 1 Bot. First to 3 wins. Press Enter for the next round.' && s.next, s.text);
  await page.click('#mNext');
  s = await S();
  r.check('C: Next round button starts round 2 and blurs', s.state === 'play' && s.round === 2 && s.blurred, s);
  await page.keyboard.press('Escape');
  const p1 = await S();
  await page.evaluate(() => blockfallTest.step(3000));
  await page.waitForTimeout(600);
  const p2 = await S();
  r.check('C: pause stops both players and the clock', p1.state === 'pause' && p2.state === 'pause' && p2.pieces.join() === p1.pieces.join() && p2.playMs === p1.playMs && p1.overlay, [p1.pieces, p2.pieces, p1.playMs, p2.playMs]);
  await page.keyboard.press('Escape');
  await page.evaluate(() => blockfallTest.step(3000));
  const p3 = await S();
  r.check('C: after resume the bot plays on', p3.state === 'play' && p3.pieces[1] > p2.pieces[1], p3.pieces);
  await kill();
  await page.keyboard.press('KeyR');
  s = await S();
  r.check('C: restart key between rounds starts a new match', s.state === 'play' && s.round === 1 && s.wins.join() === '0,0', s);
  await page.click('#samePieces');
  await page.keyboard.press('KeyR');
  s = await S();
  r.check('C: Same pieces off: different seeds and queues', s.seeds[0] !== s.seeds[1] && s.queues[0] !== s.queues[1] && await page.evaluate(() => cfg.samePieces) === false, s.queues);
  r.check('C: two players and the opponent column in versus', s.n === 2 && await page.isVisible('#opp') && await page.textContent('#botName') === 'Bot, level 1');
  await page.keyboard.press('Escape'); await page.click('#mMarathon');
  r.check('C: Marathon after versus hides the opponent and has one player', await page.isHidden('#opp') && (await S()).n === 1);
  r.check('B/C: no page or console errors', !errors.length, errors.slice(0, 3));
  await context.close();
  await browser.close();
});
