/* THE NAVIGATION WE AGREED (v0.85.7 round 2 — Suresh: "Home and Back
   target the app except on TV where they target the TV. Long Press
   Back and Home always target the App. On the astrion I added right
   bracket to Long Press Back, and = to long press home. They need to
   be wired up. Doing weird stuff like turning off and on the TV!").
   The weirdness: the stock astrion keymap mapped '=' → power_hold, so
   his long-press Home ENDED/STARTED the activity. Now, end to end
   with the CURRENT input policy + the fixed astrion keymap:
     1. plain page, '=' (home_hold) → app home (walks to parent) —
        and NEVER a power path (no service calls at all);
     2. plain page, ']' (back_hold) → app back;
     3. TV page, '[' (tap back) → the DEVICE's back command;
     4. TV page, F1 (tap home) → the DEVICE's home command;
     5. TV page, '=' (home_hold) → the APP's home — leaves the page,
        no remote command;
     6. TV page, ']' (back_hold) → the APP's back. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const starter = JSON.parse(readFileSync(
  new URL('../custom_components/harmonium/starter-config.json', import.meta.url), 'utf8'));
const CONFIG = {
  version: 2, home_screen: 'porch', screen_order: ['porch'],
  global: { room: 'X', main_home: 'overview' },
  input: starter.input,                        /* the CURRENT policy */
  remotes: { default: { capabilities: ['touch', 'pointer'] },
    astrion: starter.remotes.astrion },        /* the FIXED keymap */
  screens: {
    overview: { name: 'Overview', tiles: [
      { id: 'n0', type: 'nav', target: 'porch', label: 'Porch' } ] },
    porch: { name: 'Porch', parent: 'overview', tiles: [
      { id: 'n1', type: 'nav', target: 'tv', label: 'TV' } ] },
    tv: { name: 'TV', parent: 'porch',
      control_target: { navigation: 'remote.firetv',
        pass_through: ['up', 'down', 'left', 'right', 'select', 'back', 'home'] },
      tiles: [{ id: 'd1', type: 'dpad', entity: 'remote.firetv' }] },
  },
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 350, height: 582 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  localStorage.setItem('hakr_device', 'astrion');
  window.__calls = [];
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'call_service') {
        window.__calls.push(msg.domain + '.' + msg.service + ':' +
          ((msg.service_data || {}).command || ''));
        reply({ type: 'result', id: msg.id, success: true, result: null });
      } else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        reply({ type: 'event', id: msg.id, event: { a: {
          'remote.firetv': { s: 'on', a: {} } } } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
const ck = (n, c) => { if (!c) errs.push(n); };
const calls = () => p.evaluate(() => window.__calls.splice(0));
const scr = () => p.evaluate(() => S.screen);
const goto = (id) => p.evaluate((x) => navigate(x), id);

/* 1. plain page: '=' = home_hold → APP home, and never a power path */
await calls();
await p.keyboard.press('=');
await p.waitForTimeout(400);
const c1 = await calls();
ck('plain page: hold-Home walks to the parent (' + await scr() + ')', await scr() === 'overview');
ck('plain page: hold-Home fires NO services (was: TV power toggling!) [' + c1 + ']', c1.length === 0);

/* 2. plain page: ']' = back_hold → APP back */
await goto('porch'); await p.waitForTimeout(300);
await goto('tv'); await p.waitForTimeout(300);   /* stack: porch */
await goto('porch'); await p.waitForTimeout(300); /* re-land; stack has entries */
await p.keyboard.press(']');
await p.waitForTimeout(400);
ck('plain page: hold-Back is APP back (' + await scr() + ')', await scr() !== 'porch');

/* TV page fences */
await goto('tv'); await p.waitForTimeout(400);
await calls();
/* 3. tap back → device */
await p.keyboard.press('[');
await p.waitForTimeout(300);
const c3 = await calls();
ck('TV page: tap Back → device back [' + c3 + ']',
  c3.some(x => /^remote\.send_command:back$/i.test(x)) && await scr() === 'tv');
/* 4. tap home → device */
await p.keyboard.press('F1');
await p.waitForTimeout(300);
const c4 = await calls();
ck('TV page: tap Home → device home [' + c4 + ']',
  c4.some(x => /^remote\.send_command:home$/i.test(x)) && await scr() === 'tv');
/* 5. '=' home_hold → APP home, no remote command */
await p.keyboard.press('=');
await p.waitForTimeout(400);
const c5 = await calls();
ck('TV page: hold-Home → the APP (' + await scr() + ')', await scr() === 'porch');
ck('TV page: hold-Home sent NO device command [' + c5 + ']',
  !c5.some(x => x.indexOf('remote.') === 0));
/* 6. ']' back_hold on TV → APP back */
await goto('tv'); await p.waitForTimeout(400);
await calls();
await p.keyboard.press(']');
await p.waitForTimeout(400);
const c6 = await calls();
ck('TV page: hold-Back → the APP (' + await scr() + ')', await scr() !== 'tv');
ck('TV page: hold-Back sent NO device command [' + c6 + ']',
  !c6.some(x => x.indexOf('remote.') === 0));

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
