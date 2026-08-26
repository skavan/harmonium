/* THE ⓘ PAGE REWORK (v0.85.7 — Suresh: "The info page has got
   annoying. Move all the keys to the bottom. Put the ip address in
   the page (near the top) and increase the tap zone.")
     1. the device IP row renders FIRST (fed by the integration's new
        /api/harmonium/whoami — the webview can't learn its own
        address), with the Fully remote-admin hint;
     2. the key-map card is the LAST section, not the first;
     3. the ⓘ hit target is at least ~44×44 px. */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'room', screen_order: ['room'],
  global: { room: 'Den' },
  remotes: { default: { capabilities: ['touch', 'pointer'] } },
  screens: { room: { name: 'Den', tiles: [
    { id: 't1', type: 'nav', target: 'room', label: 'X' } ] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 350, height: 582 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await ctx.route('**/api/harmonium/whoami*', r => r.fulfill({ json: { ip: '192.168.1.87' } }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(800);

/* the ⓘ hit target */
const hit = await p.evaluate(() => {
  const el = document.getElementById('info');
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
if (hit.w < 44 || hit.h < 44)
  errs.push('info tap target too small: ' + hit.w + 'x' + hit.h);

/* open ⓘ (tap = diagnostics; goes through the real handler so the
   key-map card snapshot happens like a finger would make it) */
await p.evaluate(() => {
  const el = document.getElementById('info');
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  el.click();
});
await p.waitForTimeout(700);

const diag = await p.evaluate(() => {
  const txt = document.getElementById('grid')?.textContent || document.body.textContent;
  const secs = [...document.querySelectorAll('.sec-title, h2, .section .title')]
    .map(x => x.textContent.trim()).filter(Boolean);
  return {
    onDiag: txt.includes('Engine v'),
    ip: txt.includes('192.168.1.87'),
    /* v0.85.7: the boot-address row — the workspace stub, main incl. */
    engUrl: txt.includes('/local/harmonium/main/index.html'),
    fullyHint: txt.includes(':2323'),
    ipBeforeEngine: txt.indexOf('192.168.1.87') > -1 &&
      txt.indexOf('192.168.1.87') < txt.indexOf('Engine v'),
    keysAfterTools: (() => {
      const k = txt.indexOf('Keys on'); const t = txt.indexOf('Tools');
      return k === -1 || (t > -1 && k > t);   // keys absent or after Tools
    })(),
  };
});
if (!diag.onDiag) errs.push('did not reach the diagnostics page');
if (!diag.ip) errs.push('device IP missing from the page');
if (!diag.engUrl) errs.push('boot address (workspace stub URL) missing from the page');
if (!diag.fullyHint) errs.push('Fully remote-admin hint (:2323) missing');
if (!diag.ipBeforeEngine) errs.push('IP row is not near the top (renders after the build band)');
if (!diag.keysAfterTools) errs.push('key-map card is not at the bottom');

console.log(JSON.stringify({ hit, diag, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
