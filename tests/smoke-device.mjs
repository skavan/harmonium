import { chromium } from 'playwright-core';
/* DEVICE tiles (v0.19): one entity, domain-resolved verb + page.
   - dev_tv / dev_music render in the porch Devices section
   - tap while PLAYING -> media_play_pause
   - tap while OFF (no verb) -> navigate to the inferred page
     (dev_tv -> tv via Watch Smart TV's context.media_player;
      dev_music -> music via Listen to Music's)
   - tap: "open" override always navigates
   - touch long-press (550ms pointer hold) -> the page, and the
     click that follows is swallowed */
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const r = {};
const errs = [];
const p = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(700);
await p.evaluate(() => {
  document.getElementById('auth').classList.add('hidden');
  window._sent = []; S.connected = true; S.ws = { send: m => window._sent.push(JSON.parse(m)) };
  S.states.set('select.harmonium_porch_activity', { s: 'off', a: {} });
  S.states.set('media_player.sts_samsung_q90_porch', { s: 'off', a: {} });
  S.states.set('media_player.ma_sonos_basement',
    { s: 'playing', a: { media_title: 'Kind of Blue' } });
  navigate('porch', true);
});
await p.waitForTimeout(300);

// 1. both device tiles render; subs resolve by domain
r.tiles = await p.evaluate(() => ({
  tv: !!document.getElementById('tile_dev_tv'),
  music: !!document.getElementById('tile_dev_music'),
  musicSub: document.querySelector('#tile_dev_music .sub, #tile_dev_music .subin')?.textContent,
  musicOn: document.getElementById('tile_dev_music')?.classList.contains('on'),
  tvOn: document.getElementById('tile_dev_tv')?.classList.contains('on'),
}));

// 2. tap PLAYING music -> play_pause service, no navigation
await p.evaluate(() => { window._sent.length = 0; });
await p.click('#tile_dev_music');
await p.waitForTimeout(150);
r.tapPlaying = await p.evaluate(() => ({
  screen: S.screen,
  svc: window._sent.map(m => m.domain + '.' + m.service),
}));

// 3. tap OFF tv -> no verb -> inferred page (tv, via watch_smart)
await p.evaluate(() => { window._sent.length = 0; });
await p.click('#tile_dev_tv');
await p.waitForTimeout(150);
r.tapOff = await p.evaluate(() => ({
  screen: S.screen,
  svcCount: window._sent.filter(m => m.type === 'call_service').length,
}));

// 4. tap: "open" override on a PLAYING device navigates (music page)
await p.evaluate(() => {
  const t = CONFIG.screens.porch.sections.flatMap(s => s.tiles || [])
    .find(x => x.id === 'dev_music');
  t.tap = 'open';
  navigate('porch', true); /* rebuild with the override */
});
await p.waitForTimeout(150);
await p.click('#tile_dev_music');
await p.waitForTimeout(150);
r.tapOpen = await p.evaluate(() => S.screen);   // expect music

// 5. touch long-press on dev_tv -> tv page, click swallowed
await p.evaluate(() => { navigate('porch', true); window._sent.length = 0; });
await p.waitForTimeout(100);
{
  const box = await p.locator('#tile_dev_tv').boundingBox();
  await p.mouse.move(box.x + 30, box.y + 20);
  await p.mouse.down();
  await p.waitForTimeout(750);
  await p.mouse.up();
}
await p.waitForTimeout(200);
r.hold = await p.evaluate(() => ({
  screen: S.screen,                                   // expect tv
  svcCount: window._sent.filter(m => m.type === 'call_service').length, // 0
}));

// 6. CAST GENERATOR: {type:"devices", activity} expands to one device
//    tile per cast member, primary first (derived from role wiring)
await p.evaluate(() => {
  CONFIG.screens.porch.sections.push({
    role: 'devices', hero_label: 'Cast test',
    tiles: [{ id: 'cst', type: 'devices', activity: 'watch_firetv' }],
  });
  navigate('porch', true);
});
await p.waitForTimeout(200);
r.cast = await p.evaluate(() => {
  const els = [...document.querySelectorAll('[id^="tile_cst_"]')];
  return {
    count: els.length,   // fire_tv mp + samsung + soundbar = 3 (remote.* skipped)
    primaryFirst: els[0]?.id.includes('media_player_fire_tv_family'),
    allDevices: els.every(el => el.className.includes('wgt-device')),
  };
});

// 7. trailing: false = a clean READOUT — no ⚙ block, tap/hold only
await p.evaluate(() => {
  const t = CONFIG.screens.porch.sections.flatMap(s => s.tiles || [])
    .find(x => x.id === 'dev_tv');
  t.trailing = false;
  navigate('porch', true);
});
await p.waitForTimeout(150);
r.noTrail = await p.evaluate(() => ({
  gone: !document.querySelector('#tile_dev_tv .trail'),
  classClean: !document.getElementById('tile_dev_tv').classList.contains('has-trail'),
  musicStill: !!document.querySelector('#tile_dev_music .trail'),
}));

r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
