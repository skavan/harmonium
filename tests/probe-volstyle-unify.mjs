/* DRAWS-AS / VOLUME-STYLE UNIFICATION probe (v0.83.7 — Suresh:
   "Volume Style picker is messed up in device cog area... Choosing
   Volume -/+ and then style: anything renders a fat volume slightly
   squashed"). One volume control, style picks the shape — in the
   ⚙-generated Devices section too: shows volume + style stepper →
   the stepper tile (the old branch ignored stepper and drew a
   compact volume); style slider → the fat track; legacy shows
   "stepper" still renders as the stepper (deployed configs). */
import { chromium } from 'playwright-core';

const STATES = {
  'media_player.avr': { s: 'on', a: {
    friendly_name: 'AVR', volume_level: 0.4, supported_features: 84351 } },
  'media_player.tv_main': { s: 'playing', a: {
    friendly_name: 'TV', media_title: 'X', volume_level: 0.5, supported_features: 84351 } },
  'select.harmonium_den_activity': { s: 'watch', a: { options: ['watch', 'off'] } },
};
const mkConfig = (present) => ({
  version: 2, home_screen: 'den', screen_order: ['den'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  devices: {
    tv: { name: 'TV', roles: { media_player: 'media_player.tv_main' } },
    avr: { name: 'AVR', roles: { volume: 'media_player.avr' } },
  },
  activities: { watch: { name: 'Watch', room_view: 'den',
    cast: ['tv', 'avr'], present,
    context: { media_player: 'media_player.tv_main', volume: 'media_player.avr' },
    screen: 'controller:tv6' } },
  screens: { den: { name: 'Den', type: 'hub', room: true,
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'den' }] }] } },
  controllers: { tv6: { name: 'TV', type: 'controller', class: 'activity',
    view_kind: 'controller',
    control_target: { label: '$activity.name', volume: '$context.volume', pass_through: [] },
    tiles: [
      { id: 'np', type: 'media', entity: '$context.media_player', label: 'Now Playing', span: 2 },
      { id: 'dev', type: 'devices' },
    ] } },
});
let CONFIG = mkConfig({ avr: { shows: 'volume', style: 'stepper' } });

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
        const a = {}; (msg.entity_ids || []).forEach(e => { if (STATES[e]) a[e] = STATES[e]; });
        reply({ type: 'event', id: msg.id, event: { a } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => navigate('controller:tv6'));
await p.waitForTimeout(500);

const avrTile = () => p.evaluate(() => {
  const t = [...document.querySelectorAll('.tile')].find(x =>
    x.querySelector('.lbl')?.textContent === 'AVR');
  if (!t) return null;
  const cls = [...t.classList].find(c => c.startsWith('wgt-'));
  return { widget: cls?.slice(4),
    inrow: !!t.querySelector('.sldr.inrow'),
    fatTop: !!t.querySelector(':scope .sldr:not(.inrow)'),
    sub: t.querySelector('.sub.subin, .sub')?.textContent || '' };
});
const r = {};
// style: stepper → the stepper shape (was: compact volume, style ignored)
r.stepper = await avrTile();
// style: slider → the fat volume
await p.evaluate(() => {
  CONFIG.activities.watch.present.avr = { shows: 'volume', style: 'slider' };
  navigate('den'); navigate('controller:tv6');
});
await p.waitForTimeout(400);
r.slider = await avrTile();
// legacy shows: "stepper" (deployed configs) → still the stepper
await p.evaluate(() => {
  CONFIG.activities.watch.present.avr = { shows: 'stepper' };
  navigate('den'); navigate('controller:tv6');
});
await p.waitForTimeout(400);
r.legacy = await avrTile();

console.log(JSON.stringify({ r, errs }, null, 1));
await b.close();
