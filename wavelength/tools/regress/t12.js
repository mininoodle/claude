const h = require('./h.js');
const m = require('./h2.js');
const W = +(process.env.QW || 375), H = +(process.env.QH || 812);
const tapSel = async (c, sel) => {
  await c.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) { const r = e.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight - 130) e.scrollIntoView({ block: 'center' }); } })()`);
  await c.sleep(200);
  const r = await c.rect(sel);
  if (!r) return false;
  await c.tap(r.x, r.y); await c.sleep(400);
  return r;
};
const noHScroll = (c) => c.eval(`({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, iw: innerWidth, ok: document.documentElement.scrollWidth <= innerWidth, mainSW: document.querySelector('#main').scrollWidth, mainCW: document.querySelector('#main').clientWidth })`);
module.exports = async (c) => {
  await c.viewport(W, H, true);
  await c.goto();
  await c.sleep(1000);
  c.takeErrors();
  c.out('viewport', W, H);
  const layout = await c.eval(`(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { y: Math.round(b.y), h: Math.round(b.height), w: Math.round(b.width), d: getComputedStyle(e).display, hidden: e.hidden }; }; return { topbar: r('#topbar'), sidebar: r('#sidebar'), main: r('#main'), mini: r('#mini-player'), nav: r('#bottom-nav'), player: r('#player-bar'), right: r('#right-panel'), quickTileH: r('#main .quick-tile'), tilesPerRow: (() => { const t = [...document.querySelectorAll('#main .quick-tile')].map(x => Math.round(x.getBoundingClientRect().y)); return t.filter(y => y === t[0]).length; })(), avatar: !!document.querySelector('#main .avatar-btn, #main .avatar') }; })()`);
  c.out('ITEM12 home layout', layout, await noHScroll(c));
  // shelves scroll horizontally
  c.out('ITEM12 shelves', await c.eval(`[...document.querySelectorAll('#main .shelf .card-grid')].slice(0, 3).map(g => ({ ox: getComputedStyle(g).overflowX, sw: g.scrollWidth, cw: g.clientWidth, cardW: Math.round(g.querySelector('.card').getBoundingClientRect().width), visibleCards: [...g.querySelectorAll('.card')].filter(x => getComputedStyle(x).display !== 'none').length }))`));
  // shelf scroll test
  c.out('ITEM12 shelf scroll', await c.eval(`(() => { const g = document.querySelector('#main .shelf .card-grid'); g.scrollLeft = 200; return g.scrollLeft; })()`));
  // bottom nav
  const navState = () => c.eval(`({ route: App.currentRoute(), active: [...document.querySelectorAll('#bottom-nav .bottom-nav__item')].map(a => a.textContent.trim() + (a.classList.contains('is-active') ? '*' : '') + ':' + a.querySelector('use').getAttribute('href')) })`);
  await tapSel(c, '#bottom-nav .bottom-nav__item[data-route="search"]');
  c.out('ITEM12 nav search', await navState(), await c.eval(`({ header: (document.querySelector('#main h1, #main .search-head h1') || {}).textContent, ph: (document.querySelector('#main input') || {}).placeholder, browseW: Math.round(document.querySelector('#main .browse-card').getBoundingClientRect().width), browsePerRow: (() => { const t = [...document.querySelectorAll('#main .browse-card')].map(x => Math.round(x.getBoundingClientRect().y)); return t.filter(y => y === t[0]).length; })() })`), await noHScroll(c));
  await tapSel(c, '#bottom-nav .bottom-nav__item[data-route="library"]');
  c.out('ITEM12 nav library', await navState(), await c.eval(`({ rows: [...document.querySelectorAll('#main .lib-row')].map(r => r.getAttribute('title')) })`), await noHScroll(c));
  await tapSel(c, '#bottom-nav .bottom-nav__item[data-route="home"]');
  c.out('ITEM12 nav home', await navState());
  c.out('ITEM12 mini before load', await c.eval(`({ hidden: document.querySelector('#mini-player').hidden, d: getComputedStyle(document.querySelector('#mini-player')).display, h: document.querySelector('#mini-player').getBoundingClientRect().height })`));

  // ---- repeat item 2 at mobile: card play button?
  const cardBtn = await c.eval(`(() => { const b = document.querySelector('#main [data-shelf="made-for-you"] .card .play-btn'); const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); return { display: cs.display, opacity: cs.opacity, vis: cs.visibility, w: r.width, x: r.x, y: r.y }; })()`);
  c.out('ITEM2m card play btn style', cardBtn);
  await c.eval(`document.querySelector('#main [data-shelf="made-for-you"]').scrollIntoView({ block: 'center' })`); await c.sleep(300);
  const cb = await c.rect('#main [data-shelf="made-for-you"] .card .play-btn');
  const uri = await c.eval(`document.querySelector('#main [data-shelf="made-for-you"] .card').getAttribute('data-context-uri')`);
  await c.tap(cb.x, cb.y); await c.sleep(800);
  let s1 = await h.state(c);
  await c.sleep(2000);
  let s2 = await h.state(c);
  c.out('ITEM2m', { uri, route: await c.eval('App.currentRoute()'), s1: { eng: s1.eng, playing: s1.isPlaying, ctx: s1.ctx, cur: s1.cur, title: s1.title, doc: s1.docTitle }, advanced: +(s2.engPos - s1.engPos).toFixed(2), cardIcon: await c.eval(h.visibleIcon('#main [data-shelf="made-for-you"] .card .play-btn')), cardCls: await c.eval(`(document.querySelector('#main [data-shelf="made-for-you"] .card') || {}).className`) });
  const mini = () => c.eval(`(() => { const mp = document.querySelector('#mini-player'); const b = mp.getBoundingClientRect(); return { hidden: mp.hidden, d: getComputedStyle(mp).display, y: Math.round(b.y), h: Math.round(b.height), w: Math.round(b.width), title: (mp.querySelector('.mini-player__title-text') || mp.querySelector('.mini-player__title') || {}).textContent, artist: (mp.querySelector('.mini-player__artist') || {}).textContent, play: [...mp.querySelectorAll('.mp-play svg')].filter(s => !s.hasAttribute('hidden')).map(s => s.querySelector('use').getAttribute('href')).join(','), like: [...mp.querySelectorAll('.mp-like svg')].filter(s => !s.hasAttribute('hidden')).map(s => s.querySelector('use').getAttribute('href')).join(',') + '|' + (mp.querySelector('.mp-like') || {getAttribute(){}}).getAttribute('aria-label'), bg: getComputedStyle(mp.querySelector('.mini-player__inner') || mp).backgroundColor }; })()`);
  c.out('ITEM12 mini after load', await mini(), await noHScroll(c));
  // ---- item 12: tap a track row in a playlist
  await c.eval(`App.navigate({ view: 'playlist', id: 'pl_indiegold' })`); await c.sleep(800);
  c.out('ITEM12 playlist layout', await c.eval(`(() => { const hero = document.querySelector('#main .hero'); const cov = hero.querySelector('img'); const cb = cov.getBoundingClientRect(); const h1 = hero.querySelector('h1'); const hb = h1.getBoundingClientRect(); const row = document.querySelector('#main .track-row'); const cells = ['index','album','date','dur','like','more','plays'].map(k => { const e = row.querySelector('.track-row__' + k); return k + ':' + (e ? getComputedStyle(e).display + '/' + getComputedStyle(e).visibility : 'none'); }); const cover = row.querySelector('.track-row__cover'); const actions = document.querySelector('#main .actions'); const play = actions.querySelector('.play-btn').getBoundingClientRect(); return { coverW: Math.round(cb.width), coverCenter: Math.round(cb.x + cb.width / 2), vw: innerWidth, h1Left: Math.round(hb.x), h1Below: hb.y > cb.bottom - 1, h1Size: getComputedStyle(h1).fontSize, h1Align: getComputedStyle(h1).textAlign, rowCells: cells, rowCover: cover && Math.round(cover.getBoundingClientRect().width), rowH: Math.round(row.getBoundingClientRect().height), head: (() => { const hd = document.querySelector('#main .track-table__head'); return hd && getComputedStyle(hd).display; })(), playBtnRight: Math.round(innerWidth - play.right), playBtnX: Math.round(play.x), touchAction: getComputedStyle(row).touchAction }; })()`), await noHScroll(c));
  const rowId = await c.eval(`document.querySelectorAll('#main .track-row')[3].getAttribute('data-track-id')`);
  const rr = await c.eval(`(() => { const r = document.querySelectorAll('#main .track-row')[3]; r.scrollIntoView({ block: 'center' }); const t = r.querySelector('.track-row__title').getBoundingClientRect(); return { x: t.x + 10, y: t.y + t.height / 2 }; })()`);
  await c.sleep(200);
  const rr2 = await c.eval(`(() => { const r = document.querySelectorAll('#main .track-row')[3]; const t = r.querySelector('.track-row__title').getBoundingClientRect(); return { x: t.x + 10, y: t.y + t.height / 2 }; })()`);
  await c.tap(rr2.x, rr2.y); await c.sleep(700);
  let s = await h.state(c);
  c.out('ITEM12 tap row', { rowId, cur: s.cur, ok: s.cur === rowId, ctx: s.ctx, playing: s.isPlaying, eng: s.eng, rowCls: await c.eval(`document.querySelectorAll('#main .track-row')[3].className`), selected: await c.eval(`document.querySelectorAll('#main .is-selected').length`) });
  // tap on the row's more opens menu, not play
  const curBefore = s.cur;
  const moreR = await c.eval(`(() => { const r = document.querySelectorAll('#main .track-row')[5]; const b = r.querySelector('.track-row__more').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, vis: getComputedStyle(r.querySelector('.track-row__more')).visibility }; })()`);
  await c.tap(moreR.x, moreR.y); await c.sleep(400);
  c.out('ITEM12 tap more', { moreVis: moreR.vis, menu: await m.menuItems(c), curUnchanged: (await h.state(c)).cur === curBefore, menuBox: await c.eval(`(() => { const b = document.querySelector('#context-menu').getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) }; })()`) });
  // ---- item 6 at mobile: like via the row menu
  const likeTid = await c.eval(`document.querySelectorAll('#main .track-row')[5].getAttribute('data-track-id')`);
  await m.clickMenu(c, 'Save to your Liked Songs');
  c.out('ITEM6m menu like', { liked: await c.eval(`Library.isLiked('${likeTid}')`), toast: await m.toast(c) });
  // like the current track from the mini player
  c.out('ITEM6m mini before', await mini());
  const ml = await c.rect('#mini-player .mp-like');
  await c.tap(ml.x, ml.y); await c.sleep(400);
  c.out('ITEM6m mini like', await mini(), { lib: await c.eval(`Library.isLiked(Player.getState().currentTrackId)`), toast: await m.toast(c), expanded: await c.eval(`!document.querySelector('#expanded-player').hidden`) });
  // row menu reflects like state for the current track
  const curIdx = await c.eval(`[...document.querySelectorAll('#main .track-row')].findIndex(r => r.getAttribute('data-track-id') === Player.getState().currentTrackId)`);
  // ---- open expanded via tap on the mini player
  const mb = await c.rect('#mini-player .mini-player__open');
  c.out('mini open rect', mb);
  const mpr = await c.rect('#mini-player');
  await c.tap(mpr.x - mpr.w * 0.15, mpr.y); await c.sleep(600);
  const xp = () => c.eval(`(() => { const x = document.querySelector('#expanded-player'); const b = x.getBoundingClientRect(); const vis = (s) => { const e = x.querySelector(s); return e ? [...e.querySelectorAll('svg')].filter(v => !v.hasAttribute('hidden')).map(v => v.querySelector('use').getAttribute('href')).join(',') + '|' + (e.getAttribute('aria-label') || '') + (e.classList.contains('is-active') ? '|active' : '') : null; }; return { hidden: x.hidden, d: getComputedStyle(x).display, box: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)], eyebrow: (x.querySelector('.xp-eyebrow') || {}).textContent, ctxName: (x.querySelector('.xp-ctx-name') || {}).textContent, title: (x.querySelector('.xp__title') || {}).textContent, artist: (x.querySelector('.xp__artist') || {}).textContent, elapsed: (x.querySelector('.xp-elapsed') || {}).textContent, remaining: (x.querySelector('.xp-remaining') || {}).textContent, play: vis('.xp-play'), like: vis('.xp-like'), shuffle: vis('.xp-shuffle'), repeat: vis('.xp-repeat'), coverW: Math.round((x.querySelector('.xp__cover img, .xp__cover') || x).getBoundingClientRect().width), sw: x.scrollWidth, cw: x.clientWidth }; })()`);
  c.out('ITEM12 expanded open', await xp());
  // ---- item 3 at mobile via expanded controls
  const xpPlay = await c.rect('#expanded-player .xp-play');
  await c.tap(xpPlay.x, xpPlay.y); await c.sleep(300);
  const p1 = await h.state(c);
  await c.sleep(1000);
  await c.tap(xpPlay.x, xpPlay.y); await c.sleep(300);
  const p2 = await h.state(c);
  c.out('ITEM3m pause/resume', { paused: { playing: p1.isPlaying, eng: p1.eng, pos: p1.engPos }, resumed: { playing: p2.isPlaying, pos: p2.engPos, diff: +(p2.engPos - p1.engPos).toFixed(2) }, xpPlayIcon: (await xp()).play });
  // seek via the expanded slider: tap at 60%
  const xs = await c.rect('#expanded-player .slider--progress');
  c.out('xp slider rect', xs);
  await c.tap(xs.x - xs.w / 2 + xs.w * 0.6, xs.y); await c.sleep(500);
  let sk = await h.state(c);
  c.out('ITEM3m seek tap', { pos: sk.engPos, dur: sk.dur, ratio: +(sk.engPos / sk.dur).toFixed(2), playing: sk.isPlaying, eng: sk.eng, x: await xp() });
  if (Math.abs(sk.engPos / sk.dur - 0.6) > 0.05) {
    // fallback: mouse click on the slider
    await c.click(xs.x - xs.w / 2 + xs.w * 0.6, xs.y); await c.sleep(500);
    sk = await h.state(c);
    c.out('ITEM3m seek mouse click', { pos: sk.engPos, ratio: +(sk.engPos / sk.dur).toFixed(2), playing: sk.isPlaying });
  }
  await c.sleep(1000);
  // previous >3s restarts (expanded prev)
  const cur0 = (await h.state(c)).cur;
  const xprev = await c.rect('#expanded-player .xp-prev');
  await c.tap(xprev.x, xprev.y); await c.sleep(400);
  let pv = await h.state(c);
  c.out('ITEM3m prev>3s', { same: pv.cur === cur0, pos: pv.engPos, playing: pv.isPlaying });
  const xnext = await c.rect('#expanded-player .xp-next');
  await c.tap(xnext.x, xnext.y); await c.sleep(500);
  const nx = await h.state(c);
  await c.tap(xprev.x, xprev.y); await c.sleep(400);
  pv = await h.state(c);
  c.out('ITEM12/3m next then prev<3s', { afterNext: nx.cur, nextChanged: nx.cur !== cur0, afterPrev: pv.cur, back: pv.cur === cur0, playing: pv.isPlaying, xpTitle: (await xp()).title });
  // shuffle / repeat in expanded
  const xsh = await c.rect('#expanded-player .xp-shuffle');
  await c.tap(xsh.x, xsh.y); await c.sleep(300);
  const xr = await c.rect('#expanded-player .xp-repeat');
  await c.tap(xr.x, xr.y); await c.sleep(300);
  const x2 = await xp();
  c.out('ITEM12 xp shuffle/repeat', { shuffle: (await h.state(c)).shuffle, repeat: (await h.state(c)).repeat, btnShuffle: x2.shuffle, btnRepeat: x2.repeat });
  await c.tap(xsh.x, xsh.y); await c.sleep(200); await c.tap(xr.x, xr.y); await c.sleep(200); await c.tap(xr.x, xr.y); await c.sleep(200);
  // like in expanded (unlike current), check mini syncs
  const xl = await c.rect('#expanded-player .xp-like');
  await c.tap(xl.x, xl.y); await c.sleep(300);
  const x3 = await xp();
  c.out('ITEM6m xp like toggle', { xpLike: x3.like, mini: (await mini()).like, lib: await c.eval(`Library.isLiked(Player.getState().currentTrackId)`) });
  await c.tap(xl.x, xl.y); await c.sleep(300);
  c.out('ITEM6m xp like toggle back', { xpLike: (await xp()).like, mini: (await mini()).like, lib: await c.eval(`Library.isLiked(Player.getState().currentTrackId)`) });
  await c.shot('mobile-expanded.png');
  // chevron closes
  const xc = await c.rect('#expanded-player .xp-close');
  await c.tap(xc.x, xc.y); await c.sleep(500);
  c.out('ITEM12 chevron close', { hidden: await c.eval(`document.querySelector('#expanded-player').hidden`), d: await c.eval(`getComputedStyle(document.querySelector('#expanded-player')).display`) });
  // Liked Songs in the library view + liked page
  await tapSel(c, '#bottom-nav .bottom-nav__item[data-route="library"]');
  c.out('ITEM6m library liked row', await c.eval(`(document.querySelector('#main .lib-row[data-context-uri="liked"]') || {}).textContent`));
  await tapSel(c, '#main .lib-row[data-context-uri="liked"]');
  await c.sleep(400);
  c.out('ITEM6m liked page', await c.eval(`({ route: App.currentRoute(), rows: [...document.querySelectorAll('#main .track-row')].map(r => ({ id: r.getAttribute('data-track-id'), date: r.querySelector('.track-row__date') && r.querySelector('.track-row__date').textContent, dateDisplay: r.querySelector('.track-row__date') && getComputedStyle(r.querySelector('.track-row__date')).display })), meta: (document.querySelector('#main .hero__meta') || {}).textContent })`), await noHScroll(c));
  // unlike via row menu on liked page
  const lid = await c.eval(`document.querySelector('#main .track-row').getAttribute('data-track-id')`);
  const lm = await c.eval(`(() => { const b = document.querySelector('#main .track-row .track-row__more').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  await c.tap(lm.x, lm.y); await c.sleep(400);
  await m.clickMenu(c, 'Remove from your Liked Songs');
  c.out('ITEM6m unlike', { liked: await c.eval(`Library.isLiked('${lid}')`), rows: await c.eval(`document.querySelectorAll('#main .track-row').length`), toast: await m.toast(c) });
  // expanded player opening via swipe up and Escape, and the queue button
  const mpr2 = await c.rect('#mini-player');
  await c.swipe(mpr2.x, mpr2.y + 5, mpr2.x, mpr2.y - 120); await c.sleep(600);
  c.out('swipe up opens', await c.eval(`!document.querySelector('#expanded-player').hidden`));
  await c.key({ key: 'Escape', code: 'Escape', keyCode: 27 }); await c.sleep(400);
  c.out('escape closes', await c.eval(`document.querySelector('#expanded-player').hidden`));
  // horizontal scroll checks across views
  const views = [{ view: 'home' }, { view: 'search', query: '' }, { view: 'search', query: 'night' }, { view: 'library' }, { view: 'playlist', id: 'pl_top50global' }, { view: 'album', id: 'al_boathouse' }, { view: 'artist', id: 'ar_marlowvane' }, { view: 'liked' }, { view: 'genre', id: 'ge_pop' }, { view: 'queue' }, { view: 'section', id: 'made-for-you' }];
  const hs = [];
  for (const v of views) { await c.eval(`App.navigate(${JSON.stringify(v)})`); await c.sleep(500); const r = await noHScroll(c); hs.push(v.view + (v.id || v.query || '') + ':' + r.sw + '/' + r.iw + (r.ok ? '' : ' OVERFLOW') + (r.mainSW > r.mainCW ? ' main-overflow ' + r.mainSW + '>' + r.mainCW : '')); }
  c.out('ITEM12 h-scroll', hs);
  c.out('ERR mobile', c.takeErrors());
  // screenshots
  await c.eval(`App.navigate({ view: 'home' })`); await c.sleep(800);
  await c.shot('mobile-home.png');
  await c.eval(`App.navigate({ view: 'playlist', id: 'pl_indiegold' })`); await c.sleep(800);
  await c.shot('mobile-playlist.png');
};
