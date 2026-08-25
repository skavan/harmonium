/* NO-DEFAULT-FOCUS ON TV PAGES (2026-08-24 — Suresh: "On TV we should
   default to no tile selected … when the mode goes off, so too should
   the selected tile"). Ring visible ⇔ claim active, on TV pages:
   · arrive on a TV page → NO ring (focus null)
   · first Ch± → reveals the ring at the top element WITHOUT walking
   · next Ch± → walks
   · claim lapses → focus clears (ring gone)
   · a NON-TV page (music) keeps its default focus (unchanged). */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'home', screen_order: ['home'],
  global: { room: 'X', activity_select: 'select.x' },
  activities: { tvact: { name: 'TV', context: { dpad: 'remote.fire' } },
    music: { name: 'Music', context: { media_player: 'media_player.amp' } } },
  remotes: { pad: { capabilities: ['physical_dpad', 'touch'] } },
  screens: {
    home: { name: 'Home', type: 'hub', grid: { columns: 1 },
      sections: [{ tiles: [{ id: 'h1', type: 'preset', label: 'Go', action: {} }] }] },
    music: { name: 'Music', type: 'controller', class: 'activity',
      context: { media_player: 'media_player.amp' }, grid: { columns: 1 },
      sections: [{ tiles: [
        { id: 'p1', type: 'preset', label: 'One', action: {} },
        { id: 'p2', type: 'preset', label: 'Two', action: {} } ] }] },
    tv: { name: 'TV', type: 'controller', class: 'activity',
      dpad_passthrough: 'remote.fire', context: { dpad: 'remote.fire' },
      grid: { columns: 1 },
      sections: [{ tiles: [
        { id: 't1', type: 'preset', label: 'Uno', action: {} },
        { id: 't2', type: 'preset', label: 'Dos', action: {} } ] }] },
  },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  localStorage.setItem('hakr_device', 'pad');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        reply({ type: 'event', id: msg.id, event: { a: {
          'select.x': { s: 'tvact', a: {} } } } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => { TIMING.padLatch = 1000; });

const focus = () => p.evaluate(() => S.focusId);
const strip = () => p.evaluate(() =>
  !document.getElementById('padstrip').classList.contains('hidden'));
const r = {};

// 1. arrive on the TV page → NO ring
await p.evaluate(() => navigate('tv')); await p.waitForTimeout(200);
r.arriveNoFocus = await focus();                 // null

// 2. first Ch± reveals at top, no walk — and the countdown bar appears on it
await p.keyboard.press('PageDown'); await p.waitForTimeout(120);
r.firstCh = { focus: await focus(), strip: await strip() };   // t1 · true
r.barOnTile = await p.evaluate(() => {
  const b = document.getElementById('claimbar');
  return !!b && !!b.closest('#tile_t1');                       // bar hosted by the focused tile
});
await p.screenshot({ path: '/tmp/claimbar.png' });

// 3. next Ch± walks
await p.keyboard.press('PageDown'); await p.waitForTimeout(120);
r.secondCh = await focus();                        // t2

// 4. claim lapses → focus clears, and the countdown bar is gone
await p.waitForTimeout(1300);
r.afterExpiry = { focus: await focus(), strip: await strip(),
  bar: await p.evaluate(() => !!document.getElementById('claimbar')) };  // null · false · false

// 5. NON-TV page keeps default focus
await p.evaluate(() => { S.states.set('select.x', { s: 'music', a: {} });
  navigate('music'); }); await p.waitForTimeout(200);
r.musicHasFocus = await focus();                   // p1 (not null)

r.ok =
  r.arriveNoFocus === null &&
  r.firstCh.focus === 't1' && r.firstCh.strip === true &&
  r.barOnTile === true &&
  r.secondCh === 't2' &&
  r.afterExpiry.focus === null && r.afterExpiry.strip === false &&
  r.afterExpiry.bar === false &&
  r.musicHasFocus === 'p1' &&
  errs.length === 0;

console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close();
