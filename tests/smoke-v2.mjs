import { chromium } from 'playwright-core';
/* v2 authoring-model features: declarative activity state, control_target
   routing, and the short-press-controls-target input policy. All fields
   are injected at runtime — the served config stays v1, proving the
   features are data-activated. */
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const r = {}; const errs = [];

const p = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(700);
await p.evaluate(() => {
  document.getElementById('auth').classList.add('hidden');
  window._sent = []; S.connected = true; S.ws = { send: m => window._sent.push(JSON.parse(m)) };
  S.states.set('select.harmonium_porch_activity', { s: 'off', a: {} }); S.lastAct = null;
  S.states.set('media_player.sts_samsung_q90_porch', { s: 'on', a: { source: 'TV/HDMI' } });
  S.states.set('media_player.fire_tv_family_192_168_1_65', { s: 'playing', a: {} });
  navigate('porch');
});
await p.waitForTimeout(200);

// ---- 1. declarative activity state ----
// inject harmonia-style eval: Samsung on + source in [Fire TV, TV/HDMI]
r.stateEval = await p.evaluate(() => {
  CONFIG.activities.watch_firetv.state = {
    entities: ['media_player.sts_samsung_q90_porch'],
    on: { all: [
      { entity: 'media_player.sts_samsung_q90_porch', state: 'on' },
      { entity: 'media_player.sts_samsung_q90_porch', attribute: 'source',
        in: ['Fire TV', 'TV/HDMI'] }
    ] }
  };
  renderStates();
  const before = document.getElementById('tile_acts_watch_firetv').classList.contains('on');
  // flip the evidence off -> tile follows DEVICES, not the select
  S.states.set('media_player.sts_samsung_q90_porch', { s: 'off', a: {} });
  renderStates();
  const after = document.getElementById('tile_acts_watch_firetv').classList.contains('on');
  S.states.set('media_player.sts_samsung_q90_porch', { s: 'on', a: { source: 'TV/HDMI' } });
  renderStates();
  return { onWhileSelectOff: before, offWhenTvOff: after };
});

// any_state shape
r.anyState = await p.evaluate(() => {
  CONFIG.activities.music.state = {
    entities: ['media_player.ma_sonos_basement'],
    on: { any_state: ['on', 'playing', 'paused', 'buffering'] }
  };
  S.states.set('media_player.ma_sonos_basement', { s: 'paused', a: {} });
  const paused = isActivityActive('music');
  S.states.set('media_player.ma_sonos_basement', { s: 'idle', a: {} });
  const idle = isActivityActive('music');
  return { paused, idle };
});

// state entities join every subscription
r.subs = await p.evaluate(() =>
  entitiesFor('comfort').includes('media_player.sts_samsung_q90_porch'));

// ---- 2. self-heal: tile shows ON via eval, select stale -> tap repairs ----
await p.evaluate(() => { window._sent.length = 0; });
await p.click('#tile_acts_watch_firetv');
await p.waitForTimeout(150);
r.heal = await p.evaluate(() => ({
  calls: window._sent.filter(m => m.type === 'call_service')
    .map(m => m.domain + '.' + m.service + ':' + JSON.stringify(m.service_data)),
  screen: S.screen                          // opened, not started
}));

// ---- 2b. LIVE policy (short_press: app): tap back on tv = UI back ----
await p.evaluate(() => {
  CAPS.add('physical_dpad');
  navigate('controller:tv', true); S.stack = ['porch']; window._sent.length = 0;
});
await p.waitForTimeout(120);
await p.keyboard.press('[');
await p.waitForTimeout(120);
r.appModeTapBack = await p.evaluate(() => ({
  screen: S.screen,                          // popped to porch (UI back)
  calls: window._sent.filter(m => m.type === 'call_service').length,
  policy: CONFIG.input.physical_buttons.short_press
}));

// ---- 3. TOGGLED policy (short_press: control_target) ----
await p.evaluate(() => {
  CONFIG.input = { physical_buttons: {
    short_press: 'control_target',
    hold: { back: 'app_back', home: 'room_home', power: 'activity_end' }
  } };
  CONFIG.controllers.tv.control_target = {
    navigation: '$context.dpad',
    power: '$context.volume',              // Samsung (tv ctx volume slot)
    pass_through: ['up', 'down', 'left', 'right', 'select', 'back', 'home', 'power']
  };
  CAPS.add('physical_dpad');
  S.states.set('select.harmonium_porch_activity', { s: 'watch_firetv', a: {} });
  navigate('controller:tv', true); S.stack = ['porch'];
  window._sent.length = 0;
});
await p.waitForTimeout(150);

// short back -> DEVICE back, screen unchanged
await p.keyboard.press('[');
r.shortBack = await p.evaluate(() => ({
  screen: S.screen,
  cmds: window._sent.filter(m => m.type === 'call_service')
    .map(m => (m.service_data || {}).command + '@' + ((m.target || {}).entity_id || ''))
}));
// hold back ('{' -> back_hold) -> APP back
await p.keyboard.press('{');
await p.waitForTimeout(120);
r.holdBackApp = await p.evaluate(() => S.screen);

// short power -> toggle the control target, immediately, no confirm
await p.evaluate(() => { navigate('controller:tv', true); S.stack = ['porch']; window._sent.length = 0; });
await p.waitForTimeout(120);
await p.keyboard.press('F2');
r.shortPower = await p.evaluate(() => window._sent.filter(m => m.type === 'call_service')
  .map(m => m.domain + '.' + m.service + '@' + ((m.target || {}).entity_id || '')));

// hold power ('o' -> power_hold) -> end activity (confirm flow, 2 presses)
await p.evaluate(() => {
  delete CONFIG.activities.watch_firetv.state;   // select is truth again here
  window._sent.length = 0;
});
await p.keyboard.press('o');
const first = await p.evaluate(() => window._sent.filter(m => m.type === 'call_service').length);
await p.keyboard.press('o');
await p.waitForTimeout(100);
r.holdPowerEnd = {
  first,
  second: await p.evaluate(() => window._sent.filter(m => m.type === 'call_service')
    .map(m => m.service + '@' + ((m.target || {}).entity_id || '')))
};

// passthrough via pass_through list alone (no dpad_passthrough key)
r.ctPassthrough = await p.evaluate(() => {
  const saved = CONFIG.controllers.tv.dpad_passthrough;
  delete CONFIG.controllers.tv.dpad_passthrough;
  navigate('controller:tv', true);
  window._sent.length = 0;
  const active = passthroughActive();
  CONFIG.controllers.tv.dpad_passthrough = saved;
  return active;
});

// ---- 4. dormancy: strip v2 fields -> v1 behavior intact ----
await p.evaluate(() => {
  delete CONFIG.input;
  delete CONFIG.controllers.tv.control_target;
  navigate('controller:tv', true); S.stack = ['porch'];
  window._sent.length = 0;
});
await p.waitForTimeout(120);
await p.keyboard.press('[');           // v1: tap back = UI back
await p.waitForTimeout(120);
r.v1TapBack = await p.evaluate(() => ({
  screen: S.screen,
  calls: window._sent.filter(m => m.type === 'call_service').length
}));

// per-activity tile visibility on a shared controller (when:)
r.when = await p.evaluate(() => {
  const scr = CONFIG.controllers.tv;
  const sec = scr.sections[0];
  sec.tiles.push({ id: 'w_only', type: 'media', entity: 'media_player.x',
    label: 'SmartOnly', when: { activity: 'watch_smart' } });
  const cur = currentActivityId();
  const shown = tilesOf(scr).some(t => t.id === 'w_only');
  sec.tiles.pop();
  return { cur, shown, consistent: shown === (cur === 'watch_smart') };
});

// action refs: sequence: -> harmonium.run, script.* -> script.turn_on
r.actionRefs = await p.evaluate(() => {
  window._sent.length = 0;
  runActionRef('sequence:all_off');
  runActionRef('script.legacy_thing');
  return window._sent.filter(m => m.type === 'call_service')
    .map(m => m.domain + '.' + m.service + ':' +
      (m.service_data.sequence || (m.target || {}).entity_id || ''));
});

r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
