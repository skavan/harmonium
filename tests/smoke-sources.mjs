import { chromium } from 'playwright-core';
/* SOURCES v3 (v0.36, role-governed): the source_select ROLE decides
   which device owns inputs — wiring it in an activity's Setup makes
   the stock Source tile appear (hide-unwired hides it otherwise);
   tap → sources:<mp> detail (chips, pick → select_source). The v0.35
   title-bar input button is GONE (fingertip-hostile on a remote).
   Plus CAST CURATION: device_options[ent].tile === false keeps a cast
   member out of the Devices section while its roles stay wired. */
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const r = {}; const errs = [];

const p = await (await b.newContext({ viewport: { width: 380, height: 640 } })).newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(700);
await p.evaluate(() => {
  document.getElementById('auth').classList.add('hidden');
  window._sent = []; S.connected = true;
  S.ws = { send: m => window._sent.push(JSON.parse(m)) };
  S.states.set('media_player.ma_sonos_basement', { s: 'playing',
    a: { friendly_name: 'Sonos Basement', source: 'Line-in',
         source_list: ['Line-in', 'TV', 'Music Assistant Queue'] } });
  S.states.set('media_player.sts_samsung_q90_porch', { s: 'on',
    a: { friendly_name: 'Samsung Q90', source: 'Fire TV',
         source_list: ['Fire TV', 'TV/HDMI', 'AirPlay'] } });
});

// 1. TV controller with watch_firetv running: the Source tile appears
//    (role wired to the SAMSUNG), sub shows the current input
await p.evaluate(() => {
  S.states.set('select.harmonium_porch_activity', { s: 'watch_firetv', a: {} });
  navigate('controller:tv');
});
await p.waitForTimeout(150);
r.tvTile = await p.evaluate(() => {
  const el = document.getElementById('tile_t_src');
  return { exists: !!el, sub: el?.querySelector('.sub')?.textContent,
    barIcon: document.getElementById('info').textContent };
});

// 2. tap → the SAMSUNG's picker (role target, not the streamer)
await p.evaluate(() => document.getElementById('tile_t_src')?.click());
await p.waitForTimeout(150);
r.tvPick = await p.evaluate(() => ({
  screen: S.screen,
  chips: [...document.querySelectorAll('#grid button, #grid .chip')]
    .map(c => c.textContent.trim()).filter(t => ['Fire TV', 'TV/HDMI', 'AirPlay'].includes(t)).length,
}));
await p.evaluate(() => {
  window._sent.length = 0;
  [...document.querySelectorAll('#grid button, #grid .chip')]
    .find(c => c.textContent.trim() === 'TV/HDMI')?.click();
});
r.tvPick.fired = await p.evaluate(() =>
  window._sent.filter(m => m.type === 'call_service')
    .map(m => m.service + ':' + (m.service_data || {}).source + '@' + ((m.target || {}).entity_id || '')));

// 3. HIDE-UNWIRED: with NO activity running (idle ctx has no
//    source_select on the bare screen context) the tile vanishes
await p.evaluate(() => {
  S.states.set('select.harmonium_porch_activity', { s: 'off', a: {} });
  S.stack = []; navigate('porch', true); navigate('controller:tv');
});
await p.waitForTimeout(150);
r.unwired = await p.evaluate(() => ({
  srcTile: !!document.getElementById('tile_t_src'),
}));

// 4. music controller: role → the Sonos picker
await p.evaluate(() => {
  S.states.set('select.harmonium_porch_activity', { s: 'music', a: {} });
  S.stack = []; navigate('porch', true); navigate('controller:music');
});
await p.waitForTimeout(150);
r.music = await p.evaluate(() => {
  const el = document.getElementById('tile_m_src');
  return { exists: !!el, sub: el?.querySelector('.sub')?.textContent };
});

// 5. CAST CURATION: hiding the samsung from Devices via device_options
//    (roles stay wired: the Source tile survives)
await p.evaluate(() => {
  S.states.set('select.harmonium_porch_activity', { s: 'watch_firetv', a: {} });
  S.stack = []; navigate('porch', true); navigate('controller:tv');
});
await p.waitForTimeout(150);
const devTiles = () => p.evaluate(() =>
  [...document.querySelectorAll('[id^="tile_cast_"]')].map(el => el.id));
r.castBefore = await devTiles();
await p.evaluate(() => {
  CONFIG.activities.watch_firetv.device_options =
    { 'media_player.sts_samsung_q90_porch': { tile: false } };
  S.stack = []; navigate('porch', true); navigate('controller:tv');
});
await p.waitForTimeout(150);
r.castAfter = await devTiles();
r.curation = {
  samsungGone: r.castBefore.some(id => id.includes('sts_samsung')) &&
    !r.castAfter.some(id => id.includes('sts_samsung')),
  othersKept: r.castAfter.length === r.castBefore.length - 1,
  sourceTileSurvives: await p.evaluate(() => !!document.getElementById('tile_t_src')),
};

console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close();
