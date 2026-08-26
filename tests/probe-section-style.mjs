/* SECTION STYLE DEFAULTS (v0.85.7 — Suresh: "at the DEVICES section
   level, so it applies to all devices unless overridden"). A section
   carries h / css_vars / label_pos / style; its tiles inherit what
   they don't state. Pins:
     1. section h reaches a silent tile; a tile's own h wins;
     2. section css_vars land, merged key-by-key, tile keys on top;
     3. section label_pos reaches the photo card; own wins;
     4. section style dresses a NAV card but NEVER a media tile;
     5. a section without defaults changes nothing. */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'p', screen_order: ['p'],
  global: { room: 'X' },
  remotes: { default: { capabilities: ['touch', 'pointer'] } },
  screens: { p: { name: 'P', sections: [
    { title: 'Styled', h: 210, label_pos: 'top-left', style: 'image',
      image_opacity: 0.4,        /* v0.85.7 round 2: section-wide dim */
      css_vars: { '--fs-1': '17px', '--fw-1': '600' },
      tiles: [
        { id: 'a', type: 'nav', target: 'p', label: 'Inherits', image: '/x.png' },
        { id: 'b', type: 'nav', target: 'p', label: 'Overrides', image: '/x.png',
          h: 120, label_pos: 'bottom-right', image_opacity: 0.9,
          css_vars: { '--fs-1': '21px' } },
        { id: 'm', type: 'media', entity: 'media_player.mp', label: 'NP' },
      ] },
    { title: 'Plain', tiles: [
      { id: 'c', type: 'nav', target: 'p', label: 'Plain' } ] },
  ] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 350, height: 582 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 100)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await ctx.route('**/x.png', r => r.fulfill({ body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'), contentType: 'image/png' }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        reply({ type: 'event', id: msg.id, event: { a: {
          'media_player.mp': { s: 'off', a: {} } } } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(() => {
  const g = (id) => document.getElementById('tile_' + id);
  const cs = (el) => getComputedStyle(el);
  const a = g('a'), bb = g('b'), m = g('m'), c = g('c');
  return {
    aH: Math.round(a.getBoundingClientRect().height),
    bH: Math.round(bb.getBoundingClientRect().height),
    aFs: cs(a.querySelector('.lbl')).fontSize,
    aFw: cs(a.querySelector('.lbl')).fontWeight,
    bFs: cs(bb.querySelector('.lbl')).fontSize,
    bFw: cs(bb.querySelector('.lbl')).fontWeight,
    aImage: a.className.includes('nav-image'),
    aLp: a.className.includes('lp-top-left'),
    bLp: bb.className.includes('lp-bottom-right') && !bb.className.includes('lp-top-left'),
    mStyleClean: !m.className.includes('nav-image') &&
      !m.className.includes('slim') && !m.className.includes('hero'),
    cPlainFs: cs(c.querySelector('.lbl')).fontSize,
    /* v0.85.7 round 2: section image_opacity inherits, own wins */
    aOp: cs(a.querySelector('.roomimg')).opacity,
    bOp: cs(bb.querySelector('.roomimg')).opacity,
  };
});
const ck = (n, cnd) => { if (!cnd) errs.push(n + ' :: ' + JSON.stringify(r)); };
ck('section h reaches silent tile (210)', Math.abs(r.aH - 210) <= 2);
ck('tile h override wins (120)', Math.abs(r.bH - 120) <= 2);
/* the photo card's label runs calc(var(--fs-1) + 2px) — so 17 → 19
   and 21 → 23; the weight arrives as-is */
ck('section css_vars reach silent tile', r.aFs === '19px' && r.aFw === '600');
ck('tile css_vars win key-by-key (size own, weight inherited)',
  r.bFs === '23px' && r.bFw === '600');
ck('section style dresses the nav card', r.aImage);
ck('section label_pos reaches the photo card', r.aLp);
ck('tile label_pos override wins', r.bLp);
ck('media tile untouched by section style', r.mStyleClean);
ck('plain section unchanged', r.cPlainFs !== '17px');
ck('section image_opacity reaches silent tile (0.4)', Math.abs(+r.aOp - 0.4) < 0.01);
ck('tile image_opacity override wins (0.9)', Math.abs(+r.bOp - 0.9) < 0.01);
console.log(JSON.stringify({ ...r, ok: errs.length === 0, errs: errs.map(e => e.split(' :: ')[0]) }, null, 1));
await b.close();
if (errs.length) process.exit(1);
