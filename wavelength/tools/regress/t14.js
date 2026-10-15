const h = require('./h.js');
module.exports = async (c) => {
  await c.goto();
  await c.sleep(800);
  c.takeErrors();
  c.out('like icon check after reload state', await c.eval(h.visibleIcon('#player-bar .pb-like')), await c.eval(`document.querySelector('#player-bar .pb-like').getAttribute('aria-label')`), await c.eval(`Library.isLiked(Player.getState().currentTrackId)`));
  // trusted gesture first
  await c.eval(`App.navigate({ view: 'playlist', id: 'pl_top50global' })`); await c.sleep(600);
  const hp = await c.rect('#main .actions .play-btn');
  await c.click(hp.x, hp.y); await c.sleep(600);
  await c.eval(`Player.pause()`); await c.sleep(200);
  // 1) three tracks from different genres
  const songs = await c.eval(`(() => { const picks = ['lofi', 'metal', 'jazz', 'electronic', 'ambient', 'latin'].map(k => Catalog.tracks.find(t => t.styleKey === k)).filter(Boolean); return picks.map(t => { AudioEngine.load(t); const s = AudioEngine.song; return { id: t.id, style: t.styleKey, bpm: s.bpm, key: s.key, mode: s.mode, instruments: s.instruments.join(','), sections: s.sections.length, dur: AudioEngine.duration, state: AudioEngine.state }; }); })()`);
  c.out('ITEM14 songs', songs);
  const distinctBpm = new Set(songs.map((s) => s.bpm)).size, distinctInst = new Set(songs.map((s) => s.instruments)).size;
  c.out('ITEM14 distinct bpm', distinctBpm, 'of', songs.length, 'distinct instruments', distinctInst);
  // determinism: same track twice
  c.out('ITEM14 deterministic', await c.eval(`(() => { const t = Catalog.tracks[3]; AudioEngine.load(t); const a = JSON.stringify(AudioEngine.song); AudioEngine.load(Catalog.tracks[4]); AudioEngine.load(t); return a === JSON.stringify(AudioEngine.song); })()`));
  // 2) ended triggers next track without isPlaying:false flicker (seek near end)
  await c.eval(`(() => { const st = Player.getState(); Player.playContext({ uri: 'playlist:pl_top50global', name: 'Top 50 Global', trackIds: Catalog.playlist('pl_top50global').trackIds, startIndex: 2 }); })()`);
  await c.sleep(600);
  await c.eval(`window.__ev = []; window.__samples = []; Player.on('statechange', p => __ev.push(['state', p, +AudioEngine.currentTime.toFixed(2)])); Player.on('trackchange', t => __ev.push(['track', t && t.id, Player.getState().isPlaying])); AudioEngine.on('ended', () => __ev.push(['ended', AudioEngine.state, Player.getState().isPlaying])); AudioEngine.on('statechange', s => __ev.push(['eng', s])); window.__iv = setInterval(() => { const s = Player.getState(); __samples.push(s.isPlaying ? 1 : 0); }, 20);`);
  const t0 = await h.state(c);
  await c.eval(`Player.seek(Player.getState().duration - 1.5)`);
  await c.sleep(3200);
  await c.eval(`clearInterval(window.__iv)`);
  const t1 = await h.state(c);
  c.out('ITEM14 end->next', { from: t0.cur, to: t1.cur, idx: t1.idx, playing: t1.isPlaying, eng: t1.eng, pos: t1.engPos, events: await c.eval('__ev'), zeroSamples: await c.eval('__samples.filter(x => x === 0).length'), samples: await c.eval('__samples.length') });
  // 2b) full natural play-through of the shortest track
  const shortest = await c.eval(`(() => { const t = [...Catalog.tracks].sort((a, b) => a.durationMs - b.durationMs)[0]; return { id: t.id, ms: t.durationMs, album: t.albumId }; })()`);
  c.out('shortest', shortest);
  await c.eval(`(() => { const ids = Catalog.tracksOf('${shortest.album}').map(t => t.id); Player.playContext({ uri: 'album:${shortest.album}', name: Catalog.album('${shortest.album}').title, trackIds: ids, startTrackId: '${shortest.id}' }); })()`);
  await c.sleep(500);
  await c.eval(`window.__ev = []; window.__samples = []; window.__iv = setInterval(() => { __samples.push(Player.getState().isPlaying ? 1 : 0); }, 25);`);
  const startCur = (await h.state(c)).cur;
  await c.sleep(shortest.ms + 2500);
  await c.eval(`clearInterval(window.__iv)`);
  const fin = await h.state(c);
  c.out('ITEM14 full play-through', { start: startCur, now: fin.cur, idx: fin.idx, playing: fin.isPlaying, eng: fin.eng, pos: fin.engPos, events: await c.eval('__ev'), zeroSamples: await c.eval('__samples.filter(x => x === 0).length'), samples: await c.eval('__samples.length') });
  c.out('ERR mid', c.takeErrors());
  // 3) 30 rapid track changes
  const r = await c.eval(`(async () => { const errs = []; const oe = window.onerror; window.onerror = (m) => { errs.push(String(m)); }; const ur = (e) => errs.push('rej ' + e.reason); window.addEventListener('unhandledrejection', ur); for (let i = 0; i < 30; i++) { Player.next(); await new Promise(r => setTimeout(r, 30)); } await new Promise(r => setTimeout(r, 500)); const playing = { eng: AudioEngine.state, nodes: AudioEngine.activeNodeCount(), cur: Player.getState().currentTrackId, idx: Player.getState().index }; AudioEngine.stop(); const after = AudioEngine.activeNodeCount(); window.removeEventListener('unhandledrejection', ur); window.onerror = oe; return { playing, afterStop: after, engState: AudioEngine.state, errs }; })()`);
  c.out('ITEM14 rapid', r);
  // also rapid via playContext / load with different tracks then stop
  const r2 = await c.eval(`(async () => { for (let i = 0; i < 30; i++) { Player.playTrack(Catalog.tracks[(i * 11) % Catalog.tracks.length].id); await new Promise(r => setTimeout(r, 20)); } await new Promise(r => setTimeout(r, 300)); const n = AudioEngine.activeNodeCount(); AudioEngine.stop(); return { before: n, after: AudioEngine.activeNodeCount() }; })()`);
  c.out('ITEM14 rapid2', r2);
  await c.sleep(500);
  c.out('ERR item14', c.takeErrors());
};
