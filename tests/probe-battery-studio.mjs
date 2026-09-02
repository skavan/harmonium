/* BATTERY ALERTS IN THE STUDIO probe (2026-08-20 — Suresh: "At a
   minimum, we should have a System → Remotes -> Battery Alerts with
   a link to the automation so we can see it and turn it on/off").
   The Remotes & keymaps slice grew a visual editor. Under test:
   · profile summary cards render from the draft's remotes;
   · the battery panel DISCOVERS the blueprint automation live
     (states → config API → use_blueprint.path match), shows level,
     tier profile, window, channels;
   · the Edit link points at HA's automation editor;
   · the switch flips the automation (service call captured,
     optimistic state);
   · a discovery failure degrades to the manage-in-HA note. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const cfg = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));

const AUTO_ID = '1787191977360';
const STATES = [
  { entity_id: 'automation.harmonium_astrion1_battery_alerts', state: 'on',
    attributes: { id: AUTO_ID, friendly_name: 'Harmonium: Astrion1 battery alerts' } },
  { entity_id: 'automation.unrelated_battery_thing', state: 'on',
    attributes: { id: '999', friendly_name: 'Some other battery automation' } },
  { entity_id: 'sensor.astrion1_battery', state: '17',
    attributes: { friendly_name: 'Astrion1 Battery', device_class: 'battery' } },
  { entity_id: 'binary_sensor.astrion1_plugged_in', state: 'off',
    attributes: { friendly_name: 'Astrion1 Plugged in' } },
];
const AUTO_CFG = {
  id: AUTO_ID, alias: 'Harmonium: Astrion1 battery alerts',
  use_blueprint: { path: '127.0.0.1/battery_alerts.yaml', input: {
    battery_sensor: 'sensor.astrion1_battery',
    plugged_sensor: 'binary_sensor.astrion1_plugged_in',
    tts_notify: 'notify.astrion1_text_to_speech',
    overlay_notify: 'notify.astrion1_overlay_message',
  } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
const svcCalls = [];
await ctx.route('**/api/harmonium/config*', route =>
  route.request().method() === 'POST' ? route.fulfill({ json: { ok: true } })
    : route.fulfill({ json: cfg }));
await ctx.route('**/api/harmonium/workspaces', route =>
  route.fulfill({ json: { order: ['main'],
    workspaces: { main: { name: 'Main', file: 'config.json' } } } }));
await ctx.route('**/api/harmonium/engine_version', route =>
  route.fulfill({ json: { v: '0.84.1', bundled: '0.84.1', integration: '0.84.1' } }));
await ctx.route('**/api/harmonium/pair_admin', route =>
  route.fulfill({ json: { pending: [] } }));
/* THE FLEET (design-remote-fleet v2): a linked unit (Fully joined,
   no alert yet — sensor differs from the battery fixture's) and a
   stale unlinked one with a suggested match */
const cmdCalls = [], linkCalls = [], createCalls = [];
await ctx.route('**/api/harmonium/fleet', route =>
  route.fulfill({ json: {
    blueprint: '127.0.0.1/battery_alerts.yaml',
    fully: [ { id: 'devA', name: 'Astrion2', host: '192.168.9.9' },
             { id: 'devB', name: 'Kitchen RS90', host: '192.168.9.10' } ],
    units: [
      { unit: 'uk3m7p', name: 'astrion', profile: 'astrion', workspace: 'main',
        version: '0.87.0', age: 40, liveness: 'online',
        fully_device: 'devA', fully_name: 'Astrion2', friendly: 'Porch remote',
        battery: 64, charging: false, url: 'http://ha.local:8123/local/harmonium/main/index.html',
        fully: { battery_sensor: 'sensor.astrion2_battery',
          plugged_sensor: 'binary_sensor.astrion2_plugged_in',
          tts_notify: 'notify.astrion2_text_to_speech',
          overlay_notify: 'notify.astrion2_overlay_message' } },
      { unit: 'uw9r2t', name: 'rs90', profile: 'rs90', workspace: 'main',
        version: '0.86.0', battery: 12, age: 400000, liveness: 'stale',
        fully_suggest: 'devB' },
    ] } }));
await ctx.route('**/api/harmonium/fleet/*', route => {
  linkCalls.push({ url: route.request().url().split('/').pop(),
    body: route.request().postDataJSON() });
  route.fulfill({ json: { ok: true, changed: true } });
});
await ctx.route('**/api/harmonium/command', route => {
  cmdCalls.push(route.request().postDataJSON());
  route.fulfill({ json: { ok: true, seq: 5, online: 1 } });
});
/* alert CREATE lands as a POST on a fresh automation id; GETs of the
   battery fixtures keep their own routes (registered above = lower
   priority, so fall through for them) */
await ctx.route('**/api/config/automation/config/*', route => {
  if (route.request().method() !== 'POST') return route.fallback();
  createCalls.push({ id: route.request().url().split('/').pop(),
    body: route.request().postDataJSON() });
  route.fulfill({ json: { result: 'ok' } });
});
await ctx.route('**/api/states', route => route.fulfill({ json: STATES }));
await ctx.route(`**/api/config/automation/config/${AUTO_ID}`, route =>
  route.fulfill({ json: AUTO_CFG }));
await ctx.route('**/api/config/automation/config/999', route =>
  route.fulfill({ json: { id: '999', alias: 'Some other battery automation' } }));
await ctx.route('**/api/services/automation/*', route => {
  svcCalls.push({ url: route.request().url().split('/').pop(),
    body: route.request().postDataJSON() });
  route.fulfill({ json: [] });
});
const notifyCalls = [];
await ctx.route('**/api/services/notify/send_message', route => {
  notifyCalls.push(route.request().postDataJSON());
  route.fulfill({ json: [] });
});
await ctx.route('**/harmonium-static/studio.html', route =>
  route.fulfill({ body: studio, contentType: 'text/html' }));
await ctx.route('**api.github.com/**', route => route.abort());

const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await p.addInitScript(() => localStorage.setItem('hakr_token', 'stub-token'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2200);

/* open System → Remotes & keymaps */
await p.evaluate(() => {
  const el = [...document.querySelectorAll('#nav .item')]
    .find(x => /Remotes/i.test(x.textContent || ''));
  el?.click(); });
await p.waitForTimeout(1200);

const r = {};
r.visualTab = await p.evaluate(() =>
  document.querySelector('#tabVisual')?.getAttribute('aria-selected') === 'true');
r.profiles = await p.evaluate(() => {
  const t = document.body.textContent;
  return { hasDefault: /default/.test(t) && /keys mapped/.test(t),
    hasAstrion: /astrion/.test(t) };
});
r.row = await p.evaluate(() => {
  const t = document.body.textContent;
  return {
    alias: t.includes('Harmonium: Astrion1 battery alerts'),
    level: t.includes('17%'),
    tiers: t.includes('20% → 60m'),
    window: t.includes('09:00–23:00'),
    channels: t.includes('voice · banner'),
    onlyOne: !t.includes('Some other battery automation'),
  };
});
r.fleet = await p.evaluate(() => {
  const t = document.body.textContent;
  return {
    header: t.includes('Your remotes'),
    unitRow: t.includes('uk3m7p') && t.includes('wears'),
    friendlyShown: t.includes('Porch remote'),   /* friendly beats profile */
    battery: t.includes('64%'),
    staleX: [...document.querySelectorAll('button')].some(b =>
      b.textContent.trim() === '\u2715'),
    reloadBtns: [...document.querySelectorAll('button')]
      .filter(b => b.textContent.trim() === 'Reload').length,
  };
});
/* open the linked unit's panel: Fully select, friendly name, URL,
   suggested match on the other row, and Create battery alert */
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(b => b.textContent.trim() === '\u25b8')?.click(); });
await p.waitForTimeout(300);
r.panel = await p.evaluate(() => {
  const t = document.body.textContent;
  const sel = [...document.querySelectorAll('select')].find(s =>
    [...s.options].some(o => /not linked/.test(o.label)));
  return {
    fullySelected: sel && sel.value === 'devA',
    url: t.includes('showing: http://ha.local:8123/local/harmonium/main/index.html'),
    createBtn: t.includes('Create battery alert'),
  };
});
/* friendly rename posts a link */
await p.evaluate(() => {
  const inp = [...document.querySelectorAll('input')].find(i =>
    i.placeholder === 'Astrion2' || i.value === 'Porch remote');
  inp.value = 'Veranda';
  inp.dispatchEvent(new Event('change', { bubbles: true })); });
await p.waitForTimeout(300);
r.link = linkCalls[0] || null;
/* Create battery alert posts the pre-wired blueprint automation */
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(b => /Create battery alert/.test(b.textContent))?.click(); });
await p.waitForTimeout(400);
r.created = createCalls[0] || null;
/* identify from the row carries the friendly label */
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(b => b.textContent.trim() === 'Identify')?.click(); });
await p.waitForTimeout(300);
r.identifyLabel = (cmdCalls.find(c => c && c.verb === 'identify') || {}).label;
/* the preview LOCK (round 9): toggles, shows the locked style */
r.pvLock = { present: await p.evaluate(() => !!document.getElementById('pvLock')) };
const lockedBefore = await p.evaluate(() =>
  document.getElementById('pvLock')?.className.includes('bg-accent'));
await p.evaluate(() => document.getElementById('pvLock')?.click());
await p.waitForTimeout(150);   /* Svelte flushes async */
r.pvLock.toggles = !lockedBefore && await p.evaluate(() =>
  document.getElementById('pvLock')?.className.includes('bg-accent'));
await p.evaluate(() => document.getElementById('pvLock')?.click());
await p.waitForTimeout(150);   /* leave unlocked for the rest */
/* Reload all posts the workspace-addressed command */
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(b => /Reload all/.test(b.textContent))?.click(); });
await p.waitForTimeout(400);
r.fleetCmd = cmdCalls.find(c => c && c.verb === 'reload') || null;
r.editHref = await p.evaluate(() =>
  [...document.querySelectorAll('a')]
    .find(a => /Edit levels/.test(a.textContent))?.getAttribute('href'));

await p.screenshot({ path: '/home/claude/shots/battery-studio.png',
  clip: { x: 240, y: 0, width: 1100, height: 720 } });

/* the switch flips the automation */
await p.evaluate(() => {
  [...document.querySelectorAll('[role="switch"]')].pop()?.click(); });
await p.waitForTimeout(300);
r.toggle = { calls: [...svcCalls],
  nowOff: await p.evaluate(() =>
    [...document.querySelectorAll('[role="switch"]')].pop()
      ?.getAttribute('aria-checked') === 'false') };

/* TEST button: fires with conditions skipped, then self-cleans the
   persistent Fully overlay banner (his "stuck on 100%" screenshot) */
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => x.textContent.trim() === 'Test')?.click(); });
await p.waitForTimeout(400);
r.test = { fired: svcCalls.filter(c => c.url === 'trigger'),
  statusText: await p.evaluate(() => /banner clears itself/.test(document.body.textContent)) };
await p.waitForTimeout(6500);
r.testCleanup = notifyCalls;

console.log(JSON.stringify({ ...r,
  ok: r.visualTab && r.profiles.hasDefault && r.profiles.hasAstrion &&
      r.row.alias && r.row.level && r.row.tiers && r.row.window &&
      r.row.channels && r.row.onlyOne &&
      r.editHref === '/config/automation/edit/' + '1787191977360' &&
      r.fleet.header && r.fleet.unitRow && r.fleet.battery &&
      r.fleet.friendlyShown && r.fleet.staleX && r.fleet.reloadBtns === 2 &&
      r.panel.fullySelected && r.panel.url && r.panel.createBtn &&
      r.link && r.link.url === 'uk3m7p' && r.link.body.friendly === 'Veranda' &&
      r.created && /battery_alerts\.yaml$/.test(r.created.body.use_blueprint.path) &&
      r.created.body.use_blueprint.input.battery_sensor === 'sensor.astrion2_battery' &&
      r.created.body.use_blueprint.input.overlay_notify === 'notify.astrion2_overlay_message' &&
      /Porch remote|Veranda/.test(r.created.body.alias) &&
      r.identifyLabel === 'Porch remote' &&
      r.pvLock.present && r.pvLock.toggles &&
      r.fleetCmd && r.fleetCmd.verb === 'reload' && r.fleetCmd.workspace === 'main' &&
      r.toggle.calls.length === 1 && r.toggle.calls[0].url === 'turn_off' &&
      r.toggle.calls[0].body.entity_id === 'automation.harmonium_astrion1_battery_alerts' &&
      r.toggle.nowOff &&
      r.test.fired.length === 1 && r.test.fired[0].body.skip_condition === true &&
      r.test.statusText &&
      r.testCleanup.length === 1 && r.testCleanup[0].message === '' &&
      r.testCleanup[0].entity_id === 'notify.astrion1_overlay_message' &&
      errs.length === 0,
  errs }, null, 1));
await b.close();
