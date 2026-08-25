/* PER-TILE HEIGHT (v0.84.7 — forum request: "on the Watch TV
   controller pages I'd like to have a nearly full screen visualization
   with artwork for what's currently playing but I don't see a way to
   adjust just that card's height"). `span` said how WIDE; height was a
   per-SCREEN knob only, so one tall card beside normal ones could not
   be said. `h` says it per tile: a number = px, or a css length. */
import { chromium } from 'playwright-core';
const errs = []; const ck = (n, c) => { if (!c) errs.push(n); };
const CONFIG = {
  version: 2, home_screen: 'den', screen_order: ['den'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  devices: {}, activities: { watch: { name: 'Watch', room_view: 'den',
    context: { media_player: 'media_player.tv' }, screen: 'controller:tv1' } },
  screens: { den: { name: 'Den', type: 'hub', room: true,
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'den' }] }] } },
  controllers: { tv1: { name: 'TV', type: 'controller', class: 'activity',
    view_kind: 'controller', grid: { columns: 2, tile_h: 84 },
    control_target: { label: '$activity.name', pass_through: [] },
    tiles: [
      { id: 'np', type: 'media', art: true, entity: '$context.media_player',
        label: 'Now Playing', span: 2, h: 420 },        /* px number */
      { id: 'np2', type: 'media', entity: '$context.media_player',
        label: 'Vh card', span: 2, h: '30vh' },          /* css length */
      { id: 'np3', type: 'media', entity: '$context.media_player',
        label: 'Default', span: 2 },                     /* silent = page knob */
      { id: 'np4', type: 'media', entity: '$context.media_player',
        label: 'Bad', span: 2, h: 'javascript:alert(1)' },  /* rejected */
    ] } },
};
const STATES = {
  'media_player.tv': { s: 'playing', a: { friendly_name: 'TV', volume_level: 0.4 } },
  'select.harmonium_den_activity': { s: 'watch', a: { options: ['watch', 'off'] } },
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript((STATES) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window._STATES = STATES;
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        const a = {}; (msg.entity_ids || []).forEach(e => {
          if (window._STATES[e]) a[e] = window._STATES[e]; });
        reply({ type: 'event', id: msg.id, event: { a } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => navigate('controller:tv1'));
await p.waitForTimeout(500);

const r = await p.evaluate(() => {
  const box = id => {
    const el = document.getElementById('tile_' + id);
    return el ? Math.round(el.getBoundingClientRect().height) : null;
  };
  return { np: box('np'), np2: box('np2'), np3: box('np3'), np4: box('np4'),
    inlineBad: document.getElementById('tile_np4')?.style.height || '' };
});
ck('px height honoured (420)', r.np === 420);
ck('css length honoured (30vh of 800 = 240)', r.np2 === 240);
ck('silent tile still uses the page knob', r.np3 > 0 && r.np3 !== 420 && r.np3 !== 240);
ck('a tall card really is taller than a default one', r.np > r.np3);
ck('garbage height is rejected, not injected', r.inlineBad === '');
ck('rejected height falls back to the page knob', r.np4 === r.np3);

console.log(JSON.stringify({ r, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
