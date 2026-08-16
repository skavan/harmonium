/* SPEAKER GROUPING probe (v0.83.7 — beta-gaps §3, P1 #4).
   Three Sonos-ish players; kitchen already joined to the master.
   Asserts: rows render with correct joined state · join fires
   media_player.join at the MASTER · unjoin fires at the MEMBER ·
   the group slider moves every joined member by the SAME DELTA
   (offsets preserved) and never touches the unjoined one ·
   optimistic UI flips before any HA round-trip · VOLUME LINK
   (feedback: "a separate toggle should be to link their volume"):
   unlinking a joined member's volume exempts it from the group
   slider while it keeps playing in the group. */
import { chromium } from 'playwright-core';

const MP = { s: 'playing', a: { volume_level: 0.3, supported_features: 84351 } };
const STATES = {
  'media_player.sonos_porch': { s: 'playing', a: {
    friendly_name: 'Porch', media_title: 'Golden Hour', volume_level: 0.30,
    group_members: ['media_player.sonos_porch', 'media_player.sonos_kitchen'],
    supported_features: 84351 } },
  'media_player.sonos_kitchen': { s: 'playing', a: {
    friendly_name: 'Kitchen', volume_level: 0.50,
    group_members: ['media_player.sonos_porch', 'media_player.sonos_kitchen'],
    supported_features: 84351 } },
  'media_player.sonos_deck': { s: 'idle', a: {
    friendly_name: 'Deck', volume_level: 0.70, group_members: [],
    supported_features: 84351 } },
  'select.harmonium_den_activity': { s: 'listen', a: { options: ['listen', 'off'] } },
};
const CONFIG = {
  version: 2, home_screen: 'den', screen_order: ['den'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  devices: {
    porch_sonos: { name: 'Porch Sonos', roles: { media_player: 'media_player.sonos_porch', volume: 'media_player.sonos_porch' } },
    kitchen_sonos: { name: 'Kitchen Sonos', roles: { media_player: 'media_player.sonos_kitchen' } },
    deck_sonos: { name: 'Deck Sonos', roles: { media_player: 'media_player.sonos_deck' } },
  },
  activities: { listen: { name: 'Listen', room_view: 'den',
    cast: ['porch_sonos', 'kitchen_sonos', 'deck_sonos'],
    context: { media_player: 'media_player.sonos_porch', volume: 'media_player.sonos_porch' },
    screen: 'controller:music2' } },
  screens: { den: { name: 'Den', type: 'hub', room: true,
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'den' }] }] } },
  controllers: { music2: { name: 'Music', type: 'controller', class: 'activity',
    view_kind: 'controller',
    control_target: { label: '$activity.name', power: '$context.media_player',
      volume: '$context.volume', pass_through: [] },
    tiles: [
      { id: 'np', type: 'media', entity: '$context.media_player', label: 'Now Playing', span: 2 },
      { id: 'spk', type: 'speakers' },
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
await p.evaluate(() => navigate('controller:music2'));
await p.waitForTimeout(500);

const r = {};
// 1. render: card exists, master row hidden, joined states + sub correct
r.render = await p.evaluate(() => {
  const w = document.querySelector('.tile.wgt-grouping');
  if (!w) return { card: false };
  const rows = [...w.querySelectorAll('.grprow')]
    .filter(x => x.style.display !== 'none')
    .map(x => ({ ent: x.dataset.ent, on: x.classList.contains('on'),
      name: x.querySelector('.gname').textContent, lvl: x.querySelector('.glvl').textContent }));
  return { card: true, rows,
    sub: w.querySelector('.sub')?.textContent,
    groupVolShown: w.querySelector('.grpvol').style.display !== 'none',
    fill: w.querySelector('.grpvol .sldr i').style.width };
});

// 2. join Deck → optimistic flip + join at the MASTER
await p.evaluate(() => {
  [...document.querySelectorAll('.grprow[data-ent="media_player.sonos_deck"] .gjoin')][0]?.click();
});
await p.waitForTimeout(150);
r.join = await p.evaluate(() => ({
  deckOn: document.querySelector('.grprow[data-ent="media_player.sonos_deck"]').classList.contains('on'),
  call: window._calls.filter(c => c.service === 'join').map(c =>
    ({ target: c.target?.entity_id ?? c.service_data?.entity_id, members: (c.service_data || {}).group_members })),
}));

// 3. unjoin Kitchen → unjoin at the MEMBER
await p.evaluate(() => {
  [...document.querySelectorAll('.grprow[data-ent="media_player.sonos_kitchen"] .gjoin')][0]?.click();
});
await p.waitForTimeout(150);
r.unjoin = await p.evaluate(() => ({
  kitchenOn: document.querySelector('.grprow[data-ent="media_player.sonos_kitchen"]').classList.contains('on'),
  call: window._calls.filter(c => c.service === 'unjoin').map(c =>
    ({ target: c.target?.entity_id ?? c.service_data?.entity_id })),
}));

// 4. group volume: porch 0.30 + deck (joined at 0.70). Drag to ~0.80:
//    avg 0.50 → delta +0.30 → porch 0.60, deck 1.00 (clamped). Kitchen
//    (unjoined, 0.50) must be untouched.
await p.evaluate(() => { window._calls.length = 0; });
await p.evaluate(() => {
  const sl = document.querySelector('.grpvol .sldr');
  const r2 = sl.getBoundingClientRect();
  const x = r2.left + r2.width * 0.8, y = r2.top + r2.height / 2;
  sl.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
  sl.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
});
await p.waitForTimeout(200);
r.groupVol = await p.evaluate(() => ({
  sets: window._calls.filter(c => c.service === 'volume_set').map(c =>
    ({ ent: c.target?.entity_id ?? c.service_data?.entity_id, v: c.service_data.volume_level })),
}));

// 4b. INLINE EXPAND ("Click to show them"): no volume rows out by
//     default; tapping a name reveals that member's [−][track %][+]
//     row; its slider sets ONLY that member; second tap hides it.
r.expand = await p.evaluate(() => ({
  hiddenAtRest: [...document.querySelectorAll('.rslrow')]
    .every(x => x.style.display === 'none'),
}));
await p.evaluate(() => {
  document.querySelector('.grprow[data-ent="media_player.sonos_deck"] .gname')?.click();
});
await p.waitForTimeout(200);
r.expand.afterTap = await p.evaluate(() => {
  const rr = document.querySelector('.rslrow[data-row="media_player.sonos_deck"]');
  return { shown: rr?.style.display !== 'none',
    pct: rr?.querySelector('.rslpct')?.textContent };
});
await p.evaluate(() => { window._calls.length = 0; });
await p.evaluate(() => {
  const rs = document.querySelector('.rslrow[data-row="media_player.sonos_deck"] .sldr.rowsl');
  const r2 = rs.getBoundingClientRect();
  const x = r2.left + r2.width * 0.5, y = r2.top + r2.height / 2;
  rs.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
  rs.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
});
await p.waitForTimeout(200);
r.expand.sets = await p.evaluate(() =>
  window._calls.filter(c => c.service === 'volume_set').map(c =>
    ({ ent: c.target?.entity_id ?? c.service_data?.entity_id, v: c.service_data.volume_level })));
await p.evaluate(() => {
  document.querySelector('.grprow[data-ent="media_player.sonos_deck"] .gname')?.click();
});
await p.waitForTimeout(200);
r.expand.hiddenAgain = await p.evaluate(() =>
  document.querySelector('.rslrow[data-row="media_player.sonos_deck"]')?.style.display === 'none');

// 5. VOLUME LINK: deck is joined; its vlink toggle is visible while
//    kitchen's (unjoined) is hidden. Unlink deck's volume, drag the
//    group slider → only the master gets volume_set; deck holds.
r.vlink = await p.evaluate(() => ({
  deckBtnShown: document.querySelector('.grprow[data-ent="media_player.sonos_deck"] .gvlink')?.style.display !== 'none',
  kitchenBtnHidden: document.querySelector('.grprow[data-ent="media_player.sonos_kitchen"] .gvlink')?.style.display === 'none',
}));
await p.evaluate(() => {
  document.querySelector('.grprow[data-ent="media_player.sonos_deck"] .gvlink')?.click();
});
await p.waitForTimeout(150);
r.vlink.deckLoose = await p.evaluate(() =>
  document.querySelector('.grprow[data-ent="media_player.sonos_deck"] .gvlink')
    ?.classList.contains('vloose'));
await p.evaluate(() => { window._calls.length = 0; });
await p.evaluate(() => {
  const sl = document.querySelector('.grpvol .sldr');
  const r2 = sl.getBoundingClientRect();
  const x = r2.left + r2.width * 0.4, y = r2.top + r2.height / 2;
  sl.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
  sl.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
});
await p.waitForTimeout(200);
r.vlink.sets = await p.evaluate(() =>
  window._calls.filter(c => c.service === 'volume_set').map(c =>
    ({ ent: c.target?.entity_id ?? c.service_data?.entity_id, v: c.service_data.volume_level })));
// relink → back in the ride
await p.evaluate(() => {
  document.querySelector('.grprow[data-ent="media_player.sonos_deck"] .gvlink')?.click();
  window._calls.length = 0;
});
await p.waitForTimeout(150);
await p.evaluate(() => {
  const sl = document.querySelector('.grpvol .sldr');
  const r2 = sl.getBoundingClientRect();
  const x = r2.left + r2.width * 0.5, y = r2.top + r2.height / 2;
  sl.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
  sl.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
});
await p.waitForTimeout(200);
r.vlink.relinkedEnts = await p.evaluate(() =>
  [...new Set(window._calls.filter(c => c.service === 'volume_set')
    .map(c => c.target?.entity_id ?? c.service_data?.entity_id))]);

console.log(JSON.stringify({ r, errs }, null, 1));
await b.close();
