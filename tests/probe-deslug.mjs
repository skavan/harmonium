import { chromium } from 'playwright-core';
const STATES = {
  'climate.room_air_conditioner': { s: 'cool', a: {
    friendly_name: 'Porch Air', current_temperature: 76, temperature: 71,
    hvac_modes: ['off', 'auto', 'cool', 'dry', 'fan_only', 'heat'],
    fan_mode: 'high', fan_modes: ['auto', 'low', 'medium', 'high', 'turbo'],
    preset_mode: 'none',
    preset_modes: ['none', 'sleep', 'quiet', 'boost', 'wind_free', 'wind_free_sleep'],
    min_temp: 60, max_temp: 86, supported_features: 1 | 8 | 16 } },
  'select.harmonium_porch_activity': { s: 'off', a: { options: [] } },
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await p.addInitScript((STATES) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window._calls = [];
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        const a = {}; (msg.entity_ids || []).forEach(e => { if (STATES[e]) a[e] = STATES[e]; });
        reply({ type: 'event', id: msg.id, event: { a } });
      } else { if (msg.type === 'call_service') window._calls.push(msg);
        reply({ type: 'result', id: msg.id, success: true, result: null }); }
    }
    close() {}
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => navigate('detail:climate.room_air_conditioner'));
await p.waitForTimeout(600);
const r = {};
r.chips = await p.evaluate(() =>
  [...document.querySelectorAll('.chip')].map(c => c.textContent).filter(t => /wind|fan/.test(t)));
/* tap the "wind free" chip → the SERVICE must still get the raw value */
await p.evaluate(() => {
  [...document.querySelectorAll('.chip')].find(c => c.textContent === 'wind free')?.click(); });
await p.waitForTimeout(300);
r.serviceRaw = await p.evaluate(() =>
  window._calls.find(c => c.service === 'set_preset_mode')?.service_data);
r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
