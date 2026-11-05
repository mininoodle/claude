#!/usr/bin/env node
// Puts an engine source between the BOT ENGINE markers of the game file.
//   node inline-engine.js [engine.js] [game.html]
// Defaults: ../stub-engine.js and ../../index.html
const fs = require('fs');
const path = require('path');
const engine = path.resolve(process.argv[2] || path.join(__dirname, '..', 'stub-engine.js'));
const game = path.resolve(process.argv[3] || path.join(__dirname, '..', '..', 'index.html'));
const src = fs.readFileSync(engine, 'utf8').replace(/\s+$/, '');
if (/<\/script/i.test(src) || src.includes('<!--')) { console.error('engine source contains </script or <!--'); process.exit(1); }
const html = fs.readFileSync(game, 'utf8');
const START = '/* BOT ENGINE START */', END = '/* BOT ENGINE END */';
const a = html.indexOf('\n' + START + '\n'), b = html.indexOf('\n' + END + '\n');
const count = s => html.split(s).length - 1;
if (a < 0 || b < a || count(START) !== 1 || count(END) !== 1) {
  console.error('markers not found exactly once, each on its own line'); process.exit(1);
}
const out = html.slice(0, a + START.length + 2) + src + '\n' + html.slice(b + 1);
fs.writeFileSync(game, out);
console.log(`inlined ${path.basename(engine)} (${src.length} chars) into ${game}`);
