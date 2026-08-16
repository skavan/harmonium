/* APPS GRID 2-UP probe (v0.83.8 — Suresh: "lets make this grid
   (tv apps) 2 x 2 (bigger tiles, text) and get the alignment
   right"). Asserts: the apps drawer at grid.columns 2 renders a
   two-column host · generated app tiles carry cls "app" · the .app
   size class actually lands (bigger glyph than a stock preset,
   centered) · labels read at the bumped size. */
import { chromium } from 'playwright-core';

const STATES = {
  'select.harmonium_den_activity': { s: 'watch', a: { options: ['watch', 'off'] } },
  'media_player.tv': { s: 'on', a: { friendly_name: 'TV', supported_features: 84351 } },
};
const CONFIG = {
  version: 2, home_screen: 'den', screen_order: ['den'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  apps: {
    netflix: { name: 'Netflix', icon: 'material:movie' },
    youtube: { name: 'YouTube', icon: 'material:smart_display' },
    prime: { name: 'Prime Video', icon: 'material:play_circle' },
    max: { name: 'Max', icon: 'material:theaters' },
  },
  dialects: { tizen: { apps: {
    netflix: { service: 'media_player.select_source', data: { source: 'Netflix' } },
    youtube: { service: 'media_player.select_source', data: { source: 'YouTube' } },
    prime: { service: 'media_player.select_source', data: { source: 'Prime Video' } },
    max: { service: 'media_player.select_source', data: { source: 'Max' } },
  } } },
  devices: { tv: { name: 'TV', roles: { media_player: 'media_player.tv' } } },
  activities: { watch: { name: 'Watch', room_view: 'den', cast: ['tv'],
    context: { media_player: 'media_player.tv', dialect: 'tizen' },
    screen: 'controller:tv9' } },
  screens: { den: { name: 'Den', type: 'hub', room: true,
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'den' }] }] } },
  controllers: {
    tv9: { name: 'TV', type: 'controller', class: 'activity',
      view_kind: 'controller',
      control_target: { label: '$activity.name', pass_through: [] },
      tiles: [{ id: 'go', type: 'nav', label: 'Apps',
        action: { navigate: 'appdrawer' } }] },
    /* the healed stock shape: 2 columns, apps generator */
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
await p.addInitScript((STATES) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        const a = {}; (msg.entity_ids || []).forEach(e => { if (STATES[e]) a[e] = STATES[e]; });
        reply({ type: 'event', id: msg.id, event: { a } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => navigate('appdrawer'));
await p.waitForTimeout(500);

const r = await p.evaluate(() => {
  const grid = document.getElementById('grid');
  const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  const tiles = [...document.querySelectorAll('.tile.wgt-preset')];
  const t0 = tiles[0];
  const ic = t0?.querySelector('.top .ic');
  const lbl = t0?.querySelector('.lbl');
  return {
    tiles: tiles.length,
    cols,
    allApp: tiles.length > 0 && tiles.every(t => t.classList.contains('app')),
    icSize: ic ? getComputedStyle(ic).fontSize : null,          /* want 38px */
    lblSize: lbl ? getComputedStyle(lbl).fontSize : null,       /* want fs-2+1 = 14px */
    centered: t0 ? getComputedStyle(t0).textAlign === 'center' : null,
    minH: t0 ? parseFloat(getComputedStyle(t0).minHeight) : 0,  /* want >= 96 */
    rows2: tiles.length === 4 &&
      Math.abs(tiles[0].getBoundingClientRect().top -
               tiles[1].getBoundingClientRect().top) < 2 &&
      tiles[2].getBoundingClientRect().top >
        tiles[0].getBoundingClientRect().bottom - 2,   /* a true 2×2 */
  };
});

console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close();
