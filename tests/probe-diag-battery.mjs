/* BATTERY ON THE ⓘ PAGE (v0.84.8 — Suresh: "can we build battery
   level into our info page"). The source is HOME ASSISTANT, not the
   webview: Fully's JS interface is deliberately off in our own Fully
   profile, and navigator.getBattery() needs a secure context that a
   plain http:// LAN install does not have. The Fully Kiosk HA
   integration publishes both facts and the battery-alerts blueprint
   already uses them, so the ⓘ row reads the SAME truth as the alert.
   The ids below are SHAPED like a Fully Kiosk device's but are
   deliberately generic — this probe is self-contained (the mock serves
   them), so naming a real house here would buy nothing. Field note
   worth keeping: a re-registered Fully device gets a "_2" suffix on
   every entity, so never assume the un-suffixed id when configuring. */
import { chromium } from 'playwright-core';
const errs = []; const ck = (n, c) => { if (!c) errs.push(n); };
const BATT = 'sensor.remote_tablet_battery';
const PLUG = 'binary_sensor.remote_tablet_plugged_in';
const CONFIG = {
  version: 2, home_screen: 'den', screen_order: ['den'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  devices: {}, activities: {},
  remotes: {
    rs90: { capabilities: ['touch', 'physical_dpad'], keymap: {},
      battery_sensor: BATT, charging_sensor: PLUG },
    bare: { capabilities: ['touch'], keymap: {} },   /* no battery config */
  },
  screens: { den: { name: 'Den', type: 'hub', room: true,
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'den' }] }] } },
  controllers: {},
};
const STATES = {
  [BATT]: { s: '64', a: { friendly_name: 'RS90 Battery', unit_of_measurement: '%' } },
  [PLUG]: { s: 'off', a: { friendly_name: 'Remote Plugged in' } },
  'select.harmonium_den_activity': { s: 'off', a: { options: ['off'] } },
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript((s) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  localStorage.setItem('hakr_device', 'rs90');
  window._sub = [];
  window._STATES = s;
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        window._sub.push(...(msg.entity_ids || []));
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
await p.evaluate(() => navigate('diag:'));
await p.waitForTimeout(600);

const r1 = await p.evaluate(() => ({
  text: document.body.innerText,
  subscribed: window._sub.slice(),
  icon: document.querySelector('#tile_dg_batt .material-symbols-outlined')?.textContent,
}));
ck('battery row rendered', /Battery\s*64%/.test(r1.text));
ck('not charging → no charging suffix', !/64%\s*·\s*charging/.test(r1.text));
ck('level sensor auto-subscribed', r1.subscribed.indexOf(BATT) >= 0);
ck('charging sensor auto-subscribed', r1.subscribed.indexOf(PLUG) >= 0);
ck('healthy level → full icon', r1.icon === 'battery_full');

/* charging + a low level must repaint live (diagScreen re-runs on
   every renderStates, so the row is live, not a snapshot) */
const r2 = await p.evaluate((ids) => {
  const [batt, plug] = ids;
  S.states.set(batt, { s: '9', a: {} });
  S.states.set(plug, { s: 'on', a: {} });
  renderStates();
  return { text: document.body.innerText,
    icon: document.querySelector('#tile_dg_batt .material-symbols-outlined')?.textContent };
}, [BATT, PLUG]);
ck('live update to 9%', /Battery\s*9%/.test(r2.text));
ck('charging shown when plugged in', /9%\s*·\s*charging/.test(r2.text));
ck('charging icon wins', r2.icon === 'battery_charging_full');

/* a remote with NO battery config gets NO row (silence, not "—") */
const r3 = await p.evaluate(() => {
  S.deviceName = 'bare';
  renderStates();
  return { has: !!document.getElementById('tile_dg_batt'),
    text: document.body.innerText };
});
ck('unconfigured remote shows no battery row', !r3.has);
ck('unconfigured remote still renders the ⓘ page', /Viewport/.test(r3.text));

console.log(JSON.stringify({ r1: { icon: r1.icon }, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
