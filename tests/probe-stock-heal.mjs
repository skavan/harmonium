/* v0.83.7: STOCK_MUSIC gen 2 — a gen-1 non-variant music controller
   heals to carry the speakers tile (parent preserved); a custom copy
   (variant_of) is never touched. Header shows ONE version. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
// force the fixture's music controller into a healable gen-1 stock shape
config.controllers.music.gen = 1;
config.controllers.music.parent = 'porch';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1200 } });
const errs = [];
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
  ? r.fulfill({ json: config }) : r.fulfill({ json: { ok: true } }));
await ctx.route('**/api/harmonium/workspaces', r =>
  r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'x', path: '/x/' } } } }));
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r =>
  r.fulfill({ json: { version: '0.83.7', integration: '0.83.7' } }));
await ctx.route('**/api/states', r => r.fulfill({ json: [] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2000);
const r = await p.evaluate(() => {
  const h1 = document.querySelector('h1');
  return {
    header: h1?.textContent,
    versionChips: (h1?.textContent.match(/v0\.\d+\.\d+/g) || []).length,
  };
});
// heal check: Save & Deploy, inspect the POSTed music controller
let posted = null;
await ctx.route('**/api/harmonium/config*', rt => rt.request().method() === 'POST'
  ? (posted = rt.request().postDataJSON(), rt.fulfill({ json: { ok: true } }))
  : rt.fulfill({ json: config }));
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('Save & Deploy'))?.click();
});
await p.waitForTimeout(800);
const m = posted?.controllers?.music;
r.heal = {
  gen: m?.gen, parentKept: m?.parent,
  hasSpeakers: JSON.stringify(m || {}).includes('"speakers"'),
};
console.log(JSON.stringify({ r, errs }));
await b.close();
