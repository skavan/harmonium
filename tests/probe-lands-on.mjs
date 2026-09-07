/* LANDS-ON TRIAGE fence (2026-09-06 — Suresh, three bugs in one
   screenshot):
   1. "Why do I have 'Devices' and 'Music Media Player'. Shouldn't it
      just be TV derived *activity* controllers?" — the Lands-on
      dropdown offers ACTIVITY surfaces only (device controllers are
      per-device pages, adopted from device cards), with the surfaces
      suiting the activity's shape leading and other shapes below in
      their own optgroup — suggestions, never a cage.
   2. "I thought these were templates. i.e. $device. The only time
      that should happen is if a device is hardcoded" — the legacy
      2026-09-04 copy flow bound copies to entities; the load heal
      releases such a copy into a template (the owning device adopts
      it via page:), reported, permanent at Save & Deploy.
   3. The controller editor's preview-as list groups the same way:
      uses-this first, same-shape next, everything else after — all
      selectable. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));

/* the LEGACY BOUND COPY (bug 2's fixture): a device-domain copy
   carrying the entity it was made for, plus the pre-wired device
   that owns the entity (no page pick of its own yet) */
config.controllers.zz_mp_copy = { name: 'ZZ Minimal Device',
  class: 'activity', view_kind: 'controller', type: 'controller',
  domain: 'media_player', variant_of: 'media_player',
  entity: 'media_player.zz_samq', sections: [] };
config.devices.zz_samq = { name: 'ZZ Sam',
  roles: { media_player: 'media_player.zz_samq' } };
/* a custom copy of the tv stock (should group beside it), and a
   listen shape on the music activity so the grouping has both sides */
config.controllers.zz_tv_copy = { name: 'ZZ Styled TV',
  class: 'activity', view_kind: 'controller', type: 'controller',
  variant_of: 'tv', sections: [] };
config.activities.music.kind = 'listen';

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

/* ---- bug 2: the load heal released the binding, out loud ---- */
const body = () => p.evaluate(() => document.body.textContent.replace(/\s+/g, ' '));
ck('heal: the status line reports the released copy',
  (await body()).includes('released 1 device controller copy into a template'));

/* ---- bug 1: the Lands-on dropdown on a WATCH activity ---- */
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')].find(x => x.textContent.includes('Porch'))?.click();
});
await p.waitForTimeout(500);
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => /^[▶▼]/.test(x.textContent.trim()) && x.textContent.includes('Watch Fire TV'))?.click();
});
await p.waitForTimeout(600);
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Controller')?.click();
});
await p.waitForTimeout(500);
const lands = await p.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find(s =>
    [...s.options].some(o => o.textContent.includes('pick a controller')));
  if (!sel) return null;
  return {
    groups: [...sel.querySelectorAll('optgroup')].map(g => g.label),
    byGroup: [...sel.querySelectorAll('optgroup')].map(g =>
      [...g.querySelectorAll('option')].map(o => o.textContent.trim())),
    all: [...sel.options].map(o => o.textContent.trim()),
  };
});
ck('lands-on: the select renders', !!lands);
ck('lands-on: Suits Watch leads, Other shapes follows',
  lands && lands.groups[0] === 'Suits Watch (TV / movie)' &&
  lands.groups[1] === 'Other shapes');
ck('lands-on: the TV stock and its copy sit in the suits group',
  lands && lands.byGroup[0]?.some(x => x.includes('TV Media Player')) &&
  lands.byGroup[0]?.some(x => x.includes('ZZ Styled TV')));
ck('lands-on: Music stays offered — never a cage — under Other shapes',
  lands && lands.byGroup[1]?.some(x => x.includes('Music Media Player')));
ck('lands-on: no device controllers offered (domain stocks, device copies)',
  lands && !lands.all.some(x => /Climate|Light|Cover|Fan|Switch|ZZ Minimal|Media Device/.test(x)));
ck('lands-on: no drawers offered',
  lands && !lands.all.some(x => /Apps|Music Library/.test(x)));
ck('lands-on: nothing wears the "— for entity" tail anymore',
  lands && !lands.all.some(x => x.includes('— for ')));

/* ---- bug 3: the controller editor's preview-as groups ---- */
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')].find(x =>
    x.textContent.includes('TV Media Player'))?.click();
});
await p.waitForTimeout(600);
const pv = await p.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find(s =>
    [...s.options].some(o => o.textContent.includes('preview as an activity')));
  if (!sel) return null;
  return {
    groups: [...sel.querySelectorAll('optgroup')].map(g => g.label),
    byGroup: [...sel.querySelectorAll('optgroup')].map(g =>
      [...g.querySelectorAll('option')].map(o => o.textContent.trim())),
  };
});
ck('preview-as: the select renders on the stock tv controller', !!pv);
/* his #1, the other kind: an activity surface says so, and the tree
   does NOT tag it $device */
ck('activity flag: the edit page says Activity surface', await p.evaluate(() =>
  !!document.querySelector('[data-ctrl-kind="activity"]') &&
  document.body.textContent.includes('Activity surface')));
ck('activity flag: the tree tags no activity surface with $device', await p.evaluate(() =>
  ![...document.querySelectorAll('#nav .item')].some(x =>
    x.textContent.includes('TV Media Player') && x.textContent.includes('$device'))));
ck('preview-as: uses-this leads',
  pv && pv.groups[0] === 'Uses this controller' &&
  pv.byGroup[0]?.some(x => x.includes('Watch Fire TV')));
ck('preview-as: the other-shape activity still offered below',
  pv && pv.groups.includes('Other activities') &&
  pv.byGroup[pv.groups.indexOf('Other activities')]
    ?.some(x => x.includes('Listen to Music')));

/* ---- the padlock must not eat an explicit pick (2026-09-06 —
   Suresh: "selecting an entry does nothing!": previewActivity
   honored pvLock so silently the select read as broken; an explicit
   pick forces through, like previewGoto always has) ---- */
await p.evaluate(() => document.querySelector('#pvLock')?.click());
await p.waitForTimeout(200);
ck('padlock: engaged for the fence', await p.evaluate(() =>
  !!document.querySelector('#pvLock')));
await p.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find(s =>
    [...s.options].some(o => o.textContent.includes('preview as an activity')));
  if (sel) { sel.value = 'watch_firetv';
    sel.dispatchEvent(new Event('change', { bubbles: true })); }
});
await p.waitForTimeout(800);
const fr = p.frames().find(f => f.url().includes('local/harmonium/index.html'));
ck('padlock: the explicit preview-as pick still impersonates',
  fr && await fr.evaluate(() => S.pvActivity === 'watch_firetv'));
await p.evaluate(() => document.querySelector('#pvLock')?.click());
await p.waitForTimeout(200);

/* ---- PREVIEW-AS IS THE LAW (2026-09-06 — Suresh: "Changing Preview
   does nothing", padlock OFF): the engine's ownership gate swapped a
   non-owner pick for the surface's presumed owner, so $context, Now
   Playing, the dialect keys and the title all stayed the owner's.
   Listen to Music does NOT own the tv surface — previewing tv as it
   must render AS it: renderActivityId answers it, the title wears its
   name, the Devices band shows its cast. ---- */
await p.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find(s =>
    [...s.options].some(o => o.textContent.includes('preview as an activity')));
  if (sel) { sel.value = 'music';
    sel.dispatchEvent(new Event('change', { bubbles: true })); }
});
await p.waitForTimeout(900);
const asMusic = fr && await fr.evaluate(() => ({
  render: renderActivityId(),
  title: (document.getElementById('screenName') || {}).textContent || '',
  screen: S.screen,
}));
ck('preview-as: a NON-owner activity renders as itself (renderActivityId)',
  asMusic && asMusic.render === 'music' && asMusic.screen === 'controller:tv');
ck('preview-as: the surface wears the impersonated activity\'s name',
  asMusic && /Listen to Music/.test(asMusic.title));

/* ---- THE RULING (2026-09-07 — Suresh: "If I am looking at or
   editing a controller, the only thing I care about is that
   controller's rendering. I choose a preview because that is the
   only way I can see what the controller I'm looking at will
   render." and: "The controller bits should stay as is... by
   activity overrides... but not permeate into a controller
   preview."). So: an activity's Controller-tab overrides apply on
   the remote and in the ACTIVITY card's preview; the CONTROLLER
   editor's preview is bare — the controller's own settings with the
   pick's cast — pick or no pick. Dress watch_smart with
   np_style: slim (NOT the stock's own default, which is Art since
   gen 2 — the fence must dress with something the controller itself
   would never draw) and prove all three. ---- */
await fr.evaluate(() => { CONFIG.activities.watch_smart.surface = { np_style: 'slim' }; });
const npOf = () => fr.evaluate(() => {
  const el = document.getElementById('tile_t_np');
  return { bare: !!S.pvBare, pv: S.pvActivity, screen: S.screen,
    cls: el ? el.className : '', h: el ? el.offsetHeight : 0 };
});
/* 1. controller editor, no pick: bare, the controller's own shape */
await p.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find(s =>
    [...s.options].some(o => o.textContent.includes('preview as an activity')));
  if (sel) { sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); }
});
await p.waitForTimeout(700);
const noPick = fr && await npOf();
ck('controller editor, no pick: bare — the owner\'s override does not leak',
  noPick && noPick.bare === true && !noPick.pv && !/\bslim\b/.test(noPick.cls));
/* 2. controller editor, picked the DRESSED activity: still the
      controller's own shape — same class, same height as no-pick */
await p.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find(s =>
    [...s.options].some(o => o.textContent.includes('preview as an activity')));
  if (sel) { sel.value = 'watch_smart'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
});
await p.waitForTimeout(800);
const picked = fr && await npOf();
ck('controller editor, dressed pick: bare — the pick supplies the cast, not the look',
  picked && picked.bare === true && picked.pv === 'watch_smart' &&
  !/\bslim\b/.test(picked.cls) && noPick && picked.cls === noPick.cls && picked.h === noPick.h);
/* 3. the ACTIVITY card's own preview of the same pair: the override
      applies (that's where it's edited) */
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')].find(x => x.textContent.includes('Porch'))?.click();
});
await p.waitForTimeout(500);
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => /^[▶▼]/.test(x.textContent.trim()) && x.textContent.includes('Watch Smart TV'))?.click();
});
await p.waitForTimeout(700);
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Controller')?.click();
});
await p.waitForTimeout(800);
await fr.evaluate(() => { if (!CONFIG.activities.watch_smart.surface) CONFIG.activities.watch_smart.surface = { np_style: 'slim' }; navigate(S.screen, true); });
await p.waitForTimeout(400);
const fromCard = fr && await npOf();
ck('activity card: NOT bare — its override (Slim) applies, as on the remote',
  fromCard && fromCard.bare === false && fromCard.pv === 'watch_smart' && /\bslim\b/.test(fromCard.cls));
/* back to the controller editor for the save fence below */
await fr.evaluate(() => { delete CONFIG.activities.watch_smart.surface; });
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')].find(x => x.textContent.includes('TV Media Player'))?.click();
});
await p.waitForTimeout(600);

/* ---- the heal is permanent at Save & Deploy ---- */
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('Save & Deploy'))?.click();
});
await p.waitForTimeout(900);
ck('save: the released copy carries no entity',
  posted && !('entity' in (posted.controllers?.zz_mp_copy || {})));
ck('save: the owning device adopted the copy via page:',
  posted?.devices?.zz_samq?.page === 'zz_mp_copy');

console.log(JSON.stringify({ ok: !errs.length, errs }, null, 1));
await b.close();
process.exit(errs.length ? 1 : 0);
