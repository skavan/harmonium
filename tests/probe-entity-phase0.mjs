/* ENTITY-CONTROLS PHASE 0 probe (2026-08-30 — design-entity-controls
   v2, "close the five inconsistencies first"). Wave 1 fences:
     #1 a launcher with no obvious verb and no authored controller
        opens the entity's generated DETAIL page (never inert);
     #2 the ARC split survives Stepper conversion — the generated
        stepper tile carries level_entity; capability, level reads and
        nudges follow it; MUTE stays on the main entity;
     #3 Draws-as filtering is ONE shared function — the activity ⚙
        (PresPanel) and the page-tile row (TileRow) both call
        stocklib's showsForDomain/showsForRoles, and no private copy
        of the filter survives in either surface (static fences);
     #4 nudgeStep honors the entity's published step/range
        (percentage_step, target_temp_step + min/max_temp) and keeps
        kind defaults when the entity declares nothing. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const CONFIG = {
  version: 2, home_screen: 'porch', screen_order: ['porch'],
  global: { room: 'Porch', activity_select: 'select.harmonium_porch_activity' },
  devices: {}, dialects: {},
  activities: { music: { name: 'Music', room_view: 'porch',
    context: { volume: 'media_player.tv', volume_level: 'media_player.avr' },
    surface: { volume_style: 'stepper' },
    screen: 'controller:music' } },
  screens: { porch: { name: 'Porch', type: 'hub', room: true,
    activity_select: 'select.harmonium_porch_activity',
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'porch' },
              { id: 'sens', type: 'device', entity: 'sensor.temp', label: 'Temp' }] }] } },
  controllers: { music: { name: 'Music', type: 'controller', class: 'activity',
    view_kind: 'controller',
    tiles: [{ id: 'vb', type: 'volumes', span: 2 }] } },
};
const STATES = {
  'media_player.tv': { s: 'on', a: { friendly_name: 'TV', supported_features: 0 } },
  'media_player.avr': { s: 'on', a: { friendly_name: 'AVR', supported_features: 4, volume_level: 0.3 } },
  'sensor.temp': { s: '21.5', a: { friendly_name: 'Temp', unit_of_measurement: '°C' } },
  'fan.deck': { s: 'on', a: { friendly_name: 'Deck Fan', percentage: 0, percentage_step: 25 } },
  'fan.plain': { s: 'on', a: { friendly_name: 'Plain Fan', percentage: 40 } },
  'climate.ac': { s: 'cool', a: { friendly_name: 'AC', temperature: 23.7,
    target_temp_step: 0.5, min_temp: 16, max_temp: 24 } },
  'select.harmonium_porch_activity': { s: 'music', a: { options: ['music', 'off'] } },
};
const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

/* --- #3: Draws-as parity is structural, not coincidental --- */
{
  const src = f => readFileSync(new URL('../studio-src/src/lib/' + f, import.meta.url), 'utf8');
  const lib = src('stocklib.js'), pres = src('components/activity/PresPanel.svelte'),
    trow = src('components/TileRow.svelte');
  ck('#3 stocklib exports the shared showsForDomain + showsForRoles',
    lib.includes('export const showsForDomain') && lib.includes('export const showsForRoles'));
  ck('#3 PresPanel draws-as goes through the shared filters',
    pres.includes('showsForDomain(') && pres.includes('showsForRoles('));
  ck('#3 TileRow draws-as goes through the shared filter', trow.includes('showsForDomain('));
  ck('#3 no private copy of the filter survives in either surface',
    !/SHOWS_KINDS\.filter/.test(pres) && !/SHOWS_KINDS\.filter/.test(trow));
}
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript((STATES) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window._calls = [];
  window._STATES = STATES;
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        const a = {}; (msg.entity_ids || []).forEach(e => {
          if (window._STATES[e]) a[e] = window._STATES[e]; });
        reply({ type: 'event', id: msg.id, event: { a } });
      } else { if (msg.type === 'call_service') window._calls.push(msg);
        reply({ type: 'result', id: msg.id, success: true, result: null }); }
    }
    close() {}
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
const calls = () => p.evaluate(() => window._calls.map(c => ({
  d: c.domain, s: c.service, data: c.service_data, tgt: c.target && c.target.entity_id })));
const reset = () => p.evaluate(() => { window._calls.length = 0; });

/* --- #2: the generated stepper carries the ARC split --- */
await p.evaluate(() => navigate('controller:music'));
await p.waitForTimeout(400);
const td = await p.evaluate(() => tileDef('vb_media_player_tv'));
ck('stepper tile generated', !!td && td.type === 'stepper' && td.kind === 'volume');
ck('stepper carries level_entity', td && td.level_entity === 'media_player.avr');
const hid = await p.evaluate(() => WIDGETS.stepper.hidden('media_player.tv', tileDef('vb_media_player_tv')));
ck('capability check follows the level entity (not the featureless TV)', hid === false);

/* --- #2: nudge writes the LEVEL entity, mute the MAIN --- */
await reset();
await p.evaluate(() => WIDGETS.stepper.keys.right('media_player.tv', tileDef('vb_media_player_tv')));
await p.waitForTimeout(80);
let c = await calls();
ck('nudge sets volume on the AVR (0.30 → 0.33)',
  c.length === 1 && c[0].s === 'volume_set' && c[0].tgt === 'media_player.avr'
  && Math.abs(c[0].data.volume_level - 0.33) < 1e-9);
await reset();
await p.evaluate(() => WIDGETS.stepper.select('media_player.tv', tileDef('vb_media_player_tv')));
await p.waitForTimeout(80);
c = await calls();
ck('mute stays on the MAIN entity (the TV)',
  c.length === 1 && c[0].s === 'volume_mute' && c[0].tgt === 'media_player.tv');

/* --- #1: no verb + no controller => the generated detail page --- */
await p.evaluate(() => { S.stack = []; navigate('porch'); });
await p.waitForTimeout(300);
await p.evaluate(() => WIDGETS.device.select('sensor.temp', tileDef('sens')));
await p.waitForTimeout(300);
const scr = await p.evaluate(() => S.screen);
ck('verbless launcher opens detail:<entity> (never inert)', scr === 'detail:sensor.temp');

/* --- #4: published step/range beat the kind defaults --- */
/* the fans/climate live on no screen, so subscribe never delivered
   them — seed the state map directly (st() must see the attrs) */
await p.evaluate(() => ['fan.deck', 'fan.plain', 'climate.ac']
  .forEach(id => S.states.set(id, window._STATES[id])));
await reset();
await p.evaluate(() => nudgeStep('fan.deck', 'percentage', +1));
await p.evaluate(() => nudgeStep('fan.plain', 'percentage', +1));
await p.evaluate(() => nudgeStep('climate.ac', 'temperature', +1));
await p.waitForTimeout(120);
c = await calls();
ck('fan with percentage_step 25 steps by 25',
  c[0] && c[0].s === 'set_percentage' && c[0].data.percentage === 25 && c[0].tgt === 'fan.deck');
ck('fan without the attribute keeps the default step 10',
  c[1] && c[1].data.percentage === 50 && c[1].tgt === 'fan.plain');
ck('climate steps by target_temp_step and clamps at max_temp',
  c[2] && c[2].s === 'set_temperature' && c[2].data.temperature === 24 && c[2].tgt === 'climate.ac');

console.log(JSON.stringify({ tile: td, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
