/* PER-TILE css_vars (v0.85.7 — Suresh: "In advanced (JSON) how would
   I change font size and weight? And is it possible to use drop
   shadows?"). t.css_vars = {--name: value} lands on the tile element;
   the tile CSS reads its numbers through variables, so the override
   scopes to one card. Pins: font size + weight land on the label,
   the shadow hooks resolve, a non--- key and a ;-bearing value are
   refused, and untouched tiles keep the theme's numbers. */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'p', screen_order: ['p'],
  global: { room: 'X' },
  remotes: { default: { capabilities: ['touch', 'pointer'] } },
  screens: { p: { name: 'P', tiles: [
    { id: 'a', type: 'nav', target: 'p', label: 'Styled',
      css_vars: { '--fs-1': '19px', '--fw-1': '700',
        '--tile-shadow': '0 4px 14px rgba(0,0,0,0.45)',
        '--lbl-shadow': '0 1px 3px rgba(0,0,0,0.8)',
        'color': 'red', '--evil': 'x; background: red' } },
    { id: 'b', type: 'nav', target: 'p', label: 'Plain' },
  ] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 350, height: 582 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
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

const r = await p.evaluate(() => {
  const a = document.getElementById('tile_a'), bb = document.getElementById('tile_b');
  const al = a.querySelector('.lbl'), bl = bb.querySelector('.lbl');
  const cs = (el) => getComputedStyle(el);
  return {
    fs: cs(al).fontSize, fw: cs(al).fontWeight,
    tileShadow: cs(a).boxShadow !== 'none',
    lblShadow: cs(al).textShadow !== 'none',
    plainFs: cs(bl).fontSize, plainShadow: cs(bb).boxShadow === 'none',
    colorRefused: a.style.getPropertyValue('color') === '',
    evilRefused: a.style.getPropertyValue('--evil') === '',
  };
});
const ck = (n, c) => { if (!c) errs.push(n); };
ck('label font size 19px (got ' + r.fs + ')', r.fs === '19px');
ck('label weight 700 (got ' + r.fw + ')', r.fw === '700');
ck('card drop shadow applied', r.tileShadow);
ck('label text shadow applied', r.lblShadow);
ck('plain tile keeps theme size', r.plainFs !== '19px');
ck('plain tile has no shadow', r.plainShadow);
ck('non--- key refused', r.colorRefused);
ck('; value refused', r.evilRefused);
console.log(JSON.stringify({ ...r, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
