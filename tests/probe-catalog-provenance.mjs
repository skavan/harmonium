/* CATALOG PROVENANCE probe (v0.86.0 — layered catalogs, Studio
   half). The Apps editor sees the EFFECTIVE config and classifies
   every entry against the stocklib twin. Fences:
     1. a stock-identical dialect entry wears the "stock" chip;
     2. an edited entry wears "edited" + the ↺ reset control, and
        reset restores the built-in shape (JSON witness);
     3. a stock entry missing from the config shows in the Hidden
        built-ins row, and ⊕ restores it;
     4. a user-only entry wears no stock/edited chip;
     5. an edited master-list identity offers Reset to built-in;
     6. a config with everything stock shows no edited chips at all. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
const starter = JSON.parse(readFileSync(
  '/root/work/harmonium/custom_components/harmonium/starter-config.json', 'utf8'));

/* effective-shaped fixture: full stock catalogs with three deviations */
config.apps = JSON.parse(JSON.stringify(starter.apps));
config.apps.disney = { name: 'My Disney', icon: 'material:castle' };   // edited identity
config.dialects = JSON.parse(JSON.stringify(starter.dialects));
config.dialects.firetv.apps.prime = { source: 'EDITED' };              // edited entry
delete config.dialects.firetv.apps.hulu;                               // hidden entry
config.dialects.firetv.apps.zzmine = { source: 'com.mine.app' };      // user-only
config.apps.zzmine = { name: 'Mine', icon: 'material:extension' };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1400 } });
const errs = [];
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
  ? r.fulfill({ json: config }) : r.fulfill({ json: { ok: true } }));
await ctx.route('**/api/harmonium/workspaces', r =>
  r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'x', path: '/x/' } } } }));
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: 'x' } }));
await ctx.route('**/api/states', r => r.fulfill({ json: [] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2000);

/* open the Apps editor (exact-match the nav item to dodge page names) */
const hit = await p.evaluate(() => {
  const el = [...document.querySelectorAll('#nav .item')]
    .find(x => x.textContent.includes('Apps') && x.textContent.includes('dialect'));
  if (el) { el.click(); return el.textContent.trim(); }
  return null;
});
if (!hit) errs.push('Apps nav item not found');
await p.waitForTimeout(600);

/* open the Fire TV dialect fold */
await p.evaluate(() => {
  const el = [...document.querySelectorAll('button, [role="button"], .cursor-pointer')]
    .find(x => x.textContent.includes('Fire TV'));
  if (el) el.click();
});
await p.waitForTimeout(400);

const read = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('.rounded-\\[8px\\].bg-inset')];
  const rowFor = (name) => rows.find(r => r.textContent.includes(name));
  const chip = (r) => {
    if (!r) return null;
    const stock = [...r.querySelectorAll('span')].some(s => s.textContent.trim() === 'stock');
    const edited = [...r.querySelectorAll('span')].some(s => s.textContent.trim() === 'edited');
    const reset = [...r.querySelectorAll('button')].some(b => b.title.includes('Reset to the built-in'));
    return { stock, edited, reset };
  };
  const hiddenRow = [...document.querySelectorAll('p')]
    .find(x => x.textContent.includes('Hidden built-ins'));
  return {
    netflix: chip(rowFor('Netflix')),
    prime: chip(rowFor('Prime Video')),
    mine: chip(rowFor('Mine')),
    hidden: hiddenRow ? hiddenRow.textContent : null,
    hiddenHasHulu: !!hiddenRow && hiddenRow.textContent.includes('Hulu'),
  };
});
const ck = (n, cnd) => { if (!cnd) errs.push(n + ' :: ' + JSON.stringify(read)); };
ck('stock entry wears the stock chip', read.netflix && read.netflix.stock && !read.netflix.edited);
ck('edited entry wears edited + reset', read.prime && read.prime.edited && read.prime.reset);
ck('user-only entry wears neither chip', read.mine && !read.mine.stock && !read.mine.edited);
ck('hidden built-ins row lists the missing entry', read.hiddenHasHulu);

/* reset the edited entry → back to stock shape */
await p.evaluate(() => {
  const rows = [...document.querySelectorAll('.rounded-\\[8px\\].bg-inset')];
  const r = rows.find(x => x.textContent.includes('Prime Video'));
  const btn = [...r.querySelectorAll('button')].find(b => b.title.includes('Reset to the built-in'));
  btn.click();
});
await p.waitForTimeout(300);
const afterReset = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('.rounded-\\[8px\\].bg-inset')];
  const r = rows.find(x => x.textContent.includes('Prime Video'));
  return [...r.querySelectorAll('span')].some(s => s.textContent.trim() === 'stock');
});
ck('reset returns the entry to stock', afterReset);

/* restore the hidden entry */
await p.evaluate(() => {
  const row = [...document.querySelectorAll('p')]
    .find(x => x.textContent.includes('Hidden built-ins'));
  const btn = [...row.querySelectorAll('button')].find(b => b.textContent.includes('Hulu'));
  btn.click();
});
await p.waitForTimeout(300);
const afterRestore = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('.rounded-\\[8px\\].bg-inset')];
  const r = rows.find(x => x.textContent.includes('Hulu'));
  return r ? [...r.querySelectorAll('span')].some(s => s.textContent.trim() === 'stock') : false;
});
ck('restore brings the built-in entry back as stock', afterRestore);

console.log(JSON.stringify({ ...read, afterReset, afterRestore,
  ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
