'use strict';
const USAGE = `usage: node study-site/test/run.js [index.html] [--full] [--strict] [--only ids,smoke] [--skip layout] [--timeout 900]

Runs every *.test.js file of this folder in turn (syntax, ids, lint, smoke, layout first, then the others in name order), each as
  node <name>.test.js <index.html> [--full] [--strict]
then prints a summary table. Exits 1 when any check failed (exit code 1), could not run (2) or timed out.
index.html: default ../index.html (the page next to this folder)
--full     passed on: every width in layout, the phone pass in smoke
--strict   passed on: the lint fails on errors
--only     run only these checks (names without .test.js)       --skip   leave these checks out
--timeout  seconds for one check before it is stopped (default 900)
A check that another agent adds needs no registration: any <name>.test.js here is run. It must take the path of
index.html as its first argument, exit 0 when it passes and 1 when it fails, and ignore flags it does not know.`;
const fs = require('fs'), path = require('path'), cp = require('child_process');
const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) { console.log(USAGE); process.exit(0); }
const opt = f => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
const valued = new Set(['--only', '--skip', '--timeout']), first = argv.find((x, i) => !x.startsWith('--') && !(i > 0 && valued.has(argv[i - 1])));
const file = path.resolve(first || path.join(__dirname, '..', 'index.html'));
if (!fs.existsSync(file)) { console.error('No such file: ' + file + '\n\n' + USAGE); process.exit(2); }
const pass = ['--full', '--strict'].filter(f => argv.includes(f));
const only = opt('--only') ? new Set(opt('--only').split(',')) : null, skip = new Set((opt('--skip') || '').split(',').filter(Boolean));
const timeout = 1000 * (+opt('--timeout') || 900);
const FIRST = ['syntax', 'ids', 'lint', 'smoke', 'layout'];
const name = f => f.replace(/\.test\.js$/, '');
const tests = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).map(name)
  .filter(n => (!only || only.has(n)) && !skip.has(n))
  .sort((x, y) => ((FIRST.indexOf(x) + 1 || 99) - (FIRST.indexOf(y) + 1 || 99)) || x.localeCompare(y));
if (!tests.length) { console.error('No checks to run.'); process.exit(2); }
console.log('page: ' + file + '\nchecks: ' + tests.join(', ') + (pass.length ? '\nflags: ' + pass.join(' ') : ' (quick mode)'));
const rows = [], t00 = Date.now();
for (const t of tests) {
  console.log('\n' + '='.repeat(20) + ' ' + t + '.test.js ' + '='.repeat(Math.max(4, 60 - t.length)));
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, t + '.test.js'), file, ...pass], { stdio: 'inherit', timeout, killSignal: 'SIGKILL' });
  const secs = (Date.now() - t0) / 1000;
  const res = r.error && r.error.code === 'ETIMEDOUT' || r.signal ? 'TIMEOUT' : r.status === 0 ? 'PASS' : r.status === 2 ? 'ERROR (could not run)' : 'FAIL';
  rows.push([t, res, r.status == null ? '-' : r.status, secs.toFixed(1) + ' s']);
}
console.log('\n' + '='.repeat(30) + ' summary ' + '='.repeat(30));
const W = [Math.max(6, ...rows.map(r => r[0].length)) + 2, 24, 6, 9];
const line = r => r.map((c, i) => i === 3 ? String(c).padStart(W[i]) : String(c).padEnd(W[i])).join('');
console.log(line(['check', 'result', 'exit', 'time']));
rows.forEach(r => console.log(line(r)));
const bad = rows.filter(r => r[1] !== 'PASS');
console.log('\n' + (bad.length ? bad.length + ' of ' + rows.length + ' checks did not pass: ' + bad.map(r => r[0]).join(', ') : 'all ' + rows.length + ' checks passed') + ' (' + ((Date.now() - t00) / 1000).toFixed(1) + ' s)');
process.exit(bad.length ? 1 : 0);
