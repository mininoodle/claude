// assemble.js — build app/ for the desktop shell from ../dist: the standalone page, the images, and the two pixel fonts
// downloaded once from Google Fonts into app/fonts/ so the executable works offline (the <link> is rewritten to a local stylesheet).
const fs = require('fs');
const path = require('path');
const https = require('https');
const dist = path.join(__dirname, '..', 'dist');
const app = path.join(__dirname, 'app');
const fonts = path.join(app, 'fonts');
fs.rmSync(path.join(app, 'img'), { recursive: true, force: true });
fs.mkdirSync(fonts, { recursive: true });
fs.cpSync(path.join(dist, 'img'), path.join(app, 'img'), { recursive: true });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (r) => {
      if (r.statusCode !== 200) { r.resume(); return rej(new Error(url + ' -> HTTP ' + r.statusCode)); }
      const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => res(Buffer.concat(chunks))); r.on('error', rej);
    }).on('error', rej);
  });
}
(async () => {
  let html = fs.readFileSync(path.join(dist, 'local.html'), 'utf8');
  const m = html.match(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)">/);
  if (!m) throw new Error('font link not found in dist/local.html');
  const cssUrl = m[1].replace(/&amp;/g, '&');
  let css;
  const cached = path.join(fonts, 'fonts.css');
  if (fs.existsSync(cached) && fs.readdirSync(fonts).some((f) => f.endsWith('.woff2'))) {
    css = fs.readFileSync(cached, 'utf8');
    console.log('fonts: using the cached copy in app/fonts');
  } else {
    css = (await get(cssUrl)).toString('utf8');
    const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((x) => x[1]))];
    let n = 0;
    for (const u of urls) {
      const name = 'f' + (n++) + path.extname(new URL(u).pathname);
      fs.writeFileSync(path.join(fonts, name), await get(u));
      css = css.split(u).join(name);
    }
    fs.writeFileSync(cached, css);
    console.log(`fonts: ${urls.length} files downloaded into app/fonts`);
  }
  html = html.replace(m[0], '<link rel="stylesheet" href="fonts/fonts.css">').replace(/<link rel="preconnect"[^>]*>\s*/g, '');
  fs.writeFileSync(path.join(app, 'index.html'), html);
  const families = [...new Set([...css.matchAll(/font-family:\s*'([^']+)'/g)].map((x) => x[1]))];
  console.log('assembled app/index.html with local fonts:', families.join(', '));
})().catch((e) => { console.error(e); process.exit(1); });
