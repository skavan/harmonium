/* THE BACK-KEY MOAT (v0.85.7 — Suresh: "On the Astrion, long press
   back seems to reload the page (I think)"). A long-press that falls
   through the shell's mapping reaches the webview as NATIVE Back —
   history pops and the page unloads. The moat: one sentinel history
   entry armed at boot; popstate re-arms and runs the panel's own
   Back. Fences:
     1. native history.back() does NOT unload (an in-page flag
        survives);
     2. it behaves as panel Back — returns from a child page;
     3. repeated backs stay trapped (no unload on the second). */
import { chromium } from 'playwright-core';
const CONFIG = {
  version: 2, home_screen: 'p', screen_order: ['p'],
  global: { room: 'X' },
  remotes: { default: { capabilities: ['touch', 'pointer'] } },
  screens: {
    p: { name: 'P', tiles: [{ id: 'n1', type: 'nav', target: 'p2', label: 'Go' }] },
    p2: { name: 'Two', parent: 'p', tiles: [{ id: 'n2', type: 'nav', target: 'p', label: 'Back' }] },
  },
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
await p.waitForTimeout(900);
await p.evaluate(() => { window.__alive = 'yes'; });

/* walk into the child page via the nav tile */
await p.keyboard.press('ArrowDown');
await p.keyboard.press('Enter');
await p.waitForTimeout(400);
const onChild = await p.evaluate(() => S.screen);

/* 1+2. native back: no unload, panel Back runs */
await p.evaluate(() => history.back());
await p.waitForTimeout(500);
const r1 = await p.evaluate(() => ({ alive: window.__alive, scr: S.screen }));

/* 3. back again at the root — still trapped, still alive */
await p.evaluate(() => history.back());
await p.waitForTimeout(500);
const r2 = await p.evaluate(() => ({ alive: window.__alive, scr: S.screen }));

const ck = (n, c) => { if (!c) errs.push(n); };

/* 4. NO HISTORY → UP ONE LEVEL (v0.85.7): deep-link straight onto a
   child page, press Back — no history exists, so Back climbs to the
   parent instead of doing nothing. */
const b4 = await b.newContext({ viewport: { width: 350, height: 582 } });
{
  const p4 = await b4.newPage();
  await b4.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
  await p4.addInitScript(() => {
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
  await p4.goto('http://localhost:8482/index.html#page=p2');
  await p4.waitForTimeout(900);
  const on2 = await p4.evaluate(() => S.screen);
  await p4.keyboard.press('Escape');
  await p4.waitForTimeout(400);
  const after = await p4.evaluate(() => S.screen);
  ck('deep link landed on the child (' + on2 + ')', on2 === 'p2');
  ck('Back with no history climbs to the parent (' + after + ')', after === 'p');
  await p4.keyboard.press('Escape');
  await p4.waitForTimeout(300);
  ck('Back at the boot view with no history stays put',
    await p4.evaluate(() => S.screen) === 'p');
  await b4.close();
}
ck('reached the child page (' + onChild + ')', onChild === 'p2');
ck('native back did not unload the page', r1.alive === 'yes');
ck('native back behaved as panel Back (' + r1.scr + ')', r1.scr === 'p');
ck('second native back stays trapped, no unload', r2.alive === 'yes' && r2.scr === 'p');
console.log(JSON.stringify({ onChild, r1, r2, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
