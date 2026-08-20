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

// 2d. CH CONTRACT (final doctrine, 2026-08-20): on the music page
//     short CH = section jump / walk (zero service calls), while
//     hold CH SKIPS TRACKS — CH▲-hold previous, CH▼-hold next
//     ("Long Press in Next / Previous Track", engine default,
//     gen 5 keeps the old seek bindings struck).
await p.evaluate(() => { window._sent.length = 0; });
await p.keyboard.press('PageUp');
await p.keyboard.press('PageDown');
r.chKeys = await p.evaluate(() => window._sent.map(m =>
  m.service + '@' + ((m.target || {}).entity_id || '')));   // want: []
await p.keyboard.press("'");
await p.keyboard.press('/');
await p.waitForTimeout(150);
r.chHoldTracks = await p.evaluate(() => window._sent
  .filter(m => m.type === 'call_service')
  .map(m => m.domain + '.' + m.service));
// want: [media_player.media_previous_track, media_player.media_next_track]

// 2e. VOLUME TILE GRAMMAR (round 77 — "DPad Up and Dpad Dn change
//     the volume. They shouldn't… But DPad left and Right SHOULD.
//     … OK doesn't mute. I thought we said it should"): focused
//     volume tile answers ◀▶ with the level, ▲ walks away, OK mutes
//     — no capture, no mode.
await p.evaluate(() => { navigate('controller:music', true); });
await p.waitForTimeout(200);
await p.evaluate(() => { setFocus('m_vol'); window._sent.length = 0; });
await p.keyboard.press('ArrowRight');
await p.keyboard.press('ArrowLeft');
await p.waitForTimeout(120);
r.volKeys = await p.evaluate(() => window._sent
  .filter(m => m.type === 'call_service').map(m => m.service));
// want: [volume_up, volume_down]
await p.keyboard.press('ArrowUp');
await p.waitForTimeout(120);
r.volUpNavs = await p.evaluate(() => ({
  movedOff: S.focusId !== 'm_vol',
  extraCalls: window._sent.filter(m => m.type === 'call_service').length - 2 }));
await p.evaluate(() => { setFocus('m_vol'); window._sent.length = 0; });
await p.keyboard.press('Enter');
await p.waitForTimeout(150);
r.volOkMutes = await p.evaluate(() => window._sent
  .filter(m => m.type === 'call_service')
  .map(m => m.service + ':' + JSON.stringify((m.service_data || {}).is_volume_muted)));
// want: ["volume_mute:true"]

// 3. hero trail -> music drawer: THREE-BAND BROWSE (v0.50). The
//    engine walks the STANDARD tree root -> selected root -> selected
//    category automatically; the mock answers like a Sonos would.
await p.evaluate(() => {
  window._respond = (result) => {
    const req = window._sent.filter(m => m.type === 'media_player/browse_media').pop();
    const cb = S.pending.get(req.id);
    S.pending.delete(req.id);
    cb({ id: req.id, type: 'result', success: true, result });
    return req;
  };
  window._lastReq = () =>
    window._sent.filter(m => m.type === 'media_player/browse_media').pop();
});
await p.click('#tile_m_np .trail');
await p.waitForTimeout(250);
r.drawer = await p.evaluate(() => ({
  screen: S.screen,
  loading: document.querySelector('#tile_lib_ld .lbl')?.textContent,
  asked: window._sent.filter(m => m.type === 'media_player/browse_media').length,
}));

// 4. ROOT answer: curated (media-source:// junk dropped), Favorites
//    (EMPTY id, like real Sonos) auto-selected -> auto-fetch of it
await p.evaluate(() => {
  window._respond({ title: 'Sonos', children: [
    { title: 'Favorites', media_class: 'directory', media_content_id: '',
      media_content_type: 'favorites', can_expand: true, can_play: false },
    { title: 'Music Library', media_class: 'directory', media_content_id: 'lib',
      media_content_type: 'library', can_expand: true, can_play: false },
    { title: 'talkSPORT', media_class: 'channel', media_content_id: 'x-rincon:radio',
      media_content_type: 'music', can_expand: false, can_play: true },
    { title: 'Camera', media_class: 'app', can_expand: true, can_play: false,
      media_content_id: 'media-source://camera', media_content_type: 'app' },
    { title: 'Text-to-speech', media_class: 'app', can_expand: true, can_play: false,
      media_content_id: 'media-source://tts', media_content_type: 'app' },
  ] });
});
await p.waitForTimeout(150);
r.autoRoot = await p.evaluate(() => ({
  req: (window._lastReq().media_content_id ?? 'MISSING') + '|' +
    window._lastReq().media_content_type,          // ''|favorites — empty id ≠ root
}));

// 5. Favorites children are ALL directories -> CATEGORY CHIPS; first
//    auto-selected and fetched; items land in the grid; bands in #brbar
await p.evaluate(() => {
  window._respond({ title: 'Favorites', children: [
    { title: 'Playlists', media_class: 'directory', media_content_id: 'pl',
      media_content_type: 'playlists', can_expand: true, can_play: false },
    { title: 'Radio', media_class: 'directory', media_content_id: 'ra',
      media_content_type: 'radios', can_expand: true, can_play: false },
    { title: 'Tracks', media_class: 'directory', media_content_id: 'tr',
      media_content_type: 'tracks', can_expand: true, can_play: false },
  ] });
});
await p.waitForTimeout(150);
await p.evaluate(() => {
  window._respond({ title: 'Playlists', children: [
    { title: 'Daily Mix 1', media_class: 'playlist', media_content_id: 'pl/1',
      media_content_type: 'playlist', can_expand: false, can_play: true },
    { title: 'Discover Weekly', media_class: 'playlist', media_content_id: 'pl/2',
      media_content_type: 'playlist', can_expand: false, can_play: true },
  ] });
});
await p.waitForTimeout(200);
r.bands = await p.evaluate(() => ({
  barOn: document.getElementById('brbar').classList.contains('onbar'),
  pullGone: !document.querySelector('#brbar [data-brt]'),
  roots: [...document.querySelectorAll('#brbar [data-brr] .brl')].map(e => e.textContent),
  rootOn: document.querySelector('#brbar [data-brr].on .brl')?.textContent,
  chips: [...document.querySelectorAll('#brbar .brchip')].map(e => e.textContent),
  chipOn: document.querySelector('#brbar .brchip.on')?.textContent,
  gridFirst: document.querySelector('#tile_lib_0 .lbl')?.textContent,
}));

// 6. chip tap -> Radio items; SHORT CH steps to Tracks (round 77 —
//    "In Music Library, ChUp and Dn move tiles. They should jump
//    sections": the category strip is the library's section jump,
//    on the SHORT press; hold-CH is the track skip here like every
//    music surface)
await p.evaluate(() => { window._sent.length = 0; });
await p.click('#brbar [data-brc="1"]');
await p.waitForTimeout(120);
await p.evaluate(() => {
  window._respond({ title: 'Radio', children: [
    { title: 'BBC 6 Music', media_class: 'channel', media_content_id: 'ra/1',
      media_content_type: 'station', can_expand: false, can_play: true },
  ] });
});
await p.waitForTimeout(150);
r.chipTap = await p.evaluate(() => ({
  gridFirst: document.querySelector('#tile_lib_0 .lbl')?.textContent,
  chipOn: document.querySelector('#brbar .brchip.on')?.textContent,
}));
await p.keyboard.press('PageDown');                  // short CH▼ -> next category
await p.waitForTimeout(120);
await p.evaluate(() => {
  window._respond({ title: 'Tracks', children: [
    { title: 'Take Five', media_class: 'track', media_content_id: 'tr/1',
      media_content_type: 'track', can_expand: false, can_play: true },
  ] });
});
await p.waitForTimeout(150);
r.chStep = await p.evaluate(() => ({
  chipOn: document.querySelector('#brbar .brchip.on')?.textContent,
  gridFirst: document.querySelector('#tile_lib_0 .lbl')?.textContent,
}));

// 6b. horizontal SWIPE on the grid steps categories (cached -> instant)
await p.evaluate(() => {
  const g = document.getElementById('grid');
  const r0 = g.getBoundingClientRect();
  const mk = (type, x) => g.dispatchEvent(new PointerEvent(type,
    { clientX: x, clientY: r0.top + 40, bubbles: true }));
  mk('pointerdown', 300); mk('pointerup', 140);      // swipe LEFT -> next (wraps)
});
await p.waitForTimeout(150);
r.swipe = await p.evaluate(() =>
  document.querySelector('#brbar .brchip.on')?.textContent);   // Playlists (wrap)

// 7. tap an item -> STANDARD play_media on the cast player, drawer pops
await p.evaluate(() => { window._sent.length = 0; });
await p.click('#tile_lib_0');
await p.waitForTimeout(150);
r.playFav = await p.evaluate(() => window._sent
  .filter(m => m.type === 'call_service')
  .map(m => m.domain + '.' + m.service + ':' + JSON.stringify(m.service_data)
    + '@' + ((m.target || {}).entity_id || '')));
r.playFavPops = await p.evaluate(() => S.screen);

// 8. re-enter: everything cached -> bands + grid render with NO new
//    requests; then a MIXED root (Music Library) hides the chips and
//    expandable items drill IN PLACE with an up tile
await p.evaluate(() => { window._sent.length = 0; });
await p.click('#tile_m_np .trail');
await p.waitForTimeout(200);
r.resume = await p.evaluate(() => ({
  newReqs: window._sent.filter(m => m.type === 'media_player/browse_media').length,
  barOn: document.getElementById('brbar').classList.contains('onbar'),
}));
await p.click('#brbar [data-brr="1"]');              // Music Library
await p.waitForTimeout(120);
await p.evaluate(() => {
  window._respond({ title: 'Music Library', children: [
    { title: 'Artist A', media_class: 'artist', media_content_id: 'ar/1',
      media_content_type: 'artist', can_expand: true, can_play: true },
    { title: 'Loose Track', media_class: 'track', media_content_id: 'tk/9',
      media_content_type: 'track', can_expand: false, can_play: true },
  ] });
});
await p.waitForTimeout(150);
r.mixedRoot = await p.evaluate(() => ({
  chipsGone: !document.querySelector('#brbar .brchip'),
  gridFirst: document.querySelector('#tile_lib_0 .lbl')?.textContent,
  trailingPlay: !!document.querySelector('#tile_lib_0 .trail'),
}));
await p.click('#tile_lib_0');                        // drill into Artist A
await p.waitForTimeout(120);
await p.evaluate(() => {
  window._respond({ title: 'Artist A', children: [
    { title: 'Album X', media_class: 'album', media_content_id: 'al/x',
      media_content_type: 'album', can_expand: true, can_play: true },
  ] });
});
await p.waitForTimeout(150);
r.subDrill = await p.evaluate(() => ({
  screen: S.screen,                                  // STILL the drawer
  up: document.querySelector('#tile_lib_up .lbl')?.textContent,
  first: document.querySelector('#tile_lib_0 .lbl')?.textContent,
}));

// 8c. FLAT TREE (v0.50.2 — Music Assistant shape): top level is ALL
//     directories whose children are items -> the top level becomes
//     the CHIPS, no roots row (bar holds just Pull)
await p.evaluate(() => {
  CONFIG.activities.music.context.media_player = 'media_player.ma_flat';
  S.states.set('media_player.ma_flat', { s: 'playing', a: {} });
  S.states.set('sensor.harmonium_music_playlists', { s: '0', a: { items: [] } });
  navigate('controller:music_library', true);
});
await p.waitForTimeout(150);
await p.evaluate(() => {
  window._respond({ title: 'Music Assistant', children: [
    { title: 'Artists', media_class: 'directory', media_content_id: 'artists',
      media_content_type: 'library', can_expand: true, can_play: false },
    { title: 'Albums', media_class: 'directory', media_content_id: 'albums',
      media_content_type: 'library', can_expand: true, can_play: false },
  ] });
});
await p.waitForTimeout(150);
await p.evaluate(() => {
  window._respond({ title: 'Artists', children: [
    { title: 'ABBA', media_class: 'artist', media_content_id: 'a/1',
      media_content_type: 'artist', can_expand: true, can_play: true },
  ] });
});
await p.waitForTimeout(200);
r.flatTree = await p.evaluate(() => ({
  rootsRowGone: !document.querySelector('#brbar [data-brr]'),
  barTilesGone: !document.querySelector('#brbar [data-brt]'),
  chips: [...document.querySelectorAll('#brbar .brchip')].map(e => e.textContent),
  chipOn: document.querySelector('#brbar .brchip.on')?.textContent,
  gridFirst: document.querySelector('#tile_lib_0 .lbl')?.textContent,
}));
await p.click('#brbar [data-brc="1"]');              // Albums chip = root select
await p.waitForTimeout(120);
await p.evaluate(() => {
  window._respond({ title: 'Albums', children: [
    { title: 'Arrival', media_class: 'album', media_content_id: 'al/1',
      media_content_type: 'album', can_expand: true, can_play: true },
  ] });
});
await p.waitForTimeout(150);
r.flatChip = await p.evaluate(() => ({
  chipOn: document.querySelector('#brbar .brchip.on')?.textContent,
  gridFirst: document.querySelector('#tile_lib_0 .lbl')?.textContent,
}));
// 8d. FAVORITES PROMOTION (v0.50.3): with the integration's MA
//     favorite sensors populated, the flat tree mirrors Sonos —
//     ⭐ Favorites (sensor-fed, DEFAULT) + Music Library (the tree)
await p.evaluate(() => {
  /* v0.72: a sticky real-category selection now maps into the lib
     side (position preserved) instead of being yanked to Favorites —
     the PROMOTION assertion below is about FRESH entry, so enter
     fresh */
  S.browse.root = S.browse.cat = null; S.browse.sub = [];
  S.states.set('sensor.harmonium_music_playlists', { s: '4', a: { items: [
    { name: 'talkSPORT', uri: 'library://radio/1', media_type: 'radio', image: 'r.jpg' },
    { name: 'Daily Mix 1', uri: 'library://playlist/22', media_type: 'playlist', image: 'p1.jpg' },
    { name: 'Discover Weekly', uri: 'library://playlist/14', media_type: 'playlist', image: 'p2.jpg' },
    { name: 'No Art Mix', uri: 'library://playlist/99', media_type: 'playlist', image: null },
  ] } });
  navigate('controller:music_library', true);
});
await p.waitForTimeout(200);
r.favPromo = await p.evaluate(() => ({
  roots: [...document.querySelectorAll('#brbar [data-brr] .brl')].map(e => e.textContent),
  rootOn: document.querySelector('#brbar [data-brr].on .brl')?.textContent,
  chips: [...document.querySelectorAll('#brbar .brchip')].map(e => e.textContent),
  gridFirst: document.querySelector('#tile_lib_0 .lbl')?.textContent,
  count: [...document.querySelectorAll('[id^="tile_lib_"]')].length,
}));
await p.evaluate(() => { window._sent.length = 0; });
await p.click('#tile_lib_1');                        // Daily Mix 1 -> plays
await p.waitForTimeout(150);
r.favPlay = await p.evaluate(() => window._sent
  .filter(m => m.type === 'call_service')
  .map(m => m.domain + '.' + m.service + ':' + JSON.stringify(m.service_data)
    + '@' + ((m.target || {}).entity_id || '')));
await p.click('#tile_m_np .trail');                  // re-enter (play popped it)
await p.waitForTimeout(200);
await p.click('#brbar [data-brr="1"]');              // Music Library root
await p.waitForTimeout(150);
r.favLib = await p.evaluate(() => ({
  rootOn: document.querySelector('#brbar [data-brr].on .brl')?.textContent,
  chips: [...document.querySelectorAll('#brbar .brchip')].map(e => e.textContent),
  gridFirst: document.querySelector('#tile_lib_0 .lbl')?.textContent,   // ABBA (cached)
}));

await p.evaluate(() => {                             // restore for later suites
  CONFIG.activities.music.context.media_player = 'media_player.ma_sonos_basement';
});

// 9. the drawer screen still subscribes cleanly (no sensor dependency)
r.subs = await p.evaluate(() => Array.isArray(entitiesFor('controller:music_library')));

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

// the music CONTROLLER (final doctrine, 2026-08-20): short CH =
// section jump / walk — still zero service calls — while HOLD-CH
// now SKIPS TRACKS ("Long Press in Next / Previous Track"), and the
// hamburger (menu) jumps to the Library via the gen-5 stock binding
await p.evaluate(() => { navigate('controller:music', true); window._sent.length = 0; });
await p.waitForTimeout(250);
await p.keyboard.press('PageUp');
await p.waitForTimeout(150);
r.ctrlChTrack = await p.evaluate(() => window._sent
  .filter(m => m.type === 'call_service').map(m => m.domain + '.' + m.service));
await p.keyboard.press("'");
await p.waitForTimeout(150);
r.ctrlChHold = await p.evaluate(() => window._sent
  .filter(m => m.type === 'call_service').map(m => m.domain + '.' + m.service));
await p.evaluate(() => act('menu', true));
await p.waitForTimeout(200);
r.menuLibrary = await p.evaluate(() => S.screen);
await p.evaluate(() => navigate('controller:music', true));
await p.waitForTimeout(150);

// 9b. THE QUEUE (v0.51): adapter probing — first adapter errors
//     (not an MA player), Sonos answers; rows render; tap = jump
await p.evaluate(() => {
  window._respondSvc = (ok, response) => {
    const req = window._sent.filter(m => m.type === 'call_service' && m.return_response).pop();
    const cb = S.pending.get(req.id);
    S.pending.delete(req.id);
    cb(ok ? { id: req.id, type: 'result', success: true,
      result: { response } } : { id: req.id, type: 'result', success: false,
      error: { message: 'unknown service' } });
    return req.domain + '.' + req.service;
  };
  navigate('controller:music', true);
});
await p.waitForTimeout(150);
await p.evaluate(() => { window._sent.length = 0; });
await p.click('#tile_m_cmd [data-mb="queue"]');
await p.waitForTimeout(150);
r.qOpen = await p.evaluate(() => ({
  screen: S.screen,
  loading: document.querySelector('#tile_q_ld .lbl')?.textContent,
  probe1: window._respondSvc(false),                 // MA adapter → error
}));
await p.waitForTimeout(150);
await p.evaluate(() => {
  window._respondSvc(true, { 'media_player.ma_sonos_basement': [
    { media_title: 'Take Five', media_artist: 'Dave Brubeck', media_album_name: 'Time Out' },
    { media_title: 'Blue Rondo', media_artist: 'Dave Brubeck', media_album_name: 'Time Out' },
  ] });
});
await p.waitForTimeout(200);
r.qRows = await p.evaluate(() => ({
  rows: [...document.querySelectorAll('#grid .tile .lbl')].map(e => e.textContent),
  nowOn: document.getElementById('tile_q_0')?.classList.contains('on'),
  nowMark: getComputedStyle(document.querySelector('#tile_q_0 .qnowic')).display !== 'none',
  otherMark: getComputedStyle(document.querySelector('#tile_q_1 .qnowic')).display === 'none',
  sub: document.querySelector('#tile_q_0 .sub')?.textContent,       // artist · album
  focusOnNow: S.focusId === 'q_0',
}));
await p.evaluate(() => { window._sent.length = 0; });
await p.click('#tile_q_1');
await p.waitForTimeout(150);
r.qJump = await p.evaluate(() => window._sent
  .filter(m => m.type === 'call_service' && !m.return_response)
  .map(m => m.domain + '.' + m.service + ':' + JSON.stringify(m.service_data)
    + '@' + ((m.target || {}).entity_id || '')));
// the ▶ mark is LIVE: the player's track change moves it, no rebuild
r.qLive = await p.evaluate(() => {
  const st2 = S.states.get('media_player.ma_sonos_basement');
  st2.a.media_title = 'Blue Rondo'; st2.a.media_artist = 'Dave Brubeck';
  S.states.set('media_player.ma_sonos_basement', st2);
  renderStates();
  return {
    movedOff: !document.getElementById('tile_q_0')?.classList.contains('on'),
    movedOn: document.getElementById('tile_q_1')?.classList.contains('on'),
  };
});

// 10. THEME TYPE HONORING (v0.52.1 — Suresh: "queue doesn't honor
//     the theme… title needs ellipsis… music fonts separately"):
//     queue rows + hero ride Primary/Secondary; font_scope: music
//     screens read the music faces; hubs stay on the global pair
r.qTheme = await p.evaluate(() => {
  applyTheme({ "font-1": "Georgia", "fw-1": "300",
    "font-m1": "Courier New", "font-m2": "Verdana" });
  const lbl = document.querySelector('#tile_q_0 .lbl');
  const cs = getComputedStyle(lbl);
  return {
    scoped: document.getElementById('app').classList.contains('scr-music'),
    lblFont: cs.fontFamily.includes('Courier'),
    lblWeight: cs.fontWeight,   // v0.53: rides fw-m1 → fw-1 EXACTLY (300)
    ellipsis: cs.whiteSpace === 'nowrap' && cs.textOverflow === 'ellipsis',
    subFont: getComputedStyle(document.querySelector('#tile_q_0 .sub'))
      .fontFamily.includes('Verdana'),
  };
});
await p.evaluate(() => navigate('controller:music', true));
await p.waitForTimeout(150);
r.heroTheme = await p.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('#tile_m_np .npt'));
  return {
    scoped: document.getElementById('app').classList.contains('scr-music'),
    nptFont: cs.fontFamily.includes('Courier'),
    nptWeight: cs.fontWeight,                      // rides fw-1 = 300
    npaFont: getComputedStyle(document.querySelector('#tile_m_np .npa'))
      .fontFamily.includes('Verdana'),
  };
});
r.hubTheme = await p.evaluate(() => {
  navigate(CONFIG.home_screen, true);
  const lbl = document.querySelector('#grid .tile .lbl');
  return {
    unscoped: !document.getElementById('app').classList.contains('scr-music'),
    lblFont: lbl ? getComputedStyle(lbl).fontFamily.includes('Georgia') : null,
  };
});

// 11. THE {seek} GRAMMAR + the hold-seek default (final doctrine,
//     2026-08-20: "Hold ◀/▶ = seek" — an ENGINE default on
//     music-shaped pages now, no bindings involved; gen 5 keeps the
//     old seek bindings struck. The relative-seek grammar is
//     asserted directly, position math and start-clamp included)
await p.evaluate(() => navigate('controller:music', true));
await p.waitForTimeout(150);
r.scrub = await p.evaluate(() => {
  const s = S.states.get('media_player.ma_sonos_basement');
  s.a.media_position = 100; s.a.media_duration = 200;
  s.a.media_position_updated_at = new Date().toISOString();
  S.states.set('media_player.ma_sonos_basement', s);
  window._sent.length = 0;
  runAction({ seek: -15, entity: '$context.media_player' });
  runAction({ seek: 15, entity: '$context.media_player' });
  const seeks = window._sent.filter(m => m.service === 'media_seek')
    .map(m => m.service_data.seek_position);
  return {
    rwd85: Math.abs(seeks[0] - 85) <= 1,        // 100 − 15
    ffwd115: Math.abs(seeks[1] - 115) <= 1,     // 100 + 15
    clamp0: (() => {                             // near track start → 0
      s.a.media_position = 4;
      s.a.media_position_updated_at = new Date().toISOString();
      S.states.set('media_player.ma_sonos_basement', s);
      window._sent.length = 0;
      runAction({ seek: -15, entity: '$context.media_player' });
      return window._sent[0].service_data.seek_position === 0;
    })(),
    holdsSeek: (() => {                          // engine default: holds SEEK
      s.a.media_position = 100;
      s.a.media_position_updated_at = new Date().toISOString();
      S.states.set('media_player.ma_sonos_basement', s);
      window._sent.length = 0;
      act('left_hold', true);
      act('right_hold', true);
      const ss = window._sent.filter(m => m.service === 'media_seek')
        .map(m => m.service_data.seek_position);
      return ss.length === 2 &&
        Math.abs(ss[0] - 85) <= 1 && Math.abs(ss[1] - 115) <= 1;
    })(),
    unboundNoop: (() => {                        // unbound name = silence
      window._sent.length = 0;
      act('made_up_button', true);
      return window._sent.length === 0;
    })(),
  };
});

r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
