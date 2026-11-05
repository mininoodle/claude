# Blockfall tests

Tools to test the game and the Versus bot. You do not need them to play: the game is only `../index.html`.

## Setup

You need Node.js 18 or newer and Playwright with Chromium:

```bash
npm install playwright
npx playwright install chromium
```

## Files

| File | What it is |
|---|---|
| `e2e/` | End-to-end tests. Each one opens `../index.html` in headless Chromium. |
| `e2e/run-all.js` | Runs every test, one after the other (about 5 minutes). |
| `referee.js` | Runs a bot engine against the real game rules and reports strength, speed and rule mismatches. |
| `referee.html` | A frozen copy of the game before Versus. The referee uses it as the rules reference. |
| `engine-final.js` | The source of the bot that is in the game. |
| `engine-b.js` | The second engine from the benchmark. It is weaker, but about 3 times faster. |
| `stub-engine.js` | A small reference engine. It shows the engine interface and the movement rules in simple code. |
| `SPEC.md` | The spec that Versus mode and the bot were built to. |

## Commands

Run all tests:

```bash
node e2e/run-all.js
```

Run some tests by name:

```bash
node e2e/run-all.js parity versus
```

Test an engine with the referee (level 10, 5 games of 500 pieces):

```bash
node referee.js --engine engine-final.js --seeds 1,2,3,4,5 --pieces 500 --difficulty 10
```

Add `--garbage 4/13` to send 4 garbage lines every 13 pieces.

## Change the bot

1. Edit `engine-final.js`.
2. Check it with the referee. `mismatches`, `spinMismatches` and `holdMismatches` must stay 0.
3. Copy it into the game:

   ```bash
   node e2e/inline-engine.js engine-final.js
   ```

4. Run all tests. The `engine` test fails if the game and `engine-final.js` are different.

Test results and screenshots go to `e2e/out/`, which git ignores.
