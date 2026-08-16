/* v0.83.7: a device whose only claim is volume_level -> media_player.*
   must still get an Inputs row (the soundbar). */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
const sb = Object.entries(config.devices).find(([, d]) =>
  Object.keys(d.roles || {}).every(r => !['media_player', 'source_select'].includes(r)) &&
  Object.values(d.roles || {}).some(e => String(e).startsWith('media_player.')));
console.log('volume-only device under test:', sb?.[0], JSON.stringify(sb?.[1]?.roles));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1400 } });
const errs = [];
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
  ? r.fulfill({ json: config }) : r.fulfill({ json: { ok: true } }));
await ctx.route('**/api/harmonium/workspaces', r =>
  r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'config.json', path: '/x/' } } } }));
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: 'x' } }));
await ctx.route('**/api/states', r => r.fulfill({ json: [
  { entity_id: 'media_player.ma_soundbar_porch', state: 'on',
    attributes: { friendly_name: 'Porch Soundbar', source_list: ['TV (ARC)', 'Optical', 'Bluetooth'], source: 'TV (ARC)' } },
] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('hakr_token', 'stub-token'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2000);
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
    .find(x => x.textContent.trim().replace(/^[•●○\s]*/, '').replace(/\s*\d+$/, '') === 'Inputs' &&
      x.className.includes('px-3.5'))?.click();
});
await p.waitForTimeout(500);
const r = await p.evaluate(() => {
  const block = [...document.querySelectorAll('div')].reverse()
    .find(d => d.textContent.includes('WHAT SHOULD EACH DEVICE BE SET TO') || d.textContent.includes('what should each device be set to'));
  const rows = [...(block?.querySelectorAll('select') || [])].map(s =>
    s.closest('div.flex')?.querySelector('span')?.textContent?.trim()).filter(Boolean);
  return { rows, hasSoundbar: rows.some(n => /soundbar/i.test(n)),
    soundbarSources: block?.textContent.includes('Optical') || 'dropdown closed (ok)' };
});
console.log(JSON.stringify({ r, errs }));
await b.close();
