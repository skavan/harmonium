/* v0.83.7 MUTE INDICATOR (.88 status review: "no on remote indicator
   of mute status"): slider mode → center readout = volume_off glyph,
   track dimmed, title EMPTY (feedback round: "we duplicate the volume
   % on the 1st and 3rd" — the title line says nothing in slider mode,
   muted or not); compact mode (slider:false) → title "Muted", then
   "Vol n%" when unmuted. */
import { chromium } from 'playwright-core';
const STATES = {
  'media_player.ma_sonos_basement': { s: 'playing', a: {
    friendly_name: 'Porch Sonos', media_title: 'Golden Hour',
    volume_level: 0.34, is_volume_muted: true, supported_features: 84351 } },
  'select.harmonium_porch_activity': { s: 'music', a: { options: [] } },
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await p.addInitScript((STATES) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window._calls = [];
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        const a = {}; (msg.entity_ids || []).forEach(e => { if (STATES[e]) a[e] = STATES[e]; });
        reply({ type: 'event', id: msg.id, event: { a } });
      } else { if (msg.type === 'call_service') window._calls.push(msg);
        reply({ type: 'result', id: msg.id, success: true, result: null }); }
    }
    close() {}
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => navigate('controller:music'));
await p.waitForTimeout(500);
const r = {};
r.muted = await p.evaluate(() => {
  const v = document.querySelector('.tile.wgt-volume');
  return {
    sub: v?.querySelector('.sub.subin, .sub')?.textContent,
    glyph: v?.querySelector('.volpct .vmute')?.textContent,
    trackDimmed: !!v?.querySelector('.sldr.muted, .meter.muted'),
  };
});
/* flip mute off via a live state diff — the % must come back */
await p.evaluate(() => {
  const e = 'media_player.ma_sonos_basement';
  const cur = S.states.get(e);
  cur.a.is_volume_muted = false;
  renderStates();
});
await p.waitForTimeout(200);
r.unmuted = await p.evaluate(() => {
  const v = document.querySelector('.tile.wgt-volume');
  return {
    sub: v?.querySelector('.sub.subin, .sub')?.textContent,
    pct: v?.querySelector('.volpct')?.textContent,
    trackDimmed: !!v?.querySelector('.sldr.muted, .meter.muted'),
  };
});
/* compact mode: slider:false on every volume tile of the controller —
   with no track, the TITLE carries the truth ("Muted" / "Vol n%") */
await p.evaluate(() => {
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === 'object') {
      if (o.type === 'volume') o.slider = false;
      Object.values(o).forEach(walk);
    }
  };
  walk(CONFIG.controllers);
  const e = 'media_player.ma_sonos_basement';
  S.states.get(e).a.is_volume_muted = true;
  navigate('home'); navigate('controller:music');
});
await p.waitForTimeout(400);
r.compactMuted = await p.evaluate(() => {
  const v = document.querySelector('.tile.wgt-volume');
  return { sub: v?.querySelector('.sub.subin, .sub')?.textContent,
    noTrack: !v?.querySelector('.sldr') };
});
await p.evaluate(() => {
  S.states.get('media_player.ma_sonos_basement').a.is_volume_muted = false;
  renderStates();
});
await p.waitForTimeout(200);
r.compactUnmuted = await p.evaluate(() => {
  const v = document.querySelector('.tile.wgt-volume');
  return { sub: v?.querySelector('.sub.subin, .sub')?.textContent };
});
console.log(JSON.stringify({ r, errs }));
await b.close();
