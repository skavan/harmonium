/* NAV MODES probe (2026-08-20 — Suresh: "We need to make this logic
   something that is configured … Seems like we have 3 or 4 'modes'
   of navigation"). Four modes, declared by widgets, overridable per
   tile (`nav`). Under test:
   · VALUE: volume ◀▶ nudge + OK mute; stepper (setpoint) ◀▶ nudge;
     light ◀▶ brightness + OK toggle; ▲▼ always walk;
   · OPTIONS: chips ◀▶ rove (no service call), OK commits the roved
     option, highlight drops when focus walks away;
   · ACTION override: a volume tile with nav:"action" walks on ◀▶;
   · SPKGRP AS TILES: member rows walk, OK = master-noop / unjoin /
     join, ◀▶ = that member's volume, Group Volume tile nudges the
     linked members and OK = unlink all. */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'home', screen_order: ['home'],
  global: { room: 'X', activity_select: 'select.x' },
  activities: {},
  remotes: { pad: { capabilities: ['physical_dpad', 'touch'] } },
  speaker_groups: { porch: { name: 'Porch', entities:
    ['media_player.a', 'media_player.b', 'media_player.c'] } },
  screens: {
    home: { name: 'Home', type: 'hub', grid: { columns: 1 }, sections: [{
      tiles: [{ id: 'h1', type: 'preset', label: 'Go', action: {} }] }] },
    ctl: { name: 'Ctl', type: 'hub', grid: { columns: 1 }, sections: [{
      tiles: [
        { id: 'v1', type: 'volume', entity: 'media_player.amp', label: 'Amp' },
        { id: 's1', type: 'stepper', kind: 'temperature', entity: 'climate.ac', label: 'Set' },
        { id: 'c1', type: 'chips', kind: 'hvac_mode', entity: 'climate.ac' },
        { id: 'l1', type: 'light', entity: 'light.x', label: 'Lamp' },
        { id: 'v2', type: 'volume', entity: 'media_player.amp', label: 'Plain', nav: 'action' },
        { id: 'p1', type: 'preset', label: 'End', action: {} },
      ] }] },
  },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 1400 } });
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
        /* seed on every (re)subscribe — screens re-subscribe as they
           change — until the test flips __noSeed before the spkgrp
           MUTATION stages: from there, re-subscribes must not
           resurrect state the optimistic joins/unjoins changed */
        if (window.__noSeed) return;
        reply({ type: 'event', id: msg.id, event: { a: {
          'media_player.amp': { s: 'playing', a: { volume_level: 0.5,
            is_volume_muted: false, supported_features: 3084 } },
          'climate.ac': { s: 'cool', a: { hvac_modes: ['off', 'cool', 'heat'],
            temperature: 70, current_temperature: 75 } },
          'light.x': { s: 'on', a: { brightness: 128 } },
          'media_player.a': { s: 'playing', a: { volume_level: 0.3,
            group_members: ['media_player.a', 'media_player.b'],
            friendly_name: 'A' } },
          'media_player.b': { s: 'playing', a: { volume_level: 0.5,
            friendly_name: 'B' } },
          'media_player.c': { s: 'idle', a: { volume_level: 0.7,
            friendly_name: 'C' } },
        } } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => {
  window._calls = [];
  window.callService = (d, s, data, t) =>
    { window._calls.push(d + '.' + s + '@' + (Array.isArray(t) ? t.join('+') : t)); };
});
const calls = () => p.evaluate(() => window._calls.splice(0));
const focus = () => p.evaluate(() => S.focusId);

const r = {};
await p.evaluate(() => navigate('ctl')); await p.waitForTimeout(300);

/* ---- VALUE: volume ---- */
await p.evaluate(() => setFocus('v1'));
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100);
r.volRight = { calls: await calls(), focus: await focus() };  /* volume_up, v1 */
await p.keyboard.press('Enter'); await p.waitForTimeout(100);
r.volOk = await calls();                                      /* volume_mute */
await p.keyboard.press('ArrowDown'); await p.waitForTimeout(100);
r.volDown = { calls: await calls(), focus: await focus() };   /* walk → s1 */

/* ---- VALUE: stepper (setpoint) ---- */
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100);
r.stepRight = await calls();                                  /* set_temperature */
await p.keyboard.press('ArrowDown'); await p.waitForTimeout(100);
r.stepWalk = await focus();                                   /* c1 */

/* ---- OPTIONS: chips ---- */
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(120);
r.chipRove = { calls: await calls(),                          /* [] — no commit */
  rove: await p.evaluate(() =>
    document.querySelector('#tile_c1 .chip.rove')?.dataset.ch) };  /* heat */
await p.keyboard.press('Enter'); await p.waitForTimeout(120);
r.chipCommit = await calls();                                 /* set_hvac_mode */
await p.keyboard.press('ArrowDown'); await p.waitForTimeout(150);
r.chipDrop = await p.evaluate(() =>
  document.querySelectorAll('#tile_c1 .chip.rove').length);   /* 0 */

/* ---- VALUE: light ---- */
r.lightFocus = await focus();                                 /* l1 */
await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(100);
r.lightLeft = await calls();                                  /* light.turn_on (dim) */
await p.keyboard.press('Enter'); await p.waitForTimeout(100);
r.lightOk = await calls();                                    /* light.toggle */

/* ---- ACTION override: nav:"action" volume walks on ◀▶ ---- */
await p.keyboard.press('ArrowDown'); await p.waitForTimeout(100);
r.v2Focus = await focus();                                    /* v2 */
await p.evaluate(() => { window._calls.length = 0; });
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100);
r.v2Right = { calls: await calls(), focus: await focus() };   /* [] · walked/paged */

/* ---- SPKGRP AS TILES ---- */
await p.evaluate(() => navigate('spkgrp:porch')); await p.waitForTimeout(300);
r.sgTiles = await p.evaluate(() =>
  [...document.querySelectorAll('#grid .tile')].map(x => x.id));
r.sgFocus = await focus();                                    /* sgm_media_player.a */
await p.evaluate(() => { window.__noSeed = 1; });   /* mutations begin */
r.sgLabels = await p.evaluate(() =>
  [...document.querySelectorAll('#grid .tile .lbl')]
    .map(x => x.textContent).slice(0, 4));  /* A B C Group volume */
await p.keyboard.press('Enter'); await p.waitForTimeout(100);
r.sgMasterOk = await calls();                                 /* [] — master noop */
await p.keyboard.press('ArrowDown'); await p.waitForTimeout(100);
r.sgWalk = await focus();                                     /* sgm_…b */
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100);
r.sgMemVol = await calls();                                   /* volume_up@b */
await p.keyboard.press('Enter'); await p.waitForTimeout(100);
r.sgUnjoin = await calls();                                   /* unjoin@b */
await p.keyboard.press('ArrowDown'); await p.waitForTimeout(100);
await p.keyboard.press('Enter'); await p.waitForTimeout(100);
r.sgJoin = await calls();                                     /* join@a {c} */
await p.keyboard.press('ArrowDown'); await p.waitForTimeout(150);
r.sgVolFocus = await focus();                                 /* sgv_porch */
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100);
r.sgVolNudge = await calls();                                 /* volume_set a + c */
await p.keyboard.press('Enter'); await p.waitForTimeout(100);
r.sgUnlinkAll = await calls();                                /* unjoin@c */

console.log(JSON.stringify({ ...r,
  ok: JSON.stringify(r.volRight.calls) === '["media_player.volume_up@media_player.amp"]' &&
      r.volRight.focus === 'v1' &&
      JSON.stringify(r.volOk) === '["media_player.volume_mute@media_player.amp"]' &&
      r.volDown.calls.length === 0 && r.volDown.focus === 's1' &&
      JSON.stringify(r.stepRight) === '["climate.set_temperature@climate.ac"]' &&
      r.stepWalk === 'c1' &&
      r.chipRove.calls.length === 0 && r.chipRove.rove === 'heat' &&
      JSON.stringify(r.chipCommit) === '["climate.set_hvac_mode@climate.ac"]' &&
      r.chipDrop === 0 &&
      r.lightFocus === 'l1' &&
      JSON.stringify(r.lightLeft) === '["light.turn_on@light.x"]' &&
      JSON.stringify(r.lightOk) === '["light.toggle@light.x"]' &&
      r.v2Focus === 'v2' &&
      r.v2Right.calls.length === 0 &&
      JSON.stringify(r.sgTiles) === JSON.stringify(
        ['tile_sgm_media_player.a', 'tile_sgm_media_player.b',
         'tile_sgm_media_player.c', 'tile_sgv_porch']) &&
      r.sgFocus === 'sgm_media_player.a' &&
      JSON.stringify(r.sgLabels) === '["A","B","C","Group volume"]' &&
      r.sgMasterOk.length === 0 &&
      r.sgWalk === 'sgm_media_player.b' &&
      JSON.stringify(r.sgMemVol) === '["media_player.volume_up@media_player.b"]' &&
      JSON.stringify(r.sgUnjoin) === '["media_player.unjoin@media_player.b"]' &&
      JSON.stringify(r.sgJoin) === '["media_player.join@media_player.a"]' &&
      r.sgVolFocus === 'sgv_porch' &&
      r.sgVolNudge.length === 2 &&
      r.sgVolNudge.every(c => c.startsWith('media_player.volume_set@')) &&
      JSON.stringify(r.sgUnlinkAll) === '["media_player.unjoin@media_player.c"]' &&
      errs.length === 0,
  errs }, null, 1));
await b.close();
