const h = require('./h.js');
const m = require('./h2.js');
module.exports = async (c) => {
  await c.goto();
  await c.sleep(800);
  c.takeErrors();
  // first trusted gesture: click the first quick tile play overlay? use a card play button
  await c.eval(`document.querySelector('[data-shelf="made-for-you"]').scrollIntoView({block:'center'})`); await c.sleep(300);
  const card = await c.rect('[data-shelf="made-for-you"] .card:nth-child(2)');
  await c.move(card.x, card.y); await c.sleep(300);
  const btn = await c.rect('[data-shelf="made-for-you"] .card:nth-child(2) .play-btn');
  await c.click(btn.x, btn.y); await c.sleep(700);
  let s = await h.state(c);
  c.out('start', { cur: s.cur, idx: s.idx, ctx: s.ctx, eng: s.eng });
  // ---- item 4: next advances (trusted click on next)
  const order = await c.eval(`Player.getState().order`);
  const nb = await c.rect('#player-bar .pb-next');
  await c.click(nb.x, nb.y); await c.sleep(500);
  s = await h.state(c);
  c.out('ITEM4 next', { cur: s.cur, expected: order[1], idx: s.idx, playing: s.isPlaying, eng: s.eng });
  // jump to the last track of the context
  await c.eval(`(() => { const st = Player.getState(); Player.playContext({ uri: st.context.uri, name: st.context.name, trackIds: st.context.trackIds, startIndex: st.context.trackIds.length - 1 }); })()`);
  await c.sleep(500);
  s = await h.state(c);
  const lastId = s.cur;
  c.out('ITEM4 at last', { idx: s.idx, n: order.length, cur: s.cur, repeat: s.repeat, playing: s.isPlaying });
  await c.click(nb.x, nb.y); await c.sleep(500);
  s = await h.state(c);
  c.out('ITEM4 next on last (repeat off)', { cur: s.cur, sameTrack: s.cur === lastId, playing: s.isPlaying, eng: s.eng, pos: s.pos, docTitle: s.docTitle, nextDisabled: await c.eval(`document.querySelector('#player-bar .pb-next').disabled`) });
  // natural end on last track with repeat off
  await c.eval(`Player.play()`); await c.sleep(300);
  await c.eval(`Player.seek(Player.getState().duration - 1.2)`); await c.sleep(2600);
  s = await h.state(c);
  c.out('ITEM4 natural end last track repeat off', { cur: s.cur, sameTrack: s.cur === lastId, playing: s.isPlaying, eng: s.eng, pos: s.pos });
  // repeat context via trusted click on repeat button
  const rb = await c.rect('#player-bar .pb-repeat');
  await c.click(rb.x, rb.y); await c.sleep(200);
  const rep1 = await c.eval(`(() => { const b = document.querySelector('#player-bar .pb-repeat'); return { label: b.getAttribute('aria-label'), active: b.classList.contains('is-active'), icon: b.querySelector('use').getAttribute('href'), repeat: Player.getState().repeat }; })()`);
  c.out('ITEM4 repeat btn 1', rep1);
  await c.eval(`Player.play()`); await c.sleep(300);
  await c.click(nb.x, nb.y); await c.sleep(500);
  s = await h.state(c);
  c.out('ITEM4 repeat context wrap via next', { cur: s.cur, expectedFirst: order[0], idx: s.idx, playing: s.isPlaying });
  // natural wrap: go to last, seek near end
  await c.eval(`(() => { const st = Player.getState(); Player.playContext({ uri: st.context.uri, name: st.context.name, trackIds: st.context.trackIds, startIndex: st.context.trackIds.length - 1 }); })()`);
  await c.sleep(400);
  await c.eval(`Player.seek(Player.getState().duration - 1.2)`); await c.sleep(2600);
  s = await h.state(c);
  c.out('ITEM4 repeat context natural wrap', { cur: s.cur, expectedFirst: order[0], idx: s.idx, playing: s.isPlaying, eng: s.eng, pos: s.pos });
  // repeat track
  await c.click(rb.x, rb.y); await c.sleep(200);
  const rep2 = await c.eval(`(() => { const b = document.querySelector('#player-bar .pb-repeat'); return { label: b.getAttribute('aria-label'), active: b.classList.contains('is-active'), icon: b.querySelector('use').getAttribute('href'), repeat: Player.getState().repeat }; })()`);
  c.out('ITEM4 repeat btn 2', rep2);
  const before = (await h.state(c)).cur;
  // monitor flicker
  await c.eval(`window.__qaEv = []; Player.on('statechange', p => window.__qaEv.push('state:' + p)); Player.on('trackchange', t => window.__qaEv.push('track:' + (t && t.id)));`);
  await c.eval(`Player.seek(Player.getState().duration - 1.2)`); await c.sleep(2600);
  s = await h.state(c);
  c.out('ITEM4 repeat track replay', { before, cur: s.cur, same: s.cur === before, pos: s.pos, eng: s.eng, playing: s.isPlaying, events: await c.eval('window.__qaEv') });
  await c.click(rb.x, rb.y); await c.sleep(200);
  const rep3 = await c.eval(`(() => { const b = document.querySelector('#player-bar .pb-repeat'); return { label: b.getAttribute('aria-label'), active: b.classList.contains('is-active'), icon: b.querySelector('use').getAttribute('href'), repeat: Player.getState().repeat }; })()`);
  c.out('ITEM4 repeat btn 3 (off)', rep3);
  // shuffle
  const upBefore = await c.eval(`Player.upcoming(50).map(u => u.trackId)`);
  const curBefore = (await h.state(c)).cur;
  const sb = await c.rect('#player-bar .pb-shuffle');
  await c.click(sb.x, sb.y); await c.sleep(300);
  const upAfter = await c.eval(`Player.upcoming(50).map(u => u.trackId)`);
  s = await h.state(c);
  const shufBtn = await c.eval(`(() => { const b = document.querySelector('#player-bar .pb-shuffle'); return { label: b.getAttribute('aria-label'), active: b.classList.contains('is-active') }; })()`);
  c.out('ITEM4 shuffle', { shuffle: s.shuffle, curSame: s.cur === curBefore, playing: s.isPlaying, lenBefore: upBefore.length, lenAfter: upAfter.length, orderChanged: JSON.stringify(upBefore) !== JSON.stringify(upAfter), sameSet: JSON.stringify([...upBefore].sort()) === JSON.stringify([...upAfter].sort()), orderFirst: (await c.eval('Player.getState().order'))[(await c.eval('Player.getState().index'))] === s.cur, btn: shufBtn });
  await c.click(sb.x, sb.y); await c.sleep(300);
  c.out('ITEM4 unshuffle', { shuffle: (await h.state(c)).shuffle, curSame: (await h.state(c)).cur === curBefore });
  c.out('ERR item4', c.takeErrors());

  // ---- item 5: queue via track row menu
  await c.eval(`App.navigate({ view: 'playlist', id: 'pl_chillvibes' })`); await c.sleep(700);
  // start playing this playlist via the hero play button (trusted)
  const heroPlay = await c.rect('.actions .play-btn');
  await c.click(heroPlay.x, heroPlay.y); await c.sleep(600);
  s = await h.state(c);
  const ctxOrder = await c.eval(`Player.getState().order`);
  c.out('ITEM5 playing', { ctx: s.ctx, cur: s.cur, idx: s.idx });
  const qTrack = await c.eval(`document.querySelectorAll('#main .track-row')[9].getAttribute('data-track-id')`);
  await m.rowMore(c, '#main .track-table .track-row:nth-of-type(10)');
  const items = await m.menuItems(c);
  c.out('ITEM5 track menu items', items);
  await m.clickMenu(c, 'Add to queue');
  c.out('ITEM5 toast', await m.toast(c), 'queue', (await h.state(c)).q, 'expected', qTrack);
  // second queued item (for remove/clear tests) via Player.addToQueue
  const q2 = await c.eval(`document.querySelectorAll('#main .track-row')[12].getAttribute('data-track-id')`);
  await m.rowMore(c, '#main .track-table .track-row:nth-of-type(13)');
  await m.clickMenu(c, 'Add to queue');
  c.out('ITEM5 queue after 2 adds', (await h.state(c)).q, 'upcoming', await c.eval(`Player.upcoming(4)`));
  // queue view
  await c.eval(`App.navigate({ view: 'queue' })`); await c.sleep(500);
  c.out('ITEM5 queue view', await c.eval(`(() => { const secs = [...document.querySelectorAll('#main .queue-section')].map(s => ({ title: s.querySelector('.queue-section__title').textContent.trim(), rows: [...s.querySelectorAll('[data-track-id]')].slice(0,4).map(r => r.getAttribute('data-track-id')), n: s.querySelectorAll('[data-track-id]').length })); return { h1: (document.querySelector('#main h1') || {}).textContent, secs, text: document.querySelector('#main').innerText.slice(0, 300) }; })()`));
  // right panel queue mode via the player bar queue toggle (trusted)
  const qb = await c.rect('#player-bar .pb-queue');
  await c.click(qb.x, qb.y); await c.sleep(500);
  c.out('ITEM5 right panel', await c.eval(`(() => { const rp = document.querySelector('#right-panel'); return { hidden: rp.hidden, dataRight: document.querySelector('#app').dataset.right, qbActive: document.querySelector('#player-bar .pb-queue').classList.contains('is-active'), w: rp.getBoundingClientRect().width, secs: [...rp.querySelectorAll('.queue-section')].map(s => ({ title: s.querySelector('.queue-section__title').textContent.trim(), rows: [...s.querySelectorAll('[data-track-id]')].slice(0,3).map(r => r.getAttribute('data-track-id')) })) }; })()`));
  // Next plays the queued track
  await c.click(nb.x, nb.y); await c.sleep(500);
  s = await h.state(c);
  c.out('ITEM5 next -> queued', { cur: s.cur, expected: qTrack, ok: s.cur === qTrack, idx: s.idx, q: s.q });
  c.out('ITEM5 queue view after next', await c.eval(`[...document.querySelectorAll('#main .queue-section')].map(s => ({ title: s.querySelector('.queue-section__title').textContent.trim(), rows: [...s.querySelectorAll('[data-track-id]')].slice(0,3).map(r => r.getAttribute('data-track-id')) }))`));
  // remove q2 via queue row menu in the queue view
  await m.rowMore(c, '#main [data-section="queue"] .track-row');
  const qitems = await m.menuItems(c);
  await m.clickMenu(c, 'Remove from queue');
  c.out('ITEM5 remove', { firstItem: qitems && qitems[0], toast: await m.toast(c), q: (await h.state(c)).q, rpHasQueueSection: await c.eval(`[...document.querySelectorAll('#right-panel .queue-section__title')].map(e => e.textContent.trim())`) });
  // add 2 more then clear via pill
  await c.eval(`Player.addToQueue([Catalog.tracks[5].id, Catalog.tracks[6].id])`); await c.sleep(300);
  c.out('ITEM5 before clear', (await h.state(c)).q);
  await m.clickSel(c, '#main .queue-clear');
  c.out('ITEM5 after clear', { q: (await h.state(c)).q, viewSecs: await c.eval(`[...document.querySelectorAll('#main .queue-section__title')].map(e => e.textContent.trim())`) });
  // next after queue: continues the context at order[index+1]
  const idxNow = (await h.state(c)).idx;
  await c.click(nb.x, nb.y); await c.sleep(500);
  s = await h.state(c);
  c.out('ITEM5 context continues', { cur: s.cur, expected: ctxOrder[idxNow + 1], ok: s.cur === ctxOrder[idxNow + 1] });
  c.out('ERR item5', c.takeErrors());
};
