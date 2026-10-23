// tools/regress/compare.js — line-by-line comparison of a regression run with the v1 baseline.
// Usage: node tools/regress/compare.js <label>
// Numbers (timings, positions, sizes) are masked so only structural differences show. Every difference needs a look:
// some are expected after a redesign (copy or layout values), others are regressions.
const fs = require('fs');
const path = require('path');
const label = process.argv[2];
// --base=<label> compares against another recorded run instead of logs/baseline (for example --base=final1, the restyled build)
const baseLabel = (process.argv.find((a) => a.startsWith('--base=')) || '--base=baseline').slice(7);
const base = path.join(__dirname, 'logs', baseLabel);
const cur = path.join(__dirname, 'logs', label);
const mask = (s) => s.replace(/-?\d+(\.\d+)?/g, '#').replace(/screenshot .*/, 'screenshot');
for (const f of fs.readdirSync(base).filter((x) => x.endsWith('.log')).sort()) {
  const a = fs.readFileSync(path.join(base, f), 'utf8').split('\n').map(mask);
  const bPath = path.join(cur, f);
  if (!fs.existsSync(bPath)) { console.log(`== ${f}: not run`); continue; }
  const b = fs.readFileSync(bPath, 'utf8').split('\n').map(mask);
  const diffs = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) diffs.push(`  line ${i + 1}\n    base: ${(a[i] || '').slice(0, 300)}\n    now : ${(b[i] || '').slice(0, 300)}`);
  console.log(`== ${f}: ${diffs.length ? diffs.length + ' differing lines' : 'identical (numbers masked)'}`);
  diffs.slice(0, 40).forEach((d) => console.log(d));
}
