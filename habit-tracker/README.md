# Habit Tracker

A monthly habit tracker, in three forms. All three share the same model: up to 12 habits, one tick per habit per day, a daily mood (1-10) and hours of sleep, and the same statistics (Goal / Done / Left, daily and weekly progress, per-habit analysis, top habits).

| Folder | What it is | Where data lives |
|---|---|---|
| `index.html` | Phone app. Vertical layout with four screens: Today, Month, Stats, Journal. | The phone's browser storage (`localStorage`). Export and import from Settings. |
| `web/index.html` | Desktop web app, published as a Claude artifact. Wide month grid, all panels on one page. | The artifact's database when opened through claude.ai, otherwise the browser. |
| `spreadsheet/` | The original Google Sheets / Excel version and the Python script that builds it. | The workbook. |

## Phone app

Open `index.html` in a phone browser and use "Add to Home screen", or wrap it with Capacitor to make an APK:

```
npm init -y && npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Habit Tracker" com.nuno.habits --web-dir www   # with index.html copied to www/
npx cap add android && npx cap open android
```

Features:

- **Today**: one toggle per habit, progress ring, "Tick all", mood and sleep steppers.
- **Streaks**: current streak and best ever per habit. One missed day per calendar month is forgiven (a "shield") and does not break the streak.
- **Month**: the grid turned vertical, days as rows and habits as columns, jumps to today.
- **Stats**: weekly review card (Monday to Sunday) with a line for next week, month tiles and bars, habits ranked best first, and a year heat map.
- **Journal**: a note per day, the mood and sleep chart, and a "Look back" flashcard deck. One card per past day, flip for the note, with a weekly summary card at every Sunday.
- **Settings**: rename, reorder, recolour and delete habits, a daily reminder (fires while the app is open), JSON export and import, dark and light theme.

## Spreadsheet

`spreadsheet/build.py` writes `Habit_Tracker.xlsx` with `openpyxl`: 12 month tabs, weekday and day-number headers computed from the Year and Month cells, checkbox grid, daily and weekly charts, analysis table and top-10 ranking. In Google Sheets, select the grid (C17:AG28) and use Insert → Checkbox to turn the TRUE/FALSE cells into checkboxes.
