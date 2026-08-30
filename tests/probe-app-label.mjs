/* FRIENDLY APP NAMES probe (v0.85.8 — Suresh: "source shows as
   com.britbox.us.firetv and com.fubo.firetv.screen, whereas Hulu and
   ESPN show correctly. We need a friendly name key"). The master app
   list is the friendly-name registry; appLabel() maps a player's raw
   package/source string back through the dialect launch entries.
   Fences:
     1. a raw `source:` package (com.fubo.firetv.screen) renders as
        the master-list name (Fubo TV);
     2. a package known only from an `am start` command
        (com.britbox.us.firetv) renders as BritBox;
     3. a player that already reports a real name (app_name "Hulu")
        passes through untouched;
     4. a package Harmonium never launched passes through raw. */
import { chromium } from 'playwright-core';

const STATES = {
  'media_player.fubo_tv': { s: 'playing',
    a: { source: 'com.fubo.firetv.screen', device_class: 'tv',
         friendly_name: 'Fubo box', supported_features: 84351 } },
  'media_player.brit_tv': { s: 'playing',
    a: { source: 'com.britbox.us.firetv', device_class: 'tv',
         friendly_name: 'Brit box', supported_features: 84351 } },
  'media_player.hulu_tv': { s: 'playing',
    a: { app_name: 'Hulu', device_class: 'tv',
         friendly_name: 'Hulu box', supported_features: 84351 } },
  'media_player.mys_tv': { s: 'playing',
    a: { source: 'com.mystery.app', device_class: 'tv',
         friendly_name: 'Mystery box', supported_features: 84351 } },
};
const CONFIG = {
  version: 2, home_screen: 'p', screen_order: ['p'],
  global: { room: 'X' },
  remotes: { default: { capabilities: ['touch', 'pointer'] } },
  apps: {
    fubo: { name: 'Fubo TV' }, britbox: { name: 'BritBox' },
    hulu: { name: 'Hulu' },
  },
  dialects: { firetv: { apps: {
    fubo: { source: 'com.fubo.firetv.screen' },
    hulu: { source: 'com.hulu.plus' },
    britbox: { action: 'androidtv.adb_command', entity: '$context.media_player',
      data: { command: 'am start -n com.britbox.us.firetv/axis.androidtv.sdk.app.MainActivity' } },
  } } },
  screens: { p: { name: 'P', tiles: [
    { id: 'a', type: 'media', entity: 'media_player.fubo_tv', label: 'A' },
    { id: 'b', type: 'media', entity: 'media_player.brit_tv', label: 'B' },
    { id: 'c', type: 'media', entity: 'media_player.hulu_tv', label: 'C' },
    { id: 'd', type: 'media', entity: 'media_player.mys_tv', label: 'D' },
  ] } },
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
    } close() {}
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(1000);

const r = await p.evaluate(() => {
  const txt = (id) => document.getElementById('tile_' + id).textContent;
  return { a: txt('a'), b: txt('b'), c: txt('c'), d: txt('d') };
});
const ck = (n, cnd) => { if (!cnd) errs.push(n + ' :: ' + JSON.stringify(r)); };
ck('source package maps to master name (Fubo TV)',
  r.a.includes('Fubo TV') && !r.a.includes('com.fubo'));
ck('am-start package maps to master name (BritBox)',
  r.b.includes('BritBox') && !r.b.includes('com.britbox'));
ck('an already-friendly app_name passes through', r.c.includes('Hulu'));
ck('an unknown package passes through raw', r.d.includes('com.mystery.app'));
console.log(JSON.stringify({ ...r, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
