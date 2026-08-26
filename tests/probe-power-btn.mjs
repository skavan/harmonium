/* THE VANISHING POWER BUTTON (v0.85.7 — beta reporter, with
   screenshots and a clean repro: start an activity in a browser,
   close it, reopen — the activity card still says "On · hold to end"
   but the header power/End button is gone).

   Root cause: two truths. The card lights from the activity's own
   device-state rules (state.on); the End button lit from
   currentActivityId(), which read the SELECT alone — and a select can
   be stale (a start action that never flips it, an HA restart). This
   pins the fix (device-truth fallback) and its fences:
     1. fresh load, select "off", device rules say ON → button shows,
        card and button agree;
     2. select properly naming the activity → button shows (unchanged);
     3. nothing running → no button (unchanged);
     4. TWO activities device-ON with a stale select → abstain, no
        button (never guess between rooms). */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'room', screen_order: ['room'],
  global: { room: 'Wohnzimmer', activity_select: 'select.harmonium_room_activity' },
  remotes: { default: { capabilities: ['touch', 'pointer'] } },
  activities: {
    music: { name: 'Musik hören', room_view: 'room', kind: 'music',
      context: { media_player: 'media_player.mp' },
      state: { on: [{ entity: 'media_player.mp', in: ['playing', 'paused'] }] } },
    tv: { name: 'Fernsehen', room_view: 'room', kind: 'tv',
      context: { media_player: 'media_player.tv' },
      state: { on: [{ entity: 'media_player.tv', in: ['playing', 'on'] }] } },
  },
  screens: { room: { name: 'Wohnzimmer',
    tiles: [
      { id: 'a1', type: 'activity', activity: 'music' },
      { id: 'a2', type: 'activity', activity: 'tv' },
    ] } },
};

async function boot(states) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 350, height: 582 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
  await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
  await p.addInitScript((sts) => {
    localStorage.setItem('hakr_token', 't');
    localStorage.setItem('hakr_host', 'localhost:8482');
    window.WebSocket = class {
      constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
      send(m) { const msg = JSON.parse(m);
        const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
        if (msg.type === 'auth') reply({ type: 'auth_ok' });
        else if (msg.type === 'subscribe_entities') {
          reply({ type: 'result', id: msg.id, success: true, result: null });
          reply({ type: 'event', id: msg.id, event: { a: sts } });
        } else reply({ type: 'result', id: msg.id, success: true, result: null });
      }
      close() {}
    };
  }, states);
  await p.goto('http://localhost:8482/index.html');
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => ({
    endVisible: !document.getElementById('endBtn')?.classList.contains('hidden'),
    musicCard: document.querySelector('#tile_a1 .sub')?.textContent || '',
  }));
  await b.close();
  return { ...r, errs };
}

const errs = [];
const ck = (name, cond) => { if (!cond) errs.push(name); };

/* 1. THE REPRO: select stale ("off"), music provably playing */
const stale = await boot({
  'select.harmonium_room_activity': { s: 'off', a: {} },
  'media_player.mp': { s: 'playing', a: {} },
  'media_player.tv': { s: 'off', a: {} },
});
ck('stale select: card says On (' + stale.musicCard + ')', stale.musicCard.includes('hold to end'));
ck('stale select: END BUTTON SHOWS (the fix)', stale.endVisible);
ck('stale select: crash-free', stale.errs.length === 0);

/* 2. select confirms → unchanged */
const confirmed = await boot({
  'select.harmonium_room_activity': { s: 'music', a: {} },
  'media_player.mp': { s: 'playing', a: {} },
  'media_player.tv': { s: 'off', a: {} },
});
ck('confirmed select: button shows', confirmed.endVisible);

/* 3. nothing running → no button */
const idle = await boot({
  'select.harmonium_room_activity': { s: 'off', a: {} },
  'media_player.mp': { s: 'off', a: {} },
  'media_player.tv': { s: 'off', a: {} },
});
ck('idle: no button', !idle.endVisible);
ck('idle: card says Off', idle.musicCard.includes('press to start'));

/* 4. ambiguity: both device-ON, select stale → abstain */
const both = await boot({
  'select.harmonium_room_activity': { s: 'off', a: {} },
  'media_player.mp': { s: 'playing', a: {} },
  'media_player.tv': { s: 'playing', a: {} },
});
ck('two running + stale select: abstain (no guessing)', !both.endVisible);

console.log(JSON.stringify({ stale, confirmed: confirmed.endVisible,
  idle: idle.endVisible, both: both.endVisible,
  ok: errs.length === 0, errs }, null, 1));
if (errs.length) process.exit(1);
