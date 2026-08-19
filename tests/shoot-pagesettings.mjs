/* DOC SHOOT — the Page settings → Keys panel (v0.83.11: custom-key
   bindings, hold buttons, Apply to children). Same scaffolding as
   shoot-studio.mjs; output is one clipped PNG for hardware-keys.md /
   the README's key-binding story. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = '/home/claude/shots';
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const cfg = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
const SYMS = readFileSync(
  '/root/work/harmonium/tests/node_modules/material-symbols/material-symbols-outlined.woff2');
const FONT_CSS = `@font-face{font-family:'Material Symbols Outlined';
font-style:normal;font-weight:400;
src:url(/local-syms.woff2) format('woff2')}
.material-symbols-outlined{font-family:'Material Symbols Outlined';
font-weight:normal;font-style:normal;line-height:1;letter-spacing:normal;
text-transform:none;display:inline-block;white-space:nowrap;
word-wrap:normal;direction:ltr;font-feature-settings:'liga';
-webkit-font-smoothing:antialiased}`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({
  viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1.5 });

await ctx.route('**/api/harmonium/config*', route =>
  route.request().method() === 'POST' ? route.fulfill({ json: { ok: true } })
    : route.fulfill({ json: cfg }));
await ctx.route('**/api/harmonium/workspaces', route =>
  route.fulfill({ json: { order: ['main'],
    workspaces: { main: { name: 'Main', file: 'config.json' } } } }));
await ctx.route('**/api/harmonium/engine_version', route =>
  route.fulfill({ json: { v: '0.83.11', bundled: '0.83.11', integration: '0.83.11' } }));
await ctx.route('**/api/harmonium/pair_admin', route =>
  route.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/states', route => route.fulfill({ json: [] }));
await ctx.route('**fonts.googleapis.com/css2*', route =>
  route.fulfill({ body: FONT_CSS, contentType: 'text/css' }));
await ctx.route('**/local-syms.woff2', route =>
  route.fulfill({ body: SYMS, contentType: 'font/woff2',
    headers: { 'Access-Control-Allow-Origin': '*' } }));
await ctx.route('**/local/harmonium/index.html*', route =>
  route.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', route =>
  route.fulfill({ body: studio, contentType: 'text/html' }));
await ctx.route('**api.github.com/**', route => route.abort());

const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
await p.addInitScript(() => localStorage.setItem('hakr_token', 'stub-token'));
await p.addInitScript(() => {
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({
      data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() =>
        this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        reply({ type: 'event', id: msg.id, event: { a: {} } });
      }
      else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});

await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2200);

/* select the Porch screen, open Page settings, land on Keys */
await p.evaluate(() => {
  const el = [...document.querySelectorAll('#nav .item')]
    .find(x => (x.textContent || '').includes('Porch'));
  el?.click(); });
await p.waitForTimeout(800);
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => x.textContent.trim() === 'Page settings')?.click(); });
await p.waitForTimeout(400);
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => x.textContent.trim().startsWith('Keys'))?.click(); });
await p.waitForTimeout(500);

/* clip to the settings panel (accent-bordered card) with margin */
const panel = await p.evaluate(() => {
  const el = [...document.querySelectorAll('div')]
    .find(x => x.className.includes('border-accent/50'));
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
await p.waitForTimeout(400);
const r2 = await p.evaluate(() => {
  const el = [...document.querySelectorAll('div')]
    .find(x => x.className.includes('border-accent/50'));
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
const pad = 14;
await p.screenshot({ path: `${OUT}/raw/studio-page-keys.png`,
  clip: { x: Math.max(0, r2.x - pad), y: Math.max(0, r2.y - pad),
    width: Math.min(1600, r2.w + 2 * pad), height: Math.min(1100, r2.h + 2 * pad) } });

/* honesty check: the new hold buttons are offered in the picker */
const offered = await p.evaluate(() => {
  const opts = [...document.querySelectorAll('select option')]
    .map(o => o.value);
  return { chUpHold: opts.includes('ch_up_hold'),
    chDownHold: opts.includes('ch_down_hold') };
});
const applySwitch = await p.evaluate(() =>
  [...document.querySelectorAll('[role="switch"]')].some(sw =>
    (sw.closest('div')?.textContent || '').includes('Apply to children') ||
    (sw.parentElement?.textContent || '').includes('children')));
console.log(JSON.stringify({ panel: !!panel, offered, applySwitch, errs }, null, 1));
await b.close();
