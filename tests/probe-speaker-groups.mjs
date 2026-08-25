/* SPEAKER GROUPS probe (v0.83.7 — Suresh: "I can create a Group like
   Outdoor Music Players and put all my ma_players in that").
   Asserts: a named CONFIG.speaker_groups collection + the activity's
   surface.speakers_group turns the speakers band into a LAUNCHER
   ("3 available · 0 linked", lit when any member links) · select
   opens the generated spkgrp: screen — full grouping card, one trim
   slider per player, master row anchored · joining a member fires
   media_player.join at the ACTIVITY's master (the "receiver is just
   an amp" case: the master is not in the group) · a trim drag hits
   ONLY that member · inline mode renders the card in place · with
   nothing running, the master falls back to the coordinating member.

   SHAPE NOTE (2026-08-24): the spkgrp: screen stopped rendering one
   mega-card in the 2026-08-20 tile round ("Each row should behave as a
   tile") — it now generates ONE TILE PER MEMBER (grpmember,
   id="tile_sgm_<entity>") plus a Group Volume tile (grpvol, hidden
   until 2+ are joined). This probe asserted the retired .grprow
   mega-card and had been red since; the assertions below now read the
   tile shape. The INLINE card on the music controller (step 6) is
   deliberately untouched and still a mega-card. */
import { chromium } from 'playwright-core';

const STATES = {
  'media_player.ma_living': { s: 'playing', a: {
    friendly_name: 'Living Room MA', volume_level: 0.5,
    group_members: ['media_player.ma_living'], supported_features: 84351 } },
  'media_player.ma_deck': { s: 'idle', a: {
    friendly_name: 'Deck', volume_level: 0.30, group_members: [],
    supported_features: 84351 } },
  'media_player.ma_patio': { s: 'idle', a: {
    friendly_name: 'Patio', volume_level: 0.60, group_members: [],
    supported_features: 84351 } },
  'media_player.ma_pool': { s: 'idle', a: {
    friendly_name: 'Pool', volume_level: 0.40, group_members: [],
    supported_features: 84351 } },
  'select.harmonium_den_activity': { s: 'listen', a: { options: ['listen', 'off'] } },
};
const CONFIG = {
  version: 2, home_screen: 'den', screen_order: ['den'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  devices: {},
  speaker_groups: {
    outdoor: { name: 'Outdoor Music Players',
      entities: ['media_player.ma_deck', 'media_player.ma_patio', 'media_player.ma_pool'] },
  },
  activities: { listen: { name: 'Listen', room_view: 'den',
    context: { media_player: 'media_player.ma_living', volume: 'media_player.ma_living' },
    surface: { speakers_group: 'outdoor' },
    screen: 'controller:music4' } },
  screens: { den: { name: 'Den', type: 'hub', room: true,
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'den' }] }] } },
  controllers: { music4: { name: 'Music', type: 'controller', class: 'activity',
    view_kind: 'controller',
    control_target: { label: '$activity.name', volume: '$context.volume', pass_through: [] },
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
  /* the mock serves from window._STATES so a test stage can mutate
     "HA" and have the next re-subscribe deliver the mutation instead
     of silently reverting it */
  window._STATES = STATES;
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        const a = {}; (msg.entity_ids || []).forEach(e => {
          if (window._STATES[e]) a[e] = window._STATES[e]; });
        reply({ type: 'event', id: msg.id, event: { a } });
      } else { if (msg.type === 'call_service') window._calls.push(msg);
        reply({ type: 'result', id: msg.id, success: true, result: null }); }
    }
    close() {}
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => navigate('controller:music4'));
await p.waitForTimeout(500);

const r = {};
// 1. launcher renders with the count line; no inline card on the surface
r.launcher = await p.evaluate(() => {
  const w = document.querySelector('.tile.wgt-grouplaunch');
  return {
    tile: !!w,
    label: w?.querySelector('.lbl')?.textContent,
    sub: w?.querySelector('.sub.subin, .sub')?.textContent,
    lit: w?.classList.contains('on'),
    inlineCardAbsent: !document.querySelector('.tile.wgt-grouping'),
  };
});

// 2. select → the generated spkgrp screen: card + per-player sliders
await p.evaluate(() => navigate('spkgrp:outdoor'));
await p.waitForTimeout(400);
r.screen = await p.evaluate(() => {
  const tiles = [...document.querySelectorAll('.tile.wgt-grpmember')];
  return {
    /* one real tile per member, id'd by entity */
    tiles: tiles.length,
    ids: tiles.map(t => t.id),
    rows: tiles.map(t => ({ ent: t.id.replace('tile_sgm_', ''),
      name: t.querySelector('.lbl').textContent,
      lvl: t.querySelector('.rslpct').textContent })),
    trims: tiles.map(t => ({ ent: t.id.replace('tile_sgm_', ''),
      fill: t.querySelector('.sldr.inrow > i').style.width })),
    title: document.querySelector('.btitle')?.textContent,
    /* every member row carries its own join control */
    allJoinable: tiles.every(t => !!t.querySelector('.gjoin')),
    /* the mega-card is NOT how this screen renders any more */
    noMegaCard: !document.querySelector('.tile.wgt-grouping'),
    /* group volume stays hidden until 2+ are actually joined */
    grpvolHidden: !document.querySelector('.tile.wgt-grpvol:not([style*="display: none"])'),
    focused: document.querySelector('.tile.focused')?.id,
  };
});

// 2b. the volume row: % rides INSIDE the track; −/+ nudge THAT member
r.volrow = await p.evaluate(() => {
  const t = document.getElementById('tile_sgm_media_player.ma_patio');
  return { pctInTrack: t?.querySelector('.volrow .sldr.inrow .rslpct')?.textContent,
    btns: t?.querySelectorAll('.volrow .dpbtn').length };
});
await p.evaluate(() => { window._calls.length = 0;
  document.querySelector('#tile_sgm_media_player\\.ma_patio .volrow .dpbtn[data-vol="up"]')?.click(); });
await p.waitForTimeout(150);
r.volrow.nudge = await p.evaluate(() =>
  window._calls.filter(c => /^volume_(up|set)$/.test(c.service)).map(c =>
    c.target?.entity_id ?? c.service_data?.entity_id));

// 3. join Deck → media_player.join at the ACTIVITY's master (ma_living,
//    which is NOT in the group)
/* deckOn is sampled SYNCHRONOUSLY with the click: the toggle is
   optimistic (paints joined before HA answers), and this mock never
   echoes a service call back — its next re-subscribe re-serves
   _STATES, where ma_living is still alone, so the optimistic paint is
   reverted a few hundred ms later. Real HA echoes the join. Sampling
   late is what made the old assertion read false. */
r.join = await p.evaluate(() => {
  document.querySelector('#tile_sgm_media_player\\.ma_deck .gjoin')?.click();
  return {
    call: window._calls.filter(c => c.service === 'join').map(c =>
      ({ target: c.target?.entity_id ?? c.service_data?.entity_id,
         members: (c.service_data || {}).group_members })),
    deckOn: document.getElementById('tile_sgm_media_player.ma_deck')
      ?.classList.contains('on'),
  };
});
await p.waitForTimeout(150);

// 4. trim Patio to ~80% → volume_set ONLY on patio
await p.evaluate(() => { window._calls.length = 0; });
await p.evaluate(() => {
  const rs = document.querySelector('#tile_sgm_media_player\\.ma_patio .sldr.inrow');
  const r2 = rs.getBoundingClientRect();
  const x = r2.left + r2.width * 0.8, y = r2.top + r2.height / 2;
  rs.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
  rs.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
});
await p.waitForTimeout(200);
r.trim = await p.evaluate(() => ({
  sets: window._calls.filter(c => c.service === 'volume_set').map(c =>
    ({ ent: c.target?.entity_id ?? c.service_data?.entity_id, v: c.service_data.volume_level })),
}));

// 5. launcher count is live: "HA" now reports deck in the master's
//    group → back on the controller, "3 available · 1 linked", lit
await p.evaluate(() => {
  window._STATES['media_player.ma_living'].a.group_members =
    ['media_player.ma_living', 'media_player.ma_deck'];
  navigate('controller:music4');
});
await p.waitForTimeout(400);
r.counted = await p.evaluate(() => {
  const w = document.querySelector('.tile.wgt-grouplaunch');
  return { sub: w?.querySelector('.sub.subin, .sub')?.textContent,
    lit: w?.classList.contains('on') };
});

// 6. inline mode: surface.speakers_mode = "inline" → the full card in
//    place of the launcher, fed by the group
await p.evaluate(() => {
  CONFIG.activities.listen.surface.speakers_mode = 'inline';
  navigate('den'); navigate('controller:music4');
});
await p.waitForTimeout(400);
r.inline = await p.evaluate(() => {
  const w = document.querySelector('.tile.wgt-grouping');
  return { card: !!w, launcherGone: !document.querySelector('.tile.wgt-grouplaunch'),
    rowEnts: [...(w?.querySelectorAll('.grprow') || [])].map(x => x.dataset.ent) };
});

// 7. NO activity anywhere (a hand-authored launcher on a plain hub —
//    presumption has nothing to offer) → the spkgrp screen still
//    works; master falls back to the coordinating member (pool heads
//    its own group), and joining fires there
await p.evaluate(() => {
  CONFIG.activities = {};
  window._STATES['media_player.ma_pool'].a.group_members =
    ['media_player.ma_pool', 'media_player.ma_patio'];
  window._STATES['media_player.ma_patio'].a.group_members =
    ['media_player.ma_pool', 'media_player.ma_patio'];
  window._calls.length = 0;
  navigate('den'); navigate('spkgrp:outdoor');
});
await p.waitForTimeout(400);
await p.evaluate(() => {
  document.querySelector('#tile_sgm_media_player\\.ma_deck .gjoin')?.click();
});
await p.waitForTimeout(150);
r.fallback = await p.evaluate(() => ({
  masterRow: [...document.querySelectorAll('.tile.wgt-grpmember')]
    .find(t => /master/i.test(t.querySelector('.sub')?.textContent || ''))
    ?.id.replace('tile_sgm_', ''),
  joinTarget: window._calls.filter(c => c.service === 'join').map(c =>
    c.target?.entity_id ?? c.service_data?.entity_id),
}));

console.log(JSON.stringify({ r, errs }, null, 1));
await b.close();
