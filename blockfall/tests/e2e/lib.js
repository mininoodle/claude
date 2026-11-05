// Shared helpers for the Blockfall e2e tests (headless Chromium, file:// URL).
// GAME=/path/to/index.html overrides the game file. ENGINE=/path/to/engine.js swaps the inlined engine at load time.
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');

const GAME = path.resolve(process.env.GAME || path.join(__dirname, '..', '..', 'index.html'));
const URL = 'file://' + GAME;
const ENGINE = process.env.ENGINE ? fs.readFileSync(path.resolve(process.env.ENGINE), 'utf8') : null;
const OUT = path.join(__dirname, 'out');

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i < 0 ? def : argv[i + 1]; };

// Seeded Math.random (mulberry32), so the game's random seeds and the piece order are reproducible
function seedRandom(s) {
  let a = s;
  Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

async function launch() { return chromium.launch(); }

// New context + page. opts: viewport, colorScheme, seed, fonts (true = let Google Fonts load), storage (localStorage JSON)
async function open(browser, opts = {}) {
  const context = await browser.newContext({viewport: opts.viewport || {width: 1280, height: 900}, colorScheme: opts.colorScheme || 'light'});
  if (opts.seed != null) await context.addInitScript(seedRandom, opts.seed);
  if (opts.init) await context.addInitScript(opts.init, opts.initArg);
  if (!opts.fonts) await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({status: 200, contentType: 'text/css', body: ''}));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL);
  if (ENGINE) await page.evaluate(src => { document.querySelector('#bot-engine').textContent = src; }, ENGINE);
  return {context, page, errors};
}

// Minimal reporter: check() prints PASS / FAIL lines, done() sets the exit code
function reporter(name) {
  const results = [];
  const fmt = d => d === undefined ? '' : ' - ' + (typeof d === 'string' ? d : JSON.stringify(d));
  return {
    results,
    check(label, ok, details) { results.push({name: label, passed: !!ok, details: details === undefined ? '' : fmt(details).slice(3)}); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${fmt(details)}`); return !!ok; },
    done() {
      const failed = results.filter(r => !r.passed);
      console.log(`${name}: ${results.length - failed.length}/${results.length} checks passed`);
      if (process.env.E2E_JSON) fs.appendFileSync(process.env.E2E_JSON, JSON.stringify({test: name, results}) + '\n');
      process.exitCode = failed.length ? 1 : 0;
    },
  };
}

// Run fn(r) with a reporter; any exception counts as a failure
async function main(name, fn) {
  const r = reporter(name);
  try { await fn(r); } catch (e) { r.check('no exception in test script', false, String(e && e.stack || e)); }
  r.done();
}

module.exports = {GAME, URL, OUT, opt, launch, open, main, seedRandom};
