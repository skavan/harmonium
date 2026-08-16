/* v0.83.7 CONTROLLER TAB, engine side: a.surface band switches.
   Same loose-shape music activity as probe-grouping-loose, but the
   activity says speakers:false, volume:false, transport:false —
   those bands must vanish while Now Playing stays. Then a second
   activity with volume_style:"stepper" proves the style ladder. */
import { chromium } from 'playwright-core';
const STATES = {
  'media_player.ma_sonos_basement': { s: 'playing', a: {
    friendly_name: 'MA Basement', volume_level: 0.76,
    group_members: ['media_player.ma_sonos_basement'], supported_features: 84351 } },
  'media_player.onkyo_avr_basement': { s: 'idle', a: {
    friendly_name: 'Onkyo AVR', volume_level: 0.4, group_members: [],
    supported_features: 84351 } },
  'select.harmonium_porch_activity': { s: 'listen', a: { options: ['listen', 'off'] } },
};
const CONFIG = {
  version: 2, home_screen: 'porch', screen_order: ['porch'],
  global: { room: 'Porch', activity_select: 'select.harmonium_porch_activity' },
  devices: {},
  activities: { listen: { name: 'Listen to Music', room_view: 'porch',
    context: { media_player: 'media_player.ma_sonos_basement', volume: 'media_player.ma_sonos_basement' },
    extra_devices: ['media_player.onkyo_avr_basement'],
    surface: { speakers: false, volume: false, transport: false },
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
const r = {};
r.off = await p.evaluate(() => ({
  np: !!document.querySelector('.tile.wgt-media'),
  transport: !!document.querySelector('.tile.wgt-transport'),
  volume: !!document.querySelector('.tile.wgt-volume'),
  speakers: !!document.querySelector('.tile.wgt-grouping'),
}));
// flip the surface live: everything Auto again → bands return
await p.evaluate(() => {
  delete CONFIG.activities.listen.surface;
  navigate('porch'); navigate('controller:music3');
});
await p.waitForTimeout(400);
r.auto = await p.evaluate(() => ({
  np: !!document.querySelector('.tile.wgt-media'),
  transport: !!document.querySelector('.tile.wgt-transport'),
  volume: !!document.querySelector('.tile.wgt-volume'),
  speakers: !!document.querySelector('.tile.wgt-grouping'),
}));
console.log(JSON.stringify({ r, errs }));
await b.close();
