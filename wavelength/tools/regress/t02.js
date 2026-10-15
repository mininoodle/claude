const h = require('./h.js');
module.exports = async (c) => {
  await c.goto();
  await c.sleep(1200);
  c.out('LOAD ERRORS', c.takeErrors());
  // ---- item 1 extra: covers painted and non-blank for visible cards across shelves (scroll through)
  const coverCheck = `(async () => {
    const res = [];
    const main = document.querySelector('#main');
    for (const s of main.querySelectorAll('.shelf')) {
      s.scrollIntoView({ block: 'center' });
      await new Promise(r => setTimeout(r, 400));
      const vis = [...s.querySelectorAll('.card')].filter(c => c.getBoundingClientRect().width > 0);
      let painted = 0, nonBlank = 0;
      for (const card of vis) {
        const img = card.querySelector('img');
        if (img.src && img.src.startsWith('data:image') ) { painted++;
          await img.decode().catch(() => {});
          const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16; const g = cv.getContext('2d'); g.drawImage(img, 0, 0, 16, 16);
          const d = g.getImageData(0, 0, 16, 16).data; let min = 255, max = 0; for (let i = 0; i < d.length; i += 4) { const l = d[i] + d[i+1] + d[i+2]; min = Math.min(min, l); max = Math.max(max, l); }
          if (max - min > 30) nonBlank++;
        }
      }
      res.push({ title: s.querySelector('.shelf__title').textContent, visible: vis.length, painted, nonBlank, w: Math.round(vis[0] && vis[0].getBoundingClientRect().width) });
    }
    main.scrollTop = 0;
    return res;
  })()`;
  c.out('ITEM1 covers', await c.eval(coverCheck));
  await c.sleep(500);
  // ---- item 2: trusted click on a card play button (Made For You first card)
  await c.eval(`document.querySelector('#main').scrollTop = 0; document.querySelector('[data-shelf="made-for-you"]').scrollIntoView({block:'center'})`);
  await c.sleep(500);
  const card = await c.rect('[data-shelf="made-for-you"] .card');
  await c.move(card.x, card.y);
  await c.sleep(400);
  const btn = await c.rect('[data-shelf="made-for-you"] .card .play-btn');
  c.out('card', card, 'btn', btn, 'btnOpacity', await c.eval(`getComputedStyle(document.querySelector('[data-shelf="made-for-you"] .card .play-btn')).opacity`));
  const uri = await c.eval(`document.querySelector('[data-shelf="made-for-you"] .card').getAttribute('data-context-uri')`);
  await c.click(btn.x, btn.y);
  await c.sleep(600);
  const s1 = await h.state(c);
  await c.sleep(2000);
  const s2 = await h.state(c);
  c.out('ITEM2 uri', uri, 's1', s1);
  c.out('ITEM2 s2', s2, 'advanced', +(s2.engPos - s1.engPos).toFixed(2));
  c.out('ITEM2 bar', await h.bar(c));
  c.out('ITEM2 expected', await c.eval(`(() => { const t = Player.currentTrack(); return { title: t.title, artists: Catalog.trackArtists ? Catalog.trackArtists(t).map(a => a.name).join(', ') : Catalog.artist(t.artistId).name, expectedDocTitle: t.title + ' • ' + Catalog.artist(t.artistId).name }; })()`));
  c.out('ITEM2 card icon', await c.eval(h.visibleIcon('[data-shelf="made-for-you"] .card .play-btn')), 'card classes', await c.eval(`document.querySelector('[data-shelf="made-for-you"] .card').className`), 'lib-row', await c.eval(`(() => { const r = document.querySelector('#sidebar .lib-row[data-context-uri="${uri}"]'); return r && r.className; })()`));
  c.out('ERR after item2', c.takeErrors());

  // ---- item 3: pause / resume keeps position
  await c.eval(`Player.pause()`); await c.sleep(300);
  const p1 = await h.state(c);
  await c.sleep(1000);
  const p2 = await h.state(c);
  await c.eval(`Player.play()`); await c.sleep(300);
  const p3 = await h.state(c);
  c.out('ITEM3 pause', { p1pos: p1.pos, p1eng: p1.engPos, p1state: p1.eng, p1play: p1.isPlaying, p2pos: p2.pos, p2eng: p2.engPos, docTitlePaused: p1.docTitle, resumedPos: p3.pos, resumedEng: p3.engPos, p3state: p3.eng, diff: +(p3.engPos - p1.engPos).toFixed(2) });
  // pause via the player bar button with trusted click
  const pbPlay = await c.rect('#player-bar .pb-play');
  await c.click(pbPlay.x, pbPlay.y); await c.sleep(300);
  const b1 = await h.state(c);
  await c.sleep(800);
  await c.click(pbPlay.x, pbPlay.y); await c.sleep(300);
  const b2 = await h.state(c);
  c.out('ITEM3 bar-button pause/resume', { pausedPlaying: b1.isPlaying, pausedEng: b1.eng, pausedPos: b1.engPos, resumedPlaying: b2.isPlaying, resumedPos: b2.engPos, diff: +(b2.engPos - b1.engPos).toFixed(2) });
  // seek via progress slider: trusted click at 50%
  const sl = await c.rect('#player-bar .slider--progress');
  const before = await h.state(c);
  await c.click(sl.x - sl.w / 2 + sl.w * 0.5, sl.y);
  await c.sleep(400);
  const after = await h.state(c);
  await c.sleep(1000);
  const after2 = await h.state(c);
  c.out('ITEM3 seek', { slider: sl, beforePos: before.engPos, dur: before.dur, afterPos: after.engPos, afterPlayerPos: after.pos, afterState: after.eng, afterPlaying: after.isPlaying, after2Pos: after2.engPos, elapsedLabel: (await h.bar(c)).elapsed, sliderValue: await c.eval(`document.querySelector('#player-bar .slider--progress').value`) });
  // previous after > 3s restarts
  const tr0 = after2.cur;
  await c.eval(`Player.previous()`); await c.sleep(400);
  const pv = await h.state(c);
  c.out('ITEM3 prev>3s', { sameTrack: pv.cur === tr0, pos: pv.pos, eng: pv.engPos, playing: pv.isPlaying });
  // previous within 3s: go next first, then previous immediately
  await c.eval(`Player.next()`); await c.sleep(500);
  const n1 = await h.state(c);
  await c.eval(`Player.previous()`); await c.sleep(400);
  const pv2 = await h.state(c);
  c.out('ITEM3 prev<3s', { afterNext: n1.cur, afterNextIdx: n1.idx, afterPrev: pv2.cur, idx: pv2.idx, backToOriginal: pv2.cur === tr0, playing: pv2.isPlaying, eng: pv2.eng });
  // previous via the bar button (trusted) within 3s
  await c.eval(`Player.next()`); await c.sleep(500);
  const n2 = await h.state(c);
  const pbPrev = await c.rect('#player-bar .pb-prev');
  await c.click(pbPrev.x, pbPrev.y); await c.sleep(400);
  const pv3 = await h.state(c);
  c.out('ITEM3 bar prev<3s', { from: n2.cur, to: pv3.cur, ok: pv3.cur === tr0 });
  c.out('ERR after item3', c.takeErrors());
};
