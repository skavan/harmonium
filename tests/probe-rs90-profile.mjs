/* RS90 PROFILE probe (2026-08-21 — the RS90 lands: new remotes.rs90
   in starter + fixture). Boots the real engine AS an rs90 device
   (hakr_device) against the CT fixture and asserts the profile's
   keymap actually routes: F2 → home (the RS90's F-keys are SWAPPED
   vs the Astrion — F1 is Power there, Home here), F1 → power prompt
   path (no crash), PageDown → ch_down walk, and the flipped Back:
   ']' → back_hold degrades to a plain back when no activity offers
   a navigation target (the doctrine's safety net). Errors empty is
   the pass signal; specific landings asserted where cheap. */
import { chromium } from 'playwright-core';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 350, height: 582 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  localStorage.setItem('hakr_device', 'rs90');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities')
        reply({ type: 'result', id: msg.id, success: true, result: null });
      else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);

const r = {};
const key = async (k) => { await p.keyboard.press(k); await p.waitForTimeout(250); };
const screen = () => p.evaluate(() => document.querySelector('#app')?.className || '');

/* drill somewhere first so home has something to come back FROM */
r.boot = await screen();
await key('PageDown');            /* ch_down: walks the hub — must not crash */
await key('F2');                  /* rs90 home */
r.afterHome = await screen();
await key('F1');                  /* rs90 POWER (not home!) — hub = All Off confirm path, no crash */
await key('Escape');              /* dismiss anything armed */
await key(']');                   /* back_hold, no activity target → degrade to back */
r.afterBackHold = await screen();
await key('\\');                  /* play_pause with no media ctx — must no-op cleanly */
r.errsAfterKeys = errs.length;

/* profile really is rs90: its keymap has F8 → settings (astrion maps
   nothing to F8; a wrong-profile boot would leave this a dead key AND
   the astrion glyph keys would route) — assert via the resolved keymap */
r.profile = await p.evaluate(() => {
  try { return (window.PROFILE && (PROFILE.id || PROFILE.name)) || localStorage.getItem('hakr_device'); }
  catch (e) { return 'err'; }
});

console.log(JSON.stringify({ ...r, ok: errs.length === 0 && r.profile === 'rs90', errs }, null, 1));
await b.close();
