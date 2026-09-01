/* THE v3 GEOMETRY FENCE (2026-08-31 — Suresh: "I want it
   pixel-perfect to the design guide… Check every single tile /
   style against it", docs/design/Harmonium control language
   v3.html): every shape rendered at the panel's REAL 349 logical
   width, measured, and diffed against the canvas numbers — fat 156
   (12+22+10+44+10+46+12), compact/stepper/chips 100, launcher and
   rows 84, 44/32 channel tracks with the 2px-inset radius-10 fill,
   58×46 buttons, 92-wide trio, the 21/600 and 14/600 value types,
   the 10px inset, the ink flip. A drift on any number fails by
   name. */
import { chromium } from 'playwright-core';
const CONFIG = {
  version: 2, home_screen: 'porch', screen_order: ['porch'],
  global: { room: 'Porch' }, devices: {}, dialects: {}, activities: {},
  screens: { porch: { name: 'Porch', type: 'hub',
    sections: [{ tiles: [
      { id: 'vf', type: 'volume', entity: 'media_player.amp', variant: 'slider', label: 'Sonos Porch', span: 2 },
      { id: 'ns', type: 'number', entity: 'number.bass', variant: 'stepper', label: 'Bass', span: 2 },
      { id: 'nc', type: 'number', entity: 'number.trim', variant: 'compact', label: 'Receiver', span: 2 },
      { id: 'la', type: 'device', entity: 'cover.screen', label: 'MaestroScreen 01 BL', span: 2 },
      { id: 'fi', type: 'fan', entity: 'fan.deck', label: 'Dining Fan FanSync' },
      { id: 'fc', type: 'fan', entity: 'fan.deck', variant: 'compact', label: 'Dining Fan FanSync' },
      { id: 'ci', type: 'cover', entity: 'cover.screen', label: 'MaestroScreen 01 BL' },
      { id: 'cc', type: 'cover', entity: 'cover.screen', variant: 'compact', label: 'MaestroScreen 01 BL' },
      { id: 'cu', type: 'cover', entity: 'cover.gone', label: 'Pergola Lounge' },
      { id: 'ch', type: 'select', entity: 'select.mode', variant: 'chips', label: 'Fan speed', span: 2 },
      { id: 'vc', type: 'volume', entity: 'media_player.amp', variant: 'compact', label: 'Receiver', span: 2 },
      { id: 'sp', type: 'select', entity: 'select.mode', label: 'Source', span: 2 },
      { id: 'g1', type: 'number', entity: 'number.trim', variant: 'compact', label: 'Zone A', span: 2, card_group: 'zones' },
      { id: 'g2', type: 'number', entity: 'number.trim', variant: 'compact', label: 'Zone B', span: 2, card_group: 'zones' },
      { id: 'lo', type: 'fan', entity: 'fan.low', variant: 'compact', label: 'Low fan', span: 2 },
      { id: 'ze', type: 'fan', entity: 'fan.off', variant: 'compact', label: 'Off fan', span: 2 },
      { id: 'ld', type: 'number', entity: 'number.third', variant: 'compact', label: 'Lead demo', span: 2 },
      /* V7 §9 */
      { id: 'w1', type: 'switch', entity: 'switch.lamp', label: 'Porch Lamp', span: 2 },
      { id: 'k2', type: 'lock', entity: 'lock.gate', label: 'Side Gate', span: 2 },
      { id: 'p1', type: 'press', entity: 'button.b', label: 'Restart Bridge', span: 2 },
    ] },
    /* V7 §5 — the ROW FORM (his rule-book-vs-build screenshots) */
    { tile_style: 'row', columns: 1, tiles: [
      { id: 'rd', type: 'device', entity: 'cover.screen', label: 'MaestroScreen 01 BL' },
      { id: 'rn', type: 'nav', target: 'page:porch', label: 'To The Deck', icon: 'material:layers' },
    ] }] } },
  controllers: {},
};
const STATES = {
  'media_player.amp': { s: 'on', a: { friendly_name: 'Sonos', volume_level: 0.53, supported_features: 4 } },
  'number.bass': { s: '0', a: { min: -10, max: 10, step: 1, mode: 'box' } },
  'number.trim': { s: '60', a: { min: 0, max: 100, step: 1, mode: 'slider' } },
  'fan.deck': { s: 'on', a: { percentage: 25, supported_features: 1 } },
  'cover.screen': { s: 'open', a: { current_position: 96, supported_features: 15 } },
  'cover.gone': { s: 'unknown', a: { supported_features: 15 } },
  'select.mode': { s: 'Auto', a: { options: ['Auto', 'Low', 'High'] } },
  'fan.low': { s: 'on', a: { percentage: 1, supported_features: 1 } },
  'fan.off': { s: 'off', a: { percentage: 0, supported_features: 1 } },
  'number.third': { s: '30', a: { min: 0, max: 100, step: 1, mode: 'slider' } },
  'switch.lamp': { s: 'on', a: {} },
  'lock.gate': { s: 'locked', a: { supported_features: 1 } },
  'button.b': { s: '2026-08-30T10:00:00+00:00', a: {} },
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 349, height: 1600 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGEERROR', String(e.message).slice(0, 140)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript((STATES) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
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
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
const audit = await p.evaluate(() => {
  const out = {}; const bad = [];
  const T = (id) => document.getElementById('tile_' + id);
  const R = (el) => { const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right }; };
  const rel = (el, root) => { const a = R(el), b2 = R(root);
    return { x: Math.round(a.x - b2.x), y: Math.round(a.y - b2.y),
      w: Math.round(a.w), h: Math.round(a.h) }; };
  const ck = (n, got, want, tol) =>
    { if (Math.abs(got - want) > (tol ?? 1)) bad.push(`${n}: ${got} want ${want}`); };
  /* widths at 349: span2 = 349-24 = 325 */
  const ids = ['vf','ns','nc','la','fi','fc','ci','cc','cu','ch'];
  ids.forEach(id => { out[id] = Math.round(R(T(id)).h); ck(id + '.w', R(T(id)).w, 325); });
  ck('fat vol h', R(T('vf')).h, 156); ck('stepper h', R(T('ns')).h, 100);
  ck('compact h', R(T('nc')).h, 100); ck('launcher h', R(T('la')).h, 84);
  ck('fan fat h', R(T('fi')).h, 156); ck('fan compact h', R(T('fc')).h, 100);
  ck('cover fat h', R(T('ci')).h, 156);
  /* V5 §4C (2026-09-01): DISCRETE compact grew to 116 — the state
     moved off the title row onto its own status line (two-line
     block 20+2+15), then 9 to the trio. 12+20+2+15+9+46+12 = 116. */
  ck('cover compact h', R(T('cc')).h, 116);
  ck('cover unknown launcher h', R(T('cu')).h, 156);
  ck('chips h', R(T('ch')).h, 100);
  /* fat internals */
  const vtr = rel(T('vf').querySelector('.sldr'), T('vf'));
  ck('fat track y', vtr.y, 44); ck('fat track h', vtr.h, 44);
  const vrow = rel(T('vf').querySelector('.volrow'), T('vf'));
  ck('fat row y', vrow.y, 98); ck('fat row h', vrow.h, 46);
  /* compact internals */
  const ntr = rel(T('nc').querySelector('.sldr.inrow'), T('nc'));
  ck('compact track y', ntr.y, 49); ck('compact track h', ntr.h, 32);
  const nrow = rel(T('nc').querySelector('.steprow'), T('nc'));
  ck('compact row y', nrow.y, 42); ck('compact row h', nrow.h, 46);
  const niv = T('nc').querySelector('.inval');
  ck('compact inset', R(T('nc').querySelector('.sldr.inrow')).r - R(niv).r, 10, 1.5);
  ck('compact inval fs', parseFloat(getComputedStyle(niv).fontSize), 14);
  /* fan fat = numeric fat */
  const ftr = rel(T('fi').querySelector('.sldr'), T('fi'));
  ck('fanfat track y', ftr.y, 44); ck('fanfat track h', ftr.h, 44);
  const fsv = T('fi').querySelector('.stepval');
  ck('fanfat val fs', parseFloat(getComputedStyle(fsv).fontSize), 21);
  out.fanfatVal = fsv.textContent;
  const ftrail = T('fi').querySelector('.trail');
  out.fanTune = ftrail ? rel(ftrail, T('fi')) : null;
  out.fanTuneBg = ftrail && getComputedStyle(ftrail).backgroundColor;
  /* fan compact = numeric compact, byte-for-byte geometry */
  const a1 = rel(T('fc').querySelector('.sldr.inrow'), T('fc'));
  ck('fancompact track y', a1.y, 49); ck('fancompact track h', a1.h, 32);
  out.fanCompactVal = T('fc').querySelector('.inval').textContent;
  /* cover fat: value in track at 21, trio 3-up */
  const civ = T('ci').querySelector('.sldr .inval');
  ck('coverfat inval fs', parseFloat(getComputedStyle(civ).fontSize), 21);
  out.coverFatVal = civ.textContent;
  const cbtns = [...T('ci').querySelectorAll('.devrow:not(.tiltrow) [data-cv]')].map(x => Math.round(R(x).w));
  out.coverTrio = cbtns;
  ck('cover trio count', cbtns.length, 3);
  ck('cover trio w', cbtns[0], 92, 2);
  out.coverOpenDis = T('ci').querySelector('[data-cv="open_cover"]') == null ? null :
    T('ci').querySelector('[data-cv="open_cover"]').classList.contains('dis');
  /* cover compact (V5 §4C): the state on its OWN status line —
     never beside the name — 13/400 at y34, trio at y58 */
  ck('covercompact never rides the title row',
    T('cc').querySelector('.sub.subin') ? 1 : 0, 0);
  const csub = T('cc').querySelector('.sub');
  out.coverCompactSub = csub && csub.textContent;
  ck('covercompact status fs', parseFloat(getComputedStyle(csub).fontSize), 13);
  const csubr = rel(csub, T('cc'));
  ck('covercompact status y', csubr.y, 34);
  const crow = rel(T('cc').querySelector('.devrow'), T('cc'));
  ck('covercompact row y', crow.y, 58);
  /* cover unknown: state word in the track */
  out.coverUnknownVal = T('cu').querySelector('.sldr .inval').textContent;
  /* launcher: tune 58×46 centered */
  const ltr = rel(T('la').querySelector('.trail'), T('la'));
  ck('launcher tune w', ltr.w, 58); ck('launcher tune h', ltr.h, 46);
  ck('launcher tune centered', ltr.y + ltr.h / 2, 42, 2);
  /* chips: 3-up 46 */
  const chips = [...T('ch').querySelectorAll('.chip')].map(x => Math.round(R(x).h));
  ck('chip h', chips[0], 46); out.chips = chips.length;
  const c1 = T('ch').querySelectorAll('.chip');
  ck('chips 3-up', Math.round(R(c1[0]).w), 92, 2);
  /* track dress: channel + inset fill */
  const scs = getComputedStyle(T('vf').querySelector('.sldr'));
  out.trackBg = scs.backgroundColor; out.trackShadow = scs.boxShadow.slice(0, 60);
  const fill = rel(T('vf').querySelector('.sldr i'), T('vf').querySelector('.sldr'));
  ck('fill inset', fill.y, 2); ck('fill h', fill.h, 40);
  ck('fill radius', parseFloat(getComputedStyle(T('vf').querySelector('.sldr i')).borderRadius), 10);
  /* volume compact rides the same compact card */
  ck('vol compact h', R(T('vc')).h, 100);
  ck('vol compact track h', R(T('vc').querySelector('.sldr.inrow')).h, 32);
  /* source/select row: TWO-LINE (2026-09-01 ruling — a long value
     must never starve the name): value on the status line, cue right */
  ck('source row h', R(T('sp')).h, 84);
  const spin = T('sp').querySelector('.sub:not(.subin)');
  out.sourceVal = spin && spin.textContent;
  ck('source value rides its own line (never the title row)',
    T('sp').querySelector('.sub.subin') ? 1 : 0, 0);
  const cue = T('sp').querySelector('.pickcue');
  ck('source cue fs', parseFloat(getComputedStyle(cue).fontSize), 24);
  /* grouped: two compact members, 14px apart inside one card */
  const g1 = T('g1'), g2 = T('g2');
  /* box gap −10: each member carries a 12px content pad, so the
     CONTENT gap is 12 − 10 + 12 = the v3 14 */
  ck('grouped gap', R(g2).y - (R(g1).y + R(g1).h), -10, 1.5);
  ck('grouped member h', R(g1).h, 100);
  out.groupedGap = Math.round(R(g2).y - R(g1).y - R(g1).h);
  /* the 4px fill floor (track rules 2026-09-01): a 1% value still
     shows; a true 0 draws no fill */
  ck('fill floor at 1%', R(T('lo').querySelector('.sldr i')).w, 4, 0.5);
  ck('zero stays empty', R(T('ze').querySelector('.sldr i')).w, 0, 0.5);
  /* V4 §2 — the aspect-scaled LEADING corner: square at 1:1, 2.9 at
     the compact 30% row (the canvas's own table), full 10 once the
     fill passes --lead-ratio, trailing corners pinned at 10 */
  const lead = (id) => parseFloat(getComputedStyle(
    T(id).querySelector('.sldr i')).borderTopRightRadius);
  const tail = (id) => parseFloat(getComputedStyle(
    T(id).querySelector('.sldr i')).borderTopLeftRadius);
  ck('V4 lead: 53% fat is saturated', lead('vf'), 10, 0.5);
  ck('V4 lead: 30% compact reads 2.9 (the canvas table)', lead('ld'), 2.9, 0.5);
  ck('V4 lead: the 4px floor sliver is square', lead('lo'), 0, 0.5);
  ck('V4 tail: trailing corners stay at inner radius', tail('ld'), 10, 0.5);
  /* V7 — the two-line block IS the launcher's block: name AND
     status at x52, the glyph at x14 centred against the pair (his
     screenshots: our status hugged the tile edge; the canvas's
     doesn't) */
  const ccIc = rel(T('cc').querySelector('.top .ic'), T('cc'));
  ck('V7 cc icon x', ccIc.x, 14); ck('V7 cc icon y', ccIc.y, 19, 2);
  ck('V7 cc status x', rel(T('cc').querySelector('.sub'), T('cc')).x, 52);
  ck('V7 cc name x', rel(T('cc').querySelector('.top .lbl'), T('cc')).x, 52);
  ck('V7 launcher status x', rel(T('la').querySelector('.sub'), T('la')).x, 52);
  const laIc = rel(T('la').querySelector('.top .ic'), T('la'));
  ck('V7 launcher icon centred on the block', laIc.y + laIc.h / 2, 42, 3);
  /* V7 right-side glyph rule: this row opens ITS OWN picker → tune */
  out.sourceCue = T('sp').querySelector('.pickcue').textContent;
  ck('V7 source cue is tune', out.sourceCue === 'tune' ? 1 : 0, 1);
  /* §9 at the panel's 349: the pair splits 297 less one gap; the
     latch trio is the covers' 92; press rides the 84 chassis */
  ck('§9 switch h', R(T('w1')).h, 100);
  const w1s = [...T('w1').querySelectorAll('[data-sw]')].map(x => R(x).w);
  ck('§9 pair segment w', w1s[0], 143.5, 1);
  ck('§9 pair count', w1s.length, 2);
  ck('§9 lock h', R(T('k2')).h, 116);
  const k2s = [...T('k2').querySelectorAll('[data-lk]')]
    .filter(x => !x.classList.contains('hidden')).map(x => R(x).w);
  ck('§9 latch trio count', k2s.length, 3);
  ck('§9 latch trio w', k2s[0], 92, 2);
  ck('§9 press h', R(T('p1')).h, 84);
  /* V7 §5 rows — the canvas row exactly: bare 24px glyph in a 28px
     slot at x14 (no disc), name 15/600 and status 13/400 at x52,
     the tune UNBOXED in the same 28px slot the chevron uses ("the
     chevron perfectly aligns with the tuning icon") */
  const rdw = rel(T('rd').querySelector('.icwrap'), T('rd'));
  ck('row icon slot x', rdw.x, 14); ck('row icon slot w', rdw.w, 28);
  ck('row icon slot is BARE (no disc)',
    getComputedStyle(T('rd').querySelector('.icwrap')).backgroundColor
      === 'rgba(0, 0, 0, 0)' ? 1 : 0, 1);
  ck('row name x', rel(T('rd').querySelector('.lbl'), T('rd')).x, 52);
  ck('row name fs', parseFloat(getComputedStyle(T('rd').querySelector('.lbl')).fontSize), 15);
  ck('row status x', rel(T('rd').querySelector('.sub'), T('rd')).x, 52);
  const rtr = rel(T('rd').querySelector('.trail'), T('rd'));
  ck('row tune is the 28px slot, unboxed', rtr.w, 28);
  ck('row tune unboxed bg',
    getComputedStyle(T('rd').querySelector('.trail')).backgroundColor
      === 'rgba(0, 0, 0, 0)' ? 1 : 0, 1);
  const rcue = rel(T('rn').querySelector('.pickcue'), T('rn'));
  ck('row chevron aligns with the tune slot (same right edge)',
    rcue.x + rcue.w, rtr.x + rtr.w, 1);
  /* a single-line row is ONE line — name centred, no blank row */
  ck('single-line row hides the empty status line',
    getComputedStyle(T('rn').querySelector('.sub')).display === 'none' ? 1 : 0, 1);
  const rnl = rel(T('rn').querySelector('.lbl'), T('rn'));
  ck('single-line row centres the name', rnl.y + rnl.h / 2, 42, 3);
  return { out, bad };
});
console.log(JSON.stringify(audit, null, 1));
if (audit.bad.length) { await b.close(); process.exit(1); }
await p.screenshot({ path: '/tmp/v3-audit.png', fullPage: true });
await b.close();
