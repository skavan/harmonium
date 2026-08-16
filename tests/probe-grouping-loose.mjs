/* v0.83.7: HIS EXACT SHAPE — a legacy activity with a wired
   media_player + one loose extra media_player, NO pre-wired cast.
   The speakers card must still appear, with live friendly_names. */
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
    devices: ['media_player.ma_sonos_basement', 'media_player.onkyo_avr_basement'],
    screen: 'controller:music3' } },
  screens: { porch: { name: 'Porch', type: 'hub', room: true,
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'porch' }] }] } },
  controllers: { music3: { name: 'Music', type: 'controller', class: 'activity',
    view_kind: 'controller',
    control_target: { label: '$activity.name', volume: '$context.volume', pass_through: [] },
    tiles: [
      { id: 'np', type: 'media', entity: '$context.media_player', label: 'Now Playing', span: 2 },
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
const r = await p.evaluate(() => {
  const w = document.querySelector('.tile.wgt-grouping');
  const rows = [...(w?.querySelectorAll('.grprow') || [])]
    .filter(x => x.style.display !== 'none')
    .map(x => ({ ent: x.dataset.ent, name: x.querySelector('.gname').textContent }));
  return { card: !!w, rows, sub: w?.querySelector('.sub')?.textContent };
});
console.log(JSON.stringify({ r, errs }));
await b.close();
