const h = require('./h.js');
const m = require('./h2.js');
module.exports = async (c) => {
  await c.viewport(390, 844, true);
  await c.goto();
  await c.sleep(1000);
  c.takeErrors();
  // tap a card -> navigates
  await c.eval(`document.querySelector('#main [data-shelf="discover"]').scrollIntoView({ block: 'center' })`); await c.sleep(400);
  const card = await c.rect('#main [data-shelf="discover"] .card');
  const uri = await c.eval(`document.querySelector('#main [data-shelf="discover"] .card').getAttribute('data-context-uri')`);
  await c.tap(card.x, card.y); await c.sleep(800);
  c.out('tap card', uri, await c.eval('App.currentRoute()'));
  // hero play button (phone equivalent of item 2)
  const hp = await c.rect('#main .actions .play-btn');
  await c.tap(hp.x, hp.y); await c.sleep(700);
  const s1 = await h.state(c);
  await c.sleep(2000);
  const s2 = await h.state(c);
  c.out('ITEM2m hero', { eng: s1.eng, playing: s1.isPlaying, ctx: s1.ctx, title: s1.title, doc: s1.docTitle, adv: +(s2.engPos - s1.engPos).toFixed(2), heroIcon: await c.eval(h.visibleIcon('#main .actions .play-btn')), mini: await c.eval(`({ title: document.querySelector('#mini-player .mini-player__title-text, #mini-player .mini-player__title').textContent, artist: document.querySelector('#mini-player .mini-player__artist').textContent, shown: !document.querySelector('#mini-player').hidden, progress: getComputedStyle(document.querySelector('#mini-player .mini-player__progress')).width })`) });
  // mini swipe left -> next, swipe right -> previous
  const cur0 = (await h.state(c)).cur;
  const mp = await c.rect('#mini-player');
  await c.swipe(mp.x + 60, mp.y, mp.x - 60, mp.y); await c.sleep(600);
  const a = await h.state(c);
  await c.swipe(mp.x - 60, mp.y, mp.x + 60, mp.y); await c.sleep(600);
  const b = await h.state(c);
  c.out('mini swipe', { start: cur0, afterLeft: a.cur, changed: a.cur !== cur0, idxL: a.idx, afterRight: b.cur, back: b.cur === cur0, expandedOpen: await c.eval(`!document.querySelector('#expanded-player').hidden`) });
  // open expanded via tap on title, then the more button, artist tap, queue button
  await c.eval(`Player.openExpanded()`); await c.sleep(500);
  const more = await c.rect('#expanded-player .xp-more');
  await c.tap(more.x, more.y); await c.sleep(400);
  c.out('xp more menu', await m.menuItems(c), await c.eval(`(() => { const b = document.querySelector('#context-menu').getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), right: Math.round(b.right), z: getComputedStyle(document.querySelector('#context-menu')).zIndex }; })()`));
  await c.key({ key: 'Escape', code: 'Escape', keyCode: 27 }); await c.sleep(300);
  c.out('after esc menu: xp open?', await c.eval(`!document.querySelector('#expanded-player').hidden`), 'menu hidden', await c.eval(`document.querySelector('#context-menu').hidden`));
  if (await c.eval(`document.querySelector('#expanded-player').hidden`)) { await c.eval(`Player.openExpanded()`); await c.sleep(400); }
  const q = await c.rect('#expanded-player .xp-queue');
  await c.tap(q.x, q.y); await c.sleep(600);
  c.out('xp queue button', await c.eval(`({ route: App.currentRoute(), xpHidden: document.querySelector('#expanded-player').hidden, h1: (document.querySelector('#main h1') || {}).textContent, secs: [...document.querySelectorAll('#main .queue-section__title')].map(e => e.textContent.trim()) })`));
  await c.eval(`Player.openExpanded()`); await c.sleep(500);
  const art = await c.rect('#expanded-player .xp__artist a, #expanded-player .xp__artist');
  await c.tap(art.x, art.y); await c.sleep(600);
  c.out('xp artist tap', await c.eval(`({ route: App.currentRoute(), xpHidden: document.querySelector('#expanded-player').hidden })`));
  // swipe down to close
  await c.eval(`Player.openExpanded()`); await c.sleep(500);
  const cov = await c.rect('#expanded-player .xp__cover');
  const pre = (await h.state(c)).cur;
  await c.swipe(cov.x + 70, cov.y, cov.x - 70, cov.y); await c.sleep(600);
  c.out('xp cover swipe left', { changed: (await h.state(c)).cur !== pre });
  await c.swipe(cov.x, cov.y - 50, cov.x, cov.y + 120); await c.sleep(600);
  c.out('xp swipe down closes', await c.eval(`document.querySelector('#expanded-player').hidden`));
  c.out('h-scroll 390', await c.eval(`({ sw: document.documentElement.scrollWidth, iw: innerWidth })`));
  c.out('ERR', c.takeErrors());
};
