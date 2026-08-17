/* VOLUME UX probe (v0.83.10 — status review #1 + #7).
   #1 THE JUMP-BACK: tap + → display goes optimistic (+5%); a laggy
      HA echo with the device's REAL step (2%) lands inside the hold
      window → display DOES NOT snap back; after the window lapses,
      truth is adopted; the next tap uses the LEARNED 2% step.
   #7 MUTE BY POINTER: clicking the volume tile's speaker icon sends
      volume_mute (optimistic glyph flip included). MUTE KEY: with a
      second volume tile (the receiver) FOCUSED, the mute key targets
      the receiver; unfocused it targets the Volume role. */
import { chromium } from 'playwright-core';

const STATES = {
  'media_player.sonos': { s: 'playing', a: {
    friendly_name: 'Sonos', volume_level: 0.40, is_volume_muted: false,
    supported_features: 84351 } },
  'media_player.receiver': { s: 'on', a: {
    friendly_name: 'Receiver', volume_level: 0.30, is_volume_muted: false,
    supported_features: 84351 } },
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
      { id: 'vol', type: 'volume', entity: '$context.volume',
        icon: 'material:volume_up', label: 'Volume', span: 2 },
      { id: 'rcv', type: 'volume', entity: 'media_player.receiver',
        icon: 'material:speaker', label: 'Receiver', span: 2 },
    ] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript((STATES) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window._calls = []; window._STATES = STATES; window._sockets = [];
  window.WebSocket = class {
    constructor() { window._sockets.push(this);
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        this._subId = msg.id;
        reply({ type: 'result', id: msg.id, success: true, result: null });
        const a = {}; (msg.entity_ids || []).forEach(e => {
          if (window._STATES[e]) a[e] = window._STATES[e]; });
        reply({ type: 'event', id: msg.id, event: { a } });
      } else { if (msg.type === 'call_service')
          window._calls.push({ d: msg.domain, s: msg.service,
            data: msg.service_data, e: msg.target?.entity_id });
        reply({ type: 'result', id: msg.id, success: true, result: null }); }
    }
    close() {}
  };
  /* push an "echo" from HA into the live subscription */
  window._echo = (ent, attrs) => {
    const ws = window._sockets[window._sockets.length - 1];
    const st2 = window._STATES[ent];
    st2.a = { ...st2.a, ...attrs };
    ws.onmessage?.({ data: JSON.stringify({ type: 'event', id: ws._subId,
      event: { a: { [ent]: st2 } } }) });
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => navigate('controller:m'));
await p.waitForTimeout(500);

const r = {};
const shown = () => p.evaluate(() =>
  document.querySelector('#tile_vol .volpct')?.textContent);

// ---- #1: tap +, optimistic 45%, echo 42% inside the hold → stays 45
await p.evaluate(() =>
  document.querySelector('#tile_vol [data-vol=up]').click());
await p.waitForTimeout(150);
r.optimistic = await shown();                       /* want 45% */
await p.evaluate(() => window._echo('media_player.sonos', { volume_level: 0.42 }));
await p.waitForTimeout(200);
r.duringHold = await shown();                       /* want STILL 45% */
await p.waitForTimeout(1900);                       /* hold lapses */
await p.evaluate(() => window._echo('media_player.sonos', { volume_level: 0.42 }));
await p.waitForTimeout(200);
r.afterHold = await shown();                        /* truth 42% adopted */
// learned step: next tap should show 44% (42 + learned 2), not 47
await p.evaluate(() =>
  document.querySelector('#tile_vol [data-vol=up]').click());
await p.waitForTimeout(150);
r.learnedTap = await shown();                       /* want 44% */
r.volCalls = await p.evaluate(() =>
  window._calls.filter(c => c.s === 'volume_up').length);

// ---- #7a: click the speaker icon → volume_mute + optimistic glyph
await p.waitForTimeout(1900);
await p.evaluate(() => { window._calls.length = 0;
  document.querySelector('#tile_vol .top .ic')?.click(); });
await p.waitForTimeout(200);
r.iconMute = await p.evaluate(() => ({
  call: window._calls.find(c => c.s === 'volume_mute'),
  glyph: !!document.querySelector('#tile_vol .vmute'),
}));

// ---- #7b: mute KEY — receiver focused → mutes receiver; else role
r.focusDiag = await p.evaluate(() => {
  setFocus('rcv');
  const ft = tileDef(trailBase(S.focusId));
  return { focusId: S.focusId, found: !!ft, type: ft?.type, ent: ft?.entity };
});
await p.evaluate(() => { window._calls.length = 0;
  setFocus('rcv'); act('mute'); });   /* m = mute in the default keymap */
await p.waitForTimeout(200);
r.keyFocused = await p.evaluate(() =>
  window._calls.find(c => c.s === 'volume_mute')?.e);
await p.evaluate(() => { window._calls.length = 0;
  setFocus('vol'); act('mute'); });
await p.waitForTimeout(200);
r.keyRole = await p.evaluate(() =>
  window._calls.find(c => c.s === 'volume_mute')?.e);

console.log(JSON.stringify({ ...r,
  ok: r.optimistic === '45%' && r.duringHold === '45%' &&
      r.afterHold === '42%' && r.learnedTap === '44%' &&
      r.volCalls === 2 && !!r.iconMute.call && r.iconMute.glyph &&
      r.keyFocused === 'media_player.receiver' &&
      r.keyRole === 'media_player.sonos',
  errs }, null, 1));
await b.close();
