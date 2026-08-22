import { chromium } from 'playwright-core';
/* ROLE-ADDRESSED NAVIGATION (v0.84.2) — a bound button on the SHARED
   Fire TV controller must open the input picker for whatever device
   holds the source_select ROLE, not a hardcoded entity. navTarget()
   resolves the $context token in a virtual target's tail before
   navigate(). This probe also confirms the two service bindings
   (menu, settings) that ship alongside it resolve their $context
   targets and fire the right calls. */
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errs = []; const r = {};
const p = await (await b.newContext({ viewport: { width: 380, height: 640 } })).newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(700);

await p.evaluate(() => {
  document.getElementById('auth').classList.add('hidden');
  window._sent = []; S.connected = true;
  S.ws = { send: m => window._sent.push(JSON.parse(m)) };
  S.states.set('media_player.sts_samsung_q90_porch', { s: 'on',
    a: { friendly_name: 'Samsung Q90', source: 'Fire TV',
         source_list: ['Fire TV', 'TV/HDMI', 'AirPlay'] } });
  /* the three polish bindings, exactly as they go into controller:tv */
  CONFIG.controllers.tv.buttons = Object.assign(
    {}, CONFIG.controllers.tv.buttons, {
      menu:     { service: 'remote.send_command',  entity: '$context.dpad',
                  data: { command: 'MENU' } },
      settings: { service: 'androidtv.adb_command', entity: '$context.media_player',
                  data: { command: 'input keyevent --longpress 3' } },
      source:   { navigate: 'sources:$context.source_select' },
    });
  S.states.set('select.harmonium_porch_activity', { s: 'watch_firetv', a: {} });
  navigate('controller:tv');
});
await p.waitForTimeout(150);

// 1. SOURCE → the role resolves to the concrete sources: screen
await p.evaluate(() => act('source'));
await p.waitForTimeout(150);
r.source = await p.evaluate(() => ({
  screen: S.screen,
  chips: [...document.querySelectorAll('#grid button, #grid .chip')]
    .map(c => c.textContent.trim())
    .filter(t => ['Fire TV', 'TV/HDMI', 'AirPlay'].includes(t)).length,
}));

// 2. MENU → remote.send_command MENU @ the dpad role
await p.evaluate(() => { S.stack = []; navigate('controller:tv'); window._sent.length = 0; act('menu'); });
await p.waitForTimeout(120);
r.menu = await p.evaluate(() => window._sent
  .filter(m => m.type === 'call_service')
  .map(m => m.domain + '.' + m.service + ':' +
    (m.service_data || {}).command + '@' + ((m.target || {}).entity_id || '')));

// 3. SETTINGS → androidtv.adb_command longpress @ the media_player role
await p.evaluate(() => { window._sent.length = 0; act('settings'); });
await p.waitForTimeout(120);
r.settings = await p.evaluate(() => window._sent
  .filter(m => m.type === 'call_service')
  .map(m => m.domain + '.' + m.service + ':' +
    (m.service_data || {}).command + '@' + ((m.target || {}).entity_id || '')));

r.ok =
  r.source.screen === 'sources:media_player.sts_samsung_q90_porch' &&
  r.source.chips === 3 &&
  r.menu.length === 1 &&
  r.menu[0] === 'remote.send_command:MENU@remote.fire_tv_family_192_168_1_65' &&
  r.settings.length === 1 &&
  r.settings[0] === 'androidtv.adb_command:input keyevent --longpress 3@media_player.fire_tv_family_192_168_1_65' &&
  errs.length === 0;

console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close();
