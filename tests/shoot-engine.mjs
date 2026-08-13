/* DOC SHOOT — engine stills + hero-GIF frames, real engine, stubbed HA.
   Not a test: output is PNG frames for the README. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const ALBUM = readFileSync('/home/claude/shots/album.jpg');
const OUT = '/home/claude/shots';
const SYMS = readFileSync(
  '/root/work/harmonium/tests/node_modules/material-symbols/material-symbols-outlined.woff2');
const FONT_CSS = `@font-face{font-family:'Material Symbols Outlined';
font-style:normal;font-weight:400;
src:url(/local-syms.woff2) format('woff2')}
.material-symbols-outlined{font-family:'Material Symbols Outlined';
font-weight:normal;font-style:normal;line-height:1;letter-spacing:normal;
text-transform:none;display:inline-block;white-space:nowrap;
word-wrap:normal;direction:ltr;font-feature-settings:'liga';
-webkit-font-smoothing:antialiased}`;

/* ---- plausible live states for the fixture config's entities ---- */
const STATES = {
  'media_player.ma_sonos_basement': { s: 'playing', a: {
    friendly_name: 'Porch Sonos', media_title: 'Golden Hour',
    media_artist: 'The Analog Hours', media_album_name: 'Late Static',
    entity_picture: '/api/media_player_proxy/album.jpg',
    volume_level: 0.34, media_duration: 254, media_position: 96,
    media_position_updated_at: new Date().toISOString(),
    supported_features: 84351, shuffle: false, repeat: 'off',
    source_list: ['Porch Sonos', 'Line-In'] } },
  'media_player.sts_samsung_q90_porch': { s: 'off', a: {
    friendly_name: 'Porch TV', source_list: ['Fire TV', 'HDMI 1', 'TV'],
    supported_features: 84351 } },
  'light.porch_lights': { s: 'on', a: {
    friendly_name: 'Porch Lights', brightness: 153,
    supported_color_modes: ['brightness'], color_mode: 'brightness' } },
  'light.remote_3_button_backlight': { s: 'off', a: {
    friendly_name: 'Remote Backlight', supported_color_modes: ['brightness'] } },
  'climate.room_air_conditioner': { s: 'cool', a: {
    friendly_name: 'Porch Air', current_temperature: 76, temperature: 71,
    hvac_modes: ['off', 'cool', 'heat', 'fan_only'], fan_mode: 'auto',
    fan_modes: ['auto', 'low', 'high'], min_temp: 60, max_temp: 86,
    supported_features: 1 } },
  'cover.maestroscreen_04_fr': { s: 'open', a: {
    friendly_name: 'MaestroScreen', current_position: 100,
    supported_features: 15 } },
  'select.harmonium_porch_activity': { s: 'music', a: {
    friendly_name: 'Porch Activity',
    options: ['off', 'watch_firetv', 'watch_smart', 'music'] } },
  'sensor.harmonium_music_playlists': { s: '3', a: { items: [] } },
  'sensor.harmonium_music_artists': { s: '0', a: { items: [] } },
  'sensor.harmonium_music_albums': { s: '0', a: { items: [] } },
  'sensor.harmonium_music_tracks': { s: '0', a: { items: [] } },
  'sensor.harmonium_music_radio': { s: '0', a: { items: [] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function mkPage(dsf) {
  const ctx = await b.newContext({
    viewport: { width: 349, height: 581 }, deviceScaleFactor: dsf });
  await ctx.route('**/api/media_player_proxy/album.jpg', route =>
    route.fulfill({ body: ALBUM, contentType: 'image/jpeg' }));
  await ctx.route('**fonts.googleapis.com/css2*', route =>
    route.fulfill({ body: FONT_CSS, contentType: 'text/css' }));
  await ctx.route('**/local-syms.woff2', route =>
    route.fulfill({ body: SYMS, contentType: 'font/woff2',
      headers: { 'Access-Control-Allow-Origin': '*' } }));
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    localStorage.setItem('hakr_token', 'shoot-token');
    localStorage.setItem('hakr_host', 'localhost:8482');
  });
  await p.addInitScript((STATES) => {
    window.WebSocket = class {
      constructor() { setTimeout(() => this.onmessage?.({
        data: JSON.stringify({ type: 'auth_required' }) }), 20); }
      send(m) {
        const msg = JSON.parse(m);
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
  return p;
}
const loadSyms = (pg) => pg.evaluate(() =>
  document.fonts.load("400 24px 'Material Symbols Outlined'"));

/* ================= STILLS (DPR 2, crisp) ================= */
const p = await mkPage(2);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(1200);
await loadSyms(p);
await p.waitForTimeout(400);
await p.evaluate(() => renderStates());
const shot = async (name) => { await p.waitForTimeout(350);
  await p.screenshot({ path: `${OUT}/raw/engine-${name}.png` }); };

await shot('porch');
await p.evaluate(() => navigate('controller:music'));
await shot('music');
await p.evaluate(() => navigate('comfort'));
await shot('comfort');
await p.evaluate(() => navigate('diag:'));
await shot('diag');

/* pair screen: fresh page, no token */
const ctx2 = await b.newContext({ viewport: { width: 349, height: 581 }, deviceScaleFactor: 2 });
await ctx2.route('**fonts.googleapis.com/css2*', route =>
  route.fulfill({ body: FONT_CSS, contentType: 'text/css' }));
await ctx2.route('**/local-syms.woff2', route =>
  route.fulfill({ body: SYMS, contentType: 'font/woff2',
      headers: { 'Access-Control-Allow-Origin': '*' } }));
await ctx2.route('**/api/harmonium/pair', route =>
  route.fulfill({ json: { session: 'ab'.repeat(16), code: 'FIG-482' } }));
await ctx2.route('**/api/harmonium/pair/**', route =>
  route.fulfill({ json: { status: 'pending' } }));
const p2 = await ctx2.newPage();
await p2.goto('http://localhost:8482/index.html');
await p2.waitForTimeout(700);
await p2.evaluate(() =>
  document.fonts.load("400 24px 'Material Symbols Outlined'"));
await p2.waitForTimeout(300);
await p2.evaluate(() => showAuth(''));
await p2.evaluate(() => { document.getElementById('hostIn').value = '192.168.1.87:8123'; });
await p2.click('#pairBtn');
await p2.waitForTimeout(500);
await p2.screenshot({ path: `${OUT}/raw/engine-pair.png` });
await ctx2.close();

/* ================= HERO GIF FRAMES (DPR 1) ================= */
const g = await mkPage(1);
let fi = 0;
const frame = async (tag, n = 1) => { for (let i = 0; i < n; i++) {
  await g.screenshot({ path: `${OUT}/frames/f${String(fi).padStart(3, '0')}_${tag}.png` });
  fi++; await g.waitForTimeout(60); } };

/* warm the font cache so the boot capture paints icons immediately */
await g.goto('http://localhost:8482/index.html');
await g.waitForTimeout(600);
await loadSyms(g);
await g.waitForTimeout(300);

/* boot: blank → painted */
await g.goto('about:blank');
await frame('blank', 4);
const t0 = Date.now();
await g.goto('http://localhost:8482/index.html');
/* capture as fast as possible during paint */
for (let i = 0; i < 6; i++) await frame('boot');
await g.waitForTimeout(400);
await frame('home', 10);

/* D-pad walk: down through the hub, then select Listen to Music */
const key = async (k, tag, hold = 3) => {
  await g.keyboard.press(k); await g.waitForTimeout(120);
  await frame(tag, hold); };
await key('ArrowDown', 'kdown');
await key('ArrowDown', 'kdown');
await key('ArrowRight', 'kright');
await key('ArrowDown', 'kdown');
await key('ArrowDown', 'kdown');
/* land on the music device tile region then select */
await frame('pause', 3);
await g.evaluate(() => navigate('controller:music'));
await g.waitForTimeout(500);
await frame('music', 14);
console.log('frames:', fi, 'bootNav ok, states live. t=', Date.now() - t0);
await b.close();
