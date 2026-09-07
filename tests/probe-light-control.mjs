/* LIGHT CONTROL fence (2026-09-03 — his infratech heater zones are
   light entities: "They are heaters — but defined as a light entity.
   I should see the equivalent of a Volume option (for all dimmers)."
   Ruling: "The light should support brightness. So its part of
   0.87.") The dimmer rides the fan's density chassis: inline = the
   brightness track + − / +, compact = value in the row cluster,
   launcher untouched. Zero is an honest OFF. Color/color-temp stay
   on the domain-parity backlog by the standing ruling. */
import { chromium } from 'playwright-core';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

const CONFIG = { version: 2, home_screen: 'p', screen_order: ['p'], global: { room: 'P' },
  devices: {}, dialects: {}, activities: {},
  screens: { p: { name: 'P', type: 'hub', sections: [
    { columns: 1, tiles: [
      { id: 'li', type: 'light', variant: 'inline', entity: 'light.z1',
        label: 'Zone 1', icon: 'material:heat' },
      { id: 'lc', type: 'light', variant: 'compact', entity: 'light.z1',
        label: 'Zone 1c', icon: 'material:heat' },
      { id: 'ld', type: 'device', entity: 'light.z1', label: 'Zone 1d',
        icon: 'material:heat' },
    ] }] } },
  controllers: {} };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 349, height: 800 } })).newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await (p.context()).route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await (p.context()).route('**/api/harmonium/hello', r => r.fulfill({ json: { ok: true } }));
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

/* seed: on at 50% (brightness 128/255) */
await p.evaluate(() => window.__diff({
  'light.z1': { s: 'on', a: { brightness: 128, supported_features: 0 } } }));
await p.waitForTimeout(300);

/* ---- inline: track + value, fill ≈ 50% ---- */
const inline = await p.evaluate(() => {
  const t = document.getElementById('tile_li');
  const sl = t.querySelector('.sldr');
  const fill = sl && sl.querySelector('i');
  return { hasTrack: !!sl, val: (t.querySelector('.stepval') || {}).textContent,
    fillW: fill ? fill.getBoundingClientRect().width /
      sl.getBoundingClientRect().width : null,
    sub: (t.querySelector('.sub') || {}).textContent || '' };
});
ck('inline: the brightness track renders', inline.hasTrack);
ck('inline: the value reads the brightness (50%)', inline.val === '50%');
ck('inline: the fill sits at half', inline.fillW > 0.44 && inline.fillW < 0.56);
ck('inline: the track owns the number — no status line', inline.sub === '');

/* ---- compact: value + − / + in the row ---- */
const compact = await p.evaluate(() => {
  const t = document.getElementById('tile_lc');
  return { val: (t.querySelector('.inval') || {}).textContent,
    steps: t.querySelectorAll('[data-dvn]').length };
});
ck('compact: the row cluster reads 50% with − / +',
  compact.val === '50%' && compact.steps === 2);

/* ---- launcher: untouched — the classic status line ---- */
ck('launcher tile keeps its status line', await p.evaluate(() =>
  (document.querySelector('#tile_ld .sub') || {}).textContent === 'On · 50%'));

/* ---- + nudges brightness (light.turn_on, brightness 128+26) ---- */
await p.evaluate(() => { document.querySelector('#tile_li [data-dvn="1"]').click(); });
await p.waitForTimeout(200);
ck('+ nudges brightness up through light.turn_on', await p.evaluate(() =>
  window.__svc.some(s => s.domain === 'light' && s.service === 'turn_on' &&
    s.service_data && s.service_data.brightness === 154)));

/* ---- scrub: mid-track sets brightness_pct; the far-left is OFF ---- */
await p.evaluate(() => {
  const sl = document.querySelector('#tile_li .sldr');
  const r = sl.getBoundingClientRect();
  const fire = (type, x) => sl.dispatchEvent(new PointerEvent(type, {
    bubbles: true, clientX: x, clientY: r.top + r.height / 2, pointerId: 7 }));
  fire('pointerdown', r.left + r.width * 0.75);
  fire('pointerup', r.left + r.width * 0.75);
});
await p.waitForTimeout(250);
ck('scrubbing the track sets brightness_pct', await p.evaluate(() =>
  window.__svc.some(s => s.domain === 'light' && s.service === 'turn_on' &&
    s.service_data && s.service_data.brightness_pct >= 70 &&
    s.service_data.brightness_pct <= 80)));
await p.evaluate(() => {
  const sl = document.querySelector('#tile_li .sldr');
  const r = sl.getBoundingClientRect();
  const fire = (type, x) => sl.dispatchEvent(new PointerEvent(type, {
    bubbles: true, clientX: x, clientY: r.top + r.height / 2, pointerId: 8 }));
  fire('pointerdown', r.left + 1);
  fire('pointerup', r.left + 1);
});
await p.waitForTimeout(250);
ck('zero is an honest OFF (light.turn_off, never brightness_pct: 0)',
  await p.evaluate(() =>
    window.__svc.some(s => s.domain === 'light' && s.service === 'turn_off') &&
    !window.__svc.some(s => s.service_data &&
      s.service_data.brightness_pct === 0)));

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
