/* ENTITY-CONTROLS PHASE 1 probe (2026-08-31 — design-entity-controls
   v2, "parity foundation"). Fences:
     REGISTRY — the adapter table is byte-identical in the engine and
       the Studio (the marked region), and SHOWS_KINDS agrees with it
       about roles; showsForDomain's offers are pinned per domain;
     READER — a canonical tile (type + variant) renders EXACTLY as its
       legacy working spelling: same generated shape, same services;
     LADDER — rung 1 (present.variant) beats rung 2
       (surface.volume_variant) beats rung 3 (global.style.volume);
       canonical rung-2/3 spellings are honored;
     NORMALIZER — normalizeVariants heals shows/style/volume_style to
       type/variant/volume_variant, idempotently, preserving unknowns;
     FINGERPRINTS — FP-NORM v1: every spelling of one volume tile
       fingerprints identically (JS; the python twin is fenced in
       test-layered-catalogs.py), and the CURRENT stock tv controller's
       fp is the last entry of its stock-history list. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

/* ---- REGISTRY: the twin tables can never drift ---- */
{
  const between = (src) => {
    const a = src.indexOf('/* @adapter-table-begin v1 */');
    const b = src.indexOf('/* @adapter-table-end */');
    return a >= 0 && b > a ? src.slice(a, b) : null;
  };
  const eng = between(readFileSync(new URL('../src/core/adapters.js', import.meta.url), 'utf8'));
  const stu = between(readFileSync(new URL('../studio-src/src/lib/stocklib.js', import.meta.url), 'utf8'));
  ck('registry: both tables carry the marked region', !!eng && !!stu);
  ck('registry: engine and Studio tables are byte-identical', eng === stu);
}
const lib = await import('../studio-src/src/lib/stocklib.js');
{
  const { ADAPTERS, SHOWS_KINDS, showsForDomain } = lib;
  ck('registry: every Draws-as entry has a registry row',
    SHOWS_KINDS.every(k => ADAPTERS[k.value]));
  ck('registry: SHOWS_KINDS roles agree with the registry',
    SHOWS_KINDS.every(k => (ADAPTERS[k.value] || {}).role === k.role));
  const vals = (dom) => showsForDomain(dom).map(k => k.value).join(',');
  ck('offers: a light gets launcher + power', vals('light') === 'device,power');
  ck('offers: a media_player gets all six',
    vals('media_player') === 'device,volume,power,media,transport,sources');
  ck('offers: a sensor gets the launcher only', vals('sensor') === 'device');
  /* final 0.87 review — "Surely it should be Launcher or Fan
     Control": the density controls are first-class Draws-as */
  ck('offers: a fan gets launcher + fan control + power',
    vals('fan') === 'device,fan,power');
  ck('offers: a cover gets launcher + cover control',
    vals('cover') === 'device,cover');
}

/* ---- NORMALIZER: heal legacy, idempotently, preserving unknowns ---- */
{
  const { normalizeVariants } = lib;
  const mk = () => ({ activities: { m: {
    present: {
      a: { shows: 'stepper', name: 'Amp' },
      b: { shows: 'volume', style: 'compact', keepme: 1 },
      c: { shows: 'power' },
      d: { type: 'volume', variant: 'slider' } },
    surface: { volume_style: 'stepper', devices: false },
  } } });
  const one = normalizeVariants(mk());
  const p = one.activities.m.present;
  ck('normalizer: shows:"stepper" → type volume + variant stepper',
    p.a.type === 'volume' && p.a.variant === 'stepper' && !('shows' in p.a) && p.a.name === 'Amp');
  ck('normalizer: style → variant, unknown fields kept',
    p.b.type === 'volume' && p.b.variant === 'compact' && !('style' in p.b) && p.b.keepme === 1);
  ck('normalizer: shows → type for variant-less adapters',
    p.c.type === 'power' && !('shows' in p.c));
  ck('normalizer: canonical entries pass through untouched',
    p.d.type === 'volume' && p.d.variant === 'slider');
  const s = one.activities.m.surface;
  ck('normalizer: surface.volume_style → volume_variant, siblings kept',
    s.volume_variant === 'stepper' && !('volume_style' in s) && s.devices === false);
  ck('normalizer: idempotent — normalize(normalize(x)) == normalize(x)',
    JSON.stringify(normalizeVariants(JSON.parse(JSON.stringify(one)))) === JSON.stringify(one));
  /* Phase 4 upgrade summary: the heal counter reports work once and
     zero on an already-canonical config */
  normalizeVariants(mk());
  const first = lib.NORMALIZE_REPORT.variants;
  normalizeVariants(JSON.parse(JSON.stringify(one)));
  ck('normalizer: the report counts heals (6) then 0 when canonical',
    first === 6 && lib.NORMALIZE_REPORT.variants === 0);
}

/* ---- FINGERPRINTS: FP-NORM v1 (the respelling ruling) ---- */
{
  const own = await import('../studio-src/src/lib/ownership.js');
  const fp = own.controllerFp;
  /* FP-NORM v2 (2026-08-31): bare volume = SLIDER (the v0.83.1 fat
     default is the bare shape's real meaning); only an explicit
     slider: false is Compact */
  const pairs = [
    [{ tiles: [{ id: 'v', type: 'stepper', kind: 'volume', entity: 'media_player.x', level_entity: 'media_player.y' }] },
     { tiles: [{ id: 'v', type: 'volume', variant: 'stepper', entity: 'media_player.x', level_entity: 'media_player.y' }] }],
    [{ tiles: [{ id: 'v', type: 'volume', slider: true, entity: 'media_player.x' }] },
     { tiles: [{ id: 'v', type: 'volume', variant: 'slider', entity: 'media_player.x' }] }],
    [{ tiles: [{ id: 'v', type: 'volume', entity: 'media_player.x' }] },
     { tiles: [{ id: 'v', type: 'volume', variant: 'slider', entity: 'media_player.x' }] }],
    [{ tiles: [{ id: 'v', type: 'volume', slider: false, entity: 'media_player.x' }] },
     { tiles: [{ id: 'v', type: 'volume', variant: 'compact', entity: 'media_player.x' }] }],
  ];
  ck('fp: every spelling of one meaning hashes as one form',
    pairs.every(([l, c]) => fp(l) === fp(c)));
  /* cross-language pins — test-layered-catalogs.py asserts the same
     hexes from catalogs.py controller_fp; a drift on either side
     breaks exactly one suite, which names the twin */
  ck('fp: cross-language pin (stepper)', fp(pairs[0][0]) === '14ba7ecd8115');
  ck('fp: cross-language pin (slider, bare included)',
    fp(pairs[1][0]) === '00ca0fa8af46' && fp(pairs[2][0]) === '00ca0fa8af46');
  ck('fp: cross-language pin (compact)', fp(pairs[3][0]) === 'b6970da5a428');
  ck('fp: slider and compact stay DISTINCT (the v1 collision is dead)',
    fp(pairs[1][0]) !== fp(pairs[3][0]));
  /* the referee's memory agrees with current stock: the tv
     controller (the one stock unit with a volume tile) fingerprints
     to the LAST entry of its history list */
  const hist = (await import('../studio-src/src/lib/stock-history.js')).default;
  const tvHist = (hist.controllers || hist).tv;
  ck('fp: current stock tv fp is the newest history entry',
    Array.isArray(tvHist) && tvHist.length >= 2 &&
    fp(lib.STOCK_TV) === tvHist[tvHist.length - 1]);
}

/* ---- READER + LADDER: the engine, in the browser ---- */
const CONFIG = {
  version: 2, home_screen: 'porch', screen_order: ['porch'],
  global: { room: 'Porch', activity_select: 'select.harmonium_porch_activity',
    style: { volume: 'compact' } },
  devices: {}, dialects: {},
  activities: {
    music: { name: 'Music', room_view: 'porch',
      context: { volume: 'media_player.tv', volume_level: 'media_player.avr' },
      surface: { volume_variant: 'stepper' },       /* rung 2, canonical */
      screen: 'controller:music' },
    radio: { name: 'Radio', room_view: 'porch',
      context: { volume: 'media_player.tv' },
      present: { 'media_player.tv': { type: 'volume', variant: 'slider' } },
      surface: { volume_variant: 'stepper' },       /* rung 1 must beat this */
      screen: 'controller:radio' },
    tape: { name: 'Tape', room_view: 'porch',
      context: { volume: 'media_player.tv' },
      screen: 'controller:tape' },                  /* nothing → rung 3 */
  },
  screens: { porch: { name: 'Porch', type: 'hub', room: true,
    activity_select: 'select.harmonium_porch_activity',
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [
        { id: 'acts', type: 'activities', room: 'porch' },
        /* canonical vs legacy spelling of the SAME control */
        { id: 'cv', type: 'volume', variant: 'stepper',
          entity: 'media_player.tv', level_entity: 'media_player.avr', label: 'Canon' },
        { id: 'lv', type: 'stepper', kind: 'volume',
          entity: 'media_player.tv', level_entity: 'media_player.avr', label: 'Legacy' },
        { id: 'cs', type: 'volume', variant: 'slider',
          entity: 'media_player.avr', label: 'CanonSlide' },
      ] }] } },
  controllers: {
    music: { name: 'Music', type: 'controller', class: 'activity',
      view_kind: 'controller', tiles: [{ id: 'vb', type: 'volumes', span: 2 }] },
    radio: { name: 'Radio', type: 'controller', class: 'activity',
      view_kind: 'controller', tiles: [{ id: 'vb', type: 'volumes', span: 2 }] },
    tape: { name: 'Tape', type: 'controller', class: 'activity',
      view_kind: 'controller', tiles: [{ id: 'vb', type: 'volumes', span: 2 }] },
  },
};
const STATES = {
  'media_player.tv': { s: 'on', a: { friendly_name: 'TV', supported_features: 0 } },
  'media_player.avr': { s: 'on', a: { friendly_name: 'AVR', supported_features: 4, volume_level: 0.3 } },
  'select.harmonium_porch_activity': { s: 'music', a: { options: ['music', 'radio', 'tape', 'off'] } },
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
const calls = () => p.evaluate(() => window._calls.map(c => ({
  d: c.domain, s: c.service, data: c.service_data, tgt: c.target && c.target.entity_id })));
const reset = () => p.evaluate(() => { window._calls.length = 0; });

/* READER: canonical == legacy, shape and services */
const shapes = await p.evaluate(() => {
  const strip = (t) => { const c = Object.assign({}, t); delete c.id; delete c.label; return c; };
  return { cv: strip(tileDef('cv')), lv: strip(tileDef('lv')), cs: tileDef('cs') };
});
const sortKeys = (o) => JSON.stringify(o, Object.keys(o).sort());
ck('reader: canonical stepper tile takes the legacy working shape',
  sortKeys(shapes.cv) === sortKeys(shapes.lv) &&
  shapes.cv.type === 'stepper' && shapes.cv.kind === 'volume' &&
  shapes.cv.level_entity === 'media_player.avr' && !('variant' in shapes.cv));
ck('reader: canonical slider tile takes slider:true',
  shapes.cs.type === 'volume' && shapes.cs.slider === true && !('variant' in shapes.cs));
await reset();
await p.evaluate(() => WIDGETS.stepper.keys.right('media_player.tv', tileDef('cv')));
await p.waitForTimeout(80);
let c = await calls();
ck('reader: the canonical tile nudges the LEVEL entity, like the legacy one',
  c.length === 1 && c[0].s === 'volume_set' && c[0].tgt === 'media_player.avr');

/* LADDER: rung 2 canonical (surface.volume_variant) */
await p.evaluate(() => navigate('controller:music'));
await p.waitForTimeout(300);
let td = await p.evaluate(() => tileDef('vb_media_player_tv'));
ck('ladder: surface.volume_variant (canonical rung 2) makes the band a stepper',
  !!td && td.type === 'stepper' && td.kind === 'volume');
/* rung 1 beats rung 2 */
await p.evaluate(() => { window._STATES['select.harmonium_porch_activity'].s = 'radio';
  S.states.set('select.harmonium_porch_activity', window._STATES['select.harmonium_porch_activity']);
  navigate('controller:radio'); });
await p.waitForTimeout(300);
td = await p.evaluate(() => tileDef('vb_media_player_tv'));
ck('ladder: a present pin (rung 1, canonical) beats the surface default',
  !!td && td.type === 'volume' && td.slider === true);
/* nothing set → rung 3 (global.style.volume: compact) */
await p.evaluate(() => { window._STATES['select.harmonium_porch_activity'].s = 'tape';
  S.states.set('select.harmonium_porch_activity', window._STATES['select.harmonium_porch_activity']);
  navigate('controller:tape'); });
await p.waitForTimeout(300);
td = await p.evaluate(() => tileDef('vb_media_player_tv'));
ck('ladder: no rung-1/2 answer falls to global.style.volume (compact)',
  !!td && td.type === 'volume' && !td.slider);

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
