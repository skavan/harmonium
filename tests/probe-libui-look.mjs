/* repro shoot: the music-library list view, to see the row styling
   Suresh flagged (statusreview item 4) — big centered wrapping titles. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const SYMS = readFileSync(
  '/root/work/harmonium/tests/node_modules/material-symbols/material-symbols-outlined.woff2');
const FONT_CSS = `@font-face{font-family:'Material Symbols Outlined';
font-style:normal;font-weight:400;src:url(/local-syms.woff2) format('woff2')}
.material-symbols-outlined{font-family:'Material Symbols Outlined';
font-weight:normal;font-style:normal;line-height:1;letter-spacing:normal;
text-transform:none;display:inline-block;white-space:nowrap;
word-wrap:normal;direction:ltr;font-feature-settings:'liga';
-webkit-font-smoothing:antialiased}`;
const ART = readFileSync('/home/claude/shots/album.jpg');

const ITEMS = [
  { name: 'Alternative Rock Mix', media_type: 'playlist',
    uri: 'spotify://playlist/1', image: '/art/a.jpg' },
  { name: 'Car Ride', media_type: 'playlist',
    uri: 'deezer://playlist/2', image: '/art/b.jpg' },
  { name: 'Coffee House Morning Mix', media_type: 'playlist',
    uri: 'spotify://playlist/3', image: '/art/c.jpg' },
  { name: 'An Extremely Long Playlist Name That Truly Never Ends At All',
    media_type: 'playlist', uri: 'spotify://playlist/4', image: '/art/d.jpg' },
];
const STATES = {
  'media_player.ma_sonos_basement': { s: 'playing', a: {
    friendly_name: 'Porch Sonos', media_title: 'Golden Hour',
    supported_features: 84351 } },
  'select.harmonium_porch_activity': { s: 'music', a: { options: [] } },
  'sensor.harmonium_music_playlists': { s: String(ITEMS.length), a: { items: ITEMS } },
  'sensor.harmonium_music_artists': { s: '0', a: { items: [] } },
  'sensor.harmonium_music_albums': { s: '0', a: { items: [] } },
  'sensor.harmonium_music_tracks': { s: '0', a: { items: [] } },
  'sensor.harmonium_music_radio': { s: '0', a: { items: [] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
await ctx.route('**fonts.googleapis.com/css2*', r =>
  r.fulfill({ body: FONT_CSS, contentType: 'text/css' }));
await ctx.route('**/local-syms.woff2', r =>
  r.fulfill({ body: SYMS, contentType: 'font/woff2',
    headers: { 'Access-Control-Allow-Origin': '*' } }));
await ctx.route('**/art/*.jpg', r =>
  r.fulfill({ body: ART, contentType: 'image/jpeg' }));
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await p.addInitScript((STATES) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  localStorage.setItem('hakr_views_default',
    JSON.stringify({ playlists: 'list' }));
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({
      data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() =>
        this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        const a = {};
        (msg.entity_ids || []).forEach(e => { if (STATES[e]) a[e] = STATES[e]; });
        reply({ type: 'event', id: msg.id, event: { a } });
      }
      else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() =>
  document.fonts.load("400 24px 'Material Symbols Outlined'"));
await p.evaluate(() => navigate('controller:music_library'));
await p.waitForTimeout(600);
/* into ★ Favorites → Playlists (amalgam), where the sensor items live */
await p.evaluate(() => {
  const chip = [...document.querySelectorAll('.brchip, .brk, button')]
    .find(x => /playlist/i.test(x.textContent || ''));
  chip?.click();
});
await p.waitForTimeout(700);
/* cycle: list (stored) → shot; then toggle to grid2 → shot */
const rows = await p.evaluate(() => {
  const els = [...document.querySelectorAll('.tile')].slice(0, 6);
  return els.map(el => {
    const lbl = el.querySelector('.lbl');
    const cs = lbl ? getComputedStyle(lbl) : null;
    return { cls: el.className, lblTxt: lbl?.textContent.slice(0, 30),
      align: cs?.textAlign, fs: cs?.fontSize, ws: cs?.whiteSpace,
      rows: null };
  });
});
await p.screenshot({ path: '/tmp/libui-list.png' });
/* toggle to grid2 (list → grid2 in the new cycle) */
await p.evaluate(() => {
  document.querySelector('[data-brv]')?.click();
});
await p.waitForTimeout(600);
const g2 = await p.evaluate(() => {
  const host = document.querySelector('.secgrid');
  const first = document.querySelector('.tile.brw');
  return { cols: host ? getComputedStyle(host).gridTemplateColumns.split(' ').length : null,
    cls: first?.className,
    toggleTitle: document.querySelector('[data-brv]')?.title };
});
await p.screenshot({ path: '/tmp/libui-grid2.png' });
console.log(JSON.stringify({ rows, g2, errs }, null, 1));
await b.close();
