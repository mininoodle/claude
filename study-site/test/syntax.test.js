'use strict';
const USAGE = `usage: node study-site/test/syntax.test.js <index.html>

The syntax of every <script> block of the page, without a browser: each block is checked with node --check
(a type="module" block as a module). It also fails when two classic blocks declare the same top-level const, let or
class: they share one global scope, so the second block would stop with "has already been declared".
The line numbers are lines of index.html.`;
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const a = (() => {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) { console.log(USAGE); process.exit(0); }
  const first = argv[0] && !argv[0].startsWith('--') ? argv[0] : path.join(__dirname, '..', 'index.html');
  if (!fs.existsSync(first)) { console.error('No such file: ' + first + '\n\n' + USAGE); process.exit(2); }
  return { file: path.resolve(first) };
})();
let acorn = null;
for (const p of ['acorn', '/opt/node-tools/node_modules/acorn']) { try { acorn = require(p); break; } catch (e) { /* next */ } }

const t0 = Date.now(), html = fs.readFileSync(a.file, 'utf8'), re = /<script([^>]*)>([\s\S]*?)<\/script>/g, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'syntax-'));
const names = new Map(), problems = [];
let m, i = 0;
try {
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (/\bsrc=/.test(attrs) || /type=["']?(?!module|text\/javascript|application\/javascript)[\w/+-]+/.test(attrs)) { i++; continue; }
    const mod = /type=["']?module/.test(attrs), start = html.slice(0, m.index).split('\n').length, offset = start - 1 + (m[0].slice(0, m[0].indexOf('>') + 1).split('\n').length - 1);
    const f = path.join(tmp, 'b' + i + (mod ? '.mjs' : '.js'));
    fs.writeFileSync(f, m[2]);
    const r = cp.spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    if (r.status !== 0) {
      const err = (r.stderr || '').split('\n'), at = (err[0] || '').match(/:(\d+)$/), line = at ? +at[1] + offset : start;
      problems.push('block ' + i + ' (' + (mod ? 'module' : 'classic') + ', from line ' + start + '): SYNTAX ERROR at line ' + line + ': ' + (err.find(l => /Error/.test(l)) || err.slice(0, 4).join(' ')).trim());
      console.log('block ' + i + ' line ' + start + ' ' + (mod ? 'module ' : 'classic') + ' SYNTAX ERROR');
    } else {
      console.log('block ' + i + ' line ' + start + ' ' + (mod ? 'module ' : 'classic') + ' ok (' + m[2].split('\n').length + ' lines)');
      if (!mod && acorn) {
        const ast = acorn.parse(m[2], { ecmaVersion: 'latest', locations: true });
        for (const s of ast.body) {
          const ids = s.type === 'VariableDeclaration' && s.kind !== 'var' ? s.declarations.flatMap(d => d.id.type === 'Identifier' ? [d.id.name] : []) : s.type === 'ClassDeclaration' && s.id ? [s.id.name] : [];
          ids.forEach(n => { if (names.has(n)) problems.push('the top-level name ' + n + ' is declared in block ' + names.get(n) + ' and again in block ' + i + ' (line ' + (s.loc.start.line + offset) + ')'); else names.set(n, i); });
        }
      }
    }
    i++;
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
if (!acorn) console.log('(acorn is not installed: the check for names declared twice was skipped)');
if (!i) problems.push('no <script> block was found');
problems.forEach(p => console.log('  ' + p));
console.log('\nsyntax: ' + (problems.length ? 'FAIL (' + problems.length + ' problem' + (problems.length === 1 ? '' : 's') + ')' : 'PASS') + ', ' + i + ' blocks, in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
process.exit(problems.length ? 1 : 0);
