// main.js — Electron shell for Wavelength: one window, the built page from app/, no network access needed.
// `electron . --smoke` opens the window, waits for the first render, writes smoke.png next to this file and quits.
const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

const SMOKE = process.argv.includes('--smoke');
app.setName('Wavelength');
// audio starts from a click in the page; Chromium's autoplay gate would otherwise suspend the AudioContext
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 390, minHeight: 600,
    title: 'Wavelength', backgroundColor: '#000000', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  // links to other sites open in the system browser; nothing else leaves the app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.once('ready-to-show', () => { if (!SMOKE) win.show(); });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  if (SMOKE) {
    win.webContents.once('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(process.cwd(), 'smoke.png'), img.toPNG());   // cwd: __dirname is read-only inside a packed app
        const info = await win.webContents.executeJavaScript(`({ covers: document.querySelectorAll('#main img.cover[src]').length, flora: document.querySelectorAll('img.flora[src]').length, fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).filter((v, i, a) => a.indexOf(v) === i), title: document.title })`);
        console.log('SMOKE ' + JSON.stringify(info));
      } catch (e) { console.log('SMOKE FAILED ' + e.message); }
      app.quit();
    });
  }
}

app.whenReady().then(() => {
  // the page is local and self-contained: refuse every network request except the app's own files
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => { cb({ cancel: !details.url.startsWith('file:') && !details.url.startsWith('devtools:') }); });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
