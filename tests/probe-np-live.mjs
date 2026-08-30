/* NP LIVENESS (v0.85.7 — Suresh: "When I click next track on a
   playlist, sometimes the artwork and playbar stop updating.")
   Fences:
     1. HERO progress advances between state diffs (the 1s ticker
        skipped .hero — the SHIPPED DEFAULT froze between diffs);
     2. same-URL artwork refetches when the TRACK changes (a player
        serving one proxy URL wedged on the old cover);
     3. a failed art load recovers on the next track even when the
        URL is unchanged (the dataset.bad latch). */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'music', screen_order: ['music'],
  global: { room: 'Den' },
  remotes: { default: { capabilities: ['touch', 'pointer'] } },
  screens: { music: { name: 'Music', type: 'hub', font_scope: 'music',
    grid: { columns: 2 },
    tiles: [
      { id: 'm_np', type: 'media', art: true, np_default: 'hero', span: 2,
        entity: 'media_player.den', icon: 'material:music_note', label: 'Now Playing' },
    ] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 350, height: 582 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
let artFail = false;
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await ctx.route('**/art/cover.png*', r => artFail
  ? r.fulfill({ status: 404, body: '' })
  : r.fulfill({ contentType: 'image/png', body: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGP8tcWGARtgwio6aCUAgtEB+iohLfEAAAAASUVORK5CYII=', 'base64') }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.__pushState = null;
  window.WebSocket = class {
    constructor() {
      window.__ws = this;
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20);
    }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        window.__subId = msg.id;
        reply({ type: 'result', id: msg.id, success: true, result: null });
        reply({ type: 'event', id: msg.id, event: { a: {
          'media_player.den': { s: 'playing', a: {
            media_title: 'Track One', media_artist: 'A', media_album_name: 'X',
            entity_picture: '/art/cover.png', media_duration: 200, media_position: 10,
            media_position_updated_at: new Date().toISOString() } },
        } } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(1200);
const ck = (n, c) => { if (!c) errs.push(n); };
const barW = () => p.evaluate(() =>
  parseFloat(document.querySelector('#tile_m_np .npprog i').style.width) || 0);
const imgSrc = () => p.evaluate(() =>
  (document.querySelector('#tile_m_np .npimg') || {}).src || '');

/* 1. ticker: bar advances with NO further diffs */
const w0 = await barW();
await p.waitForTimeout(2600);
const w1 = await barW();
ck('hero bar ticks between diffs (' + w0 + ' -> ' + w1 + ')', w1 > w0);
const src0 = await imgSrc();
ck('art loaded (' + src0.slice(-30) + ')', src0.includes('/art/cover.png'));

/* 2. next track, SAME art URL → the img must refetch (cache-busted) */
await p.evaluate(() => {
  window.__ws.onmessage({ data: JSON.stringify({ type: 'event', id: window.__subId,
    event: { c: { 'media_player.den': { '+': { a: {
      media_title: 'Track Two', media_position: 0,
      media_position_updated_at: new Date().toISOString() } } } } } }) });
});
await p.waitForTimeout(500);
const src1 = await imgSrc();
ck('same-URL art re-fetched on track change (' + src1.slice(-40) + ')',
  src1 !== src0 && src1.includes('_hkt='));

/* 3. art fails on track three → placeholder; recovers on track four */
artFail = true;
await p.evaluate(() => {
  window.__ws.onmessage({ data: JSON.stringify({ type: 'event', id: window.__subId,
    event: { c: { 'media_player.den': { '+': { a: { media_title: 'Track Three' } } } } } }) });
});
await p.waitForTimeout(600);
const hid1 = await p.evaluate(() =>
  document.querySelector('#tile_m_np .npimg').classList.contains('hidden'));
ck('failed art hides the img (placeholder shows)', hid1 === true);
artFail = false;
await p.evaluate(() => {
  window.__ws.onmessage({ data: JSON.stringify({ type: 'event', id: window.__subId,
    event: { c: { 'media_player.den': { '+': { a: { media_title: 'Track Four' } } } } } }) });
});
await p.waitForTimeout(700);
const hid2 = await p.evaluate(() =>
  document.querySelector('#tile_m_np .npimg').classList.contains('hidden'));
ck('art recovers on the next track (bad-latch cleared)', hid2 === false);

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
