/* TRANSPORT TILE GATED BY physical_transport (2026-08-24 — Astrion v1
   has no physical prev/play/next, so it needs the on-screen transport
   tile; Astrion v2 and the Haptique RS90 have the keys, so the tile
   drops). Same capability-gating pattern as physical_dpad: the tile
   declares `unless: physical_transport`; the profile declares the cap.
   Routing is unchanged — this is purely tile visibility. */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'm', screen_order: ['m'],
  global: { room: 'X', activity_select: 'select.x' },
  activities: { music: { name: 'Music', context: { media_player: 'media_player.amp' } } },
  remotes: {
    v1:  { capabilities: ['physical_dpad', 'touch'] },                        // Astrion v1 — no transport keys
    v2:  { capabilities: ['physical_dpad', 'physical_transport', 'touch'] },  // Astrion v2 / RS90
  },
  screens: {
    m: { name: 'Music', type: 'controller', class: 'activity',
      context: { media_player: 'media_player.amp' }, grid: { columns: 1 },
      sections: [{ tiles: [
        { id: 'm_np', type: 'media', entity: '$context.media_player', label: 'NP' },
        { id: 'm_tr', type: 'transport', entity: '$context.media_player',
          label: 'Transport', unless: 'physical_transport' } ] }] },
  },
};

async function run(device) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
  await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
  await p.addInitScript((dev) => {
    localStorage.setItem('hakr_token', 't');
    localStorage.setItem('hakr_host', 'localhost:8482');
    localStorage.setItem('hakr_device', dev);
    window.WebSocket = class {
      constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
      send(m) { const msg = JSON.parse(m);
        const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
        if (msg.type === 'auth') reply({ type: 'auth_ok' });
        else if (msg.type === 'subscribe_entities') {
          reply({ type: 'result', id: msg.id, success: true, result: null });
          reply({ type: 'event', id: msg.id, event: { a: {
            'select.x': { s: 'music', a: {} },
            'media_player.amp': { s: 'playing', a: {} } } } });
        } else reply({ type: 'result', id: msg.id, success: true, result: null });
      }
      close() {}
    };
  }, device);
  await p.goto('http://localhost:8482/index.html');
  await p.waitForTimeout(800);
  const hasTr = await p.evaluate(() => !!document.getElementById('tile_m_tr'));
  await b.close();
  return { hasTr, errs };
}

const v1 = await run('v1');   // no physical_transport → tile shows
const v2 = await run('v2');   // has physical_transport → tile hidden
const ok = v1.hasTr === true && v2.hasTr === false &&
  !v1.errs.length && !v2.errs.length;
console.log(JSON.stringify({ v1, v2, ok }, null, 1));
