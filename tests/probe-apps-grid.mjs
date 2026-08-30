/* APPS GRID probe — 2-UP (v0.83.8) + LOGO CARDS (v0.85.8, his
   Roku-sourced pack: "we go with (a). we keep the box uniform…
   two apps per row… in a box with rounded edges like we have now").
   Asserts: the apps drawer at grid.columns 2 renders a two-column
   host · generated app tiles carry cls "app" · every app tile is a
   UNIFORM ~4:3 (290:218) box, logo or not · an app whose logo loads
   becomes a photo card (art fills the box, label hidden, rounded
   corners clipped) at full opacity · an app whose logo 404s sheds
   the dress and shows icon + label centered in the SAME box · a true
   2×2 layout survives. */
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
    zzcustom: { name: 'My Custom App', icon: 'material:extension' },
  },
  dialects: { tizen: { apps: {
    netflix: { service: 'media_player.select_source', data: { source: 'Netflix' } },
    youtube: { service: 'media_player.select_source', data: { source: 'YouTube' } },
    prime: { service: 'media_player.select_source', data: { source: 'Prime Video' } },
    zzcustom: { service: 'media_player.select_source', data: { source: 'Custom' } },
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

/* a bright 8×8 PNG (the np-live fixture) stands in for a logo — the
   .webp URL with image/png bytes decodes fine */
const ART = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGP8tcWGARtgwio6aCUAgtEB+iohLfEAAAAASUVORK5CYII=';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
/* netflix/youtube/prime have logos; zzcustom 404s → the fallback.
   Playwright matches the LAST-registered route first, so the specific
   404 must be registered after the catch-all. */
await ctx.route('**/local/harmonium/apps/*.webp', r =>
  r.fulfill({ body: Buffer.from(ART, 'base64'), contentType: 'image/png' }));
let deadHits = 0;
await ctx.route('**/local/harmonium/apps/zzcustom.webp', r => {
  deadHits++; r.fulfill({ status: 404, body: 'no' });
});
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
await p.waitForTimeout(700);

const r = await p.evaluate(() => {
  const grid = document.getElementById('grid');
  const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  const tiles = [...document.querySelectorAll('.tile.wgt-preset')];
  const logo = tiles.find(t => t.id === 'tile_apps_grid_netflix');
  const fb = tiles.find(t => t.id === 'tile_apps_grid_zzcustom');
  const ratio = (t) => t.clientHeight / t.clientWidth;
  const img = logo && logo.querySelector('.roomimg');
  return {
    tiles: tiles.length,
    cols,
    allApp: tiles.length > 0 && tiles.every(t => t.classList.contains('app')),
    ratios: tiles.map(t => +ratio(t).toFixed(3)),
    logoPhoto: !!logo && logo.classList.contains('photo'),
    logoImgFills: !!img && Math.abs(img.getBoundingClientRect().height
      - logo.clientHeight) <= 2,
    logoOpacity: img ? getComputedStyle(img).opacity : '?',
    logoLabelHidden: !!logo &&
      getComputedStyle(logo.querySelector('.top')).display === 'none',
    rounded: !!logo && parseFloat(getComputedStyle(logo).borderRadius) > 0
      && getComputedStyle(logo).overflow === 'hidden',
    fbShed: !!fb && !fb.classList.contains('photo') && !fb.querySelector('.roomimg'),
    fbIcon: !!fb && getComputedStyle(fb.querySelector('.top .ic')).display !== 'none',
    fbLabel: !!fb && fb.querySelector('.lbl').textContent === 'My Custom App'
      && getComputedStyle(fb.querySelector('.lbl')).display !== 'none',
    fbSameBox: !!fb && !!logo && Math.abs(fb.clientHeight - logo.clientHeight) <= 2,
    rows2: tiles.length === 4 &&
      Math.abs(tiles[0].getBoundingClientRect().top -
               tiles[1].getBoundingClientRect().top) < 2 &&
      tiles[2].getBoundingClientRect().top >
        tiles[0].getBoundingClientRect().bottom - 2,   /* a true 2×2 */
  };
});
/* dead-URL memory (IMG_DEAD): rebuild the drawer — the known-dead
   logo must NOT be re-requested, and the tile must be born fallback */
const hits0 = deadHits;
await p.evaluate(() => navigate('controller:tv9'));
await p.waitForTimeout(300);
await p.evaluate(() => navigate('appdrawer'));
await p.waitForTimeout(500);
const r2 = await p.evaluate(() => {
  const fb = document.getElementById('tile_apps_grid_zzcustom');
  return { bornFallback: !!fb && !fb.classList.contains('photo')
    && !fb.querySelector('.roomimg') };
});

const ck = (n, cnd) => { if (!cnd) errs.push(n); };
ck('4 app tiles', r.tiles === 4);
ck('two columns', r.cols === 2);
ck('all carry cls app', r.allApp);
ck('uniform ~4:3 boxes (290:218 = .752)',
  r.ratios.every(x => Math.abs(x - 0.752) < 0.02));
ck('logo app wears the photo dress', r.logoPhoto);
ck('logo fills the box', r.logoImgFills);
ck('logo at full opacity', Math.abs(+r.logoOpacity - 1) < 0.01);
ck('logo card hides the label (the poster carries the wordmark)', r.logoLabelHidden);
ck('rounded corners, art clipped', r.rounded);
ck('404 logo sheds the dress', r.fbShed);
ck('fallback shows icon + label', r.fbIcon && r.fbLabel);
ck('fallback holds the same box', r.fbSameBox);
ck('a true 2×2', r.rows2);
ck('dead logo not re-requested on rebuild (IMG_DEAD)', deadHits === hits0);
ck('rebuilt tile born as fallback', r2.bornFallback);
console.log(JSON.stringify({ ...r, ...r2, deadHits, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
