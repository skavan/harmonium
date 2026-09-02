/* IDENTITY PALETTE fence (identity-palette V1, 2026-09-01).
   Two halves:
   1. STATIC — re-derives every slot from the canvas formula
      (badge oklch(0.68 0.15 H), wash oklch(0.55 0.14 H)) and
      byte-compares against the @identity-palette block in
      tokens.css, so the shipped rgba can never drift from the
      math ("just turn oklch into rgba" — but provably). Also
      asserts every hue SURVIVES sRGB: chroma ≥ 0.138, hue drift
      < 1° — the canvas's own gamut law.
   2. RENDERED — the two treatments at the panel's 349: bloom
      geometry and alpha, the tint's A1 text rule, the running
      lift, slot-beats-custom, the legacy hex staying second-class,
      and the type-led preset cell. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

/* ---- 1. the palette math (mirrors tools/gen-identity-palette.mjs) ---- */
const SLOTS = [["coral", 20], ["fern", 127], ["jade", 145], ["indigo", 272],
  ["violet", 299], ["orchid", 326], ["rose", 353], ["slate", 0]];
function oklchToSrgb(l, c, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h), b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
  return [
    +4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S,
  ].map(v => {
    const g = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(g * 255)));
  });
}
function srgbToOklch(rgb) {
  const lin = rgb.map(v => { const g = v / 255;
    return g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4); });
  const L = 0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2];
  const M = 0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2];
  const S = 0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2];
  const l_ = Math.cbrt(L), m_ = Math.cbrt(M), s_ = Math.cbrt(S);
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const b = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  const l = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  return { l, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}
const hex = rgb => "#" + rgb.map(v => v.toString(16).padStart(2, "0")).join("");
const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const block = (css.split('@identity-palette-begin')[1] || '').split('@identity-palette-end')[0];
for (const [name, h] of SLOTS) {
  const slate = name === 'slate';
  const badge = oklchToSrgb(0.68, slate ? 0 : 0.15, h);
  const wash = oklchToSrgb(0.55, slate ? 0 : 0.14, h);
  const bTok = (block.match(new RegExp(`--id-${name}-b:\\s*(#[0-9a-f]{6})`)) || [])[1];
  const wTok = (block.match(new RegExp(`--id-${name}-w:\\s*([\\d, ]+);`)) || [])[1];
  ck(`palette: ${name} badge matches the formula`, bTok === hex(badge));
  ck(`palette: ${name} wash triplet matches the formula`,
    wTok && wTok.replace(/\s+/g, ' ').trim() === wash.join(', '));
  if (!slate) {
    const back = srgbToOklch(wash);
    ck(`palette: ${name} survives sRGB (c ≥ .138, drift < 1°)`,
      back.c >= 0.138 && Math.abs(((back.h - h + 540) % 360) - 180) < 1);
    /* the reserved arcs — no slot may sit inside them */
    ck(`palette: ${name} avoids the reserved arcs (40–110 focus, 170–240 gamut)`,
      !(h >= 40 && h <= 110) && !(h >= 170 && h <= 240));
  }
}

/* ---- 1b. THE BRAND TIER + INK (V2 canvas, 2026-09-02): re-derive
   badge (clamp L 0.46–0.86, C to gamut ceiling; achromatics ship
   raw), wash (identity formula at the brand hue), and ink (higher
   WCAG contrast of --accent-ink vs white) — byte-compare against
   tokens.css. THE AMBER ARC IS EXEMPT FOR BRANDS BY DESIGN (canvas
   §3: Fire TV ships #ff9900 at H≈65 inside 40–110 — do NOT "fix"
   it; the reservation was written for washes and identity picks,
   never for a 36px brand disc). ---- */
const BRANDS = [
  ['firetv', '#ff9900'], ['appletv', '#ffffff'], ['googletv', '#4285f4'],
  ['samsung', '#2848c0'], ['lg', '#a50134'], ['sony', '#000000'],
  ['sonos', '#d8a158'], ['netflix', '#e50914'], ['spotify', '#1db954'],
  ['plex', '#e5a00d'], ['roku', '#7321b6'], ['shield', '#76b900'],
  ['disney', '#1541d4'], ['youtube', '#ff0001'],
  ['prime', '#00a8e1'], ['peacock', '#000000'], ['paramount', '#0064ff'],
  ['max', '#0231ec'], ['hulu', '#1de783'], ['fubo', '#fa4616'],
  ['espn', '#d2001f'], ['britbox', '#3545c0'], ['pbs', '#2b41cd'],
];
const unhex = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
function inGamut(l, c, hDeg) {
  const rgbLin = (() => {
    const hr = (hDeg * Math.PI) / 180;
    const a = c * Math.cos(hr), b = c * Math.sin(hr);
    const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
    const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
    return [
      +4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
      -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
      -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S];
  })();
  return rgbLin.every(v => v >= -1e-4 && v <= 1 + 1e-4);
}
function ceilingC(l, h) {
  let lo = 0, hi = 0.5;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(l, mid, h)) lo = mid; else hi = mid;
  }
  return lo;
}
function relLum(rgb) {
  const lin = rgb.map(v => { const g = v / 255;
    return g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4); });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function wcag(a, b) {
  const la = relLum(a), lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const DARK = unhex('#14181d');
for (const [name, src] of BRANDS) {
  const rgb = unhex(src);
  const o = srgbToOklch(rgb);
  let badge;
  if (o.c < 0.02) badge = rgb;
  else {
    const l2 = Math.max(0.46, Math.min(0.86, o.l));
    badge = oklchToSrgb(l2, Math.min(o.c, ceilingC(l2, o.h)), o.h);
  }
  const wash = o.c < 0.02 ? oklchToSrgb(0.55, 0, 0)
    : oklchToSrgb(0.55, Math.min(0.14, ceilingC(0.55, o.h)), o.h);
  const ink = wcag(DARK, badge) >= wcag(unhex('#ffffff'), badge)
    ? 'var(--accent-ink)' : '#ffffff';
  const bTok = (block.match(new RegExp(`--id-${name}-b:\\s*(#[0-9a-f]{6})`)) || [])[1];
  const wTok = (block.match(new RegExp(`--id-${name}-w:\\s*([\\d, ]+);`)) || [])[1];
  const iTok = (block.match(new RegExp(`--id-${name}-i:\\s*([^;]+);`)) || [])[1];
  ck(`brand: ${name} badge matches the clamp law`, bTok === hex(badge));
  ck(`brand: ${name} wash is the SYSTEM formula at the brand hue`,
    wTok && wTok.replace(/\s+/g, ' ').trim() === wash.join(', '));
  ck(`ink: ${name} is the measured pick`, (iTok || '').trim() === ink);
  ck(`ink: ${name} clears 4.4:1 on its badge`,
    Math.max(wcag(DARK, badge), wcag(unhex('#ffffff'), badge)) >= 4.4);
}
/* identity slots got inks too — all dark at L 0.68 */
for (const [name] of SLOTS)
  ck(`ink: identity ${name} rides --accent-ink`,
    ((block.match(new RegExp(`--id-${name}-i:\\s*([^;]+);`)) || [])[1] || '').trim() ===
      'var(--accent-ink)');
/* the generated class map and slot list carry every slot */
const gridCss = readFileSync(new URL('../src/styles/grid.css', import.meta.url), 'utf8');
const tilesJs = readFileSync(new URL('../src/ui/tiles.js', import.meta.url), 'utf8');
for (const name of [...SLOTS.map(s => s[0]), ...BRANDS.map(b => b[0])]) {
  ck(`class map covers ${name}`, gridCss.includes(
    `.tile.id-${name} { --tacc: var(--id-${name}-b); --idw: var(--id-${name}-w); --tink: var(--id-${name}-i); }`));
  ck(`ID_SLOTS covers ${name}`, new RegExp(`\\b${name}: 1`).test(tilesJs));
}
/* JOINT UNIQUENESS (canvas §7): no two stock apps may share BOTH
   glyph and hue family — colour and glyph each cover the other's
   collisions, and this is the law that keeps the grid legible */
const stocklib = readFileSync(new URL('../studio-src/src/lib/stocklib.js', import.meta.url), 'utf8');
const idBlock = (stocklib.split('STOCK_APP_IDENTITIES = {')[1] || '').split('};')[0];
const appRows = [...idBlock.matchAll(/(\w+):\s*\{ name: "[^"]+", icon: "material:(\w+)"(?:, accent: "(\w+)")? \}/g)]
  .map(m => ({ id: m[1], glyph: m[2], accent: m[3] || null }));
ck('stock app identities parsed (≥ 15 rows)', appRows.length >= 15);
const hueOf = (slot) => {
  const b = BRANDS.find(x => x[0] === slot);
  if (!b) return null;
  const o = srgbToOklch(unhex(b[1]));
  return o.c < 0.02 ? 'achromatic' : o.h;
};
for (let i = 0; i < appRows.length; i++)
  for (let j = i + 1; j < appRows.length; j++) {
    const a = appRows[i], b = appRows[j];
    if (a.glyph !== b.glyph) continue;
    const ha = hueOf(a.accent), hb = hueOf(b.accent);
    const clash = ha !== null && hb !== null && ha !== 'achromatic' && hb !== 'achromatic' &&
      Math.abs(((ha - hb + 540) % 360) - 180) > 165;
    ck(`joint uniqueness: ${a.id} vs ${b.id} share glyph '${a.glyph}' — hues must differ`, !clash);
  }
ck('tv_gen is gone (never a Material Symbols name)', !idBlock.includes('tv_gen'));

/* ---- 2. rendered ---- */
const CONFIG = { version: 2, home_screen: 'p', screen_order: ['p'], global: { room: 'P' },
  devices: {}, dialects: {},
  /* a deliberately PADDED set icon (ink 6..18 in a 24 grid — 50%
     coverage, a pack's brand safe-margin) for the ink-fit fence */
  icon_paths: { 'phu:probe': { viewBox: '0 0 24 24',
    path: 'M12 6a6 6 0 1 0 0 12a6 6 0 0 0 0-12Z' },
    /* a 20x6 wordmark (ink 2..22 x 9..15) for the wide-mark fence */
    'phu:wprobe': { viewBox: '0 0 24 24', path: 'M2 9h20v6H2Z' } },
  activities: { tv: { name: 'Watch Fire TV', accent: 'indigo',
    accent_style: 'bloom', room_view: 'p', icon: 'phu:probe' } },
  screens: { p: { name: 'P', type: 'hub', sections: [
    { accent_style: 'icon-bloom', tiles: [
      { id: 'a1', type: 'activity', activity: 'tv', label: 'Watch Fire TV', icon: 'material:tv', accent: 'indigo', span: 2 },
      { id: 'a3', type: 'activity', activity: 'tv', label: 'Legacy', icon: 'material:tv', color: '#178de8', span: 2 },
      { id: 'a5', type: 'activity', activity: 'tv', label: 'Both keys', icon: 'material:tv', accent: 'rose', color: '#178de8', span: 2 },
    ] },
    { tiles: [
      { id: 'a2', type: 'activity', activity: 'tv', label: 'Tinted', icon: 'material:tv', identity: 'jade', identity_style: 'icon-tint', span: 2 },
      { id: 'a6', type: 'activity', activity: 'tv', label: 'Wordmark', icon: 'phu:wprobe', accent: 'rose', span: 2 },
      { id: 'a4', type: 'activity', activity: 'tv', label: 'Basic', icon: 'material:tv', accent: 'rose', span: 2 },
    ] },
    /* the activities GENERATOR carries the activity's own style —
       and (round 8) its SECTION's css_vars reach the generated tiles */
    { css_vars: { '--bloom-w': '222px' }, tiles: [{ id: 'g', type: 'activities', room: 'p' }] },
    /* V2 brand tier: a brand slot on an activity bloom, and a ROW
       badge (the icon circle) carrying a white-ink brand */
    { tiles: [
      { id: 'a7', type: 'activity', activity: 'tv', label: 'Watch Fire TV', icon: 'material:tv', accent: 'firetv', accent_style: 'bloom', span: 2 },
    ] },
    { tile_style: 'row', tiles: [
      { id: 'r1', type: 'activity', activity: 'tv', label: 'Samsung', icon: 'material:tv', accent: 'samsung' },
    ] },
    { columns: 3, accent_style: 'title-bloom', tiles: [
      { id: 'p1', type: 'preset', label: 'Concentration Mix', icon: 'material:queue_music', accent: 'rose', action: {} },
      { id: 'p2', type: 'preset', label: 'Discover Weekly', icon: 'material:queue_music', accent: 'indigo', css_vars: { '--title-mark': '22px' }, action: {} },
      { id: 'p3', type: 'preset', label: 'Daily Mix 1', icon: 'material:queue_music', accent: 'slate', accent_style: 'title', action: {} },
      { id: 'p4', type: 'preset', label: 'Chill Mix', icon: 'material:queue_music', accent: 'jade', accent_style: 'title-tint', action: {} },
      { id: 'p5', type: 'preset', label: 'Icon mode', icon: 'material:queue_music', accent: 'jade', accent_style: 'basic', css_vars: { '--preset-lbl': '13px', '--fw-1': '700' }, action: {} },
    ] }] } },
  controllers: {} };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 349, height: 1400 } })).newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await (p.context()).route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const g = JSON.parse(m);
      const r = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (g.type === 'auth') r({ type: 'auth_ok' });
      else r({ type: 'result', id: g.id, success: true, result: null }); }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(800);
const w = await p.evaluate(() => {
  const T = (id) => document.getElementById('tile_' + id);
  const bgi = (id) => getComputedStyle(T(id)).backgroundImage;
  const o = {
    a1: bgi('a1'), a1ic: getComputedStyle(T('a1').querySelector('.top .ic')).color,
    a2: bgi('a2'), a2sub: getComputedStyle(T('a2').querySelector('.sub')).color,
    a3: bgi('a3'), a3ic: getComputedStyle(T('a3').querySelector('.top .ic')).color,
    a5: bgi('a5'),
    a4: bgi('a4'), a4ic: getComputedStyle(T('a4').querySelector('.top .ic')).color,
    p1: bgi('p1'),
    p1h: Math.round(T('p1').getBoundingClientRect().height),
    p1w: Math.round(T('p1').getBoundingClientRect().width),
    p1icFs: getComputedStyle(T('p1').querySelector('.top .ic')).fontSize,
    p1icCol: getComputedStyle(T('p1').querySelector('.top .ic')).color,
    p1icPos: getComputedStyle(T('p1').querySelector('.top .ic')).position,
    p1lblFs: getComputedStyle(T('p1').querySelector('.lbl')).fontSize,
    p1lblFw: getComputedStyle(T('p1').querySelector('.lbl')).fontWeight,
    p3bgi: bgi('p3'),
    p4: bgi('p4'), p4lblFs: getComputedStyle(T('p4').querySelector('.lbl')).fontSize,
    gen: T('g_tv') ? bgi('g_tv') : 'MISSING',
    genVar: T('g_tv') ? T('g_tv').style.getPropertyValue('--bloom-w') : 'MISSING',
    genIcVb: T('g_tv') && T('g_tv').querySelector('.ic svg')
      ? T('g_tv').querySelector('.ic svg').getAttribute('viewBox') : 'MISSING',
    wmVb: T('a6') && T('a6').querySelector('.ic svg')
      ? T('a6').querySelector('.ic svg').getAttribute('viewBox') : 'MISSING',
    wmW: T('a6') && T('a6').querySelector('.ic')
      ? T('a6').querySelector('.ic').style.width : 'MISSING',
    p2icFs: getComputedStyle(T('p2').querySelector('.top .ic')).fontSize,
    /* V2 title-cell recut: mark row + top-aligned label */
    p1markRect: T('p1').querySelector('.top .ic').getBoundingClientRect(),
    p1lblRect: T('p1').querySelector('.lbl').getBoundingClientRect(),
    p1lblWrap: getComputedStyle(T('p1').querySelector('.lbl')).overflowWrap ||
      getComputedStyle(T('p1').querySelector('.lbl')).wordWrap,
    p1lblClipX: T('p1').querySelector('.lbl').scrollWidth -
      T('p1').querySelector('.lbl').clientWidth,
    /* V2 brand tier renders */
    a7: bgi('a7'),
    a7ic: getComputedStyle(T('a7').querySelector('.top .ic')).color,
    r1circ: getComputedStyle(T('r1').querySelector('.icwrap')).backgroundColor,
    r1ink: getComputedStyle(T('r1').querySelector('.icwrap .ic')).color,
    p5lbl: getComputedStyle(T('p5').querySelector('.lbl')).fontSize + '/' +
      getComputedStyle(T('p5').querySelector('.lbl')).fontWeight,
  };
  /* round 5 — the background-repeat wrap: sample the border strip
     pixels via an offscreen canvas is unavailable here; assert the
     computed style instead — every wash layer must be no-repeat */
  o.a1rep = getComputedStyle(T('a1')).backgroundRepeat;
  o.p1rep = getComputedStyle(T('p1')).backgroundRepeat;
  /* round 8 -- the dark left rim: the wash must live on the BORDER
     box, or the 2px transparent border strip shows bare --tile */
  o.a1org = getComputedStyle(T('a1')).backgroundOrigin;
  o.p1org = getComputedStyle(T('p1')).backgroundOrigin;
  T('a1').classList.add('focused');
  o.a1focRep = getComputedStyle(T('a1')).backgroundRepeat;
  o.a1focOrg = getComputedStyle(T('a1')).backgroundOrigin;
  T('a1').classList.remove('focused');
  T('a2').classList.add('on');
  o.a2on = bgi('a2');
  o.a2onSub = getComputedStyle(T('a2').querySelector('.sub')).color;
  T('a2').classList.remove('on');
  return o;
});
ck('bloom: panel-tuned geometry in rgba (180×100 at 64px 50%, fade 72% — round 8: his ' +
   'remote-measured values ARE the defaults)',
  w.a1.startsWith('radial-gradient(180px 100px at 64px 50%, rgba(86, 105, 194, 0.3)') &&
  w.a1.includes('0) 72%'));
ck('bloom rides the section style (icon-bloom inherited)', w.a1.includes('radial-gradient'));
ck('badge is the source of the colour — the glyph wears the slot',
  w.a1ic === 'rgb(121, 144, 244)');
ck('tint (first-cut identity_style spelling still reads — compat)',
  w.a2.startsWith('linear-gradient') && w.a2.includes('rgba(48, 134, 57, 0.15)'));
ck("tint carries A1's own rule: the status line rides --text",
  w.a2sub === 'rgb(242, 245, 248)');
ck('running lifts the tint to its own on-alpha', w.a2on.includes('0.25'));
ck('running status line goes accent (state is text, focus is the ring)',
  w.a2onSub === 'rgb(255, 176, 32)');
ck('legacy hex stays honored, second-class (wash from the hex, glyph untouched)',
  w.a3.includes('rgba(23, 141, 232') && w.a3ic === 'rgb(242, 245, 248)');
ck('a slot beats a custom hex when both exist', w.a5.includes('rgba(173, 73, 121'));
ck('icon-basic is the silent default — no wash', w.a4 === 'none' &&
  w.a4ic === 'rgb(221, 109, 160)');
ck('title preset: the 3-up cell, band height KEPT (round 4: no vertical shrink), name 14/600',
  Math.abs(w.p1w - 102) <= 2 && w.p1h >= 78 &&
  w.p1lblFs === '14px' && w.p1lblFw === '600');
ck('V2 recut: the mark gets ITS OWN ROW — static, 18px, slot-coloured, above the label',
  w.p1icFs === '18px' && w.p1icPos === 'static' &&
  w.p1icCol === 'rgb(221, 109, 160)' &&
  w.p1lblRect.top >= w.p1markRect.bottom - 1);
ck('V2 recut: the label breaks long words instead of clipping silently',
  /break-word/.test(w.p1lblWrap) && w.p1lblClipX <= 1);
ck('V2 brand tier: firetv bloom rides the SYSTEM wash (162, 95, 0) with the brand glyph (#ff9900)',
  w.a7.includes('rgba(162, 95, 0') && w.a7ic === 'rgb(255, 153, 0)');
ck('V2 ink: a white-ink brand badge (samsung) paints its circle #2848c0 with white glyph',
  w.r1circ === 'rgb(40, 72, 192)' && w.r1ink === 'rgb(255, 255, 255)');
ck('title-bloom: the canvas-proportioned pool, lifted alpha',
  w.p1.startsWith('radial-gradient(88% 117% at 20% 100%') && w.p1.includes('0.75'));
ck('title-tint composes: title layout + the soft flat tint',
  w.p4.startsWith('linear-gradient') && w.p4.includes('0.15') && w.p4lblFs === '14px');
ck('a preset may override the section style (title, washless)', w.p3bgi === 'none');
ck('round 5: no wash layer ever wraps into the border strip (no-repeat, focused included)',
  w.a1rep.startsWith('no-repeat') && w.p1rep.startsWith('no-repeat') &&
  w.a1focRep.startsWith('no-repeat'));
ck('round 8: every wash layer sits on the border box (no dark rim in the border strip)',
  w.a1org.startsWith('border-box') && w.p1org.startsWith('border-box') &&
  w.a1focOrg.startsWith('border-box'));
ck("round 8: a band section's css_vars reach its GENERATED tiles ('css variables window " +
   "doesn't seem to impact the preview')", w.genVar === '222px' &&
  w.gen.indexOf('222px') >= 0);
ck('round 8: a minted set icon is INK-FIT to the material live area (padded pack grids ' +
   'no longer render undersized)', w.genIcVb === '5.04 5.04 13.92 13.92');
ck('round 8: a WIDE mark fits by geometric mean at its true aspect (wordmark logos no ' +
   'longer a sliver, and the span carries the real width so anchored marks sit flush)',
  w.wmVb === '1.12 5.65 21.75 12.71' && w.wmW === '1.711em');
ck("round 8: --title-mark resizes the Title-mode mark ('a knob to impact ALL the preset " +
   "icon sizes in Title Mode')", w.p2icFs === '22px');
ck('round 8: --preset-lbl sizes the Icon-mode preset label (was a hard 11px) and --fw-1 ' +
   'weights it', w.p5lbl === '13px/700');
ck("the activities generator carries the activity's OWN style (round 2)",
  typeof w.gen === 'string' && w.gen.startsWith('radial-gradient') &&
  w.gen.includes('rgba(86, 105, 194'));

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
