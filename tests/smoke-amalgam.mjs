/* THE AMALGAM (v0.72) — Suresh: "I would expect Favorites and Music
   Library return the amalgam of Sonos and MA."

   · the library ALWAYS lands on the ★/♫ pair when any favourites
     source exists (no more flapping between real and synthetic roots)
   · ★ Favorites merges the tree's favourites root (Sonos FV:) with
     the MA sensors; chips are the category UNION; duplicates collapse
     by name and the best ROUTE for the cast player wins
   · ♫ Music Library is the tree minus its favourites mirror, auto-
     descended when one root remains
   · under an MA cast player the sensors' copies win instead — same
     rule, opposite outcome, no setting anywhere */
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
  /* MA sensor favourites: one name COLLIDES with a Sonos favourite;
     one wears Deezer artwork (v0.73.1: the CDN names the service) */
  S.states.set('sensor.harmonium_music_playlists', { s: '3', a: { items: [
    { name: 'Discover Weekly', uri: 'library://playlist/41',
      media_type: 'playlist' },
    { name: 'Daily Mix 1', uri: 'library://playlist/49',
      media_type: 'playlist' },
    { name: 'Car Ride', uri: 'library://playlist/61', media_type: 'playlist',
      image: 'https://cdn-images.dzcdn.net/images/cover/x/500x500.jpg' },
  ] } });
  /* the NATIVE tree: a Sonos-shaped root pair + its slices */
  const dir = (title, id, type) => ({ title, media_content_id: id,
    media_content_type: type, media_class: 'directory',
    can_expand: true, can_play: false, children: [] });
  const play = (title, id) => ({ title, media_content_id: id,
    media_content_type: 'playlist', media_class: 'playlist',
    can_play: true, can_expand: false, children: [] });
  const N = S.browse.nodes;
  N[browseKey('media_player.native_spk', null)] = { title: 'root',
    children: [dir('Favorites', 'FV:2', 'favorites'),
               dir('Music Library', 'A:', 'library')] };
  N[browseKey('media_player.native_spk',
    { id: 'FV:2', type: 'favorites' })] = { title: 'Favorites',
    children: [dir('Playlists', 'FV:2/pl', 'container'),
               dir('Radio', 'R:0', 'container'),
               /* HA groups Sonos favourites under RAW type ids —
                  the chip must read "Artists", not "ALBUM_ARTISTS" */
               dir('album_artists', 'FV:2/aa', 'container')] };
  N[browseKey('media_player.native_spk',
    { id: 'FV:2/aa', type: 'container' })] = { title: 'album_artists',
    children: [play('ABBA (fav)', 'FV:2/31')] };
  N[browseKey('media_player.native_spk',
    { id: 'FV:2/pl', type: 'container' })] = { title: 'Playlists',
    children: [play('Discover Weekly', 'FV:2/13'),
               play('world cup', 'FV:2/7')] };
  N[browseKey('media_player.native_spk',
    { id: 'A:', type: 'library' })] = { title: 'Music Library',
    children: [dir('Artists', 'A:ARTIST', 'container'),
               dir('Albums', 'A:ALBUM', 'container')] };
  N[browseKey('media_player.native_spk',
    { id: 'A:ARTIST', type: 'container' })] = { title: 'Artists',
    children: [play('ABBA', 'A:ARTIST/ABBA')] };
});
const snap = () => p.evaluate(() => ({
  roots: Array.from(document.querySelectorAll('#brbar .brroot .brl'))
    .map(x => x.textContent),
  chips: Array.from(document.querySelectorAll('#brbar .brchip'))
    .filter(x => !x.classList.contains('brchipv'))
    .map(x => x.textContent),
  tiles: Array.from(document.querySelectorAll('#grid .tile.brw')).map(el => ({
    label: (el.querySelector('.lbl') || {}).textContent,
    mark: !!el.querySelector('.mrk'),
    src: (el.querySelector('.srcb') || {}).textContent || null,
    svc: (el.querySelector('.svcb') || {}).textContent || null,
  })),
}));

// 1. LANDING: the ★/♫ pair, playlist UNION, dedup by best route —
//    ONE Discover Weekly (the Sonos copy: native, unmarked) plus the
//    MA-only Daily Mix 1 (marked + badged)
await p.evaluate(() => {
  S.browse.root = null; S.browse.cat = null; S.browse.sub = [];
  navigate('controller:t_lib', true);
});
r.landing = await snap();
r.dedup = {
  discovers: r.landing.tiles.filter(t => /Discover/.test(t.label)),
  daily: r.landing.tiles.find(t => /Daily/.test(t.label)),
  worldcup: r.landing.tiles.find(t => /world cup/.test(t.label)),
};
/* v0.73.1: pretty chip for a raw favourites folder; Deezer named
   from artwork on an otherwise-anonymous library:// item */
r.pretty = {
  artistsChip: r.landing.chips.includes('Artists'),
  rawChipGone: !r.landing.chips.some(c => /_/.test(c)),
  deezer: (r.landing.tiles.find(t => /Car Ride/.test(t.label)) || {}).svc,
};

// 2. the deduped winner PLAYS NATIVE, one tap, on the cast player
await p.evaluate(() => { window._sent = []; });
const dw = await p.evaluate(() => Array.from(
  document.querySelectorAll('#grid .tile.brw')).find(el =>
    /Discover/.test(el.textContent)).id);
await p.click('#' + dw);
r.dedupPlay = await p.evaluate(() => {
  const m = window._sent.filter(x => x.type === 'call_service').pop();
  return m && { target: m.target.entity_id,
    id: m.service_data.media_content_id };
});

// 3. ♫ Music Library: no Favorites mirror — auto-descends to the
//    library's own categories
await p.evaluate(() => {
  const roots = document.querySelectorAll('#brbar [data-brr]');
  roots[roots.length - 1].click();
});
r.library = await snap();

// 4. MA CAST PLAYER: same amalgam, opposite dedup — the MA copy wins
//    (native there), Sonos copies survive as fallback candidates only
//    when they lose... and the whole grid needs no marks for MA items
await p.evaluate(() => {
  CONFIG.controllers.t_lib.context.media_player = 'media_player.ma_spk';
  /* MA's own tree: flat categories, no favourites root */
  S.browse.nodes[browseKey('media_player.ma_spk', null)] = { title: 'root',
    children: [
      { title: 'Artists', media_content_id: 'library://artists',
        media_content_type: 'container', media_class: 'directory',
        can_expand: true, can_play: false, children: [] },
      { title: 'Playlists', media_content_id: 'library://playlists',
        media_content_type: 'container', media_class: 'directory',
        can_expand: true, can_play: false, children: [] },
    ] };
  S.browse.root = null; S.browse.cat = null;
  navigate('controller:t_lib', true);
});
r.maCast = await snap();
await p.evaluate(() => { window._sent = []; });
const dw2 = await p.evaluate(() => Array.from(
  document.querySelectorAll('#grid .tile.brw')).find(el =>
    /Discover/.test(el.textContent)).id);
await p.click('#' + dw2);
r.maCastPlay = await p.evaluate(() => {
  const m = window._sent.filter(x => x.type === 'call_service').pop();
  return m && { target: m.target.entity_id,
    id: m.service_data.media_content_id };
});

console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close();
process.exit(errs.length ? 1 : 0);
