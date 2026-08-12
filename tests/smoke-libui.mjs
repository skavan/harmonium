/* LIBRARY UI (v0.71) + ERROR SURFACING (v0.70.2) —
   design-library-ui.md §§2-3, built as steps 2+3 of §5's build order.

   · a failed call_service FLASHES HA's own error in the bar (the MA
     Spotify outage was invisible: every play failed, the UI showed
     nothing)
   · search row: caret in the query line, ⌫ on the keyboard (hold =
     clear all), exactly two row controls (⌨ + one close ✕)
   · the magnifier lives in band 1 (roots row), not the chip strip
   · the chip strip head is a VIEW TOGGLE: grid ⇄ dense list, sticky
     per category, persisted per remote profile */
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const r = {}; const errs = [];
const p = await (await b.newContext({ viewport: { width: 480, height: 800 } })).newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(700);

await p.evaluate(() => {
  document.getElementById('auth').classList.add('hidden');
  window._sent = [];
  S.connected = true;
  S.ws = { send: m => window._sent.push(JSON.parse(m)) };
  window._answer = (type, payload) => {
    const msg = window._sent.filter(m => m.type === type).pop();
    if (!msg) return false;
    const cb = S.pending.get(msg.id);
    if (!cb) return false;
    S.pending.delete(msg.id);
    cb(payload);
    return true;
  };
  CONFIG.controllers.t_lib = {
    name: 'Test Library', class: 'group', drawer: true,
    grid: { columns: 3 },
    context: { media_player: 'media_player.native_spk',
               search: 'media_player.ma_spk' },
    sections: [{ tiles: [{ id: 'lib', type: 'browse' }] }],
  };
  S.states.set('media_player.native_spk',
    { s: 'idle', a: { friendly_name: 'Basement' } });
  S.states.set('media_player.ma_spk', { s: 'idle', a: {} });
  localStorage.removeItem('hakr_views_default');
});

// ---- 1. A FAILED SERVICE CALL SAYS SO (v0.70.2) ----
await p.evaluate(() => {
  CONFIG.controllers.t_err = {
    name: 'Err', class: 'group',
    sections: [{ tiles: [
      { id: 'np', type: 'media', art: true, span: 2,
        entity: 'media_player.native_spk', icon: 'material:music_note',
        label: 'Now Playing' },
      { id: 'boom', type: 'preset', label: 'Boom',
      icon: 'material:report',
      action: { service: 'media_player.play_media',
        target: 'media_player.native_spk',
        data: { media_content_id: 'x', media_content_type: 'music' } } }] }],
  };
  navigate('controller:t_err', true);
});
await p.click('#tile_boom');
/* QUEUING (v0.73.3): between the tap and the player answering, the
   hero must SAY a play is in flight — named, pulsing */
r.queuing = await p.evaluate(() => {
  const el = document.getElementById('tile_np');
  return { cls: el.classList.contains('npqueue'),
    npt: el.querySelector('.npt').textContent,
    pending: !!S.pendingPlay };
});
await p.evaluate(() => window._answer('call_service', { success: false,
  error: { code: 'home_assistant_error',
    message: 'No playable item found to start playback' } }));
r.errFlash = await p.evaluate(() =>
  document.getElementById('screenName').textContent);
/* a FAILED play stops promising: hero honestly back to Idle */
r.queueCleared = await p.evaluate(() => ({
  cls: document.getElementById('tile_np').classList.contains('npqueue'),
  pending: !!S.pendingPlay }));
/* and a SUCCESSFUL play consumes the stamp when the state flips */
await p.click('#tile_boom');
await p.evaluate(() => {
  S.states.set('media_player.native_spk',
    { s: 'playing', a: { friendly_name: 'Basement', media_title: 'Song' } });
  renderStates();
});
r.queueConsumed = await p.evaluate(() => ({
  cls: document.getElementById('tile_np').classList.contains('npqueue'),
  pending: !!S.pendingPlay,
  npt: document.getElementById('tile_np').querySelector('.npt').textContent }));
await p.evaluate(() => {
  S.states.set('media_player.native_spk',
    { s: 'idle', a: { friendly_name: 'Basement' } });
});

// ---- search mode with results, for the row + view checks ----
const paint = () => p.evaluate(() => {
  const B = S.browse;
  B.qon = true; B.q = 'love'; B.qcat = ''; B.sub = [];
  B.qres = { q: 'love', items: [
    { title: 'A - One', media_class: 'track', media_content_type: 'music',
      media_content_id: 'spotify--Xy://track/T1', can_play: true,
      can_expand: false, children: [] },
    { title: 'B - Two', media_class: 'track', media_content_type: 'music',
      media_content_id: 'spotify--Xy://track/T2', can_play: true,
      can_expand: false, children: [] },
  ], capped: [] };
  navigate('controller:t_lib', true);
});
await paint();

// ---- 2. THE ROW HOLDS TWO CONTROLS; THE CARET SAYS WHERE ----
r.row = await p.evaluate(() => {
  const q = document.querySelector('#brbar .brq');
  return {
    caret: !!q.querySelector('.brqc'),
    buttons: q.querySelectorAll('button').length,      /* ⌨ + ✕ = 2 */
    rowBackspace: !!q.querySelector('[data-brk="<"], [data-brbs]'),
    clearX: !!q.querySelector('[data-brk="!"]'),
    closeX: !!q.querySelector('.brqx'),
    kbBackspace: !!document.querySelector('#brbar .brkb [data-brbs]'),
  };
});

// ---- 3. ⌫ taps delete one; HOLD clears all ----
await p.click('#brbar [data-brbs]');
r.afterTap = await p.evaluate(() => S.browse.q);        /* "lov" */
const bs = await p.locator('#brbar [data-brbs]').boundingBox();
await p.mouse.move(bs.x + bs.width / 2, bs.y + bs.height / 2);
await p.mouse.down();
await p.waitForTimeout(750);                            /* > 550ms hold */
await p.mouse.up();
r.afterHold = await p.evaluate(() => S.browse.q);       /* "" */

// ---- 4. THE MAGNIFIER IS IN BAND 1; the strip head is the view chip ----
await paint();
r.bands = await p.evaluate(() => ({
  rootsMag: !!document.querySelector('#brbar .brrow .brrootq'),
  chipMag: !!document.querySelector('#brbar .brchips .brchipq'),
  viewChip: !!document.querySelector('#brbar .brchips .brchipv'),
}));
await p.click('#brbar .brrootq');                       /* closes search */
r.magToggles = await p.evaluate(() => S.browse.qon === false);

// ---- 5. VIEW TOGGLE: grid ⇄ list, one column, per-category, persisted ----
await paint();
const shape = () => p.evaluate(() => {
  const first = document.querySelector('#grid .tile.brw');
  const host = first && first.parentElement;
  return {
    rows: document.querySelectorAll('#grid .tile.brw.row').length,
    cards: document.querySelectorAll('#grid .tile.brw:not(.row)').length,
    oneCol: !!host && host.classList.contains('secgrid') &&
      host.style.gridTemplateColumns.startsWith('repeat(1'),
  };
});
r.gridBefore = await shape();
await p.click('#brbar .brchipv');
r.listAfter = await shape();
r.persisted = await p.evaluate(() =>
  localStorage.getItem('hakr_views_default'));
/* a DIFFERENT category keeps its own choice — the tracks chip is
   sliced by qcat, whose view was never toggled */
await p.evaluate(() => { S.browse.qcat = 'track'; navigate(S.screen, true); });
r.otherCat = await shape();
await p.evaluate(() => { S.browse.qcat = ''; navigate(S.screen, true); });
await p.click('#brbar .brchipv');                       /* back to grid */
r.gridAgain = await shape();

console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close();
process.exit(errs.length ? 1 : 0);
