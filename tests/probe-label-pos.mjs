/* LABEL POSITION on the photo nav card (v0.85.7 — Suresh: "I could
   swear that we used to have a label location parameter"). We never
   did; now `label_pos` places the overlay label — nine positions,
   bottom-left the unstated default, bad values refused. */
import { chromium } from 'playwright-core';
const CONFIG = {
  version: 2, home_screen: 'p', screen_order: ['p'],
  global: { room: 'X' },
  remotes: { default: { capabilities: ['touch', 'pointer'] } },
  screens: { p: { name: 'P', tiles: [
    { id: 'a', type: 'nav', target: 'p', label: 'TL', style: 'image',
      image: '/x.png', label_pos: 'top-left' },
    { id: 'b', type: 'nav', target: 'p', label: 'CC', style: 'image',
      image: '/x.png', label_pos: 'center' },
    { id: 'c', type: 'nav', target: 'p', label: 'BL', style: 'image', image: '/x.png' },
    { id: 'd', type: 'nav', target: 'p', label: 'X', style: 'image',
      image: '/x.png', label_pos: 'evil;inject' },
    /* v0.85.7: image_opacity — the hero knob on photo cards */
    { id: 'e', type: 'nav', target: 'p', label: 'DIM', style: 'image',
      image: '/x.png', image_opacity: 0.4 },
    { id: 'f', type: 'nav', target: 'p', label: 'EVIL', style: 'image',
      image: '/x.png', image_opacity: 7 },
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
      else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(800);
const r = await p.evaluate(() => {
  const pos = (id) => {
    const t = document.getElementById('tile_' + id);
    const top = t.querySelector('.top');
    const tr = t.getBoundingClientRect(), lr = top.getBoundingClientRect();
    return { fromTop: Math.round(lr.top - tr.top), fromBottom: Math.round(tr.bottom - lr.bottom),
      centered: Math.abs((lr.left + lr.width / 2) - (tr.left + tr.width / 2)) < 6,
      cls: t.className };
  };
  const imgOp = (id) => getComputedStyle(
    document.getElementById('tile_' + id).querySelector('.roomimg')).opacity;
  return { a: pos('a'), b: pos('b'), c: pos('c'), d: pos('d'),
    dimOp: imgOp('e'), defOp: imgOp('c'), clampOp: imgOp('f') };
});
const ck = (n, c) => { if (!c) errs.push(n); };
ck('top-left sits at the top', r.a.fromTop < 20 && r.a.fromBottom > 40);
ck('center is centered both ways', r.b.centered && Math.abs(r.b.fromTop - r.b.fromBottom) < 14);
ck('default stays bottom-left', r.c.fromBottom < 20 && r.c.fromTop > 40);
ck('bad value refused (no lp- class)', r.d.cls.indexOf('lp-') < 0);
ck('image_opacity 0.4 applies', Math.abs(+r.dimOp - 0.4) < 0.01);
ck('absent image_opacity keeps the .85 default', Math.abs(+r.defOp - 0.85) < 0.01);
ck('out-of-range image_opacity clamps to 1', Math.abs(+r.clampOp - 1) < 0.01);
console.log(JSON.stringify({ r, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
