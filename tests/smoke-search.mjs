/* SEARCH SOURCES (v0.69) — search is a ROLE, not an entity pinned
   inside a stock controller (Suresh: "It's hardcoding a device inside
   a stock controller. This should be provided by context").

   Proves the resolution order in docs/design-search-sources.md:
     explicit search.entity  > `search: false` > $context.search > none
   and the registry derivation that removes `config_entry` from config.

   Self-contained: builds its own browse controller rather than
   leaning on whichever house config happens to be in dist/. */
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const r = {}; const errs = [];
const p = await (await b.newContext({ viewport: { width: 480, height: 800 } })).newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(700);

/* a fake socket that RECORDS and lets the test answer, so the
   registry round-trip can be driven deterministically */
await p.evaluate(() => {
  document.getElementById('auth').classList.add('hidden');
  window._sent = [];
  S.connected = true;
  S.ws = { send: m => window._sent.push(JSON.parse(m)) };
  window._answer = (type, result) => {
    const msg = window._sent.filter(m => m.type === type).pop();
    if (!msg) return false;
    const cb = S.pending.get(msg.id);
    if (!cb) return false;
    S.pending.delete(msg.id);
    cb({ success: true, result });
    return true;
  };
  /* a browse surface of our own, with a default context we control */
  CONFIG.controllers.t_lib = {
    name: 'Test Library', class: 'group', drawer: true,
    grid: { columns: 3 },
    context: { media_player: 'media_player.native_spk' },
    sections: [{ tiles: [{ id: 'lib', type: 'browse' }] }],
  };
  S.states.set('media_player.native_spk', { s: 'idle', a: {} });
  S.states.set('media_player.ma_spk', { s: 'idle', a: {} });
  S.states.set('media_player.pinned', { s: 'idle', a: {} });
});
const tile = () => p.evaluate(() =>
  CONFIG.controllers.t_lib.sections[0].tiles[0]);
const go = () => p.evaluate(async () => {
  S.browse.reg = {}; S.browse.regReq = {};   /* fresh registry each case */
  navigate('controller:t_lib', true);
  return {
    qmp: S.browse.qmp,
    qentry: S.browse.qentry,
    qengine: S.browse.qengine,
    chip: !!document.querySelector('#brbar .brrootq'),  /* v0.71: magnifier lives in band 1 */
  };
});
const setCtx = (v) => p.evaluate((val) => {
  if (val === null) delete CONFIG.controllers.t_lib.context.search;
  else CONFIG.controllers.t_lib.context.search = val;
}, v);
const setTile = (v) => p.evaluate((val) => {
  const t = CONFIG.controllers.t_lib.sections[0].tiles[0];
  if (val === null) delete t.search; else t.search = val;
}, v);

// 1. BARE TILE, ROLE UNWIRED -> no search. The honest empty case: a
//    stock controller that names nothing and a house that hasn't said
//    who can answer offers no magnifier at all.
await setCtx(null); await setTile(null);
r.unwired = await go();

// 2. BARE TILE + $context.search -> the role drives it. This is the
//    whole point: zero entity ids in the controller.
await setCtx('media_player.ma_spk');
r.role = await go();

// 3. `search: false` is the per-surface off switch — the role stays
//    wired, this page just doesn't offer it (the Mediocre card's
//    search_enabled, which Suresh runs true on one dashboard and
//    false on another).
await setTile(false);
r.offSwitch = await go();

// 4. An explicit entity still wins — a custom controller may pin one,
//    and Jamaica's live config does exactly that.
await setTile({ entity: 'media_player.pinned' });
r.explicit = await go();

// 5. REGISTRY DERIVATION: config_entry and engine are no longer
//    authored. The lookup answers both; an MA platform lifts the
//    5-per-class ceiling by naming the config entry.
await setTile(null); await setCtx('media_player.ma_spk');
await p.evaluate(() => { S.browse.reg = {}; S.browse.regReq = {}; navigate('controller:t_lib', true); });
await p.waitForTimeout(60);
r.registryAsked = await p.evaluate(() => {
  const m = window._sent.filter(x => x.type === 'config/entity_registry/get').pop();
  return m ? m.entity_id : null;
});
await p.evaluate(() => window._answer('config/entity_registry/get', {
  entity_id: 'media_player.ma_spk', platform: 'music_assistant',
  config_entry_id: 'ENTRY123',
}));
await p.waitForTimeout(150);
r.derived = await p.evaluate(() => ({
  qentry: S.browse.qentry, qengine: S.browse.qengine, qmp: S.browse.qmp,
}));

// 6. a NON-MA platform must not be handed MA's config entry — it
//    falls through to the standard contract instead
await p.evaluate(() => {
  S.browse.reg = {}; S.browse.regReq = {};
  CONFIG.controllers.t_lib.context.search = 'media_player.native_spk';
  navigate('controller:t_lib', true);
});
await p.waitForTimeout(60);
await p.evaluate(() => window._answer('config/entity_registry/get', {
  entity_id: 'media_player.native_spk', platform: 'sonos', config_entry_id: 'SONOSENTRY',
}));
await p.waitForTimeout(150);
r.nonMa = await p.evaluate(() => ({
  qentry: S.browse.qentry, qengine: S.browse.qengine,
}));

// 6b. THE CHIP ITSELF. browseBar renders nothing until the tree has
//     landed (B.ui null = empty bar), so answer the root once and then
//     check that a wired role really does put the magnifier on screen —
//     and that an unwired one really doesn't.
const withTree = async () => {
  await p.evaluate(() => {
    S.browse.nodes = {}; S.browse.reg = {}; S.browse.regReq = {};
    navigate('controller:t_lib', true);
  });
  await p.waitForTimeout(60);
  await p.evaluate(() => window._answer('media_player/browse_media', {
    title: 'Root', media_class: 'directory', media_content_type: 'root',
    media_content_id: '', can_expand: true, can_play: false,
    children: [
      { title: 'Favorites', media_class: 'directory', media_content_type: 'favorites',
        media_content_id: '', can_expand: true, can_play: false },
      { title: 'Music Library', media_class: 'directory', media_content_type: 'library',
        media_content_id: '', can_expand: true, can_play: false },
    ],
  }));
  await p.waitForTimeout(200);
  return p.evaluate(() => ({
    chip: !!document.querySelector('#brbar .brrootq'),  /* v0.71: magnifier lives in band 1 */
    qmp: S.browse.qmp,
  }));
};
await setTile(null); await setCtx('media_player.ma_spk');
r.chipWired = await withTree();
await setCtx(null);
r.chipUnwired = await withTree();

// 7. an explicit config_entry still overrides the lookup
await setTile({ config_entry: 'HANDWRITTEN' });
await setCtx('media_player.ma_spk');
r.explicitEntry = await go();

// 8. SCOPE (v0.69) — the two waves made visible. "My library" fires
//    ONLY the library_only wave; "Everything" fires both. Shown only
//    on the deep MA path, because the generic contract has no
//    library_only to offer.
await p.evaluate(() => {
  const t = CONFIG.controllers.t_lib.sections[0].tiles[0];
  t.search = { entity: 'media_player.ma_spk', engine: 'music_assistant',
               config_entry: 'E1', classes: ['track'] };
  S.browse.reg = {}; S.browse.regReq = {}; S.browse.qon = false;
  navigate('controller:t_lib', true);
  brSearchToggle();                      /* open search */
  window._sent.length = 0;
  S.browse.qscope = 'all';
  S.browse.q = 'love';          /* brScope re-runs only a live query */
  brSearchRun('love');
});
await p.waitForTimeout(120);
r.scopeAll = await p.evaluate(() => window._sent
  .filter(m => m.type === 'call_service' && m.service === 'search')
  .map(m => m.service_data.library_only));
await p.evaluate(() => { window._sent.length = 0; brScope('lib'); });
await p.waitForTimeout(120);
r.scopeLib = await p.evaluate(() => window._sent
  .filter(m => m.type === 'call_service' && m.service === 'search')
  .map(m => m.service_data.library_only));
r.scopeUi = await p.evaluate(() => ({
  buttons: [...document.querySelectorAll('#brbar .brscb')].map(b => b.textContent),
  on: document.querySelector('#brbar .brscb.on')?.textContent,
}));
// the generic contract offers no scope control
await p.evaluate(() => {
  const t = CONFIG.controllers.t_lib.sections[0].tiles[0];
  t.search = { entity: 'media_player.native_spk', engine: 'sonos' };
  navigate('controller:t_lib', true);
});
await p.waitForTimeout(100);
r.scopeHiddenGeneric = await p.evaluate(() =>
  document.querySelectorAll('#brbar .brscb').length);

// 9. THE HEARTBEAT (v0.75): results on screen + waves still out →
//    a slim pulsing tail row says the well is still filling; the
//    render that clears qbusy takes it away. And the per-screen size
//    knobs (grid.tile_h / row_h) pin the CSS vars on #grid — and
//    never leak to a screen that doesn't declare them.
await p.evaluate(() => {
  const B = S.browse;
  B.qon = true; B.q = 'love'; B.qcat = ''; B.sub = [];
  B.qres = { q: 'love', items: [{ title: 'Love Songs',
    media_class: 'playlist', media_content_type: 'playlist',
    media_content_id: 'library://playlist/9', can_play: true }], capped: [] };
  B.qbusy = true;
  CONFIG.controllers.t_lib.grid = { columns: 3, tile_h: 120, row_h: 64 };
  navigate('controller:t_lib', true);
});
r.heartbeat = await p.evaluate(() => {
  const el = document.getElementById('tile_lib_qs');
  const g = document.getElementById('grid');
  return { present: !!el, slim: el && el.classList.contains('qtail'),
    varTile: g.style.getPropertyValue('--tile-h'),
    varRow: g.style.getPropertyValue('--tile-row-h') };
});
await p.evaluate(() => { S.browse.qbusy = false; navigate(S.screen, true); });
r.heartbeatGone = await p.evaluate(() =>
  !document.getElementById('tile_lib_qs'));
r.sizeNoLeak = await p.evaluate(() => {
  delete CONFIG.controllers.t_lib.grid.tile_h;
  delete CONFIG.controllers.t_lib.grid.row_h;
  navigate('controller:t_lib', true);
  const g = document.getElementById('grid');
  return !g.style.getPropertyValue('--tile-h') &&
    !g.style.getPropertyValue('--tile-row-h');
});

r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
