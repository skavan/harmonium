/* MENU → APPS on the TV controller (2026-08-24 — Suresh: "the menu
   button should launch the library/apps page, not the Fire TV menu,
   which is almost always a nothing screen"). A per-controller binding,
   the mirror of music's menu → music_library: on controller:tv, menu
   navigates to the apps page and the device-menu default never runs. */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'home', screen_order: ['home'],
  global: { room: 'X', activity_select: 'select.x' },
  activities: { tvact: { name: 'Watch TV', context: { dpad: 'remote.fire' } } },
  remotes: { pad: { capabilities: ['physical_dpad', 'touch'] } },
  controllers: {
    tv: { name: 'TV', type: 'controller', class: 'activity',
      dpad_passthrough: 'remote.fire', context: { dpad: 'remote.fire' },
      buttons: { menu: { navigate: 'apps' } },
      sections: [{ tiles: [{ id: 't1', type: 'preset', label: 'NP', action: {} }] }] },
    apps: { name: 'Apps', type: 'controller', class: 'activity',
      sections: [{ tiles: [{ id: 'a1', type: 'preset', label: 'Netflix', action: {} }] }] },
  },
  screens: {
    home: { name: 'Home', type: 'hub', grid: { columns: 1 },
      sections: [{ tiles: [{ id: 'h1', type: 'preset', label: 'Go', action: {} }] }] },
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
  localStorage.setItem('hakr_device', 'pad');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        reply({ type: 'event', id: msg.id, event: { a: { 'select.x': { s: 'tvact', a: {} } } } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);

const r = {};
await p.evaluate(() => navigate('controller:tv')); await p.waitForTimeout(200);
r.before = await p.evaluate(() => S.screen);
// record any service calls, to prove the device-menu default did NOT fire
await p.evaluate(() => { window._svc = []; const o = callService;
  window.callService = (d, s, dat, t) => window._svc.push(d + '.' + s); });
await p.evaluate(() => act('menu'));
await p.waitForTimeout(200);
r.after = await p.evaluate(() => S.screen);
r.svc = await p.evaluate(() => window._svc);

r.ok = r.before === 'controller:tv' && r.after === 'controller:apps' &&
  r.svc.length === 0 && errs.length === 0;
console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close();
