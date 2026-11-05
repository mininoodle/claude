#!/usr/bin/env node
// Keyboard use of the settings and the mode buttons outside play, and game keys winning during play
const {launch, open, main} = require('./lib');

main('keyboard', async r => {
  const browser = await launch();
  const {page, errors} = await open(browser, {seed: 3});
  const val = sel => page.$eval(sel, el => el.type === 'checkbox' ? el.checked : el.value);
  const game = () => page.evaluate(() => ({state, mode: cfg.mode, botLevel: cfg.botLevel, bestOf: cfg.bestOf, samePieces: cfg.samePieces, messiness: cfg.messiness}));
  const press = async (sel, key) => { await page.focus(sel); await page.keyboard.press(key); };

  // Start screen: each Opponent control takes its own keys
  await press('#botLevel', 'ArrowRight');
  let g = await game();
  r.check('ready: ArrowRight on the difficulty slider raises the level', g.botLevel === 6 && await val('#botLevel') === '6' && g.state === 'ready', g);
  await page.keyboard.press('End');
  r.check('ready: End on the slider goes to level 10', (await game()).botLevel === 10);
  await page.keyboard.press('Home');
  r.check('ready: Home on the slider goes to level 1', (await game()).botLevel === 1);
  r.check('the slider label follows the keys', (await page.textContent('#botText')).startsWith('Level 1 '), await page.textContent('#botText'));
  await press('#samePieces', 'Space');
  g = await game();
  r.check('ready: Space on Same pieces turns it off', g.samePieces === false && g.state === 'ready', g);
  await page.keyboard.press('Space');
  r.check('ready: Space on Same pieces turns it on again', (await game()).samePieces === true);
  await press('#bestOf', 'ArrowDown');
  g = await game();
  r.check('ready: ArrowDown on Best of changes the number of rounds', g.bestOf === 5 && g.state === 'ready', g);
  await press('#messiness', 'ArrowRight');
  r.check('ready: ArrowRight on Garbage messiness adds 10%', (await game()).messiness === 10 && (await page.textContent('#messText')) === '10%');

  // Enter on a focused mode button starts that mode, not the last one
  await press('#mVersus', 'Enter');
  g = await game();
  r.check('ready: Enter on the Versus button starts Versus', g.state === 'play' && g.mode === 'versus', g);
  r.check('the Versus button lost focus after the start', await page.evaluate(() => document.activeElement === document.body));

  // During play, game keys win over a focused control
  await page.evaluate(() => blockfallTest.setBackend('main'));
  await page.focus('#botLevel');
  const before = await page.evaluate(() => ({x: blockfallTest.players[0].cur.x, lv: cfg.botLevel}));
  await page.keyboard.press('ArrowRight');
  const after = await page.evaluate(() => ({x: blockfallTest.players[0].cur.x, lv: cfg.botLevel}));
  r.check('play: ArrowRight moves the piece and does not change the focused slider', after.x === before.x + 1 && after.lv === before.lv, {before, after});

  // Pause: the pause key still resumes from a focused control, and Space on a mode button restarts in that mode
  await page.keyboard.press('Escape');
  r.check('play: Escape pauses', (await game()).state === 'pause');
  await press('#samePieces', 'Escape');
  r.check('pause: Escape on a focused checkbox resumes', (await game()).state === 'play');
  await page.keyboard.press('Escape');
  await press('#mSprint', 'Space');
  g = await game();
  r.check('pause: Space on the Sprint button starts Sprint', g.state === 'play' && g.mode === 'sprint', g);

  // Key binding slots open with Enter, and Reset all settings works with Enter
  await page.keyboard.press('Escape');
  await press('#bind-left-1', 'Enter');
  r.check('Enter on a key slot starts listening', (await page.textContent('#bind-left-1')) === 'press key');
  await page.keyboard.press('KeyJ');
  r.check('the next key is assigned to that slot', await page.evaluate(() => cfg.keys.left[1] === 'KeyJ'));
  await press('#reset', 'Enter');
  g = await game();
  r.check('Enter on Reset all settings resets the keys and the Opponent settings',
    await page.evaluate(() => cfg.keys.left[1] === '') && g.botLevel === 5 && g.bestOf === 3 && g.messiness === 0, g);

  // With nothing focused, Enter still starts the last mode
  await page.evaluate(() => { start('sprint'); state = 'over'; document.activeElement?.blur(); });
  await page.keyboard.press('Enter');
  g = await game();
  r.check('over: Enter with no focused control starts the last mode', g.state === 'play' && g.mode === 'sprint', g);

  // A key pressed for the game is released for the game, even if play ended in between
  await page.focus('#mMarathon');
  await page.keyboard.down('Space');
  await page.evaluate(() => { state = 'over'; });
  await page.keyboard.up('Space');
  g = await game();
  r.check('a Space press used as hard drop does not click a focused button on release', g.state === 'over' && g.mode === 'sprint', g);

  r.check('no console errors', errors.length === 0, errors);
  await browser.close();
});
