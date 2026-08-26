/* DEEP LINK (v0.85.7 — forum: "Is there a way to open subpages by
   URL? I have a main page that links to the different rooms").
   #page=<page id> navigates there after load, this load only:
     1. a valid id lands on that page;
     2. an unknown id lands on home with a notice, no crash;
     3. nothing is pinned — a plain reload (no hash) is home again;
     4. the param survives the canonical-address rewrite (bookmarks). */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'hub', screen_order: ['hub', 'den', 'porch'],
  global: { room: 'House' },
  remotes: { default: { capabilities: ['touch', 'pointer'] } },
  screens: {
    hub:   { name: 'House',  tiles: [{ id: 'h1', type: 'nav', target: 'den', label: 'Den' }] },
    den:   { name: 'Den',    tiles: [{ id: 'd1', type: 'nav', target: 'hub', label: 'Back' }] },
    porch: { name: 'Porch',  tiles: [{ id: 'p1', type: 'nav', target: 'hub', label: 'Back' }] },
  },
};

async function open(hash) {
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
  await p.goto('http://localhost:8482/index.html' + hash);
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => ({
    title: document.getElementById('screenName')?.textContent || '',
    url: location.href,
    dev: S.deviceName,
  }));
  await b.close();
  return { ...r, errs };
}

const errs = [];
const ck = (name, cond) => { if (!cond) errs.push(name); };

const den = await open('#page=den');
ck('#page=den lands on Den (got: ' + den.title + ')', den.title.includes('Den'));
ck('deep link crash-free', den.errs.length === 0);
ck('hash survives the address rewrite (bookmarkable)',
  den.url.includes('page=den'));

const bogus = await open('#page=doesnotexist');
ck('unknown page falls back to home', bogus.title.includes('House'));
ck('unknown page crash-free', bogus.errs.length === 0);

const plain = await open('');
ck('no hash → home (nothing was pinned)', plain.title.includes('House'));

/* v0.85.7 round 3 (the Studio's second link line): #page combines
   with #device — the page opens AND the profile pins */
CONFIG.remotes.astrion = { capabilities: ['physical_dpad', 'physical_volume', 'touch'] };
const combo = await open('#page=porch&device=astrion');
ck('#page + #device: page opens (got: ' + combo.title + ')', combo.title.includes('Porch'));
ck('#page + #device: profile pinned (' + combo.dev + ')', combo.dev === 'astrion');
ck('combo crash-free', combo.errs.length === 0);

console.log(JSON.stringify({ den: den.title, bogus: bogus.title,
  url: den.url, ok: errs.length === 0, errs }, null, 1));
if (errs.length) process.exit(1);
