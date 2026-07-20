import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const r = {}; const errs = [];

const p = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(700);
await p.evaluate(() => {
  document.getElementById('auth').classList.add('hidden');
  window._sent = []; S.connected = true; S.ws = { send: m => window._sent.push(JSON.parse(m)) };
  S.states.set('climate.room_air_conditioner', { s: 'cool', a: {
    friendly_name: 'Room air conditioner', temperature: 61, current_temperature: 66,
    hvac_modes: ['off','cool','dry','fan_only','heat'], fan_modes: ['auto','low','medium','high'] } });
  S.states.set('light.porch_lights', { s: 'on', a: { friendly_name: 'Porch Lights', brightness: 128 } });
  navigate('comfort');
});
await p.waitForTimeout(200);
// auto-trail (tune icon) on climate + light tiles
r.acTrail = !!(await p.$('#tile_c_ac .trail'));
r.lightTrail = !!(await p.$('#tile_c_lights .trail'));
// tap light body still toggles (NOT detail)
await p.evaluate(() => { window._sent.length = 0; });
await p.click('#tile_c_lights', { position: { x: 40, y: 20 } });
r.lightBodyTap = await p.evaluate(() => ({ screen: S.screen, sent: window._sent.map(m => m.domain + '.' + m.service) }));
// tap climate trail -> generated detail screen
await p.click('#tile_c_ac .trail');
await p.waitForTimeout(200);
r.acDetail = await p.evaluate(() => ({
  screen: S.screen, title: document.getElementById('screenName').textContent,
  power: !!document.getElementById('tile_dp'),
  stepVal: document.querySelector('#tile_ds .stepval')?.textContent,
  chips: [...document.querySelectorAll('#tile_dm .chip')].map(c => c.textContent),
  chipOn: document.querySelector('#tile_dm .chip.on')?.textContent,
  fanChips: [...document.querySelectorAll('#tile_df .chip')].length,
  presetHidden: document.getElementById('tile_dpr')?.classList.contains('hidden'),
  focus: S.focusId
}));
// stepper touch +
await p.evaluate(() => { window._sent.length = 0; });
await p.click('#tile_ds [data-st="1"]');
r.stepPlus = await p.evaluate(() => window._sent.map(m => m.service + ':' + JSON.stringify(m.service_data)));
// chip tap -> set_hvac_mode
await p.evaluate(() => { window._sent.length = 0; });
await p.click('#tile_dm .chip[data-ch="dry"]');
r.chipTap = await p.evaluate(() => window._sent.map(m => m.service + ':' + JSON.stringify(m.service_data)));
// VOL keys on detail -> setpoint nudge (context-sensitive exception)
await p.evaluate(() => { window._sent.length = 0; });
await p.keyboard.press('+');
await p.keyboard.press('-');
r.volOnDetail = await p.evaluate(() => window._sent.map(m => m.service + ':' + JSON.stringify(m.service_data)));
// back -> comfort
await p.keyboard.press('Escape');
await p.waitForTimeout(150);
r.backTo = await p.evaluate(() => S.screen);
// VOL off detail -> normal audio path (soundbar via context)
await p.evaluate(() => { window._sent.length = 0; });
await p.keyboard.press('+');
r.volOffDetail = await p.evaluate(() => window._sent.map(m => m.service + '@' + ((m.target||{}).entity_id||'')));
// light detail via trail: brightness stepper + VOL nudges brightness
await p.click('#tile_c_lights .trail');
await p.waitForTimeout(150);
await p.evaluate(() => { window._sent.length = 0; });
r.lightDetail = await p.evaluate(() => ({
  screen: S.screen, stepVal: document.querySelector('#tile_ds .stepval')?.textContent,
  effectHidden: document.getElementById('tile_de')?.classList.contains('hidden') }));
await p.keyboard.press('+');
r.volOnLight = await p.evaluate(() => window._sent.map(m => m.service + ':' + JSON.stringify(m.service_data)));
// dpad: initial focus is stepper; up = +step via capture semantics? focus is ds; select captures; check up after capture
r.dsFocus = await p.evaluate(() => S.focusId);

// ASTRION regression: tv passthrough + Now Playing keeps its APPS trail (explicit wins over auto)
const p2 = await (await b.newContext({ viewport: { width: 320, height: 533 } })).newPage();
p2.on('pageerror', e => errs.push(e.message));
await p2.goto('http://localhost:8482/index.html#device=astrion');
await p2.waitForTimeout(700);
r.astrion = await p2.evaluate(() => {
  document.getElementById('auth').classList.add('hidden');
  window._sent = []; S.connected = true; S.ws = { send: m => window._sent.push(JSON.parse(m)) };
  S.states.set('input_select.porch_activity', { s: 'watch_firetv', a: {} }); S.lastAct = 'watch_firetv';
  navigate('tv');
  return { trailIcon: document.querySelector('#tile_t_np .trail .ic')?.textContent,
           devTrail: !!document.querySelector('#tile_d_snd .trail') };
});
await p2.keyboard.press('ArrowUp');
r.astrion.passUp = await p2.evaluate(() => window._sent.map(m => (m.service_data||{}).command));
// soundbar device tile trail -> media detail
await p2.click('#tile_d_snd .trail');
await p2.waitForTimeout(150);
r.astrion.sndDetail = await p2.evaluate(() => ({ screen: S.screen,
  transport: !!document.getElementById('tile_dt'),
  srcHidden: document.getElementById('tile_dsrc')?.classList.contains('hidden') }));
// on detail screen, physical dpad NOT passthrough (no dpad_passthrough key) -> spatial nav works
await p2.evaluate(() => { window._sent.length = 0; });
await p2.keyboard.press('ArrowUp');
r.astrion.detailDpad = await p2.evaluate(() => window._sent.filter(m => m.type === 'call_service').length);

r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
