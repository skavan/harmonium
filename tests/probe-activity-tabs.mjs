/* v0.83.11 ACTIVITYCARD SPLIT probe: the 2,513-line card became a
   spine + six per-tab components (components/activity/). Svelte
   compiles unknown identifiers as globals, so a missed import only
   fails at RUNTIME — this walks every tab of a real card and demands
   (a) each tab's signature content renders, (b) zero pageerrors.
   Plus the split's one new lifecycle risk: tabs UNMOUNT on switch
   now, so an open ⚙ presentation panel must sweep its editPres
   backfill (name:"", sub:"") on the way out — leaving the panel
   open, switching tabs, and saving must not write empty-string
   blanks into a.present. */
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
p.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
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

const clickTab = (name) => p.evaluate((name) => {
  [...document.querySelectorAll('button')]
    .find(x => x.textContent.trim().replace(/^[•●○\s]*/, '').replace(/\s*\d+$/, '') === name &&
      (x.className.includes('px-3.5') || name === 'Advanced'))?.click();
}, name);
const has = (txt) => p.evaluate((txt) => document.body.textContent.includes(txt), txt);

const SIGNATURES = [
  ['Setup', "The cast — what's involved"],
  ['Roles', 'Roles — which device fills each role'],
  ['Inputs', 'Inputs — what should each device be set to?'],
  ['Actions', 'Generate from the answers'],
  ['Controller', 'Presets — one-touch shortcuts'],
  ['State', 'State — when is this activity ON?'],
  ['Advanced', 'The machine view'],
];
const r = { tabs: {} };
for (const [tabName, sig] of SIGNATURES) {
  await clickTab(tabName);
  await p.waitForTimeout(400);
  r.tabs[tabName] = { rendered: await has(sig), errsSoFar: errs.length };
}
r.identity = await has('Display name');

/* the unmount sweep: open a ⚙ panel on Setup, leave WITHOUT closing,
   come back, save — a.present must round-trip identical to the
   fixture (no backfilled "" blanks survive the tab switch) */
await clickTab('Setup');
await p.waitForTimeout(400);
r.gearOpened = await p.evaluate(() => {
  const gear = [...document.querySelectorAll('button')]
    .find(x => x.textContent.trim() === '⚙' &&
      (x.getAttribute('title') || '').startsWith('Presentation'));
  gear?.click();
  return !!gear;
});
await p.waitForTimeout(400);
r.panelShown = await has('Draws as');
await clickTab('Roles');            /* SetupTab unmounts — sweep must run */
await p.waitForTimeout(400);
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('Save & Deploy'))?.click();
});
await p.waitForTimeout(800);
r.presentRoundTrips = posted ? Object.entries(posted.activities || {}).every(([k, a]) =>
  JSON.stringify(a.present ?? null) === JSON.stringify(config.activities?.[k]?.present ?? null)) : null;

console.log(JSON.stringify({ ...r,
  ok: SIGNATURES.every(([t]) => r.tabs[t]?.rendered) && r.identity &&
      r.gearOpened && r.panelShown && r.presentRoundTrips === true &&
      errs.length === 0,
  errs }, null, 1));
await b.close();
