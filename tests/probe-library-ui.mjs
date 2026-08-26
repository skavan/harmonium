/* THE LIBRARY REWORK (v0.85.7 — Suresh's polish round, four mocks):
     #9 layout — art-forward grid tiles (the art IS the tile, label
        under it, service-colored dot), LIST rows with a colored
        source bar, 48px thumb, bold 2-line title, "Spotify ·
        Playlist" sub line and a › door on drillable rows;
     #8 dpad — ▲ from the first item tile climbs into the bar (chips,
        then the roots row above), ◀▶ walk a row, OK presses, ▼ walks
        back down and lands on the first tile. */
import { chromium } from 'playwright-core';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const dir = (title, id) => ({ title, media_content_id: id,
  media_content_type: 'container', media_class: 'directory',
  can_expand: true, can_play: false });
const TREE = {
  '': { title: 'Root', children: [dir('My Stuff', 'A:')] },
  'A:': { title: 'My Stuff', children: [dir('Playlists', 'A:PL'), dir('Albums', 'A:AL')] },
  'A:PL': { title: 'Playlists', children: [
    { title: 'Coffee House Morning Mix', media_content_id: 'x-sonos-spotify:pl1',
      media_content_type: 'playlist', media_class: 'playlist',
      can_expand: true, can_play: true,
      thumbnail: 'http://localhost:8482/art/scdn.co/t1.png' },
    { title: 'Car Ride', media_content_id: 'x-sonos-http:pl2',
      media_content_type: 'playlist', media_class: 'playlist',
      can_expand: true, can_play: true,
      thumbnail: 'http://localhost:8482/art/dzcdn.net/t2.png' },
    /* v0.85.7: art that NEVER arrives — the tile must not squish */
    { title: 'Dead Art', media_content_id: 'x-sonos-http:pl3',
      media_content_type: 'playlist', media_class: 'playlist',
      can_expand: true, can_play: true,
      thumbnail: 'http://localhost:8482/deadart/x.png' },
  ] },
  'A:AL': { title: 'Albums', children: [
    { title: '21', media_content_id: 'x-rincon-cpcontainer:al1',
      media_content_type: 'album', media_class: 'album',
      can_expand: true, can_play: true },
  ] },
};
const CONFIG = {
  version: 2, home_screen: 'lib', screen_order: ['lib'],
  global: { room: 'X' },
  remotes: { default: { capabilities: ['touch', 'pointer'] } },
  screens: { lib: { name: 'Library',
    tiles: [{ id: 'br', type: 'browse', entity: 'media_player.mp',
      search: { engine: 'music_assistant', entity: 'media_player.mp' } }] } },
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 380, height: 640 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await ctx.route('**/art/**', r => r.fulfill({ body: PNG, contentType: 'image/png' }));
await ctx.route('**/deadart/**', r => r.abort());
await p.addInitScript((tree) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'media_player/browse_media') {
        const node = tree[msg.media_content_id || ''] || { title: 'x', children: [] };
        reply({ type: 'result', id: msg.id, success: true, result: node });
      } else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        reply({ type: 'event', id: msg.id, event: { a: {
          'media_player.mp': { s: 'idle', a: { friendly_name: 'MP' } } } } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
}, TREE);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(1400);
const ck = (n, c) => { if (!c) errs.push(n); };

/* ---- art-forward grid (mocks 1+2) ---- */
const art = await p.evaluate(() => {
  const t = document.querySelector('#grid .tile.brw:not(.row)');
  if (!t) return null;
  const img = t.querySelector('.top img');
  const dot = t.querySelector('.svcb');
  const ds = dot && getComputedStyle(dot);
  return { tileW: Math.round(t.getBoundingClientRect().width),
    imgW: img ? Math.round(img.getBoundingClientRect().width) : 0,
    hasSpotifyClass: t.className.indexOf('svc-spotify') >= 0 ||
      !!document.querySelector('#grid .tile.svc-spotify'),
    dotW: ds ? Math.round(parseFloat(ds.width)) : 0,
    dotRadius: ds ? ds.borderRadius : '',
    dotBg: ds ? ds.backgroundColor : '',
    srcbShown: [...t.parentNode.querySelectorAll('.srcb')]
      .some(x => getComputedStyle(x).display !== 'none') };
});
ck('art tile rendered', !!art);
/* the ART BOX: a tile whose art never arrives keeps its square */
const dead = await p.evaluate(() => {
  const t = [...document.querySelectorAll('#grid .tile.brw:not(.row)')]
    .find(x => x.textContent.indexOf('Dead Art') >= 0);
  if (!t) return null;
  const box = t.querySelector('.artbox');
  if (!box) return { noBox: true };
  const r = box.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
ck('dead-art tile keeps its square art box (' + JSON.stringify(dead) + ')',
  dead && !dead.noBox && dead.w > 50 && Math.abs(dead.w - dead.h) <= 2);
if (art) {
  ck('art fills the tile (' + art.imgW + '/' + art.tileW + ')', art.imgW >= art.tileW - 14);
  ck('service class present', art.hasSpotifyClass);
  ck('svc badge is a DOT (' + art.dotW + 'px, r=' + art.dotRadius + ')',
    art.dotW === 11 && art.dotRadius === '50%');
  ck('system text badge retired on art tiles', !art.srcbShown);
}

/* ---- bar focus (#8) ---- */
await p.keyboard.press('ArrowUp');
await p.waitForTimeout(200);
const bf1 = await p.evaluate(() => ({
  chip: document.querySelector('#brbar .brchip.brfocus') ? true : false,
  gridFocus: S.focusId }));
ck('▲ from the top tile entered the CHIPS row', bf1.chip && !bf1.gridFocus);
await p.keyboard.press('ArrowUp');
await p.waitForTimeout(200);
ck('▲ again climbed to the ROOTS row', await p.evaluate(() =>
  !!document.querySelector('#brbar .brroot.brfocus')));
await p.keyboard.press('ArrowDown');
await p.waitForTimeout(200);
await p.keyboard.press('ArrowRight');
await p.keyboard.press('ArrowRight');
await p.waitForTimeout(150);
const chipTxt = await p.evaluate(() =>
  (document.querySelector('#brbar .brchip.brfocus') || {}).textContent || '');
ck('◀▶ walk the chip row (on "' + chipTxt + '")', chipTxt === 'Playlists');
await p.keyboard.press('Enter');
await p.waitForTimeout(400);
const sel = await p.evaluate(() => ({
  on: (document.querySelector('#brbar .brchip.on') || {}).textContent || '',
  ringAlive: !!document.querySelector('#brbar .brfocus') }));
ck('OK selected the chip (' + sel.on + ')', sel.on === 'Playlists');
ck('the ring survived the re-render', sel.ringAlive);
await p.keyboard.press('ArrowDown');
await p.waitForTimeout(250);
ck('▼ off the bar lands on the first item tile', await p.evaluate(() =>
  S.focusId === 'br_0' && !document.querySelector('#brbar .brfocus')));

/* ---- list rows (mock 3) ---- */
await p.evaluate(() => document.querySelector('[data-brv]').click());
await p.waitForTimeout(500);
const list = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('#grid .tile.brw.row')];
  const coffee = rows.find(x => x.textContent.indexOf('Coffee House') >= 0);
  if (!coffee) return { rows: rows.length };
  const cs = getComputedStyle(coffee, '::before');
  const ca = getComputedStyle(coffee, '::after');
  const sub = coffee.querySelector('.sub');
  const iw = coffee.querySelector('.icwrap');
  return { rows: rows.length,
    sub: sub ? sub.textContent : '',
    subShown: sub ? getComputedStyle(sub).display !== 'none' : false,
    barW: Math.round(parseFloat(cs.width)),
    barBg: cs.backgroundColor,
    drill: coffee.className.indexOf('drill') >= 0,
    chevron: ca.content,
    /* round 2: compact rows + square thumbs */
    rowH: Math.round(coffee.getBoundingClientRect().height),
    thumbRadius: iw ? getComputedStyle(iw).borderRadius : '' };
});
ck('list rows rendered (' + list.rows + ')', list.rows === 3);
ck('sub line says the words ("' + list.sub + '")', list.sub === 'Spotify · Playlist' && list.subShown);
ck('source bar drawn (' + list.barW + 'px ' + list.barBg + ')',
  list.barW === 4 && list.barBg === 'rgb(29, 185, 84)');
ck('drillable row wears the › door (' + list.chevron + ')',
  list.drill && String(list.chevron).indexOf('›') >= 0);
ck('rows are COMPACT (' + list.rowH + 'px — "only fitting 4" fixed)',
  list.rowH > 0 && list.rowH <= 78);
ck('row thumb is SQUARE-ish, not a circle (' + list.thumbRadius + ')',
  list.thumbRadius === '10px');

/* ---- round 2: unclippable bar ring + bigger art labels ---- */
await p.keyboard.press('ArrowUp');             /* into the bar */
await p.waitForTimeout(250);
const ring = await p.evaluate(() => {
  const el = document.querySelector('#brbar .brfocus');
  return el ? getComputedStyle(el).boxShadow : '';
});
ck('bar focus ring is INSET (unclippable): ' + ring, ring.indexOf('inset') >= 0);
await p.keyboard.press('ArrowDown');           /* back to the grid */
await p.waitForTimeout(250);
await p.evaluate(() => document.querySelector('[data-brv]').click());  /* list → grid2 */
await p.waitForTimeout(500);
const g2fs = await p.evaluate(() => {
  const t = document.querySelector('#grid .tile.brw:not(.row) .top .lbl');
  return t ? getComputedStyle(t).fontSize : '';
});
ck('art-tile label bumped (' + g2fs + ')', parseFloat(g2fs) >= 17);

console.log(JSON.stringify({ art, bf1, chipTxt, sel, list, ring, g2fs,
  ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
