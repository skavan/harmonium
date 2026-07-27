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
  S.states.set('select.harmonium_porch_activity', { s: 'music', a: {} }); S.lastAct = 'music';
  S.states.set('media_player.ma_sonos_basement', { s: 'playing', a: {
    friendly_name: 'MA Basement', volume_level: 0.35,
    media_title: 'Take Five', media_artist: 'Dave Brubeck', media_album_name: 'Time Out',
    entity_picture: '/api/media_player_proxy/pic.jpg',
    media_duration: 200, media_position: 30,
    media_position_updated_at: new Date().toISOString(),
    shuffle: false, repeat: 'off',
    app_id: 'music_assistant' } });
  S.states.set('sensor.harmonium_music_playlists', { s: '4', a: { items: [
    { name: 'talkSPORT', uri: 'library://radio/1', media_type: 'radio', image: 'r.jpg' },
    { name: 'Daily Mix 1', uri: 'library://playlist/22', media_type: 'playlist', image: 'p1.jpg' },
    { name: 'Discover Weekly', uri: 'library://playlist/14', media_type: 'playlist', image: 'p2.jpg' },
    { name: 'No Art Mix', uri: 'library://playlist/99', media_type: 'playlist', image: null }
  ] } });
  navigate('controller:music');
});
await p.waitForTimeout(250);

// 1. art hero: metadata lines + artwork + interpolated progress
r.hero = await p.evaluate(() => ({
  title: document.querySelector('#tile_m_np .npt')?.textContent,
  artist: document.querySelector('#tile_m_np .npa')?.textContent,
  album: document.querySelector('#tile_m_np .npb')?.textContent,
  imgShown: !document.querySelector('#tile_m_np .npimg')?.classList.contains('hidden'),
  imgSrc: document.querySelector('#tile_m_np .npimg')?.dataset.src,
  progress: document.querySelector('#tile_m_np .npprog i')?.style.width,
  trailIcon: document.querySelector('#tile_m_np .trail .ic')?.textContent
}));

// 1b. inline sub: volume tile value rides the title line, right-aligned
r.inlineVol = await p.evaluate(() => ({
  inTop: !!document.querySelector('#tile_m_vol .top .sub.subin'),
  text: document.querySelector('#tile_m_vol .sub.subin')?.textContent,
  noBlockSub: !document.querySelector('#tile_m_vol > .sub')
}));

// 2. transport roving: focus row, ArrowRight moves highlight, Enter presses it
await p.evaluate(() => { setFocus('m_tr'); window._sent.length = 0; });
await p.keyboard.press('ArrowRight');
r.roveNext = await p.evaluate(() =>
  document.querySelector('#tile_m_tr .cvsel')?.dataset.tr);
await p.keyboard.press('Enter');
r.rovePress = await p.evaluate(() => window._sent.map(m =>
  m.service + '@' + ((m.target || {}).entity_id || '')));
// ArrowLeft twice -> back past play_pause to prev
await p.keyboard.press('ArrowLeft');
await p.keyboard.press('ArrowLeft');
r.rovePrev = await p.evaluate(() =>
  document.querySelector('#tile_m_tr .cvsel')?.dataset.tr);

// 2b. transport icons are prev/next (not rew/ff); no Home tile on music
r.icons = await p.evaluate(() => ({
  prev: document.querySelector('#tile_m_tr [data-tr="media_previous_track"] span')?.textContent,
  next: document.querySelector('#tile_m_tr [data-tr="media_next_track"] span')?.textContent,
  homeTileGone: !document.getElementById('tile_nav_h3')
}));

// 2c. mode bar: shuffle tap -> shuffle_set true; repeat tap -> repeat_set all;
//     active-state render (shuffle on -> mbon; repeat one -> repeat_one icon)
await p.evaluate(() => { window._sent.length = 0; });
await p.click('#tile_m_cmd [data-mb="shuffle"]');
await p.click('#tile_m_cmd [data-mb="repeat"]');
r.modeTaps = await p.evaluate(() => window._sent.map(m =>
  m.service + ':' + JSON.stringify(m.service_data)));
r.modeRender = await p.evaluate(() => {
  const s = S.states.get('media_player.ma_sonos_basement');
  s.a.shuffle = true; s.a.repeat = 'one';
  S.states.set('media_player.ma_sonos_basement', s);
  renderStates();
  return {
    shuffleOn: document.querySelector('#tile_m_cmd [data-mb="shuffle"]').classList.contains('mbon'),
    repeatIcon: document.querySelector('#tile_m_cmd [data-mb="repeat"] span').textContent,
    repeatOn: document.querySelector('#tile_m_cmd [data-mb="repeat"]').classList.contains('mbon')
  };
});

// 2d. physical CH keys -> next/previous track (screen-level buttons map)
await p.evaluate(() => { window._sent.length = 0; });
await p.keyboard.press('PageUp');
await p.keyboard.press('PageDown');
r.chKeys = await p.evaluate(() => window._sent.map(m =>
  m.service + '@' + ((m.target || {}).entity_id || '')));

// 3. hero trail -> music drawer with GENERATED favorite tiles
await p.click('#tile_m_np .trail');
await p.waitForTimeout(250);
r.drawer = await p.evaluate(() => ({
  screen: S.screen,
  pull: !!document.getElementById('tile_mq_pull'),
  favCount: [...document.querySelectorAll('[id^="tile_m_pl_"]')].length,
  first: document.querySelector('#tile_m_pl_0 .lbl')?.textContent,
  firstImg: !!document.querySelector('#tile_m_pl_0 .top img'),
  noArtIcon: document.querySelector('#tile_m_pl_3 .top .ic')?.textContent,
  backChevron: !document.getElementById('backBtn').classList.contains('hidden')
}));

// 4. tap a favorite -> play_media with $item substitution, then the
//    DRAWER POPS back to the music screen (drawer: true)
await p.evaluate(() => { window._sent.length = 0; });
await p.click('#tile_m_pl_2');
await p.waitForTimeout(150);
r.playFav = await p.evaluate(() => window._sent
  .filter(m => m.type === 'call_service')
  .map(m => m.domain + '.' + m.service + ':' + JSON.stringify(m.service_data)
    + '@' + ((m.target || {}).entity_id || '')));
r.playFavPops = await p.evaluate(() => S.screen);

// 5. pull-here tile -> transfer_queue (re-enter drawer first), pops again
await p.click('#tile_m_np .trail');
await p.waitForTimeout(200);
await p.evaluate(() => { window._sent.length = 0; });
await p.click('#tile_mq_pull');
await p.waitForTimeout(150);
r.pull = await p.evaluate(() => window._sent
  .filter(m => m.type === 'call_service')
  .map(m => m.domain + '.' + m.service + ':' + JSON.stringify(m.service_data)));
r.pullPops = await p.evaluate(() => S.screen);

// 6. STRUCTURAL re-render: sensor attribute changes -> tile set follows
r.regen = await p.evaluate(() => {
  navigate('music_library');
  const s = S.states.get('sensor.harmonium_music_playlists');
  s.a = { items: s.a.items.concat(
    { name: 'Fresh Finds', uri: 'library://playlist/50', media_type: 'playlist', image: null }) };
  S.states.set('sensor.harmonium_music_playlists', s);
  renderStates();
  return {
    screen: S.screen,
    favCount: [...document.querySelectorAll('[id^="tile_m_pl_"]')].length,
    newLbl: document.querySelector('#tile_m_pl_4 .lbl')?.textContent
  };
});

// 7. dpad reaches generated tiles + select fires play_media (and pops)
await p.evaluate(() => { setFocus('m_pl_0'); window._sent.length = 0; });
await p.keyboard.press('Enter');
await p.waitForTimeout(120);
r.dpadFav = await p.evaluate(() => window._sent
  .filter(m => m.type === 'call_service').map(m => m.domain + '.' + m.service));
r.dpadFavPops = await p.evaluate(() => S.screen);

// 8. VOL on music screens stays room audio (no detail exception here)
await p.evaluate(() => { window._sent.length = 0; });
await p.keyboard.press('+');
r.vol = await p.evaluate(() => window._sent.map(m =>
  m.service + '@' + ((m.target || {}).entity_id || '')));

// 9. subscription includes the favorites sensor on the drawer screen
r.subs = await p.evaluate(() => entitiesFor('music_library'));

// 9b. plain media tile keeps its sub on the SECOND line (not inline)
await p.evaluate(() => { navigate('controller:tv', true); });
await p.waitForTimeout(200);
r.mediaSecondLine = await p.evaluate(() => ({
  blockSub: !!document.querySelector('#tile_t_np > .sub'),
  noInline: !document.querySelector('#tile_t_np .top .subin'),
  volStillInline: !!document.querySelector('#tile_t_vol .top .subin')
}));

// 10. confirm_switch: starting an activity while ANOTHER runs asks first
await p.evaluate(() => { navigate('porch', true); S.stack = []; window._sent.length = 0; });
await p.waitForTimeout(200);
await p.click('#tile_acts_watch_firetv');   // music is running
r.swFirst = await p.evaluate(() => ({
  calls: window._sent.filter(m => m.type === 'call_service').length,
  bar: document.getElementById('screenName').textContent,
  toneOn: document.getElementById('screenName').classList.contains('cfm-on'),
  tilePulse: !!document.querySelector('#grid .tile.cfm-on')
}));
await p.click('#tile_acts_watch_firetv');   // second press within the window
await p.waitForTimeout(150);
r.swSecond = await p.evaluate(() => ({
  scripts: window._sent.filter(m => m.type === 'call_service')
    .map(m => m.domain + '.' + m.service + '@' + ((m.target || {}).entity_id || '')),
  screen: S.screen,
  toneCleared: !document.getElementById('screenName').classList.contains('cfm-on')
}));
// same-activity open (already running) never asks: music tile -> its screen
await p.evaluate(() => { navigate('porch', true); S.stack = [];
  S.states.set('select.harmonium_porch_activity', { s: 'music', a: {} });
  window._sent.length = 0; });
await p.waitForTimeout(150);
await p.click('#tile_acts_music');
await p.waitForTimeout(120);
r.swSame = await p.evaluate(() => ({
  screen: S.screen,
  calls: window._sent.filter(m => m.type === 'call_service').length
}));

r.errs = errs;
// MUSIC LIBRARY CATEGORIES (v0.31): integration-published favorite
// lists render per section; CH▲ steps categories; MENU tours (wraps)
await p.evaluate(() => {
  const items = (n) => Array.from({ length: n }, (_, i) => ({
    name: 'Item ' + i, uri: 'x://u' + i, media_type: 'playlist', image: null }));
  S.states.set('sensor.harmonium_music_artists',   { s: '2', a: { items: items(2) } });
  S.states.set('sensor.harmonium_music_albums',    { s: '2', a: { items: items(2) } });
  navigate('music_library', true);
});
await p.waitForTimeout(300);
r.library = await p.evaluate(() => ({
  jumps: (S.heroJumps || []).map(j => j.label),
  strip: document.querySelectorAll('#banner .hjump').length,
  playlists: document.querySelectorAll('[id^="tile_m_pl_"]').length,
  artists: document.querySelectorAll('[id^="tile_m_ar_"]').length,
  pull: !!document.getElementById('tile_mq_pull'),
}));
await p.evaluate(() => { window._sent.length = 0; });
await p.keyboard.press('PageUp');   // ch_up
await p.waitForTimeout(250);
r.library.chStep = await p.evaluate(() => ({
  bar: document.getElementById('screenName').textContent,   // Artists
  calls: window._sent.filter(m => m.type === 'call_service').length,  // 0 — no track skip here
}));
await p.keyboard.press('#');        // menu → next category (wraps)
await p.waitForTimeout(250);
r.library.menuStep = await p.evaluate(() =>
  document.getElementById('screenName').textContent);       // Albums
// the music CONTROLLER keeps CH = track skip (binding wins)
await p.evaluate(() => { navigate('controller:music', true); window._sent.length = 0; });
await p.waitForTimeout(250);
await p.keyboard.press('PageUp');
await p.waitForTimeout(150);
r.ctrlChTrack = await p.evaluate(() => window._sent
  .filter(m => m.type === 'call_service').map(m => m.domain + '.' + m.service));

console.log(JSON.stringify(r, null, 1));
await b.close();
