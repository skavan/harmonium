/* STEPPER VOLUME STYLE probe (v0.83.7 — Suresh: "Volume Slider vs
   Volume Stepper -- they are pretty much identical... Maybe Volume
   Stepper is like Compact except a fat slider bar"). Asserts the
   four styles are now four shapes — for stepper specifically:
   "Vol n%" rides the TITLE line (inline sub) · the fat track sits IN
   the −/+ row (no second track above, no big numeral) · track drag →
   volume_set · −/+ still step · muted → "Muted" + dimmed track ·
   non-volume stepper kinds (brightness) keep the big-numeral shape. */
import { chromium } from 'playwright-core';

const STATES = {
  'media_player.zone_deck': { s: 'playing', a: {
    friendly_name: 'Deck Zone', volume_level: 0.4, is_volume_muted: false,
    supported_features: 84351 } },
  'light.den_lamp': { s: 'on', a: { friendly_name: 'Den Lamp', brightness: 128 } },
  'select.harmonium_den_activity': { s: 'listen', a: { options: ['listen', 'off'] } },
};
const CONFIG = {
  version: 2, home_screen: 'den', screen_order: ['den'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  devices: {},
  activities: { listen: { name: 'Listen', room_view: 'den',
    context: { media_player: 'media_player.zone_deck', volume: 'media_player.zone_deck' },
    screen: 'controller:music5' } },
  screens: { den: { name: 'Den', type: 'hub', room: true,
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'den' }] }] } },
  controllers: { music5: { name: 'Music', type: 'controller', class: 'activity',
    view_kind: 'controller',
    control_target: { label: '$activity.name', volume: '$context.volume', pass_through: [] },
    tiles: [
      { id: 'sv', type: 'stepper', kind: 'volume', entity: '$context.volume',
        label: 'Deck Zone', span: 2 },
      { id: 'sb', type: 'stepper', kind: 'brightness', entity: 'light.den_lamp',
        label: 'Lamp', span: 2 },
    ] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
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
await p.evaluate(() => navigate('controller:music5'));
await p.waitForTimeout(500);

const r = {};
// 1. the new shape: inline "Vol 40%", track inside the row, no
//    stepval, exactly ONE track; brightness keeps stepval + top track
r.shape = await p.evaluate(() => {
  const sv = document.querySelector('#tile_sv');
  const sb = document.querySelector('#tile_sb');
  return {
    sub: sv?.querySelector('.sub.subin')?.textContent,
    trackInRow: !!sv?.querySelector('.steprow .sldr.inrow'),
    tracksTotal: sv?.querySelectorAll('.sldr').length,
    noStepval: !sv?.querySelector('.stepval'),
    fill: sv?.querySelector('.sldr i')?.style.width,
    bright: { stepval: sb?.querySelector('.stepval')?.textContent,
      topTrack: !!sb?.querySelector(':scope > .sldr, .sldr:not(.inrow)') },
  };
});

// 2. drag the in-row track to ~80% → volume_set 0.8
await p.evaluate(() => {
  const sl = document.querySelector('#tile_sv .sldr.inrow');
  const r2 = sl.getBoundingClientRect();
  const x = r2.left + r2.width * 0.8, y = r2.top + r2.height / 2;
  sl.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
  sl.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
});
await p.waitForTimeout(200);
r.drag = await p.evaluate(() => ({
  sets: window._calls.filter(c => c.service === 'volume_set').map(c =>
    ({ ent: c.target?.entity_id ?? c.service_data?.entity_id, v: c.service_data.volume_level })),
}));

// 3. −/+ buttons still step
await p.evaluate(() => { window._calls.length = 0;
  document.querySelector('#tile_sv .steprow .dpbtn[data-st="1"]')?.click(); });
await p.waitForTimeout(150);
r.step = await p.evaluate(() =>
  window._calls.filter(c => c.service === 'volume_set').length);

// 4. muted → "Muted" title + dimmed track
await p.evaluate(() => {
  const cur = S.states.get('media_player.zone_deck');
  cur.a.is_volume_muted = true;
  renderStates();
});
await p.waitForTimeout(200);
r.muted = await p.evaluate(() => {
  const sv = document.querySelector('#tile_sv');
  return { sub: sv?.querySelector('.sub.subin')?.textContent,
    dimmed: !!sv?.querySelector('.sldr.muted') };
});

console.log(JSON.stringify({ r, errs }, null, 1));
await b.close();
