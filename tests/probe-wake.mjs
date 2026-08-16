/* DIALECT WAKE probe (v0.83.9 — Suresh: launching a FireTV app while
   the box dozes "actually does the app change but screen remains
   blank or screen saver. I find the back button works. How would we
   implement that?" → dialect-level `wake`, state-gated).
   Asserts: (1) player OFF → app tap fires the wake action FIRST
   (key:back borrowed from the dialect's keys catalog), then the
   launch after the wake_delay gap; (2) player PLAYING → launch only,
   no wake poke; (3) a dialect without wake behaves exactly as
   before. */
import { chromium } from 'playwright-core';

const STATES = {
  'media_player.firetv': { s: 'off', a: {
    friendly_name: 'Fire TV', supported_features: 84351 } },
  'select.harmonium_den_activity': { s: 'watch', a: { options: ['watch', 'off'] } },
};
const CONFIG = {
  version: 2, home_screen: 'den', screen_order: ['den'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  apps: { netflix: { name: 'Netflix', icon: 'material:movie' } },
  dialects: {
    firetv: {
      keys: { back: { service: 'remote.send_command',
        entity: 'remote.firetv', data: { command: 'BACK' } } },
      wake: 'key:back', wake_delay: 400,
      apps: { netflix: { service: 'media_player.select_source',
        entity: '$context.media_player', data: { source: 'Netflix' } } },
    },
    plain: {   /* no wake — the control group */
      apps: { netflix: { service: 'media_player.select_source',
        entity: '$context.media_player', data: { source: 'Netflix' } } },
    },
  },
  devices: { ftv: { name: 'Fire TV', roles: { media_player: 'media_player.firetv' } } },
  activities: { watch: { name: 'Watch', room_view: 'den', cast: ['ftv'],
    context: { media_player: 'media_player.firetv', dialect: 'firetv' },
    screen: 'controller:tvx' } },
  screens: { den: { name: 'Den', type: 'hub', room: true,
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'den' }] }] } },
  controllers: {
    tvx: { name: 'TV', type: 'controller', class: 'activity',
      view_kind: 'controller',
      control_target: { label: '$activity.name', pass_through: [] },
      tiles: [{ id: 'apps1', type: 'apps' }] },
  },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const errs = [];

async function page(playerState, dialect) {
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  cfg.activities.watch.context.dialect = dialect;
  const states = JSON.parse(JSON.stringify(STATES));
  states['media_player.firetv'].s = playerState;
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
  await p.route('**/config.json*', r => r.fulfill({ json: cfg }));
  await p.addInitScript((states) => {
    localStorage.setItem('hakr_token', 't');
    localStorage.setItem('hakr_host', 'localhost:8482');
    window._calls = [];
    window.WebSocket = class {
      constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
      send(m) { const msg = JSON.parse(m);
        const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
        if (msg.type === 'auth') reply({ type: 'auth_ok' });
        else if (msg.type === 'subscribe_entities') {
          reply({ type: 'result', id: msg.id, success: true, result: null });
          const a = {}; (msg.entity_ids || []).forEach(e => { if (states[e]) a[e] = states[e]; });
          reply({ type: 'event', id: msg.id, event: { a } });
        } else { if (msg.type === 'call_service')
            window._calls.push({ t: performance.now(), d: msg.domain,
              s: msg.service, data: msg.service_data,
              e: msg.target?.entity_id });
          reply({ type: 'result', id: msg.id, success: true, result: null }); }
      }
      close() {}
    };
  }, states);
  await p.goto('http://localhost:8482/index.html');
  await p.waitForTimeout(900);
  await p.evaluate(() => navigate('controller:tvx'));
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    [...document.querySelectorAll('.tile.wgt-preset')]
      .find(x => x.textContent.includes('Netflix'))?.click();
  });
  await p.waitForTimeout(900);   /* > wake_delay 400 */
  const calls = await p.evaluate(() => window._calls);
  await p.close();
  return calls;
}

// 1. asleep + wake dialect → BACK first, launch after the gap
const asleep = await page('off', 'firetv');
// 2. playing + wake dialect → launch only
const awake = await page('playing', 'firetv');
// 3. asleep + wake-less dialect → launch only (unchanged behavior)
const control = await page('off', 'plain');

const gap = asleep.length === 2 ? Math.round(asleep[1].t - asleep[0].t) : null;
console.log(JSON.stringify({
  asleep: {
    order: asleep.map(c => c.d + '.' + c.s),
    wakeFirst: asleep[0]?.s === 'send_command' && asleep[0]?.data?.command === 'BACK' &&
      asleep[0]?.e === 'remote.firetv',
    thenLaunch: asleep[1]?.s === 'select_source' && asleep[1]?.data?.source === 'Netflix',
    gapMs: gap, gapHonored: gap != null && gap >= 350,
  },
  awake: { calls: awake.map(c => c.d + '.' + c.s),
    launchOnly: awake.length === 1 && awake[0].s === 'select_source' },
  control: { calls: control.map(c => c.d + '.' + c.s),
    launchOnly: control.length === 1 && control[0].s === 'select_source' },
  errs,
}, null, 1));
await b.close();
