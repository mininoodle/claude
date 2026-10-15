const m = require('./h2.js');
module.exports = async (c) => {
  await c.goto();
  await c.sleep(800);
  c.takeErrors();
  const q = await c.eval(`(() => { const out = []; for (const w of ['night','late','deep','the','fresh','daily','chill','rain','gold','top','lune','glass','a']) { const r = Catalog.search(w); out.push([w, r.tracks.length, r.artists.length, r.albums.length, r.playlists.length, r.top && r.top.type]); } return out; })()`);
  c.out('search counts', q);
  await m.clickSel(c, '#topbar input');
  await c.type('night'); await c.sleep(500);
  const snap = () => c.eval(`(() => { const main = document.querySelector('#main'); return { shelves: [...main.querySelectorAll('.shelf')].map(s => ({ t: s.querySelector('.shelf__title').textContent, cards: s.querySelectorAll('.card').length, vis: [...s.querySelectorAll('.card')].filter(x => x.getBoundingClientRect().width > 0).length, subs: [...s.querySelectorAll('.card__sub')].slice(0,2).map(x => x.textContent) })), top: (main.querySelector('.top-result') || {}).innerText, songs: main.querySelectorAll('.song-row').length, rows: main.querySelectorAll('.track-row').length, cards: main.querySelectorAll('.card').length, h2: [...main.querySelectorAll('h2')].map(e => e.textContent) }; })()`);
  c.out('ALL night', await snap());
  for (const chip of ['songs', 'artists', 'albums', 'playlists']) {
    await m.clickSel(c, `#main [data-search-chip="${chip}"]`); await c.sleep(300);
    c.out('chip ' + chip, await snap());
  }
  await m.clickSel(c, `#main [data-search-chip="all"]`); await c.sleep(300);
  // play the top result (hover + play button)
  const tr = await c.rect('#main .top-result');
  await c.move(tr.x, tr.y); await c.sleep(300);
  const pb = await c.rect('#main .top-result .play-btn');
  await c.click(pb.x, pb.y); await c.sleep(600);
  c.out('top result play', await c.eval(`({ ctx: Player.getState().context, playing: Player.getState().isPlaying, cur: Player.getState().currentTrackId, cls: document.querySelector('#main .top-result').className, recent: Library.recentSearches() })`));
  // a song row play in search
  const sr = await c.rect('#main .song-row:nth-child(2)');
  await c.move(sr.x, sr.y); await c.sleep(200);
  const sp = await c.rect('#main .song-row:nth-child(2) .song-row__play');
  await c.click(sp.x, sp.y); await c.sleep(500);
  c.out('song row play', await c.eval(`({ ctx: Player.getState().context && { uri: Player.getState().context.uri, name: Player.getState().context.name, n: Player.getState().context.trackIds.length }, cur: Player.getState().currentTrackId, row: document.querySelector('#main .song-row:nth-child(2)').getAttribute('data-track-id') })`));
  // clear: recent searches shelf
  await m.clickSel(c, '#topbar .search-pill__clear'); await c.sleep(400);
  c.out('browse with recents', await c.eval(`({ h2: [...document.querySelectorAll('#main h2, #main .shelf__title')].map(e => e.textContent), recentCards: document.querySelectorAll('#main .card').length, clearPill: !!document.querySelector('#main .search-clear-recent') })`));
  c.out('ERR', c.takeErrors());
};
