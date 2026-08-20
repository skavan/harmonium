/* SWITCH TEARDOWN probe (2026-08-20 — Suresh: "If we switch
   activities, where in Studio do I tell it An activity should be
   turned off on a switch activity? and/or ignored"). Per-activity
   `stop_on_switch`: the OUTGOING activity's Stop runs before the
   incoming Start — default OFF (the incoming Start owns the
   transition). Under test: opted-in stop fires on switch; default
   stays silent; ending (not switching) is untouched. */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'home', screen_order: ['home'],
  global: { room: 'X', activity_select: 'select.x' },
  activities: {
    music: { name: 'Music', room_view: 'home', stop_on_switch: true,
      start: 'sequence:music_start', stop: 'sequence:music_stop' },
    tv: { name: 'TV', room_view: 'home',
      start: 'sequence:tv_start', stop: 'sequence:tv_stop' },
    radio: { name: 'Radio', room_view: 'home',
      start: 'sequence:radio_start', stop: 'sequence:radio_stop' },
  },
  screens: {
    home: { name: 'Home', type: 'hub', grid: { columns: 1 }, sections: [{
      tiles: [{ id: 'h1', type: 'preset', label: 'Go', action: {} }] }] },
  },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 480, height: 800 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await p.context().route('**/config.json*', r => r.fulfill({ json: CONFIG }));
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
          'select.x': { s: 'music', a: {} } } } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => {
  window._calls = [];
  window.callService = (d, s, data, t) =>
    { window._calls.push(d + '.' + s + ':' + ((data || {}).sequence || '')); };
});
const calls = () => p.evaluate(() => window._calls.splice(0));

const r = {};
/* music (stop_on_switch: true) is running → starting tv runs
   music's Stop FIRST, then tv's Start */
await p.evaluate(() => startActivity('tv'));
await p.waitForTimeout(150);
r.optedIn = await calls();
/* now impersonating tv (pendingActivity) — tv has NO stop_on_switch:
   switching to radio runs only radio's Start */
await p.evaluate(() => startActivity('radio'));
await p.waitForTimeout(150);
r.defaultOff = await calls();
/* re-selecting the RUNNING activity never tears down */
await p.evaluate(() => startActivity('radio'));
await p.waitForTimeout(150);
r.sameNoop = await calls();

console.log(JSON.stringify({ ...r,
  ok: JSON.stringify(r.optedIn) === JSON.stringify(
        ['harmonium.run:music_stop', 'harmonium.run:tv_start']) &&
      JSON.stringify(r.defaultOff) === '["harmonium.run:radio_start"]' &&
      JSON.stringify(r.sameNoop) === '["harmonium.run:radio_start"]' &&
      errs.length === 0,
  errs }, null, 1));
await b.close();
