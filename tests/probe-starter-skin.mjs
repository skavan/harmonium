import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
/* v0.83.6: the seeded starter carries the astrion SKIN — the Studio
   must land previewing the photo with no preset click. */
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const starter = readFileSync('/root/work/harmonium/custom_components/harmonium/starter-config.json', 'utf8');
const png = readFileSync('/root/work/harmonium/skins/astrion.png');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
const errs = [];
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
  ? r.fulfill({ body: starter, contentType: 'application/json' })
  : r.fulfill({ json: { ok: true } }));
await ctx.route('**/api/harmonium/workspaces', r =>
  r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'config.json', path: '/local/harmonium/main/' } } } }));
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: '0.83.3' } }));
await ctx.route('**/api/states', r => r.fulfill({ json: [] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/skins/astrion.png*', r =>
  r.fulfill({ body: png, contentType: 'image/png' }));
await ctx.route('**/local/harmonium/index.html*', r =>
  r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r =>
  r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('hakr_token', 'stub-token'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2200);
const r = await p.evaluate(() => ({
  status: document.getElementById('status').textContent,
  device: document.getElementById('devSel')?.value,
  photo: !!document.querySelector('img[src*="skins/astrion.png"]'),
  hotspots: document.querySelectorAll('[data-hot], .hot').length,
}));
const fr = p.frames().find(f => f.url().includes('/local/harmonium'));
r.engineScreen = fr ? await fr.evaluate(() => S.screen).catch(() => null) : null;
console.log(JSON.stringify({ r, errs }));
await b.close();
