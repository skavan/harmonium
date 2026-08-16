/* v0.83.7 BAND REORDERING (Suresh, controller-tab feedback #1: "We
   should have a move up and move down to control the order"): the
   activity's a.surface.band_order permutes the BAND tiles within
   their section — non-band tiles keep their slots, generators keep
   identity (ordering runs pre-expansion in render.js). Three checks:
   default order np→transport→volume→speakers; band_order
   ["volume","transport","np"] flips the first three and leaves
   speakers (unlisted → after the listed ones, source order); a
   non-band tile wedged mid-list stays exactly where it was. */
import { chromium } from 'playwright-core';
const STATES = {
  'media_player.ma_sonos_basement': { s: 'playing', a: {
    friendly_name: 'MA Basement', volume_level: 0.76,
    group_members: ['media_player.ma_sonos_basement'], supported_features: 84351 } },
  'media_player.onkyo_avr_basement': { s: 'idle', a: {
    friendly_name: 'Onkyo AVR', volume_level: 0.4, group_members: [],
    supported_features: 84351 } },
  'select.harmonium_porch_activity': { s: 'listen', a: { options: ['listen', 'off'] } },
  'light.porch_lamp': { s: 'on', a: { friendly_name: 'Porch Lamp' } },
};
const CONFIG = {
  version: 2, home_screen: 'porch', screen_order: ['porch'],
  global: { room: 'Porch', activity_select: 'select.harmonium_porch_activity' },
  devices: {},
  activities: { listen: { name: 'Listen to Music', room_view: 'porch',
    context: { media_player: 'media_player.ma_sonos_basement', volume: 'media_player.ma_sonos_basement' },
    extra_devices: ['media_player.onkyo_avr_basement'],
    screen: 'controller:music3' } },
  screens: { porch: { name: 'Porch', type: 'hub', room: true,
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'porch' }] }] } },
  controllers: { music3: { name: 'Music', type: 'controller', class: 'activity',
    view_kind: 'controller',
    control_target: { label: '$activity.name', volume: '$context.volume', pass_through: [] },
    tiles: [
      { id: 'np', type: 'media', entity: '$context.media_player', label: 'Now Playing', span: 2 },
      { id: 'tr', type: 'transport', entity: '$context.media_player', label: 'Transport', span: 2 },
      { id: 'lamp', type: 'entity', entity: 'light.porch_lamp', label: 'Lamp' },
      { id: 'vol', type: 'volume', entity: '$context.volume', label: 'Volume', span: 2 },
      { id: 'spk', type: 'speakers' },
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
await p.evaluate(() => navigate('controller:music3'));
await p.waitForTimeout(500);
/* fingerprint the visible tile sequence by widget class */
const seq = () => p.evaluate(() =>
  [...document.querySelectorAll('.tile')].map(el => {
    const m = [...el.classList].find(c => c.startsWith('wgt-'));
    return m ? m.slice(4) : '?';
  }).filter(c => ['media', 'transport', 'volume', 'grouping', 'entity'].includes(c)));
const r = {};
r.dflt = await seq();
/* flip the order live — same trick probe-ctrl-bands uses */
await p.evaluate(() => {
  CONFIG.activities.listen.surface = { band_order: ['volume', 'transport', 'np'] };
  navigate('porch'); navigate('controller:music3');
});
await p.waitForTimeout(400);
r.flipped = await seq();
/* single-band screens must be untouched (bandTiles.length < 2 guard) */
await p.evaluate(() => {
  CONFIG.controllers.music3.tiles = [
    { id: 'vol', type: 'volume', entity: '$context.volume', label: 'Volume', span: 2 },
    { id: 'lamp', type: 'entity', entity: 'light.porch_lamp', label: 'Lamp' },
  ];
  navigate('porch'); navigate('controller:music3');
});
await p.waitForTimeout(400);
r.single = await seq();
console.log(JSON.stringify({ r, errs }));
await b.close();
