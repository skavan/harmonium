import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const r = {}; const errs = [];
// ASTRION-sized viewport: overflow is the key check
const p = await (await b.newContext({ viewport: { width: 480, height: 800 } })).newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8482/index.html#device=astrion');
await p.waitForTimeout(700);
await p.evaluate(() => {
  document.getElementById('auth').classList.add('hidden');
  window._sent = []; S.connected = true; S.ws = { send: m => window._sent.push(JSON.parse(m)) };
  S.states.set('input_select.porch_activity', { s: 'watch_firetv', a: {} }); S.lastAct = 'watch_firetv';
  S.states.set('cover.maestroscreen_04_fr', { s: 'closed', a: { friendly_name: 'Maestro Screen', current_position: 0 } });
  navigate('tv');
});
await p.waitForTimeout(300);
// 1. no horizontal overflow anywhere
r.tvOverflow = await p.evaluate(() =>
  ({ scrollW: document.documentElement.scrollWidth, gridW: document.getElementById('grid').scrollWidth, innerW: innerWidth }));
// 4. status bar one line
r.barOneLine = await p.evaluate(() => {
  const bar = document.getElementById('bar') || document.querySelector('#bar');
  const nm = document.getElementById('screenName');
  return { barH: Math.round(document.querySelector('#bar').getBoundingClientRect().height),
           nameLines: Math.round(nm.getBoundingClientRect().height / 23) };
});
// perf frozen
r.bootMs = await p.evaluate(() => typeof S.bootMs);
// 2. back chevron: hidden on home, shown after nav, click returns
r.backOnTv = await p.evaluate(() => !document.getElementById('backBtn').classList.contains('hidden'));
// 3. cover tile present (on Comfort since v15), tap toggles, trail -> vertical-slider detail
await p.evaluate(() => navigate('comfort'));
await p.waitForTimeout(150);
r.coverTile = !!(await p.$('#tile_c_scr'));
r.coverTrail = !!(await p.$('#tile_c_scr .trail'));
await p.evaluate(() => { window._sent.length = 0; });
await p.click('#tile_c_scr', { position: { x: 30, y: 20 } });
r.coverTap = await p.evaluate(() => window._sent.map(m => m.domain + '.' + m.service));
await p.click('#tile_c_scr .trail');
await p.waitForTimeout(200);
r.coverDetail = await p.evaluate(() => ({
  screen: S.screen,
  trio: !!document.getElementById('tile_dc'),
  vertSlider: !!document.querySelector('#tile_ds .sldr.vert'),
  backShown: !document.getElementById('backBtn').classList.contains('hidden'),
  overflow: document.documentElement.scrollWidth <= innerWidth
}));
// chevron tap -> back to comfort
await p.click('#backBtn');
await p.waitForTimeout(150);
r.chevronBack = await p.evaluate(() => S.screen);
// home: chevron hidden after home key clears stack
await p.keyboard.press(';');
await p.waitForTimeout(150);
r.homeChevron = await p.evaluate(() => ({ screen: S.screen, backHidden: document.getElementById('backBtn').classList.contains('hidden') }));
// apps screen: no ap_back tile; chevron present when arrived from tv
await p.evaluate(() => { navigate('tv'); });
await p.click('#tile_t_np .trail');
await p.waitForTimeout(150);
r.apps = await p.evaluate(() => ({ screen: S.screen, noBackTile: !document.getElementById('tile_ap_back'),
  chevron: !document.getElementById('backBtn').classList.contains('hidden') }));
// climate detail: power row present at top, no dbar
await p.evaluate(() => {
  S.states.set('climate.room_air_conditioner', { s: 'cool', a: { temperature: 61, hvac_modes: ['off','cool'] } });
  navigate('detail:climate.room_air_conditioner');
});
await p.waitForTimeout(150);
r.acDetail = await p.evaluate(() => ({ power: !!document.getElementById('tile_dp'), noDbar: !document.getElementById('tile_db') }));
r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
