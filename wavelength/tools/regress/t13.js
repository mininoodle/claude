module.exports = async (c) => {
  await c.viewport(900, 800, false);
  await c.goto();
  await c.sleep(1000);
  c.takeErrors();
  const lay = () => c.eval(`(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), hidden: e.hidden, display: getComputedStyle(e).display }; };
    const sb = document.querySelector('#sidebar');
    const names = [...sb.querySelectorAll('.lib-row')].map(row => { const n = row.querySelector('.lib-row__name, .name'); return n ? getComputedStyle(n).display : 'n/a'; });
    const covers = [...sb.querySelectorAll('.lib-row img')].map(i => Math.round(i.getBoundingClientRect().width));
    return { vw: innerWidth, sw: document.documentElement.scrollWidth, dataSidebar: document.querySelector('#app').dataset.sidebar, dataRight: document.querySelector('#app').dataset.right, topbar: r('#topbar'), sidebar: r('#sidebar'), main: r('#main'), right: r('#right-panel'), player: r('#player-bar'), mini: r('#mini-player'), nav: r('#bottom-nav'), resL: r('#resizer-left'), resR: r('#resizer-right'), chips: sb.querySelector('.chips, .lib-chips') && getComputedStyle(sb.querySelector('.chips, .lib-chips')).display, libTitleText: (() => { const t = sb.querySelector('.lib-title'); if (!t) return null; const s = [...t.querySelectorAll('span')].map(x => getComputedStyle(x).display); return s; })(), names, covers, rowTitles: [...sb.querySelectorAll('.lib-row')].map(r => r.getAttribute('title')), libAdd: r('#sidebar .lib-add') };
  })()`);
  c.out('ITEM13 home', await lay());
  // try to open the right panel: it must stay hidden at tablet
  await c.eval(`App.setRightPanel('now-playing')`); await c.sleep(400);
  const l2 = await lay();
  c.out('ITEM13 right panel requested', { dataRight: l2.dataRight, right: l2.right, main: l2.main, sw: l2.sw });
  await c.eval(`App.setRightPanel(null)`); await c.sleep(200);
  // playlist page: hero cover 192px, no date column
  await c.eval(`App.navigate({ view: 'playlist', id: 'pl_chillvibes' })`); await c.sleep(700);
  c.out('ITEM13 playlist', await c.eval(`(() => { const cov = document.querySelector('#main .hero img'); const row = document.querySelector('#main .track-row'); const date = row.querySelector('.track-row__date'); const head = [...document.querySelectorAll('#main .track-table__head .cell')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.textContent.trim()); return { cover: cov && Math.round(cov.getBoundingClientRect().width), dateDisplay: date && getComputedStyle(date).display, head, rowW: Math.round(row.getBoundingClientRect().width), mainW: Math.round(document.querySelector('#main').getBoundingClientRect().width), sw: document.documentElement.scrollWidth, overflowRows: [...document.querySelectorAll('#main .track-row')].filter(r => r.scrollWidth > r.clientWidth + 1).length, h1: getComputedStyle(document.querySelector('#main .hero h1')).fontSize }; })()`));
  // sidebar row click navigates; rail hover
  await c.eval(`App.navigate({ view: 'search', query: '' })`); await c.sleep(500);
  c.out('ITEM13 search', await c.eval(`({ browseCols: (() => { const b = [...document.querySelectorAll('#main .browse-card')].slice(0, 6).map(e => Math.round(e.getBoundingClientRect().y)); return b; })(), sw: document.documentElement.scrollWidth })`));
  await c.shot('tablet-home.png');
  await c.eval(`App.navigate({ view: 'home' })`); await c.sleep(700);
  await c.shot('tablet-home.png');
  await c.eval(`App.navigate({ view: 'playlist', id: 'pl_chillvibes' })`); await c.sleep(700);
  await c.shot('tablet-playlist.png');
  c.out('ERR item13', c.takeErrors());
};
