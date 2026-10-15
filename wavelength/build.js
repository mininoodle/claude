// build.js — inline src/ into dist/index.html (publishable fragment) and dist/local.html (standalone for local testing).
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, 'src');
const dist = path.join(__dirname, 'dist');
fs.mkdirSync(dist, { recursive: true });
const read = (f) => (fs.existsSync(path.join(src, f)) ? fs.readFileSync(path.join(src, f), 'utf8') : null);
let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
if (/<!doctype|<html|<head|<body/i.test(html)) throw new Error('src/index.html must be a fragment: no doctype/html/head/body tags');
html = html.replace(/<link[^>]*href="styles\.css"[^>]*>/, () => {
  const parts = ['styles.css', 'player.css', 'app.css']
    .map((f) => { const c = read(f); return c ? `/* ---- ${f} ---- */\n${c}` : ''; })
    .filter(Boolean);
  return `<style>\n${parts.join('\n\n')}\n</style>`;
});
html = html.replace(/<script src="([^"]+\.js)"><\/script>/g, (m, f) => {
  const c = read(f);
  if (c == null) throw new Error('missing script ' + f);
  return `<script>\n/* ---- ${f} ---- */\n${c.replace(/<\/script/gi, '<\\/script')}\n</script>`;
});
// --out=<name>: write only dist/<name>.html (standalone) so parallel engineers can test without overwriting dist/local.html
const outArg = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6);
if (!outArg) fs.writeFileSync(path.join(dist, 'index.html'), html);
const skeleton = `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>
${html}
</body></html>`;
if (outArg) {
  if (!/^[a-z0-9-]+$/i.test(outArg) || /^(index|local)$/i.test(outArg)) throw new Error('--out must be a simple name other than index/local');
  fs.writeFileSync(path.join(dist, outArg + '.html'), skeleton);
  console.log(`built dist/${outArg}.html (${Math.round(skeleton.length / 1024)} KB) — test at http://127.0.0.1:8765/${outArg}.html`);
} else {
  fs.writeFileSync(path.join(dist, 'local.html'), skeleton);
  const kb = Math.round(fs.statSync(path.join(dist, 'index.html')).size / 1024);
  console.log(`built dist/index.html (${kb} KB) and dist/local.html`);
}
