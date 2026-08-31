/* ICON SETS probe (0.87 — docs/design-icon-sets.md). Fences:
     a "<set>:<name>" icon renders as a CSS-masked block pointing at
     /local/harmonium/icons/<set>/<name>.svg, painted with
     currentColor (theme-tinted like a font glyph);
     a MISSING file falls back to the neutral glyph via the hidden
     probe img + delegated error handler, and the URL is remembered
     (IMG_DEAD) so a rebuilt tile renders the fallback directly with
     no re-request;
     material: and plain-text icons render exactly as before. */
import { chromium } from 'playwright-core';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

const CONFIG = {
  version: 2, home_screen: 'porch', screen_order: ['porch'],
  global: { room: 'Porch' }, devices: {}, dialects: {}, activities: {},
  screens: { porch: { name: 'Porch', type: 'hub',
    sections: [{ hero_label: 'X', tiles: [
      { id: 'ok', type: 'device', entity: 'switch.a', icon: 'phu:sonos', label: 'Sonos', span: 2 },
      { id: 'bad', type: 'device', entity: 'switch.a', icon: 'phu:nope', label: 'Nope', span: 2 },
      { id: 'mat', type: 'device', entity: 'switch.a', icon: 'material:tv', label: 'TV', span: 2 },
      { id: 'txt', type: 'device', entity: 'switch.a', icon: '🎵', label: 'Emoji', span: 2 },
    ] }] } },
  controllers: {},
};
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 2h3v4z"/></svg>';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await ctx.route('**/local/harmonium/icons/phu/sonos.svg', r =>
  r.fulfill({ contentType: 'image/svg+xml', body: SVG }));
let nopeRequests = 0;
await ctx.route('**/local/harmonium/icons/phu/nope.svg', r => {
  nopeRequests++;
  r.fulfill({ status: 404, body: 'nope' });
});
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_ok' }) }), 20); }
    send() {} close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);

const got = await p.evaluate(() => {
  const q = (id, sel) => document.querySelector('#tile_' + id + ' ' + sel);
  const mask = q('ok', '.icmask');
  const cs = mask && getComputedStyle(mask);
  return {
    maskUrl: mask && (mask.style.webkitMaskImage || mask.style.maskImage),
    bg: cs && cs.backgroundColor,
    probeHidden: mask && getComputedStyle(q('ok', '.mprobe')).display,
    badIsGlyph: !q('bad', '.icmask') &&
      q('bad', '.ic') && q('bad', '.ic').textContent === '•',
    mat: q('mat', '.ic.material-symbols-outlined') &&
      q('mat', '.ic').textContent === 'tv',
    txt: q('txt', '.ic') && q('txt', '.ic').textContent === '🎵',
    dead: typeof IMG_DEAD !== 'undefined' &&
      IMG_DEAD.has('/local/harmonium/icons/phu/nope.svg'),
  };
});
ck('a set icon renders as a masked block at its file URL',
  !!got.maskUrl && got.maskUrl.includes('/local/harmonium/icons/phu/sonos.svg'));
ck('the mask paints currentColor (a real background color, not transparent)',
  !!got.bg && got.bg !== 'rgba(0, 0, 0, 0)');
ck('the probe img never shows', got.probeHidden === 'none');
ck('a missing file falls back to the neutral glyph', got.badIsGlyph);
ck('the dead URL is remembered', got.dead);
ck('material: icons render exactly as before', !!got.mat);
ck('plain-text icons render exactly as before', !!got.txt);

/* a rebuild renders the fallback DIRECTLY — no re-request */
const before = nopeRequests;
await p.evaluate(() => { navigate('porch', true); });
await p.waitForTimeout(400);
const after = await p.evaluate(() => {
  const el = document.querySelector('#tile_bad .ic');
  return { glyph: el && el.textContent === '•' && !el.classList.contains('icmask') };
});
ck('a rebuilt tile renders the fallback with no re-request',
  after.glyph && nopeRequests === before);

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
