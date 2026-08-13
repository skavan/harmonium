/* v0.83.1 volume: fat default + optimistic nudge */
import { chromium } from 'playwright-core';
const STATES = {
  'media_player.ma_sonos_basement': { s: 'playing', a: {
    friendly_name: 'Porch Sonos', media_title: 'Golden Hour',
    volume_level: 0.34, supported_features: 84351 } },
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
r.fat = await p.evaluate(() => {
  const v = document.querySelector('.tile.wgt-volume');
  return { sldr: !!v?.querySelector('.sldr'),
    sub: v?.querySelector('.sub.subin, .sub')?.textContent };
});
/* tap + : meter must move IMMEDIATELY (no state event will arrive) */
await p.evaluate(() => {
  [...document.querySelectorAll('.tile.wgt-volume [data-vol=up]')][0]?.click(); });
await p.waitForTimeout(120);
r.afterTap = await p.evaluate(() => {
  const v = document.querySelector('.tile.wgt-volume');
  return { sub: v?.querySelector('.sub.subin, .sub')?.textContent,
    centerPct: v?.querySelector('.volpct')?.textContent,
    miniMeterGone: !v?.querySelector('.volrow .meter'),
    sldrW: v?.querySelector('.sldr i')?.style.width,
    call: window._calls.find(c => c.service === 'volume_up')?.service };
});
await p.evaluate(() => { const t = document.querySelector('.tile.wgt-volume');
  t?.scrollIntoView({ block: 'center' }); });
await p.waitForTimeout(200);
await (await p.$('.tile.wgt-volume'))?.screenshot({ path: '/tmp/vol-tile.png' });
r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
