// menu helpers
exports.menuItems = (c) => c.eval(`(() => { const m = document.querySelector('#context-menu'); if (!m || m.hidden) return null; return [...m.querySelectorAll('.menu-item')].filter(e => e.getBoundingClientRect().width > 0).map(e => e.textContent.trim()); })()`);
// click a visible menu item by exact label (trusted click)
exports.clickMenu = async (c, label) => {
  const r = await c.eval(`(() => { const items = [...document.querySelectorAll('.context-menu .menu-item')].filter(e => e.getBoundingClientRect().width > 0 && e.textContent.trim() === ${JSON.stringify(label)}); const e = items[items.length - 1]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!r) return false;
  await c.click(r.x, r.y);
  await c.sleep(250);
  return true;
};
exports.hoverMenu = async (c, label) => {
  const r = await c.eval(`(() => { const items = [...document.querySelectorAll('.context-menu .menu-item')].filter(e => e.getBoundingClientRect().width > 0 && e.textContent.trim().startsWith(${JSON.stringify(label)})); const e = items[0]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!r) return false;
  await c.move(r.x, r.y);
  await c.sleep(400);
  return r;
};
exports.toast = (c) => c.eval(`(() => { const t = [...document.querySelectorAll('#toast-root .toast')].filter(e => !e.hidden); return t.map(e => e.textContent.trim()); })()`);
// open the more menu of a track row via trusted hover+click
exports.rowMore = async (c, rowSel) => {
  await c.eval(`document.querySelector(${JSON.stringify(rowSel)}).scrollIntoView({block:'center'})`);
  await c.sleep(300);
  const row = await c.rect(rowSel);
  await c.move(row.x, row.y);
  await c.sleep(200);
  const more = await c.rect(rowSel + ' .track-row__more, ' + rowSel + ' .song-row__more');
  await c.click(more.x, more.y);
  await c.sleep(300);
};
exports.clickSel = async (c, sel) => {
  await c.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) { const r = e.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) e.scrollIntoView({block:'center'}); } })()`);
  await c.sleep(150);
  const r = await c.rect(sel);
  if (!r) return false;
  await c.move(r.x, r.y);
  await c.sleep(100);
  await c.click(r.x, r.y);
  await c.sleep(250);
  return true;
};
