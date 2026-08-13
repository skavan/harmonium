/* DOC SHOOT — Studio stills + "Showing" tour GIF frames.
   Built Studio + real engine in the preview, fixture config, skin on. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = '/home/claude/shots';
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const cfg = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
const skinPng = readFileSync('/root/work/harmonium/skins/astrion.png');
const ALBUM = readFileSync('/home/claude/shots/album.jpg');
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

const STATES = {
  'media_player.ma_sonos_basement': { s: 'playing', a: {
    friendly_name: 'Porch Sonos', media_title: 'Golden Hour',
    media_artist: 'The Analog Hours', media_album_name: 'Late Static',
    entity_picture: '/api/media_player_proxy/album.jpg',
    volume_level: 0.34, media_duration: 254, media_position: 96,
    media_position_updated_at: new Date().toISOString(),
    supported_features: 84351 } },
  'media_player.sts_samsung_q90_porch': { s: 'off', a: {
    friendly_name: 'Porch TV', source_list: ['Fire TV', 'HDMI 1', 'TV'],
    supported_features: 84351 } },
  'light.porch_lights': { s: 'on', a: { friendly_name: 'Porch Lights',
    brightness: 153, supported_color_modes: ['brightness'], color_mode: 'brightness' } },
  'light.remote_3_button_backlight': { s: 'off', a: {
    friendly_name: 'Remote Backlight', supported_color_modes: ['brightness'] } },
  'climate.room_air_conditioner': { s: 'cool', a: { friendly_name: 'Porch Air',
    current_temperature: 76, temperature: 71,
    hvac_modes: ['off', 'cool', 'heat', 'fan_only'], min_temp: 60, max_temp: 86,
    supported_features: 1 } },
  'cover.maestroscreen_04_fr': { s: 'open', a: { friendly_name: 'MaestroScreen',
    current_position: 100, supported_features: 15 } },
  'select.harmonium_porch_activity': { s: 'music', a: {
    friendly_name: 'Porch Activity', options: ['off', 'watch_firetv', 'watch_smart', 'music'] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({
  viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });

await ctx.route('**/api/harmonium/config*', route =>
  route.request().method() === 'POST' ? route.fulfill({ json: { ok: true } })
    : route.fulfill({ json: cfg }));
await ctx.route('**/api/harmonium/workspaces', route =>
  route.fulfill({ json: { order: ['main'],
    workspaces: { main: { name: 'Main', file: 'config.json' } } } }));
await ctx.route('**/api/harmonium/engine_version', route =>
  route.fulfill({ json: { v: '0.82.0', bundled: '0.82.0', integration: '0.82.0' } }));
await ctx.route('**/api/harmonium/pair_admin', route =>
  route.request().method() === 'POST' ? route.fulfill({ json: { ok: true } })
    : route.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/states', route => route.fulfill({ json:
  Object.entries(STATES).map(([eid, v]) => ({ entity_id: eid, state: v.s, attributes: v.a })) }));
await ctx.route('**/api/media_player_proxy/album.jpg', route =>
  route.fulfill({ body: ALBUM, contentType: 'image/jpeg' }));
await ctx.route('**fonts.googleapis.com/css2*', route =>
  route.fulfill({ body: FONT_CSS, contentType: 'text/css' }));
await ctx.route('**/local-syms.woff2', route =>
  route.fulfill({ body: SYMS, contentType: 'font/woff2',
    headers: { 'Access-Control-Allow-Origin': '*' } }));
await ctx.route('**/local/harmonium/skins/astrion.png', route =>
  route.fulfill({ body: skinPng, contentType: 'image/png' }));
await ctx.route('**/local/harmonium/index.html*', route =>
  route.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', route =>
  route.fulfill({ body: studio, contentType: 'text/html' }));
await ctx.route('**api.github.com/**', route => route.abort());

const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
await p.addInitScript(() => localStorage.setItem('hakr_token', 'stub-token'));
await p.addInitScript((STATES) => {
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
      else if (msg.type === 'config/entity_registry/list')
        reply({ type: 'result', id: msg.id, result: [] });
      else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
}, STATES);

await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2200);

/* leave the workspace map; select the Porch screen */
await p.evaluate(() => {
  const el = [...document.querySelectorAll('#nav .item')]
    .find(x => (x.textContent || '').includes('Porch'));
  el?.click(); });
await p.waitForTimeout(800);

/* turn the device photo on */
await p.evaluate(() => document.querySelector('#skinOn')?.click());
await p.waitForTimeout(1800);
/* aim the preview at the hub */
const jump = async (screen) => { await p.evaluate((s) => {
  const sel = [...document.querySelectorAll('select')].find(x =>
    [...x.options].some(o => /diag:/.test(o.value)));
  if (sel) { sel.value = s; sel.dispatchEvent(new Event('change', { bubbles: true })); }
}, screen); await p.waitForTimeout(700); };
await jump('porch');
await p.evaluate(() => {
  document.querySelector('img[src*="skins/astrion"]')?.scrollIntoView({ block: 'start' }); });
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/raw/studio-main.png` });

/* map-keys editor */
await p.evaluate(() => document.querySelector('#skinMap')?.click());
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/raw/studio-map.png` });
await p.evaluate(() => document.querySelector('#skinMapDone')?.click());
await p.waitForTimeout(400);

/* tour GIF frames: hub → music → comfort → diagnostics */
let fi = 0;
const frame = async (n = 1) => { for (let i = 0; i < n; i++) {
  await p.screenshot({ path: `${OUT}/frames-studio/s${String(fi).padStart(3, '0')}.png` });
  fi++; await p.waitForTimeout(80); } };
await frame(6);
for (const s of ['controller:music', 'comfort', 'diag:']) {
  await jump(s); await frame(6);
}
await jump('porch');

/* pairing banner shot: flip pair_admin to a pending offer, wait for poll */
await ctx.unroute('**/api/harmonium/pair_admin');
await ctx.route('**/api/harmonium/pair_admin', route =>
  route.fulfill({ json: { pending: [{ session: 'ab'.repeat(16),
    code: 'FIG-482', name: 'porch remote', age: 14 }] } }));
await p.waitForTimeout(11000);
await p.screenshot({ path: `${OUT}/raw/studio-pair.png`,
  clip: { x: 0, y: 0, width: 1600, height: 220 } });

console.log(JSON.stringify({ frames: fi, errs }, null, 1));
await b.close();
