/* 📷-WHILE-SCROLLED repro (v0.83.11 — Suresh's attachment: scroll
   the LCD preview, take the screenshot → scrambled content). Drives
   the REAL Studio + engine: jump to porch, tap the PRESETS chip
   (scrolls #grid), press #pvSnap, intercept the download and save
   the PNG for eyes-on comparison against a live screenshot of the
   same moment. */
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
    media_artist: 'The Analog Hours', media_album_name: 'Late Static',
    entity_picture: '/api/media_player_proxy/album.jpg',
    volume_level: 0.34, supported_features: 84351 } },
  'light.porch_lights': { s: 'on', a: { friendly_name: 'Porch Lights',
    brightness: 153, supported_color_modes: ['brightness'], color_mode: 'brightness' } },
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
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 150)); });
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 'stub-token');
  /* capture the snap instead of downloading it */
  const oc = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && this.href.startsWith('data:image/png')) {
      window._snapHref = this.href; window._snapName = this.download; return;
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
/* photo ON — his repro is the framed shot */
await p.evaluate(() => document.querySelector('#skinOn')?.click());
await p.waitForTimeout(1800);

const iframeEval = (fn) => p.evaluate((src) => {
  const pv = document.getElementById('pv');
  return new Function('doc', 'win', 'return (' + src + ')(doc, win)')(
    pv.contentDocument, pv.contentWindow);
}, fn.toString());

const snap = async (tag) => {
  await p.evaluate(() => { delete window._snapHref; });
  await p.evaluate(() => document.getElementById('pvSnap')?.click());
  for (let i = 0; i < 60; i++) {
    await p.waitForTimeout(250);
    if (await p.evaluate(() => !!window._snapHref)) break;
  }
  const href = await p.evaluate(() => window._snapHref || null);
  if (href) writeFileSync(`${OUT}/${tag}.png`,
    Buffer.from(href.slice('data:image/png;base64,'.length), 'base64'));
  return !!href;
};

const r = {};
/* baseline: unscrolled snap */
r.snap0 = await snap('unscrolled');

/* scroll: tap the PRESETS chip inside the engine */
await iframeEval((doc) => {
  const chip = [...doc.querySelectorAll('#banner .hjump')]
    .find(el => /presets/i.test(el.textContent));
  chip?.click();
});
await p.waitForTimeout(500);
r.gridTop = await iframeEval((doc) => doc.getElementById('grid').scrollTop);
/* live truth of the same moment */
const box = await p.evaluate(() => {
  const w = document.querySelector('img[src*="skins/astrion"]')?.closest('div');
  const r2 = (w || document.getElementById('pv')).getBoundingClientRect();
  return { x: r2.x, y: r2.y, width: r2.width, height: r2.height };
});
await p.screenshot({ path: `${OUT}/live-scrolled.png`,
  clip: { x: Math.max(0, box.x), y: Math.max(0, box.y),
    width: Math.min(1600, box.width), height: Math.min(1000, box.height) } });

r.snap1 = await snap('scrolled');
r.gridTopAfter = await iframeEval((doc) => doc.getElementById('grid').scrollTop);
/* ROUND 2 (his second attachment): the snap's scroll-zeroing used to
   fire the spy, which RELEASED the tapped chip's pin — the capture
   lit the wrong chip and the live chips changed after the snap. The
   pin must survive, and the active chip must still be the tapped one. */
const engFrame = p.frames().find(f => f.url().includes('/local/harmonium/index.html'));
r.pinAfter = await engFrame.evaluate(() => ({
  pin: S.heroPin ? S.heroPin.i : null,
  active: [...document.querySelectorAll('#banner .hjump')]
    .findIndex(el => el.classList.contains('active')),
}));

/* CHURN STAGE — his live house: WS diffs run renderStates during the
   async capture, and a generated-tile signature change escalates to
   navigate() → grid.innerHTML="" mid-clone. Simulate the REAL path:
   tileSig flips every call, so each renderStates() re-renders the
   grid. Churn starts 250ms AFTER the shutter (mid-walk), exactly the
   field timing. A frozen engine must produce the same PNG as the
   quiet scrolled snap. */
/* field timing: the real Google-Fonts fetch takes ~1s — the snap's
   vulnerable window. Re-route it with a delay so churn lands inside. */
await ctx.unroute('**fonts.googleapis.com/css2*');
await ctx.route('**fonts.googleapis.com/css2*', async route => {
  await new Promise(res => setTimeout(res, 1200));
  route.fulfill({ body: FONT_CSS, contentType: 'text/css' });
});
await iframeEval((doc, win) => {
  win._realTileSig = win.tileSig;
  let i = 0;
  win.tileSig = () => 'churn' + (i++);
});
await p.evaluate(() => { delete window._snapHref; });
await p.evaluate(() => document.getElementById('pvSnap')?.click());
await p.waitForTimeout(200);
await iframeEval((doc, win) => {
  let n = 0;
  win._churn = win.setInterval(() => {
    if (n++ < 4) win.renderStates();
    else win.clearInterval(win._churn);
  }, 300);
});
for (let i = 0; i < 60; i++) {
  await p.waitForTimeout(250);
  if (await p.evaluate(() => !!window._snapHref)) break;
}
await iframeEval((doc, win) => {
  win.clearInterval(win._churn);
  win.tileSig = win._realTileSig;
});
const href = await p.evaluate(() => window._snapHref || null);
r.snapChurn = !!href;
if (href) writeFileSync(`${OUT}/churn.png`,
  Buffer.from(href.slice('data:image/png;base64,'.length), 'base64'));

/* pixel distance churn-vs-quiet is computed outside (PIL) */
r.status = await p.evaluate(() =>
  document.body.textContent.match(/screenshot [a-z: ]+/)?.[0] || null);
console.log(JSON.stringify({ ...r, errs: errs.slice(0, 6) }, null, 1));
await b.close();
