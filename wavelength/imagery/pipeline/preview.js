// imagery/pipeline/preview.js — writes dist/preview-imagery.html: every shipped cover at 48 and 184 px with its id,
// every decoration on the page ground at its natural size and at 120 px, every petal, under each filter mode
// (data-filter on <html>; the filter CSS and SVG defs are copied from src/styles.css and src/index.html at build time).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

// top-level CSS blocks (selector + body), @media/@supports blocks included as one unit
function cssBlocks(css) {
  const out = [];
  let depth = 0, start = 0, selStart = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0) { out.push({ selector: css.slice(selStart, start).replace(/\/\*[\s\S]*?\*\//g, '').trim(), text: css.slice(selStart, i + 1).trim() }); selStart = i + 1; } }
  }
  return out;
}

function build() {
  delete globalThis.Imagery;
  const manifestJs = fs.readFileSync(path.join(ROOT, 'src', 'imagery.js'), 'utf8');
  new Function(manifestJs)();   // attaches globalThis.Imagery
  const M = globalThis.Imagery;
  const styles = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  const keep = cssBlocks(styles).filter((b) => /^:root\b|^@supports|\.cover\b|\.flora\b|\.fx-defs/.test(b.selector) && !/^@media/.test(b.selector));
  const defs = (html.match(/<svg class="fx-defs"[\s\S]*?<\/svg>/) || [''])[0];
  if (!defs) throw new Error('fx-defs not found in src/index.html');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const modes = ['mono', 'dither', 'invert', 'color', 'cyano', 'ink'];

  const coverCells = Object.keys(M.covers).map((id) => {
    const e = M.covers[id];
    return `<div class="cell"><img class="cover" width="184" height="184" src="${esc(e.src)}" alt=""><div class="row"><img class="cover cover--48" width="48" height="48" src="${esc(e.thumb || e.src)}" alt=""><span class="id">${esc(id)}${e.thumb ? '<br><i>thumb at 48</i>' : ''}</span></div></div>`;
  }).join('\n');
  const decoCells = M.deco.map((d) => `<div class="deco"><div class="meta">${esc(d.id)} <i>${esc(d.kind)} / ${esc(d.stem)} / ${esc(d.species.join(','))} / ${d.w}x${d.h}</i></div><div class="pair"><img class="flora" src="${esc(d.src)}" width="${d.w}" height="${d.h}" alt=""><div class="box120"><img class="flora" src="${esc(d.src)}" alt=""></div></div></div>`).join('\n');
  const petalCells = M.petals.map((p, i) => `<div class="petal"><img class="flora" src="${esc(p.src)}" width="${p.w}" height="${p.h}" alt=""><img class="flora zoom" src="${esc(p.src)}" width="${p.w * 3}" height="${p.h * 3}" alt=""><span class="id">${i + 1} ${p.w}x${p.h}</span></div>`).join('\n');

  const page = `<!doctype html>
<html lang="en" data-filter="mono"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>imagery preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&display=swap">
<style>
/* ---- copied from src/styles.css (tokens, filter modes, .cover, .flora) ---- */
${keep.map((b) => b.text).join('\n')}
/* ---- preview chrome ---- */
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.4 DotGothic16, "MS Gothic", monospace; }
img { display: block; }
h1 { font-size: 20px; font-weight: 400; margin: 0 0 8px; }
h2 { font-size: 16px; font-weight: 400; margin: 24px 0 8px; border-bottom: 1px solid var(--rule, #8c8c8c); padding-bottom: 4px; }
.fx { display: flex; gap: 8px; margin: 8px 0 16px; flex-wrap: wrap; }
.fx button { font: inherit; color: var(--fg); background: none; border: 1px solid var(--fg); padding: 4px 10px; cursor: pointer; }
.fx button[aria-pressed="true"] { background: var(--fg); color: var(--bg); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, 200px); gap: 16px 12px; }
.cell .row { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
.id { font-size: 12px; color: var(--fg-2, #aaa); overflow-wrap: anywhere; }
.decos { display: flex; flex-wrap: wrap; gap: 16px; }
.deco { border: 1px dashed var(--rule-dim, #3a3a3a); padding: 8px; }
.deco .meta { font-size: 12px; margin-bottom: 6px; } .deco i { color: var(--fg-2, #aaa); font-style: normal; }
.pair { display: flex; gap: 12px; align-items: flex-end; }
.pair > img { max-width: 640px; max-height: 640px; width: auto; height: auto; }
.box120 { width: 120px; height: 120px; display: flex; align-items: center; justify-content: center; outline: 1px dotted var(--rule-dim, #3a3a3a); flex: none; }
.box120 img { max-width: 120px; max-height: 120px; width: auto; height: auto; }
.petals { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.petal { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.zoom { image-rendering: auto; }
.note { color: var(--fg-2, #aaa); font-size: 12px; max-width: 80ch; }
</style></head>
<body>
${defs}
<h1>imagery preview</h1>
<p class="note">${Object.keys(M.covers).length} covers (${Object.values(M.covers).filter((e) => e.thumb).length} with a thumb variant), ${M.deco.length} decorations, ${M.petals.length} petals. Covers carry <code>filter: var(--fx)</code> (48 px: <code>--fx-fine</code>); decorations and petals carry <code>.flora</code> (inverted under invert). Pick a mode or open with <code>?filter=ink</code>.</p>
<div class="fx" role="group" aria-label="Media filter">${modes.map((m) => `<button type="button" data-mode="${m}" aria-pressed="${m === 'mono'}">${m}</button>`).join('')}</div>
<h2>covers: 184 px and 48 px (thumb variant where one exists)</h2>
<div class="grid">
${coverCells}
</div>
<h2>decorations: natural size and fitted into 120 px</h2>
<div class="decos">
${decoCells}
</div>
<h2>petals: natural size and 3x</h2>
<div class="petals">
${petalCells}
</div>
<script>
(function () {
  var modes = ${JSON.stringify(modes)};
  function set(m) {
    if (modes.indexOf(m) < 0) m = 'mono';
    document.documentElement.setAttribute('data-filter', m);
    document.querySelectorAll('.fx button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
  }
  document.querySelectorAll('.fx button').forEach(function (b) { b.addEventListener('click', function () { set(b.getAttribute('data-mode')); }); });
  var q = new URLSearchParams(location.search).get('filter');
  if (q) set(q);
  window.setFilter = set;
})();
</script>
</body></html>
`;
  fs.writeFileSync(path.join(ROOT, 'dist', 'preview-imagery.html'), page);
  console.log('wrote dist/preview-imagery.html (' + Math.round(page.length / 1024) + ' KB)');
}

if (require.main === module) build();
module.exports = { build };
