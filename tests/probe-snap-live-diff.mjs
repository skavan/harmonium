/* 📷 CAPTURE-vs-LIVE geometry probe (round 3 of Suresh's scrolled-
   snap bug: on b40 the saved PNG shows the devices region spread
   ~40px down vs the live preview, bottom clipped). Every earlier
   probe compared capture against capture — this one compares the
   capture against THE LIVE PIXELS of the same moment: bottom out
   the grid (his state), focus a device tile, snap, then crop both
   the live iframe box and the PNG aperture, scale to a common size
   and diff. */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = '/home/claude/shots/snapbug';
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
    media_artist: 'The Analog Hours',
    entity_picture: '/api/media_player_proxy/album.jpg',
    volume_level: 0.34, supported_features: 84351 } },
  'light.porch_lights': { s: 'on', a: { friendly_name: 'Porch Lights',
    brightness: 130, supported_color_modes: ['brightness'], color_mode: 'brightness' } },
  'climate.room_air_conditioner': { s: 'cool', a: {
    friendly_name: 'Samsung AirCon', current_temperature: 75, temperature: 71,
    hvac_modes: ['off', 'cool'], min_temp: 60, max_temp: 86, supported_features: 1 } },
  'select.harmonium_porch_activity': { s: 'music', a: {
    friendly_name: 'Porch Activity', options: ['off', 'watch_firetv', 'watch_smart', 'music'] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({
  viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
await ctx.route('**/api/harmonium/config*', route =>
  route.request().method() === 'POST' ? route.fulfill({ json: { ok: true } })
    : route.fulfill({ json: cfg }));
await ctx.route('**/api/harmonium/workspaces', route =>
  route.fulfill({ json: { order: ['main'],
    workspaces: { main: { name: 'Main', file: 'config.json' } } } }));
await ctx.route('**/api/harmonium/engine_version', route =>
  route.fulfill({ json: { v: '0.83.11', bundled: '0.83.11', integration: '0.83.11' } }));
await ctx.route('**/api/harmonium/pair_admin', route =>
  route.fulfill({ json: { pending: [] } }));
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
p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 'stub-token');
  const oc = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && this.href.startsWith('data:image/png')) {
      window._snapHref = this.href; return;
    }
    return oc.apply(this, arguments);
  };
});
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
      else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
}, STATES);

await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2200);
await p.evaluate(() => {
  const el = [...document.querySelectorAll('#nav .item')]
    .find(x => (x.textContent || '').includes('Porch'));
  el?.click(); });
await p.waitForTimeout(800);
await p.evaluate(() => document.querySelector('#skinOn')?.click());
await p.waitForTimeout(1800);

const engFrame = p.frames().find(f => f.url().includes('/local/harmonium/index.html'));

/* HIS STATE: tap the last chip (bottoms the short page out, pin on),
   then walk focus down to a device tile */
await engFrame.evaluate(() => {
  const chips = [...document.querySelectorAll('#banner .hjump')];
  chips[chips.length - 1]?.click();
});
await p.waitForTimeout(400);
await engFrame.evaluate(() => { act('down'); act('down'); act('down'); });
await p.waitForTimeout(400);
const geo = await engFrame.evaluate(() => ({
  gridTop: grid.scrollTop, gridMax: grid.scrollHeight - grid.clientHeight,
  vw: innerWidth, vh: innerHeight,
  docSH: document.documentElement.scrollHeight,
  focus: S.focusId,
}));

/* live pixels of the drawn iframe box */
const box = await p.evaluate(() => {
  const f = document.getElementById('pv').getBoundingClientRect();
  return { x: f.x, y: f.y, w: f.width, h: f.height };
});
await p.screenshot({ path: `${OUT}/ld-live.png`,
  clip: { x: box.x, y: box.y, width: box.w, height: box.h } });

/* snap */
await p.evaluate(() => { delete window._snapHref; });
await p.evaluate(() => document.getElementById('pvSnap')?.click());
for (let i = 0; i < 60; i++) {
  await p.waitForTimeout(250);
  if (await p.evaluate(() => !!window._snapHref)) break;
}
const href = await p.evaluate(() => window._snapHref || null);
if (href) writeFileSync(`${OUT}/ld-snap.png`,
  Buffer.from(href.slice('data:image/png;base64,'.length), 'base64'));

/* aperture rect (photo %) for the crop, from the live config */
const skin = await p.evaluate(() => {
  const d = window.app?.draft || {};
  const s = d.remotes?.astrion?.skin;
  return s ? { sr: s.screen } : null;
});
console.log(JSON.stringify({ geo, box, snap: !!href, skin, errs: errs.slice(0, 5) }, null, 1));
await b.close();
