/* ENTITY-CONTROLS PHASE 3 probe (2026-08-31): card groups × focus —
   the probe sketches of design-card-group-focus.md, made real.
     §1 grid occupancy — same-group tiles of one section merge into
        ONE .cardgrp at the anchor's position, authored order held,
        an interloper between them notwithstanding; a no-row-form
        member (media) renders standalone despite its card_group.
     §2 spatialMove entry — ▼ from above lands on the FIRST member;
        ▼ walks member to member; ▼ off the last member exits.
     §3 focus ring — .focused sits on the member tile, never the
        wrapper.
     §4 capture interplay — a stepper member takes ◀ as a nudge
        (service call, focus unmoved), identical to standalone.
     §5 reflow — an options-less member is filtered STRUCTURALLY
        (visibleTile widget self-suppression): no element, no wrapper,
        no chrome; the renderStates guard additionally hides a card
        whose members all carry .hidden at runtime (defensive depth).
   Plus: presApply carries present.card_group into generated tiles. */
import { chromium } from 'playwright-core';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

const CONFIG = {
  version: 2, home_screen: 'porch', screen_order: ['porch'],
  global: { room: 'Porch', activity_select: 'select.harmonium_porch_activity' },
  devices: {}, dialects: {},
  activities: { music: { name: 'Music', room_view: 'porch',
    context: { volume: 'media_player.tv' },
    present: { 'media_player.tv': { card_group: 'tone' } },
    screen: 'controller:music' } },
  screens: { porch: { name: 'Porch', type: 'hub', room: true,
    activity_select: 'select.harmonium_porch_activity',
    sections: [{ hero_label: 'Controls', tiles: [
      { id: 't0', type: 'device', entity: 'sensor.temp', label: 'Temp', span: 2 },
      { id: 'g1', type: 'volume', variant: 'stepper', entity: 'media_player.tv',
        card_group: 'tone', label: 'Vol', span: 2 },
      { id: 'g2', type: 'number', entity: 'number.bass', variant: 'stepper',
        card_group: 'tone', label: 'Bass', span: 2 },
      { id: 'mid', type: 'device', entity: 'switch.amp', label: 'Amp', span: 2 },
      { id: 'g3', type: 'select', entity: 'select.mode',
        card_group: 'tone', label: 'Mode', span: 2 },
      { id: 'np', type: 'media', entity: 'media_player.tv',
        card_group: 'tone', label: 'Now Playing', span: 2 },
      { id: 'lone', type: 'select', variant: 'chips', entity: 'select.empty',
        card_group: 'opts', label: 'Empty', span: 2 },
    ] }] } },
  controllers: { music: { name: 'Music', type: 'controller', class: 'activity',
    view_kind: 'controller', tiles: [{ id: 'vb', type: 'volumes', span: 2 }] } },
};
const STATES = {
  'media_player.tv': { s: 'on', a: { friendly_name: 'TV',
    supported_features: 4, volume_level: 0.5 } },
  'sensor.temp': { s: '21', a: { friendly_name: 'Temp' } },
  'switch.amp': { s: 'on', a: { friendly_name: 'Amp' } },
  'number.bass': { s: '0', a: { min: -10, max: 10, step: 1, mode: 'box' } },
  'select.mode': { s: 'movie', a: { options: ['music', 'movie'] } },
  'select.empty': { s: 'unknown', a: { options: [] } },
  'select.harmonium_porch_activity': { s: 'music', a: { options: ['music', 'off'] } },
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript((STATES) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window._calls = [];
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

/* ---- §1 grid occupancy ---- */
const dom = await p.evaluate(() => {
  const wrapOf = (id) => { const el = document.getElementById('tile_' + id);
    return el && el.parentElement.classList.contains('cardgrp')
      ? el.parentElement : null; };
  const w1 = wrapOf('g1');
  return {
    sameWrap: !!w1 && wrapOf('g2') === w1 && wrapOf('g3') === w1,
    order: w1 ? [...w1.querySelectorAll('.tile')].map(x => x.id).join(',') : null,
    npStandalone: !wrapOf('np'),
    wraps: document.querySelectorAll('.cardgrp').length,
    /* the card sits at the ANCHOR's position: before the interloper */
    anchorFirst: (() => { const host = w1 && w1.parentElement;
      if (!host) return false;
      const kids = [...host.children];
      return kids.indexOf(w1) < kids.indexOf(document.getElementById('tile_mid'));
    })(),
  };
});
ck('§1 same-group members share ONE .cardgrp', dom.sameWrap);
ck('§1 authored order holds inside the card (g1,g2,g3)',
  dom.order === 'tile_g1,tile_g2,tile_g3');
ck('§1 the card anchors at the FIRST member, before the interloper',
  dom.anchorFirst);
ck('§1 a no-row-form member (Now Playing) renders standalone',
  dom.npStandalone);
ck('§1 exactly one card renders (the empty opts group builds NO chrome)',
  dom.wraps === 1);

/* ---- §2 spatialMove entry + walk ---- */
await p.evaluate(() => setFocus('t0'));
const walk = [];
for (let i = 0; i < 4; i++) {
  await p.evaluate(() => spatialMove('down'));
  walk.push(await p.evaluate(() => S.focusId));
}
ck('§2 ▼ from above enters at the FIRST member, walks the card, and exits',
  walk.join(',') === 'g1,g2,g3,mid');

/* ---- §3 the ring ---- */
const ring = await p.evaluate(() => {
  setFocus('g2');
  const el = document.getElementById('tile_g2');
  return { member: el.classList.contains('focused'),
    wrapper: el.parentElement.classList.contains('focused') };
});
ck('§3 .focused sits on the member row', ring.member);
ck('§3 the wrapper never takes focus', !ring.wrapper);

/* ---- §4 value grammar inside the card ---- */
await p.evaluate(() => { window._calls.length = 0; setFocus('g1'); });
await p.evaluate(() => WIDGETS.stepper.keys.left('media_player.tv', tileDef('g1')));
await p.waitForTimeout(80);
const cap = await p.evaluate(() => ({
  calls: window._calls.map(c => c.service), focus: S.focusId }));
ck('§4 ◀ on a stepper member nudges (service fires), focus unmoved',
  cap.calls.join(',') === 'volume_set' && cap.focus === 'g1');

/* ---- §5 reflow ---- */
const empty = await p.evaluate(() => {
  const structural = !document.getElementById('tile_lone');
  /* runtime guard: force every tone member hidden, run renderStates,
     read the wrapper; then restore and read again */
  const w = document.getElementById('tile_g1').parentElement;
  ['g1', 'g2', 'g3'].forEach(id =>
    document.getElementById('tile_' + id).classList.add('hidden'));
  renderStates();
  const hiddenWhenEmpty = w.classList.contains('hidden');
  ['g1', 'g2', 'g3'].forEach(id =>
    document.getElementById('tile_' + id).classList.remove('hidden'));
  renderStates();
  return { structural, hiddenWhenEmpty,
    shownAgain: !w.classList.contains('hidden') };
});
ck('§5 an options-less member is filtered structurally (no element, no chrome)',
  empty.structural);
ck('§5 the runtime guard hides a card whose members are all hidden',
  empty.hiddenWhenEmpty);
ck('§5 the card returns when a member does', empty.shownAgain);

/* ---- presApply: card_group rides into generated band tiles ---- */
await p.evaluate(() => navigate('controller:music'));
await p.waitForTimeout(300);
const gen = await p.evaluate(() => tileDef('vb_media_player_tv'));
ck('present.card_group reaches the generated volume tile',
  !!gen && gen.card_group === 'tone');

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
