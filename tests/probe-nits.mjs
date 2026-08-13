/* v0.83.1 Studio nits: plain-frame first-mount viewport + action snippets */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const cfg = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
delete (cfg.remotes || {});   // ensure NO profile carries a viewport
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
const r = {}; const errs = [];
await ctx.route('**/api/harmonium/config*', route =>
  route.request().method() === 'POST' ? route.fulfill({ json: { ok: true } })
    : route.fulfill({ json: cfg }));
await ctx.route('**/api/harmonium/workspaces', route =>
  route.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'config.json' } } } }));
await ctx.route('**/api/harmonium/pair_admin', route =>
  route.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', route =>
  route.fulfill({ json: { v: '0.83.1' } }));
await ctx.route('**/api/states', route => route.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/index.html*', route =>
  route.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', route =>
  route.fulfill({ body: studio, contentType: 'text/html' }));
await ctx.route('**api.github.com/**', route => route.abort());
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await p.addInitScript(() => localStorage.setItem('hakr_token', 'stub-token'));
await p.addInitScript(() => {
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 30); }
    send(m) { const msg = JSON.parse(m);
      if (msg.type === 'auth') setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_ok' }) }), 10);
      else if (msg.type === 'config/entity_registry/list')
        setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'result', id: msg.id, result: [] }) }), 10); }
    close() {}
  };
});
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2000);
/* leave the workspace map so the preview column shows */
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')]
    .find(x => (x.textContent || '').includes('Porch'))?.click(); });
await p.waitForTimeout(800);

/* 1. FIRST-MOUNT plain frame: no profile has a viewport anywhere —
   expect the HA100 ground-truth fallback, NOT the old 320×537 */
r.plainFirstMount = await p.evaluate(() => {
  const pv = document.querySelector('#pv');
  const rc = pv?.getBoundingClientRect();
  return rc ? { w: Math.round(rc.width), h: Math.round(rc.height) } : null;
});

/* 2. ACTION SNIPPETS: open Actions, export the first sequence, then
   import it back — a new sequence appears with no room stamp */
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')]
    .find(x => (x.querySelector('.truncate')?.textContent || x.textContent || '').includes('Actions'))?.click(); });
await p.waitForTimeout(600);
r.seqCountBefore = await p.evaluate(() =>
  document.body.innerText.match(/·\s*\d+\s*actions/g)?.length || 0);
/* open the first card's ··· menu and hit Export snippet */
await p.evaluate(() => {
  const dots = document.querySelector('.rowmenu button');
  dots?.click(); });
await p.waitForTimeout(250);
r.exportShown = await p.evaluate(() => {
  const it = [...document.querySelectorAll('button')]
    .find(b2 => b2.textContent.trim() === 'Export snippet');
  if (it) { it.click(); return true; }
  return false; });
await p.waitForTimeout(400);
r.importDoor = await p.evaluate(() =>
  document.body.innerText.includes('Import snippet'));
if (r.importDoor) {
  await p.evaluate(() => {
    const sel = [...document.querySelectorAll('select')]
      .find(s => (s.title || '').includes('action snippet'));
    if (sel && sel.options.length > 1) {
      sel.value = sel.options[1].value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    } });
  await p.waitForTimeout(500);
  r.afterImport = await p.evaluate(() => {
    const n = document.body.innerText.match(/·\s*\d+\s*actions/g)?.length || 0;
    return { seqCount: n };
  });
}
r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
