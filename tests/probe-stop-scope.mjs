/* v0.83.7: the generated Stop must scope set_activity off to the
   activity's OWN room, and icons must be gated on the font. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1400 } });
const errs = []; let posted = null;
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
  ? r.fulfill({ json: config })
  : (posted = r.request().postDataJSON(), r.fulfill({ json: { ok: true } })));
await ctx.route('**/api/harmonium/workspaces', r =>
  r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'config.json', path: '/x/' } } } }));
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: 'x' } }));
await ctx.route('**/api/states', r => r.fulfill({ json: [] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('hakr_token', 'stub-token'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2000);
const r = {};
r.fontsOk = await p.evaluate(() => document.documentElement.classList.contains('fonts-ok'));
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')].find(el => el.textContent.includes('Porch'))?.click();
});
await p.waitForTimeout(500);
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => /^[▶▼]/.test(x.textContent.trim()) && x.textContent.includes('Watch Fire TV'))?.click();
});
await p.waitForTimeout(700);
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => x.textContent.trim().replace(/^[•●○\s]*/, '').replace(/\s*\d+$/, '') === 'Actions' &&
      x.className.includes('px-3.5'))?.click();
});
await p.waitForTimeout(400);
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.replace(/\s+/g, ' ').trim().endsWith('Stop Action'))?.click();
});
await p.waitForTimeout(400);
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('Save & Deploy'))?.click();
});
await p.waitForTimeout(800);
r.postedOk = !!posted; r.seqIds = Object.keys(posted?.sequences || {});
const seq = Object.entries(posted?.sequences || {})
  .find(([id]) => id.startsWith('porch_watch_fire_tv_stop'));
r.newStopId = seq?.[0]; r.newStop = seq?.[1]?.actions?.[0] || null;
console.log(JSON.stringify({ r, errs }));
await b.close();
