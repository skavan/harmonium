/* CONTROL LANGUAGE probe (2026-08-31 — docs/design-control-language.md,
   Waves B + C). Fences:
     WAVE B — focus is the 2px accent ring at 3px offset; an
       UNAVAILABLE entity keeps its full chassis with a greyed
       identity (state greys, capability hides); pills ride the 46px
       button height and 12px radius; launcher status strings carry
       the canvas voices (fan "On · 25%", cover "Open · 100%").
     WAVE C, re-cut to the v3 canvas — ONE chassis: fat (156) is
       the fat slider (continuous: ± around the 21px value; discrete:
       trio fills the row, the value moves INTO the track), compact
       (100) is the compact card (continuous: − [32 track, inset
       value] +; discrete: trio + state in the title-row value slot).
       Tune in fat = the 24px unboxed glyph; oscillate and the v2
       side cluster are retired. D-pad: fan ◀▶ nudges; cover ◀▶
       roves and OK commits; launchers decline so the walk holds. */
import { chromium } from 'playwright-core';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

/* ---- V5 §1 (2026-09-01 — "Any hex written into a component is a
   bug. Colour comes in exactly one way: the token name."): a static
   sweep of every engine stylesheet EXCEPT tokens.css. Legitimate
   hex homes: tokens.css itself, a var(--token, #fallback) —
   the token owns the colour, the hex is only the Chromium-61-safe
   floor — and the --svc-* service-BRAND token definitions (Spotify
   green is not a skin decision). Anything else fails by line. ---- */
{
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../src/styles/', import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.css') || f === 'tokens.css') continue;
    readFileSync(new URL(f, dir), 'utf8').split('\n').forEach((ln, i) => {
      const bare = ln
        .replace(/var\(--[\w-]+\s*,\s*#[0-9a-fA-F]{3,8}\)/g, '')
        .replace(/--svc-[\w-]*\s*:\s*#[0-9a-fA-F]{3,8}/g, '');
      if (/#[0-9a-fA-F]{3,8}\b/.test(bare))
        ck(`V5 §1: raw hex in a component — ${f}:${i + 1} ${ln.trim().slice(0, 60)}`, false);
    });
  }
}

/* ---- the Studio registry offers the density CONTROLS (final 0.87
   review — Suresh: "Surely it should be Launcher or Fan Control":
   fan/cover are first-class Draws-as rows; the Launcher is a
   launcher again and carries no variants) ---- */
{
  const lib = await import('../studio-src/src/lib/stocklib.js');
  ck('registry: the Launcher carries no variants',
    (lib.ADAPTERS.device.variants || []).length === 0);
  ck('registry: fan + cover adapter rows, inline default',
    (lib.ADAPTERS.fan.variants || []).join(',') === 'inline,compact' &&
    lib.ADAPTERS.fan.dflt === 'inline' &&
    (lib.ADAPTERS.cover.variants || []).join(',') === 'inline,compact');
  const lbl = (v) => (lib.SHOWS_KINDS.find(k => k.value === v) || {}).label;
  ck('labels: Fan control / Cover control in Draws-as',
    lbl('fan') === 'Fan control' && lbl('cover') === 'Cover control');
  ck('labels: professional density wording',
    lib.VARIANT_LABELS.inline === 'Inline — full control');
  /* 2026-09-01 review: the blank default row must not restate a
     variant — no label appears twice in any adapter's dropdown */
  ck('options: no adapter lists the same label twice',
    Object.keys(lib.ADAPTERS).every(a => {
      const ls = lib.variantOptions(a,
        a === 'fan' || a === 'cover' ? 'Inline — full control'
        : a === 'volume' ? 'Theme default' : 'Auto').map(o => o.label);
      return new Set(ls).size === ls.length;
    }));
  /* the Wave C spelling heals to the first-class control */
  const cfg = { activities: { m: { present: {
    'fan.deck': { variant: 'compact' },
    'cover.screen': { type: 'device', variant: 'inline' },
    'bar_onkyo': { variant: 'compact' } } } } };
  lib.normalizeVariants(cfg);
  const pm = cfg.activities.m.present;
  ck('normalizer: a density variant on a fan/cover entity heals to its control',
    pm['fan.deck'].type === 'fan' && pm['cover.screen'].type === 'cover' &&
    !('type' in pm['bar_onkyo']));
}

const CONFIG = {
  version: 2, home_screen: 'porch', screen_order: ['porch'],
  global: { room: 'Porch' }, devices: {}, dialects: {}, activities: {},
  screens: { porch: { name: 'Porch', type: 'hub',
    sections: [{ hero_label: 'Devices', tiles: [
      { id: 'fl', type: 'device', entity: 'fan.deck', label: 'Fan launcher', span: 2 },
      { id: 'fi', type: 'fan', entity: 'fan.deck', label: 'Fan inline' },
      { id: 'fc', type: 'fan', entity: 'fan.deck', variant: 'compact', label: 'Fan compact' },
      { id: 'cl', type: 'device', entity: 'cover.screen', label: 'Screen launcher', span: 2 },
      { id: 'ci', type: 'cover', entity: 'cover.screen', label: 'Screen inline' },
      { id: 'ct', type: 'cover', entity: 'cover.blind', label: 'Blind tilt' },
      { id: 'cc', type: 'cover', entity: 'cover.screen', variant: 'compact', label: 'Screen compact' },
      /* the Wave C spelling stays a COMPAT READ */
      { id: 'cp', type: 'device', entity: 'fan.deck', variant: 'compact', label: 'Compat compact', span: 2 },
      { id: 'sw', type: 'device', entity: 'switch.amp', variant: 'inline', label: 'Amp', span: 2 },
      { id: 'sl', type: 'device', entity: 'light.lamp', variant: 'inline', label: 'Lamp', span: 2 },
      { id: 'un', type: 'device', entity: 'light.gone', label: 'Porch Lights', span: 2 },
      { id: 'ch', type: 'chips', kind: 'select', entity: 'select.mode', label: '', span: 2 },
      /* ---- V7 §9 + invert ---- */
      { id: 'w2', type: 'switch', entity: 'switch.zone', label: 'Zone 2', span: 2 },
      { id: 'p1', type: 'press', entity: 'button.bridge', label: 'Restart Bridge', span: 2 },
      { id: 'k1', type: 'lock', entity: 'lock.front', label: 'Front Door', span: 2 },
      { id: 'k2', type: 'lock', entity: 'lock.gate', label: 'Side Gate', span: 2 },
      { id: 'kf', type: 'lock', entity: 'lock.front', variant: 'inline', label: 'Fat ask', span: 2 },
      { id: 'iv', type: 'cover', entity: 'cover.blind', variant: 'compact', invert: true, label: 'Inverted blind', span: 2 },
    ] }] } },
  controllers: {},
};
const STATES = {
  'fan.deck': { s: 'on', a: { friendly_name: 'Deck Fan', percentage: 25,
    supported_features: 3, oscillating: false } },
  'cover.screen': { s: 'open', a: { friendly_name: 'Screen',
    current_position: 100, supported_features: 15 } },
  'cover.blind': { s: 'open', a: { friendly_name: 'Blind',
    current_position: 40, supported_features: 127 } },
  'switch.amp': { s: 'on', a: { friendly_name: 'Amp' } },
  'switch.zone': { s: 'off', a: { friendly_name: 'Zone 2' } },
  'light.lamp': { s: 'on', a: { friendly_name: 'Lamp' } },
  'light.gone': { s: 'unavailable', a: { friendly_name: 'Porch Lights' } },
  'select.mode': { s: 'a', a: { options: ['a', 'b'] } },
  'button.bridge': { s: '2026-08-30T10:00:00+00:00', a: {} },
  'lock.front': { s: 'locked', a: { supported_features: 0 } },
  'lock.gate': { s: 'locked', a: { supported_features: 1 } },
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 1400 } });
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

/* ---- WAVE B ---- */
const wb = await p.evaluate(() => {
  setFocus('fl');
  const f = getComputedStyle(document.getElementById('tile_fl'));
  const un = document.getElementById('tile_un');
  const chip = document.querySelector('#tile_ch .chip');
  const cs = chip && getComputedStyle(chip);
  const sub = (id) => document.querySelector('#tile_' + id + ' .sub').textContent;
  return {
    ring: f.borderTopWidth === '2px' &&
      f.borderTopColor === getComputedStyle(document.documentElement)
        .getPropertyValue('--accent').trim().replace('#ffb020', 'rgb(255, 176, 32)'),
    unavKept: !!un && un.classList.contains('unav') &&
      getComputedStyle(un).display !== 'none',
    unavSub: sub('un'),
    chip: cs && cs.minHeight === '46px' && cs.borderRadius === '12px',
    fanSub: sub('fl'), coverSub: sub('cl'),
  };
});
ck('B: focus is the 2px accent ring, inset on the border slot', wb.ring);
ck('B: an unavailable entity keeps its chassis, greyed (.unav)',
  wb.unavKept && wb.unavSub === 'Unavailable');
ck('B: pills ride the 46px height and 12px radius', wb.chip);
ck('B: fan launcher reads "On · 25%"', wb.fanSub === 'On · 25%');
ck('B: cover launcher reads "Open · 100%"', wb.coverSub === 'Open · 100%');

/* ---- WAVE C: shapes (v3 — one chassis: fat = the fat slider,
   compact = the compact card; the v2 side cluster and the oscillate
   button are retired) ---- */
const wc = await p.evaluate(() => {
  const q = (id, s) => document.querySelector('#tile_' + id + ' ' + s);
  const H = (id) => Math.round(document.getElementById('tile_' + id)
    .getBoundingClientRect().height);
  const subGone = (id) => { const el = q(id, '.sub');
    return !!el && getComputedStyle(el).display === 'none'; };
  return {
    fiH: H('fi'), fcH: H('fc'), ciH: H('ci'), ccH: H('cc'), flH: H('fl'),
    /* fan fat: 44 track + − value + row, status line gone */
    fiTrack: (() => { const t = q('fi', '.sldr:not(.inrow)');
      return t && Math.round(t.getBoundingClientRect().height); })(),
    fiVal: q('fi', '.stepval') && q('fi', '.stepval').textContent,
    fiBtns: document.querySelectorAll('#tile_fi [data-dvn]').length,
    fiSubGone: subGone('fi'),
    fiTuneUnboxed: (() => { const tr = q('fi', '.trail');
      return tr && getComputedStyle(tr).backgroundColor === 'rgba(0, 0, 0, 0)'; })(),
    /* fan compact: the numeric compact card exactly */
    fcCls: document.getElementById('tile_fc').classList.contains('dvc'),
    fcTrack: (() => { const t = q('fc', '.steprow .sldr.inrow');
      return t && Math.round(t.getBoundingClientRect().height); })(),
    fcVal: q('fc', '.inval') && q('fc', '.inval').textContent,
    fcSubGone: subGone('fc'),
    /* cover fat: value INSIDE the track, trio fills the row */
    ciVal: q('ci', '.sldr .inval') && q('ci', '.sldr .inval').textContent,
    ciFlip: q('ci', '.sldr .inval') &&
      q('ci', '.sldr .inval').classList.contains('flip'),
    ciBtns: document.querySelectorAll('#tile_ci .devrow:not(.tiltrow) [data-cv]').length,
    ciTiltHidden: q('ci', '.tiltrow') && q('ci', '.tiltrow').classList.contains('hidden'),
    ciOpenDis: q('ci', '[data-cv="open_cover"]') &&
      q('ci', '[data-cv="open_cover"]').classList.contains('dis'),
    ciSubGone: subGone('ci'),
    ctTiltShown: q('ct', '.tiltrow') && !q('ct', '.tiltrow').classList.contains('hidden'),
    /* cover compact (V5 §4C): state on its OWN status line, no track */
    ccSub: q('cc', '.sub:not(.subin)') && q('cc', '.sub:not(.subin)').textContent,
    ccSubin: !!q('cc', '.sub.subin'),
    ccNoTrack: !q('cc', '.sldr'),
    ccBtns: document.querySelectorAll('#tile_cc .devrow:not(.tiltrow) [data-cv]').length,
    /* V7 §9: a density ask on a SWITCH lands on the state pair now;
       a domain with no density mapping (light) still stays plain */
    swPair: !!q('sw', '.devrow.statepair'),
    slPlain: !q('sl', '.devrow') && !q('sl', '.steprow'),
    fiDef: (() => { const d = tileDef('fi');
      return { t: d.type, den: d.density, br: d.brRow, sp: d.span }; })(),
    cpCompat: document.getElementById('tile_cp').classList.contains('dvc') &&
      !!q('cp', '.steprow .sldr.inrow'),
  };
});
ck('C: the one chassis — fat 156, compact 100, discrete compact 116, launcher 84',
  wc.fiH === 156 && wc.ciH === 156 && wc.fcH === 100 && wc.ccH === 116 &&
  wc.flH === 84);
ck('C: fan fat is the fat slider — 44 track, ± around the 21px value',
  wc.fiTrack === 44 && wc.fiVal === '25%' && wc.fiBtns === 2);
ck('C: fat drops the status line (the row value owns the number)',
  wc.fiSubGone === true && wc.ciSubGone === true);
ck('C: fat tune is the 24px unboxed glyph', wc.fiTuneUnboxed === true);
ck('C: fan compact IS the compact card — 32 track, inset value',
  wc.fcCls && wc.fcTrack === 32 && wc.fcVal === '25%' && wc.fcSubGone === true);
ck('C: cover fat reads its position IN the track (ink-flipped at 100%)',
  wc.ciVal === '100%' && wc.ciFlip === true);
ck('C: cover trio fills the row', wc.ciBtns === 3 && wc.ccBtns === 3);
ck('C: no tilt features → the tilt row stays hidden', wc.ciTiltHidden === true);
ck('C: fully open → Open takes the disabled surface but KEEPS its box',
  wc.ciOpenDis === true);
ck('C: tilt features → the second row appears', wc.ctTiltShown === true);
ck('C: cover compact carries its state on the STATUS line (V5: never beside the name)',
  wc.ccSub === 'Open · 100%' && wc.ccSubin === false && wc.ccNoTrack === true);
ck('C→§9: a density ask on a switch lands on the state pair', wc.swPair);
ck('C: a domain with no density mapping stays a launcher', wc.slPlain);
ck('C: {type:"fan"} is the density shape on its own chassis (card, 2-wide)',
  wc.fiDef.t === 'device' && wc.fiDef.den === 'inline' &&
  wc.fiDef.br === false && wc.fiDef.sp === 2);
ck('C: the Wave C spelling still reads as the density (compat)', wc.cpCompat === true);

/* ---- WAVE C: interactions ---- */
await reset();
await p.evaluate(() => WIDGETS.device.keys.right('fan.deck', tileDef('fi')));
await p.waitForTimeout(80);
let c = await calls();
ck('C: fan ◀▶ nudges the percentage', c.length === 1 &&
  c[0].s === 'set_percentage' && c[0].data.percentage === 35);
await reset();
await p.evaluate(() => { setFocus('ci');
  WIDGETS.device.keys.left('cover.screen', tileDef('ci'));
  WIDGETS.device.select('cover.screen', tileDef('ci')); });
await p.waitForTimeout(80);
c = await calls();
ck('C: cover ◀ roves and OK commits the highlighted action',
  c.length === 1 && c[0].d === 'cover' && c[0].s === 'open_cover');
/* the launcher still declines ◀▶ so the walk proceeds (a light has
   no density, so its density ask renders plain and declines) */
const declined = await p.evaluate(() =>
  WIDGETS.device.keys.left('light.lamp', tileDef('sl')));
ck('C: a launcher declines ◀▶ (the walk keeps them)', declined === false);

/* the ⚙ path: a member's variant dresses its generated launcher */
const gen = await p.evaluate(() => {
  const t = presApply({ type: 'device', id: 'x', entity: 'fan.deck' },
    { variant: 'compact' }, 'fan.deck');
  const h = looseShowTile('fan.deck', { type: 'fan', variant: 'compact' }, 'z');
  const cv = looseShowTile('cover.screen', { type: 'cover' }, 'z');
  return { density: t.density, cls: t.cls, trailing: t.trailing,
    br: t.brRow, sp: t.span,
    hDen: h.density, hCls: h.cls, hIcon: h.icon,
    cvDen: cv.density, cvT: cv.type };
});
ck('C: a member\'s variant dresses its launcher (presApply compat path)',
  gen.density === 'compact' && gen.cls === 'dvc' && gen.trailing === false &&
  gen.br === false && gen.sp === 2);
ck('C: a member drawn as Fan control lands on the density (⚙ path)',
  gen.hDen === 'compact' && gen.hCls === 'dvc' &&
  gen.hIcon === 'material:mode_fan');
ck('C: Cover control defaults to inline', gen.cvT === 'device' && gen.cvDen === 'inline');

/* ---- WAVE E: V7 §9 — stateless & binary domains, and the cover
   invert axis ---- */
const we = await p.evaluate(() => {
  const q = (id, s) => document.querySelector('#tile_' + id + ' ' + s);
  const T = (id) => document.getElementById('tile_' + id);
  const H = (id) => Math.round(T(id).getBoundingClientRect().height);
  const bg = (el) => el && getComputedStyle(el).backgroundColor;
  const tok = (n) => getComputedStyle(document.documentElement)
    .getPropertyValue(n).trim();
  const hex2rgb = (h) => 'rgb(' + [1, 3, 5].map(i =>
    parseInt(h.slice(i, i + 2), 16)).join(', ') + ')';
  return {
    onH: H('sw'), offH: H('w2'), prsH: H('p1'), lkH: H('k1'), kfH: H('kf'),
    /* three segment states, one meaning each */
    onSeg: bg(q('sw', '[data-sw="turn_on"]')) === hex2rgb(tok('--on')),
    onOther: bg(q('sw', '[data-sw="turn_off"]')) === hex2rgb(tok('--tile-hi')),
    offSeg: bg(q('w2', '[data-sw="turn_off"]')) === hex2rgb(tok('--ctl-dis')),
    offOther: bg(q('w2', '[data-sw="turn_on"]')) === hex2rgb(tok('--tile-hi')),
    swNoSub: (q('sw', '.sub') || { textContent: '' }).textContent === '',
    /* press: the tile is the button, on the control surface */
    prs: T('p1').classList.contains('prs'),
    prsBg: bg(T('p1')) === hex2rgb(tok('--tile-hi')),
    prsNoTrail: !q('p1', '.trail'),
    /* lock: the two-line 116 block, labels by state, latch trio */
    lkDv3: T('k1').classList.contains('dv3'),
    lkSub: q('k1', '.sub').textContent,
    lkLbl: q('k1', '[data-lk="lock"] .sglbl').textContent,
    lkAccent: bg(q('k1', '[data-lk="lock"]')) === hex2rgb(tok('--on')),
    lkOpenHidden: q('k1', '[data-lk="open"]').classList.contains('hidden'),
    lkTrio: q('k2', '.lkrow').classList.contains('lktrio'),
    /* equal thirds (this probe runs at the authored 480 — the 92px
       number itself is fenced at 349 in probe-v3-geometry) */
    lkTrioEq: (() => {
      const ws = [...T('k2').querySelectorAll('[data-lk]')]
        .map(x => x.getBoundingClientRect().width);
      return ws.length === 3 && Math.max(...ws) - Math.min(...ws) < 2;
    })(),
    lkTrioNoLbl: (() => {
      const l = q('k2', '[data-lk="lock"] .sglbl');
      return !l || getComputedStyle(l).display === 'none';
    })(),
    /* invert: 40% open reads as 60% closed */
    ivSub: q('iv', '.sub').textContent,
  };
});
ck('E: no fat exists — switch 100, press 84, lock 116 (asked or not)',
  we.onH === 100 && we.offH === 100 && we.prsH === 84 &&
  we.lkH === 116 && we.kfH === 116);
ck('E: engaged side is accent, the other stands proud',
  we.onSeg && we.onOther);
ck('E: off is recessed-current, never orange', we.offSeg && we.offOther);
ck('E: the pair IS the readout — switch compact has no status line',
  we.swNoSub);
ck('E: press tile rides the control surface, no trail',
  we.prs && we.prsBg && we.prsNoTrail);
ck('E: lock is the two-line block — Locked on both label and line',
  we.lkDv3 && we.lkSub === 'Locked' && we.lkLbl === 'Locked' && we.lkAccent);
ck('E: OPEN support grows the pair to the icon-only trio',
  we.lkOpenHidden && we.lkTrio && we.lkTrioEq && we.lkTrioNoLbl);
ck('E: invert flips the display axis (40% open → Closed · 60%)',
  we.ivSub === 'Closed · 60%');

/* Wave E interactions */
await reset();
await p.evaluate(() => {
  document.querySelector('#tile_w2 [data-sw="turn_on"]').click(); });
await p.waitForTimeout(60);
c = await calls();
ck('E: the pair issues explicit commands (tap On on an off switch)',
  c.length === 1 && c[0].d === 'switch' && c[0].s === 'turn_on');
await reset();
await p.evaluate(() => { setFocus('w2');
  WIDGETS.device.select('switch.zone', tileDef('w2')); });
await p.waitForTimeout(60);
c = await calls();
ck('E: OK before any rove hits the side that CHANGES the state',
  c.length === 1 && c[0].s === 'turn_on');
await reset();
await p.evaluate(() => {
  document.getElementById('tile_p1').click(); });
await p.waitForTimeout(80);
c = await calls();
const sent = await p.evaluate(() => ({
  cls: document.getElementById('tile_p1').classList.contains('sent'),
  sub: document.querySelector('#tile_p1 .sub').textContent }));
ck('E: press fires on press and flashes Sent (optimistic by design)',
  c.length === 1 && c[0].d === 'button' && c[0].s === 'press' &&
  sent.cls && sent.sub === 'Sent');
await reset();
await p.evaluate(() => { setFocus('k1');
  WIDGETS.device.select('lock.front', tileDef('k1')); });
await p.waitForTimeout(60);
c = await calls();
ck('E: a stray OK on a lock harmlessly LOCKS (never unlocks)',
  c.length === 1 && c[0].d === 'lock' && c[0].s === 'lock');
await reset();
/* the 500ms hold: early release undoes, completion fires */
await p.evaluate(() => {
  const b = document.querySelector('#tile_k1 [data-lk="unlock"]');
  b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
await p.waitForTimeout(150);
const held = await p.evaluate(() => {
  const b = document.querySelector('#tile_k1 [data-lk="unlock"]');
  const w = parseFloat(b.querySelector('.hfill').style.width);
  const sub = document.querySelector('#tile_k1 .sub').textContent;
  b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  return { w, sub };
});
await p.waitForTimeout(60);
c = await calls();
ck('E: letting go before 500ms undoes the unlock (fill was growing)',
  c.length === 0 && held.w > 0 && held.sub === 'Hold to unlock…');
await p.evaluate(() => {
  const b = document.querySelector('#tile_k1 [data-lk="unlock"]');
  b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
await p.waitForTimeout(650);
c = await calls();
ck('E: holding through 500ms unlocks', c.length === 1 &&
  c[0].d === 'lock' && c[0].s === 'unlock');

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
