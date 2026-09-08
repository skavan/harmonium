/* ROOM-SELECT ROUTING probe (2026-08-30 — the Deck/Porch wrong-room
   bug). Two rooms share controller:tv; each room page carries its
   minted activity_select — the shape the integration's deploy-time
   wire_activity_selects() now GUARANTEES. Fences:
     1. controller reached FROM deck answers with DECK's select
        (deck_watch), even while porch's select holds porch_watch;
     2. controller reached FROM porch answers with PORCH's select;
     3. the fall-through this wiring prevents, pinned: strip the
        screens' activity_selects (the old unwired shape) and the same
        deck walk falls to the GLOBAL select and answers porch_watch —
        the bug. If fence 3 ever fails, the ENGINE started resolving
        rooms without the wiring; retire the deploy shim consciously,
        not by accident;
     4. (PR #8, fahrer16) tapping a RUNNING activity tile whose select
        is stale self-heals the select of the room that OWNS the
        activity — standing on porch, a deck tile repairs DECK's
        select, never porch's (global's) — the "Validation error". */
import { chromium } from 'playwright-core';

const HUB = (room, sel) => ({ name: room, type: 'hub', room: true,
  activity_select: sel,
  sections: [{ role: 'activities', hero_label: 'Activities',
    tiles: [{ id: 'acts_' + room, type: 'activities', room }] }] });
const CONFIG = {
  version: 2, home_screen: 'porch', screen_order: ['porch', 'deck'],
  global: { room: 'Porch', activity_select: 'select.harmonium_porch_activity' },
  devices: {}, dialects: {},
  activities: {
    porch_watch: { name: 'Watch TV', room_view: 'porch',
      context: { media_player: 'media_player.p1' }, screen: 'controller:tv' },
    deck_watch: { name: 'Watch Projector', room_view: 'deck',
      context: { media_player: 'media_player.d1' }, screen: 'controller:tv' },
  },
  screens: {
    porch: HUB('porch', 'select.harmonium_porch_activity'),
    deck: HUB('deck', 'select.harmonium_deck_activity'),
  },
  controllers: { tv: { name: 'TV', type: 'controller', class: 'activity',
    view_kind: 'controller',
    tiles: [{ id: 'np', type: 'media', entity: '$context.media_player', span: 2 }] } },
};
const STATES = {
  'select.harmonium_porch_activity': { s: 'porch_watch', a: { options: ['porch_watch', 'off'] } },
  'select.harmonium_deck_activity': { s: 'deck_watch', a: { options: ['deck_watch', 'off'] } },
  'media_player.p1': { s: 'playing', a: { friendly_name: 'Porch TV' } },
  'media_player.d1': { s: 'playing', a: { friendly_name: 'Projector' } },
};
const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript((STATES) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window._STATES = STATES;
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      if (msg.type === 'call_service') (window._CALLS = window._CALLS || []).push(msg);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        const a = {}; (msg.entity_ids || []).forEach(e => {
          if (window._STATES[e]) a[e] = window._STATES[e]; });
        reply({ type: 'event', id: msg.id, event: { a } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);

const answer = () => p.evaluate(() => ({
  screen: S.screen, cur: currentActivityId(), ren: renderActivityId(),
  sel: roomActivitySelect(),
}));

/* --- 1. deck -> controller answers with DECK's activity --- */
await p.evaluate(() => navigate('deck'));
await p.waitForTimeout(250);
await p.evaluate(() => navigate('controller:tv'));
await p.waitForTimeout(350);
let a = await answer();
ck('deck controller reads deck\'s select',
  a.sel === 'select.harmonium_deck_activity');
ck('deck controller renders deck_watch (not porch\'s)',
  a.cur === 'deck_watch' && a.ren === 'deck_watch');

/* --- 2. porch -> controller answers with PORCH's activity --- */
await p.evaluate(() => { S.stack = []; navigate('porch'); });
await p.waitForTimeout(250);
await p.evaluate(() => navigate('controller:tv'));
await p.waitForTimeout(350);
a = await answer();
ck('porch controller reads porch\'s select',
  a.sel === 'select.harmonium_porch_activity');
ck('porch controller renders porch_watch', a.cur === 'porch_watch');

/* --- 3. the UNWIRED shape falls through to the global select ---
   (this is the pre-fix config; deploy-time wiring exists to prevent
   exactly this answer being wrong for deck) */
await p.evaluate(() => {
  delete CONFIG.screens.porch.activity_select;
  delete CONFIG.screens.deck.activity_select;
  S.stack = []; navigate('deck');
});
await p.waitForTimeout(250);
await p.evaluate(() => navigate('controller:tv'));
await p.waitForTimeout(350);
a = await answer();
ck('unwired shape falls to the GLOBAL select (the bug this pins)',
  a.sel === 'select.harmonium_porch_activity' && a.cur === 'porch_watch');

/* --- 4. self-heal on a running tile repairs the OWNING room's select ---
   (PR #8): restore the wired shape, declare deck_watch's state so device
   truth says ON, make deck's select stale, stand on PORCH and tap a
   deck_watch tile. The select_option must go to deck's select. */
const heal = await p.evaluate(() => {
  CONFIG.screens.porch.activity_select = 'select.harmonium_porch_activity';
  CONFIG.screens.deck.activity_select = 'select.harmonium_deck_activity';
  CONFIG.activities.deck_watch.state =
    { entities: ['media_player.d1'], on: { any_state: ['playing'] } };
  S.states.set('select.harmonium_deck_activity',
    { s: 'off', a: { options: ['deck_watch', 'off'] } });
  S.stack = []; navigate('porch');
  window._CALLS = [];
  WIDGETS.activity.select(null, { id: 't_deck', activity: 'deck_watch' });
  const c = (window._CALLS || []).filter(m =>
    m.domain === 'select' && m.service === 'select_option');
  return { n: c.length, target: c[0] && c[0].target && c[0].target.entity_id,
    option: c[0] && c[0].service_data && c[0].service_data.option };
});
ck('self-heal fired exactly once', heal.n === 1);
ck('self-heal repairs DECK\'s select from the porch page (not global\'s)',
  heal.target === 'select.harmonium_deck_activity' && heal.option === 'deck_watch');

console.log(JSON.stringify({ last: a, heal, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
