/* SHOOT-V087-STUDIO — regenerates the Studio shots for
   docs/release-notes-v0.87.0.md: the Accents|Brands picker, the
   Your remotes fleet, and the cross-set icon search (REAL mdi/fa
   path data from npm packages in /tmp/msym — nothing invented).
   Not a probe. Needs /tmp/studio-test/build/index.html and the dist
   server on :8482. */
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const req = createRequire('/tmp/msym/');
const mdi = req('@mdi/js');
const fa = req('@fortawesome/free-solid-svg-icons');
const FONTB64 = readFileSync('/tmp/msym/font.b64', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const cfg = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
mkdirSync('/root/work/harmonium/docs/media', { recursive: true });
const OUT = '/root/work/harmonium/docs/media/';

const FLEET = { blueprint: 'harmonium/battery_alerts.yaml', fully: [], units: [
  { unit: 'porch-rs90', name: 'porch', friendly: 'Porch remote', profile: 'rs90',
    version: '0.87.0', workspace: 'main', age: 42, battery: 84, charging: false,
    liveness: 'online', fully_name: 'Fully — Porch',
    fully: { battery_sensor: 'sensor.porch_remote_battery' } },
  { unit: 'den-rs90', name: 'den', friendly: 'Den remote', profile: 'rs90',
    version: '0.87.0', workspace: 'main', age: 1860, battery: 52, charging: false,
    liveness: 'asleep' },
  { unit: 'bedroom-astrion', name: 'bedroom', friendly: 'Bedroom remote',
    profile: 'astrion', version: '0.86.0', workspace: 'main', age: 12, battery: 97,
    charging: true, liveness: 'online' },
] };

const SEARCH_ROWS = [
  { set: 'mdi', name: 'door-open', viewBox: '0 0 24 24', path: mdi.mdiDoorOpen },
  { set: 'mdi', name: 'door-closed', viewBox: '0 0 24 24', path: mdi.mdiDoorClosed },
  { set: 'mdi', name: 'door-sliding', viewBox: '0 0 24 24', path: mdi.mdiDoorSliding },
  { set: 'fa6-solid', name: 'door-open',
    viewBox: `0 0 ${fa.faDoorOpen.icon[0]} ${fa.faDoorOpen.icon[1]}`,
    path: String(fa.faDoorOpen.icon[4]) },
];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 },
  deviceScaleFactor: 2 });
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'POST'
  ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: cfg }));
await ctx.route('**/api/harmonium/workspaces', r => r.fulfill({ json: { order: ['main'],
  workspaces: { main: { name: 'Main', file: 'config.json' } } } }));
await ctx.route('**/api/harmonium/engine_version', r =>
  r.fulfill({ json: { v: '0.87.0', bundled: '0.87.0', integration: '0.87.0' } }));
await ctx.route('**/api/harmonium/pair_admin', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/fleet', r => r.fulfill({ json: FLEET }));
await ctx.route('**/api/config/**', r => r.fulfill({ json: [] }));
await ctx.route('**/api/harmonium/icons*', r => {
  const u = new URL(r.request().url());
  if (r.request().method() === 'POST')
    return r.fulfill({ json: { written: [], rejected: [] } });
  if (u.searchParams.get('resources')) return r.fulfill({ json: { resources: [] } });
  if (u.searchParams.get('sets')) return r.fulfill({ json: { sets: ['mdi'] } });
  const s = u.searchParams.get('search');
  if (s !== null) {
    const rows = SEARCH_ROWS.filter(x => x.name.startsWith(s) || x.name.includes(s));
    return r.fulfill({ json: { icons: rows, sets: ['mdi', 'fa6-solid'] } });
  }
  if (u.searchParams.get('list')) return r.fulfill({ json: { icons: [], no_source: true } });
  return r.fulfill({ json: { found: {}, missing: [], no_source: [] } });
});
await ctx.route('**/harmonium-static/studio.html', r =>
  r.fulfill({ body: studio, contentType: 'text/html' }));
await ctx.route('**api.github.com/**', r => r.abort());
await ctx.route('**/fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css',
  body: "@font-face{font-family:'Material Symbols Outlined';font-style:normal;font-weight:400;src:url(data:font/woff2;base64," + FONTB64 + ") format('woff2');}.material-symbols-outlined{font-family:'Material Symbols Outlined';}" }));

const p = await ctx.newPage();
p.on('pageerror', e => console.log('pageerror:', String(e.message).slice(0, 120)));
await p.addInitScript(() => localStorage.setItem('hakr_token', 'stub-token'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2400);

/* ---- 1. the icon search dropdown (Porch → Listen to Music → Icon) ---- */
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')]
    .find(x => /Porch/i.test(x.textContent || ''))?.click(); });
await p.waitForTimeout(900);
await p.evaluate(() => {
  const hdr = [...document.querySelectorAll('button,div')].filter(x =>
    (x.textContent || '').includes('Listen to Music') && x.children.length < 6)
    .sort((a, b) => a.textContent.length - b.textContent.length)[0];
  hdr?.click(); });
await p.waitForTimeout(700);
const box = p.locator('input[placeholder*="icon"]').first();
await box.scrollIntoViewIfNeeded();
await box.click();
await box.fill('door-open');
await p.waitForTimeout(1100);
console.log('rows:', await p.evaluate(() =>
  [...document.querySelectorAll('.fixed.z-50 button')].map(x =>
    (x.textContent || '').trim()).join(' | ').slice(0, 300)));
const clip1 = await p.evaluate(() => {
  const r = document.querySelector('.fixed.z-50')?.getBoundingClientRect();
  const i = document.querySelector('input[placeholder*="icon"]')?.getBoundingClientRect();
  if (!r) return null;
  const y = Math.max(0, (i ? i.y : r.y) - 10);
  const x = Math.min(r.x, i ? i.x : r.x) - 10;
  return { x: Math.max(0, x), y, width: Math.max(r.right, i ? i.right : 0) - x + 10,
    height: r.bottom - y + 10 };
});
if (clip1) await p.screenshot({ path: OUT + 'v087-icon-search.png', clip: clip1 });
console.log('v087-icon-search.png', clip1 ? Math.round(clip1.width) + '×' + Math.round(clip1.height) : 'MISSED');
await p.keyboard.press('Escape');

/* ---- 2. the Accents | Brands picker, Brands tab ---- */
await p.evaluate(() => {
  const lbl = [...document.querySelectorAll('label, div, span')].find(x =>
    (x.textContent || '').trim() === 'Accent');
  let scope = lbl;
  for (let i = 0; scope && i < 6; i++) {
    const btn = [...scope.querySelectorAll('button')].find(x =>
      (x.textContent || '').includes('▾'));
    if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); return; }
    scope = scope.parentElement;
  }
});
await p.waitForTimeout(500);
await p.evaluate(() => {
  const el = [...document.querySelectorAll('.fixed.z-50 button')].find(x =>
    (x.textContent || '').trim() === 'Brands');
  el?.click(); });
await p.waitForTimeout(400);
const clip2 = await p.evaluate(() => {
  const el = [...document.querySelectorAll('.fixed.z-50')].find(x =>
    (x.textContent || '').includes('Brands'));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x - 14, y: r.y - 14, width: r.width + 28, height: r.height + 28 };
});
if (clip2) await p.screenshot({ path: OUT + 'v087-picker.png', clip: clip2 });
console.log('v087-picker.png', clip2 ? Math.round(clip2.width) + '×' + Math.round(clip2.height) : 'MISSED');
await p.keyboard.press('Escape');
await p.waitForTimeout(300);

/* ---- 3. Your remotes (the fleet) ---- */
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')]
    .find(x => /Remotes/i.test(x.textContent || ''))?.click(); });
await p.waitForTimeout(1200);
const clip3 = await p.evaluate(() => {
  const h = [...document.querySelectorAll('h1,h2,h3,div,span')].filter(x =>
    /Your remotes/i.test(x.textContent || '') && x.children.length < 4)
    .sort((a, b) => a.textContent.length - b.textContent.length)[0];
  if (!h) return null;
  let card = h;
  for (let i = 0; i < 8 && card.parentElement; i++) {
    card = card.parentElement;
    if (card.getBoundingClientRect().height > 200) break;
  }
  const r = card.getBoundingClientRect();
  return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8),
    width: Math.min(r.width + 16, 1500), height: Math.min(r.height + 16, 980) };
});
if (clip3) await p.screenshot({ path: OUT + 'v087-remotes.png', clip: clip3 });
console.log('v087-remotes.png', clip3 ? Math.round(clip3.width) + '×' + Math.round(clip3.height) : 'MISSED');

await b.close();
