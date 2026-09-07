/* DESIGN-GUIDE fence (2026-09-04 — Suresh: "We need a test to make
   sure our design guide is followed"). Measures the canvases' ruled
   geometry in the REAL engine, so a layout break like the aircon's
   icon-aligned state line can never ship silently again.

   Laws fenced, with their sources:
   · control language V9, TWO-VALUE TILES: one editable value, in the
     control row; the read-only state lives in the TITLE BLOCK —
     fat = a second line indented to the NAME (never the icon),
     h 155→175; compact = far right of the title row, h 100 unchanged,
     state capped at 90px and the STATE ellipsises, never the name;
     the tune glyph centres on the name row, not the two-line block.
   · the shared two-line law (V7, launchers): name and status share
     one left edge on every two-line tile.
   · identity palette V3: azure is the ninth slot at the formula's
     own #419df0; red/green/blue alias to coral/jade/azure; yellow
     is REFUSED (reserved focus arc) — no accent, never olive. */
import { chromium } from 'playwright-core';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

const CONFIG = { version: 2, home_screen: 'p', screen_order: ['p'], global: { room: 'P' },
  devices: {}, dialects: {}, activities: {}, controllers: {},
  screens: { p: { name: 'P', type: 'hub', sections: [{ columns: 1, tiles: [
    { id: 'ci', type: 'climate', variant: 'inline', entity: 'climate.ac',
      label: 'Air Conditioner', icon: 'material:mode_fan', span: 2 },
    { id: 'cc', type: 'climate', variant: 'compact', entity: 'climate.ac',
      label: 'Air Conditioner', icon: 'material:mode_fan', span: 2 },
    /* the long-state specimen: the STATE must ellipsise, not the name */
    { id: 'cx', type: 'climate', variant: 'compact', entity: 'climate.long',
      label: 'Air Conditioner', icon: 'material:mode_fan', span: 2 },
    { id: 'ln', type: 'device', entity: 'light.z1', label: 'Porch Lights',
      icon: 'material:light', span: 2 },
    { id: 'az', type: 'device', entity: 'light.z1', label: 'A', accent: 'azure' },
    { id: 'al', type: 'device', entity: 'light.z1', label: 'B', accent: 'blue' },
    { id: 'ar', type: 'device', entity: 'light.z1', label: 'C', accent: 'red' },
    { id: 'ag', type: 'device', entity: 'light.z1', label: 'D', accent: 'green' },
    { id: 'ay', type: 'device', entity: 'light.z1', label: 'E', accent: 'yellow' },
  ] }] } } };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 349, height: 1200 } })).newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await (p.context()).route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.__subs = [];
  window.WebSocket = class {
    constructor() { window.__ws = this;
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const g = JSON.parse(m);
      if (g.type === 'subscribe_entities') window.__subs.push(g);
      const r = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (g.type === 'auth') r({ type: 'auth_ok' });
      else r({ type: 'result', id: g.id, success: true, result: null }); }
    close() {}
  };
  window.__diff = (ents) => {
    for (const sub of window.__subs) {
      const c = {};
      for (const k in ents) c[k] = { '+': { s: ents[k].s, a: ents[k].a } };
      window.__ws.onmessage({ data: JSON.stringify({ type: 'event', id: sub.id,
        event: { a: {}, c } }) });
    }
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => window.__diff({
  'climate.ac': { s: 'cool', a: { temperature: 70, current_temperature: 75,
    min_temp: 45, max_temp: 95, target_temp_step: 1 } },
  'climate.long': { s: 'defrosting and drying', a: { temperature: 70,
    current_temperature: 75, min_temp: 45, max_temp: 95 } },
  'light.z1': { s: 'on', a: { brightness: 242 } } }));
await p.waitForTimeout(400);

const m = await p.evaluate(() => {
  const q = (id, sel) => document.querySelector('#tile_' + id + ' ' + sel);
  const r = (el) => el ? el.getBoundingClientRect() : null;
  const t = (id) => r(document.getElementById('tile_' + id));
  const cls = (id) => document.getElementById('tile_' + id).className;
  const fatSub = q('ci', '.sub:not(.subin)');
  const ccSub = q('cc', '.sub.subin');
  const cxSub = q('cx', '.sub.subin');
  const cxLbl = q('cx', '.lbl');
  return {
    fat: { lblX: r(q('ci', '.lbl')).left, subX: r(fatSub).left,
      icX: r(q('ci', '.ic')).left, icW: r(q('ci', '.ic')).width,
      h: t('ci').height,
      trailCY: r(q('ci', '.trail')).top + r(q('ci', '.trail')).height / 2,
      nameRowCY: r(q('ci', '.top')).top + r(q('ci', '.top')).height / 2,
      subColor: getComputedStyle(fatSub).color },
    cc: { h: t('cc').height,
      onTitleRow: Math.abs((r(ccSub).top + r(ccSub).height / 2) -
        (r(q('cc', '.top')).top + r(q('cc', '.top')).height / 2)) < 1.5,
      fs: getComputedStyle(ccSub).fontSize, fw: getComputedStyle(ccSub).fontWeight,
      maxW: getComputedStyle(ccSub).maxWidth },
    cx: { subClipped: cxSub.scrollWidth > cxSub.clientWidth + 1,
      lblClipped: cxLbl.scrollWidth > cxLbl.clientWidth + 1,
      subW: r(cxSub).width },
    launcher: { lblX: r(q('ln', '.lbl')).left, subX: r(q('ln', '.sub')).left },
    palette: { az: cls('az'), al: cls('al'), ar: cls('ar'), ag: cls('ag'), ay: cls('ay'),
      azTacc: getComputedStyle(document.getElementById('tile_az'))
        .getPropertyValue('--tacc').trim() },
    dim: getComputedStyle(document.body).getPropertyValue('--dim') };
});

/* ---- V9 · fat two-value ---- */
ck('fat: the state line is indented to the NAME, never the icon',
  m.fat.subX === m.fat.lblX && m.fat.subX > m.fat.icX + 20);
ck('fat: the icon column stays a pure 28px gutter', Math.round(m.fat.icW) === 28);
ck('fat: height is the ruled 175 with a state line',
  m.fat.h >= 173 && m.fat.h <= 178);
ck('fat: tune centres on the NAME ROW, not the two-line block',
  Math.abs(m.fat.trailCY - m.fat.nameRowCY) <= 3);
ck('fat: an active state renders in accent, not dim',
  m.fat.subColor !== 'rgb(139, 148, 158)' &&
  !m.dim.trim().startsWith(m.fat.subColor));

/* ---- V9 · compact two-value ---- */
ck('compact: height stays the ruled 100 — the state buys no third row',
  Math.round(m.cc.h) === 100);
ck('compact: the state rides the TITLE ROW, far right', m.cc.onTitleRow);
ck('compact: the state wears the status style (13px / 400)',
  m.cc.fs === '13px' && m.cc.fw === '400');
ck('compact: the state is capped at the ruled 90px', m.cc.maxW === '90px');
ck('compact: a long state ellipsises ITSELF and never the name',
  m.cx.subClipped && !m.cx.lblClipped && m.cx.subW <= 91);

/* ---- V7 · the shared two-line left edge ---- */
ck('the launcher two-line law holds (name and status share one x)',
  m.launcher.lblX === m.launcher.subX);
ck('fat two-value and the launcher agree on the indent law',
  Math.abs(m.fat.subX - m.fat.lblX) === Math.abs(m.launcher.subX - m.launcher.lblX));

/* ---- palette V3 · azure + the primary-name aliases ---- */
ck('azure is a real ninth slot', m.palette.az.indexOf('id-azure') >= 0);
ck('azure paints the canvas hex (#419df0)',
  m.palette.azTacc === '#419df0' || m.palette.azTacc === 'rgb(65, 157, 240)');
ck('blue aliases to azure', m.palette.al.indexOf('id-azure') >= 0);
ck('red aliases to coral', m.palette.ar.indexOf('id-coral') >= 0);
ck('green aliases to jade', m.palette.ag.indexOf('id-jade') >= 0);
ck('yellow is REFUSED — no accent, never olive',
  m.palette.ay.indexOf('id-') < 0);

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
