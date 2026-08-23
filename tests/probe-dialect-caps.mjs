import { chromium } from 'playwright-core';
/* DIALECT CAPABILITIES (v0.84.3) — a device-type verb declared ONCE on
   the dialect reaches every activity of that type, without living in a
   shared controller. Verifies: (1) `settings` fires the Fire TV ADB
   command via the dialect with NO screen binding; (2) a screen binding
   OVERRIDES the dialect (ladder precedence); (3) an unwired role makes
   the capability a no-op (presence gate via runAction). */
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
  /* the dialect carries the Fire TV Settings verb (as it will ship on
     the firetv dialect) */
  CONFIG.dialects.firetv.capabilities = {
    settings: { service: 'androidtv.adb_command', entity: '$context.media_player',
                data: { command: 'input keyevent --longpress 3' } }
  };
  S.states.set('select.harmonium_porch_activity', { s: 'watch_firetv', a: {} });
  navigate('controller:tv');
});
await p.waitForTimeout(150);
const svc = () => p.evaluate(() => window._sent
  .filter(m => m.type === 'call_service')
  .map(m => m.domain + '.' + m.service + ':' + (m.service_data || {}).command +
    '@' + ((m.target || {}).entity_id || '')));

// 1. dialect verb fires, no screen binding
await p.evaluate(() => { window._sent.length = 0; act('settings'); });
await p.waitForTimeout(120);
r.dialect = await svc();

// 2. a screen binding OVERRIDES the dialect
await p.evaluate(() => {
  CONFIG.controllers.tv.buttons = Object.assign({}, CONFIG.controllers.tv.buttons, {
    settings: { service: 'remote.send_command', entity: '$context.dpad',
                data: { command: 'HOME' } }
  });
  S.stack = []; navigate('porch', true); navigate('controller:tv');
  window._sent.length = 0; act('settings');
});
await p.waitForTimeout(120);
r.screenWins = await svc();

// 3. unwired role → no-op: the $context.media_player slot is ABSENT, so
//    the capability's target resolves to null and runAction bails
await p.evaluate(() => {
  delete CONFIG.controllers.tv.buttons.settings;
  const ctx = CONFIG.activities.watch_firetv.context;
  window._savedMp = ctx.media_player; delete ctx.media_player;
  S.stack = []; navigate('porch', true); navigate('controller:tv');
  window._sent.length = 0; act('settings');
});
await p.waitForTimeout(120);
r.unwired = await svc();
await p.evaluate(() => { CONFIG.activities.watch_firetv.context.media_player = window._savedMp; });

r.ok =
  r.dialect.length === 1 &&
  r.dialect[0] === 'androidtv.adb_command:input keyevent --longpress 3@media_player.fire_tv_family_192_168_1_65' &&
  r.screenWins.length === 1 &&
  r.screenWins[0] === 'remote.send_command:HOME@remote.fire_tv_family_192_168_1_65' &&
  r.unwired.length === 0 &&
  errs.length === 0;

console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close();
