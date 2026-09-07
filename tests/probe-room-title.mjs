/* ROOM-PREFIX fence (2026-09-04 — Suresh: "If I navigate to
   Deck>Heaters page, it says Porch-Heaters in title, while
   Deck-Screens correctly says [Deck]!"). The title's room prefix
   walks the PARENT CHAIN: own room_name → nearest ancestor's
   room_name (a room-page ancestor answers with its name) →
   global.room. Mirrors his config exactly: `screens` carries an
   explicit room_name, `heaters` relies on its parent DECK, `orphan`
   has no chain and keeps the global fallback. */
import { chromium } from 'playwright-core';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

const CONFIG = { version: 2, home_screen: 'deck', screen_order: ['deck'],
  global: { room: 'Porch' },
  devices: {}, dialects: {}, activities: {}, controllers: {},
  screens: {
    deck: { name: 'Deck', class: 'room', room: true, room_name: 'Deck',
      type: 'hub', tiles: [{ id: 'n1', type: 'nav', target: 'heaters', label: 'H' }] },
    screens: { name: 'Screens', class: 'group', parent: 'deck',
      room_name: 'Deck', type: 'hub', tiles: [
        { id: 's1', type: 'device', entity: 'cover.s1', label: 'S1' }] },
    heaters: { name: 'Heaters', class: 'group', parent: 'deck', type: 'hub',
      tiles: [{ id: 'h1', type: 'device', entity: 'light.z1', label: 'Z1' }] },
    /* a grandchild leans on the SAME walk, two hops up */
    zones: { name: 'Zones', class: 'group', parent: 'heaters', type: 'hub',
      tiles: [{ id: 'z1', type: 'device', entity: 'light.z1', label: 'Z1' }] },
    orphan: { name: 'Orphan', class: 'group', type: 'hub',
      tiles: [{ id: 'o1', type: 'device', entity: 'light.z1', label: 'Z1' }] },
  } };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 349, height: 700 } })).newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await (p.context()).route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const g = JSON.parse(m);
      const r = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (g.type === 'auth') r({ type: 'auth_ok' });
      else r({ type: 'result', id: g.id, success: true, result: null }); }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(800);

const title = () => p.evaluate(() =>
  document.getElementById('screenName').textContent);

ck('the room page titles as itself, no doubled prefix',
  await title() === 'Deck');
await p.evaluate(() => navigate('heaters'));
await p.waitForTimeout(200);
ck('a child WITHOUT room_name inherits its parent room (his bug)',
  await title() === 'Deck · Heaters');
await p.evaluate(() => navigate('zones'));
await p.waitForTimeout(200);
ck('a grandchild walks two hops to the same room',
  await title() === 'Deck · Zones');
await p.evaluate(() => navigate('screens'));
await p.waitForTimeout(200);
ck('an explicit room_name still wins as before',
  await title() === 'Deck · Screens');
await p.evaluate(() => navigate('orphan'));
await p.waitForTimeout(200);
ck('no chain, no activity → global.room, exactly as before',
  await title() === 'Porch · Orphan');

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
