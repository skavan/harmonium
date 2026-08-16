import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
/* s0.83.10 — collapsible nav + preview columns: toggle, width gain,
   engine iframe survives hidden, persistence across reload. */
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const starter = readFileSync('/root/work/harmonium/custom_components/harmonium/starter-config.json', 'utf8');
const png = readFileSync('/root/work/harmonium/skins/astrion.png');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
const errs = [];
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
  ? r.fulfill({ body: starter, contentType: 'application/json' })
  : r.fulfill({ json: { ok: true } }));
await ctx.route('**/api/harmonium/workspaces', r =>
  r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'config.json', path: '/local/harmonium/main/' } } } }));
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: '0.83.3' } }));
await ctx.route('**/api/states', r => r.fulfill({ json: [] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/skins/astrion.png*', r => r.fulfill({ body: png, contentType: 'image/png' }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('hakr_token', 'stub-token'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(1800);

// land on a non-map slice so the preview column is actually visible
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')]
    .find(el => el.textContent.includes('Porch') || el.textContent.includes('New Room'))?.click();
});
await p.waitForTimeout(400);

const width = sel => p.evaluate(s => {
  const el = document.querySelector(s);
  return el ? Math.round(el.getBoundingClientRect().width) : -1;
}, sel);
const r = {};
r.before = { nav: await width('#nav'), stamp: await p.evaluate(() => (document.body.textContent.match(/s0\.\d+\.\d+/) || [''])[0]) };
await p.click('#navTgl'); await p.click('#pvTgl'); await p.waitForTimeout(300);
r.after = {
  nav: await width('#nav'),
  pvHidden: await p.evaluate(() => {
    const f = [...document.querySelectorAll('iframe')].find(x => x.src.includes('/local/harmonium'));
    return f ? f.getBoundingClientRect().width === 0 : 'no-iframe';
  }),
  engineAlive: !!p.frames().find(f => f.url().includes('/local/harmonium')),
  ls: await p.evaluate(() => [localStorage.getItem('hakr_studio_nav_hide'), localStorage.getItem('hakr_studio_pv_hide')]),
};
await p.reload(); await p.waitForTimeout(1800);
r.persisted = { nav: await width('#nav'),
  navBtnDim: await p.evaluate(() => document.getElementById('navTgl').className.includes('opacity-40')) };
await p.click('#navTgl'); await p.click('#pvTgl'); await p.waitForTimeout(300);
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')]
    .find(el => el.textContent.includes('Porch') || el.textContent.includes('New Room'))?.click();
});
await p.waitForTimeout(300);
r.restored = { nav: await width('#nav') };
console.log(JSON.stringify({ r, errs }));
await b.close();
