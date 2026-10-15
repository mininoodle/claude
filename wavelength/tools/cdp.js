// tools/cdp.js — drive a private headless Edge over --remote-debugging-pipe (no network listener).
// Usage: node tools/cdp.js <test-file.js> [--profile=<name>] [--fresh] [--url=<url>] [--out=<dir>]
//   <test-file.js> exports async (c) => {...}; see the ctx object below for the API.
//   --profile  isolates the browser profile (use your agent name so parallel agents never collide)
//   --fresh    deletes that profile first (empty localStorage)
//   --out      directory for c.shot() files (default: tools/shots)
// Screenshots are written as PNG; view them with the Read tool.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function findEdge() {
  const roots = ['C:\\Program Files (x86)\\Microsoft\\EdgeCore', 'C:\\Program Files (x86)\\Microsoft\\EdgeWebView\\Application', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application', 'C:\\Program Files\\Microsoft\\Edge\\Application'];
  for (const r of roots) {
    const direct = path.join(r, 'msedge.exe');
    if (fs.existsSync(direct)) return direct;
    if (!fs.existsSync(r)) continue;
    const vers = fs.readdirSync(r).filter((d) => /^\d+\./.test(d)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const v of vers) { const p = path.join(r, v, 'msedge.exe'); if (fs.existsSync(p)) return p; }
  }
  throw new Error('msedge.exe not found');
}

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const TOOLS = __dirname;
const PROFILE = path.join(TOOLS, '.profiles', arg('profile', 'default'));
const URL = arg('url', 'http://127.0.0.1:8765/local.html');
const OUT = path.resolve(arg('out', path.join(TOOLS, 'shots')));
fs.mkdirSync(OUT, { recursive: true });
const testFile = path.resolve(process.argv[2]);
if (process.argv.includes('--fresh')) fs.rmSync(PROFILE, { recursive: true, force: true });

const proc = spawn(findEdge(), [
  '--headless=new', '--remote-debugging-pipe', '--user-data-dir=' + PROFILE,
  '--no-first-run', '--no-default-browser-check', '--disable-sync', '--mute-audio',
  '--disable-extensions', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800', 'about:blank'
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

const toBrowser = proc.stdio[3];
const fromBrowser = proc.stdio[4];
let buf = '';
let nextId = 1;
const pending = new Map();
let sessionId = null;
const errors = [];

fromBrowser.on('data', (d) => {
  buf += d.toString('utf8');
  let i;
  while ((i = buf.indexOf('\0')) >= 0) {
    const raw = buf.slice(0, i); buf = buf.slice(i + 1);
    let m; try { m = JSON.parse(raw); } catch (e) { continue; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.rej(new Error(JSON.stringify(m.error))); else p.res(m.result);
      continue;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d2 = m.params.exceptionDetails;
      errors.push('[exception] ' + ((d2.exception && (d2.exception.description || d2.exception.value)) || d2.text));
    } else if (m.method === 'Runtime.consoleAPICalled') {
      if (['error', 'assert', 'warning'].includes(m.params.type)) errors.push('[console.' + m.params.type + '] ' + m.params.args.map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' '));
    } else if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      if (e.level === 'error' && !/favicon\.ico/.test(e.url || '')) errors.push('[log.' + e.source + '] ' + e.text + (e.url ? ' @' + e.url : ''));
    }
  }
});

function send(method, params = {}, sid = sessionId) {
  return new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, { res, rej });
    const msg = { id, method, params };
    if (sid) msg.sessionId = sid;
    toBrowser.write(JSON.stringify(msg) + '\0');
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function out(...a) { console.log(a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); }

async function evaluate(expr, opts = {}) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: opts.gesture !== false, timeout: opts.timeout || 60000 });
  if (r.exceptionDetails) throw new Error('eval failed: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
  return r.result.value;
}

async function waitLoad() {
  for (let i = 0; i < 100; i++) {
    // app pages: wait for the first render; any other page (mocks, previews): wait for load
    try { if (await evaluate("document.readyState === 'complete' && (!window.App || !!document.querySelector('#main *'))")) return; } catch (e) {}
    await sleep(100);
  }
  throw new Error('page did not load');
}

const ctx = {
  send, sleep, out, errors, URL, OUT,
  eval: evaluate,
  async goto(url = URL) { await send('Page.navigate', { url }); await sleep(300); await waitLoad(); await sleep(400); },
  async reload() { await send('Page.reload', { ignoreCache: true }); await sleep(300); await waitLoad(); await sleep(400); },
  // phone: c.viewport(390, 844, true); tablet: c.viewport(900, 800); desktop: c.viewport(1280, 800)
  async viewport(width, height, mobile = false) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    if (mobile) await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
    await sleep(250);
  },
  async reducedMotion(on = true) { await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: on ? 'reduce' : 'no-preference' }] }); },
  async click(x, y, opts = {}) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: opts.button || 'left', clickCount: opts.count || 1, modifiers: opts.modifiers || 0 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: opts.button || 'left', clickCount: opts.count || 1, modifiers: opts.modifiers || 0 });
  },
  async move(x, y) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }); },
  async tap(x, y) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  },
  async swipe(x1, y1, x2, y2, steps = 8) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
    for (let i = 1; i <= steps; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps }] }); await sleep(16); }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  },
  // key: {key, code, keyCode, modifiers(1 alt,2 ctrl,4 meta,8 shift), text}
  async key(k) {
    await send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode, modifiers: k.modifiers || 0, text: k.text, unmodifiedText: k.text });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode, modifiers: k.modifiers || 0 });
  },
  async type(text) { await send('Input.insertText', { text }); },
  async shot(file) { const r = await send('Page.captureScreenshot', { format: 'png' }); const f = path.resolve(OUT, file); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); out('screenshot ' + f); return f; },
  async rect(sel) { return evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; })()`); },
  async clickSel(sel) { const r = await ctx.rect(sel); if (!r) return false; await ctx.move(r.x, r.y); await sleep(80); await ctx.click(r.x, r.y); await sleep(250); return true; },
  takeErrors() { return errors.splice(0, errors.length); },
};

(async () => {
  const ver = await send('Browser.getVersion', {}, null);
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, null);
  const att = await send('Target.attachToTarget', { targetId, flatten: true }, null);
  sessionId = att.sessionId;
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await ctx.viewport(1280, 800, false);
  out('browser ' + ver.product);
  const test = require(testFile);
  try { await test(ctx); }
  catch (e) { out('TEST THREW: ' + (e && e.stack || e)); }
  out('ERRORS AT END: ' + JSON.stringify(errors));
  try { await send('Browser.close', {}, null); } catch (e) {}
  setTimeout(() => process.exit(0), 300);
})().catch((e) => { console.log('RUNNER ERROR', e && e.stack || e); try { proc.kill(); } catch (x) {} process.exit(1); });

setTimeout(() => { console.log('RUNNER TIMEOUT'); try { proc.kill(); } catch (x) {} process.exit(2); }, 540000);
