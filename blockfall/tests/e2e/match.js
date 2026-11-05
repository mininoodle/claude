#!/usr/bin/env node
// New test a: bot vs bot with the real engine, step() and the main backend. The bot (player 1) plays at level 10,
// player 0 is driven by humanBot(5). Best-of-7 matches are played until both controllers together have placed at
// least 400 pieces. Checks: mismatch 0 for each controller, garbage sent / cancelled / raised and conserved,
// each round's loser topped out, the right match winner and score in vs and in the result overlay.
//   node match.js [--seed 4] [--bot 10] [--you 5] [--best 7] [--min 400]
const {launch, open, main, opt} = require('./lib');

main('match', async r => {
  const seed = +opt('seed', 4), bot = +opt('bot', 10), you = +opt('you', 5), best = opt('best', '7'), min = +opt('min', 400);
  const browser = await launch();
  const {page, errors, context} = await open(browser, {seed});
  await page.fill('#botLevel', String(bot));
  await page.selectOption('#bestOf', best);
  const t0 = Date.now();
  const R = await page.evaluate(([you, min]) => {
    const T = blockfallTest, q = s => document.querySelector(s), sum = a => a.reduce((x, y) => x + y, 0);
    // per controller: plans, checked drops, mismatches (the game's counters split by the bot that moved), holds, spins
    const C = [0, 1].map(() => ({plans: 0, dead: 0, holds: 0, spins: 0, stops: 0, shallow: 0, drops: 0, mism: 0, spin: 0}));
    const ot = Bot.prototype.tick, op = Bot.prototype.plan;
    Bot.prototype.tick = function () {
      const m = T.botMismatch, s = T.botSpinMismatch, n = this.p.pieces;
      ot.call(this);
      const c = C[this.p.i];
      c.mism += T.botMismatch - m; c.spin += T.botSpinMismatch - s; c.drops += this.p.pieces - n;
    };
    Bot.prototype.plan = function (x) {
      const c = C[this.p.i];
      if (this.req && x.id === this.id) { c.plans++; if (x.dead) c.dead++; if (x.hold) c.holds++; if (x.expect && x.expect.spin) c.spins++; if (x.stop) c.stops++; if (x.depth < Math.min(7, [0, 1, 1, 1, 2, 3, 4, 5, 6, 7, 7][this.level])) c.shallow++; }
      return op.call(this, x);
    };
    const log = [], orig = window.topOut;
    window.topOut = p => {
      const ps = T.players, f = k => ps.map(x => x[k]);
      log.push({match: matches.length, round: T.vs.round, loser: p.i, cause: p.cause, ms: T.playMs, alive: f('alive'), pieces: f('pieces'), attack: f('attack'),
        sent: f('sent'), cancelled: f('cancelled'), raised: f('raised'), left: ps.map(x => sum(x.inc.map(e => e.lines))), G: ps.map(x => x.board.flat().filter(v => v === 'G').length)});
      return orig(p);
    };
    T.setBackend('main'); T.humanBot(you);
    const matches = [];
    let pieces = 0;
    while (pieces < min && matches.length < 6) {
      q('#mVersus').click();
      let n = 0;
      while (T.state !== 'done' && n++ < 7200) T.step(500);
      const vs = JSON.parse(JSON.stringify(T.vs));
      matches.push({state: T.state, vs, title: q('#ovTitle').textContent, text: q('#ovText').textContent, overlay: !q('#overlay').hidden, next: !q('#mNext').hidden, botName: q('#botName').textContent});
      pieces += vs.tot[0].pieces + vs.tot[1].pieces;
    }
    window.topOut = orig; Bot.prototype.tick = ot; Bot.prototype.plan = op;
    return {matches, log, C, pieces, backend: T.backend, mism: T.botMismatch, spin: T.botSpinMismatch};
  }, [you, min]);
  const wall = Date.now() - t0;
  const {matches, log, C} = R;
  for (const m of matches) console.log(`match: wins ${m.vs.wins} rounds ${m.vs.round} totals ${JSON.stringify(m.vs.tot)}`);
  for (const l of log) console.log('  round end:', JSON.stringify(l));
  console.log('controllers:', JSON.stringify(C), 'wall', wall, 'ms');

  r.check(`at least ${min} bot pieces in total, main backend`, R.pieces >= min && R.backend === 'main', {pieces: R.pieces, matches: matches.length, wall});
  for (const i of [0, 1]) {
    const c = C[i], name = i ? `bot (level ${bot})` : `humanBot (level ${you})`;
    r.check(`${name}: botMismatch 0 and botSpinMismatch 0 over ${c.drops} checked drops`, c.mism === 0 && c.spin === 0 && c.drops > 100 && c.dead === 0, c);
  }
  r.check('game counters agree: botMismatch 0, botSpinMismatch 0', R.mism === 0 && R.spin === 0, [R.mism, R.spin]);
  r.check(`level ${bot} planned T-spins and holds (the spin check is not empty)`, C[1].spins > 0 && C[1].holds > 0, {spins: C[1].spins, holds: C[1].holds});

  const tot = (k, i) => matches.reduce((a, m) => a + m.vs.tot[i][k], 0);
  const g = k => [tot(k, 0), tot(k, 1)];
  console.log('garbage: sent', g('sent'), 'cancelled', g('cancelled'), 'raised', g('raised'));
  r.check('garbage sent by both sides', g('sent')[0] > 0 && g('sent')[1] > 0, {sent: g('sent')});
  r.check('incoming garbage cancelled by both sides', g('cancelled')[0] > 0 && g('cancelled')[1] > 0, {cancelled: g('cancelled')});
  r.check('garbage raised on both sides', g('raised')[0] > 0 && g('raised')[1] > 0, {raised: g('raised')});
  r.check('garbage is conserved each round, both ways: sent = cancelled + raised + still waiting on the other side',
    log.every(l => [0, 1].every(i => l.sent[i] === l.cancelled[1 - i] + l.raised[1 - i] + l.left[1 - i])), log.map(l => [l.sent, l.cancelled, l.raised, l.left]));
  r.check('grey garbage rows appeared', log.some(l => l.G[0] + l.G[1] > 0), log.map(l => l.G));

  matches.forEach((m, k) => {
    const vs = m.vs, need = (vs.bestOf + 1) / 2, w = vs.wins[0] === need ? 0 : 1, rounds = log.filter(l => l.match === k);
    r.check(`match ${k + 1}: ends, winner has ${need} wins and the loser fewer`, m.state === 'done' && vs.bestOf === +best && vs.wins[w] === need && vs.wins[1 - w] < need && vs.last === w, vs.wins);
    r.check(`match ${k + 1}: every round ends with the loser topped out and the winner alive; wins = rounds won`,
      rounds.length === vs.round && rounds.every(l => !l.alive[l.loser] && l.alive[1 - l.loser] && ['block', 'lock', 'garbage'].includes(l.cause))
      && [0, 1].every(i => rounds.filter(l => l.loser !== i).length === vs.wins[i]), rounds.map(l => [l.loser, l.cause]));
    r.check(`match ${k + 1}: totals = sum of its rounds`, ['pieces', 'attack', 'sent', 'cancelled', 'raised'].every(f => [0, 1].every(i => vs.tot[i][f] === rounds.reduce((a, l) => a + l[f][i], 0))), vs.tot);
    const sc = `You ${vs.wins[0]} - ${vs.wins[1]} Bot`;
    const lines = vs.tot.map((t, i) => `${i ? 'Bot' : 'You'}: ${t.attack} attack, ${(t.attack / t.ms * 60000).toFixed(1)} APM, ${(t.pieces / t.ms * 1000).toFixed(2)} PPS, ${t.pieces} pieces`);
    r.check(`match ${k + 1}: result overlay names the winner, the score and both totals`,
      m.overlay && !m.next && m.title === (w ? 'Bot wins the match' : 'You win the match') && m.text === [sc, ...lines].join('\n') && m.botName === `Bot, level ${bot}`, {title: m.title, text: m.text});
  });
  const strong = bot > you ? 1 : 0;
  r.check(`difficulty matters: level ${Math.max(bot, you)} wins every match against level ${Math.min(bot, you)}`, matches.every(m => m.vs.last === strong), matches.map(m => m.vs.wins));
  r.check('no page or console errors', !errors.length, errors.slice(0, 3));
  await context.close();
  await browser.close();
});
