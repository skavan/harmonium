/* v0.83.7 CONTROLLER TAB, Studio side: the tab exists where Presets
   was, derives band rows from the target controller, writes
   a.surface on toggle, folds the presets editor in, and Setup lost
   the strip. */
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
  r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'x', path: '/x/' } } } }));
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: 'x' } }));
await ctx.route('**/api/states', r => r.fulfill({ json: [] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2000);
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')].find(el => el.textContent.includes('Porch'))?.click();
});
await p.waitForTimeout(500);
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => /^[▶▼]/.test(x.textContent.trim()) && x.textContent.includes('Listen to Music'))?.click();
});
await p.waitForTimeout(700);
const r = {};
r.tabs = await p.evaluate(() => [...document.querySelectorAll('button')]
  .map(x => x.textContent.trim().replace(/^[•●○\s]*/, '').replace(/\s*\d+$/, ''))
  .filter(t => ['Setup', 'Roles', 'Inputs', 'Actions', 'Presets', 'Controller', 'State'].includes(t)));
r.setupStripGone = await p.evaluate(() =>
  !document.body.textContent.includes('Auto-populate devices'));
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => x.textContent.trim().replace(/^[•●○\s]*/, '').replace(/\s*\d+$/, '') === 'Controller' &&
      x.className.includes('px-3.5'))?.click();
});
await p.waitForTimeout(500);
r.tab = await p.evaluate(() => {
  const body = document.body.textContent;
  /* first span per row is now the ↑↓ move column (band reordering,
     s0.83.17) — the label is the wide fixed-width span */
  const rows = [...document.querySelectorAll('.space-y-1\\.5 .flex.flex-wrap')]
    .map(x => x.querySelector('span.w-\\[186px\\]')?.textContent).filter(Boolean);
  return {
    strip: body.includes('Controller · stock') || body.includes('Controller · custom copy'),
    rows,
    presetsFolded: body.includes('Presets — one-touch shortcuts'),
  };
});
// toggle Speakers off (if the row exists) else Volume band
await p.evaluate(() => {
  const lbl = x => x.querySelector('span.w-\\[186px\\]')?.textContent;
  const row = [...document.querySelectorAll('.flex.flex-wrap')]
    .find(x => lbl(x) === 'Speakers (grouping)' || lbl(x) === 'Volume band');
  row?.querySelector('[role="switch"]')?.click();
});
await p.waitForTimeout(300);
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('Save & Deploy'))?.click();
});
await p.waitForTimeout(800);
r.saved = posted ? (posted.activities?.porch_listen_to_music?.surface
  ?? posted.activities?.music?.surface ?? Object.fromEntries(
    Object.entries(posted.activities || {}).filter(([, a]) => a.surface)
      .map(([k, a]) => [k, a.surface]))) : null;
/* band REORDERING (s0.83.17): ↓ on the first row swaps it with the
   second and writes surface.band_order; the rows re-render in the
   new order and the save carries it. */
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => x.getAttribute('aria-label')?.startsWith('Move Now Playing down'))?.click();
});
await p.waitForTimeout(300);
r.moved = await p.evaluate(() =>
  [...document.querySelectorAll('.space-y-1\\.5 .flex.flex-wrap')]
    .map(x => x.querySelector('span.w-\\[186px\\]')?.textContent)
    .filter(Boolean).slice(0, 2));
posted = null;
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('Save & Deploy'))?.click();
});
await p.waitForTimeout(800);
r.movedSaved = posted ? Object.fromEntries(
  Object.entries(posted.activities || {}).filter(([, a]) => a.surface?.band_order)
    .map(([k, a]) => [k, a.surface.band_order])) : null;
/* v0.83.7 (s0.83.21): hints gone; label slots + Now Playing style.
   Type a volume-band label, blank the sources label, pick Slim —
   the POST carries band_labels + np_style. */
r.hintsGone = await p.evaluate(() =>
  ![...document.querySelectorAll('.space-y-1\\.5 .flex.flex-wrap span')]
    .some(x => x.className.includes('italic')));
await p.evaluate(() => {
  const lbl = x => x.querySelector('span.w-\\[186px\\]')?.textContent;
  const rows = [...document.querySelectorAll('.space-y-1\\.5 .flex.flex-wrap')];
  const volRow = rows.find(x => lbl(x) === 'Volume band');
  const inp = volRow?.querySelector('input');   /* placeholder now shows the band's real default */
  if (inp) { inp.value = 'Loudness';
    inp.dispatchEvent(new Event('input', { bubbles: true })); }
  const npRow = rows.find(x => lbl(x) === 'Now Playing');
  const sel = npRow?.querySelector('select');
  if (sel) { sel.value = 'slim';
    sel.dispatchEvent(new Event('change', { bubbles: true })); }
});
await p.waitForTimeout(300);
posted = null;
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('Save & Deploy'))?.click();
});
await p.waitForTimeout(800);
r.dressed = posted ? Object.fromEntries(
  Object.entries(posted.activities || {})
    .filter(([, a]) => a.surface?.band_labels || a.surface?.np_style)
    .map(([k, a]) => [k, { labels: a.surface.band_labels, np: a.surface.np_style }])) : null;
console.log(JSON.stringify({ r, errs }, null, 1));
await b.close();
