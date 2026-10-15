const h = require('./h.js');
const m = require('./h2.js');
module.exports = async (c) => {
  await c.goto();
  await c.sleep(800);
  c.takeErrors();
  // trusted play
  await c.eval(`App.navigate({ view: 'album', id: Catalog.albums[5].id })`); await c.sleep(600);
  const hp = await c.rect('#main .actions .play-btn');
  await c.click(hp.x, hp.y); await c.sleep(600);
  await c.eval(`Player.next()`); await c.sleep(400);
  // library changes
  await c.eval(`(() => { Library.toggleLike(Player.getState().currentTrackId); const p = Library.createPlaylist('Persist Me'); Library.addToPlaylist(p.id, Catalog.tracks[10].id); Library.toggleFollow(Catalog.artists[2].id); Library.toggleSaveAlbum(Catalog.albums[7].id); })()`);
  await c.sleep(300);
  // volume via slider trusted click at ~40%
  const vs = await c.rect('#player-bar .slider--volume');
  await c.click(vs.x - vs.w / 2 + vs.w * 0.4, vs.y); await c.sleep(300);
  const sh = await c.rect('#player-bar .pb-shuffle'); await c.click(sh.x, sh.y); await c.sleep(200);
  const rp = await c.rect('#player-bar .pb-repeat'); await c.click(rp.x, rp.y); await c.sleep(200);
  await c.eval(`Player.seek(60)`); await c.sleep(6500);
  const before = await h.state(c);
  const lib = () => c.eval(`({ liked: Library.likedTrackIds(), playlists: Library.playlists().map(p => p.name + ':' + p.trackIds.length), follows: Library.followedArtistIds(), albums: Library.savedAlbumIds(), saved: Library.savedPlaylistIds(), sidebar: [...document.querySelectorAll('#sidebar .lib-row')].map(r => r.getAttribute('title')), right: document.querySelector('#app').dataset.right })`);
  const libBefore = await lib();
  c.out('BEFORE reload (playing)', before, libBefore);
  // reload while playing
  await c.reload(); await c.sleep(800);
  const after = await h.state(c);
  c.out('AFTER reload 1', after, await lib(), 'bar', await h.bar(c), 'volSlider', await c.eval(`document.querySelector('#player-bar .slider--volume').value`), 'progress', await c.eval(`document.querySelector('#player-bar .slider--progress').value`), 'shuffleBtn', await c.eval(`document.querySelector('#player-bar .pb-shuffle').classList.contains('is-active')`), 'repeatBtn', await c.eval(`document.querySelector('#player-bar .pb-repeat').getAttribute('aria-label')`));
  c.out('position diff (playing reload)', +(before.engPos - after.pos).toFixed(2));
  // pressing play resumes from there (trusted click on bar play)
  const pb = await c.rect('#player-bar .pb-play');
  await c.click(pb.x, pb.y); await c.sleep(400);
  const resumed = await h.state(c);
  c.out('RESUME', { cur: resumed.cur, same: resumed.cur === before.cur, eng: resumed.eng, engPos: resumed.engPos, restoredPos: after.pos, diff: +(resumed.engPos - after.pos).toFixed(2), playing: resumed.isPlaying });
  // pause precisely, reload again
  await c.sleep(1500);
  await c.click(pb.x, pb.y); await c.sleep(300);
  const paused = await h.state(c);
  await c.reload(); await c.sleep(800);
  const after2 = await h.state(c);
  c.out('PAUSED reload', { pausedAt: paused.engPos, restored: after2.pos, diff: +(paused.engPos - after2.pos).toFixed(2), cur: after2.cur === paused.cur, eng: after2.eng, engTrack: after2.engTrack, playing: after2.isPlaying, docTitle: after2.docTitle });
  await c.click(pb.x, pb.y); await c.sleep(400);
  const r2 = await h.state(c);
  c.out('RESUME 2', { engPos: r2.engPos, diff: +(r2.engPos - after2.pos).toFixed(2), playing: r2.isPlaying, eng: r2.eng });
  c.out('ERR item11', c.takeErrors());
};
