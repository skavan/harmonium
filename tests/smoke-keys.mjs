import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const r = {}; const errs = [];

// ---- Astrion profile: tap/hold Back+Home, passthrough cue ----
const p = await (await b.newContext({ viewport: { width: 320, height: 533 } })).newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8482/index.html#device=astrion');
await p.waitForTimeout(700);
await p.evaluate(() => {
  document.getElementById('auth').classList.add('hidden');
  window._sent = []; S.connected = true; S.ws = { send: m => window._sent.push(JSON.parse(m)) };
  S.states.set('select.harmonium_porch_activity', { s: 'off', a: {} }); S.lastAct = null;
  navigate('controller:tv');
});
await p.waitForTimeout(150);

// 1. passthrough cue on tv, absent on music
r.cueTv = await p.evaluate(() => ({
  bar: document.getElementById('bar').classList.contains('pt'),
  icon: !document.getElementById('ptIc').classList.contains('hidden')
}));

// 2. TAP back on tv -> UI back (to home), no device command
await p.evaluate(() => { window._sent.length = 0; });
await p.keyboard.press('[');
await p.waitForTimeout(120);
r.tapBack = await p.evaluate(() => ({
  screen: S.screen,
  cmds: window._sent.filter(m => m.type === 'call_service').map(m => (m.service_data || {}).command)
}));

// 3. HOLD back on tv (shell-mapped '{' key) -> device BACK, screen unchanged
await p.evaluate(() => { navigate('controller:tv'); window._sent.length = 0; });
await p.waitForTimeout(100);
await p.keyboard.press('{');
r.holdBack = await p.evaluate(() => ({
  screen: S.screen,
  cmds: window._sent.filter(m => m.type === 'call_service')
    .map(m => m.service + ':' + ((m.service_data || {}).command || '') + '@' + ((m.target || {}).entity_id || ''))
}));

// 4. HOLD home on tv ('}' and Astrion ';') -> device HOME, screen unchanged;
//    HOLD back Astrion ']' -> device BACK; TAP home (F1) -> parent room
await p.evaluate(() => { window._sent.length = 0; });
await p.keyboard.press('}');
await p.keyboard.press(';');
await p.keyboard.press(']');
r.holdHome = await p.evaluate(() => ({
  screen: S.screen,
  cmds: window._sent.filter(m => m.type === 'call_service').map(m => (m.service_data || {}).command)
}));
// hold-back on a NON-device screen degrades to tap (UI back)
await p.evaluate(() => { navigate('porch', true); S.stack = []; navigate('comfort'); window._sent.length = 0; });
await p.waitForTimeout(100);
await p.keyboard.press('{');
await p.waitForTimeout(100);
r.holdBackNoDev = await p.evaluate(() => ({
  screen: S.screen,
  calls: window._sent.filter(m => m.type === 'call_service').length
}));
await p.evaluate(() => { navigate('controller:tv', true); S.stack = ['porch']; });
await p.keyboard.press('F1');
await p.waitForTimeout(120);
r.tapHome = await p.evaluate(() => ({
  screen: S.screen,
  chevronHidden: document.getElementById('backBtn').classList.contains('hidden'),
  cueOff: !document.getElementById('bar').classList.contains('pt')
}));
// tap home on room page -> system home (parent: rooms)
await p.keyboard.press('F1');
await p.waitForTimeout(120);
r.tapHomeOnRoom = await p.evaluate(() => S.screen);

// 4b. MENU short ('#') on tv -> device MENU; MENU hold ('@') -> apps drawer
await p.evaluate(() => { navigate('controller:tv', true); S.stack = ['porch']; window._sent.length = 0; });
await p.waitForTimeout(100);
await p.keyboard.press('#');
r.menuShort = await p.evaluate(() => ({
  screen: S.screen,
  cmds: window._sent.filter(m => m.type === 'call_service').map(m => (m.service_data || {}).command)
}));
await p.keyboard.press('@');
await p.waitForTimeout(120);
r.menuHold = await p.evaluate(() => S.screen);

// ---- browser profile: VOL focus-follows + power scopes ----
const p2 = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage();
p2.on('pageerror', e => errs.push(e.message));
await p2.goto('http://localhost:8482/index.html');
await p2.waitForTimeout(700);
await p2.evaluate(() => {
  document.getElementById('auth').classList.add('hidden');
  window._sent = []; S.connected = true; S.ws = { send: m => window._sent.push(JSON.parse(m)) };
  S.states.set('select.harmonium_porch_activity', { s: 'off', a: {} }); S.lastAct = null;
  S.states.set('light.porch_lights', { s: 'on', a: { brightness: 128 } });
  S.states.set('light.remote_3_button_backlight', { s: 'off', a: {} });
  S.states.set('climate.room_air_conditioner', { s: 'off', a: { temperature: 70 } });
  S.states.set('cover.maestroscreen_04_fr', { s: 'open', a: { current_position: 60 } });
  S.states.set('media_player.ma_soundbar_porch', { s: 'playing', a: { volume_level: 0.3 } });
  navigate('comfort');
});
await p2.waitForTimeout(150);

// 5. focused light -> VOL nudges brightness; focused cover -> position (inverted)
await p2.evaluate(() => { setFocus('c_lights'); window._sent.length = 0; });
await p2.keyboard.press('+');
r.volLight = await p2.evaluate(() => window._sent.map(m =>
  m.service + ':' + JSON.stringify(m.service_data)));
await p2.evaluate(() => { setFocus('c_scr'); window._sent.length = 0; });
await p2.keyboard.press('+');
r.volCover = await p2.evaluate(() => window._sent.map(m =>
  m.service + ':' + JSON.stringify(m.service_data)));
// non-device focus -> room audio
await p2.evaluate(() => { setFocus('nav_h2'); window._sent.length = 0; });
await p2.keyboard.press('+');
r.volNav = await p2.evaluate(() => window._sent.map(m =>
  m.service + '@' + ((m.target || {}).entity_id || '')));

// 6. group power: first press = confirm only, second = turn_off page devices
await p2.evaluate(() => { window._sent.length = 0; });
await p2.keyboard.press('F2');
r.gpwr1 = await p2.evaluate(() => ({
  calls: window._sent.length,
  bar: document.getElementById('screenName').textContent,
  toneOff: document.getElementById('screenName').classList.contains('cfm-off'),
  tilePulse: document.querySelector('#grid .tile').classList.contains('cfm-off')
}));
await p2.keyboard.press('F2');
await p2.waitForTimeout(100);
r.gpwr2 = await p2.evaluate(() => window._sent.filter(m => m.type === 'call_service')
  .map(m => m.domain + '.' + m.service + '@' + JSON.stringify((m.target || {}).entity_id)));
r.gpwr2TileCleared = await p2.evaluate(() =>
  !document.querySelector('#grid .tile').classList.contains('cfm-off'));

// 6b. POWER OVERRIDE (v0.26): screen.power replaces the Auto scope —
//     comfort forced to "activity" scope with nothing running = flash,
//     no device calls; porch (a host) forced to "devices" = group path
await p2.evaluate(() => {
  CONFIG.screens.comfort.power = 'activity';
  navigate('comfort', true); window._sent.length = 0;
});
await p2.waitForTimeout(120);
await p2.keyboard.press('F2');
r.pwrOverrideActivity = await p2.evaluate(() => ({
  calls: window._sent.filter(m => m.type === 'call_service').length,   // 0
  bar: document.getElementById('screenName').textContent,              // Nothing running
}));
await p2.evaluate(() => {
  delete CONFIG.screens.comfort.power;
  CONFIG.screens.porch.power = 'devices';
  navigate('porch', true); window._sent.length = 0;
});
await p2.waitForTimeout(150);
await p2.keyboard.press('F2');
r.pwrOverrideDevices = await p2.evaluate(() => ({
  confirmBar: document.getElementById('screenName').textContent.includes('Press power again'),
}));
await p2.evaluate(() => { delete CONFIG.screens.porch.power; navigate('comfort', true); });
await p2.waitForTimeout(120);

// 7. detail power: immediate device toggle, no confirm
await p2.evaluate(() => { navigate('detail:light.porch_lights'); window._sent.length = 0; });
await p2.waitForTimeout(120);
await p2.keyboard.press('F2');
r.dpwr = await p2.evaluate(() => window._sent.filter(m => m.type === 'call_service')
  .map(m => m.domain + '.' + m.service + '@' + ((m.target || {}).entity_id || '')));

// 7b. mute ('m'): default toggle on the context audio path
await p2.evaluate(() => { navigate('comfort', true); window._sent.length = 0; });
await p2.waitForTimeout(120);
await p2.keyboard.press('m');
r.mute = await p2.evaluate(() => window._sent.filter(m => m.type === 'call_service')
  .map(m => m.service + ':' + JSON.stringify(m.service_data) + '@' + ((m.target || {}).entity_id || '')));

// 7c. power_hold ('o') v0.28: unbound + idle = NOTHING (derived
//     default only ends a RUNNING activity); a power_hold BINDING
//     (porch: sequence all_off) runs its Action immediately
await p2.evaluate(() => { window._sent.length = 0; });
await p2.keyboard.press('o');
r.powerHoldIdle = await p2.evaluate(() => ({
  calls: window._sent.filter(m => m.type === 'call_service').length,   // 0
  bar: document.getElementById('screenName').textContent,              // Nothing running
}));
await p2.evaluate(() => { navigate('porch', true); window._sent.length = 0; });
await p2.waitForTimeout(150);
await p2.keyboard.press('o');
r.powerHoldBound = await p2.evaluate(() => window._sent.filter(m => m.type === 'call_service')
  .map(m => m.domain + '.' + m.service + ':' + JSON.stringify(m.service_data || {})));
  // expect one harmonium.run {"sequence":"all_off"} — no confirm, it's the deliberate hold
await p2.evaluate(() => { navigate('comfort', true); window._sent.length = 0; });
await p2.waitForTimeout(120);

// 8. room power, nothing running: two-press -> All Off script
await p2.evaluate(() => { navigate('porch', true); S.stack = []; window._sent.length = 0; });
await p2.waitForTimeout(150);
await p2.keyboard.press('F2');
const roomFirst = await p2.evaluate(() => window._sent.filter(m => m.type === 'call_service').length);
await p2.keyboard.press('F2');
await p2.waitForTimeout(100);
r.roomPwr = await p2.evaluate(() => window._sent.filter(m => m.type === 'call_service')
  .map(m => m.service + '@' + ((m.target || {}).entity_id || '')));
r.roomPwrFirst = roomFirst;

r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
