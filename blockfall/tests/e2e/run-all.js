#!/usr/bin/env node
// Runs every e2e test one after the other (one browser at a time) and exits non-zero if any fails.
//   node run-all.js [names...]      e.g. node run-all.js parity versus
// GAME=... and ENGINE=... are passed on to each test (see lib.js).
const {spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const ALL = ['engine', 'parity', 'single', 'versus', 'match', 'safety', 'realtime', 'frames', 'settings', 'layout', 'screens', 'fallback', 'hot', 'keyboard'];
const names = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const json = path.join(__dirname, 'out', 'results.jsonl');
fs.mkdirSync(path.dirname(json), {recursive: true});
fs.writeFileSync(json, '');
const rows = [];
for (const n of names) {
  const t0 = Date.now();
  const p = spawnSync(process.execPath, [path.join(__dirname, n + '.js')], {stdio: ['ignore', 'pipe', 'inherit'], env: {...process.env, E2E_JSON: json}, encoding: 'utf8', timeout: 600000});
  const out = p.stdout || '';
  process.stdout.write(out.split('\n').filter(l => !l.startsWith('PASS')).join('\n'));
  const fails = out.split('\n').filter(l => l.startsWith('FAIL')).length, passes = out.split('\n').filter(l => l.startsWith('PASS')).length;
  rows.push({test: n, ok: p.status === 0, passes, fails, secs: Math.round((Date.now() - t0) / 100) / 10});
}
console.log('\n' + rows.map(r => `${r.ok ? 'ok  ' : 'FAIL'} ${r.test.padEnd(9)} ${String(r.passes).padStart(3)} passed ${String(r.fails).padStart(2)} failed  ${r.secs}s`).join('\n'));
console.log(`details: ${json}`);
process.exitCode = rows.every(r => r.ok) ? 0 : 1;
