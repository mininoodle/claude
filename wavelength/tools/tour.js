// tools/tour.js — the standard screenshot tour of the real app.
// Usage: node tools/cdp.js tools/tour.js --profile=<you> --fresh --out=<dir>
// Writes: d-home, d-search, d-results, d-playlist (playing), d-rightpanel, d-artist, d-menu, t-home, m-home, m-playlist, m-expanded (.png)
module.exports = async (c) => {
  const errs = [];
  const step = async (name, fn) => { try { await fn(); } catch (e) { c.out('STEP FAILED ' + name + ': ' + (e && e.message)); } errs.push(...c.takeErrors().map((x) => name + ': ' + x)); };
  await c.viewport(1280, 800, false);
  await c.goto();
  await c.sleep(1500);
  await step('d-home', async () => { await c.move(1270, 790); await c.shot('d-home.png'); });
  await step('d-search', async () => { await c.eval(`App.navigate({ view: 'search', query: '' })`); await c.sleep(900); await c.shot('d-search.png'); });
  await step('d-results', async () => { await c.eval(`App.navigate({ view: 'search', query: 'night' })`); await c.sleep(900); await c.shot('d-results.png'); });
  await step('d-playlist', async () => {
    await c.eval(`App.navigate({ view: 'playlist', id: 'pl_latenightdrive' })`); await c.sleep(1000);
    const hp = await c.rect('#main .actions .play-btn');
    if (hp) { await c.click(hp.x, hp.y); await c.sleep(1200); }
    await c.move(640, 620); await c.sleep(300);
    await c.shot('d-playlist.png');
  });
  await step('d-rightpanel', async () => { await c.eval(`App.setRightPanel('now-playing')`); await c.sleep(900); await c.move(640, 300); await c.shot('d-rightpanel.png'); await c.eval(`App.setRightPanel(null)`); });
  await step('d-artist', async () => { await c.eval(`App.navigate({ view: 'artist', id: Catalog.artists[0].id })`); await c.sleep(1000); await c.shot('d-artist.png'); });
  await step('d-menu', async () => {
    await c.eval(`App.navigate({ view: 'album', id: Catalog.albums[2].id })`); await c.sleep(900);
    const r = await c.rect('#main .track-row');
    if (r) { await c.click(r.x, r.y, { button: 'right' }); await c.sleep(500); }
    await c.shot('d-menu.png');
    await c.key({ key: 'Escape', code: 'Escape', keyCode: 27 });
  });
  await step('t-home', async () => { await c.viewport(900, 800); await c.eval(`App.navigate({ view: 'home' })`); await c.sleep(900); await c.shot('t-home.png'); });
  await step('m-home', async () => { await c.viewport(390, 844, true); await c.reload(); await c.sleep(1200); await c.shot('m-home.png'); });
  await step('m-playlist', async () => { await c.eval(`App.navigate({ view: 'playlist', id: 'pl_chillvibes' })`); await c.sleep(1000); await c.shot('m-playlist.png'); });
  await step('m-expanded', async () => {
    const pb = await c.rect('#main .actions .play-btn');
    if (pb) { await c.tap(pb.x, pb.y); await c.sleep(1000); }
    await c.eval(`Player.openExpanded()`); await c.sleep(900);
    await c.shot('m-expanded.png');
    await c.eval(`Player.closeExpanded(); Player.pause()`);
  });
  c.out('PAGE ERRORS: ' + JSON.stringify(errs));
  c.out('hscroll at phone: ' + JSON.stringify(await c.eval('document.documentElement.scrollWidth > innerWidth')));
};
