/* ICON PICKER fence (2026-09-02 — his HA tile-card screenshot: "The
   search starts from the first key across multiple icon sets").
   Under test, in the real built Studio:
   · first-key unified search: material + server sets (mocked
     cross-set ?search=) + a CUSTOM pack that exists only as a
     lovelace module registering window.customIcons (the bridge);
   · rows are set-prefixed and render real path data;
   · a resolved custom icon is POSTed back for server persistence;
   · picking a row writes "<set>:<name>" and the preview chip shows;
   · "set:frag" narrows to that one set. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const cfg = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
/* THE DECLARATION GATE (2026-09-02: "ask users to add the icon
   prefixes they care about"): fa6-solid is declared; the bridge may
   run. hangy is declared too but its listing never resolves — the
   deadline fences below prove a hanging pack cannot hold the picker
   (his round-2 report: "spinning wheel... stopped doing anything"). */
cfg.global = cfg.global || {};
cfg.global.icon_sets = ['fa6-solid', 'hangy'];
let resourceFetches = 0;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'POST'
  ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: cfg }));
await ctx.route('**/api/harmonium/workspaces', r => r.fulfill({ json: { order: ['main'],
  workspaces: { main: { name: 'Main', file: 'config.json' } } } }));
await ctx.route('**/api/harmonium/engine_version', r =>
  r.fulfill({ json: { v: '0.87.0', bundled: '0.87.0', integration: '0.87.0' } }));
await ctx.route('**/api/harmonium/pair_admin', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/fleet', r => r.fulfill({ json: { units: [], fully: [] } }));

/* ---- the icons API mock ---- */
const saved = [];
await ctx.route('**/api/harmonium/icons*', r => {
  const u = new URL(r.request().url());
  if (r.request().method() === 'POST') {
    saved.push(r.request().postDataJSON());
    return r.fulfill({ json: { written: Object.keys(r.request().postDataJSON()), rejected: [] } });
  }
  if (u.searchParams.get('sets'))
    return r.fulfill({ json: { sets: ['hangy'] } });   /* server-live set */
  if (u.searchParams.get('resources')) {
    resourceFetches++;
    return r.fulfill({ json: { resources: ['/local/fakepack.js'] } });
  }
  const s = u.searchParams.get('search');
  if (s !== null) {
    const rows = 'door'.startsWith(s) || s.includes('door') ? [
      { set: 'mdi', name: 'door-open', viewBox: '0 0 24 24', path: 'M4 4h4z' },
      { set: 'phu', name: 'door_open', viewBox: '0 0 24 24', path: 'M1 1h1z' },
      { set: 'mdi', name: 'door-closed', viewBox: '0 0 24 24', path: 'M5 5h5z' },
      /* the SERVER also speaks fa6-solid (banked / custom_icons) —
         overlapping the declared bridge set, the each_key_duplicate
         regression his live typing found */
      { set: 'fa6-solid', name: 'door-open', viewBox: '0 0 512 512', path: 'M9 9h9z' },
    ] : [];
    return r.fulfill({ json: { icons: rows, sets: ['mdi', 'phu'] } });
  }
  const set = u.searchParams.get('list');
  if (set) {
    if (set === 'phu') return r.fulfill({ json: { icons: [
      { name: 'door_open', viewBox: '0 0 24 24', path: 'M1 1h1z' }], no_source: false } });
    return r.fulfill({ json: { icons: [], no_source: true } });
  }
  return r.fulfill({ json: { found: {}, missing: [u.searchParams.get('names')], no_source: [] } });
});
/* the custom pack: a lovelace module registering window.customIcons
   (developers.home-assistant.io 2020-05-09 contract) */
await ctx.route('**/local/fakepack.js', r => r.fulfill({
  contentType: 'application/javascript',
  body: `window.customIcons = window.customIcons || {};
window.customIcons['fa6-solid'] = {
  getIcon: async (n) => ({ viewBox: '0 0 512 512', path: 'M7 7h7z' }),
  getIconList: async () => [{ name: 'door-open' }, { name: 'user' }],
};
window.customIcons['hangy'] = {
  getIcon: () => new Promise(() => {}),
  getIconList: () => new Promise(() => {}),   /* never resolves */
};` }));
await ctx.route('**/harmonium-static/studio.html', r =>
  r.fulfill({ body: studio, contentType: 'text/html' }));
await ctx.route('**api.github.com/**', r => r.abort());

const p = await ctx.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 150)));
await p.addInitScript(() => localStorage.setItem('hakr_token', 'stub-token'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2200);

/* Porch → expand the Listen to Music card → its Icon combobox */
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')]
    .find(x => /Porch/i.test(x.textContent || ''))?.click(); });
await p.waitForTimeout(800);
await p.evaluate(() => {
  const hdr = [...document.querySelectorAll('button,div')].filter(x =>
    (x.textContent || '').includes('Listen to Music') && x.children.length < 6)
    .sort((a, b) => a.textContent.length - b.textContent.length)[0];
  hdr?.click(); });
await p.waitForTimeout(600);
const box = p.locator('input[placeholder*="icon"]').first();
await box.scrollIntoViewIfNeeded();

/* ---- first-key unified search ---- */
await box.click();
await box.fill('door');
await p.waitForTimeout(3600);   /* past the hanging pack's 2.5s listing deadline */
const rows1 = await p.evaluate(() =>
  [...document.querySelectorAll('.fixed.z-50 button')].map(x =>
    (x.textContent || '').trim()));
ck('material rows answer the bare query',
  rows1.some(t => /door_open\s*door_open|^door_open/.test(t) || t.includes('door_open')));
ck('server sets answer the SAME query (mdi)', rows1.some(t => t.includes('mdi:door-open')));
ck('server sets answer the SAME query (phu)', rows1.some(t => t.includes('phu:door_open')));
ck('a module-only custom set answers too (the bridge)',
  rows1.some(t => t.includes('fa6-solid:door-open')));
ck('overlapping server+bridge rows dedupe to ONE (each_key_duplicate guard)',
  await p.evaluate(() =>
    [...document.querySelectorAll('.fixed.z-50 button')].filter(x =>
      (x.textContent || '').includes('fa6-solid:door-open')).length === 1));
ck('the surviving row is the server one, real path data', await p.evaluate(() =>
  [...document.querySelectorAll('.fixed.z-50 button')].some(x =>
    (x.textContent || '').includes('fa6-solid:door-open') &&
    x.querySelector('svg path')?.getAttribute('d') === 'M9 9h9z')));


/* ---- the save-back contract: an icon the server ALREADY answered
   is never re-posted (the search seeded the cache); a BRIDGE-ONLY
   icon resolves through the pack and is handed back ---- */
await p.waitForTimeout(1600);   /* past the save debounce */
ck('a server-known icon is not re-banked',
  !saved.some(b2 => b2 && b2['fa6-solid:door-open']));
await box.fill('user');         /* fa6-solid:user exists only in the pack */
await p.waitForTimeout(1200);
ck('a bridge-only icon shows from its pack', await p.evaluate(() =>
  [...document.querySelectorAll('.fixed.z-50 button')].some(x =>
    (x.textContent || '').includes('fa6-solid:user') &&
    x.querySelector('svg path')?.getAttribute('d') === 'M7 7h7z')));
await p.waitForTimeout(1600);   /* the save queue debounce is 1200ms */
ck('resolved custom icons POST back to the server',
  saved.some(b2 => b2 && b2['fa6-solid:user'] &&
    b2['fa6-solid:user'].path === 'M7 7h7z'));
await box.fill('door');
await p.waitForTimeout(900);

/* ---- picking a row writes set:name + the preview chip shows ---- */
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('.fixed.z-50 button')]
    .find(x => (x.textContent || '').includes('mdi:door-open'));
  btn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
await p.waitForTimeout(600);
ck('picking writes "<set>:<name>"', await box.inputValue() === 'mdi:door-open');
ck('the preview chip renders the picked path', await p.evaluate(() =>
  [...document.querySelectorAll('span[title="mdi:door-open"] svg path')]
    .some(el => el.getAttribute('d') === 'M4 4h4z')));

/* ---- "set:frag" narrows to that one set ---- */
await box.fill('phu:do');
await p.waitForTimeout(700);
const rows2 = await p.evaluate(() =>
  [...document.querySelectorAll('.fixed.z-50 button')].map(x =>
    (x.textContent || '').trim()));
ck('set prefix narrows: phu rows only',
  rows2.some(t => t.includes('phu:door_open')) &&
  !rows2.some(t => t.includes('mdi:')) &&
  !rows2.some(t => t.includes('fa6-solid:')));

/* a set the server can't answer falls through to the custom pack */
await box.fill('fa6-solid:us');
await p.waitForTimeout(900);
const rows3 = await p.evaluate(() =>
  [...document.querySelectorAll('.fixed.z-50 button')].map(x =>
    (x.textContent || '').trim()));
ck('no_source set narrows via its own registered resolver',
  rows3.some(t => t.includes('fa6-solid:user')));

ck('a hanging pack cannot hold the spinner (deadlines cleared it)',
  await p.evaluate(() =>
    ![...document.querySelectorAll('.fixed.z-50 div')].some(x =>
      (x.textContent || '').includes('searching the installed sets'))));
ck('the bridge ran because a set was declared', resourceFetches > 0);

/* ---- THE GATE: no declared sets = the bridge is inert ---- */
const before = resourceFetches;
const cfg2 = JSON.parse(JSON.stringify(cfg));
delete cfg2.global.icon_sets;
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'POST'
  ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: cfg2 }));
const p2 = await ctx.newPage();
p2.on('pageerror', e => errs.push('p2 pageerror: ' + String(e.message).slice(0, 150)));
await p2.addInitScript(() => localStorage.setItem('hakr_token', 'stub-token'));
await p2.goto('http://localhost:8482/harmonium-static/studio.html');
await p2.waitForTimeout(2200);
await p2.evaluate(() => {
  [...document.querySelectorAll('#nav .item')]
    .find(x => /Porch/i.test(x.textContent || ''))?.click(); });
await p2.waitForTimeout(800);
await p2.evaluate(() => {
  const hdr = [...document.querySelectorAll('button,div')].filter(x =>
    (x.textContent || '').includes('Listen to Music') && x.children.length < 6)
    .sort((a, b) => a.textContent.length - b.textContent.length)[0];
  hdr?.click(); });
await p2.waitForTimeout(600);
const box2 = p2.locator('input[placeholder*="icon"]').first();
await box2.scrollIntoViewIfNeeded();
await box2.click();
await box2.fill('door');
await p2.waitForTimeout(900);
const rows4 = await p2.evaluate(() =>
  [...document.querySelectorAll('.fixed.z-50 button')].map(x =>
    (x.textContent || '').trim()));
ck('undeclared: server sets still answer', rows4.some(t => t.includes('mdi:door-open')));
ck('undeclared: server-live fa6 rows show too (no declaration needed)',
  rows4.filter(t => t.includes('fa6-solid:door-open')).length === 1);
ck('undeclared: the bridge never ran (no resources fetch, nothing imported)',
  resourceFetches === before);

/* ---- DISCOVERY (Theme → Find installed packs — "read available
   iconsets and offer them in an Add dropdown"): an explicit click
   runs the bridge once and offers the registered prefixes ---- */
await p2.evaluate(() => {
  [...document.querySelectorAll('#nav .item')]
    .find(x => /Theme/i.test(x.textContent || ''))?.click(); });
await p2.waitForTimeout(800);
await p2.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => (x.textContent || '').includes('Find installed packs'))?.click(); });
await p2.waitForTimeout(3600);        /* hangy's listing deadline is 2.5s */
const offers = await p2.evaluate(() =>
  [...document.querySelectorAll('button')].map(x => (x.textContent || '').trim())
    .filter(t => t.startsWith('＋')));
ck('discovery offers the registered custom packs', offers.includes('＋ fa6-solid'));
ck('discovery ran the bridge exactly on the click', resourceFetches === before + 1);
await p2.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => (x.textContent || '').trim() === '＋ fa6-solid')?.click(); });
await p2.waitForTimeout(300);
const chipped = await p2.evaluate(() => {
  const t = [...document.querySelectorAll('span')].map(x => (x.textContent || '').trim());
  const stillOffered = [...document.querySelectorAll('button')].some(x =>
    (x.textContent || '').trim() === '＋ fa6-solid');
  return { chip: t.some(x => x.startsWith('fa6-solid')), stillOffered };
});
ck('＋ adds the prefix as a chip', chipped.chip);
ck('an added prefix leaves the offer list', !chipped.stillOffered);
ck('a server-live set is never offered for declaration', await p2.evaluate(() =>
  ![...document.querySelectorAll('button')].some(x =>
    (x.textContent || '').trim() === '＋ hangy')));
ck('the live line names the server-side sets', await p2.evaluate(() =>
  (document.body.textContent || '').includes('already live via') &&
  (document.body.textContent || '').includes('hangy')));

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
