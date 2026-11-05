#!/usr/bin/env node
// Test 1, rules parity (SPEC 4.7): humanBot(10) in Marathon, main backend, the inlined engine (the stub until
// integration), at least 500 pieces per seed. botMismatch and botSpinMismatch must stay 0.
//   node parity.js [--seeds 1,2,3] [--pieces 500] [--level 10]
// ENGINE=file.js swaps the engine at load time, GAME=file.html tests another copy of the game.
const {launch, open, main, opt} = require('./lib');

main('parity', async r => {
  const seeds = opt('seeds', '1,2,3').split(',').map(Number), pieces = +opt('pieces', 500), level = +opt('level', 10);
  const browser = await launch();
  const total = {placed: 0, mism: 0, spin: 0, spinsPlanned: 0, tPieces: 0, holds: 0};
  for (const seed of seeds) {
    const {page, errors, context} = await open(browser, {seed});
    const res = await page.evaluate(([pieces, level]) => {
      const T = blockfallTest, q = s => document.querySelector(s);
      T.setBackend('main'); T.humanBot(level);
      q('#mMarathon').click();
      // count planned T-spins and T pieces, so the spin check is not empty
      const proto = T.bots[0].constructor.prototype, orig = proto.plan;
      let spinsPlanned = 0, tPieces = 0, holds = 0;
      proto.plan = function (res) { if (res.expect) { if (res.expect.spin) spinsPlanned++; if (res.expect.t === 'T') tPieces++; } if (res.hold) holds++; return orig.call(this, res); };
      const m0 = T.botMismatch, s0 = T.botSpinMismatch;
      let placed = 0, games = 0, topouts = 0, lines = 0, attack = 0, maxLevel = 1;
      while (placed < pieces && games < 20) {
        q('#mMarathon').click(); games++;
        const P = T.players[0];
        while (placed + P.pieces < pieces && T.state === 'play') T.step(1000);
        placed += P.pieces; lines += P.lines; attack += P.attack; maxLevel = Math.max(maxLevel, P.level);
        if (T.state === 'over') topouts++;
      }
      proto.plan = orig;
      return {placed, games, topouts, lines, attack, maxLevel, holds, spinsPlanned, tPieces, mism: T.botMismatch - m0, spin: T.botSpinMismatch - s0, backend: T.backend};
    }, [pieces, level]);
    console.log(`seed ${seed}:`, JSON.stringify(res));
    r.check(`seed ${seed}: placed >= ${pieces} pieces with the main backend`, res.placed >= pieces && res.backend === 'main', res.placed);
    r.check(`seed ${seed}: botMismatch 0`, res.mism === 0, res.mism);
    r.check(`seed ${seed}: botSpinMismatch 0`, res.spin === 0, res.spin);
    r.check(`seed ${seed}: the spin and hold checks are not empty (T-spins and holds were planned)`, res.spinsPlanned > 0 && res.holds > 0, {spinsPlanned: res.spinsPlanned, holds: res.holds});
    r.check(`seed ${seed}: no page or console errors`, !errors.length, errors.slice(0, 3));
    total.placed += res.placed; total.mism += res.mism; total.spin += res.spin; total.spinsPlanned += res.spinsPlanned; total.tPieces += res.tPieces; total.holds += res.holds;
    await context.close();
  }
  await browser.close();
  console.log('TOTAL', JSON.stringify(total));
});
