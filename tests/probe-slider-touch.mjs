/* SLIDER TOUCH HYGIENE probe (v0.83.11 — Suresh's Watch Fire TV:
   "trying to scroll the LCD often triggers the LCD buttons
   instead"). wireSlider's intent gate, driven with real pointer
   sequences on a volume tile's track:
   · VERTICAL swipe that starts on the track → the slider must NOT
     fire volume_set and must NOT move its fill — the touch belongs
     to the page scroll;
   · HORIZONTAL drag → engages exactly as before: throttled
     volume_set while dragging, final on release;
   · clean TAP → one volume_set at the tap point (tap-to-set lives);
   · the track advertises touch-action pan-y so the browser scrolls
     the vertical gesture natively. */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'home', screen_order: ['home'],
  global: { room: 'X', activity_select: 'select.x' },
  activities: {},
  screens: { home: { name: 'Home', type: 'hub', grid: { columns: 1 }, sections: [{
    title: 'Sound', tiles: [
      { id: 'v1', type: 'volume', entity: 'media_player.amp', label: 'Amp' },
    ] }] } },
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
        reply({ type: 'event', id: msg.id, event: { a: {
          'media_player.amp': { s: 'playing', a: { volume_level: 0.5, friendly_name: 'Amp' } },
        } } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);

/* record every service call from here on */
await p.evaluate(() => { window._calls = []; const o = callService;
  window.callService = (d, s, data, t) => { window._calls.push({ s, data, t }); }; });
const calls = () => p.evaluate(() => window._calls.splice(0));
const fill = () => p.evaluate(() =>
  document.querySelector('.sldr').firstElementChild.style.width);

const sl = await p.locator('.sldr').boundingBox();
const cx = sl.x + sl.width / 2, cy = sl.y + sl.height / 2;

const r = {};
r.tAction = await p.evaluate(() =>
  getComputedStyle(document.querySelector('.sldr')).touchAction);
r.fill0 = await fill();                                       /* 50% */

/* 1 — VERTICAL swipe: down at center, move 60px down, release */
await p.mouse.move(cx, cy); await p.mouse.down();
await p.mouse.move(cx + 2, cy + 20, { steps: 4 });
await p.mouse.move(cx + 3, cy + 60, { steps: 4 });
await p.mouse.up();
await p.waitForTimeout(120);
r.vertCalls = await calls();                                  /* [] */
r.vertFill = await fill();                                    /* still 50% */

/* 2 — HORIZONTAL drag to ~90%: engages, throttled sets, final on up */
await p.mouse.move(cx, cy); await p.mouse.down();
await p.mouse.move(cx + 30, cy + 1, { steps: 6 });
await p.waitForTimeout(180);
await p.mouse.move(sl.x + sl.width * 0.9, cy + 2, { steps: 6 });
await p.mouse.up();
await p.waitForTimeout(120);
const hc = await calls();
r.dragCalls = hc.map(c => c.s);
r.dragFinal = hc.length ? hc[hc.length - 1].data.volume_level : null;  /* ≈0.9 */

/* 3 — clean TAP at 25%: one set at the tap point */
await p.mouse.move(sl.x + sl.width * 0.25, cy);
await p.mouse.down(); await p.mouse.up();
await p.waitForTimeout(120);
const tc = await calls();
r.tapCalls = tc.map(c => c.s);
r.tapLevel = tc.length ? tc[0].data.volume_level : null;      /* ≈0.25 */

console.log(JSON.stringify({ ...r,
  ok: r.tAction === 'pan-y' && r.fill0 === '50%' &&
      r.vertCalls.length === 0 && r.vertFill === '50%' &&
      r.dragCalls.length >= 1 && r.dragCalls.every(s => s === 'volume_set') &&
      r.dragFinal != null && Math.abs(r.dragFinal - 0.9) < 0.06 &&
      r.tapCalls.length === 1 && r.tapCalls[0] === 'volume_set' &&
      r.tapLevel != null && Math.abs(r.tapLevel - 0.25) < 0.06 &&
      errs.length === 0,
  errs }, null, 1));
await b.close();
