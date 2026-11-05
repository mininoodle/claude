# Study site

A single-page study site with subject tabs (Today, Physics, Biology, Chemistry, Math, Language Arts, Social Studies, Test).

Open `index.html` in a browser. Everything is in that one file: styles, scripts and lesson content.

## Contents

| Tab | Units |
|---|---|
| Today | Daily 5-question challenge, weekly goal, level, progress map, achievements |
| Physics | Momentum, Forces and fields |
| Biology | Unit 2: Molecular biology and cell division (Molecular biology section: history of DNA, structure, replication, transcription, translation, mutations, genomes, genetic engineering, epigenetics); Unit 1: Nervous and endocrine systems, in three sections, chosen from their own row under the unit, that each keep their own lessons, reference sheet and review: Nervous system; Senses; Endocrine system (homeostasis and feedback, hormones and receptors, glands and the pituitary, blood sugar and diabetes, stress and the adrenal glands, thyroid and growth, calcium balance, water and salt balance) |
| Chemistry | Unit 1: Thermochemistry (energy and temperature, Q = mcΔt, enthalpy, activation energy and catalysts, enthalpies of formation, calorimetry, Hess’s law by adding equations and by the formation method, efficiency); Unit 2: Equilibrium; Unit 3: Electrochemistry (oxidation and reduction, oxidation numbers, redox tables from evidence, predicting redox reactions, redox titrations, balancing redox equations, disproportionation and voltaic cells, cell potentials, batteries and fuel cells, corrosion, electrolytic cells, Faraday’s law), with the table of standard electrode potentials on its reference sheet |
| Math | Limits and rates of change |
| Language Arts | Prose analysis: diction, syntax, tone, point of view |
| Social Studies | Ideologies and identity (Related Issue 1): ideology, democratic primer, the American political system, translating the will of the people, classical liberalism, thinkers and liberal democracy |
| Test | Build a test from any subjects and units, with optional confidence ratings and a revision section |

In numbers: 12 sections with 93 lessons, 1,472 lesson questions (1,027 multiple choice, 445 numeric), a review bank of 969 questions, 93 challenge problems, 85 question generators and 53 written-response items. `node study-site/test/lint.test.js study-site/index.html` prints these counts for each section, and fails `--strict` when this README no longer matches the page.

## Features

- Sidebar layout: subjects, units, sections and lessons in a rail on the left, a breadcrumb bar at the top, and a lesson column that centres in the window. On wide screens the cards sit two or three across. On a phone the rail becomes a bar at the top
- Lesson notes, interactive figures and quizzes with hints. Try-it tasks: diagram tests, drag the labels, put events in order, match descriptions to terms, and sort items between two labels. The Nervous system and Senses sections take their try-its and extra questions from the class notes, with the diploma questions from the notes in the lesson quizzes. The Endocrine, Momentum, Equilibrium and Thermochemistry sections take their extra questions and matching tasks from the class notepacks and their diploma practice in the same way
- Math: step-by-step worked examples in every lesson (17 question types). Each one gives the method, an example to go through one step at a time with the reason for each step, a common mistake, and a "Your turn" question with new numbers that you can check, with hints that show the solution one step at a time
- Physics, Chemistry and Math: a "How to do the questions" guide in every lesson, placed before the questions. It lists the kinds of question in that lesson, with the steps for each kind and a check that catches the usual mistake. The Momentum unit practice lesson has a guide for the practice exam formats (numerical response, multiple choice, written response)
- Mastery levels for each lesson (Not started, Learning, Practised, Mastered)
- Spaced repetition, review tests and a timed unit exam, drawn from a separate review bank of 969 diploma and IB level questions that are not in the lessons (multi-step calculations, data and graph reading, error analysis, source and passage analysis)
- Boss round, challenge problems, speed rounds and an answer combo
- Achievements: 29 achievements in six categories (Mastery, Practice, Consistency, Challenge, Explorer, Secret), most with Bronze to Diamond tiers (99 tiers), each with a progress bar, XP for every tier, titles from Newcomer to Grandmaster, a closest-to-unlock list, and a celebration card for each new tier. Badges earned before the achievements update are carried over once (their dates are kept) and the tiers already earned from your history appear without a celebration for each one.
- Light and dark mode
- Answers are saved in the browser, with an option to clear each section. A backup file of all progress can be downloaded and restored (the Today page and the account button): restoring adds to the progress on the device and never deletes
- Optional Google sign-in to sync progress across devices (see below)

## Note on Language Arts content

The prose analysis unit is based on the Bentz / Lit & More prose lessons. The explanations are rewritten, and the quotations are short excerpts for study.

## Cross-device sync (Google sign-in)

By default all progress stays in the browser of one device. To sync progress across devices, the site uses Firebase (Google sign-in plus a Firestore database). The free plan is more than enough for one person. Set it up once:

1. Go to <https://console.firebase.google.com>, select **Add project**, give it a name and finish the wizard (Analytics can stay off).
2. In the project, open **Build > Authentication > Get started**, then the **Sign-in method** tab. Enable **Google**, choose a support email and save.
3. Still in Authentication, open **Settings > Authorized domains** and add the domain where the site is hosted, for example `mininoodle.github.io`. (`localhost` is already there.)
4. Open **Build > Firestore Database > Create database**. Choose a location near you and start in **production mode**.
5. In Firestore open the **Rules** tab, replace the rules with the text below and publish:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

   Each signed-in user can read and write only their own documents.
6. Open **Project settings** (the gear icon) **> General > Your apps**, select the web icon (`</>`), register the app (hosting is not needed) and copy the `firebaseConfig` object.
7. In `index.html`, near the top of the main script, `const FIREBASE_CONFIG=` holds the config of this site's own Firebase project. To use your project instead, replace that object with yours, for example:

   ```js
   const FIREBASE_CONFIG={apiKey:'AIza...',authDomain:'my-project.firebaseapp.com',projectId:'my-project',appId:'1:1234:web:abcd'};
   ```

   Set it to `null` to turn Google sign-in off and keep all progress on each device. The config values are not secrets. The rules above are what protect the data.
8. Commit and push. Open the site, select the account button (the person icon next to the light and dark mode button, at the bottom of the left rail; on a phone it is in the bar at the top of the page), and sign in with Google. Do the same on each other device.

How it works: progress is kept on the device as before and also written to Firestore, in `users/{uid}/progress`: one document for each section (`p_mom`, `p_th` and so on) and `meta` for the study days, counters, achievements and clears. An upload writes only the answers that changed, so it stays small however much progress there is, and no document comes near the size limit. On sign-in the two are merged: the newest entry for each answer wins, while study days, the days each question was answered correctly, best test results, achievements and counters are combined, so neither copy loses progress. The single document of older versions, `users/{uid}/progress/main`, is still read and merged, but no longer written. Changes from another device arrive live, and tabs of the site in one browser share their progress. Clearing a section also clears older answers that arrive later from another device. Signing out first uploads any changes that are waiting, and keeps the progress that is already on the device. If a different Google account then signs in on the same browser, the progress of the previous account is not merged into it: it is kept on the device for that account, and comes back when that account signs in again. Every saved copy carries a format number: a page that is out of date stops uploading and asks for a reload, so it never erases newer data. If the browser cannot save progress (site storage is blocked or full), an upload fails, or the account cannot be reached, the account button shows a dot and the Today page says what is kept and what to do. Inside a Claude artifact the progress syncs the same way to the viewer's Claude account (`data/users/<id>/`); someone who opens a shared copy that they may not change keeps their progress in the browser. The artifact needs the `db` and `user` capabilities for this, with the default access rules, and `downloads` for the PDF and backup files (without it, a download link in the artifact frame may be blocked). The site must be opened over `https://` (or `localhost`) for the sign-in popup to work. If the popup is blocked, the site falls back to a redirect sign-in.

## Tests

The checks are in `test/` (see [test/README.md](test/README.md)). Run them before every commit that changes `index.html`:

```bash
node study-site/test/run.js
```

| Check | What it checks |
|---|---|
| `syntax.test.js` | The syntax of every script block of the page |
| `ids.test.js` | The id lock: saved answers are stored by position, so no question, lesson, challenge or try-it may move to another place, and no answer index or option count may change (`test/ids.lock.json`) |
| `lint.test.js` | The content: answer keys, explanations and their units, hints, duplicates, stems that depend on another question, the multiple-choice length cue of each section, and the numbers in this README |
| `smoke.test.js` | Every page opened and scrolled through the way a student does: no page or console errors, every question shown, an answer in each quiz, a review test and a timed exam on each Review page, and the sync with a stand-in Claude account |
| `layout.test.js` | The layout of every page at 390 and 1366 px: centred column and rows, nothing outside its card, no sideways scroll |

The quick run takes about 1.5 minutes. `node study-site/test/run.js --full` also measures the layout at 24 widths and runs the smoke test at phone width. The checks need Node and Playwright with Chromium (`npm install --no-save playwright` and `npx playwright install chromium`).

When a change gives a saved-answer id a new meaning on purpose (a retired question, a changed answer), clear the old answers with a scoped clear (like `RB2` in `index.html`) and refresh the lock in the same commit: `node study-site/test/ids.test.js study-site/index.html --write`. A question that is only reworded goes in an allow file instead (`--allow <file>`).
