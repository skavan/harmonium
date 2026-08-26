/* THE HAUNTED PREVIEW (v0.85.7 — Suresh: "Ugh. Preview page is
   defaulting to debug"). hakr_debug is sticky per browser, and the
   Studio preview shares the desktop's origin — one #debug=1
   experiment haunted the preview forever. Fences:
     1. PREVIEW + stale hakr_debug=1 + config debug OFF → NO card;
     2. PREVIEW + config global.debug true → card shows (the Key
        debug switch still works for preview experiments);
     3. a normal (non-preview) load still honors sticky hakr_debug;
     4. re-init doesn't stack "debug on" banner lines. */
import { chromium } from 'playwright-core';
const mkCfg = (dbg) => ({
  version: 2, home_screen: 'p', screen_order: ['p'],
  global: { room: 'X', debug: dbg },
  remotes: { default: { capabilities: ['touch', 'pointer'] } },
  screens: { p: { name: 'P', tiles: [
    { id: 't1', type: 'nav', target: 'p', label: 'T' } ] } },
});
async function boot(preview, cfgDebug, staleLocal) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 350, height: 582 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 100)));
  await ctx.route('**/config.json*', r => r.fulfill({ json: mkCfg(cfgDebug) }));
  await p.addInitScript((stale) => {
    localStorage.setItem('hakr_token', 't');
    localStorage.setItem('hakr_host', 'localhost:8482');
    if (stale) localStorage.setItem('hakr_debug', '1');
    window.WebSocket = class {
      constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
      send(m) { const msg = JSON.parse(m);
        const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
        if (msg.type === 'auth') reply({ type: 'auth_ok' });
        else reply({ type: 'result', id: msg.id, success: true, result: null });
      }
      close() {}
    };
  }, staleLocal);
  await p.goto('http://localhost:8482/index.html' + (preview ? '#preview=1' : ''));
  await p.waitForTimeout(600);
  if (preview) {
    /* the Studio drives a preview via postMessage; push the config
       twice like two Studio edits would */
    for (let i = 0; i < 2; i++) {
      await p.evaluate((cfg) => window.postMessage(
        { type: 'harmonium_config', config: cfg }, '*'), mkCfg(cfgDebug));
      await p.waitForTimeout(300);
    }
  }
  const r = await p.evaluate(() => {
    const el = document.getElementById('dbg');
    return { hidden: el.classList.contains('hidden'),
      banners: (el.textContent.match(/debug on/g) || []).length };
  });
  await b.close();
  return { ...r, errs };
}
const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };
const a = await boot(true, false, true);
ck('PREVIEW ignores stale hakr_debug (card hidden)', a.hidden);
const b2 = await boot(true, true, false);
ck('PREVIEW honors the config Key debug switch', !b2.hidden);
ck('re-inits do not stack banner lines (' + b2.banners + ')', b2.banners <= 1);
const c = await boot(false, false, true);
ck('device load still honors sticky hakr_debug', !c.hidden);
console.log(JSON.stringify({ a, b2, c, ok: errs.length === 0, errs }, null, 1));
if (errs.length) process.exit(1);
