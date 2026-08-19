/* GLYPH KEYS + THE BINDING LADDER probe (v0.83.11 — Suresh's pair:
   "Page Settings>>>Keys doesn't offer those buttons" and "if I set
   these on a parent page (i.e. Porch), they apply to porch and all
   its child controllers"). Engine side, custom key `light` (F4):
   1. bound on the page itself → fires (the v0.54 open vocabulary);
   2. parent sets buttons_inherit → child page inherits via its
      parent chain;
   3. a child's OWN binding beats the inherited one;
   4. a CONTROLLER with no parent hops to the running activity's
      room and inherits from there;
   5. no buttons_inherit → children get nothing (opt-in stays real). */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'porch', screen_order: ['porch'],
  global: { room: 'Porch', activity_select: 'select.x' },
  keymap: { F4: 'light' },
  activities: { listen: { name: 'Listen', room_view: 'porch',
    context: {}, screen: 'controller:m' } },
  controllers: { m: { name: 'M', type: 'controller', class: 'activity',
    view_kind: 'controller', control_target: { label: '$activity.name', pass_through: [] },
    tiles: [{ id: 'np', type: 'media', entity: '$context.media_player', span: 2 }] } },
  screens: {
    porch: { name: 'Porch', type: 'hub', room: true, buttons_inherit: true,
      buttons: { light: { navigate: 'music_lib' } },
      sections: [{ tiles: [{ id: 'acts', type: 'activities', room: 'porch' }] }] },
    music_lib: { name: 'Music', type: 'hub', sections: [] },
    child: { name: 'Child', type: 'hub', parent: 'porch', sections: [] },
    child_own: { name: 'ChildOwn', type: 'hub', parent: 'porch',
      buttons: { light: { navigate: 'porch' } }, sections: [] },
    no_inh: { name: 'NoInh', type: 'hub',
      buttons: { light: { navigate: 'music_lib' } }, sections: [] },
    child2: { name: 'Child2', type: 'hub', parent: 'no_inh', sections: [] },
  },
};
const STATES = { 'select.x': { s: 'listen', a: { options: ['listen', 'off'] } } };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript((STATES) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        const a = {}; (msg.entity_ids || []).forEach(e => {
          if (STATES[e]) a[e] = STATES[e]; });
        reply({ type: 'event', id: msg.id, event: { a } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(1000);

const at = () => p.evaluate(() => S.screen);
const go = (sid) => p.evaluate((sid) => navigate(sid), sid);
const press = async () => { await p.keyboard.press('F4'); await p.waitForTimeout(200); };

const r = {};
r.boot = await at();                                   /* porch */
await press(); r.own = await at();                     /* → music_lib (own binding) */

await go('child'); await press();
r.inherited = await at();                              /* → music_lib (parent chain) */

await go('child_own'); await press();
r.childWins = await at();                              /* → porch (own beats inherited) */

await go('controller:m'); await p.waitForTimeout(300); await press();
r.controllerHops = await at();                         /* → music_lib (room hop) */

await go('child2'); await press();
r.optIn = await at();                                  /* stays — no_inh never offered */

console.log(JSON.stringify({ ...r,
  ok: r.boot === 'porch' && r.own === 'music_lib' &&
      r.inherited === 'music_lib' && r.childWins === 'porch' &&
      r.controllerHops === 'music_lib' && r.optIn === 'child2' &&
      errs.length === 0,
  errs }, null, 1));
await b.close();
