# Tests of the study site

Checks for `study-site/index.html`. Each check is a standalone Node script that loads the page the way a student does and exits with 0 when it passes and 1 when it fails (2: the check could not run, for example a wrong path or no browser).

**Run the quick suite before every commit that changes `index.html`**, and always after you add, change or move a question, a lesson or a try-it:

```bash
node study-site/test/run.js
```

It runs every `*.test.js` file of this folder in turn and prints a summary table. The quick suite takes about 1.5 minutes. Before a merge or a release, also run `node study-site/test/run.js --full` (every layout width, and the smoke test at phone width too) and `node study-site/test/lint.test.js study-site/index.html --strict`.

## Setup

Node 18 or newer and Playwright with Chromium:

```bash
npm install --no-save playwright
npx playwright install chromium
```

The page is opened from the file (`file://`) with every network request blocked, so no server is needed and nothing is sent anywhere. Each check takes the path of `index.html` as its first argument (default: `../index.html` next to this folder) and prints its own usage with `--help`.

## The checks

| Check | What it checks | Time |
|---|---|---|
| `syntax.test.js` | Every `<script>` block with `node --check` (the module block as a module), and top-level names that two classic blocks both declare. Gives the line in `index.html`. | 1 s |
| `ids.test.js` | The id lock (below): no saved-answer id may move to another question, vanish or change its answer pattern. | 6 s |
| `lint.test.js` | The content lint (below). Reports by default; `--strict` fails on errors. Prints the counts for the README. | 3 s |
| `smoke.test.js` | Opens every page through the app shell (subject tab, unit or section bar, lesson chip) and scrolls through it. Fails on any page error or console error, a page that does not open, or a page with no cards. | 55 s |
| `layout.test.js` | The layout of every page at 390 and 1366 px (`--full`: 24 widths from 360 to 5120 px). | 30 s |
| `click-guard.test.js` | The ghost-click guard with real input: a mouse double-click or two quick taps on a button that is replaced by an option do not answer it; a tap far away or later does; Enter or Space always acts at once (also after Try again in the lesson quiz). | 3 s |
| `reload-place.test.js` | A reload goes back to the block at the top of the window (a card, or a question of the quiz) at the same offset: after a raw jump (End key, a jump to a part of the page) in lessons with waiting question figures, after a natural scroll, and by y for an older saved place. | 23 s |
| `empty-check.test.js` | A try-it Check pressed before anything is chosen asks for an answer first and marks nothing (the widgets one by one, then every Check button of every lesson on a fresh page; lists in order and the pH slider always hold an answer and are left out). | 16 s |

### `smoke.test.js`

- Pass 1: Today; every lesson, reference sheet and Review page of every section; the Test tab; Today again. A lesson with questions must show all of them, a pager, its how-to guide (when `HT` has one) and its challenge card (when `CH` has one). In each quiz the first multiple-choice question is answered, and the first numeric question is answered with its own `n`, which must be marked correct and saved. On each Review page a mixed test is started, two questions are answered and the test is ended: the results must show. The Test tab starts a test, and the daily challenge starts.
- Pass 2: a fresh page; on each Review page a timed exam starts, question 1 is answered and Next goes to question 2.
- Pass 3: a fresh page with a stand-in for the Claude account (`window.claude`, see `lib.js`). The page must read the account copy at boot, and an answer must reach it.
- It also checks the page's `RETIRE` list: each time is a time at or before now (a later time would cut the answers to the new question on every device; the page also reports it as a console error at load) and each id names a question.
- `--only mom,ff` limits passes 1 and 2 to some sections (quick checks while you work on a unit); `--full` adds pass 1 at 390 px.

### `layout.test.js`

A port of the centring review's `measure-all.js`. On every page: the lesson column is centred in the main area, each row of cards is centred, no card or element sticks out of its card (unless a box between them scrolls or clips it), the page does not scroll sideways, and from 900 px the breadcrumb text lines up with the column. Page errors also fail it. `--widths 360,960` measures other widths.

### `ids.test.js` and `ids.lock.json`: the id lock

Saved answers, spaced repetition and history are stored under ids that come from **positions**:

- lesson question `j` of lesson `L` of section `u` is `u_L_j` (the `EXTRA` items follow the lesson's own questions); review item `j` is `u_L_rj`
- the challenge problem of a lesson is `ch_u_L` (the challenges are dealt to the lessons in order), the lesson's correct-count `cnt_u_L`, an ICE table `ice_i`
- every try-it key holds the lesson's element id: `mt_u-L`, `mt_u-L_2` (matching, slot 2), `mt_u-L_nr0`, `mt_u-L_tb0`, `hs_u-L` (hotspot, no slot), `ord_u-L`, `spd_u-L_name`, `note_u-L_name`

So inserting, deleting or reordering a question, an option, a lesson, a challenge or a try-it moves the saved answers of everything after it onto other questions, and the synced copies carry the wrong mapping to every device. `ids.lock.json` records what each id names: for a question its kind (`mc` or `num`), for multiple choice the answer index `a` and the option count, and a hash of the stem with the HTML and spacing removed (option texts are not locked: rewriting an option in place is allowed); for a try-it the rows or parts, the answer pattern and a hash of the row texts. The check fails when a locked id

- **moved**: its question or try-it is now at another id
- **vanished**: no longer exists
- **structure changed**: another kind, answer index `a`, option count, or other rows, row order or answers of a try-it
- **changed**: names a reworded or different question, unless the id is listed in an `--allow` file

and when two try-its share one key (give each its own slot). New ids pass: add items only at the end of an array, and new try-its with a new slot number.

When a change is intended:

- **The same question, reworded** (a clearer stem, a typo): list its id in an allow file (one id per line, `#` comments) and run `node study-site/test/ids.test.js study-site/index.html --allow reworded.txt`.
- **An id that now names a different question** (a retired item, a changed answer): clear its old answers with a scoped clear (like `RB2` in `index.html`), then refresh the lock with `--write` and commit the new lock in the same commit.

`--write` refuses when the page reports errors or two try-its share a key. Two limits: items whose stems are the same (the lint's `dup-same` warning lists them, for example `eq_3_24`/`eq_3_26`) cannot be told apart, so a swap between them is not seen; and a widget that is local to a lesson cannot be wrapped (the fill-in table in Forces and fields lesson 0 and the Electrochemistry try-its other than the reduction table: `mt_ec-1_on0`, `mt_ec-5_bal0`, `mt_ec-6_g0` and the others). Such a key is locked by the text and the number of controls of the element its widget is built in (kind `wd`): a changed or reordered row fails, but an answer changed without any change of text is not seen. The Electrochemistry reduction-table picks (`ecTable`, keys `mt_ec-L_etN`) are wrapped: their rows and their answer are locked (kind `et`). The check also reads the page's `RETIRE` list: each time must be a time at or before now, and each id a question. The first lock was made from commit `92e381a` (2,211 ids); `made_from` in the file names the commit of the current one. A lock written at `5f4ed6b` fails `f391a0f` with the 69 Nervous system and Senses answers that commit moved. Option texts are not locked, so two distractors that swap places are not seen (the answer index and the option count are).

### `lint.test.js`: the content lint

It checks every lesson question (with the `EXTRA` items), review-bank item, challenge problem, written-response item and generator (200 samples each, with a fixed random seed), using the site's own grader (`numOK`, `parseNum`, `ansText`, `numsIn`, `hintLeaks`).

- **Errors** (defects; `--strict` fails on them): no question text; neither multiple choice nor numeric; an answer index `a` that is not an option; fewer than 2 options; two options with the same text; `n` not a finite number; `n` not accepted by its own tolerance; a shown answer that the grader rejects; an explanation missing or under 15 characters; an explanation that ends in another unit than the one asked (for example `0.108 m` for an answer in cm); a stem that starts with "The same", "For the same", "In the same" or "In the previous question" (questions are shuffled into tests, so each must stand on its own); a generator that throws or makes NaN; a written-response item without marking points or a model answer; a README number that differs from the page.
- **Warnings** (heuristic): the explanation states no value the grader accepts (answers in words are fine); the value the explanation ends with is not the answer rounded to its own digits (for example 2.27 shown and 2.28 in the explanation); a numeric lesson question without a hint; a key 1.5 times its longest distractor or more; an option such as "all of the above" in a shuffled list; an explanation of a shuffled item that names an option by its place in a form the page does not keep in order ("the second row", "the second and fourth options", "options 2 and 4", "answer B": only "option B" and "the second option" keep the options in order and lettered); two items with the same stem; a review item that repeats a lesson question of its section (word 3-gram Jaccard 0.7 or more, or the same data and the same answer); a section whose length cue is over the target; a section where a simple length strategy scores more than chance + 5 points (cue-rank, below).

It also prints the counts of each section (lessons, questions, review items, challenge problems, generators, written-response items, how-to guides, reference terms) and the **multiple-choice length cue** of each section: the share of MC items whose key is the unique longest option, and the score of a student who always picks the longest option (ties split), against chance. The target is at most 25 % and at most max(30 %, chance + 5) %. Then the **length rank of the key** in each section (1 = the longest option; options of the same length share the ranks they span) and the score of each simple length strategy: always the option of rank 1, 2, 3 or 4, a guess between ranks 2 and 3, not the longest and not the shortest, a guess between the two longest or the two shortest. The target is every strategy at most chance + 5 points; a section above it gets a cue-rank warning that names the best strategy (for example, keys that are often the second-longest option).

`lint-allow.txt` lists accepted findings, one per line: `<id> <check>`, or `<id>` alone for every check of that id. Options: `--units mom,ff`, `--samples 200`, `--json <file>` (every finding), `--all` (print every finding, not only 25 for each check).

## Writing a new check

Add `<name>.test.js` to this folder; `run.js` runs it with no registration. It must take the path of `index.html` as its first argument, exit 0 when it passes and 1 when it fails, ignore flags it does not know (`run.js` passes `--full` and `--strict` on), and finish the quick mode in well under a minute. `lib.js` has the helpers:

- `cli(usage)`: the path and the flags; `run(name, fn)`: the browser, the time and the exit code
- `openPage(browser, file, {width, height, dark, noMotion, css, storage, claude})`: the page by `file://` with the network blocked, page errors and console errors collected in `errors`
- `pageList`, `openTab`, `openLesson(page, unit, lesson)`, `openPageItem`: navigation the way a student does
- `scrollThrough(page)`, `frames(page, n)`
- `claudeMock`: a stand-in for the Claude artifact runtime, which follows the platform's call contract: `window.claude.use('db')` (documents and collections, `get`, `set`, `update`, `delete`, `onSnapshot`), `use('user')` and `use('downloads')`. Pass `claude: {}` (or options such as `user`, `docs`, `failWrites`, `delay`) to `openPage`. Every call is logged in `window.__claude.log`; `window.__claude.docs()` returns the documents, `write(path, body)` acts as another device, and `fail(code)` makes writes fail.
