import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const r = {};
const errs = [];

// BROWSER profile: trailing zone is touch + dpad focusable
const p = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(700);
await p.evaluate(() => {
  document.getElementById('auth').classList.add('hidden');
  window._sent = []; S.connected = true; S.ws = { send: m => window._sent.push(JSON.parse(m)) };
  S.states.set('input_select.porch_activity', { s: 'watch_firetv', a: {} }); S.lastAct = 'watch_firetv';
  navigate('tv');
});
await p.waitForTimeout(200);
r.trailExists = !!(await p.$('#tile_t_np .trail'));
r.appsSectionGone = await p.evaluate(() =>
  ![...document.querySelectorAll('.shead')].some(h => h.textContent === 'Apps'));
r.trailRect = await p.$eval('#tile_t_np .trail', el => {
  const q = el.getBoundingClientRect(), t = el.closest('.tile').getBoundingClientRect();
  return { w: Math.round(q.width), hFrac: +(q.height / t.height).toFixed(2) };
});
// touch tap trail -> apps screen; tile body click must NOT navigate
await p.click('#tile_t_np .trail');
await p.waitForTimeout(150);
r.tapTrail = await p.evaluate(() => S.screen);           // expect apps
await p.evaluate(() => { navigate('tv'); window._sent.length = 0; });
await p.click('#tile_t_np', { position: { x: 30, y: 20 } });
await p.waitForTimeout(100);
r.bodyClick = await p.evaluate(() =>
  ({ screen: S.screen, sent: window._sent.map(m => m.service) })); // expect tv + play_pause
// dpad: focus t_np, ArrowRight lands on trail, Enter navigates
await p.evaluate(() => { setFocus('t_np'); });
await p.keyboard.press('ArrowRight');
r.focusAfterRight = await p.evaluate(() => S.focusId);   // expect t_np::trail
r.trailFocusedCls = await p.$eval('#tile_t_np .trail', el => el.classList.contains('focused'));
r.tileNotFocused = await p.$eval('#tile_t_np', el => !el.classList.contains('focused'));
await p.keyboard.press('Enter');
await p.waitForTimeout(150);
r.enterOnTrail = await p.evaluate(() => S.screen);       // expect apps
// back returns to tv
await p.keyboard.press('Escape');
await p.waitForTimeout(100);
r.backFromApps = await p.evaluate(() => S.screen);
// ArrowLeft from trail returns to tile body
await p.evaluate(() => setFocus('t_np::trail'));
await p.keyboard.press('ArrowLeft');
r.leftFromTrail = await p.evaluate(() => S.focusId);     // expect t_np

// ASTRION profile: passthrough owns physical keys; trail still tappable
const p2 = await (await b.newContext({ viewport: { width: 320, height: 533 } })).newPage();
p2.on('pageerror', e => errs.push(e.message));
await p2.goto('http://localhost:8482/index.html#device=astrion');
await p2.waitForTimeout(700);
await p2.evaluate(() => {
  document.getElementById('auth').classList.add('hidden');
  window._sent = []; S.connected = true; S.ws = { send: m => window._sent.push(JSON.parse(m)) };
  S.states.set('input_select.porch_activity', { s: 'watch_firetv', a: {} }); S.lastAct = 'watch_firetv';
  navigate('tv');
});
await p2.waitForTimeout(200);
r.astrion = {};
r.astrion.trailExists = !!(await p2.$('#tile_t_np .trail'));
await p2.evaluate(() => { window._sent.length = 0; });
await p2.keyboard.press('ArrowRight');   // passthrough -> RIGHT to fire tv, no focus move
r.astrion.rightCmd = await p2.evaluate(() => window._sent.map(m => (m.service_data||{}).command));
await p2.click('#tile_t_np .trail');
await p2.waitForTimeout(150);
r.astrion.tapTrail = await p2.evaluate(() => S.screen);  // expect apps
r.astrion.appsBack = await p2.evaluate(() => { navigate('tv'); return true; });

r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
