/* VIEW TUNING probe (v0.85.8 — Suresh: "I don't want to fork the
   base. This should be a run-time knob I can tune… even if for now
   it's a json setting in advanced on the activity"). An activity's
     "views": { "<page id>": { grid keys } }
   spreads over the page's grid block while the page draws as that
   activity. Fences:
     1. the stock-shaped apps drawer (grid.columns 2) renders 3-up
        under an activity that tunes it;
     2. the SAME drawer renders 2-up under a sibling activity with no
        tuning (shared surface, per-activity knob);
     3. other grid keys flow too (tile_h re-pins --tile-h);
     4. a page the activity doesn't name is untouched;
     5. the stored page config is never modified (no fork — the
        override lives and dies at render). */
import { chromium } from 'playwright-core';

const APPS = {};
for (const a of ['netflix', 'youtube', 'prime', 'max', 'hulu', 'espn'])
  APPS[a] = { service: 'media_player.select_source', data: { source: a } };
const CONFIG = {
  version: 2, home_screen: 'den', screen_order: ['den'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  apps: { netflix: { name: 'Netflix' }, youtube: { name: 'YouTube' },
    prime: { name: 'Prime' }, max: { name: 'Max' },
    hulu: { name: 'Hulu' }, espn: { name: 'ESPN' } },
  dialects: { tizen: { apps: APPS } },
  devices: { tv: { name: 'TV', roles: { media_player: 'media_player.tv' } } },
  activities: {
    watch: { name: 'Watch', room_view: 'den', cast: ['tv'],
      context: { media_player: 'media_player.tv', dialect: 'tizen' },
      screen: 'controller:tv9',
      views: { appdrawer: { columns: 3, tile_h: 120 } } },
    games: { name: 'Games', room_view: 'den', cast: ['tv'],
      context: { media_player: 'media_player.tv', dialect: 'tizen' },
      screen: 'controller:tv9' },
  },
  screens: { den: { name: 'Den', type: 'hub', room: true,
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'den' }] }] } },
  controllers: {
    tv9: { name: 'TV', type: 'controller', class: 'activity',
      view_kind: 'controller',
      control_target: { label: '$activity.name', pass_through: [] },
      tiles: [{ id: 'go', type: 'nav', label: 'Apps',
        action: { navigate: 'appdrawer' } }] },
    appdrawer: { name: 'Apps', class: 'group', view_kind: 'library',
      type: 'library', parent: 'controller:tv9', drawer: true,
      gen: 2, grid: { columns: 2 },
      sections: [{ tiles: [{ id: 'apps_grid', type: 'apps' }],
        hero_label: 'Apps' }] },
  },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await ctx.route('**/local/harmonium/apps/*.webp', r => r.fulfill({ status: 404, body: 'no' }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.WebSocket = class {
    constructor() {
      window.__ws = this;
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20);
    }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        window.__subId = msg.id;
        reply({ type: 'result', id: msg.id, success: true, result: null });
        const a = {};
        (msg.entity_ids || []).forEach(e => {
          a[e] = e.startsWith('select.')
            ? { s: window.__selState || 'watch', a: { options: ['watch', 'games', 'off'] } }
            : { s: 'on', a: {} };
        });
        reply({ type: 'event', id: msg.id, event: { a } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(1000);

const colsNow = () => p.evaluate(() => {
  const host = document.querySelector('#grid .secgrid') || document.getElementById('grid');
  return { cols: getComputedStyle(host).gridTemplateColumns.split(' ').length,
    tileH: document.getElementById('grid').style.getPropertyValue('--tile-h') };
});

/* ---- 1 + 3. tuned activity: 3-up, --tile-h re-pinned ------------- */
await p.evaluate(() => navigate('appdrawer'));
await p.waitForTimeout(500);
const r1 = await colsNow();
if (r1.cols !== 3) errs.push('tuned activity did not render 3-up: ' + JSON.stringify(r1));
if (r1.tileH !== '120px') errs.push('tile_h did not flow through the tuning: ' + JSON.stringify(r1));

/* ---- 5. the stored page config is untouched ---------------------- */
const stored = await p.evaluate(() => CONFIG.controllers.appdrawer.grid.columns);
if (stored !== 2) errs.push('the page config was mutated (columns=' + stored + ') — must stay 2');

/* ---- 2 + 4. sibling activity with no tuning: 2-up, no --tile-h --- */
await p.evaluate(() => {
  window.__selState = 'games';
  window.__ws.onmessage({ data: JSON.stringify({ type: 'event', id: window.__subId,
    event: { a: { 'select.harmonium_den_activity':
      { s: 'games', a: { options: ['watch', 'games', 'off'] } } } } }) });
  navigate('den');
});
await p.waitForTimeout(300);
await p.evaluate(() => navigate('appdrawer'));
await p.waitForTimeout(500);
const r2 = await colsNow();
if (r2.cols !== 2) errs.push('untuned sibling activity should render 2-up: ' + JSON.stringify(r2));
if (r2.tileH) errs.push('--tile-h leaked into the untuned render: ' + JSON.stringify(r2));

console.log(JSON.stringify({ r1, stored, r2, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
