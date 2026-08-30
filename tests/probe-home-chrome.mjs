/* HOME-CHROME probe (2026-08-30 — the "no Home button in a browser"
   report). The touch Home button must follow the HOME WALK (parent →
   boot view → main_home), not merely hide on the boot view: with
   home_screen=porch and global.main_home=home, a browser standing on
   porch had NO way up to the overview. Fences:
     1. on the BOOT VIEW (porch) the Home button SHOWS (old code hid it);
     2. clicking it walks to main_home ("home");
     3. on main_home the button HIDES (the walk is over);
     4. on another room page (deck) it shows;
     5. a physical_dpad client keeps the clean bar (hidden everywhere);
     6. legacy config with NO main_home: hidden on the boot view,
        exactly the old behaviour. */
import { chromium } from 'playwright-core';

const HUB = (room) => ({ name: room, type: 'hub', room: true,
  sections: [{ role: 'activities', hero_label: 'Activities',
    tiles: [{ id: 'acts_' + room, type: 'activities', room }] }] });
const CONFIG = {
  version: 2, home_screen: 'porch', screen_order: ['porch', 'deck'],
  global: { room: 'Porch', activity_select: 'select.harmonium_porch_activity',
    main_home: 'home' },
  devices: {}, dialects: {}, activities: {},
  screens: { porch: HUB('porch'), deck: HUB('deck'),
    home: { name: 'Home', type: 'hub',
      sections: [{ role: 'activities', hero_label: 'Rooms',
        tiles: [{ id: 'acts_home', type: 'activities', room: 'home' }] }] } },
  controllers: {},
};
const STATES = {
  'select.harmonium_porch_activity': { s: 'off', a: { options: ['off'] } },
};
const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript((STATES) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window._STATES = STATES;
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        const a = {}; (msg.entity_ids || []).forEach(e => {
          if (window._STATES[e]) a[e] = window._STATES[e]; });
        reply({ type: 'event', id: msg.id, event: { a } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);

const chrome = () => p.evaluate(() => ({
  screen: S.screen,
  homeHidden: document.getElementById('homeBtn').classList.contains('hidden'),
}));

/* --- 1. boot view: Home button SHOWS (the fix) --- */
let c = await chrome();
ck('boot lands on the boot view', c.screen === 'porch');
ck('Home button shows on the boot view', !c.homeHidden);

/* --- 2. clicking it walks to main_home --- */
await p.evaluate(() => document.getElementById('homeBtn').click());
await p.waitForTimeout(300);
c = await chrome();
ck('Home walks boot view -> main_home', c.screen === 'home');

/* --- 3. at the final stop the button hides --- */
ck('Home button hides on main_home', c.homeHidden);

/* --- 4. another room page shows it --- */
await p.evaluate(() => navigate('deck'));
await p.waitForTimeout(300);
c = await chrome();
ck('Home button shows on a second room page', c.screen === 'deck' && !c.homeHidden);

/* --- 5. a hardware client keeps the clean bar --- */
await p.evaluate(() => { CAPS = new Set(['physical_dpad', 'touch']); navigate('porch'); });
await p.waitForTimeout(300);
c = await chrome();
ck('physical_dpad client never shows touch Home', c.homeHidden);

/* --- 6. legacy: no main_home -> old behaviour on the boot view --- */
await p.evaluate(() => { CAPS = new Set(['touch', 'pointer']);
  delete CONFIG.global.main_home; navigate('deck'); });
await p.waitForTimeout(200);
await p.evaluate(() => navigate('porch'));
await p.waitForTimeout(300);
c = await chrome();
ck('no main_home: hidden on the boot view (legacy)', c.screen === 'porch' && c.homeHidden);

console.log(JSON.stringify({ last: c, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
