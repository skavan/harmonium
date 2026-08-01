import { chromium } from 'playwright-core';
/* GOOGLE TV DIALECT (v0.44; v0.46 = the Dialect Round): ONE player.
   controller:googletv is gone — the TV Media Player's `type: keys`
   generator expands the ACTIVE DIALECT's key catalog over the
   commands channel. Google TV activities get Settings/Search/All
   apps/Quick settings/Live TV; launches ride androidtv.adb_command
   (`am start`, never market://); keycode 84 (voice/mic) is forbidden
   data, never a tile. No dialect keys or unwired commands → the
   whole section skips itself. */
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const r = {}; const errs = [];

const p = await (await b.newContext({ viewport: { width: 380, height: 760 } })).newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(700);
await p.evaluate(() => {
  document.getElementById('auth').classList.add('hidden');
  window._sent = []; S.connected = true;
  S.ws = { send: m => window._sent.push(JSON.parse(m)) };
  S.states.set('media_player.deck_hisense_projector', { s: 'on',
    a: { friendly_name: 'Pergola TV', app_id: 'com.google.android.tvlauncher' } });
  S.states.set('remote.deck_hisense_projector', { s: 'on', a: {} });
  S.states.set('media_player.deck_hisense_projector_adb_192_168_1_64', { s: 'on',
    a: { friendly_name: 'Pergola TV ADB' } });
  /* a deck activity that wires the commands role… */
  CONFIG.activities.watch_projector = {
    name: 'Watch Projector', room_view: 'porch', screen: 'controller:tv',
    context: {
      media_player: 'media_player.deck_hisense_projector',
      dpad: 'remote.deck_hisense_projector',
      power: 'media_player.deck_hisense_projector',
      volume: 'media_player.deck_hisense_projector',
      commands: 'media_player.deck_hisense_projector_adb_192_168_1_64',
      dialect: 'googletv',
    },
  };
  /* …and one that doesn't */
  CONFIG.activities.watch_projector_nocmd = {
    name: 'Projector (no commands)', room_view: 'porch', screen: 'controller:tv',
    context: {
      media_player: 'media_player.deck_hisense_projector',
      dpad: 'remote.deck_hisense_projector',
      dialect: 'googletv',
    },
  };
});

// 1. WIRED: the dialect's key catalog renders on the ONE player
await p.evaluate(() => {
  S.states.set('select.harmonium_porch_activity', { s: 'watch_projector', a: {} });
  navigate('controller:tv');
});
await p.waitForTimeout(200);
r.wired = await p.evaluate(() => ({
  screen: S.screen,
  settings: !!document.getElementById('tile_keys_settings'),
  search: !!document.getElementById('tile_keys_search'),
  allApps: !!document.getElementById('tile_keys_allapps'),
  quickset: !!document.getElementById('tile_keys_quicksettings'),
  liveTv: !!document.getElementById('tile_keys_livetv'),
  heading: [...document.querySelectorAll('.shead')].some(h => h.textContent === 'Device keys'),
  voiceAbsent: ![...document.querySelectorAll('.tile .lbl')]
    .some(l => /voice/i.test(l.textContent)),
}));

// 2. Settings key → androidtv.adb_command keyevent 176 at the ADB entity
await p.evaluate(() => { window._sent.length = 0;
  document.getElementById('tile_keys_settings')?.click(); });
await p.waitForTimeout(250);
r.keyFire = await p.evaluate(() => {
  const c = window._sent.find(m => m.type === 'call_service' && m.domain === 'androidtv');
  return {
    service: c ? c.domain + '.' + c.service : null,
    command: c?.service_data?.command ?? null,
    target: c?.target?.entity_id ?? null,
  };
});

// 3. APPS ride the drawer: the ACTIVITY's googletv dialect overrides
//    the drawer's house default (firetv) — Netflix launches am start
//    on the ADB entity; market:// never appears; BritBox (ADB-only) offered
await p.evaluate(() => { navigate('apps'); });
await p.waitForTimeout(200);
r.drawer = await p.evaluate(() => ({
  netflix: [...document.querySelectorAll('.tile .lbl')].some(l => l.textContent === 'Netflix'),
  britbox: [...document.querySelectorAll('.tile .lbl')].some(l => l.textContent === 'BritBox'),
}));
await p.evaluate(() => { window._sent.length = 0;
  [...document.querySelectorAll('.tile .lbl')]
    .find(l => l.textContent === 'Netflix')?.closest('.tile')?.click(); });
await p.waitForTimeout(250);
r.launch = await p.evaluate(() => {
  const c = window._sent.find(m => m.type === 'call_service' && m.domain === 'androidtv');
  return {
    amStart: c?.service_data?.command?.includes('am start -n com.netflix.ninja') ?? false,
    target: c?.target?.entity_id ?? null,
    noMarket: !JSON.stringify(window._sent).includes('market://'),
  };
});

// 4. UNWIRED commands → every key tile hides AND the section heading
//    disappears with them (empty sections are skipped). The player's
//    own context must never default a commands channel.
await p.evaluate(() => {
  S.states.set('select.harmonium_porch_activity', { s: 'watch_projector_nocmd', a: {} });
  S.stack = []; navigate('porch', true); navigate('controller:tv');
});
await p.waitForTimeout(200);
r.unwired = await p.evaluate(() => ({
  settings: !!document.getElementById('tile_keys_settings'),
  liveTv: !!document.getElementById('tile_keys_livetv'),
  headingGone: ![...document.querySelectorAll('.shead')].some(h => h.textContent === 'Device keys'),
  noCommandsDefault: !('commands' in (CONFIG.controllers.tv.context || {})),
  pureNoProjector: !JSON.stringify(CONFIG.controllers.tv.context || {}).includes('deck_hisense'),
}));

r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
