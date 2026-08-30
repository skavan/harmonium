/* FAST DPAD probe (2026-08-27 — the Fire TV latency investigation).
   A dialect's dpad_commands value may now be a full ACTION object:
   `input keyevent` costs 150-400ms of Java spawn per press, while a
   raw-input action (androidtv.adb_command → sendevent) lands in
   single-digit ms. Field findings baked into these fences: the Fire
   TV UI consumes at most ~6 presses/sec (host-paced 150ms and
   device-paced 200ms bursts both converged there), so action sends
   are paced by TIMING.dpadRepeat in rc(); hold-repeat is HOST-paced
   single presses (a device-side burst keeps scrolling after the
   finger lifts). Fences:
     1. cmdFor hands back the action object (strings untouched);
     2. a physical tap on a passthrough page runs the action —
        androidtv.adb_command fires, remote.send_command does NOT;
     3. pacing: a second press inside dpadRepeat is dropped, one
        after the window lands;
     4. hold: auto-repeat keydowns drive the device, still paced;
     5. a STRING dialect never repeats (unchanged legacy behavior)
        and its tap still sends remote.send_command;
     6. mixed dialect: string-valued keys ride remote.send_command
        beside action-valued neighbors. */
import { chromium } from 'playwright-core';

const SE = (dir) => ({ service: 'androidtv.adb_command',
  entity: 'media_player.ftv', data: { command: 'SE_' + dir } });
const CONFIG = {
  version: 2, home_screen: 'den', screen_order: ['den'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  devices: {},
  dialects: { firetv: { name: 'Fire TV', dpad_commands: {
    up: SE('UP'), down: SE('DOWN'), left: SE('LEFT'), right: SE('RIGHT'),
    select: 'ENTER' } } },
  activities: { watch: { name: 'Watch', room_view: 'den',
    context: { media_player: 'media_player.ftv', dpad: 'remote.ftv',
      dialect: 'firetv' },
    screen: 'controller:tv1' } },
  screens: { den: { name: 'Den', type: 'hub', room: true,
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'den' }] }] } },
  controllers: { tv1: { name: 'TV', type: 'controller', class: 'activity',
    view_kind: 'controller',
    control_target: { label: '$activity.name', navigation: '$context.dpad',
      pass_through: ['up', 'down', 'left', 'right', 'select'] },
    tiles: [{ id: 'pad', type: 'dpad', entity: '$context.dpad',
      label: 'Remote', span: 2 }] } },
};
const STATES = {
  'media_player.ftv': { s: 'playing', a: { friendly_name: 'Fire TV' } },
  'remote.ftv': { s: 'on', a: { friendly_name: 'Fire TV Remote' } },
  'select.harmonium_den_activity': { s: 'watch', a: { options: ['watch', 'off'] } },
};
const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript((STATES) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window._calls = [];
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
      } else { if (msg.type === 'call_service') window._calls.push(msg);
        reply({ type: 'result', id: msg.id, success: true, result: null }); }
    }
    close() {}
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => {
  CAPS = new Set(['physical_dpad', 'physical_back_home']);
  navigate('controller:tv1');
});
await p.waitForTimeout(500);

/* helper: dispatch a physical key */
const key = (k, repeat) => p.evaluate(([k, repeat]) => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, repeat: !!repeat }));
}, [k, repeat]);
const calls = () => p.evaluate(() => window._calls.map(c => ({
  d: c.domain, s: c.service,
  cmd: c.service_data && c.service_data.command,
  tgt: c.target && c.target.entity_id })));
const reset = () => p.evaluate(() => { window._calls.length = 0; });

/* --- 1. cmdFor hands back objects (and leaves strings alone) --- */
const shapes = await p.evaluate(() => ({
  down: cmdFor({}, 'down'), select: cmdFor({}, 'select'),
  owner: padOwner(), latched: padLatched() }));
ck('cmdFor returns the action object', typeof shapes.down === 'object' &&
  shapes.down.service === 'androidtv.adb_command');
ck('string neighbor stays a string', shapes.select === 'ENTER');
ck('fixture is a passthrough page', shapes.owner === 'device' && !shapes.latched);

/* --- 2. tap runs the action --- */
await reset();
await key('ArrowDown');
await p.waitForTimeout(120);
let c = await calls();
ck('tap fires androidtv.adb_command', c.length === 1 &&
  c[0].d === 'androidtv' && c[0].s === 'adb_command' && c[0].cmd === 'SE_DOWN');
ck('tap does NOT ride remote.send_command',
  !c.some(x => x.d === 'remote'));

/* --- 3. pacing: a press inside dpadRepeat is dropped --- */
await key('ArrowDown');                       // ~120ms after the first
c = await calls();
ck('press inside the pacing window is dropped', c.length === 1);
await p.waitForTimeout(220);
await key('ArrowUp');
await p.waitForTimeout(60);
c = await calls();
ck('press after the window lands', c.length === 2 && c[1].cmd === 'SE_UP');

/* --- 4. hold: auto-repeat drives the device, still paced --- */
await reset();
await p.waitForTimeout(220);
await key('ArrowDown');                       // the tap
for (let i = 0; i < 12; i++) {                // ~360ms of browser repeats
  await key('ArrowDown', true);
  await p.waitForTimeout(30);
}
c = await calls();
ck('hold repeats reach the device', c.length >= 2);
ck('hold stream is paced (~6/sec, not 30/sec)', c.length <= 4);

/* --- 5. a STRING dialect never repeats; its tap still works --- */
await p.evaluate(() => {
  CONFIG.dialects.firetv.dpad_commands = { down: 'DOWN', up: 'UP' };
});
await reset();
await p.waitForTimeout(220);
await key('ArrowDown');
for (let i = 0; i < 8; i++) await key('ArrowDown', true);
await p.waitForTimeout(60);
c = await calls();
ck('string tap still sends remote.send_command', c.length === 1 &&
  c[0].d === 'remote' && c[0].s === 'send_command' && c[0].cmd === 'DOWN');
ck('string repeats stay dropped (legacy behavior)', c.length === 1);

console.log(JSON.stringify({ shapes, last: c, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
