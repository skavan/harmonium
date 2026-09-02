/* PRESET WARM-START fence (round 9, 2026-09-02 — live find on his
   Porch: "Activity didn't start" on every music preset). The
   deadlock: a declared-state activity whose ON evidence IS the
   playback (Sonos playing/paused) can never satisfy the preset
   poll's device-truth gate, because the preset's own action is what
   creates that evidence. The fix: the poll accepts ROUTING truth —
   the activity select agreeing proves the start ran — and the
   preset fires; the device truth follows the music. This probe
   mirrors his exact config shape (sequence start → set_activity →
   select flips; state.on.any_state on the player). */
import { chromium } from 'playwright-core';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

const CONFIG = { version: 2, home_screen: 'p', screen_order: ['p'],
  global: { room: 'P', activity_select: 'select.harmonium_p_activity' },
  devices: {}, dialects: {},
  sequences: { music_start: { name: 'start', actions: [
    { action: 'harmonium.set_activity', data: { activity: 'music' } }] } },
  activities: { music: { name: 'Listen to Music', room_view: 'p',
    start: 'sequence:music_start',
    state: { entities: ['media_player.sonos'],
      on: { any_state: ['paused', 'buffering', 'on', 'playing'] } } } },
  screens: { p: { name: 'P', type: 'hub', class: 'room', view_kind: 'room', sections: [
    { columns: 3, role: 'presets', tiles: [
      { id: 'pr1', type: 'preset', label: 'Radar', icon: 'material:queue_music',
        activity: 'music',
        action: { service: 'music_assistant.play_media',
          entity: 'media_player.sonos', data: { media_id: 'library://playlist/40' } } },
    ] }] } },
  controllers: {} };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 349, height: 800 } })).newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await (p.context()).route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await (p.context()).route('**/api/harmonium/hello', r => r.fulfill({ json: { ok: true } }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.__svc = [];
  window.__subs = [];
  window.WebSocket = class {
    constructor() { window.__ws = this;
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const g = JSON.parse(m);
      if (g.type === 'subscribe_entities') window.__subs.push(g);
      if (g.type === 'call_service') window.__svc.push(g);
      const r = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (g.type === 'auth') r({ type: 'auth_ok' });
      else r({ type: 'result', id: g.id, success: true, result: null }); }
    close() {}
  };
  window.__diff = (ents) => {
    for (const sub of window.__subs) {
      const c = {};
      for (const k in ents) c[k] = { '+': { s: ents[k] } };
      window.__ws.onmessage({ data: JSON.stringify({ type: 'event', id: sub.id,
        event: { a: {}, c } }) });
    }
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);

/* seed: select on 'off', sonos idle — the activity reads INACTIVE */
await p.evaluate(() => window.__diff({ 'select.harmonium_p_activity': 'off',
  'media_player.sonos': 'idle' }));
await p.waitForTimeout(200);

/* tap the preset */
await p.locator('#tile_pr1').click();
await p.waitForTimeout(400);
const svc1 = await p.evaluate(() => window.__svc.map(s =>
  (s.domain || '') + '.' + (s.service || '')));
ck('the start sequence ran (harmonium.run on the start ref)',
  svc1.some(s => s === 'harmonium.run'));
ck('the preset does NOT fire before the start is proven',
  !svc1.some(s => s === 'music_assistant.play_media'));

/* the select flips — the SONOS STAYS IDLE (the deadlock condition:
   device truth false until the preset itself plays) */
await p.evaluate(() => window.__diff({ 'select.harmonium_p_activity': 'music' }));
let fired = false;
for (let i = 0; i < 20 && !fired; i++) {
  await p.waitForTimeout(300);
  fired = await p.evaluate(() => window.__svc.some(s =>
    (s.domain || '') + '.' + (s.service || '') === 'music_assistant.play_media'));
}
ck('the preset fires on ROUTING truth alone — select flipped, player still idle', fired);
const play = await p.evaluate(() => window.__svc.find(s => s.service === 'play_media'));
ck('the preset action reached its own player verbatim',
  !!play && play.service_data && play.service_data.media_id === 'library://playlist/40');
ck('no "Activity didn\'t start" flash', await p.evaluate(() =>
  (document.getElementById('screenName')?.textContent || '').indexOf("didn't start") < 0));

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
