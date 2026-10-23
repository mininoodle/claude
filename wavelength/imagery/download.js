// imagery/download.js — download generated images listed in imagery/urls.json ({ key: url }) into imagery/generated/<key>.jpg
// Usage: node imagery/download.js [urls.json]
const fs = require('fs');
const path = require('path');
const https = require('https');
const dir = __dirname;
const list = JSON.parse(fs.readFileSync(path.resolve(process.argv[2] || path.join(dir, 'urls.json')), 'utf8'));
const out = path.join(dir, 'generated');
fs.mkdirSync(out, { recursive: true });
function get(url, redirects = 0) {
  return new Promise((res, rej) => {
    https.get(url, (r) => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && redirects < 5) { r.resume(); return res(get(r.headers.location, redirects + 1)); }
      if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode)); }
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => res(Buffer.concat(chunks)));
      r.on('error', rej);
    }).on('error', rej);
  });
}
(async () => {
  let ok = 0, bad = 0;
  for (const [key, url] of Object.entries(list)) {
    const file = path.join(out, key + '.jpg');
    try {
      const buf = await get(url);
      const isJpeg = buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8;
      const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
      if (!isJpeg && !isPng) throw new Error('not an image (' + buf.length + ' bytes)');
      fs.writeFileSync(isPng ? file.replace(/\.jpg$/, '.png') : file, buf);
      ok++;
      console.log(`${key}: ${Math.round(buf.length / 1024)} KB${isPng ? ' (png)' : ''}`);
    } catch (e) { bad++; console.log(`${key}: FAILED ${e.message}`); }
  }
  console.log(`done: ${ok} ok, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
