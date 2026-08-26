/* THE BUTTONS STRIP JOINS THE PAD (v0.85.7 — Suresh: "in [borrow]
   mode, a down DPAD press [should] go to the next element even if
   its inside the tile, like library. But it doesn't."). The walk
   between tiles was fine; the gap was INSIDE: the buttons strip
   (info/menu/back/home) was touch-only — no keys, no select — the
   one composite row a remote could not operate. Now it roves like
   transport/coverbtns. Fences, on the real stock tv controller
   during the CH borrow:
     1. ▼ walks tile to tile through the strip (t_np → transport →
        strip → volume …) and ▲ walks back;
     2. on the strip, ▶ moves the roving highlight (cvsel);
     3. OK fires the roved key as remote.send_command;
     4. ▼ leaves the strip to the next tile (rove does not trap). */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const starter = JSON.parse(readFileSync(
  new URL('../custom_components/harmonium/starter-config.json', import.meta.url), 'utf8'));
const CONFIG = {
  version: 2, home_screen: 'porch', screen_order: ['porch'],
  global: { room: 'X', activity_select: 'select.harmonium_porch_activity' },
  input: starter.input,
  remotes: { default: { capabilities: ['touch', 'pointer'] },
    astrion: starter.remotes.astrion },
  dialects: starter.dialects,
  apps: starter.apps,
  controllers: { tv: starter.controllers.tv },
  activities: { watch: { name: 'Watch Fire TV', room_view: 'porch',
    screen: 'controller:tv', kind: 'tv',
    context: { media_player: 'media_player.ftv', dpad: 'remote.ftv',
      volume: 'media_player.tvv', dialect: 'firetv' } } },
  screens: { porch: { name: 'Porch',
    sections: [{ tiles: [
      { id: 'a1', type: 'activity', activity: 'watch' },
      /* a strip OUTSIDE any controller too — the fences below use
         this one so they are independent of stock tv layout drift */
      { id: 'bs', type: 'buttons', entity: 'remote.ftv',
        buttons: ['info', 'menu', 'back', 'home'] },
      { id: 'n1', type: 'nav', target: 'porch', label: 'Below' },
    ] }] } },
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 350, height: 582 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  localStorage.setItem('hakr_device', 'astrion');
  window.__calls = [];
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'call_service') {
        window.__calls.push(msg.domain + '.' + msg.service + ':' +
          ((msg.service_data || {}).command || ''));
        reply({ type: 'result', id: msg.id, success: true, result: null });
      } else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        reply({ type: 'event', id: msg.id, event: { a: {
          'select.harmonium_porch_activity': { s: 'watch', a: {} },
          'media_player.ftv': { s: 'playing', a: {} },
          'remote.ftv': { s: 'on', a: {} },
          'media_player.tvv': { s: 'on', a: { volume_level: 0.3 } },
        } } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(1000);
const ck = (n, c) => { if (!c) errs.push(n); };
const focus = () => p.evaluate(() => S.focusId);

/* 1. the stock tv controller: borrow, then ▼ walks the tiles */
await p.evaluate(() => navigate('controller:tv'));
await p.waitForTimeout(700);
await p.keyboard.press('PageDown');   /* arm the borrow, reveal the ring */
await p.waitForTimeout(250);
const seq = [await focus()];
for (let i = 0; i < 3; i++) {
  await p.keyboard.press('ArrowDown');
  await p.waitForTimeout(180);
  seq.push(await focus());
}
ck('borrow walk moves tile to tile (' + seq.join(' → ') + ')',
  new Set(seq).size >= 3 && seq[0] === 't_np');

/* 2-4. the strip itself (porch page — panel-native, no borrow) */
await p.evaluate(() => navigate('porch'));
await p.waitForTimeout(500);
await p.evaluate(() => setFocus('bs'));
await p.waitForTimeout(150);
await p.keyboard.press('ArrowRight');
await p.waitForTimeout(150);
const rove = await p.evaluate(() => {
  const el = document.getElementById('tile_bs');
  const on = el.querySelector('.dpbtn.cvsel');
  return on ? on.dataset.cmd : null;
});
ck('▶ roves the strip highlight (' + rove + ')', rove === 'back');
await p.evaluate(() => { window.__calls.length = 0; });
await p.keyboard.press('Enter');
await p.waitForTimeout(250);
const fired = await p.evaluate(() => window.__calls.slice());
ck('OK fires the roved key [' + fired + ']',
  fired.some(x => /^remote\.send_command:back$/i.test(x)));
await p.keyboard.press('ArrowDown');
await p.waitForTimeout(200);
ck('▼ leaves the strip to the next tile (' + await focus() + ')',
  await focus() === 'n1');

console.log(JSON.stringify({ seq, rove, fired, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
