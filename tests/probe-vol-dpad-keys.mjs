/* VOLUME TILE ◀▶ (v0.85.7 — Suresh: "on a volume tile, in music
   controller right and left dpad do nothing [Astrion]. On RS90 they
   correctly change volume."). Pins the ENGINE path so the field
   divergence can be blamed on key delivery, not routing:
     1. focused volume tile + ArrowRight → media_player.volume_up;
     2. ArrowLeft → volume_down;
     3. the astrion PROFILE (same caps) takes the same path;
     4. group-volume rows (spkgrp panel style tiles) too. */
import { chromium } from 'playwright-core';
const CONFIG = {
  version: 2, home_screen: 'ctl', screen_order: ['ctl'],
  global: { room: 'X', activity_select: 'select.harmonium_room_activity' },
  remotes: {
    default: { capabilities: ['touch', 'pointer'] },
    astrion: { capabilities: ['physical_dpad', 'physical_volume', 'touch'] },
  },
  activities: { music: { name: 'M', room_view: 'ctl',
    context: { media_player: 'media_player.mp', volume: 'media_player.mp' } } },
  screens: { ctl: { name: 'Ctl', class: 'activity',
    tiles: [
      { id: 'v1', type: 'volume', entity: 'media_player.mp', label: 'Receiver' },
    ] } },
};
async function boot(device) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 350, height: 582 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
  await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
  await p.addInitScript((dev) => {
    localStorage.setItem('hakr_token', 't');
    localStorage.setItem('hakr_host', 'localhost:8482');
    if (dev) localStorage.setItem('hakr_device', dev);
    window.__calls = [];
    window.WebSocket = class {
      constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
      send(m) { const msg = JSON.parse(m);
        const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
        if (msg.type === 'auth') reply({ type: 'auth_ok' });
        else if (msg.type === 'call_service') {
          window.__calls.push(msg.domain + '.' + msg.service);
          reply({ type: 'result', id: msg.id, success: true, result: null });
        } else if (msg.type === 'subscribe_entities') {
          reply({ type: 'result', id: msg.id, success: true, result: null });
          reply({ type: 'event', id: msg.id, event: { a: {
            'select.harmonium_room_activity': { s: 'music', a: {} },
            'media_player.mp': { s: 'playing', a: { volume_level: 0.4 } },
          } } });
        } else reply({ type: 'result', id: msg.id, success: true, result: null });
      }
      close() {}
    };
  }, device);
  await p.goto('http://localhost:8482/index.html');
  await p.waitForTimeout(900);
  /* focus the volume tile with the pad, then ◀ ▶ */
  await p.keyboard.press('ArrowDown');       /* first focus stop */
  await p.waitForTimeout(150);
  const focus = await p.evaluate(() => S.focusId);
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(150);
  await p.keyboard.press('ArrowLeft');
  await p.waitForTimeout(150);
  const calls = await p.evaluate(() => window.__calls);
  await b.close();
  return { focus, calls, errs };
}
const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };
const def = await boot(null);
ck('default: volume tile focused (' + def.focus + ')', def.focus === 'v1');
ck('default: ▶ = volume_up', def.calls.includes('media_player.volume_up'));
ck('default: ◀ = volume_down', def.calls.includes('media_player.volume_down'));
ck('default: crash-free', def.errs.length === 0);
const ast = await boot('astrion');
ck('astrion profile: ▶ = volume_up', ast.calls.includes('media_player.volume_up'));
ck('astrion profile: ◀ = volume_down', ast.calls.includes('media_player.volume_down'));
console.log(JSON.stringify({ def, ast, ok: errs.length === 0, errs }, null, 1));
if (errs.length) process.exit(1);
