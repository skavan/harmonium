/* SLICE D (2026-08-24): the tuner exception (§5.6) and the ⓘ key-map
   card (§10.1).
   · tuner: true → Ch± sends channel up/down to the device, and does
     NOT walk the panel or arm the pad claim (strip stays hidden);
   · a non-tuner passthrough page → Ch± still borrows the pad (strip on);
   · openKeymapCard() snapshots the current page's key map and opens the
     diag page, which renders a "Keys on <page>" band. */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'home', screen_order: ['home'],
  global: { room: 'X', activity_select: 'select.x' },
  activities: { tvact: { name: 'Cable', context: { dpad: 'remote.box', media_player: 'media_player.box', volume: 'media_player.avr' } } },
  remotes: { pad: { capabilities: ['physical_dpad', 'touch'] } },
  screens: {
    home: { name: 'Home', type: 'hub', grid: { columns: 1 },
      sections: [{ tiles: [{ id: 'h1', type: 'preset', label: 'Go', action: {} }] }] },
    tuner: { name: 'Cable Box', type: 'controller', class: 'activity',
      dpad_passthrough: 'remote.box', tuner: true,
      context: { dpad: 'remote.box' }, grid: { columns: 1 },
      sections: [{ tiles: [{ id: 'u1', type: 'preset', label: 'Guide', action: {} }] }] },
    tv: { name: 'Streamer', type: 'controller', class: 'activity',
      dpad_passthrough: 'remote.box', context: { dpad: 'remote.box' }, grid: { columns: 1 },
      sections: [{ tiles: [{ id: 't1', type: 'preset', label: 'NP', action: {} }] }] },
  },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
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
        reply({ type: 'event', id: msg.id, event: { a: {
          'select.x': { s: 'tvact', a: {} },
          'media_player.avr': { s: 'on', a: { friendly_name: 'Denon AVR' } },
          'media_player.box': { s: 'playing', a: { friendly_name: 'Cable Box' } } } } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => { window._c = []; const o = callService;
  window.callService = (d, s, dat, t) => window._c.push(d + '.' + s + ':' + ((dat || {}).command || '') + '@' + (t || '')); });
const calls = () => p.evaluate(() => window._c.splice(0));
const stripOn = () => p.evaluate(() => !document.getElementById('padstrip').classList.contains('hidden'));
const r = {};

// 1. TUNER: Ch± → device channel, no walk, no strip
await p.evaluate(() => navigate('tuner')); await p.waitForTimeout(200);
await p.evaluate(() => { window._c.splice(0); });
await p.keyboard.press('PageUp'); await p.waitForTimeout(120);
r.tuner = { calls: await calls(), strip: await stripOn(), focus: await p.evaluate(() => S.focusId) };

// 2. NON-tuner passthrough: Ch± borrows the pad (strip on)
await p.evaluate(() => navigate('tv')); await p.waitForTimeout(200);
await p.keyboard.press('PageUp'); await p.waitForTimeout(120);
r.nonTunerStrip = await stripOn();

// 3. KEY-MAP CARD: snapshot the tuner page, open diag, band present
await p.evaluate(() => navigate('tuner')); await p.waitForTimeout(150);
await p.evaluate(() => openKeymapCard()); await p.waitForTimeout(200);
await p.screenshot({ path: '/tmp/keymapcard.png' });
r.card = await p.evaluate(() => ({
  screen: S.screen,
  page: S.keymapCard && S.keymapCard.page,
  rows: S.keymapCard && S.keymapCard.rows.length,
  bandTile: !!document.getElementById('tile_dg_k0'),
  chDesc: (S.keymapCard.rows.find(x => x.k.indexOf('CH') === 0) || {}).d,
  volDesc: (S.keymapCard.rows.find(x => x.k.indexOf('Vol') === 0) || {}).d,
}));

r.ok =
  r.tuner.calls.length === 1 &&
  r.tuner.calls[0] === 'remote.send_command:CHANNEL_UP@remote.box' &&
  r.tuner.strip === false && !r.tuner.focus &&
  r.nonTunerStrip === true &&
  r.card.screen === 'diag:' && r.card.rows >= 5 && r.card.bandTile === true &&
  r.card.chDesc === 'Channel up / down (device)' &&
  r.card.volDesc === '→ Denon AVR' &&
  errs.length === 0;

console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close();
