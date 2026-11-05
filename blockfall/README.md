# Blockfall

A minimal falling-block puzzle game in the style of modern guideline clients.

Open `index.html` in a browser. Everything is in that one file: styles and scripts. It needs a keyboard.

## Modes

| Mode | Goal |
|---|---|
| Marathon | Play until you top out. The level goes up every 10 lines, and the pieces fall faster. |
| Sprint 40L | Clear 40 lines as fast as you can. Gravity stays at level 1. Your best time is saved. |
| Blitz 2:00 | Score as many points as you can in 2 minutes. The level goes up every 10 lines, as in Marathon. Your best score is saved. |
| Versus | Play a match against a bot. Your attack goes to the bot as garbage lines, and its attack comes to you. The first player to top out loses the round. |

Press Enter on the start screen to play the last mode again.

## Features

- SRS rotation with wall kicks, and 180° rotation with the TETR.IO SRS+ kick table
- 7-bag randomizer, 5-piece next queue, hold, ghost piece
- Lock delay and lock resets, both configurable. A move resets the lock timer only while the piece is on the ground
- T-spin detection (3-corner rule, full and mini), combos, back-to-back and perfect clears
- Attack counter with a TETR.IO-style table, plus APM, PPS, time, score, lines and level
- Handling settings: DAS, ARR (exact below one frame), DCD (DAS cut delay), SDF (soft drop factor, 41 is instant), keep DAS charge on direction change, IRS / IHS
- Display settings: ghost opacity, grid, cell outlines
- Versus mode against a search bot, with a difficulty slider from 1 to 10
- Two remappable keys for each action
- Light and dark mode, from the system setting

## Default keys

| Action | Keys |
|---|---|
| Move left / right | ← → |
| Soft drop | ↓ |
| Hard drop | Space |
| Rotate right | ↑, X |
| Rotate left | Z, Left Ctrl |
| Rotate 180 | A |
| Hold | C, Left Shift |
| Pause | Esc |
| Restart | R |

To change a key, click its slot under Controls and press the new key. Press Backspace to clear a slot. Keys and settings are saved in the browser.

## Attack table

| Clear | Lines sent |
|---|---|
| Single / Double / Triple / Quad | 0 / 1 / 2 / 4 |
| T-Spin Single / Double / Triple | 2 / 4 / 6 |
| T-Spin Mini Single / Double | 0 / 1 |
| Back-to-back | +1 |
| Combo | 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, then 5 |
| Perfect clear | +10 |

In Marathon, Sprint and Blitz, attack is only counted. In Versus it goes to the other player as garbage.

## Versus

A match is best of 1, 3, 5 or 7 rounds. Between rounds, press Enter or click Next round.

Garbage rules:

- Your attack first cancels your own incoming lines, oldest first. The rest goes to the other player.
- Incoming lines wait 500 ms. The bar left of each well shows them: yellow lines are still waiting, red lines are ready.
- When you lock a piece that clears no lines, up to 8 ready lines rise from the bottom of your well.
- All lines of one attack have the same hole. The next attack has its hole in a different column.
- If rising lines push blocks out of the top of the well, you top out.

Settings, under Opponent:

| Setting | What it does |
|---|---|
| Difficulty | How well and how fast the bot plays (see the table below). A change starts with the bot's next piece. |
| Best of | The number of rounds in a match. |
| Same pieces | Both players get the same piece order each round. |
| Garbage messiness | The chance that the hole moves to a new column between the lines of one attack. |

| Level | Pieces per second | How it plays |
|---|---|---|
| 1-3 | 0.4, 0.55, 0.7 | Drops pieces straight down, does not look ahead, and makes mistakes |
| 4-6 | 0.9, 1.1, 1.4 | Looks 1 to 3 pieces ahead, builds T-spins, and makes fewer mistakes |
| 7-9 | 1.7, 2.0, 2.5 | Looks 4 to 6 pieces ahead and makes no mistakes |
| 10 | 3.0 | Looks through the whole next queue with the widest search |

At level 10 the bot sends about 140 to 170 lines per minute, which is close to top human players.

The bot runs in a Web Worker, so the game stays smooth while it thinks. If the browser cannot start a worker, the bot runs on the main thread, and the game can stutter a little at high levels.

## Tests

The `tests/` folder has an end-to-end test suite and a rules referee for the bot. See [`tests/README.md`](tests/README.md).
