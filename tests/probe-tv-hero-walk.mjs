/* THE HERO'S LIBRARY DOOR + THE ⚙ TELEPORT (v0.85.7 — Suresh, Fire
   TV borrow mode: "If Now Playing tile is selected, no DPAD Key gets
   me to the Library button. I would expect down to do that… Right is
   the weirdest of all, it takes me down to the Fire TV DEVICE with
   the settings area selected… don't like that orange line at the top
   of the screen.")
   Fences (astrion profile, borrow armed):
     1. ▼ from the NP hero lands on its own Library trail ROW;
     2. ▼ again continues to the transport;
     3. ▶ from the hero does NOT teleport to another tile's ⚙ corner
        trail (no sideways candidate → no move);
     4. ▲ from the Library trail returns to the hero;
     5. the title bar's passthrough class draws NO accent border (the
        orange line is gone — the bottom TV strip is the cue). */
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
const focus = () => p.evaluate(() => S.focusId);

const hasTrail = await p.evaluate(() =>
  !!document.querySelector('#tile_t_np .trail'));
ck('fixture sanity: the hero grew its Library trail row', hasTrail);

await p.keyboard.press('PageDown');            /* borrow + reveal */
await p.waitForTimeout(250);
ck('ring revealed at the hero (' + await focus() + ')', await focus() === 't_np');

/* 5. no orange line on the title bar */
const barBorder = await p.evaluate(() =>
  getComputedStyle(document.getElementById('bar')).borderBottomWidth);
ck('title bar has NO accent border (' + barBorder + ')', barBorder === '0px');

/* 3. ▶ never teleports to another tile's ⚙ */
await p.keyboard.press('ArrowRight');
await p.waitForTimeout(200);
ck('▶ from the hero stays put (' + await focus() + ')', await focus() === 't_np');

/* 1. ▼ lands on the Library door */
await p.keyboard.press('ArrowDown');
await p.waitForTimeout(200);
ck('▼ from the hero reaches its Library trail (' + await focus() + ')',
  await focus() === 't_np::trail');

/* 4. ▲ returns to the hero */
await p.keyboard.press('ArrowUp');
await p.waitForTimeout(200);
ck('▲ from the trail returns to the hero (' + await focus() + ')',
  await focus() === 't_np');

/* 2. ▼ ▼ continues past the door to the transport */
await p.keyboard.press('ArrowDown');
await p.keyboard.press('ArrowDown');
await p.waitForTimeout(250);
ck('▼▼ continues to the transport (' + await focus() + ')',
  await focus() === 't_tr');

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
