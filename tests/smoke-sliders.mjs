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
  S.states.set('light.porch_lights', { s: 'on', a: { friendly_name: 'Porch Lights', brightness: 128 } });
  S.states.set('media_player.ma_soundbar_porch', { s: 'idle', a: { friendly_name: 'Soundbar', volume_level: 0.35 } });
  S.states.set('cover.test_blind', { s: 'open', a: { friendly_name: 'Blind', current_position: 40 } });
  navigate('detail:light.porch_lights');
});
await p.waitForTimeout(200);
r.light = await p.evaluate(() => {
  const sl = document.querySelector('#tile_ds .sldr');
  return { hasSlider: !!sl, vert: sl?.classList.contains('vert'),
    fill: sl?.firstElementChild.style.width, val: document.querySelector('#tile_ds .stepval')?.textContent };
});
// click at ~75% of the track -> brightness_pct ≈ 75
const box = await (await p.$('#tile_ds .sldr')).boundingBox();
await p.evaluate(() => { window._sent.length = 0; });
await p.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
r.click75 = await p.evaluate(() => window._sent.map(m => m.service + ':' + JSON.stringify(m.service_data)));
// drag from 20% to 90% -> throttled turn_on calls, final ≈ 90
await p.evaluate(() => { window._sent.length = 0; });
await p.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
await p.mouse.down();
for (let i = 0.2; i <= 0.9; i += 0.1) {
  await p.mouse.move(box.x + box.width * i, box.y + box.height / 2);
  await p.waitForTimeout(40);
}
await p.mouse.up();
r.drag = await p.evaluate(() => {
  const calls = window._sent.map(m => m.service_data.brightness_pct);
  return { n: calls.length, last: calls[calls.length - 1] };
});
// volume detail: horizontal slider; cover detail: vertical slider
await p.evaluate(() => navigate('detail:media_player.ma_soundbar_porch'));
await p.waitForTimeout(150);
r.volSlider = await p.evaluate(() => {
  const sl = document.querySelector('#tile_ds .sldr');
  return { has: !!sl, vert: sl?.classList.contains('vert'), fill: sl?.firstElementChild.style.width };
});
await p.evaluate(() => navigate('detail:cover.test_blind'));
await p.waitForTimeout(150);
r.cover = await p.evaluate(() => {
  const sl = document.querySelector('#tile_ds .sldr');
  return { has: !!sl, vert: sl?.classList.contains('vert'), fillH: sl?.firstElementChild.style.height,
    val: document.querySelector('#tile_ds .stepval')?.textContent };
});
// vertical drag: click near top -> high position value
const vb = await (await p.$('#tile_ds .sldr')).boundingBox();
await p.evaluate(() => { window._sent.length = 0; });
await p.mouse.click(vb.x + vb.width / 2, vb.y + vb.height * 0.1);
r.coverClickTop = await p.evaluate(() => window._sent.map(m => m.service + ':' + JSON.stringify(m.service_data)));
// temperature detail has NO slider
await p.evaluate(() => {
  S.states.set('climate.room_air_conditioner', { s: 'cool', a: { temperature: 61, hvac_modes: ['off','cool'] } });
  navigate('detail:climate.room_air_conditioner');
});
await p.waitForTimeout(150);
r.tempNoSlider = await p.evaluate(() => !document.querySelector('#tile_ds .sldr'));
r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
