/* ENTITY-CONTROLS PHASE 2 probe (2026-08-31): Number + Select.
   Fences:
     NUMBER — canonical tiles land on the stepper widget with kind
       "number"; the range/step/unit are the ENTITY's (never 0..100);
       set_value goes to the entity's own domain; Auto is
       DETERMINISTIC on fixed fixtures (mode slider → Slider, box →
       Stepper, auto → Slider iff (max−min)/step ≤ 100, malformed
       step → 1); Slider/Vertical carry the track, Stepper does not.
     SELECT — Auto = Picker, period; the picker tile shows the
       current option, ◀▶ cycle in place, OK opens pick:<e>:select;
       the pick screen is a live chips row; Cycle's OK steps forward
       instead; Chips renders the inline row; select_option goes to
       the entity's own domain.
     STUDIO — the native adapters are offered per domain for
       entities, and NOT offered to devices without a mapping trait. */
import { chromium } from 'playwright-core';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

/* ---- STUDIO offers (node-side import) ---- */
{
  const lib = await import('../studio-src/src/lib/stocklib.js');
  const vals = (dom) => lib.showsForDomain(dom).map(k => k.value).join(',');
  ck('offers: number.* gets launcher + Number', vals('number') === 'device,number');
  ck('offers: input_select.* gets launcher + Select', vals('input_select') === 'device,select');
  ck('offers: a light still gets launcher + power', vals('light') === 'device,power');
  const roles = (r) => lib.showsForRoles(r).map(k => k.value).join(',');
  ck('offers: a volume-claiming device gets launcher + volume, never Number/Select',
    roles({ volume: 'media_player.x' }) === 'device,volume');
  ck('offers: a claimless device gets the launcher only', roles({}) === 'device');
}

/* ---- the engine, in the browser ---- */
const CONFIG = {
  version: 2, home_screen: 'porch', screen_order: ['porch'],
  global: { room: 'Porch' }, devices: {}, dialects: {}, activities: {},
  screens: { porch: { name: 'Porch', type: 'hub',
    sections: [{ hero_label: 'Controls', tiles: [
      { id: 'nb', type: 'number', entity: 'number.bass', label: 'Bass' },
      { id: 'nt', type: 'number', entity: 'number.bass', variant: 'stepper', label: 'BassSteps' },
      { id: 'nv', type: 'number', entity: 'number.bass', variant: 'vertical', label: 'BassVert' },
      { id: 'nc', type: 'number', entity: 'number.bass', variant: 'compact', label: 'BassC' },
      { id: 'nbox', type: 'number', entity: 'number.boxy', label: 'Boxy' },
      { id: 'nbig', type: 'number', entity: 'input_number.big', label: 'Big' },
      { id: 'nbad', type: 'number', entity: 'number.badstep', label: 'Bad' },
      { id: 'sp', type: 'select', entity: 'select.mode', label: 'Mode' },
      { id: 'sc', type: 'select', entity: 'select.mode', variant: 'cycle', label: 'ModeCycle' },
      { id: 'sh', type: 'select', entity: 'input_select.scene', variant: 'chips', label: 'SceneChips' },
      /* the solitary-select deadlock (2026-08-31): this tile's ONLY
         reference is itself — pre-fix its entity was never
         subscribed (hidden tiles were dropped from entitiesFor), so
         its options never arrived and it could never unhide */
      { id: 'dl', type: 'select', entity: 'select.lonely', label: 'Lonely' },
      /* sources variants (2026-08-31 — "surely I should get the
         variant option too?") */
      { id: 'sv', type: 'sources', variant: 'cycle', entity: 'media_player.avr2', label: 'In' },
      { id: 'sb', type: 'sources', entity: 'media_player.avr2', label: 'InBare' },
    ] }] } },
  controllers: {},
};
const STATES = {
  'number.bass': { s: '-2.5', a: { friendly_name: 'Bass', min: -10, max: 10,
    step: 0.5, mode: 'auto', unit_of_measurement: 'dB' } },
  'number.boxy': { s: '5', a: { min: 0, max: 50, step: 1, mode: 'box' } },
  'input_number.big': { s: '400', a: { min: 0, max: 5000, step: 1, mode: 'auto' } },
  'number.badstep': { s: '7', a: { min: 0, max: 10, step: 0, mode: 'auto' } },
  'select.mode': { s: 'movie', a: { friendly_name: 'Sound Mode',
    options: ['music', 'movie', 'night_mode'] } },
  'input_select.scene': { s: 'relax', a: { options: ['relax', 'party'] } },
  'select.lonely': { s: 'a', a: { options: ['a', 'b'] } },
  'media_player.avr2': { s: 'on', a: { friendly_name: 'AVR2',
    supported_features: 2052, source: 'HDMI 1',
    source_list: ['HDMI 1', 'HDMI 2'] } },
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

/* ---- NUMBER: working shapes + deterministic Auto ---- */
const nshapes = await p.evaluate(() => ({
  nb: tileDef('nb'), nt: tileDef('nt'), nv: tileDef('nv'),
  nbox: tileDef('nbox'), nbig: tileDef('nbig'), nbad: tileDef('nbad'),
}));
ck('number: canonical tile lands on stepper/kind number',
  nshapes.nb.type === 'stepper' && nshapes.nb.kind === 'number');
ck('number Auto: mode auto + 40 steps ≤ 100 → Slider (track h)',
  nshapes.nb.slider === 'h');
/* THE CONTROL LANGUAGE (2026-08-31): a track means scrubbable —
   Stepper is TRACKLESS (value alone at 21px), Compact is the 32px
   track with the value INSET, flipping to accent ink past ~88% */
const shapes2 = await p.evaluate(() => {
  renderStates();
  const q = (id, s) => document.querySelector('#tile_' + id + ' ' + s);
  return {
    ntTrackless: !q('nt', '.sldr') && !!q('nt', '.stepval'),
    ntVal: q('nt', '.stepval') && q('nt', '.stepval').textContent,
    ncInset: !!q('nc', '.steprow.vol .sldr.inrow .inval'),
    ncVal: q('nc', '.inval') && q('nc', '.inval').textContent,
    ncFlip: q('nc', '.inval') && q('nc', '.inval').classList.contains('flip'),
    tile: tileDef('nc'),
  };
});
ck('number: explicit Stepper is TRACKLESS, value at the middle',
  nshapes.nt.slider === false && shapes2.ntTrackless && shapes2.ntVal === '-2.5 dB');
ck('number: Vertical variant carries the vertical track',
  nshapes.nv.slider === 'v');
ck('number: Compact is the 32px track with the value INSET',
  shapes2.tile.inset === true && shapes2.ncInset && shapes2.ncVal === '-2.5 dB');
ck('number: at 37% fill the inset value has NOT flipped', shapes2.ncFlip === false);
const flip = await p.evaluate(() => {
  const cur = window._STATES['number.bass'];
  S.states.set('number.bass', { s: '9.8', a: cur.a });   /* 99% fill */
  renderStates();
  const iv = document.querySelector('#tile_nc .inval');
  const out = iv && iv.classList.contains('flip');
  S.states.set('number.bass', cur);                       /* restore */
  renderStates();
  return out;
});
ck('number: past ~88% fill the inset value flips to accent ink', flip === true);
ck('number Auto: mode box → Stepper', nshapes.nbox.slider === false);
ck('number Auto: 5000 steps > 100 → Stepper', nshapes.nbig.slider === false);
ck('number Auto: malformed step reads as 1 → 10 steps → Slider',
  nshapes.nbad.slider === 'h');

/* value + unit from the entity; nudge steps by ITS step, clamps at ITS min */
const shown = await p.evaluate(() => {
  const el = document.getElementById('tile_nb');
  return el ? el.querySelector('.stepval') && el.querySelector('.stepval').textContent : null;
});
ck('number: the value line reads state + unit (-2.5 dB)', shown === '-2.5 dB');
await reset();
await p.evaluate(() => WIDGETS.stepper.keys.left('number.bass', tileDef('nb')));
await p.waitForTimeout(80);
let c = await calls();
ck('number: ◀ nudges by the entity step to its own domain service (-2.5 − 0.5 = -3)',
  c.length === 1 && c[0].d === 'number' && c[0].s === 'set_value'
  && c[0].tgt === 'number.bass' && c[0].data.value === -3);
await reset();
await p.evaluate(() => {
  const cur = window._STATES['number.bass'];
  S.states.set('number.bass', { s: '-9.8', a: cur.a });  /* near the floor */
  nudgeStep('number.bass', 'number', -1);                /* -10.3 → clamp */
});
await p.waitForTimeout(120);
c = await calls();
ck('number: a nudge past the entity min clamps at it (-9.8 − 0.5 → -10)',
  c.length === 1 && c[0].data.value === -10);
await reset();
await p.evaluate(() => nudgeStep('input_number.big', 'number', +1));
await p.waitForTimeout(80);
c = await calls();
ck('number: input_number writes input_number.set_value',
  c.length === 1 && c[0].d === 'input_number' && c[0].tgt === 'input_number.big');

/* ---- SELECT: Picker / Cycle / Chips ---- */
const sshapes = await p.evaluate(() => ({
  sp: tileDef('sp'), sc: tileDef('sc'), sh: tileDef('sh'),
  spSub: WIDGETS.picker.sub('select.mode', tileDef('sp')),
}));
ck('select Auto: the working shape is the picker', sshapes.sp.type === 'picker' && sshapes.sp.kind === 'select');
ck('select: Cycle variant is a pageless picker', sshapes.sc.type === 'picker' && sshapes.sc.cycle === true);
ck('select: Chips variant is the inline row', sshapes.sh.type === 'chips' && sshapes.sh.kind === 'select');
ck('select: the picker sub line reads the current option, deslugged',
  sshapes.spSub === 'movie');
/* the readout never goes blank (2026-08-31): Cycle names the next
   press too, and no current state invites instead of vanishing */
const subs = await p.evaluate(() => ({
  cyc: WIDGETS.picker.sub('select.mode', tileDef('sc')),
  none: WIDGETS.picker.sub('select.gone', tileDef('sp')),
}));
ck('select: Cycle shows current ▸ next', subs.cyc === 'movie ▸ night mode');
ck('select: no current option invites, never blanks', subs.none === 'Choose…');

/* ---- the solitary-select deadlock is fixed ---- */
const lone = await p.evaluate(() => ({
  tile: tileDef('dl'),
  sub: (document.getElementById('tile_dl') || { querySelector: () => null })
    .querySelector('.sub')?.textContent,
}));
ck('deadlock: a tile that is its entity\'s only reference still subscribes and renders',
  !!lone.tile && lone.tile.type === 'picker' && lone.sub === 'a');

/* ---- sources variants ---- */
const srcShapes = await p.evaluate(() => ({ sv: tileDef('sv'), sb: tileDef('sb') }));
ck('sources: Cycle variant rides the picker (kind source, pageless)',
  srcShapes.sv.type === 'picker' && srcShapes.sv.kind === 'source'
  && srcShapes.sv.cycle === true);
ck('sources: absent variant keeps the classic tile, byte-identical',
  srcShapes.sb.type === 'sources' && !('kind' in srcShapes.sb));
const srcSub = await p.evaluate(() =>
  WIDGETS.picker.sub('media_player.avr2', tileDef('sv')));
ck('sources: the cycle readout names current ▸ next input',
  srcSub === 'HDMI 1 ▸ HDMI 2');
await reset();
await p.evaluate(() => WIDGETS.picker.keys.right('select.mode', tileDef('sp')));
await p.waitForTimeout(80);
c = await calls();
ck('select: ▶ cycles to the next option via the entity domain',
  c.length === 1 && c[0].d === 'select' && c[0].s === 'select_option'
  && c[0].data.option === 'night_mode' && c[0].tgt === 'select.mode');
await reset();
await p.evaluate(() => WIDGETS.picker.select('select.mode', tileDef('sp')));
await p.waitForTimeout(300);
const pickScr = await p.evaluate(() => ({ id: S.screen,
  chips: [...document.querySelectorAll('#tile_dpick .chip')].map(x => x.dataset.ch) }));
ck('select: OK on the picker opens pick:<e>:select',
  pickScr.id === 'pick:select.mode:select');
ck('select: the pick screen offers the live options as chips',
  pickScr.chips.join(',') === 'music,movie,night_mode');
const pickCls = await p.evaluate(() => {
  const el = document.getElementById('tile_dpick');
  return el && el.classList.contains('pickpage') &&
    getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)';
});
ck('select: the pick page sheds the tile chrome (pickpage)', pickCls);
await reset();
await p.evaluate(() => { const el = document.querySelector('#tile_dpick .chip[data-ch="music"]');
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.x + 2, clientY: r.y + 2 }));
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.x + 2, clientY: r.y + 2 }));
  el.click(); });
await p.waitForTimeout(150);
c = await calls();
ck('select: picking a chip commits select_option',
  c.some(x => x.s === 'select_option' && x.data.option === 'music'));
await reset();
await p.evaluate(() => { S.stack = []; navigate('porch'); });
await p.waitForTimeout(200);
await p.evaluate(() => WIDGETS.picker.select('select.mode', tileDef('sc')));
await p.waitForTimeout(80);
c = await calls();
ck('select: the Cycle variant\'s OK steps forward, no page',
  c.length === 1 && c[0].s === 'select_option');

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
