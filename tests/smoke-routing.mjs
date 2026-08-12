/* ROUTING (v0.70) — THE CAST PLAYER DECIDES (design-library-ui.md §5).
   Every playable id is classified by how it reaches the CAST player:
   native / bridged / fallback / none. native+bridged play normally;
   fallback is MARKED and its play is a two-press confirm — the silent
   MA hand-off that evicted the Sonos queue is dead; none is never
   offered.

   Self-contained: fake socket, own controller, results injected as
   S.browse.qres — the same shapes music_assistant.search returns
   (design-search-sources.md §2c). */
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const r = {}; const errs = [];
const p = await (await b.newContext({ viewport: { width: 480, height: 800 } })).newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(700);

await p.evaluate(() => {
  document.getElementById('auth').classList.add('hidden');
  window._sent = [];
  S.connected = true;
  S.ws = { send: m => window._sent.push(JSON.parse(m)) };
  window._answer = (type, result) => {
    const msg = window._sent.filter(m => m.type === type).pop();
    if (!msg) return false;
    const cb = S.pending.get(msg.id);
    if (!cb) return false;
    S.pending.delete(msg.id);
    cb({ success: true, result });
    return true;
  };
  CONFIG.controllers.t_lib = {
    name: 'Test Library', class: 'group', drawer: true,
    grid: { columns: 3 },
    context: { media_player: 'media_player.native_spk',
               search: 'media_player.ma_spk' },
    sections: [{ tiles: [{ id: 'lib', type: 'browse' }] }],
  };
  S.states.set('media_player.native_spk',
    { s: 'idle', a: { friendly_name: 'Basement' } });
  S.states.set('media_player.ma_spk', { s: 'idle', a: {} });
});

/* drive a search-mode render with four result shapes: a bridged album,
   a fallback library track, an artist (expandable; its PLAY is the
   fallback), a native-id track that happens to share-link anyway is
   NOT possible from MA — and one none-routed item from a source that
   declared it (`_route`, the phase-3 seam) */
const paint = () => p.evaluate(() => {
  const B = S.browse;
  B.qon = true; B.q = 'love'; B.qcat = ''; B.sub = [];
  B.qres = { q: 'love', items: [
    { title: 'ABBA - Gold', media_class: 'album', media_content_type: 'music',
      media_content_id: 'spotify--AbCd://album/4Xy9zQ', can_play: true,
      can_expand: true, children: [] },
    { title: 'Mamma Mia (rip)', media_class: 'track', media_content_type: 'music',
      media_content_id: 'library://track/16202', can_play: true,
      can_expand: false, children: [] },
    { title: 'ABBA', media_class: 'artist', media_content_type: 'music',
      media_content_id: 'spotify--AbCd://artist/0LcJLq', can_play: true,
      can_expand: true, children: [] },
    { title: 'Ghost (unroutable)', media_class: 'track', media_content_type: 'music',
      media_content_id: 'sq://saved-queue/3', _route: 'none', can_play: true,
      can_expand: false, children: [] },
  ], capped: [] };
  navigate('controller:t_lib', true);
  return Array.from(document.querySelectorAll('#grid .tile')).map(el => ({
    id: el.id,
    label: (el.querySelector('.lbl') || {}).textContent || '',
    mark: !!el.querySelector('.mrk'),
    trail: !!el.querySelector('.trail'),
    src: (el.querySelector('.srcb') || {}).textContent || null,
    svc: (el.querySelector('.svcb') || {}).textContent || null,
  }));
});

// 1. THE GRID: none suppressed, fallback marked, bridged unmarked
r.tiles = await paint();
r.noneSuppressed = !r.tiles.some(t => /Ghost/.test(t.label));
r.fallbackMarked = r.tiles.filter(t => t.mark).map(t => t.label);
r.bridgedClean = r.tiles.some(t => /Gold/.test(t.label) && !t.mark);

// 2. BRIDGED plays the CAST player with the rewritten share link — one tap
await p.evaluate(() => { window._sent = []; });
await p.click('#tile_lib_0 .trail');       /* album: body drills, ▶ plays */
r.bridged = await p.evaluate(() => {
  const m = window._sent.filter(x => x.type === 'call_service').pop();
  return m && { target: m.target.entity_id,
    id: m.service_data.media_content_id };
});

// 3. FALLBACK: first tap fires NOTHING — the bar warns AND the tapped
//    tile itself pulses (v0.70.1: the cue must be under the finger,
//    not on whatever tile happens to be first in the grid)
await p.evaluate(() => { window._sent = []; });
await p.click('#tile_lib_1');
r.fbFirstTap = await p.evaluate(() => ({
  fired: window._sent.filter(x => x.type === 'call_service').length,
  bar: document.getElementById('screenName').textContent,
  toned: document.getElementById('screenName').classList.contains('cfm-off'),
  tilePulsed: document.getElementById('tile_lib_1').classList.contains('cfm-off'),
}));

// 4. …the second tap within the window plays, on the ENGINE's player
await p.click('#tile_lib_1');
r.fbSecondTap = await p.evaluate(() => {
  const m = window._sent.filter(x => x.type === 'call_service').pop();
  return m && { target: m.target.entity_id,
    id: m.service_data.media_content_id };
});

// 5. the drawer must NOT pop while a confirm is pending — the second
//    press needs the tile still there (t_lib is drawer: true)
r.stayedPut = await p.evaluate(() => S.screen === 'controller:t_lib');

// 6. CAST PLAYER *IS* THE ENGINE (ma twin cast directly): everything
//    is native — no marks, no confirm, plays immediately
await p.evaluate(() => {
  CONFIG.controllers.t_lib.context.media_player = 'media_player.ma_spk';
});
const tiles2 = await paint();
r.nativeNoMarks = !tiles2.some(t => t.mark);
await p.evaluate(() => { window._sent = []; });
await p.click('#tile_lib_1');
r.nativeOneTap = await p.evaluate(() => {
  const m = window._sent.filter(x => x.type === 'call_service').pop();
  return m && { target: m.target.entity_id,
    id: m.service_data.media_content_id };
});

// 7. THE UP ROW SPLITS (v0.70.1): drilling into a playable container
//    renders ‹ Back at HALF width beside an equal Play tile that
//    plays the container itself — routed like anything else, so the
//    bridged album one-taps on the CAST player with the rewritten id
await p.evaluate(() => {
  CONFIG.controllers.t_lib.context.media_player = 'media_player.native_spk';
});
await paint();
await p.click('#tile_lib_0');              /* album body: drill in */
await p.waitForTimeout(100);
await p.evaluate(() => window._answer('media_player/browse_media', {
  title: 'ABBA - Gold', children: [
    { title: 'Dancing Queen', media_class: 'track', media_content_type: 'music',
      media_content_id: 'spotify--AbCd://track/T1', can_play: true,
      can_expand: false, children: [] },
  ] }));
await p.waitForTimeout(150);
r.upRow = await p.evaluate(() => {
  const up = document.getElementById('tile_lib_up');
  const pl = document.getElementById('tile_lib_pl');
  return { up: !!up, upHalf: up && !up.classList.contains('span2'),
    play: !!pl, playHalf: pl && !pl.classList.contains('span2') };
});
await p.evaluate(() => { window._sent = []; });
await p.click('#tile_lib_pl');
r.playContainer = await p.evaluate(() => {
  const m = window._sent.filter(x => x.type === 'call_service').pop();
  return m && { target: m.target.entity_id,
    id: m.service_data.media_content_id };
});

// 8. FAVOURITES ARE ROUTED TOO (v0.71.2 — the "Daily Mix 1" bug):
//    sensor-fed favourite tiles carry MA ids; under a NATIVE cast
//    player they must be marked, source-badged, and two-press
//    confirmed onto the engine's player — never thrown at the Sonos
await p.evaluate(() => {
  const B = S.browse;
  B.qon = false; B.q = ''; B.qres = null; B.sub = [];
  B.root = { id: '__fav', type: '__synth', title: 'Favorites' };
  B.cat = null;
  CONFIG.controllers.t_lib.context.media_player = 'media_player.native_spk';
  S.states.set('sensor.harmonium_music_playlists', { s: '1', a: { items: [
    { name: 'Daily Mix 1', uri: 'library://playlist/49',
      media_type: 'playlist' },
  ] } });
  S.browse.nodes[browseKey('media_player.native_spk', null)] = {
    title: 'root', children: [
      { title: 'Favorites', media_content_id: '', media_content_type: 'f',
        media_class: 'directory', can_expand: true, can_play: false },
      { title: 'Music Library', media_content_id: '', media_content_type: 'l',
        media_class: 'directory', can_expand: true, can_play: false },
    ] };
  navigate('controller:t_lib', true);
});
r.favTile = await p.evaluate(() => {
  const el = document.querySelector('#grid .tile.brw');
  return el && {
    label: (el.querySelector('.lbl') || {}).textContent,
    mark: !!el.querySelector('.mrk'),
    src: (el.querySelector('.srcb') || {}).textContent || null,
    svc: (el.querySelector('.svcb') || {}).textContent || null,
  };
});
await p.evaluate(() => { window._sent = []; });
const favEl = await p.evaluate(() =>
  document.querySelector('#grid .tile.brw').id);
await p.click('#' + favEl);
r.favFirstTap = await p.evaluate(() => ({
  fired: window._sent.filter(x => x.type === 'call_service').length,
  toned: document.getElementById(
    document.querySelector('#grid .tile.brw').id).classList.contains('cfm-off'),
}));
await p.click('#' + favEl);
r.favSecondTap = await p.evaluate(() => {
  const m = window._sent.filter(x => x.type === 'call_service').pop();
  return m && { target: m.target.entity_id,
    id: m.service_data.media_content_id };
});

console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close();
process.exit(errs.length ? 1 : 0);
