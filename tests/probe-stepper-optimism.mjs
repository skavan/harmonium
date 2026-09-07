/* STEPPER OPTIMISM fence (2026-09-05, feedback-3 #2 — Suresh: "The
   sonos bass and treble steppers take forever to register a step and
   feel broken"). The displayed value used to wait for HA's confirming
   diff — a slow integration read as dead buttons, and each tap before
   the confirm recomputed from the STALE value so taps never
   accumulated. Now every STEP_KIND writes its target locally first
   (the mute toggle's doctrine) and repaints; the confirming diff
   lands over the same value. The WS mock here sends NO state echoes
   at all, so anything the display shows after a nudge is the
   optimistic path — exactly the slow-Sonos worst case. */
import { chromium } from 'playwright-core';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

const CONFIG = { version: 2, home_screen: 'p', screen_order: ['p'],
  global: { room: 'P' },
  remotes: { default: { capabilities: ['physical_dpad', 'touch', 'pointer'] } },
  screens: { p: { name: 'P', type: 'hub', tiles: [
    { id: 'd1', type: 'device', entity: 'number.sonos_basement_bass', label: 'Bass' }] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 349, height: 800 } })).newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await (p.context()).route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.__svc = [];
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const g = JSON.parse(m);
      if (g.type === 'call_service') window.__svc.push(g);
      const r = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (g.type === 'auth') r({ type: 'auth_ok' });
      else r({ type: 'result', id: g.id, success: true, result: null }); }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(800);

/* the Sonos bass: value IS the state, range −10..10 step 1 */
await p.evaluate(() => {
  S.states.set('number.sonos_basement_bass',
    { s: '1', a: { friendly_name: 'Basement Sonos Bass',
      min: -10, max: 10, step: 1 } });
  navigate('detail:number.sonos_basement_bass');
});
await p.waitForTimeout(300);

const shown = () => p.evaluate(() =>
  document.querySelector('#tile_ds .stepval, #tile_ds .inval')?.textContent.trim());
ck('the page renders the number stepper with the live value',
  (await shown()) === '1');

/* THREE rapid nudges, ZERO echoes: the display must read 4 at once —
   the stale-read bug showed 1 forever (and would have sent 2,2,2) */
await p.evaluate(() => {
  nudgeStep('number.sonos_basement_bass', 'number', +1);
  nudgeStep('number.sonos_basement_bass', 'number', +1);
  nudgeStep('number.sonos_basement_bass', 'number', +1);
});
await p.waitForTimeout(200);
ck('taps register instantly and ACCUMULATE (1 → 4, no echo needed)',
  (await shown()) === '4');
ck('the services carried the accumulating targets (2, 3, 4)',
  await p.evaluate(() =>
    window.__svc.filter(g => g.service === 'set_value')
      .map(g => g.service_data.value).join(',') === '2,3,4'));

/* bounds still clamp on the optimistic path */
await p.evaluate(() => {
  for (let i = 0; i < 10; i++)
    nudgeStep('number.sonos_basement_bass', 'number', +1);
});
await p.waitForTimeout(200);
ck('the optimistic value clamps at the entity\'s own max',
  (await shown()) === '10');

/* a real echo lands over the same value — nothing snaps */
await p.evaluate(() => {
  const c = S.states.get('number.sonos_basement_bass');
  c.s = '10'; S.states.set('number.sonos_basement_bass', c);
  renderStates();
});
ck('the confirming echo agrees with the display', (await shown()) === '10');

console.log(JSON.stringify({ ok: !errs.length, errs }, null, 1));
await b.close();
process.exit(errs.length ? 1 : 0);
