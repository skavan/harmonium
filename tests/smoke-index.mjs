/* THE SONOS INDEX (v0.73 — phase 3, engine-side per the
   design-library-ui.md §1 correction): crawl via the browse contract,
   localStorage cache with built_at, FORGIVING local matching
   ("mama mia" finds Mamma Mia), instant merge into search with the
   index copy beating same-name engine results, survival through an
   engine outage, and a visible tap-to-refresh age row. */
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
  window._answer = (type, result, filt) => {
    const list = window._sent.filter(m => m.type === type &&
      (!filt || JSON.stringify(m).indexOf(filt) >= 0));
    const msg = list.pop();
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
    sections: [{ tiles: [{ id: 'lib', type: 'browse',
      search: { engine: 'music_assistant', entity: 'media_player.ma_spk',
        config_entry: 'ENTRY1' } }] }],
  };
  S.states.set('media_player.native_spk',
    { s: 'idle', a: { friendly_name: 'Basement' } });
  S.states.set('media_player.ma_spk', { s: 'idle', a: {} });
  localStorage.removeItem('hakr_sidx_media_player.native_spk');
});

// ---- 1. THE CRAWL: opening a Sonos-shaped tree with no index kicks
//         it off; eight-ish requests later localStorage has the goods
await p.evaluate(() => {
  const dir = (title, id, type) => ({ title, media_content_id: id,
    media_content_type: type, media_class: 'directory',
    can_expand: true, can_play: false, children: [] });
  S.browse.nodes[browseKey('media_player.native_spk', null)] = {
    title: 'root', children: [dir('Favorites', 'FV:2', 'favorites'),
      dir('Music Library', 'A:', 'library')] };
  S.browse.nodes[browseKey('media_player.native_spk',
    { id: 'FV:2', type: 'favorites' })] = { title: 'Favorites',
    children: [dir('Playlists', 'FV:2/pl', 'container')] };
  S.browse.nodes[browseKey('media_player.native_spk',
    { id: 'FV:2/pl', type: 'container' })] = { title: 'Playlists',
    children: [] };
  navigate('controller:t_lib', true);
});
await p.waitForTimeout(150);
r.crawlKicked = await p.evaluate(() =>
  window._sent.filter(m => m.type === 'media_player/browse_media' &&
    m.entity_id === 'media_player.native_spk').length > 0);
// drive the crawl: root → FV: + A: roots → categories
const dirC = (title, id, type) => ({ title, media_content_id: id,
  media_content_type: type, media_class: 'directory',
  can_expand: true, can_play: false });
await p.evaluate(([d]) => window._answer('media_player/browse_media', {
  title: 'root', children: [
    { ...d, title: 'Favorites', media_content_id: 'FV:2', media_content_type: 'favorites' },
    { ...d, title: 'Music Library', media_content_id: 'A:', media_content_type: 'library' },
  ] }), [dirC('x', 'x', 'x')]);
await p.waitForTimeout(80);
await p.evaluate(([d]) => window._answer('media_player/browse_media', {
  title: 'Favorites', children: [
    { ...d, title: 'Playlists', media_content_id: 'FV:2/pl', media_content_type: 'container' },
  ] }, '"FV:2"'), [dirC('x', 'x', 'x')]);
await p.waitForTimeout(80);
await p.evaluate(([d]) => window._answer('media_player/browse_media', {
  title: 'Music Library', children: [
    { ...d, title: 'Albums', media_content_id: 'A:ALBUM', media_content_type: 'container' },
    { ...d, title: 'Tracks', media_content_id: 'A:TRACKS', media_content_type: 'container' },
  ] }, '"A:"'), [dirC('x', 'x', 'x')]);
await p.waitForTimeout(80);
await p.evaluate(() => window._answer('media_player/browse_media', {
  title: 'Playlists', children: [
    { title: 'world cup', media_content_id: 'SQ:3', media_content_type: 'playlist',
      media_class: 'playlist', can_play: true, can_expand: false },
    { title: 'Mamma Mia Party', media_content_id: 'FV:2/9', media_content_type: 'playlist',
      media_class: 'playlist', can_play: true, can_expand: false },
    { title: 'Discover Weekly', media_content_id: 'FV:2/24', media_content_type: 'playlist',
      media_class: 'playlist', can_play: true, can_expand: false },
  ] }, 'FV:2/pl'));
await p.waitForTimeout(80);
await p.evaluate(() => window._answer('media_player/browse_media', {
  title: 'Albums', children: [
    { title: 'Arrival', media_content_id: 'x-file-cifs://n/arrival', media_content_type: 'album',
      media_class: 'album', can_play: true, can_expand: true },
  ] }, 'A:ALBUM'));
await p.waitForTimeout(250);
r.stored = await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('hakr_sidx_media_player.native_spk') || 'null');
  return d && { built: !!d.built_at, cats: Object.keys(d.cats),
    favCount: (d.cats['fav:playlists'] || []).length,
    crawledTracks: 'lib:tracks' in d.cats };
});

// ---- 2. SEARCH: index answers INSTANTLY (engine still pending),
//         typo-forgiving, and only the FAV wells with an MA engine
await p.evaluate(() => {
  const B = S.browse;
  B.qon = true; B.q = 'mama mia'; B.qcat = ''; B.sub = []; B.qres = null;
  window._sent = [];
  brSearchRun('mama mia');
});
await p.waitForTimeout(100);
r.instant = await p.evaluate(() => ({
  tiles: Array.from(document.querySelectorAll('#grid .tile.brw'))
    .map(el => ({ label: (el.querySelector('.lbl') || {}).textContent,
      src: (el.querySelector('.srcb') || {}).textContent || null,
    svc: (el.querySelector('.svcb') || {}).textContent || null,
      mark: !!el.querySelector('.mrk') })),
  engineAsked: window._sent.filter(m => m.type === 'call_service').length > 0,
}));

// ---- 3. same-name ENGINE result dedups away; the index copy stays
await p.evaluate(() => {
  const B = S.browse;
  B.q = 'discover'; window._sent = [];   /* only THIS query's waves */
  brSearchRun('discover');
});
await p.waitForTimeout(80);
await p.evaluate(() => {
  /* answer ONE MA wave with a colliding playlist name */
  const list = window._sent.filter(m => m.type === 'call_service' &&
    JSON.stringify(m).indexOf('playlist') >= 0);
  const msg = list[0];
  const cb = S.pending.get(msg.id);
  S.pending.delete(msg.id);
  cb({ success: true, result: { response: { playlists: [
    { name: 'Discover Weekly', uri: 'library://playlist/41' },
    { name: 'Discovered Gems', uri: 'library://playlist/77' },
  ] } } });
});
await p.waitForTimeout(200);
r.dedup = await p.evaluate(() =>
  Array.from(document.querySelectorAll('#grid .tile.brw'))
    .map(el => ({ label: (el.querySelector('.lbl') || {}).textContent,
      src: (el.querySelector('.srcb') || {}).textContent || null }))
    .filter(t => /Discover/.test(t.label)));

// ---- 4. the index hit plays NATIVE on the cast player, one tap
await p.evaluate(() => { window._sent = []; });
const dwTile = await p.evaluate(() => Array.from(
  document.querySelectorAll('#grid .tile.brw')).find(el =>
    /Discover Weekly/.test(el.textContent)).id);
await p.click('#' + dwTile);
r.idxPlay = await p.evaluate(() => {
  const m = window._sent.filter(x => x.type === 'call_service').pop();
  return m && { target: m.target.entity_id,
    id: m.service_data.media_content_id };
});

// ---- 5. ENGINE OUTAGE: every wave fails, the index still answers,
//         no error tile over live results
await p.evaluate(() => {
  const B = S.browse;
  B.q = 'world cup'; window._sent = [];
  brSearchRun('world cup');
});
await p.waitForTimeout(80);
await p.evaluate(() => {
  window._sent.filter(m => m.type === 'call_service').forEach(m => {
    const cb = S.pending.get(m.id);
    if (cb) { S.pending.delete(m.id); cb({ success: false,
      error: { message: 'No playable item found to start playback' } }); }
  });
});
await p.waitForTimeout(200);
r.outage = await p.evaluate(() => ({
  tiles: Array.from(document.querySelectorAll('#grid .tile.brw'))
    .map(el => (el.querySelector('.lbl') || {}).textContent),
  errTile: !!document.getElementById('tile_lib_qe'),
}));

// ---- 6. the AGE row: present, honest, and tapping re-crawls
r.ageRow = await p.evaluate(() => {
  const el = document.getElementById('tile_lib_idx');
  return el && (el.querySelector('.lbl') || {}).textContent;
});
await p.evaluate(() => { window._sent = []; });
await p.click('#tile_lib_idx');
await p.waitForTimeout(100);
r.refreshKicked = await p.evaluate(() =>
  window._sent.filter(m => m.type === 'media_player/browse_media').length > 0);

// ---- 7. THE ONE-TAP FULL REFRESH (v0.74.1): the band-1 ↻ empties
//         the tree cache, re-crawls the index, and pokes the MA
//         favourites sensors — one control, three caches
await p.evaluate(() => {
  const B = S.browse;
  B.qon = false; B.q = ''; B.qres = null;
  navigate('controller:t_lib', true);
});
r.refreshBtn = await p.evaluate(() =>
  !!document.querySelector('#brbar .brrootr'));
await p.evaluate(() => { window._sent = []; });
await p.click('#brbar .brrootr');
await p.waitForTimeout(150);
r.fullRefresh = await p.evaluate(() => ({
  treeDropped: Object.keys(S.browse.nodes).length <= 2,  /* refetch begun */
  treeRefetch: window._sent.some(m => m.type === 'media_player/browse_media'),
  favPoke: window._sent.some(m => m.type === 'call_service' &&
    m.domain === 'homeassistant' && m.service === 'update_entity'),
  bar: document.getElementById('screenName').textContent,
}));

console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close();
process.exit(errs.length ? 1 : 0);
