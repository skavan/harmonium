/* v0.83.2 probes: wash toggle, export dropdown (all workspaces),
   screenshot with alpha, artwork theme tokens. */
import { chromium } from 'playwright-core';
import { readFileSync, createReadStream } from 'node:fs';
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const cfg = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
const skinPng = readFileSync('/root/work/harmonium/skins/astrion.png');
const SYMS = readFileSync(
  '/root/work/harmonium/tests/node_modules/material-symbols/material-symbols-outlined.woff2');
const FONT_CSS = `@font-face{font-family:'Material Symbols Outlined';
font-style:normal;font-weight:400;src:url(/local-syms.woff2) format('woff2')}
.material-symbols-outlined{font-family:'Material Symbols Outlined';
font-weight:normal;font-style:normal;line-height:1;letter-spacing:normal;
text-transform:none;display:inline-block;white-space:nowrap;
word-wrap:normal;direction:ltr;font-feature-settings:'liga';
-webkit-font-smoothing:antialiased}`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 },
  acceptDownloads: true });
const r = {}; const errs = [];
await ctx.route('**/api/harmonium/config*', route =>
  route.request().method() === 'POST' ? route.fulfill({ json: { ok: true } })
    : route.fulfill({ json: cfg }));
await ctx.route('**/api/harmonium/workspaces', route =>
  route.fulfill({ json: { order: ['main', 'deck'], workspaces: {
    main: { name: 'Main', file: 'config.json' },
    deck: { name: 'Deck', file: 'config.deck.json' } } } }));
await ctx.route('**/api/harmonium/pair_admin', route =>
  route.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', route =>
  route.fulfill({ json: { v: '0.83.2' } }));
await ctx.route('**/api/states', route => route.fulfill({ json: [] }));
await ctx.route('**fonts.googleapis.com/css2*', route =>
  route.fulfill({ body: FONT_CSS, contentType: 'text/css',
    headers: { 'Access-Control-Allow-Origin': '*' } }));
await ctx.route('**/local-syms.woff2', route =>
  route.fulfill({ body: SYMS, contentType: 'font/woff2',
    headers: { 'Access-Control-Allow-Origin': '*' } }));
await ctx.route('**/local/harmonium/skins/astrion.png', route =>
  route.fulfill({ body: skinPng, contentType: 'image/png' }));
await ctx.route('**/local/harmonium/index.html*', route =>
  route.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', route =>
  route.fulfill({ body: studio, contentType: 'text/html' }));
await ctx.route('**api.github.com/**', route => route.abort());
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
p.on('console', m => { if (m.type() !== 'log') errs.push('console.' + m.type() + ': ' + m.text().slice(0, 160)); });
await p.addInitScript(() => localStorage.setItem('hakr_token', 'stub-token'));
await p.addInitScript(() => {
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 30); }
    send(m) { const msg = JSON.parse(m);
      if (msg.type === 'auth') setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_ok' }) }), 10);
      else if (msg.type === 'config/entity_registry/list')
        setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'result', id: msg.id, result: [] }) }), 10); }
    close() {}
  };
});
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2000);
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')]
    .find(x => (x.textContent || '').includes('Porch'))?.click(); });
await p.waitForTimeout(700);

/* skin on */
await p.evaluate(() => document.querySelector('#skinOn')?.click());
await p.waitForTimeout(1800);

/* ---- 1. WASH TOGGLE ---- */
const washCount = () => p.evaluate(() =>
  [...document.querySelectorAll('button.hotspot')]
    .filter(h => /bg-accent\/15/.test(h.className)).length);
r.washBefore = await washCount();
await p.evaluate(() => document.querySelector('#washTgl')?.click());
await p.waitForTimeout(300);
r.washAfterOff = await washCount();
r.tglLabel = await p.evaluate(() => document.querySelector('#washTgl')?.textContent);
await p.evaluate(() => document.querySelector('#washTgl')?.click());
await p.waitForTimeout(300);
r.washBackOn = await washCount();

/* ---- 2. SCREENSHOT (skin on → alpha outside the device) ---- */
const dl1 = p.waitForEvent('download', { timeout: 30000 });
await p.evaluate(() => document.querySelector('#pvSnap')?.click());
try {
  const d = await dl1;
  await d.saveAs('/tmp/snap-skin.png');
  r.snapFile = d.suggestedFilename();
} catch (e) { r.snapErr = String(e).slice(0, 120); }
r.snapStatus = await p.evaluate(() => document.querySelector('#status')?.textContent);

/* ---- 3. EXPORT ALL ---- */
await p.evaluate(() => document.querySelector('#exportBtn')?.click());
await p.waitForTimeout(250);
const dl2 = p.waitForEvent('download', { timeout: 20000 });
r.expMenu = await p.evaluate(() => {
  const btn = [...document.querySelectorAll('#expMenu button')]
    .find(b2 => b2.textContent.trim() === 'All workspaces');
  if (btn) { btn.click(); return true; }
  return false; });
try {
  const d2 = await dl2;
  await d2.saveAs('/tmp/export-all.json');
  r.expFile = d2.suggestedFilename();
} catch (e) { r.expErr = String(e).slice(0, 120); }

/* ---- 4. ARTWORK TOKEN reaches the engine ---- */
r.artToken = await p.evaluate(() => {
  const pv = document.querySelector('#pv');
  const cs = getComputedStyle(pv.contentDocument.documentElement);
  return cs.getPropertyValue('--br-art').trim();
});

r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
