/* Repro hunt (.88 status review #3): "stretched view when first
   pulling up the controller page — toggling the preview view fixes
   it". Open the activity card (preview → controller), measure the
   photo-mode iframe's layout size + transform at FIRST render, then
   toggle Room page → Controller and measure again. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
const starter = JSON.parse(readFileSync('/root/work/harmonium/custom_components/harmonium/starter-config.json', 'utf8'));
config.remotes.astrion = { ...config.remotes.astrion, skin: starter.remotes.astrion.skin };
const png = readFileSync('/root/work/harmonium/skins/astrion.png');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1400 } });
const errs = [];
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
  ? r.fulfill({ json: config }) : r.fulfill({ json: { ok: true } }));
await ctx.route('**/api/harmonium/workspaces', r =>
  r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'config.json', path: '/x/' } } } }));
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: 'x' } }));
await ctx.route('**/api/states', r => r.fulfill({ json: [] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/skins/astrion.png*', r => r.fulfill({ body: png, contentType: 'image/png' }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('hakr_token', 'stub-token'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2000);
// go to Porch, open Watch Fire TV card (preview flips to its controller)
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')]
    .find(el => el.textContent.includes('Porch'))?.click();
});
await p.waitForTimeout(500);
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => /^[▶▼]/.test(x.textContent.trim()) && x.textContent.includes('Watch Fire TV'))?.click();
});
await p.waitForTimeout(900);
const measure = () => p.evaluate(() => {
  const f = [...document.querySelectorAll('iframe')].find(x => x.src.includes('/local/harmonium'));
  if (!f) return null;
  const cs = getComputedStyle(f);
  const r = f.getBoundingClientRect();
  return { w: cs.width, h: cs.height, tf: cs.transform,
    rw: Math.round(r.width * 10) / 10, rh: Math.round(r.height * 10) / 10 };
});
const r = {};
r.first = await measure();
r.firstShot = true;
await p.screenshot({ path: '/tmp/stretch-first.png', clip: { x: 1250, y: 150, width: 430, height: 900 } });
// toggle Preview: Room page then Controller (his fix)
for (const lbl of ['Room page', 'Controller']) {
  await p.evaluate(l => {
    [...document.querySelectorAll('button')].find(x => x.textContent.trim() === l)?.click();
  }, lbl);
  await p.waitForTimeout(600);
}
r.after = await measure();
await p.screenshot({ path: '/tmp/stretch-after.png', clip: { x: 1250, y: 150, width: 430, height: 900 } });
r.same = JSON.stringify(r.first) === JSON.stringify(r.after);
console.log(JSON.stringify({ r, errs }));
await b.close();
