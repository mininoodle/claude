module.exports = async (c) => {
  await c.goto();
  await c.sleep(1500);
  const r = await c.eval(`(() => {
    const main = document.querySelector('#main');
    const chips = [...main.querySelectorAll('[data-home-chip], .chip')].map(e => e.textContent.trim());
    const tiles = [...main.querySelectorAll('.quick-tile')];
    const shelves = [...main.querySelectorAll('.shelf')].map(s => {
      const title = (s.querySelector('h2, .shelf__title') || {}).textContent;
      const imgs = [...s.querySelectorAll('img.cover')];
      const visible = [...s.querySelectorAll('.card')].filter(c => c.offsetParent !== null && getComputedStyle(c).display !== 'none');
      return { title: title && title.trim(), cards: s.querySelectorAll('.card').length, visibleCards: visible.length, imgs: imgs.length, blankImgs: imgs.filter(i => !i.src || !i.src.startsWith('data:image') || i.naturalWidth === 0).length };
    });
    const libRows = [...document.querySelectorAll('#sidebar .lib-row')].map(r => ({ uri: r.getAttribute('data-context-uri'), name: r.getAttribute('title'), sub: (r.querySelector('.lib-row__sub, .sub, .subtitle') || {}).textContent }));
    const tileInfo = tiles.map(t => ({ uri: t.getAttribute('data-context-uri'), name: t.textContent.trim().slice(0,40), img: !!(t.querySelector('img') && t.querySelector('img').src.startsWith('data:image')) }));
    return { title: document.title, view: document.querySelector('#app').dataset.view, right: document.querySelector('#app').dataset.right, sidebar: document.querySelector('#app').dataset.sidebar, chips, tiles: tiles.length, tileInfo, shelves, libRows, greeting: !!main.querySelector('h1') && main.querySelector('h1').textContent };
  })()`);
  c.out(r);
};
