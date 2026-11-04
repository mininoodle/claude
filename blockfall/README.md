# Blockfall

A minimal falling-block puzzle game in the style of modern guideline clients.

Open `index.html` in a browser. Everything is in that one file: styles and scripts. It needs a keyboard.

## Modes

| Mode | Goal |
|---|---|
| Marathon | Play until you top out. The level goes up every 10 lines, and the pieces fall faster. |
| Sprint 40L | Clear 40 lines as fast as you can. Gravity stays at level 1. Your best time is saved. |

Press Enter on the start screen to play the last mode again.

## Features

- SRS rotation with wall kicks, and 180° rotation with the TETR.IO SRS+ kick table
- 7-bag randomizer, 5-piece next queue, hold, ghost piece
- Lock delay and lock resets, both configurable. A move resets the lock timer only while the piece is on the ground
- T-spin detection (3-corner rule, full and mini), combos, back-to-back and perfect clears
- Attack counter with a TETR.IO-style table, plus APM, PPS, time, score, lines and level
- Handling settings: DAS, ARR (exact below one frame), DCD (DAS cut delay), SDF (soft drop factor, 41 is instant), keep DAS charge on direction change, IRS / IHS
- Display settings: ghost opacity, grid, cell outlines
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

There is no opponent, so attack is only counted.
