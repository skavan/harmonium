/* CH SECTION JUMPS + MENU DOCTRINE + THE BREATHING PAD (v0.85.7 —
   Suresh's polish round:
     "On a Page like Porch. ChUp and ChDn should jump sections. Since
      we have them. The menu button should do nothing, unless the
      active tile has a subpage, in which case it should fire that
      page. … the first tile is pressed against the hero tile instead
      of showing its normal little padding."
   Fences:
     1. short CH▼ on a sectioned page JUMPS to the next section
        (titled sections count, not only hero_label ones) and focuses
        its first tile;
     2. the jump leaves air above the anchor (~10px), including when
        jumping back UP to the first section after scrolling;
     3. title-only sections get NO banner chip (hero_label keeps its);
     4. MENU on a focused nav tile opens its target page;
     5. MENU with nothing focused does nothing (no tour). */
import { chromium } from 'playwright-core';
const tile = (i) => ({ id: 't' + i, type: 'nav', target: 'p2', label: 'T' + i });
const CONFIG = {
  version: 2, home_screen: 'p', screen_order: ['p'],
  global: { room: 'X' },
  remotes: { default: { capabilities: ['touch', 'pointer'] } },
  screens: {
    p: { name: 'P', class: 'group',
      banner: { image: '', height: '160px', show_time: true },
      sections: [
        { hero_label: 'Activities', tiles: [tile(1), tile(2)] },
        { title: 'Devices', tiles: [tile(3), tile(4), tile(5), tile(6)] },
        { title: 'Extras', tiles: [tile(7), tile(8), tile(9), tile(10)] },
      ] },
    p2: { name: 'Two', class: 'group', tiles: [{ id: 'z', type: 'nav', target: 'p', label: 'Back' }] },
  },
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 350, height: 500 } });
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
const ck = (n, c) => { if (!c) errs.push(n); };

/* 3. chips: hero_label yes, titled no */
const chips = await p.evaluate(() =>
  [...document.querySelectorAll('.hjump')].map(x => x.textContent));
ck('hero_label section keeps its chip', chips.includes('Activities'));
ck('title-only sections get no chip (' + JSON.stringify(chips) + ')',
  !chips.includes('Devices') && !chips.includes('Extras'));

/* 1. short CH▼ jumps to "Devices" and focuses its first tile */
await p.keyboard.press('PageDown');
await p.waitForTimeout(250);
const j1 = await p.evaluate(() => ({ focus: S.focusId,
  flash: document.getElementById('screenName').textContent }));
ck('CH▼ jumped to the Devices section (focus t3, got ' + j1.focus + ')', j1.focus === 't3');

/* 2. air above the anchor after the jump */
const gap1 = await p.evaluate(() => {
  const g = document.getElementById('grid').getBoundingClientRect();
  const heads = [...document.querySelectorAll('.shead')];
  const dv = heads.find(x => x.textContent === 'Devices');
  return Math.round(dv.getBoundingClientRect().top - g.top);
});
ck('the jump leaves air above the section head (' + gap1 + 'px)', gap1 >= 6 && gap1 <= 24);

/* jump on to Extras, then back UP twice to the first section */
await p.keyboard.press('PageDown');
await p.waitForTimeout(250);
await p.keyboard.press('PageUp');
await p.waitForTimeout(250);
await p.keyboard.press('PageUp');
await p.waitForTimeout(250);
const top = await p.evaluate(() => ({ focus: S.focusId,
  scrollTop: document.getElementById('grid').scrollTop }));
ck('CH▲ walked back to the first section (focus t1, got ' + top.focus + ')', top.focus === 't1');
ck('top of page reachable again (scrollTop ' + top.scrollTop + ')', top.scrollTop <= 12);

/* 4. MENU on a focused nav tile opens its page */
await p.keyboard.press('#');
await p.waitForTimeout(400);
const after = await p.evaluate(() => S.screen);
ck('MENU opened the focused nav tile\'s page (' + after + ')', after === 'p2');

/* 5. MENU with no focus = deliberate no-op (no tour, no move) */
await p.keyboard.press('Escape');            /* back to p */
await p.waitForTimeout(300);
await p.evaluate(() => setFocus(null));
await p.keyboard.press('#');
await p.waitForTimeout(300);
const idle = await p.evaluate(() => ({ scr: S.screen, focus: S.focusId }));
ck('MENU with nothing focused stays put (' + idle.scr + ')', idle.scr === 'p' && !idle.focus);

console.log(JSON.stringify({ chips, j1, gap1, top, after, idle, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
