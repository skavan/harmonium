/* NOW PLAYING "POSTER" probe (v0.83.8 — Suresh, from a screenshot he
   liked: "I think we build this. With a Bar underneath for the
   Library (obviously without the transport volume etc)").
   Asserts: surface.np_style "poster" → .tile.wgt-media.poster with
   stacked .npposter (art img wired, centered title/artist), a live
   progress meter with the elapsed/total clock (0:36 / 4:19 shape),
   NO transport inside the tile, and the chassis trailing restyled
   as a FULL-WIDTH bar carrying the target screen's name. Also: the
   ticker keeps the clock moving while playing. */
import { chromium } from 'playwright-core';

const STATES = {
  'media_player.sonos': { s: 'playing', a: {
    friendly_name: 'Sonos', media_title: 'Beat It',
    media_artist: 'Michael Jackson', app_name: 'YouTube',
    media_duration: 259, media_position: 36,
    media_position_updated_at: new Date().toISOString(),
    entity_picture: '/art.png',
    volume_level: 0.4, supported_features: 84351 } },
  'select.harmonium_den_activity': { s: 'listen', a: { options: ['listen', 'off'] } },
};
const CONFIG = {
  version: 2, home_screen: 'den', screen_order: ['den'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  devices: { sonos: { name: 'Sonos', roles: {
    media_player: 'media_player.sonos', volume: 'media_player.sonos' } } },
  activities: { listen: { name: 'Listen', room_view: 'den', cast: ['sonos'],
    context: { media_player: 'media_player.sonos', volume: 'media_player.sonos' },
    screen: 'controller:music8',
    surface: { np_style: 'poster' } } },
  screens: {
    den: { name: 'Den', type: 'hub', room: true,
      sections: [{ role: 'activities', hero_label: 'Activities',
        tiles: [{ id: 'acts', type: 'activities', room: 'den' }] }] },
    lib1: { name: 'Music Library', type: 'hub',
      sections: [{ tiles: [] }] },
  },
  controllers: { music8: { name: 'Music', type: 'controller', class: 'activity',
    view_kind: 'controller',
    control_target: { label: '$activity.name', volume: '$context.volume', pass_through: [] },
    tiles: [
      { id: 'np', type: 'media', entity: '$context.media_player',
        label: 'Now Playing', span: 2,
        trailing: { icon: 'material:library_music', emphasis: 'accent',
          action: { navigate: 'lib1' } } },
    ] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await ctx.route('**/art.png', r => r.fulfill({ body: Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001080600000' +
  '01f15c4890000000d4944415478da63fcffff3f0300050001ffa5f1476' +
  '40000000049454e44ae426082', 'hex'), contentType: 'image/png' }));
await p.addInitScript((STATES) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        const a = {}; (msg.entity_ids || []).forEach(e => { if (STATES[e]) a[e] = STATES[e]; });
        reply({ type: 'event', id: msg.id, event: { a } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => navigate('controller:music8'));
await p.waitForTimeout(600);

const r = await p.evaluate(() => {
  const t = document.querySelector('.tile.wgt-media');
  const bar = t?.querySelector('.npprog');
  const trail = t?.querySelector('.trail');
  const tw = t ? t.getBoundingClientRect() : { width: 0 };
  const trw = trail ? trail.getBoundingClientRect() : { width: 0 };
  return {
    poster: !!t?.classList.contains('poster'),
    stacked: !!t?.querySelector('.npposter'),
    title: t?.querySelector('.npt')?.textContent,
    artist: t?.querySelector('.npa')?.textContent,
    imgShown: t?.querySelector('.npimg') &&
      !t.querySelector('.npimg').classList.contains('hidden'),
    progShown: bar && !bar.classList.contains('hidden'),
    progWidth: bar?.firstElementChild?.style.width,
    elapsed: t?.querySelector('.npel')?.textContent,
    total: t?.querySelector('.npdu')?.textContent,
    topHidden: t ? getComputedStyle(t.querySelector('.top')).display === 'none' : null,
    trailLbl: trail?.querySelector('.trlbl')?.textContent,
    trailWide: trw.width > tw.width * 0.8,   /* full-width bar, not edge zone */
    trailStatic: trail ? getComputedStyle(trail).position === 'static' : null,
    noTransport: !t?.querySelector('.trow'),
  };
});

/* the 1s ticker keeps the clock breathing */
const el0 = r.elapsed;
await p.waitForTimeout(2300);
const el1 = await p.evaluate(() =>
  document.querySelector('.tile.wgt-media .npel')?.textContent);
const hArt = await p.evaluate(() =>
  +document.querySelector('.tile.wgt-media').getBoundingClientRect().height.toFixed(0));

/* THE TRIM (v0.83.8 follow-up, corrected — "the Poster panel was
   too big, pushing the transport down … needs to be 8-12px
   shorter"): with-art height must stay under the first cut's 505px
   (the ~12px trim), and an artless card SHRINKS — no placeholder,
   that shrink was always fine */
const bare = await ctx.newPage();
bare.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await bare.addInitScript((STATES) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        const a = {}; (msg.entity_ids || []).forEach(e => { if (STATES[e]) a[e] = STATES[e]; });
        reply({ type: 'event', id: msg.id, event: { a } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
}, { ...STATES, 'media_player.sonos': { s: 'idle', a: {
  friendly_name: 'Sonos', volume_level: 0.4, supported_features: 84351 } } });
await bare.goto('http://localhost:8482/index.html');
await bare.waitForTimeout(900);
await bare.evaluate(() => navigate('controller:music8'));
await bare.waitForTimeout(500);
const bareR = await bare.evaluate(() => {
  const t = document.querySelector('.tile.wgt-media');
  return { h: +t.getBoundingClientRect().height.toFixed(0),
    noPlaceholder: !t.querySelector('.npph') };
});

console.log(JSON.stringify({
  ...r,
  clockShape: /^\d+:\d{2}$/.test(r.elapsed || '') && /^4:19$/.test(r.total || ''),
  ticks: el0 !== el1,
  hArt, hBare: bareR.h, noPlaceholder: bareR.noPlaceholder,
  trimmed: hArt <= 496,           /* first cut was ~505; trim ≥ 9px */
  bareShrinks: bareR.h < hArt,
  errs,
}, null, 1));
await b.close();
