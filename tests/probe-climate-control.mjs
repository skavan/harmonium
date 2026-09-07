/* CLIMATE CONTROL fence (2026-09-04 — Suresh's aircon: "In Devices:
   DRAWS AS — some device types are missing options (e.g. Aircon)").
   The thermostat rides the density chassis: inline = the setpoint
   track over the ENTITY's own min/max, compact = the value in the
   row cluster. The far left is the MINIMUM setpoint, never "off" —
   a thermostat's off is the power side, not a temperature. The − / +
   step by the entity's published target_temp_step. */
import { chromium } from 'playwright-core';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

const CONFIG = { version: 2, home_screen: 'p', screen_order: ['p'], global: { room: 'P' },
  devices: {}, dialects: {}, activities: {},
  screens: { p: { name: 'P', type: 'hub', sections: [
    { columns: 1, tiles: [
      { id: 'ci', type: 'climate', variant: 'inline', entity: 'climate.ac',
        label: 'AirCon', icon: 'material:ac_unit' },
      { id: 'cc', type: 'climate', variant: 'compact', entity: 'climate.ac',
        label: 'AirCon c', icon: 'material:ac_unit' },
      { id: 'cd', type: 'device', entity: 'climate.ac', label: 'AirCon d',
        icon: 'material:ac_unit' },
    ] }] } },
  controllers: {} };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 349, height: 800 } })).newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await (p.context()).route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.__svc = [];
  window.__subs = [];
  window.WebSocket = class {
    constructor() { window.__ws = this;
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const g = JSON.parse(m);
      if (g.type === 'subscribe_entities') window.__subs.push(g);
      if (g.type === 'call_service') window.__svc.push(g);
      const r = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (g.type === 'auth') r({ type: 'auth_ok' });
      else r({ type: 'result', id: g.id, success: true, result: null }); }
    close() {}
  };
  window.__diff = (ents) => {
    for (const sub of window.__subs) {
      const c = {};
      for (const k in ents) c[k] = { '+': { s: ents[k].s, a: ents[k].a } };
      window.__ws.onmessage({ data: JSON.stringify({ type: 'event', id: sub.id,
        event: { a: {}, c } }) });
    }
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);

/* seed: heating, set 72° over the entity's own 45..95 half-degree range */
await p.evaluate(() => window.__diff({
  'climate.ac': { s: 'heat', a: { temperature: 72, current_temperature: 68,
    min_temp: 45, max_temp: 95, target_temp_step: 0.5 } } }));
await p.waitForTimeout(300);

/* ---- inline: track + setpoint, fill at (72−45)/50 ≈ 0.54 ---- */
const inline = await p.evaluate(() => {
  const t = document.getElementById('tile_ci');
  const sl = t.querySelector('.sldr');
  const fill = sl && sl.querySelector('i');
  return { hasTrack: !!sl, val: (t.querySelector('.stepval') || {}).textContent,
    fillW: fill ? fill.getBoundingClientRect().width /
      sl.getBoundingClientRect().width : null,
    sub: (t.querySelector('.sub') || {}).textContent || '' };
});
ck('inline: the setpoint track renders', inline.hasTrack);
ck('inline: the value reads the setpoint (72°)', inline.val === '72°');
ck('inline: the fill maps the ENTITY range, not 0..100',
  inline.fillW > 0.49 && inline.fillW < 0.59);
ck('inline: the status keeps mode and current temp (target vs actual)',
  inline.sub.indexOf('68') >= 0 && /heat/i.test(inline.sub));

/* ---- compact: value + − / + in the row ---- */
const compact = await p.evaluate(() => {
  const t = document.getElementById('tile_cc');
  return { val: (t.querySelector('.inval') || {}).textContent,
    steps: t.querySelectorAll('[data-dvn]').length };
});
ck('compact: the row cluster reads 72° with − / +',
  compact.val === '72°' && compact.steps === 2);

/* ---- launcher: untouched — the classic status line ---- */
ck('launcher tile keeps its status line', await p.evaluate(() =>
  /68/.test((document.querySelector('#tile_cd .sub') || {}).textContent || '')));

/* ---- + steps by the PUBLISHED half-degree (72 → 72.5) ---- */
await p.evaluate(() => { document.querySelector('#tile_ci [data-dvn="1"]').click(); });
await p.waitForTimeout(200);
ck('+ steps by the entity\'s own target_temp_step (72.5)', await p.evaluate(() =>
  window.__svc.some(s => s.domain === 'climate' && s.service === 'set_temperature' &&
    s.service_data && s.service_data.temperature === 72.5)));

/* ---- scrub: 75% of the track = 45 + .75·50 ≈ 82.5° ---- */
await p.evaluate(() => {
  const sl = document.querySelector('#tile_ci .sldr');
  const r = sl.getBoundingClientRect();
  const fire = (type, x) => sl.dispatchEvent(new PointerEvent(type, {
    bubbles: true, clientX: x, clientY: r.top + r.height / 2, pointerId: 7 }));
  fire('pointerdown', r.left + r.width * 0.75);
  fire('pointerup', r.left + r.width * 0.75);
});
await p.waitForTimeout(250);
ck('scrubbing sets a temperature ON the range (≈82.5°)', await p.evaluate(() =>
  window.__svc.some(s => s.domain === 'climate' && s.service === 'set_temperature' &&
    s.service_data && s.service_data.temperature >= 81 &&
    s.service_data.temperature <= 84)));

/* ---- the far left is the MINIMUM, never off ---- */
await p.evaluate(() => {
  const sl = document.querySelector('#tile_ci .sldr');
  const r = sl.getBoundingClientRect();
  const fire = (type, x) => sl.dispatchEvent(new PointerEvent(type, {
    bubbles: true, clientX: x, clientY: r.top + r.height / 2, pointerId: 8 }));
  fire('pointerdown', r.left + 1);
  fire('pointerup', r.left + 1);
});
await p.waitForTimeout(250);
ck('the far left sets min_temp (45°) — a thermostat has no "slide to off"',
  await p.evaluate(() =>
    window.__svc.some(s => s.domain === 'climate' && s.service === 'set_temperature' &&
      s.service_data && s.service_data.temperature === 45) &&
    !window.__svc.some(s => s.domain === 'climate' && s.service === 'turn_off')));

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
