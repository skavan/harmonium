/* NOGAP MISDETECTION probe (v0.83.8 — P1 #9 SOLVED, Suresh's
   DevTools find: html.nogap live on modern Chrome, play button
   71×84). Reproduces the killer: the engine booted inside a
   display:none iframe used to read scrollHeight 0 → "no flex gap" →
   nogap forever → doubled spacing → squashed circle. Asserts:
   (a) direct load → NO nogap, play circle a true 84×84;
   (b) load hidden, reveal later → still NO nogap (the probe retries
       until layout exists), circle round;
   (c) insurance: even with nogap forced on, flex: 0 0 auto keeps
       the circle 84px wide. */
import { chromium } from 'playwright-core';

const STATES = {
  'media_player.sonos': { s: 'playing', a: { friendly_name: 'Sonos',
    media_title: 'T', media_duration: 100, media_position: 5,
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
    screen: 'controller:m' } },
  screens: { den: { name: 'Den', type: 'hub', room: true,
    sections: [{ tiles: [{ id: 'acts', type: 'activities', room: 'den' }] }] } },
  controllers: { m: { name: 'M', type: 'controller', class: 'activity',
    view_kind: 'controller',
    control_target: { label: '$activity.name', volume: '$context.volume', pass_through: [] },
    tiles: [
      { id: 'np', type: 'media', entity: '$context.media_player', label: 'NP', span: 2 },
      { id: 'tr', type: 'transport', entity: '$context.media_player', span: 2 },
    ] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 900, height: 900 } });
const errs = [];
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
const HOST = `<!doctype html><body>
  <div id="wrap" style="display:none">
    <iframe id="f" src="/index.html#preview=1" style="width:349px;height:581px;border:0"></iframe>
  </div></body>`;
await ctx.route('**/host.html', r => r.fulfill({ body: HOST, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
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

const r = {};
// (a) direct load — modern path untouched
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => navigate('controller:m'));
await p.waitForTimeout(400);
r.direct = await p.evaluate(() => {
  const c = document.querySelector('.trow .trbig')?.getBoundingClientRect();
  return { nogap: document.documentElement.classList.contains('nogap'),
    circle: c ? { w: +c.width.toFixed(1), h: +c.height.toFixed(1) } : null };
});
// (c) insurance, same page: force nogap → doubled spacing may
// overflow the row, but flex: 0 0 auto keeps the circle a circle
r.forced = await p.evaluate(() => {
  document.documentElement.classList.add('nogap');
  const c = document.querySelector('.trow .trbig').getBoundingClientRect();
  document.documentElement.classList.remove('nogap');
  return { w: +c.width.toFixed(1), h: +c.height.toFixed(1) };
});

// (b) THE KILLER: boot inside display:none, reveal after 1.5s
await p.goto('http://localhost:8482/host.html');
await p.waitForTimeout(1500);   /* engine boots hidden — old probe misfires here */
r.hiddenWhileBooting = await p.evaluate(() =>
  document.getElementById('f').contentDocument.documentElement.classList.contains('nogap'));
await p.evaluate(() => { document.getElementById('wrap').style.display = 'block'; });
await p.waitForTimeout(1200);   /* retry loop gets its layout */

await p.waitForTimeout(900);
r.afterReveal = await p.evaluate(() => {
  const d = document.getElementById('f').contentDocument;
  return { nogap: d.documentElement.classList.contains('nogap') };
});

console.log(JSON.stringify({ ...r,
  ok: !r.direct.nogap && r.direct.circle?.w === 84 && r.direct.circle?.h === 84 &&
      r.hiddenWhileBooting === false && !r.afterReveal.nogap &&
      r.forced?.w === 84 && r.forced?.h === 84,
  errs }, null, 1));
await b.close();
