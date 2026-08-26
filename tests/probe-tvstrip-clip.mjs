/* THE STRIP-CLIPPED TILE (v0.85.7 — Suresh, Fire TV: "when I scroll
   using channel buttons, we are not measuring the viewport with the
   back home strip. So a selected tile that sits underneath that strip
   gets clipped.") The TV back/home strip (and the pad-borrow strip
   above it) are fixed OVER the grid's bottom; gridScrollTo "nearest"
   used gr.bottom, so a focused tile could rest under the strips.
   Fences: walking ▼ down a TV page, the focused tile's bottom edge
   always clears the topmost visible strip. */
import { chromium } from 'playwright-core';
const CONFIG = {
  version: 2, home_screen: 'porch', screen_order: ['porch'],
  global: { room: 'X', activity_select: 'select.harmonium_porch_activity' },
  input: { physical_buttons: { short_press: 'control_target',
    hold: { back: 'app_back', home: 'room_home', power: 'all_off' },
    hold_ms: { navigation: 500, power: 1200 } } },
  remotes: { default: { capabilities: ['touch', 'pointer'] },
    astrion: { capabilities: ['physical_dpad', 'physical_volume', 'touch'] } },
  activities: { watch: { name: 'Watch', room_view: 'porch',
    screen: 'controller:tv', kind: 'tv',
    context: { media_player: 'media_player.ftv', dpad: 'remote.ftv',
      volume: 'media_player.tvv' } } },
  controllers: { tv: { name: 'TV', class: 'activity', view_kind: 'controller',
    type: 'controller', dpad_passthrough: '$context.dpad',
    grid: { columns: 1 },
    sections: [{ tiles: [
      { id: 't_np', type: 'media', entity: '$context.media_player', np_default: 'hero' },
      { id: 't_tr', type: 'transport', entity: '$context.media_player' },
      { id: 't_vol', type: 'volume', entity: '$context.volume' },
      { id: 'x1', type: 'preset', label: 'Filler One', icon: 'material:tv', action: {} },
      { id: 'x2', type: 'preset', label: 'Filler Two', icon: 'material:tv', action: {} },
      { id: 'x3', type: 'preset', label: 'Filler Three', icon: 'material:tv', action: {} },
      { id: 'dev', type: 'device', entity: 'media_player.ftv', label: 'Fire TV' },
    ] }] } },
  screens: { porch: { name: 'Porch', tiles: [
    { id: 'a1', type: 'activity', activity: 'watch' } ] } },
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 349, height: 581 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  localStorage.setItem('hakr_device', 'astrion');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        reply({ type: 'event', id: msg.id, event: { a: {
          'select.harmonium_porch_activity': { s: 'watch', a: {} },
          'media_player.ftv': { s: 'playing', a: { app_name: 'Netflix', media_title: 'Show' } },
          'media_player.tvv': { s: 'on', a: { volume_level: 0.3 } },
          'remote.ftv': { s: 'on', a: {} },
        } } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(1000);
await p.evaluate(() => navigate('controller:tv'));
await p.waitForTimeout(700);
const ck = (n, c) => { if (!c) errs.push(n); };

const stripOn = await p.evaluate(() => {
  const ts = document.getElementById('tvstrip');
  return ts && !ts.classList.contains('hidden');
});
ck('fixture sanity: the TV strip is showing', stripOn);

await p.keyboard.press('PageDown');            /* borrow the pad */
await p.waitForTimeout(250);

/* walk to the bottom; after every step the focused tile must clear
   the topmost visible strip */
for (let i = 0; i < 12; i++) {
  await p.keyboard.press('ArrowDown');
  await p.waitForTimeout(150);
  const r = await p.evaluate(() => {
    const id = S.focusId;
    const el = document.getElementById('tile_' + (id || '').replace('::trail', '')) ||
      document.querySelector('#grid [data-fid="' + id + '"]');
    if (!el) return null;
    const tb = el.getBoundingClientRect().bottom;
    let top = window.innerHeight;
    for (const sid of ['tvstrip', 'padstrip']) {
      const s = document.getElementById(sid);
      if (s && !s.classList.contains('hidden')) {
        const t = s.getBoundingClientRect().top;
        if (t < top) top = t;
      }
    }
    return { id, tileBottom: Math.round(tb), stripTop: Math.round(top) };
  });
  if (r && r.tileBottom > r.stripTop)
    errs.push('step ' + i + ': ' + r.id + ' clipped by the strip (tile bottom ' +
      r.tileBottom + ' > strip top ' + r.stripTop + ')');
}
console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
