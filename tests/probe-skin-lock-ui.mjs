/* STOCK SKIN LOCK, Studio side (v0.84.5). A remote whose skin still
   points at OUR stock image is heal-volatile — healStockSkins refreshes
   its hotspots on an update. So the skin map is look-don't-touch: no
   draggable hotspots, a "Stock skin — locked" notice, and the only door
   forward is "use my photo…" (repoint → yours → map unlocks). Here we
   drive the rs90 stock skin and confirm the lock. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
const rs90 = readFileSync('/root/work/harmonium/skins/rs90.png');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1400 } });
const errs = [];
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
  ? r.fulfill({ json: config }) : r.fulfill({ json: { ok: true } }));
await ctx.route('**/api/harmonium/workspaces', r =>
  r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'x', path: '/x/' } } } }));
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: 'x' } }));
await ctx.route('**/local/harmonium/skins/manifest.json', r => r.fulfill({ json: {} }));
/* both paths: the fixture is pre-split (flat) and heal repoints it
   into skins/stock/ the moment the Studio loads (v0.84.6). */
await ctx.route('**/local/harmonium/skins/**rs90.png*', r => r.fulfill({ body: rs90, contentType: 'image/png' }));
await ctx.route('**/api/states', r => r.fulfill({ json: [] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2000);

/* switch the preview to the rs90 profile (its skin is stock) */
await p.evaluate(() => {
  const sel = document.getElementById('devSel');
  if (sel) { sel.value = 'rs90'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
});
await p.waitForTimeout(600);
/* enter ✎ map keys */
await p.evaluate(() => document.getElementById('skinMap')?.click());
await p.waitForTimeout(500);

const locked = await p.evaluate(() => {
  const body = document.body.textContent;
  return {
    onRs90: document.getElementById('devSel')?.value === 'rs90',
    inMapping: body.includes('Stock skin — locked') || !!document.getElementById('skinMapDone'),
    lockNotice: body.includes('Stock skin — locked'),
    noDragHotspots: document.querySelectorAll('.hotspot.cursor-move').length === 0,
    hasUpload: [...document.querySelectorAll('button, label')].some(x => x.textContent.includes('use my photo')),
    editableDoneAbsent: !document.getElementById('skinMapDone'),   // the editable-branch Done has the id
  };
});

if (!locked.onRs90) errs.push('could not switch preview to the rs90 profile');
if (!locked.inMapping) errs.push('did not enter skin mapping mode');
if (!locked.lockNotice) errs.push('stock skin missing the locked notice');
if (!locked.noDragHotspots) errs.push('stock skin still shows draggable hotspots (editable — the hole)');
if (!locked.hasUpload) errs.push('stock skin missing the "use my photo" fork door');
if (!locked.editableDoneAbsent) errs.push('editing toolbar rendered for a locked stock skin');

console.log(JSON.stringify({ locked, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
