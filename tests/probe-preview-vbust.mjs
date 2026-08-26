/* PREVIEW CACHE-BUST (v0.85.7 — beta report with a perfect
   screenshot: Studio s0.85.6 top-left, "Engine v0.84.1" INSIDE the
   preview. Both preview iframes loaded the bare engine path, so the
   desktop browser's HTTP cache could serve a stale engine to the
   preview forever — same disease the kiosk stub cures. Fences:
     1. the preview iframe src carries ?v=<engine token>;
     2. the engine still boots in preview mode through it (the token
        rides the query, #preview=1 rides the hash);
     3. an integration that reports no token → bare path fallback
        (the iframe still loads). */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));

async function boot(verJson) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1680, height: 1400 } });
  const errs = [];
  await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
    ? r.fulfill({ json: config }) : r.fulfill({ json: { ok: true } }));
  await ctx.route('**/api/harmonium/workspaces', r =>
    r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'x', path: '/x/' } } } }));
  await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
  await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: verJson }));
  await ctx.route('**/api/states', r => r.fulfill({ json: [] }));
  await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
  await ctx.route('**/local/harmonium/index.html*', r =>
    r.fulfill({ body: engine, contentType: 'text/html' }));
  await ctx.route('**/harmonium-static/studio.html', r =>
    r.fulfill({ body: studio, contentType: 'text/html' }));
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message.slice(0, 120)));
  await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
  await p.goto('http://localhost:8482/harmonium-static/studio.html');
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const f = document.getElementById('pv');
    let booted = null;
    try {
      /* preview-mode engines paint the grid from Studio pushes; the
         boot itself is proven by the engine's chrome existing */
      const doc = f && f.contentWindow && f.contentWindow.document;
      booted = !!(doc && doc.getElementById('grid'));
    } catch (e) {}
    return { src: f ? f.getAttribute('src') : null, booted };
  });
  await b.close();
  return { ...r, errs };
}
const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

const a = await boot({ v: 'abc123hash', integration: '0.85.7' });
ck('iframe src carries the engine token (' + a.src + ')',
  !!a.src && a.src.indexOf('?v=abc123hash') >= 0 && a.src.indexOf('#preview=1') >= 0);
ck('engine boots through the busted URL', a.booted === true);

const b2 = await boot({ integration: '0.85.7' });   /* no v token */
ck('no token → bare-path fallback still loads (' + b2.src + ')',
  !!b2.src && b2.src.indexOf('?v=') < 0 && b2.booted === true);

console.log(JSON.stringify({ a, b2, ok: errs.length === 0, errs }, null, 1));
if (errs.length) process.exit(1);
