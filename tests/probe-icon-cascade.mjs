/* ICON CASCADE fence (2026-09-05, feedback-3 round 2 — Suresh:
   "icons everywhere in studio are still top left aligned instead of
   center"). Google's css2 icon stylesheet ships an UNLAYERED
   .material-symbols-outlined { display:inline-block; font-size:24px }
   which beats Tailwind's layered utilities regardless of order — so
   the sized icon boxes drew their glyph top-left at 24px. app.css
   re-states the losing utilities unlayered. This fence serves the
   Google class rule (the network is blocked in the sandbox, so the
   real fetch never lands) and asserts the utilities win. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1400 } });
/* simulate Google's icon stylesheet (network is blocked here): the
   class rule it really ships, minus the font file */
await ctx.route('**/css2*', r => r.fulfill({ contentType: 'text/css', body:
  ".material-symbols-outlined{font-family:'Material Symbols Outlined';font-weight:normal;font-style:normal;font-size:24px;line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;word-wrap:normal;direction:ltr}" }));
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET' ? r.fulfill({ json: config }) : r.fulfill({ json: { ok: true } }));
await ctx.route('**/api/harmonium/workspaces', r => r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'x', path: '/x/' } } } }));
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: 'x' } }));
await ctx.route('**/api/states', r => r.fulfill({ json: [] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(3000);
await p.evaluate(() => { [...document.querySelectorAll('#nav .item')].find(x => x.textContent.includes('Porch'))?.click(); });
await p.waitForTimeout(500);
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => /^[▶▼]/.test(x.textContent.trim()) && x.textContent.includes('Listen to Music'))?.click(); });
await p.waitForTimeout(800);
// find the identity IconPicker preview box
const box = await p.evaluate(() => {
  const el = [...document.querySelectorAll('.material-symbols-outlined')].find(x => x.className.includes('place-items-center'));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, txt: el.textContent,
    display: cs.display, place: cs.placeItems, fs: cs.fontSize, lh: cs.lineHeight, ff: cs.fontFamily.slice(0, 60), fontsOk: document.documentElement.className };
});
const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };
ck('IconPicker box: display grid wins over Google inline-block',
  box && box.display === 'grid');
ck('IconPicker box: the utility font-size (22px) wins over Google 24px',
  box && box.fs === '22px');
/* every sized glyph anywhere on the page computes its OWN size —
   the generic form of the same fence */
const sizes = await p.evaluate(() => {
  const out = [];
  document.querySelectorAll('.material-symbols-outlined').forEach(el => {
    const m = [...el.classList].map(c => /^text-\[(\d+)px\]$/.exec(c)).find(Boolean);
    if (m) out.push([m[1] + 'px', getComputedStyle(el).fontSize]);
  });
  return out;
});
ck('every sized glyph wins its font-size over Google 24px',
  sizes.length > 0 && sizes.every(x => x[0] === x[1]));
console.log(JSON.stringify({ ok: !errs.length, errs, box, sizes: sizes.length }, null, 1));
await b.close();
process.exit(errs.length ? 1 : 0);
