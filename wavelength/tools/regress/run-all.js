// tools/regress/run-all.js — run every acceptance test (t*.js) against the real app in headless Edge, one fresh profile each.
// Usage: node tools/regress/run-all.js <label> [--only=t02,t06] [--profile=<prefix>]
// Logs go to tools/regress/logs/<label>/<test>.log. Record a baseline from a known-good build first: node tools/regress/run-all.js baseline
// The tests print observations (they do not assert); compare a new run with the baseline:
//   node tools/regress/compare.js <label>
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const label = process.argv[2] || 'run';
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const prefix = (process.argv.find((a) => a.startsWith('--profile=')) || '--profile=regress').slice(10);
const dir = __dirname;
const logDir = path.join(dir, 'logs', label);
fs.mkdirSync(logDir, { recursive: true });
const tests = fs.readdirSync(dir).filter((f) => /^t.*\.js$/.test(f)).sort().filter((f) => !only.length || only.includes(f.replace('.js', '')));
for (const t of tests) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, '..', 'cdp.js'), path.join(dir, t), `--profile=${prefix}-${t.replace('.js', '')}`, '--fresh', `--out=${path.join(logDir, 'shots')}`], { encoding: 'utf8', timeout: 560000 });
  const text = (r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr : '');
  fs.writeFileSync(path.join(logDir, t.replace('.js', '.log')), text);
  const errLine = (text.match(/ERRORS AT END: .*/) || ['ERRORS AT END: ?'])[0];
  const threw = /TEST THREW|RUNNER (ERROR|TIMEOUT)/.test(text);
  console.log(`${t.padEnd(10)} ${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s  ${threw ? 'THREW' : 'ran  '}  ${errLine.slice(0, 160)}`);
}
