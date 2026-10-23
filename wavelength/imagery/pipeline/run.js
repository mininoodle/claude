// imagery/pipeline/run.js — re-run the whole imagery pipeline (see README.md).
//   node imagery/pipeline/run.js            prep + render + mirror + preview
//   --prep-only                             only copy imagery/ to dist/imagery/ and write the processing page
//   --preview-only                          only rebuild dist/preview-imagery.html from src/imagery.js
// Needs the static server on http://127.0.0.1:8765 (node serve.js) and the headless Edge harness (tools/cdp.js).
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');
const args = process.argv.slice(2);
const has = (f) => args.includes(f);

function prep() {
  const out = path.join(DIST, 'imagery');
  for (const d of ['source', 'generated', 'probe']) {
    fs.rmSync(path.join(out, d), { recursive: true, force: true });
    fs.cpSync(path.join(ROOT, 'imagery', d), path.join(out, d), { recursive: true });
  }
  const lib = fs.readFileSync(path.join(__dirname, 'page.js'), 'utf8');
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>imagery pipeline</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&display=swap">
<style>body{margin:0;background:#000;color:#fff;font:14px monospace}p{padding:8px}</style>
</head><body><p>imagery pipeline page: driven by imagery/pipeline/work.js through tools/cdp.js; nothing to see here.</p>
<p style="font-family:DotGothic16">DotGothic16 warm-up &gt; 0123456789</p>
<script>
${lib}
</script></body></html>`;
  fs.writeFileSync(path.join(out, 'pipeline.html'), html);
  console.log('prepared dist/imagery/ (sources + pipeline.html)');
}

function serverUp() {
  return new Promise((res) => {
    const req = http.get('http://127.0.0.1:8765/imagery/pipeline.html', (r) => { r.resume(); res(r.statusCode === 200); });
    req.on('error', () => res(false));
    req.setTimeout(2000, () => { req.destroy(); res(false); });
  });
}

function render() {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [
      path.join(ROOT, 'tools', 'cdp.js'), path.join(__dirname, 'work.js'),
      '--profile=imagery', '--fresh', '--url=http://127.0.0.1:8765/imagery/pipeline.html', '--out=' + path.join(ROOT, 'tools', 'shots', 'imagery'),
    ], { cwd: ROOT, stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? res() : rej(new Error('cdp exited ' + code))));
  });
}

function mirror() {   // what build.js does for a real build: src/img -> dist/img (stale files removed)
  fs.rmSync(path.join(DIST, 'img'), { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'src', 'img'), path.join(DIST, 'img'), { recursive: true });
  console.log('mirrored src/img -> dist/img');
}

(async () => {
  if (has('--preview-only')) { require('./preview.js').build(); return; }
  prep();
  if (has('--prep-only')) return;
  if (!(await serverUp())) { console.error('static server not reachable: start it with `node serve.js` in the project root, then re-run'); process.exit(1); }
  await render();
  if (!fs.existsSync(path.join(ROOT, 'src', 'imagery.js'))) { console.error('work.js did not write src/imagery.js; see the harness output above'); process.exit(1); }
  mirror();
  require('./preview.js').build();
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
