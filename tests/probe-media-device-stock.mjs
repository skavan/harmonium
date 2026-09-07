/* MEDIA DEVICE STOCK fence (2026-09-04 — Suresh, right after device
   takeover shipped: "demand will be immediate because we gave the
   user the control over devices that he wanted but he has no way of
   editing it"). The media player's device page becomes the sixth
   domain stock instead of engine law:
   · TWIN PARITY: a config carrying the stock renders the same page,
     tile for tile, as the hard-coded DETAIL_TILES fallback — ids,
     order, types, the slim NP, the Apps trailing;
   · EDITABLE: a user edit on the stock (hidden, style, order) is
     honored on the generated page — the whole point;
   · PER-DEVICE COPY: a variant_of copy wins for ITS entity only;
   · TAKEOVER UNTOUCHED: own_context / control_target / the strip
     apply the same on the stock path. */
import { chromium } from 'playwright-core';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

/* the stock, exactly as stocklib plants it (domain extras applied) */
const MP_STOCK = { name: 'Media Device', gen: 2, domain: 'media_player',
  class: 'activity', view_kind: 'controller', type: 'controller',
  tiles: [
    { id: 'dp', type: 'power', entity: '$device', label: '', span: 2 },
    /* gen 2 (feedback-3 #4): art NP, fat-slider volume */
    { id: 'dnp', type: 'media', style: 'art', entity: '$device',
      icon: 'material:smart_display', label: 'Now Playing', span: 2,
      trailing: { icon: 'material:apps',
        action: { navigate: 'controller:apps' } } },
    { id: 'dt', type: 'transport', entity: '$device', label: '', span: 2 },
    { id: 'ds', type: 'volume', slider: true, entity: '$device', icon: 'material:volume_up', label: '', span: 2 },
    { id: 'dsrc', type: 'chips', kind: 'source', entity: '$device', icon: 'material:input', label: '', span: 2 },
    { id: 'dsnd', type: 'chips', kind: 'sound_mode', entity: '$device', icon: 'material:graphic_eq', label: '', span: 2 } ] };

const CONFIG = { version: 2, home_screen: 'p', screen_order: ['p'],
  global: { room: 'P', activity_select: 'select.act' },
  controllers: {
    media_player: JSON.parse(JSON.stringify(MP_STOCK)),
    apps: { name: 'Apps', drawer: true, tiles: [{ id: 'ag', type: 'apps' }] },
  },
  remotes: { default: { capabilities: ['physical_dpad', 'touch', 'pointer'] } },
  dialects: { tiz: { name: 'Samsung Tizen', wake: false,
    apps: { samapp: { name: 'SamApp', service: 'media_player.select_source',
      entity: '$context.media_player', data: { source: 'samapp' } } } } },
  activities: { watch: { name: 'Watch TV', accent: 'lg', room_view: 'p',
    context: { media_player: 'media_player.other', volume: 'media_player.avr' } } },
  devices: { samsung: { name: 'Samsung Q90', dialect: 'tiz',
    roles: { dpad: 'remote.samsung', media_player: 'media_player.samsung',
      volume: 'media_player.samsung',
      /* the ARC split (2026-09-05 — his: "volume readout set to the
         soundbar ... doesn't honor that setting") */
      volume_level: 'media_player.soundbar' },
    traits: { dpad_commands: { up: 'KEY_UP' } } } },
  screens: { p: { name: 'P', type: 'hub', tiles: [
    { id: 'd1', type: 'device', entity: 'media_player.samsung', label: 'TV' },
    { id: 'd2', type: 'device', entity: 'media_player.other', label: 'Other' },
    /* a GENERATOR tile for the eye fence (2026-09-05, feedback-1:
       "Doesn't let me hide some tiles like vol, spk, groups") */
    { id: 'ha', type: 'activities', room: 'p' }] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 349, height: 800 } })).newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await (p.context()).route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.__svc = [];
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const g = JSON.parse(m);
      if (g.type === 'call_service') window.__svc.push(g);
      const r = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (g.type === 'auth') r({ type: 'auth_ok' });
      else r({ type: 'result', id: g.id, success: true, result: null }); }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(800);
await p.evaluate(() => { CAPS = new Set(['physical_dpad', 'touch', 'pointer']); });

const pageShape = () => p.evaluate(() => {
  const sc = screenOf(S.screen);
  return {
    ids: (sc.tiles || []).map(t => t.id),
    types: (sc.tiles || []).map(t => t.type),
    npStyle: (sc.tiles || []).filter(t => t.id === 'dnp').map(t => t.style)[0],
    npEntity: (sc.tiles || []).filter(t => t.id === 'dnp').map(t => t.entity)[0],
    trailNav: (sc.tiles || []).filter(t => t.id === 'dnp')
      .map(t => t.trailing && t.trailing.action && t.trailing.action.navigate)[0],
    own: !!sc.own_context,
    ct: sc.control_target && sc.control_target.navigation,
    rendered: [...document.querySelectorAll('.tile')].map(x => x.id),
  };
});

/* ---- twin parity: the STOCK path renders the fallback's page ---- */
await p.evaluate(() => navigate('detail:media_player.samsung'));
await p.waitForTimeout(300);
let s = await pageShape();
ck('stock path: the fallback\'s exact tile order (dp dnp dt ds dsrc dsnd)',
  s.ids.join(',') === 'dp,dnp,dt,ds,dsrc,dsnd');
ck('stock path: $device bound to the tapped entity',
  s.npEntity === 'media_player.samsung');
ck('stock path: ART NP with the Apps trailing (gen 2 — feedback-3 #4)',
  s.npStyle === 'art' && s.trailNav === 'controller:apps');
ck('stock path: the takeover still applies (own_context + control_target)',
  s.own && s.ct === 'remote.samsung');
ck('stock path: the device dialect answers the page',
  await p.evaluate(() => ctxFor(S.screen).dialect === 'tiz'));
ck('volume honors the wiring: ds is the ARC split (buttons → volume role, readout → volume_level)',
  await p.evaluate(() => {
    const t = screenOf(S.screen).tiles.filter(x => x.id === 'ds')[0];
    return t && t.type === 'volume' && t.entity === 'media_player.samsung' &&
      t.level_entity === 'media_player.soundbar' && t.slider === false;
  }));

/* ---- AN AUTHORED PICK BEATS THE REWRITE (2026-09-05 drift round —
   Suresh: "Volume shows stepper in config, but compact (correct) in
   ui… Why do they drift?"): the wiring upgrade rewrites ONLY the
   untouched stock stepper. A canonical `variant` on ds — what the
   Studio writes, and what baked per-device copies carry — is the
   user's law and renders exactly as the config says. ---- */
ck('authored variant on ds passes the wiring rewrite untouched',
  await p.evaluate(() => {
    const stock = CONFIG.controllers.media_player;
    const saved = JSON.parse(JSON.stringify(stock.tiles));
    stock.tiles = stock.tiles.map(t => t.id === 'ds'
      ? { id: 'ds', type: 'volume', variant: 'stepper', entity: '$device',
          label: '', span: 2 } : t);
    const sc = screenOf('detail:media_player.samsung');
    stock.tiles = saved;
    const t = (sc.tiles || []).filter(x => x.id === 'ds')[0];
    /* still the authored canonical spelling — no ARC rewrite, no
       level_entity, the entity still the page's own */
    return t && t.type === 'volume' && t.variant === 'stepper' &&
      !t.level_entity && t.entity === 'media_player.samsung';
  }));
ck('a tile already carrying its own ARC split passes untouched too',
  await p.evaluate(() => {
    const stock = CONFIG.controllers.media_player;
    const saved = JSON.parse(JSON.stringify(stock.tiles));
    stock.tiles = stock.tiles.map(t => t.id === 'ds'
      ? { id: 'ds', type: 'volume', variant: 'compact', entity: 'media_player.samsung',
          level_entity: 'media_player.arc_other', label: '', span: 2 } : t);
    const sc = screenOf('detail:media_player.samsung');
    stock.tiles = saved;
    const t = (sc.tiles || []).filter(x => x.id === 'ds')[0];
    return t && t.level_entity === 'media_player.arc_other';
  }));

/* the fallback twin, for comparison: same config MINUS the stock */
const fallbackIds = await p.evaluate(() => {
  const saved = CONFIG.controllers.media_player;
  delete CONFIG.controllers.media_player;
  const sc = screenOf('detail:media_player.samsung');
  CONFIG.controllers.media_player = saved;
  return (sc.tiles || []).map(t => t.id).join(',');
});
ck('twin parity: stock and fallback agree tile for tile',
  fallbackIds === s.ids.join(','));

/* ---- EDITABILITY: a user edit on the stock reaches the page ---- */
await p.evaluate(() => {
  const c = CONFIG.controllers.media_player;
  c.tiles.filter(t => t.id === 'dsnd')[0].hidden = true;    /* the eye */
  c.tiles.filter(t => t.id === 'dnp')[0].style = 'plain';   /* restyle */
  S.stack = []; navigate('detail:media_player.samsung', true);
});
await p.waitForTimeout(300);
s = await pageShape();
ck('edited stock: the hidden tile is gone from the render',
  s.rendered.indexOf('tile_dsnd') < 0 && s.rendered.indexOf('tile_dp') >= 0);
ck('edited stock: the NP restyle sticks', s.npStyle === 'plain');

/* ---- PER-DEVICE COPY: wins for its entity, stock for others ---- */
await p.evaluate(() => {
  CONFIG.controllers.mp__samsung = {
    name: 'Samsung page', variant_of: 'media_player',
    domain: 'media_player', entity: 'media_player.samsung',
    tiles: [{ id: 'dp', type: 'power', entity: '$device', label: '', span: 2 }] };
  S.stack = []; navigate('detail:media_player.samsung', true);
});
await p.waitForTimeout(300);
s = await pageShape();
ck('per-device copy: the copy answers for ITS entity (one tile)',
  s.ids.join(',') === 'dp');
ck('per-device copy: the takeover chrome still rides the copy',
  s.own && s.ct === 'remote.samsung');
await p.evaluate(() => { S.stack = []; navigate('detail:media_player.other', true); });
await p.waitForTimeout(300);
s = await pageShape();
ck('per-device copy: OTHER entities keep the (edited) stock',
  s.ids.join(',') === 'dp,dnp,dt,ds,dsrc,dsnd' && !s.own);

/* ---- a DEVICE VARIANT opened AS a controller surface (2026-09-05 —
   Suresh's minimal-TV flow: point the ACTIVITY at the clone):
   $device binds to the copy's own entity instead of rendering the
   literal string ---- */
await p.evaluate(() => { S.stack = []; navigate('controller:mp__samsung', true); });
await p.waitForTimeout(300);
ck('device variant as a surface: $device tiles bind to the copy entity',
  await p.evaluate(() => {
    const sc = screenOf(S.screen);
    const t = (sc.tiles || [])[0];
    return t && t.entity === 'media_player.samsung' &&
      JSON.stringify(sc).indexOf('"$device"') < 0;
  }));

/* ---- THE DEVICE'S OWN PICK (round 3 — "assign a Device Controller
   per device instance, alongside the dialect setting"): d.page
   outranks the entity-bound copy, both ways ---- */
await p.evaluate(() => {
  /* pin the STOCK on the samsung even though its copy exists */
  CONFIG.devices.samsung.page = 'media_player';
  S.stack = []; navigate('detail:media_player.samsung', true);
});
await p.waitForTimeout(300);
s = await pageShape();
ck('device pick: pinning the stock beats the entity-bound copy',
  s.ids.join(',') === 'dp,dnp,dt,ds,dsrc,dsnd' && s.own);
await p.evaluate(() => {
  /* a SECOND device adopts the samsung’s variant — sharing one page */
  CONFIG.devices.other2 = { name: 'Other TV', page: 'mp__samsung',
    roles: { media_player: 'media_player.other' } };
  S.stack = []; navigate('detail:media_player.other', true);
});
await p.waitForTimeout(300);
s = await pageShape();
ck('device pick: two devices can share one custom page',
  s.ids.join(',') === 'dp' && s.own && s.npEntity === undefined);
await p.evaluate(() => {
  /* a wrong-domain or unknown pick is ignored — the ladder answers */
  CONFIG.devices.other2.page = 'nonsense';
  S.stack = []; navigate('detail:media_player.other', true);
});
await p.waitForTimeout(300);
s = await pageShape();
ck('device pick: an unknown id falls back to the ladder (stock)',
  s.ids.join(',') === 'dp,dnp,dt,ds,dsrc,dsnd');

/* ---- THE EYE ON GENERATORS (2026-09-05, feedback-1): hidden on a
   generator tile expands to NOTHING ---- */
await p.evaluate(() => { S.stack = []; navigate('p', true); });
await p.waitForTimeout(300);
ck('generator visible: the activities band renders',
  await p.evaluate(() => !!document.getElementById('tile_ha_watch')));
await p.evaluate(() => {
  CONFIG.screens.p.tiles.filter(t => t.id === 'ha')[0].hidden = true;
  S.stack = []; navigate('p', true);
});
await p.waitForTimeout(300);
ck('generator hidden: the eye silences the whole band',
  await p.evaluate(() => !document.getElementById('tile_ha_watch') &&
    !!document.getElementById('tile_d1')));

console.log(JSON.stringify({ ok: !errs.length, errs }, null, 1));
await b.close();
process.exit(errs.length ? 1 : 0);
