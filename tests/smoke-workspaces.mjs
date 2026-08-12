import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
/* WORKSPACES (v0.34): a remote pinned to a workspace loads
   config.<ws>.json, tags its harmonium.* service calls with the
   workspace, and falls back to main (with a bar flash) when the file
   is missing. Main stays byte-identical with pre-workspace behavior. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const r = {}; const errs = [];

// A DEN workspace: minimal but real — its own home, one activity with a
// sequence stop, a ws-prefixed routing select.
const main = JSON.parse(readFileSync(join(ROOT, 'dist', 'config.json'), 'utf8'));
const den = {
  version: 2,
  theme: {}, devices: main.devices, keymap: main.keymap,
  home_screen: 'den', screen_order: ['den'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_den_activity',
    buttons: { power_hold: { sequence: 'den_off' } } },
  input: {}, controllers: {},
  activities: { watch_den: { name: 'Watch Den TV', room_view: 'den',
    start: 'sequence:den_on', stop: 'sequence:den_off' } },
  sequences: { den_on: { actions: [{ service: 'light.turn_on' }] },
    den_off: { actions: [{ service: 'light.turn_off' }] } },
  screens: { den: { name: 'Den', type: 'hub', room: true,
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'den' }] }] } },
};
const denPath = join(ROOT, 'dist', 'config.den.json');
writeFileSync(denPath, JSON.stringify(den));

const boot = async (hash) => {
  const p = await (await b.newContext({ viewport: { width: 320, height: 533 } })).newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8482/index.html' + hash);
  await p.waitForTimeout(700);
  await p.evaluate(() => {
    document.getElementById('auth').classList.add('hidden');
    window._sent = []; S.connected = true;
    S.ws = { send: m => window._sent.push(JSON.parse(m)) };
  });
  return p;
};

// 1. pinned remote: #ws=den loads config.den.json, lands on Den, pin sticks
const p = await boot('#ws=den');
r.pinned = await p.evaluate(() => ({
  ws: WS, screen: S.screen,
  name: document.getElementById('screenName').textContent,
  sticky: localStorage.getItem('hakr_ws'),
  urlClean: !location.hash.includes('ws'),
}));

// 2. harmonium.run from den carries workspace: den (sequence stop via power_hold binding)
await p.evaluate(() => {
  S.states.set('select.harmonium_den_den_activity', { s: 'watch_den', a: {} });
  window._sent.length = 0;
  runAction({ sequence: 'den_off' });
});
r.runTagged = await p.evaluate(() =>
  window._sent.filter(m => m.type === 'call_service' && m.domain === 'harmonium')
    .map(m => m.service + ':' + m.service_data.sequence + '@' + m.service_data.workspace));

// 3. reload WITHOUT the hash: the pin persists (sticky like #device=)
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(700);
r.sticky = await p.evaluate(() => ({ ws: WS, screen: S.screen }));

// 4. main stays byte-identical: no workspace key on harmonium calls
const pm = await boot('#ws=main');
r.mainClean = await pm.evaluate(() => {
  window._sent.length = 0;
  runAction({ sequence: 'all_off' });
  const m = window._sent.find(x => x.domain === 'harmonium');
  return { ws: WS, sticky: localStorage.getItem('hakr_ws'),
    hasWsKey: m ? 'workspace' in m.service_data : null };
});

// 4b. PEEK (v0.37): #ws=den&pin=0 boots den for THIS load only —
//     nothing pinned, hash retained (F5 stays on the peek), and the
//     Studio's "open the running app" link uses exactly this form
const pp = await boot('#ws=den&pin=0');
r.peek = await pp.evaluate(() => ({
  ws: WS, screen: S.screen,
  notPinned: localStorage.getItem('hakr_ws') === null,
  hashKept: location.hash.includes('ws=den'),
}));
// tagged service calls still route to the peeked workspace
r.peek.tagged = await pp.evaluate(() => {
  window._sent.length = 0;
  runAction({ sequence: 'den_off' });
  const m = window._sent.find(x => x.domain === 'harmonium');
  return m ? m.service_data.workspace : null;
});

// 5. missing workspace file: falls back to main + bar flash
unlinkSync(denPath);
const pf = await boot('#ws=ghost');
r.fallback = await pf.evaluate(() => ({
  ws: WS, screen: S.screen,
  flash: document.getElementById('screenName').textContent,
}));

/* leave dist/ clean — the fixture is re-written at the top of every run */
try { unlinkSync(denPath); } catch { /* already gone (section 5) */ }
console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close();
