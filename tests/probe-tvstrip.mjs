/* §7 TV BACK/HOME STRIP (2026-08-24). On TV (passthrough) pages the
   physical Back/Home drive the device, so Harmonium's Back/Home live on
   a pinned strip. Under test: present on TV pages, absent on non-TV,
   and the two buttons take the Harmonium (UI) path. Also screenshots
   the TV page so the look can be eyeballed. */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'home', screen_order: ['home'],
  global: { room: 'X', activity_select: 'select.x' },
  theme: { accent: '#ffb300', bg: '#0d0f12', tile: '#1a1e24',
    wash: 'rgba(255,179,0,.12)' },
  activities: { tvact: { name: 'Watch Fire TV', context: { dpad: 'remote.fire' } },
    music: { name: 'Music', context: { media_player: 'media_player.amp' } } },
  remotes: { pad: { capabilities: ['physical_dpad', 'touch'] } },
  screens: {
    home: { name: 'Home', type: 'hub', grid: { columns: 1 },
      sections: [{ tiles: [{ id: 'h1', type: 'preset', label: 'Go', action: {} }] }] },
    music: { name: 'Music', type: 'controller', class: 'activity',
      context: { media_player: 'media_player.amp' }, grid: { columns: 1 },
      sections: [{ tiles: [{ id: 'p1', type: 'preset', label: 'One', action: {} }] }] },
    tv: { name: 'Watch Fire TV', type: 'controller', class: 'activity',
      dpad_passthrough: 'remote.fire', context: { dpad: 'remote.fire' },
      grid: { columns: 1 },
      sections: [{ tiles: [
        { id: 't1', type: 'preset', label: 'Now Playing', action: {} },
        { id: 't2', type: 'preset', label: 'Apps', action: {} },
        { id: 't3', type: 'preset', label: 'Guide', action: {} } ] }] },
  },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 349, height: 582 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  localStorage.setItem('hakr_device', 'pad');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        reply({ type: 'event', id: msg.id, event: { a: { 'select.x': { s: 'tvact', a: {} } } } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);

const shown = () => p.evaluate(() =>
  !document.getElementById('tvstrip').classList.contains('hidden') &&
  document.getElementById('app').classList.contains('tvstrip-on'));
const r = {};

// TV page → strip present
await p.evaluate(() => navigate('tv')); await p.waitForTimeout(250);
r.tvShown = await shown();
await p.screenshot({ path: '/tmp/tvstrip.png' });

// deep-link then tvBack → Harmonium back (stack pops back to tv)
await p.evaluate(() => navigate('home')); await p.waitForTimeout(150);
await p.evaluate(() => navigate('tv')); await p.waitForTimeout(150);
const beforeBack = await p.evaluate(() => S.screen);
await p.evaluate(() => document.getElementById('tvBack').click());
await p.waitForTimeout(150);
r.backWorked = { before: beforeBack, after: await p.evaluate(() => S.screen) };

// tvHome → Harmonium home
await p.evaluate(() => navigate('tv')); await p.waitForTimeout(150);
await p.evaluate(() => document.getElementById('tvHome').click());
await p.waitForTimeout(150);
r.homeAfter = await p.evaluate(() => S.screen);

// non-TV page (music) → strip absent
await p.evaluate(() => { S.states.set('select.x', { s: 'music', a: {} });
  navigate('music'); }); await p.waitForTimeout(200);
r.musicHidden = await p.evaluate(() =>
  document.getElementById('tvstrip').classList.contains('hidden'));

r.ok = r.tvShown === true &&
  r.backWorked.before === 'tv' && r.backWorked.after === 'home' &&
  r.homeAfter === 'home' && r.musicHidden === true && errs.length === 0;
console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close();
