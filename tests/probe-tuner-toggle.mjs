/* TUNER TOGGLE fence (2026-09-06 — the forum promise, ruled by
   Suresh: "Do it"): channel up/down's destination used to be
   invisible logic (the `tuner` flag, hand-authored only). Both
   control-target blocks (page editor + hub editor share the twin)
   carry a visible switch — "TV tuner — channel up/down go to the
   device".
   ONE SPELLING (same day — Suresh: "shouldn't we add PgUp and PgDn
   to the physical keys... list (and remove them when toggled off)"):
   the flag and ch_up/ch_down in the pass-through list were two
   spellings of one routing (input.js §5.6 honors both). The switch
   now IS the chips: ON adds ch_up + ch_down, OFF removes them, the
   Studio never writes `tuner` again, and a legacy flag heals into
   the chips on load — reported. Plus his #2: "Fill in defaults"
   fills the blanks and unions the standard keys. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));

/* a plain controller PAGE with a control target, no tuner flag */
config.screens.zz_ct = { name: 'ZZ Cable Page', type: 'controller',
  class: 'activity', view_kind: 'controller',
  control_target: { label: '$activity.name', navigation: '$context.dpad',
    power: '$context.power', volume: '$context.volume',
    pass_through: ['up', 'down', 'select'] },
  tiles: [{ id: 'z1', type: 'dpad', entity: '$context.dpad', span: 2 }] };
/* the LEGACY flag, hand-authored — heals into chips on load */
config.screens.zz_legacy = { name: 'ZZ Legacy Tuner', type: 'controller',
  class: 'activity', view_kind: 'controller',
  control_target: { navigation: '$context.dpad', pass_through: ['up'], tuner: true },
  tiles: [{ id: 'z2', type: 'dpad', entity: '$context.dpad', span: 2 }] };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1400 } });
let posted = null;
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
  ? r.fulfill({ json: config })
  : (posted = r.request().postDataJSON(), r.fulfill({ json: { ok: true } })));
await ctx.route('**/api/harmonium/workspaces', r =>
  r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'x', path: '/x/' } } } }));
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: 'x' } }));
await ctx.route('**/api/states', r => r.fulfill({ json: [] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 140)));
await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2000);
ck('heal: the legacy tuner flag is reported as chips on load',
  (await p.evaluate(() => document.body.textContent.replace(/\s+/g, ' ')))
    .includes('1 TV-tuner flag became ch_up / ch_down'));
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')].find(x => x.textContent.includes('ZZ Cable Page'))?.click();
});
await p.waitForTimeout(700);

const body = () => p.evaluate(() => document.body.textContent.replace(/\s+/g, ' '));
let t = await body();
ck('the switch is offered beside the pass-through chips',
  t.includes('TV tuner — channel up/down go to the device'));

/* flip it ON → save carries control_target.tuner: true */
const flip = () => p.evaluate(() => {
  const lbl = [...document.querySelectorAll('label')]
    .find(x => x.textContent.includes('TV tuner — channel up/down'));
  lbl?.querySelector('button, [role="switch"]')?.click();
  return !!lbl;
});
ck('the switch is clickable', await flip());
await p.waitForTimeout(300);
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('Save & Deploy'))?.click();
});
await p.waitForTimeout(900);
const ptOn = posted?.screens?.zz_ct?.control_target?.pass_through || [];
ck('ON adds ch_up + ch_down to the passed keys (the switch IS the chips)',
  ptOn.includes('ch_up') && ptOn.includes('ch_down'));
ck('ON never writes the legacy tuner flag',
  !('tuner' in (posted?.screens?.zz_ct?.control_target || {})));
ck('heal: the legacy flag became chips and left the config',
  (posted?.screens?.zz_legacy?.control_target?.pass_through || []).includes('ch_up') &&
  (posted?.screens?.zz_legacy?.control_target?.pass_through || []).includes('ch_down') &&
  !('tuner' in (posted?.screens?.zz_legacy?.control_target || {})));

/* flip it OFF → the key is DELETED, not false */
await flip();
await p.waitForTimeout(300);
posted = null;
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('Save & Deploy'))?.click();
});
await p.waitForTimeout(900);
const ptOff = posted?.screens?.zz_ct?.control_target?.pass_through || [];
ck('OFF removes ch_up + ch_down again (the authored keys stay)',
  !ptOff.includes('ch_up') && !ptOff.includes('ch_down') && ptOff.includes('select'));

/* FILL IN DEFAULTS (his #2): the TV-surface shape — blanks take the
   $ tokens, the standard keys join the list; what's set is kept */
ck('fill-in: the button is offered', await p.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Fill in defaults');
  b?.click(); return !!b;
}));
await p.waitForTimeout(300);
posted = null;
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('Save & Deploy'))?.click();
});
await p.waitForTimeout(900);
const ptFill = posted?.screens?.zz_ct?.control_target?.pass_through || [];
ck('fill-in: the standard keys joined the list, authored order first',
  ptFill.slice(0, 3).join() === 'up,down,select' &&
  ['left', 'right', 'back', 'home', 'power'].every(k => ptFill.includes(k)) &&
  ptFill.length === 8);
ck('fill-in: the authored $ fields were kept, not clobbered',
  posted?.screens?.zz_ct?.control_target?.label === '$activity.name' &&
  posted?.screens?.zz_ct?.control_target?.navigation === '$context.dpad');

console.log(JSON.stringify({ ok: !errs.length, errs }, null, 1));
await b.close();
process.exit(errs.length ? 1 : 0);
