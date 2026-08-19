/* HERO CHIP JUMP probe (v0.83.11 — Suresh: "If I Click presets the
   entire remote scrolls down, presets is not selected (devices is)").
   Two fixes under test, on the real CT fixture's Porch page:
   1. TAP PINS ITS CHIP — a short page can't bring PRESETS to the
      top, the jump bottoms the grid out, and the spy's bottom rule
      lit DEVICES. Now the tapped chip stays active while the scroll
      stays where the tap left it; a real scroll releases the pin and
      the spy (bottom rule included) takes over.
   2. NO ANCESTOR SCROLLING — heroGo/setFocus now scroll #grid by
      hand (gridScrollTo) instead of scrollIntoView, which propagated
      to every scrollable ancestor (across the preview iframe: the
      whole Studio pane slid). The page's own body must not move. */
import { chromium } from 'playwright-core';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
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
await p.waitForTimeout(1200);

const state = () => p.evaluate(() => ({
  chips: [...document.querySelectorAll('#banner .hjump')]
    .map(el => ({ label: el.textContent, active: el.classList.contains('active') })),
  gridTop: Math.round(grid.scrollTop),
  bodyTop: Math.round(document.documentElement.scrollTop + document.body.scrollTop),
  winY: Math.round(window.scrollY),
  focused: document.querySelector('.tile.focused')?.id || null,
}));
const clickChip = (re) => p.evaluate((re) => {
  [...document.querySelectorAll('#banner .hjump')]
    .find(el => new RegExp(re, 'i').test(el.textContent))?.click();
}, re);
const activeOf = (s) => s.chips.find(c => c.active)?.label || null;

const r = {};
r.boot = await state();                       /* chips exist, nothing scrolled */

await clickChip('presets'); await p.waitForTimeout(250);
const s1 = await state();
r.tapPresets = { active: activeOf(s1), gridTop: s1.gridTop,
  bodyStill: s1.bodyTop === 0 && s1.winY === 0, focused: s1.focused };

/* pin survives spy re-runs at rest */
await p.waitForTimeout(400);
r.pinHolds = activeOf(await state());

/* a REAL scroll releases the pin (the tap had already bottomed the
   short page out, so "scroll further down" is a no-move — scroll UP
   instead), then the bottom rule honestly owns a bottomed-out grid */
await p.evaluate(() => { grid.scrollTop = 0;
  grid.dispatchEvent(new Event('scroll')); });
await p.waitForTimeout(150);
r.scrollAway = activeOf(await state());       /* pin released → top chip */
await p.evaluate(() => { grid.scrollTop = grid.scrollHeight;
  grid.dispatchEvent(new Event('scroll')); });
await p.waitForTimeout(150);
r.bottomRule = activeOf(await state());       /* want the LAST chip */

await clickChip('activities'); await p.waitForTimeout(250);
const s2 = await state();
r.tapActivities = { active: activeOf(s2), gridTop: s2.gridTop };

const chipLabels = r.boot.chips.map(c => c.label.toLowerCase());
console.log(JSON.stringify({ ...r,
  ok: r.boot.chips.length >= 3 && r.boot.gridTop === 0 &&
      /presets/i.test(r.tapPresets.active || '') && r.tapPresets.gridTop > 0 &&
      r.tapPresets.bodyStill && !!r.tapPresets.focused &&
      /presets/i.test(r.pinHolds || '') &&
      /activities/i.test(r.scrollAway || '') &&
      (r.bottomRule || '').toLowerCase() === chipLabels[chipLabels.length - 1] &&
      /activities/i.test(r.tapActivities.active || '') && r.tapActivities.gridTop < 20 &&
      errs.length === 0,
  errs }, null, 1));
await b.close();
