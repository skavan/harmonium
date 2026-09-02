/* REMOTE FLEET fence (design-remote-fleet, 2026-09-02) — the engine's
   half, rendered: hello fires on auth_ok with the unit's identity;
   the command bus rides the normal subscription; the baseline guard
   (first sight never acted on), the freshness guard, the address
   guards, the idle-gated reload, and identify's flash. */
import { chromium } from 'playwright-core';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

const CONFIG = { version: 2, home_screen: 'p', screen_order: ['p'], global: { room: 'P' },
  devices: {}, dialects: {}, activities: {},
  screens: { p: { name: 'P', type: 'hub', sections: [
    { tiles: [{ id: 'd1', type: 'device', entity: 'light.x', label: 'L', icon: 'material:lightbulb' }] }] } },
  controllers: {} };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 349, height: 800 } })).newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await (p.context()).route('**/config.json*', r => r.fulfill({ json: CONFIG }));
/* the engine canonicalizes its address to <ws>/index.html (v0.85.7),
   so the post-reload boot loads main/index.html — in production the
   deployed stub, here the same engine file */
import { readFileSync } from 'node:fs';
const ENGINE = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
await (p.context()).route('**/main/index.html', r =>
  r.fulfill({ body: ENGINE, contentType: 'text/html' }));
const hellos = [];
await (p.context()).route('**/api/harmonium/hello', r => {
  hellos.push({ body: r.request().postDataJSON(),
    auth: r.request().headers()['authorization'] || '' });
  r.fulfill({ json: { ok: true } });
});
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 'tok-abc');
  localStorage.setItem('hakr_host', 'localhost:8482');
  localStorage.setItem('hakr_device', 'astrion');
  /* the mock socket records subscriptions and lets the test inject diffs */
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
  /* deliver on EVERY sub id ever minted — the engine resubscribes
     (activity settling, focus repair), and only the CURRENT id is
     accepted (m.id === S.subId), so extras are inert and the
     injection is timing-proof */
  window.__bus = (seq, attrs) => {
    for (const sub of window.__subs)
      window.__ws.onmessage({ data: JSON.stringify({ type: 'event', id: sub.id,
        event: { a: {}, c: { 'sensor.harmonium_command_bus':
          { '+': { s: String(seq), a: attrs } } } } }) });
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);

/* ---- hello on auth_ok ---- */
ck('hello fired once on connect', hellos.length === 1);
const h = hellos[0] || { body: {}, auth: '' };
ck('hello carries the bearer token', h.auth === 'Bearer tok-abc');
ck('hello carries a persistent unit id (u + 5)', /^u[a-z0-9]{5}$/.test(h.body.unit || ''));
ck('hello names the worn profile', h.body.profile === 'astrion' && h.body.name === 'astrion');
ck('hello carries workspace + page', h.body.workspace === 'main' && h.body.page === 'p');

/* the unit id persists */
const unit = await p.evaluate(() => localStorage.getItem('hakr_unit'));
ck('unit id persisted in localStorage', unit === h.body.unit);

/* ---- the bus entity rides the subscription ---- */
const subbed = await p.evaluate(() =>
  window.__subs.length > 0 && window.__subs.every(s =>
    (s.entity_ids || []).indexOf('sensor.harmonium_command_bus') >= 0));
ck('every subscription includes the command bus entity', subbed);

/* ---- baseline: the FIRST bus state is never acted on ---- */
const now = () => Math.floor(Date.now() / 1000);
const flashed = () => p.evaluate(() =>
  (document.getElementById('screenName')?.textContent || '').indexOf('astrion \u00b7 u') >= 0);
await p.evaluate((ts) => window.__bus(7, { seq: 7, verb: 'identify', target: 'all', workspace: '', label: '', ts }), now());
await p.waitForTimeout(300);
ck('baseline: first bus sighting does nothing', !(await flashed()));

/* ---- a fresh, addressed identify flashes the unit name ---- */
await p.evaluate((ts) => window.__bus(8, { seq: 8, verb: 'identify', target: 'all', workspace: '', label: '', ts }), now());
await p.waitForTimeout(400);
ck('identify flashes the unit name in the status bar', await flashed());

/* ---- fleet v2: identify with a FRIENDLY label flashes that label ---- */
await p.evaluate((ts) => window.__bus(85, { seq: 85, verb: 'identify', target: 'all', workspace: '', label: 'Porch remote', ts }), now());
await p.waitForTimeout(400);
ck('identify flashes the Studio-sent friendly label', await p.evaluate(() =>
  (document.getElementById('screenName')?.textContent || '').indexOf('Porch remote') >= 0));

/* ---- stale ts / wrong workspace / wrong target: all ignored.
   Reload detection: a real reload boots a fresh page, which hellos
   again — hellos.length is the reload counter. ---- */
await p.evaluate((ts) => window.__bus(90, { seq: 90, verb: 'reload', target: 'all', workspace: '', label: '', ts }), now() - 600);
await p.evaluate((ts) => window.__bus(10, { seq: 10, verb: 'reload', target: '', workspace: 'lake', label: '', ts }), now());
await p.evaluate((ts) => window.__bus(11, { seq: 11, verb: 'reload', target: 'rs90', workspace: '', label: '', ts }), now());
await p.waitForTimeout(800);
ck('stale / mis-addressed reloads all ignored', hellos.length === 1);
/* the constant-shape law itself: every payload carries every key, or
   diff-merging resurrects a stale one (the bug this fence caught) */

/* ---- reload is IMMEDIATE (round 9: "I don't think we need 10s of
   quiet") — the fresh boot hellos again ---- */
await p.evaluate((ts) => window.__bus(12, { seq: 12, verb: 'reload', target: 'all', workspace: '', label: '', ts }), now());
let fired = false;
for (let i = 0; i < 12 && !fired; i++) {
  await p.waitForTimeout(500);
  fired = hellos.length >= 2;
}
ck('reload fires immediately (fresh boot hellos again)', fired);
ck('the reborn page kept the SAME unit id', !fired ||
  (hellos[1].body.unit === hellos[0].body.unit));

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
