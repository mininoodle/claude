const h = require('./h.js');
const m = require('./h2.js');
const dlg = (c) => c.eval(`(() => { const d = document.querySelector('#dialog-root .dialog'); if (!d) return null; return { title: (d.querySelector('.dialog__title') || {}).textContent, body: (d.querySelector('.dialog__body') || {}).textContent, actions: [...d.querySelectorAll('.dialog__actions button')].map(b => b.textContent.trim() + (b.classList.contains('pill--primary') ? '(primary)' : '')), close: !!d.querySelector('.dialog__close'), inputs: [...d.querySelectorAll('input, textarea')].map(i => ({ tag: i.tagName, value: i.value, ph: i.placeholder })), focusInside: d.contains(document.activeElement) }; })()`);
const clickDlgBtn = async (c, label) => {
  const r = await c.eval(`(() => { const b = [...document.querySelectorAll('#dialog-root .dialog button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!r) return false; await c.click(r.x, r.y); await c.sleep(400); return true;
};
module.exports = async (c) => {
  await c.goto();
  await c.sleep(800);
  c.takeErrors();
  const sidebarNames = () => c.eval(`[...document.querySelectorAll('#sidebar .lib-row')].map(r => r.getAttribute('title') + ' [' + (r.querySelector('.lib-row__sub') ? r.querySelector('.lib-row__sub').textContent : '') + ']')`);
  // create via the + button
  await m.clickSel(c, '#sidebar .lib-add');
  c.out('ITEM7 + menu', await m.menuItems(c));
  await m.clickMenu(c, 'Create a new playlist');
  await c.sleep(600);
  const route = await c.eval(`App.currentRoute()`);
  const plId = route.id;
  c.out('ITEM7 created', { route, h1: await c.eval(`(document.querySelector('#main .hero h1') || {}).textContent`), eyebrow: await c.eval(`(document.querySelector('#main .hero .eyebrow, #main .hero__eyebrow') || {}).textContent`), finder: await c.eval(`(() => { const f = document.querySelector('#main .playlist-finder'); return f && { heading: (f.querySelector('h2, h3, .playlist-finder__title') || {}).textContent, input: f.querySelector('input') && f.querySelector('input').placeholder }; })()`), table: await c.eval(`!!document.querySelector('#main .track-table')`), sidebar: await sidebarNames(), sidebarActive: await c.eval(`(document.querySelector('#sidebar .lib-row.is-active') || {}).title`) });
  // finder search & add
  await m.clickSel(c, '#main .playlist-finder input');
  await c.type('glass'); await c.sleep(600);
  c.out('ITEM7 finder results', await c.eval(`[...document.querySelectorAll('#main .finder-row')].slice(0,3).map(r => r.innerText.replace(/\\n/g,' | '))`));
  // Edit details by clicking the title
  await m.clickSel(c, '#main .hero h1');
  await c.sleep(300);
  c.out('ITEM7 edit dialog', await dlg(c));
  await c.eval(`(() => { const i = document.querySelector('#dialog-root .edit-details__name'); i.focus(); i.select(); })()`);
  await c.type('QA Road Trip');
  await c.eval(`document.querySelector('#dialog-root .edit-details__desc').focus()`);
  await c.type('Songs for the long drive');
  await clickDlgBtn(c, 'Save');
  c.out('ITEM7 after save', { dialogOpen: await c.eval(`!!document.querySelector('#dialog-root .dialog')`), h1: await c.eval(`document.querySelector('#main .hero h1').textContent`), desc: await c.eval(`(document.querySelector('#main .hero__desc') || {}).textContent`), lib: await c.eval(`({ name: Library.playlist('${plId}').name, desc: Library.playlist('${plId}').description })`), sidebar: await sidebarNames() });
  // Enter in Name saves; empty name keeps old
  await m.clickSel(c, '#main .hero h1'); await c.sleep(300);
  await c.eval(`(() => { const i = document.querySelector('#dialog-root .edit-details__name'); i.focus(); i.select(); })()`);
  await c.key({ key: 'Backspace', code: 'Backspace', keyCode: 8 });
  await c.key({ key: 'Enter', code: 'Enter', keyCode: 13 });
  await c.sleep(300);
  c.out('ITEM7 empty name + Enter', { dialogOpen: await c.eval(`!!document.querySelector('#dialog-root .dialog')`), name: await c.eval(`Library.playlist('${plId}').name`) });
  // add a track via the context menu from another playlist
  await c.eval(`App.navigate({ view: 'playlist', id: 'pl_deepfocus' })`); await c.sleep(700);
  // first trusted gesture not needed
  const tid = await c.eval(`document.querySelector('#main .track-row').getAttribute('data-track-id')`);
  await m.rowMore(c, '#main .track-row');
  const hov = await m.hoverMenu(c, 'Add to playlist');
  c.out('ITEM7 submenu', await m.menuItems(c), await c.eval(`(() => { const i = document.querySelector('.context-menu input'); return i && i.placeholder; })()`));
  await m.clickMenu(c, 'QA Road Trip');
  c.out('ITEM7 add toast', await m.toast(c), 'tracks', await c.eval(`Library.playlist('${plId}').trackIds`), 'menuOpen', await c.eval(`!document.querySelector('#context-menu').hidden`));
  // add again -> Already added
  await m.rowMore(c, '#main .track-row');
  await m.hoverMenu(c, 'Add to playlist');
  await m.clickMenu(c, 'QA Road Trip');
  await c.sleep(300);
  c.out('ITEM7 already added', await dlg(c));
  await clickDlgBtn(c, 'Add anyway');
  c.out('ITEM7 after add anyway', { tracks: await c.eval(`Library.playlist('${plId}').trackIds`), toast: await m.toast(c), dialogOpen: await c.eval(`!!document.querySelector('#dialog-root .dialog')`) });
  // try "Don't add" path too
  await m.rowMore(c, '#main .track-row');
  await m.hoverMenu(c, 'Add to playlist');
  await m.clickMenu(c, 'QA Road Trip'); await c.sleep(300);
  await clickDlgBtn(c, "Don't add");
  c.out('ITEM7 dont add', { tracks: (await c.eval(`Library.playlist('${plId}').trackIds`)).length, dialogOpen: await c.eval(`!!document.querySelector('#dialog-root .dialog')`) });
  // go to the user playlist; remove via menu
  await m.clickSel(c, `#sidebar .lib-row[data-context-uri="user:${plId}"]`); await c.sleep(700);
  c.out('ITEM7 user playlist page', await c.eval(`({ route: App.currentRoute(), rows: [...document.querySelectorAll('#main .track-table .track-row')].map(r => r.getAttribute('data-track-id')), meta: (document.querySelector('#main .hero__meta') || {}).textContent, eyebrow: document.querySelector('#main .hero').innerText.split('\\n')[0], recommended: !!document.querySelector('#main .finder-row'), sidebarSub: document.querySelector('#sidebar .lib-row[data-context-uri="user:${plId}"]').textContent })`));
  await m.rowMore(c, '#main .track-table .track-row');
  c.out('ITEM7 user row menu', await m.menuItems(c));
  await m.clickMenu(c, 'Remove from this playlist');
  c.out('ITEM7 after remove', { tracks: await c.eval(`Library.playlist('${plId}').trackIds`), rows: await c.eval(`document.querySelectorAll('#main .track-table .track-row').length`), toast: await m.toast(c) });
  // delete via more menu
  await m.clickSel(c, '#main .actions__more');
  c.out('ITEM7 hero more menu', await m.menuItems(c));
  await m.clickMenu(c, 'Delete playlist');
  await c.sleep(300);
  c.out('ITEM7 delete dialog', await dlg(c));
  await clickDlgBtn(c, 'Delete');
  await c.sleep(400);
  c.out('ITEM7 after delete', { route: await c.eval(`App.currentRoute()`), exists: await c.eval(`!!Library.playlist('${plId}')`), sidebar: await sidebarNames(), toast: await m.toast(c), dialogOpen: await c.eval(`!!document.querySelector('#dialog-root .dialog')`) });
  c.out('ERR item7', c.takeErrors());
};
