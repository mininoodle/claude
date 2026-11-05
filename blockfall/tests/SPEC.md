# Blockfall: versus mode with a search bot - build spec

This is the spec the Versus mode and the bot were built to. `BOT` means this `tests/` folder.

## 0. Context

- Game: `blockfall/index.html`. It is ONE self-contained HTML file with
  no build step and no dependencies except a Google Fonts stylesheet. Keep it that way: all CSS and JS stay inline.
- The game already has: SRS + SRS+ 180 kicks, 7-bag, hold, ghost, lock delay + lock resets, T-spin 3-corner rule, combos,
  B2B, perfect clears, attack counter (APM), PPS, modes Marathon / Sprint 40L / Blitz 2:00, DAS / ARR / DCD / SDF,
  keep-DAS-charge, IRS / IHS, two remappable keys per action, ghost / grid / outline settings, light and dark themes,
  localStorage settings, a hot-reload snapshot (`window.claude?.hot`, absent outside claude.ai, keep the guards).
  Every one of these must keep working exactly as now in the single-player modes.
- The user wants: an NPC opponent (versus mode) with a strong search bot ("option C": lookahead over the next queue,
  T-spin slot detection, B2B and combo value, runs in a Web Worker) plus a difficulty slider.
- Text rules for anything a user reads (UI copy, README, code comments): plain, simple English, short sentences,
  NEVER the em dash character (use a hyphen), no filler. Code style: match the existing file (compact, 2-space indent,
  short names, few comments).
- Do NOT git commit or push. The lead does that.
- The machine has 4 CPUs and other agents run benchmarks at the same time. Use `--parallel 1` (the default) with the
  referee, and do not start more than one heavy process at a time.
- Chromium and Playwright are installed: `require('playwright')` works from any directory, `chromium.launch()` needs no
  options. Do not install Playwright or browsers.

## 1. Shared tools in BOT (do not modify them; copy if you need a variant)

- `BOT/referee.html` - a frozen copy of the CURRENT game (before versus). It is the rules referee.
- `BOT/stub-engine.js` - a small reference engine that implements the contract in section 2 exactly. Read it first: it
  is the clearest statement of the movement rules (`fits`, `spawnPos`, `step`, `spinOf`, `place`).
- `BOT/referee.js` - runs an engine against the real game rules in headless Chromium:
  `node BOT/referee.js --engine FILE [--seeds 1,2,3] [--pieces 500] [--difficulty 10] [--garbage 4/13] [--maxMs 250] [--json]`
  It drives the game's own `shift / rotate / fall / doHold / hardDrop / lock / tspin` with each plan and reports
  `app` (attack per piece), top-outs, T-spin counts, quads, perfect clears, think time (median, p95), and parity counters:
  `mismatches` (piece not at `expect` after the inputs), `spinMismatches` (`expect.spin` differs from the game's tspin()),
  `holdMismatches`. `--garbage S/E` adds S pending garbage lines every E pieces; a clearing lock cancels pending lines
  with its attack, a non-clearing lock raises up to 8 lines (one hole column per rise).
  Baseline for the stub (difficulty is ignored by the stub): no garbage `app` 0.075, 0 top-outs, 0 mismatches,
  think median about 1.5 ms.

## 2. Bot engine contract

### 2.1 Source format
- One self-contained classic script. No `import`, no `require`, no DOM, no `fetch`. It must run unchanged in:
  (a) a Web Worker created from a Blob of the source text, (b) the main thread (script tag or `new Function(src)()`),
  (c) the referee page. Follow the shape of `stub-engine.js`: an IIFE that sets `globalThis.BlockfallBot = {init, think}`
  and, only inside a worker (`typeof importScripts === 'function'`), sets `onmessage`:
  `{type: 'init', cfg}` -> `init(cfg)`; `{type: 'think', req}` -> `postMessage(think(req))`.
- The source must never contain the text `</script` (it is embedded in a `<script type="text/plain">` block).
- NEVER call `Math.random` (the referee's bag uses it). Use a seeded PRNG from `req.seed`.
  Use `performance.now()` for timing when it exists, else `Date.now()`.
- Deterministic: the same `init` + same `req` (with an unlimited `maxMs`) gives the same response.

### 2.2 init(cfg)
```
{ cols: 10, rows: 24, hidden: 4,                 // rows 0..3 are hidden above the 20 visible rows
  pieces: {I: [m0, m1, m2, m3], J: [...], ...},  // m_r = shape matrix after r clockwise turns, made with the game's own rot().
                                                 // O has 4 identical 2x2 matrices. 1 = filled. matrix[row][col].
  kicks: {JLSTZ: KJ, I: KI, R180: K180},         // objects keyed from+to, e.g. '01', '20'; each value an array of [dx, dy], y DOWN
  atk: {none: [0,0,1,2,4], mini: [0,0,1], full: [0,2,4,6]},   // attack by lines cleared
  comboAtk: [0,0,1,1,1,2,2,3,3,4,4,4,5] }
```

### 2.3 think(req) -> response
Request:
```
{ id: number,
  board: number[24],          // row bitmasks, index 0 = top hidden row; bit c set = column c filled (c = 0 is the left column)
  cur: 'T',                   // current piece, already spawned
  curPos: {x, y, r},          // its matrix top-left position and rotation (0..3); it has not moved yet
  hold: 'I' | null, canHold: boolean,
  queue: ['S', 'Z', ...],     // next pieces, at least 5
  b2b: -1 | 0 | 1 | ...,      // -1 = no chain; >= 0 = the last clear was B2B-eligible, so the next eligible clear gets +1 attack
  combo: -1 | 0 | ...,        // -1 = no combo; the next clearing lock makes combo = combo + 1
  incoming: number,           // garbage lines waiting for this player
  incomingReady: number,      // lines whose delay is over: they rise on the next lock that clears nothing (max 8 per lock)
  difficulty: 1..10,
  seed: number,               // for the engine's own randomness (mistakes)
  maxMs: number }             // wall-clock safety limit for this call
```
Response:
```
{ id,                         // same as request
  hold: boolean,              // true: press hold first (only if canHold). The new current piece is req.hold, or queue[0] if hold was empty.
  inputs: ['cw', 'left', 'left', 'sonic', 'ccw'],   // applied in order after the optional hold; the game then hard drops
  expect: {t, x, y, r, spin}, // where the piece is after the inputs; spin = the game's tspin() value there (0, 1 mini, 2 full)
  dead: false,                // true only if there is no legal placement at all (then inputs = [], expect = null)
  nodes, ms }                 // statistics, any meaning
```
Input vocabulary and exact game semantics (see `step()` in stub-engine.js):
- `left` / `right`: move 1 column if it fits. Clears the "last move was a rotation" flag.
- `down`: move down 1 row if it fits. Clears the rotation flag.
- `sonic`: move down to the lowest reachable row in the current column (the game's `fall(ghostY())`). Clears the
  rotation flag only if the piece moved.
- `cw` / `ccw` / `180`: rotate with kicks: try each [dx, dy] of the kick list in order and take the first that fits.
  90-degree turns use `I` kicks for I and `JLSTZ` kicks for the others; 180 uses `R180` for every piece. O never rotates.
  Sets the rotation flag; records the kick index (for 180 the game records 0).
- The final state MUST be resting (cannot move down 1 row). The game hard drops after the inputs, so a resting piece
  does not move and its T-spin status is kept.

### 2.4 Game rules to model (identical to the game; stub-engine.js implements them)
- `fits`: every filled cell must have 0 <= x < cols and y < rows; cells with y < 0 are allowed (empty space above row 0);
  cells with y >= 0 must be empty.
- Spawn (for hold and for every lookahead piece): x = 4 for O, else 3; y = hidden - 2; while it does not fit and y > -1,
  y--; if it still does not fit, that player is dead (block out); then if it fits at y + 1, y++. Rotation 0.
- Hold: allowed once per piece. Swaps the current piece with the hold piece (or takes queue[0] if hold is empty) and
  spawns the new current piece. Hold becomes allowed again after the next lock.
- Lock: cells with y < 0 are dropped. If every cell has y < hidden (= 4) the player is dead (lock out).
  Full rows are removed and empty rows are added at the top.
- T-spin (only for T, and only if the last successful input was a rotation): corners of the 3x3 matrix
  TL (0,0), TR (2,0), BR (2,2), BL (0,2) relative to (x, y); a corner is solid if it is outside the board (x < 0, x >= cols,
  y >= rows) or filled. Fewer than 3 solid -> 0. Else the two "front" corners for rotation r are r0: TL+TR, r1: TR+BR,
  r2: BR+BL, r3: BL+TL. Both front corners solid, or the last rotation used kick index 4 (90-degree turns only) -> 2 (full),
  else 1 (mini).
- Attack for a lock that clears n lines: base = atk[kind][n] (kind none / mini / full). If n > 0:
  B2B-eligible = (n == 4 or spin > 0). If eligible: b2b++, and if b2b > 0 then +1 attack. Else b2b = -1.
  Then combo++; if combo > 0: + comboAtk[min(combo, 12)]. If the board is empty after the clear: +10 (perfect clear).
  If n == 0: combo = -1 (b2b unchanged).
- Garbage (versus): attack first cancels this player's own incoming lines (oldest first), the rest is sent.
  A lock that clears nothing raises up to 8 READY incoming lines (rows pushed in at the bottom, one hole column per
  attack). If a raised row pushes filled cells above row 0, that player is dead.

### 2.5 Difficulty
- The ENGINE maps `difficulty` 1..10 to its search settings (depth, beam width, which features, mistake rate).
  The GAME maps difficulty to speed (pieces per second, section 4.6). Mistakes use the PRNG from `req.seed`.
- Low levels must look like a weak human: no lookahead, no T-spin building at 1-3, frequent sub-optimal choices
  (but never a placement that tops out when another placement does not). Level 10 is the full-strength search.
- The search budget for each level must be a deterministic node / beam limit (results are reproducible); `maxMs` is
  only a safety stop.
- Speed limits on this machine, measured uncontended with the referee: think p95 <= 120 ms at difficulty 10,
  <= 60 ms at difficulty 7, <= 25 ms at difficulty 1-4. (The game asks for a plan at 3 pieces per second at level 10.)

### 2.6 Strength targets (referee, difficulty 10, seeds 1-5, 500 pieces each)
- Hard requirements: 0 mismatches, 0 spinMismatches, 0 holdMismatches, 0 errors, 0 top-outs without garbage.
- Goals: `app` >= 0.45 without garbage; with `--garbage 4/13` 0 top-outs on seeds 1-3; regular TSDs and quads;
  `app` and survival should rise with difficulty (report a table for difficulty 1, 3, 5, 7, 10).
- Report the numbers you actually measured. Do not round them up or leave out bad runs.

## 3. What the game sends the engine (versus)
The game creates the worker once, sends `init` with its own tables (exactly as `referee.js` does in `setup()`), and
sends one `think` per bot piece right after that piece spawns. The bot piece has no gravity and no lock timer; the game
replays the plan's inputs spread over the piece's time slot, then hard drops.

## 4. Versus mode (game side)

### 4.1 Restructure
- Move all per-player game state and rules into a player object (class or factory), so the game can run two boards:
  board, cur, hold, canHold, queue, bag + its own seeded RNG, score, lines, level, attack, combo, b2b, pieces, gAcc,
  lockT, lockResets, lowestY, lastRot, lastKick, incoming garbage, alive flag, action text timer, and the rule
  functions (fits, spawn, next, shift, rotate, fall, ghostY, hardDrop, doHold, tspin, lock).
- Human-only state stays global and acts on player 0: DAS / ARR / DCD (`dirs`, `repeatFrom`, `steps`), soft drop,
  IRS / IHS, keys. Gravity and lock delay apply to the human player; the bot player has neither.
- Bags: each player has its own seeded PRNG (mulberry32 is fine). Single-player modes use a random seed. Versus with
  "Same pieces" on gives both players the same seed each round (a new seed every round).

### 4.2 Garbage system (versus only)
- Incoming queue per player: entries `{lines, hole, t}` where `t` counts down the garbage delay of 500 ms (only while
  playing). Sending: at a clearing lock, attack first cancels the player's own incoming lines (oldest entries first),
  the rest becomes one new entry on the opponent's queue.
- Rising: at a lock that clears nothing, take READY lines (t <= 0) oldest first, at most 8 per lock (an entry may be
  split), and push them in at the bottom: grey cells (board value 'G') with one hole per entry. Hole column: random,
  and different from the previous entry's hole when possible. Setting "Garbage messiness" m%: each line after the
  first in an entry moves its hole to a new random column with probability m%.
  If a rising row pushes filled cells above row 0, that player tops out. Then the next piece spawns (block-out check).
- Incoming meter: a thin vertical bar at the left edge of each well, 1 line = 1 cell of well height, capped at the well
  height. Ready lines in a "danger" color, waiting lines in a "warning" color, drawn from theme tokens.
- New theme tokens (bare :root and both dark blocks): --garbage (grey cells), --danger, --warn. Use existing tokens if
  they fit (for example --Z / --O), but keep them tokens.

### 4.3 Versus flow
- New mode button "Versus" on the start overlay, next to Marathon / Sprint 40L / Blitz 2:00. Enter / the restart key
  restarts the last mode, as now.
- A match is best of N rounds (setting, 1 / 3 / 5 / 7, default 3). Each round both players start at the same time.
  The first player to top out loses the round. Between rounds an overlay shows the round result and the match score,
  with a "Next round" button; Enter also starts the next round. After the last round an overlay shows the match result
  and both players' match totals: attack, APM, PPS, pieces.
- In versus the level stays 1 (constant level-1 gravity for the human); no Sprint / Blitz end checks.
- Pause (key) pauses both players and the bot (the bot uses game time, never wall-clock timers, for its schedule).
- Single-player modes have no opponent and no garbage; attack is only counted, as now.

### 4.4 Bot controller (player 1)
- One controller per bot-driven player. On each spawn it sends a request (section 2.3) and records the piece start time
  (game time). Period = 1000 / pps(difficulty) ms. When the response with the current id arrives, schedule the hold
  (if any) and the inputs evenly from now until pieceStart + 0.85 * period, and the hard drop at
  max(pieceStart + period, after the last input). Run due steps from the per-tick update. Before the hard drop, check the
  piece against `expect`: position (t, x, y, r) and spin (the player's tspin() value). Count position mismatches in
  `botMismatch` and spin mismatches in `botSpinMismatch`, and hard drop anyway. Ignore stale responses
  (old id, or from an earlier round).
- Backends: "worker" (default: Worker from a Blob of the engine source) and "main" (call `BlockfallBot.think`
  synchronously on the main thread). If creating the worker throws or the worker errors, fall back to "main".
- The engine source sits in the page as `<script id="bot-engine" type="text/plain">` between the exact lines
  `/* BOT ENGINE START */` and `/* BOT ENGINE END */`, so it can be swapped. For main-thread use, run the source
  once with `new Function(src)()` and use `globalThis.BlockfallBot`.

### 4.5 Opponent column
- In versus, show the bot's board to the right of the player's Next column: a smaller well (CSS width about
  min(200px, 44vw)), its incoming meter, a label "Bot, level N", its hold and next pieces (small), its attack text, and
  its Attack / APM / PPS. Hidden in single-player modes. The `.game` row must wrap at phone width (about 400px) so
  the opponent goes below, with no horizontal page scroll. Widen `main` as needed (about 900px).

### 4.6 Settings: new section "Opponent"
- Difficulty slider `id="botLevel"` 1..10, default 5, with a live label such as "Level 6 - about 1.4 pieces per second".
  Speed table (pieces per second): 1: 0.4, 2: 0.55, 3: 0.7, 4: 0.9, 5: 1.1, 6: 1.4, 7: 1.7, 8: 2.0, 9: 2.5, 10: 3.0.
  A change applies from the bot's next piece.
- "Best of" select (1, 3, 5, 7; default 3), "Same pieces" checkbox (default on), "Garbage messiness" range 0..100
  step 10 (default 0, shown as %).
- All saved in `cfg` like the other settings (add them to `TUNE` so load validation and "Reset all settings" cover
  them). Accept `mode: 'versus'` when loading.

### 4.7 Test hooks
Expose `window.blockfallTest = {...}` with at least: `players` (getter), `vs` (getter for match state),
`setBackend('main' | 'worker')`, `step(ms)` (advance the game synchronously in 16 ms ticks without rAF; with the main
backend the bot plans synchronously, so a whole match can run in one call), `humanBot(level | null)` (when set, player 0
is also driven by a bot controller at that level, for bot-vs-bot tests; it also works in Marathon), and the
`botMismatch` and `botSpinMismatch` counts.
Rules parity check: with `humanBot(10)` in Marathon, the main backend and the stub engine, 500 pieces must give
`botMismatch` 0 and `botSpinMismatch` 0. The stub models the OLD rules exactly, so this proves the restructure kept them.

### 4.8 Must not break
All single-player behaviour listed in section 0, the hot snapshot guards, theme handling, settings persistence,
keyboard focus rules (bound keys call preventDefault; buttons blur on start), and no console errors.
