const h = require('./h.js');
const m = require('./h2.js');
const searchSnap = (c) => c.eval(`(() => { const main = document.querySelector('#main'); return {
  route: App.currentRoute(), inputVal: (document.querySelector('#topbar input') || {}).value,
  chips: [...main.querySelectorAll('[data-search-chip]')].map(e => e.textContent.trim() + (e.getAttribute('aria-pressed') === 'true' ? '*' : '')),
  top: (() => { const t = main.querySelector('.top-result'); return t && t.innerText.replace(/\\n/g, ' | '); })(),
  songs: main.querySelectorAll('.song-row').length,
  shelves: [...main.querySelectorAll('.shelf .shelf__title, h2')].map(e => e.textContent.trim()).slice(0, 12),
  rows: main.querySelectorAll('.track-row').length, cards: main.querySelectorAll('.card').length, browse: main.querySelectorAll('.browse-card').length,
  text: main.innerText.slice(0, 200).replace(/\\n/g, ' | ') }; })()`);
module.exports = async (c) => {
  await c.goto();
  await c.sleep(800);
  c.takeErrors();
  // ---- item 8
  await m.clickSel(c, '#topbar input');
  c.out('focus', await c.eval(`document.activeElement === document.querySelector('#topbar input')`), 'placeholder', await c.eval(`document.querySelector('#topbar input').placeholder`));
  await c.type('g'); await c.sleep(80); await c.type('l'); await c.sleep(80); await c.type('a'); await c.sleep(400);
  c.out('ITEM8 typed gla', await searchSnap(c));
  await c.type('ss'); await c.sleep(500);
  c.out('ITEM8 typed glass', await searchSnap(c));
  for (const chip of ['Songs', 'Artists', 'Albums', 'Playlists', 'All']) {
    await m.clickSel(c, `#main [data-search-chip="${chip.toLowerCase()}"]`) || await c.eval(`[...document.querySelectorAll('#main [data-search-chip]')].find(e => e.textContent.trim() === '${chip}').click()`);
    await c.sleep(300);
    const s = await searchSnap(c);
    c.out('ITEM8 chip ' + chip, { chips: s.chips, rows: s.rows, cards: s.cards, songs: s.songs, top: !!s.top, shelves: s.shelves });
  }
  // artist search top result
  await c.eval(`(() => { const i = document.querySelector('#topbar input'); i.focus(); i.select(); })()`);
  await c.type('marlow'); await c.sleep(500);
  c.out('ITEM8 marlow', (await searchSnap(c)).top);
  // gibberish
  await c.eval(`(() => { const i = document.querySelector('#topbar input'); i.focus(); i.select(); })()`);
  await c.type('zxqvjwk'); await c.sleep(500);
  c.out('ITEM8 gibberish', (await searchSnap(c)).text);
  // clear with the x button -> browse
  const clear = await c.rect('#topbar .search-pill__clear');
  c.out('clear btn', clear);
  if (clear) { await c.click(clear.x, clear.y); await c.sleep(400); }
  const sb = await searchSnap(c);
  c.out('ITEM8 cleared', { route: sb.route, input: sb.inputVal, browse: sb.browse, text: sb.text });
  // genre card opens its page
  const g = await c.eval(`(() => { const b = document.querySelectorAll('#main .browse-card')[2]; return b && b.textContent.trim(); })()`);
  await m.clickSel(c, '#main .browse-card:nth-of-type(3)');
  await c.sleep(600);
  c.out('ITEM8 genre page', g, await c.eval(`({ route: App.currentRoute(), h1: (document.querySelector('#main h1') || {}).textContent, shelves: [...document.querySelectorAll('#main .shelf__title, #main h2')].map(e => e.textContent.trim()), rows: document.querySelectorAll('#main .track-row').length, ctx: (document.querySelector('#main .track-table') || {}).dataset && document.querySelector('#main .track-table').dataset.ctx })`));
  // charts / new releases categories
  await c.eval(`App.navigate({ view: 'genre', id: 'ge_charts' })`); await c.sleep(500);
  c.out('ITEM8 charts', await c.eval(`({ h1: (document.querySelector('#main h1') || {}).textContent, rows: document.querySelectorAll('#main .track-row').length, cards: document.querySelectorAll('#main .card').length })`));
  // empty query via Browse button
  await m.clickSel(c, '#topbar .search-pill__browse'); await c.sleep(400);
  c.out('ITEM8 browse btn', await c.eval(`({ route: App.currentRoute(), browse: document.querySelectorAll('#main .browse-card').length, heading: [...document.querySelectorAll('#main h2')].map(e => e.textContent) })`));
  // typing then deleting everything shows browse
  await m.clickSel(c, '#topbar input');
  await c.type('jazz'); await c.sleep(400);
  await c.eval(`(() => { const i = document.querySelector('#topbar input'); i.select(); })()`);
  await c.key({ key: 'Backspace', code: 'Backspace', keyCode: 8 }); await c.sleep(400);
  c.out('ITEM8 backspace to empty', await c.eval(`({ route: App.currentRoute(), browse: document.querySelectorAll('#main .browse-card').length })`));
  c.out('ERR item8', c.takeErrors());

  // ---- item 9 navigation
  await c.eval(`document.activeElement && document.activeElement.blur()`);
  await c.eval(`App.navigate({ view: 'home' })`); await c.sleep(500);
  await c.eval(`App.navigate({ view: 'artist', id: Catalog.artists[0].id })`); await c.sleep(600);
  await c.eval(`document.querySelector('#main').scrollTop = 900`); await c.sleep(300);
  const st1 = await c.eval(`document.querySelector('#main').scrollTop`);
  // click album name in a row? artist popular rows have no album col; use the Discography card -> album
  await m.clickSel(c, '#main .card[data-kind="album"]'); await c.sleep(600);
  const albumRoute = await c.eval(`App.currentRoute()`);
  // back via button
  await c.eval(`document.querySelector('#main').scrollTop = 0`);
  const backBtn = await c.rect('#main .nav-btn--back');
  await c.click(backBtn.x, backBtn.y); await c.sleep(600);
  const afterBack = await c.eval(`({ route: App.currentRoute(), scrollTop: document.querySelector('#main').scrollTop, fwdDisabled: document.querySelector('#main .nav-btn--forward').disabled })`);
  c.out('ITEM9 back', { st1, albumRoute, afterBack });
  const fwdBtn = await c.rect('#main .nav-btn--forward');
  await c.click(fwdBtn.x, fwdBtn.y); await c.sleep(600);
  c.out('ITEM9 forward', await c.eval(`App.currentRoute()`));
  // Alt+Left / Alt+Right
  await c.eval(`document.activeElement && document.activeElement.blur()`);
  await c.key({ key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37, modifiers: 1 }); await c.sleep(600);
  const altL = await c.eval(`({ route: App.currentRoute(), scrollTop: document.querySelector('#main').scrollTop })`);
  await c.key({ key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, modifiers: 1 }); await c.sleep(600);
  const altR = await c.eval(`App.currentRoute()`);
  c.out('ITEM9 alt arrows', { altL, altR });
  // clicking artist and album names in rows (playlist page)
  await c.eval(`App.navigate({ view: 'playlist', id: 'pl_indiegold' })`); await c.sleep(600);
  const rowInfo = await c.eval(`(() => { const r = document.querySelectorAll('#main .track-row')[1]; return { artist: r.querySelector('.track-row__artist a').getAttribute('data-id'), album: r.querySelector('.track-row__album a').getAttribute('data-id') }; })()`);
  await m.clickSel(c, '#main .track-table .track-row:nth-of-type(3) .track-row__artist a'); await c.sleep(600);
  const r1 = await c.eval(`App.currentRoute()`);
  await c.eval(`App.back()`); await c.sleep(600);
  await m.clickSel(c, '#main .track-table .track-row:nth-of-type(3) .track-row__album a'); await c.sleep(600);
  const r2 = await c.eval(`App.currentRoute()`);
  c.out('ITEM9 row links', { rowInfo, artistRoute: r1, albumRoute: r2 });
  // player bar title -> album, artist -> artist
  // hero play toggles pause for the current context
  const hp = await c.rect('#main .actions .play-btn');
  await c.click(hp.x, hp.y); await c.sleep(600);
  const a1 = await h.state(c);
  const icon1 = await c.eval(h.visibleIcon('#main .actions .play-btn')) ;
  const lab1 = await c.eval(`document.querySelector('#main .actions .play-btn').getAttribute('aria-label')`);
  await c.click(hp.x, hp.y); await c.sleep(400);
  const a2 = await h.state(c);
  const icon2 = await c.eval(h.visibleIcon('#main .actions .play-btn'));
  const lab2 = await c.eval(`document.querySelector('#main .actions .play-btn').getAttribute('aria-label')`);
  await c.click(hp.x, hp.y); await c.sleep(400);
  const a3 = await h.state(c);
  c.out('ITEM9 hero play toggle', { play1: { ctx: a1.ctx, playing: a1.isPlaying, icon: icon1, label: lab1, pos: a1.engPos }, pause: { playing: a2.isPlaying, icon: icon2, label: lab2, pos: a2.engPos, cur: a2.cur === a1.cur }, resume: { playing: a3.isPlaying, cur: a3.cur === a1.cur, pos: a3.engPos } });
  // sticky strip play button
  await c.eval(`document.querySelector('#main').scrollTop = 1200`); await c.sleep(800);
  const strip = await c.eval(`(() => { const b = document.querySelector('#main .main-header__ctx'); const r = b && b.getBoundingClientRect(); return b && { opacity: getComputedStyle(b).opacity, vis: getComputedStyle(b).visibility, title: b.textContent.trim(), icon: [...b.querySelectorAll('.play-btn svg')].filter(s => !s.hasAttribute('hidden')).map(s => s.querySelector('use').getAttribute('href')).join(','), stripBg: getComputedStyle(document.querySelector('#main .main-header')).backgroundColor }; })()`);
  c.out('ITEM9 sticky strip', strip);
  c.out('ERR item9', c.takeErrors());

  // ---- item 10 keyboard
  await c.eval(`document.querySelector('#main').scrollTop = 0; document.activeElement && document.activeElement.blur()`);
  const k0 = await h.state(c);
  await c.key({ key: ' ', code: 'Space', keyCode: 32, text: ' ' }); await c.sleep(300);
  const k1 = await h.state(c);
  await c.key({ key: ' ', code: 'Space', keyCode: 32, text: ' ' }); await c.sleep(300);
  const k2 = await h.state(c);
  c.out('ITEM10 space', { before: k0.isPlaying, after1: k1.isPlaying, after2: k2.isPlaying, active: await c.eval(`document.activeElement.tagName`), scrollTop: await c.eval(`document.querySelector('#main').scrollTop`) });
  await c.key({ key: '/', code: 'Slash', keyCode: 191, text: '/' }); await c.sleep(200);
  c.out('ITEM10 slash', { focused: await c.eval(`document.activeElement === document.querySelector('#topbar input')`), value: await c.eval(`document.querySelector('#topbar input').value`) });
  await c.key({ key: 'Escape', code: 'Escape', keyCode: 27 }); await c.sleep(200);
  c.out('ITEM10 escape search', { focused: await c.eval(`document.activeElement === document.querySelector('#topbar input')`) });
  // Ctrl+K
  await c.key({ key: 'k', code: 'KeyK', keyCode: 75, modifiers: 2 }); await c.sleep(200);
  c.out('ITEM10 ctrl+k', await c.eval(`document.activeElement === document.querySelector('#topbar input')`));
  await c.key({ key: 'Escape', code: 'Escape', keyCode: 27 }); await c.sleep(200);
  // Escape closes a menu
  await m.rowMore(c, '#main .track-row');
  const mOpen = await c.eval(`!document.querySelector('#context-menu').hidden`);
  await c.key({ key: 'Escape', code: 'Escape', keyCode: 27 }); await c.sleep(200);
  c.out('ITEM10 escape menu', { opened: mOpen, closed: await c.eval(`document.querySelector('#context-menu').hidden`) });
  // Escape closes a dialog
  await c.eval(`App.openDialog({ title: 'QA', body: 'Test body', actions: [{ label: 'OK', primary: true, onClick: () => {} }] })`); await c.sleep(200);
  const dOpen = await c.eval(`!!document.querySelector('#dialog-root .dialog')`);
  await c.key({ key: 'Escape', code: 'Escape', keyCode: 27 }); await c.sleep(300);
  c.out('ITEM10 escape dialog', { opened: dOpen, closed: await c.eval(`!document.querySelector('#dialog-root .dialog')`) });
  // Escape closes dialog opened via the UI (delete confirm path not available) -> edit details not available; use the Already added? skip
  // M mutes
  await c.eval(`document.activeElement && document.activeElement.blur()`);
  const vi0 = await c.eval(h.visibleIcon('#player-bar .pb-mute'));
  const v0 = await h.state(c);
  await c.key({ key: 'm', code: 'KeyM', keyCode: 77, text: 'm' }); await c.sleep(300);
  const vi1 = await c.eval(h.visibleIcon('#player-bar .pb-mute'));
  const v1 = await h.state(c);
  const lab = await c.eval(`document.querySelector('#player-bar .pb-mute').getAttribute('aria-label')`);
  const slider = await c.eval(`document.querySelector('#player-bar .slider--volume').value`);
  await c.key({ key: 'm', code: 'KeyM', keyCode: 77, text: 'm' }); await c.sleep(300);
  const vi2 = await c.eval(h.visibleIcon('#player-bar .pb-mute'));
  const v2 = await h.state(c);
  c.out('ITEM10 mute', { before: { icon: vi0, muted: v0.muted, vol: v0.volume }, muted: { icon: vi1, muted: v1.muted, label: lab, slider }, unmuted: { icon: vi2, muted: v2.muted, vol: v2.volume } });
  // volume icon levels via ArrowDown
  await c.eval(`Player.setVolume(0.2)`); await c.sleep(200);
  const low = await c.eval(h.visibleIcon('#player-bar .pb-mute'));
  await c.eval(`Player.setVolume(0.5)`); await c.sleep(200);
  const mid = await c.eval(h.visibleIcon('#player-bar .pb-mute'));
  await c.eval(`Player.setVolume(0.7)`); await c.sleep(200);
  c.out('ITEM10 levels', { low, mid });
  c.out('ERR item10', c.takeErrors());
};
