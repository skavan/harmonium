/* CAST GROUPS WITH LOOSE ENTITIES probe (v0.83.7 tidy-ups — his cast
   is raw media_players and the group had nothing to hold).
   Asserts: a cast group whose members are ENTITY ids renders its nav
   card + its generated group: page (loose members drawn as device
   rows / controls) · grouped loose entities LEAVE the Devices
   section · Cast-group cards Off hides the NAV CARD but NOT a
   promoted where:"controls" control (the band gates cards only). */
import { chromium } from 'playwright-core';

const STATES = {
  'media_player.sonos': { s: 'playing', a: {
    friendly_name: 'Sonos', media_title: 'X', volume_level: 0.4,
    supported_features: 84351 } },
  'media_player.deck': { s: 'idle', a: {
    friendly_name: 'Deck Amp', volume_level: 0.3, supported_features: 84351 } },
  'light.porch_lights': { s: 'on', a: { friendly_name: 'Porch Lights' } },
  'select.harmonium_den_activity': { s: 'listen', a: { options: ['listen', 'off'] } },
};
const CONFIG = {
  version: 2, home_screen: 'den', screen_order: ['den'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  devices: {},
  activities: { listen: { name: 'Listen', room_view: 'den',
    context: { media_player: 'media_player.sonos', volume: 'media_player.sonos' },
    extra_devices: ['media_player.deck', 'light.porch_lights'],
    cast: [{ group: 'test_group', name: 'Test Group',
      members: ['light.porch_lights'] }],
    present: { 'media_player.deck': { shows: 'volume', where: 'controls' } },
    screen: 'controller:m9' } },
  screens: { den: { name: 'Den', type: 'hub', room: true,
    sections: [{ tiles: [{ id: 'acts', type: 'activities', room: 'den' }] }] } },
  controllers: { m9: { name: 'Music', type: 'controller', class: 'activity',
    view_kind: 'controller',
    control_target: { label: '$activity.name', volume: '$context.volume', pass_through: [] },
    tiles: [
      { id: 'np', type: 'media', entity: '$context.media_player', label: 'Now Playing', span: 2 },
      { id: 'grp', type: 'groups' },
      { id: 'dev', type: 'devices' },
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
await p.evaluate(() => navigate('controller:m9'));
await p.waitForTimeout(500);

const snap = () => p.evaluate(() => ({
  navCard: [...document.querySelectorAll('.tile.wgt-nav .lbl')]
    .map(x => x.textContent).filter(t => t === 'Test Group'),
  promoted: [...document.querySelectorAll('.tile.wgt-volume .lbl, .tile.wgt-stepper .lbl')]
    .map(x => x.textContent),
  deviceRows: [...document.querySelectorAll('.tile.wgt-device .lbl')]
    .map(x => x.textContent),
}));
const r = {};
// 1. nav card for the entity-member group; grouped light NOT in Devices;
//    promoted deck volume present
r.on = await snap();
// 2. the generated group page renders the loose member
await p.evaluate(() => navigate('group:test_group'));
await p.waitForTimeout(400);
r.page = await p.evaluate(() => ({
  title: document.querySelector('.btitle')?.textContent,
  rows: [...document.querySelectorAll('.tile .lbl')].map(x => x.textContent),
}));
// 3. Cast-group cards Off: nav card gone, promoted control SURVIVES
await p.evaluate(() => {
  CONFIG.activities.listen.surface = { groups: false };
  navigate('den'); navigate('controller:m9');
});
await p.waitForTimeout(400);
r.off = await snap();

console.log(JSON.stringify({ r, errs }, null, 1));
await b.close();
