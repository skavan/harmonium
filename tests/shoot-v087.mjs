/* SHOOT-V087 — regenerates the docs/media/v087-*.png set for
   docs/release-notes-v0.87.0.md ("Eye candy is worth a lot!").
   Not a probe (no asserts); rerun if 0.87 visuals change.
   Needs the icon font fixture in /tmp/msym (see shoot-np-styles.mjs)
   and the dist server: python3 -m http.server 8482 --directory ../dist */
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
const FONTB64 = readFileSync('/tmp/msym/font.b64', 'utf8');
const FONT = readFileSync('/tmp/msym/node_modules/material-symbols/material-symbols-outlined.woff2');
mkdirSync('/root/work/harmonium/docs/media', { recursive: true });

const BASE = {
  version: 2, home_screen: 'p', screen_order: ['p'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  devices: {}, dialects: {}, controllers: {}, theme: {},
  remotes: { default: { capabilities: ['touch', 'pointer'] } },
};

/* ---- the three engine pages ---- */
const SHOTS = {

  /* the Design coherence hero: accents + brands + styles, one running */
  'v087-accents': {
    height: 1020,
    config: { ...BASE,
      activities: {
        watch_tv: { name: 'Watch Fire TV', room_view: 'p' },
        music: { name: 'Listen to Music', room_view: 'p' },
        movie: { name: 'Movie Night', room_view: 'p' },
      },
      screens: { p: { name: 'Den', type: 'hub', sections: [
        { columns: 1, tiles: [
          { id: 'a1', type: 'activity', activity: 'watch_tv', label: 'Watch Fire TV',
            icon: 'material:tv_remote', accent: 'firetv', accent_style: 'bloom', span: 2 },
          { id: 'a2', type: 'activity', activity: 'music', label: 'Listen to Music',
            icon: 'material:music_note', accent: 'spotify', accent_style: 'tint', span: 2 },
          { id: 'a3', type: 'activity', activity: 'movie', label: 'Movie Night',
            icon: 'material:movie', accent: 'netflix', accent_style: 'icon-bloom', span: 2 },
        ] },
        { columns: 3, accent_style: 'title-bloom', tiles: [
          { id: 'p1', type: 'preset', label: 'Beach Radio', icon: 'material:radio', accent: 'coral', action: {} },
          { id: 'p2', type: 'preset', label: 'Jazz for Two', icon: 'material:piano', accent: 'indigo', action: {} },
          { id: 'p3', type: 'preset', label: 'Chill Mix', icon: 'material:queue_music', accent: 'jade', action: {} },
        ] },
        { columns: 1, tiles: [
          { id: 'd1', type: 'device', entity: 'light.z1', label: 'Zone 1 - Lounge',
            icon: 'material:heat', accent: 'jade', span: 2 },
        ] },
      ] } },
    },
    states: {
      'select.harmonium_den_activity': { s: 'watch_tv', a: {} },
      'light.z1': { s: 'on', a: { brightness: 128, friendly_name: 'Zone 1' } },
    },
  },

  /* Extended entity support: the new control shapes in one column */
  'v087-controls': {
    height: 900,
    config: { ...BASE,
      activities: {},
      screens: { p: { name: 'Den', type: 'hub', sections: [
        { columns: 1, tiles: [
          { id: 'sw', type: 'switch', entity: 'switch.deck_lights', label: 'Deck Lights',
            icon: 'material:deck', span: 2 },
          { id: 'lk', type: 'lock', entity: 'lock.front_door', label: 'Front Door',
            icon: 'material:door_front', span: 2 },
          { id: 'nm', type: 'number', variant: 'slider', entity: 'number.spa_target',
            label: 'Spa Target', icon: 'material:hot_tub', span: 2 },
          { id: 'sl', type: 'select', variant: 'chips', entity: 'select.sound_mode',
            label: 'Sound Mode', icon: 'material:surround_sound', span: 2 },
          { id: 'pr', type: 'press', entity: 'scene.good_night', label: 'Good Night',
            icon: 'material:bedtime', span: 2 },
        ] },
      ] } },
    },
    states: {
      'switch.deck_lights': { s: 'on', a: { friendly_name: 'Deck Lights' } },
      'lock.front_door': { s: 'locked', a: { friendly_name: 'Front Door' } },
      'number.spa_target': { s: '102', a: { min: 60, max: 104, step: 1,
        unit_of_measurement: '°F', friendly_name: 'Spa Target' } },
      'select.sound_mode': { s: 'Movie', a: { options: ['Movie', 'Music', 'Night'],
        friendly_name: 'Sound Mode' } },
      'scene.good_night': { s: 'scening', a: { friendly_name: 'Good Night' } },
    },
  },

  /* the light dimmer + the one-card group (his heaters page) */
  'v087-dimmer': {
    height: 620,
    config: { ...BASE,
      activities: {},
      screens: { p: { name: 'Heaters', type: 'hub', sections: [
        { columns: 1, tiles: [
          { id: 'z1', type: 'light', variant: 'inline', entity: 'light.z1',
            label: 'Zone 1 - Lounge', icon: 'material:heat', span: 2,
            accent: 'coral', accent_style: 'bloom', card_group: 'zg' },
          { id: 'z2', type: 'light', variant: 'inline', entity: 'light.z2',
            label: 'Zone 2 - Dining', icon: 'material:heat', span: 2,
            accent: 'coral', accent_style: 'bloom', card_group: 'zg' },
        ] },
        { columns: 1, tiles: [
          { id: 'z3', type: 'light', variant: 'compact', entity: 'light.z3',
            label: 'Porch Lanterns', icon: 'material:light', span: 2 },
        ] },
      ] } },
    },
    states: {
      'light.z1': { s: 'on', a: { brightness: 128, friendly_name: 'Zone 1' } },
      'light.z2': { s: 'on', a: { brightness: 191, friendly_name: 'Zone 2' } },
      'light.z3': { s: 'on', a: { brightness: 64, friendly_name: 'Porch' } },
    },
  },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [name, shot] of Object.entries(SHOTS)) {
  const ctx = await b.newContext({
    viewport: { width: 349, height: shot.height }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log(name, 'pageerror:', String(e.message).slice(0, 100)));
  await ctx.route('**/config.json*', r => r.fulfill({ json: shot.config }));
  await ctx.route('**/fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css',
    body: "@font-face{font-family:'Material Symbols Outlined';font-style:normal;font-weight:400;src:url(data:font/woff2;base64," + FONTB64 + ") format('woff2');}.material-symbols-outlined{font-family:'Material Symbols Outlined';font-weight:normal;font-style:normal;line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;word-wrap:normal;direction:ltr;-webkit-font-feature-settings:'liga';-webkit-font-smoothing:antialiased;}" }));
  await ctx.route('**/msym.woff2', r => r.fulfill({ contentType: 'font/woff2', body: FONT }));
  await p.addInitScript((states) => {
    localStorage.setItem('hakr_token', 't');
    localStorage.setItem('hakr_host', 'localhost:8482');
    window.WebSocket = class {
      constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
      send(m) { const g = JSON.parse(m);
        const r = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
        if (g.type === 'auth') r({ type: 'auth_ok' });
        else if (g.type === 'subscribe_entities') {
          r({ type: 'result', id: g.id, success: true, result: null });
          r({ type: 'event', id: g.id, event: { a: states } });
        } else r({ type: 'result', id: g.id, success: true, result: null }); }
      close() {}
    };
  }, shot.states);
  await p.goto('http://localhost:8482/index.html');
  await p.waitForTimeout(1400);
  await p.evaluate(() => { try { setFocus(null); } catch (e) {} });
  await p.waitForTimeout(200);
  const box = await p.evaluate(() => {
    const el = document.querySelector('#grid, main, body');
    const r = document.body.getBoundingClientRect();
    let bottom = 0;
    for (const t of document.querySelectorAll('.tile'))
      bottom = Math.max(bottom, t.getBoundingClientRect().bottom);
    return { w: Math.round(r.width), bottom: Math.ceil(bottom) + 14 };
  });
  await p.screenshot({ path: '/root/work/harmonium/docs/media/' + name + '.png',
    clip: { x: 0, y: 0, width: 349, height: Math.min(shot.height, box.bottom) } });
  console.log(name + '.png', '349×' + Math.min(shot.height, box.bottom));
  await ctx.close();
}
await b.close();
