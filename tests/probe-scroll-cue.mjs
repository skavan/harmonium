/* SCROLL CUE probe (v0.85.8 — Suresh: "a small filled, orange
   triangle at the very bottom of the screen (centered)" when items
   sit below the fold). Fences:
     1. an overfull grid shows the cue — centered, at the very bottom
        (~2px), accent-colored, pointer-events none;
     2. scrolled to the end, the cue goes away;
     3. scrolled back up, it returns (the scroll listener);
     4. a page that fits shows no cue;
     5. with the padstrip up, the cue rides above it (the
        gridVisBottom math), not under it. */
import { chromium } from 'playwright-core';

const tiles = [];
for (let i = 0; i < 24; i++)
  tiles.push({ id: 'lt' + i, type: 'preset', label: 'Tile ' + i,
    icon: 'material:tv',
    action: { service: 'light.toggle', entity: 'light.x' + i, data: {} } });
const CONFIG = {
  version: 2, home_screen: 'den', screen_order: ['den', 'small'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  screens: {
    den: { name: 'Den', type: 'hub', room: true, grid: { columns: 2 },
      sections: [{ hero_label: 'Rooms', tiles }] },
    small: { name: 'Small', type: 'hub',
      tiles: [{ id: 's1', type: 'preset', label: 'One', icon: 'material:tv',
        action: { service: 'light.toggle', entity: 'light.s', data: {} } }] },
  },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        const a = {}; (msg.entity_ids || []).forEach(e => { a[e] = { s: 'off', a: {} }; });
        reply({ type: 'event', id: msg.id, event: { a } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    } close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(1000);

const read = () => p.evaluate(() => {
  const c = document.getElementById('scrollcue');
  if (!c) return { exists: false };
  const cs = getComputedStyle(c);
  const r = c.getBoundingClientRect();
  return { exists: true, on: c.classList.contains('on'),
    opacity: cs.opacity, pe: cs.pointerEvents,
    bottomGap: Math.round(window.innerHeight - r.bottom),
    centerOff: Math.round(Math.abs((r.left + r.right) / 2 - window.innerWidth / 2)),
    borderTop: cs.borderTopColor, bottomPx: c.style.bottom };
});

/* ---- 1. overfull grid: cue on, centered, at the very bottom ------ */
const r1 = await read();
const ck = (n, cnd) => { if (!cnd) errs.push(n + ' :: ' + JSON.stringify(r1)); };
ck('cue exists and is on', r1.exists && r1.on && r1.opacity === '1');
ck('cue is a pure hint (no pointer events)', r1.pe === 'none');
ck('cue sits ~2px off the bottom edge', r1.bottomGap >= 1 && r1.bottomGap <= 4);
ck('cue is centered', r1.centerOff <= 1);

/* ---- 2. at the end of the scroll it goes away -------------------- */
await p.evaluate(() => { const g = document.getElementById('grid'); g.scrollTop = g.scrollHeight; });
await p.waitForTimeout(300);
const r2 = await read();
if (r2.on) errs.push('cue still on at the bottom of the scroll');

/* ---- 3. scrolled back up it returns ------------------------------ */
await p.evaluate(() => { document.getElementById('grid').scrollTop = 0; });
await p.waitForTimeout(300);
const r3 = await read();
if (!r3.on) errs.push('cue did not return after scrolling back up');

/* ---- 5. padstrip up: the cue rides above it ---------------------- */
const strip = await p.evaluate(() => {
  const ps = document.getElementById('padstrip');
  if (!ps) return null;
  ps.classList.remove('hidden');
  document.getElementById('app').classList.add('padstrip-on');
  return true;
});
if (strip) {
  await p.waitForTimeout(800);   /* the slow tick repositions it */
  const r5 = await p.evaluate(() => {
    const c = document.getElementById('scrollcue');
    const ps = document.getElementById('padstrip').getBoundingClientRect();
    const r = c.getBoundingClientRect();
    return { on: c.classList.contains('on'), cueBottom: r.bottom, stripTop: ps.top };
  });
  if (!(r5.on && r5.cueBottom <= r5.stripTop))
    errs.push('cue does not ride above the padstrip :: ' + JSON.stringify(r5));
  await p.evaluate(() => {
    document.getElementById('padstrip').classList.add('hidden');
    document.getElementById('app').classList.remove('padstrip-on');
  });
} else errs.push('no #padstrip element to test against');

/* ---- 4. a page that fits shows no cue ---------------------------- */
await p.evaluate(() => navigate('small'));
await p.waitForTimeout(900);   /* slow tick covers the re-render */
const r4 = await read();
if (r4.on) errs.push('cue shows on a page with nothing below the fold');

console.log(JSON.stringify({ r1, r2on: r2.on, r3on: r3.on, r4on: r4.on,
  ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
