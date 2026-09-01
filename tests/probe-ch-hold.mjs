/* CH KEY CONTRACT probe (2026-08-19 redesign — Suresh: "ChUp, ChDn,
   navigate the LCD. Always. Hold+ChUp, Hold+ChDn on music controller
   does RWD/FWD", after one field day with the first hold-CH shape).
   REFRESHED for v0.85.7 in the 0.87 final review (Suresh: "On a
   Page like Porch, ChUp and ChDn should jump sections. Since we
   have them." — this probe's walk-first expectations predated that
   ruling and had gone quietly stale). Under test:
   · SHORT CH (PageUp/PageDown) unbound = the SECTION JUMP where the
     page has jump stops, falling back to the focus walk at the
     ends (and on pages without sections);
   · HOLD CH (' and /, KeyMapper long-press keys) unbound = the same
     big jumps;
   · bindings win BOTH, via the ladder;
   · the D-pad fence: ▲ from the first tile row must NOT land on the
     hero tab row (chips are touch/hold targets, not D-pad stops). */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'home', screen_order: ['home', 'two'],
  global: { room: 'X', activity_select: 'select.x' },
  activities: {},
  screens: {
    home: { name: 'Home', type: 'hub', grid: { columns: 1 },
      banner: { title: 'Home', height: '120px' },
      sections: [
        { title: 'Alpha', hero_label: 'Alpha', tiles: [
          { id: 't1', type: 'preset', label: 'One', action: {} },
          { id: 't2', type: 'preset', label: 'Two', action: {} },
        ] },
        { title: 'Beta', hero_label: 'Beta', tiles: [
          { id: 't3', type: 'preset', label: 'Three', action: {} },
          { id: 't4', type: 'preset', label: 'Four', action: {} },
        ] },
      ] },
    two: { name: 'Two', type: 'hub', grid: { columns: 1 },
      buttons: { ch_down: { navigate: 'two' },
                 ch_down_hold: { navigate: 'home' } },
      sections: [{ title: 'Row', tiles: [
        { id: 'u1', type: 'preset', label: 'Uno', action: {} },
      ] }] },
  },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
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
        reply({ type: 'event', id: msg.id, event: { a: {} } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);

const focus = () => p.evaluate(() => S.focusId);
const screen = () => p.evaluate(() => S.screen);
const heroAt = () => p.evaluate(() =>
  [...document.querySelectorAll('#banner .hjump')].findIndex(el =>
    el.classList.contains('active')));

const r = {};
r.boot = { screen: await screen(), focus: await focus() };   /* home, t1 */

/* SHORT CH = the section jump (v0.85.7), then the walk at the end */
await p.keyboard.press('PageDown'); await p.waitForTimeout(120);
r.shortDown = await focus();                    /* t3 — jump to Beta */
await p.keyboard.press('PageDown'); await p.waitForTimeout(120);
r.shortDown2 = await focus();                   /* t4 — last section: the walk */
await p.keyboard.press('PageUp'); await p.waitForTimeout(120);
r.shortUp = await focus();                      /* t1 — jump back to Alpha */

/* the D-pad fence: from the FIRST tile, ▲ must not enter the chips */
await p.keyboard.press('PageUp'); await p.waitForTimeout(120); /* back to t1 */
await p.keyboard.press('ArrowUp'); await p.waitForTimeout(120);
r.fenceDpad = await focus();                                  /* still t1, not hero_* */
await p.keyboard.press('PageUp'); await p.waitForTimeout(120);
r.fenceCh = await focus();                                    /* still t1 */

/* HOLD CH = section jumps; ' = previous (up), / = next (down) */
await p.keyboard.press('/'); await p.waitForTimeout(250);
r.holdNext = await p.evaluate(() => S.heroAt);                /* 1 (Beta) */
await p.keyboard.press("'"); await p.waitForTimeout(250);
r.holdPrev = await p.evaluate(() => S.heroAt);                /* 0 (Alpha) */

/* bindings win BOTH ways on screen `two` */
await p.evaluate(() => navigate('two')); await p.waitForTimeout(200);
await p.evaluate(() => { window._nav = []; const o = navigate;
  window.navigate = (s, b2) => { window._nav.push(s); return o(s, b2); }; });
await p.keyboard.press('PageDown'); await p.waitForTimeout(200);
r.shortBinding = await p.evaluate(() => window._nav);         /* ['two'] */
await p.keyboard.press('/'); await p.waitForTimeout(200);
r.holdBinding = await screen();                               /* home */

r.map = await p.evaluate(() => ({ up: KEYMAP["'"], down: KEYMAP['/'] }));

console.log(JSON.stringify({ ...r,
  ok: r.boot.focus === 't1' &&
      r.shortDown === 't3' && r.shortDown2 === 't4' && r.shortUp === 't1' &&
      r.fenceDpad === 't1' && r.fenceCh === 't1' &&
      r.holdNext === 1 && r.holdPrev === 0 &&
      JSON.stringify(r.shortBinding) === '["two"]' &&
      r.holdBinding === 'home' &&
      r.map.up === 'ch_up_hold' && r.map.down === 'ch_down_hold' &&
      errs.length === 0,
  errs }, null, 1));
await b.close();
