const h = require('./h.js');
const m = require('./h2.js');
const likeSnap = (c, tid) => c.eval(`(() => {
  const vis = (root) => { if (!root) return null; const s = [...root.querySelectorAll('svg')].filter(x => !x.hasAttribute('hidden') && getComputedStyle(x).display !== 'none'); return s.map(x => x.querySelector('use').getAttribute('href')).join(',') + '|' + (root.getAttribute('aria-label') || '') + '|' + getComputedStyle(root).color; };
  const row = document.querySelector('#main .track-row[data-track-id="${tid}"] .track-row__like');
  const pb = document.querySelector('#player-bar .pb-like');
  const rp = document.querySelector('#right-panel .rp__like');
  const liked = document.querySelector('#sidebar .lib-row[data-context-uri="liked"]');
  return { lib: Library.isLiked('${tid}'), row: vis(row), rowVisibility: row && getComputedStyle(row).visibility, pb: vis(pb), rp: vis(rp), sidebarLiked: liked && liked.textContent.replace(/\\s+/g, ' ').trim() };
})()`);
module.exports = async (c) => {
  await c.goto();
  await c.sleep(800);
  c.takeErrors();
  // repeat-one icon check
  await c.eval(`App.navigate({ view: 'album', id: Catalog.albums[3].id })`); await c.sleep(700);
  const alId = await c.eval(`Catalog.albums[3].id`);
  const tid = await c.eval(`document.querySelector('#main .track-row').getAttribute('data-track-id')`);
  // trusted double-click on first row to play
  const r0 = await c.rect('#main .track-row');
  await c.click(r0.x, r0.y, { count: 1 });
  await c.click(r0.x, r0.y, { count: 2 });
  await c.sleep(600);
  let s = await h.state(c);
  c.out('dblclick play', { cur: s.cur, tid, ok: s.cur === tid, ctx: s.ctx, playing: s.isPlaying, rowClass: await c.eval(`document.querySelector('#main .track-row').className`) });
  // repeat-one visible icon
  await c.eval(`Player.cycleRepeat(); Player.cycleRepeat();`); await c.sleep(200);
  c.out('repeat track visible icon', await c.eval(h.visibleIcon('#player-bar .pb-repeat')), (await h.state(c)).repeat);
  await c.eval(`Player.cycleRepeat();`);
  // open the now playing panel via the toggle
  const npv = await c.rect('#player-bar .pb-npv');
  await c.click(npv.x, npv.y); await c.sleep(500);
  c.out('rp mode', await c.eval(`({ right: document.querySelector('#app').dataset.right, npvActive: document.querySelector('#player-bar .pb-npv').classList.contains('is-active'), rpText: document.querySelector('#right-panel').innerText.slice(0, 400) })`));
  c.out('ITEM6 initial', await likeSnap(c, tid));
  // like from row (trusted hover + click)
  await c.move(r0.x, r0.y); await c.sleep(150);
  const rl = await c.rect(`#main .track-row[data-track-id="${tid}"] .track-row__like`);
  await c.click(rl.x, rl.y); await c.sleep(400);
  c.out('ITEM6 after row like', await likeSnap(c, tid), 'toast', await m.toast(c));
  await c.move(640, 100); await c.sleep(200);
  c.out('ITEM6 row like visible without hover', await likeSnap(c, tid));
  // unlike from player bar
  const pbl = await c.rect('#player-bar .pb-like');
  await c.click(pbl.x, pbl.y); await c.sleep(400);
  c.out('ITEM6 after pb unlike', await likeSnap(c, tid), 'toast', await m.toast(c));
  // like from player bar
  await c.click(pbl.x, pbl.y); await c.sleep(400);
  c.out('ITEM6 after pb like', await likeSnap(c, tid), 'toast', await m.toast(c));
  // unlike from right panel
  const rpl = await c.rect('#right-panel .rp__like');
  if (rpl) { await c.click(rpl.x, rpl.y); await c.sleep(400); c.out('ITEM6 after rp unlike', await likeSnap(c, tid), 'toast', await m.toast(c)); }
  else c.out('ITEM6 no rp like button');
  if (rpl) { await c.click(rpl.x, rpl.y); await c.sleep(400); c.out('ITEM6 after rp like', await likeSnap(c, tid)); }
  // like a second track via the row menu "Save to your Liked Songs"
  const tid2 = await c.eval(`document.querySelectorAll('#main .track-row')[2].getAttribute('data-track-id')`);
  await m.rowMore(c, `#main .track-row[data-track-id="${tid2}"]`);
  await m.clickMenu(c, 'Save to your Liked Songs');
  c.out('ITEM6 menu like 2nd', await likeSnap(c, tid2), 'toast', await m.toast(c));
  // hero (action bar) save for the album
  const save = await c.rect('#main .actions__save');
  const heroBefore = await c.eval(`(() => { const b = document.querySelector('#main .actions__save'); return { label: b.getAttribute('aria-label'), icon: [...b.querySelectorAll('svg')].filter(x => !x.hasAttribute('hidden')).map(x => x.querySelector('use').getAttribute('href')).join(',') }; })()`);
  await c.click(save.x, save.y); await c.sleep(400);
  const heroAfter = await c.eval(`(() => { const b = document.querySelector('#main .actions__save'); return { label: b.getAttribute('aria-label'), icon: [...b.querySelectorAll('svg')].filter(x => !x.hasAttribute('hidden')).map(x => x.querySelector('use').getAttribute('href')).join(','), color: getComputedStyle(b).color, saved: Library.isSavedAlbum('${alId}'), sidebarRow: !!document.querySelector('#sidebar .lib-row[data-context-uri="album:${alId}"]') }; })()`);
  c.out('ITEM6 hero save', heroBefore, heroAfter, 'toast', await m.toast(c));
  await c.click(save.x, save.y); await c.sleep(400);
  c.out('ITEM6 hero unsave', await c.eval(`({ saved: Library.isSavedAlbum('${alId}'), sidebarRow: !!document.querySelector('#sidebar .lib-row[data-context-uri="album:${alId}"]'), label: document.querySelector('#main .actions__save').getAttribute('aria-label') })`), 'toast', await m.toast(c));
  // Liked Songs view
  await m.clickSel(c, '#sidebar .lib-row[data-context-uri="liked"]'); await c.sleep(600);
  c.out('ITEM6 liked view', await c.eval(`(() => { const main = document.querySelector('#main'); return { route: App.currentRoute(), h1: (main.querySelector('.hero h1') || {}).textContent, eyebrow: (main.querySelector('.hero .eyebrow') || {}).textContent, meta: (main.querySelector('.hero__meta') || {}).textContent, head: [...main.querySelectorAll('.track-table__head .cell')].map(e => e.textContent.trim()), rows: [...main.querySelectorAll('.track-row')].map(r => ({ id: r.getAttribute('data-track-id'), title: r.querySelector('.track-row__title').textContent, date: (r.querySelector('.track-row__date') || {}).textContent, likeIcon: r.querySelector('.track-row__like use').getAttribute('href'), likeVis: getComputedStyle(r.querySelector('.track-row__like')).visibility })), likedOrder: Library.likedTrackIds(), addedAt: Library.likedAddedAt('${tid}') }; })()`));
  // unlike from the Liked Songs view row
  const lr = await c.rect(`#main .track-row[data-track-id="${tid}"]`);
  await c.move(lr.x, lr.y); await c.sleep(150);
  const lrl = await c.rect(`#main .track-row[data-track-id="${tid}"] .track-row__like`);
  await c.click(lrl.x, lrl.y); await c.sleep(500);
  c.out('ITEM6 unlike in liked view', await c.eval(`({ rows: [...document.querySelectorAll('#main .track-row')].map(r => r.getAttribute('data-track-id')), sidebar: document.querySelector('#sidebar .lib-row[data-context-uri="liked"]').textContent.replace(/\\s+/g,' ').trim(), meta: (document.querySelector('#main .hero__meta') || {}).textContent })`), await likeSnap(c, tid), 'toast', await m.toast(c));
  // unlike remaining track via player-bar? it's not current; use row menu
  await m.rowMore(c, `#main .track-row[data-track-id="${tid2}"]`);
  c.out('liked row menu', await m.menuItems(c));
  await m.clickMenu(c, 'Remove from your Liked Songs');
  await c.sleep(300);
  c.out('ITEM6 empty liked', await c.eval(`({ rows: document.querySelectorAll('#main .track-row').length, text: document.querySelector('#main').innerText.slice(0, 300), sidebar: document.querySelector('#sidebar .lib-row[data-context-uri="liked"]').textContent.replace(/\\s+/g,' ').trim() })`));
  c.out('ERR item6', c.takeErrors());
};
