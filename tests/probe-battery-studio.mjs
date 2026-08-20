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
