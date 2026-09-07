/* PREVIEW-AS CAST fence (2026-09-05, feedback-1 — Suresh, designing
   a music controller: "the preview has Dining Fan, Receiver etc…
   extra devices in the cast. Hard coded. And additive to the
   controller. What we really want to do is restrict the preview cast
   to the ones with controller roles"):
   · LIVE (no impersonation): the cast bands render every member —
     the per-activity "on controller" riders included, exactly as
     before;
   · under PREVIEW-AS (S.pvActivity): the cast narrows to members
     that fill a role in the activity's compiled context — the
     surface the controller designer is actually shaping.
   EXTENDED (2026-09-05 drift round — Suresh: "The spurious devices
   (Fan Receiver etc..) are still there. Lets get this done right.
   Once and for all"): the riders also flow through extra_devices —
   the speakers card's loose list stayed raw. Every cast-shaped list
   now narrows through ONE gate (pvFilterCast, gen-cast.js); this
   fence holds the speakers card to it too. */
import { chromium } from 'playwright-core';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

const CONFIG = { version: 2, home_screen: 'p', screen_order: ['p'],
  global: { room: 'P', activity_select: 'select.act' },
  controllers: { music: { name: 'Music', class: 'activity', type: 'controller',
    sections: [{ tiles: [
      { id: 'vols', type: 'volumes' },
      { id: 'spk', type: 'speakers' },
      { id: 'cast', type: 'devices' } ] }] } },
  remotes: { default: { capabilities: ['physical_dpad', 'touch', 'pointer'] } },
  activities: { music: { name: 'Listen to Music', room_view: 'p',
    screen: 'controller:music',
    cast: ['sonos_dev', 'fan_rider'],
    /* the compiled on-controller list — role-filler + riders; the
       media_player rider also feeds the speakers card's loose list */
    devices: ['media_player.sonos', 'fan.dining', 'media_player.rider_amp'],
    extra_devices: ['media_player.rider_amp'],
    context: { media_player: 'media_player.sonos', volume: 'media_player.sonos' } } },
  devices: {
    sonos_dev: { name: 'Sonos',
      roles: { media_player: 'media_player.sonos', volume: 'media_player.sonos' } },
    /* the RIDER: cast, on the controller, fills NO role */
    fan_rider: { name: 'Dining Fan', roles: { power: 'fan.dining' } },
  },
  screens: { p: { name: 'P', type: 'hub', tiles: [
    { id: 'd1', type: 'device', entity: 'media_player.sonos', label: 'S' }] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 349, height: 800 } })).newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await (p.context()).route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.WebSocket = class {
    constructor() { window.__ws = this;
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const g = JSON.parse(m);
      const r = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (g.type === 'auth') r({ type: 'auth_ok' });
      else r({ type: 'result', id: g.id, success: true, result: null }); }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(800);

const bandIds = () => p.evaluate(() =>
  [...document.querySelectorAll('.tile')].map(x => x.id).join('|'));

/* the speakers card only draws with 2+ members — its member list is
   how the extra_devices leak shows (the wired sonos + the rider amp
   make 2 live; roles-only leaves 1, so the card vanishes) */
const spkTile = () => p.evaluate(() =>
  !!document.querySelector('.tile[id^="tile_spk"]'));

/* LIVE: no impersonation — the riders render */
await p.evaluate(() => { S.stack = []; navigate('controller:music', true); });
await p.waitForTimeout(300);
let t = await bandIds();
ck('live: the role-filler renders', /media_player_sonos/.test(t));
ck('live: the on-controller rider renders too (unchanged behavior)',
  /fan_dining/.test(t));
ck('live: the extra_devices rider renders too', /rider_amp/.test(t));
ck('live: the speakers card draws (sonos + rider amp = 2 members)',
  await spkTile());

/* the ACTIVITY CARD's impersonation (no roles_only): riders STAY —
   they are exactly what that editor edits */
await p.evaluate(() => { S.pvActivity = 'music'; S.pvRolesOnly = false;
  S.stack = []; navigate('controller:music', true); });
await p.waitForTimeout(300);
t = await bandIds();
ck('activity-card impersonation: the rider stays (roles_only off)',
  /fan_dining/.test(t));

/* CONTROLLER-EDITOR preview-as (roles_only): narrows to role-fillers */
await p.evaluate(() => { S.pvActivity = 'music'; S.pvRolesOnly = true;
  S.stack = []; navigate('controller:music', true); });
await p.waitForTimeout(300);
t = await bandIds();
ck('preview-as: the role-filler stays', /media_player_sonos/.test(t));
ck('preview-as: the rider is gone', !/fan_dining/.test(t));
ck('preview-as: the extra_devices rider is gone too', !/rider_amp/.test(t));
ck('preview-as: the speakers card folds (one member is no group)',
  !(await spkTile()));

/* clearing the impersonation restores the full cast */
await p.evaluate(() => { S.pvActivity = null; S.pvRolesOnly = false;
  S.stack = []; navigate('controller:music', true); });
await p.waitForTimeout(300);
t = await bandIds();
ck('cleared: the rider returns', /fan_dining/.test(t));
ck('cleared: the extra_devices rider returns', /rider_amp/.test(t));
ck('cleared: the speakers card returns', await spkTile());

console.log(JSON.stringify({ ok: !errs.length, errs }, null, 1));
await b.close();
process.exit(errs.length ? 1 : 0);
