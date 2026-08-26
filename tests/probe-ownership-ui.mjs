/* OWNERSHIP, Studio side (v0.85.7). A LEGITIMIZED fork — a stock
   controller the referee found edited-in-place and preserved as the
   user's copy (variant_of self-stamp + forked_by_update) — must:
     1. open EDITABLE (no inert body, no stock lock banner);
     2. show the "Your edited copy, preserved." banner that explains
        what the update did;
     3. offer ↺ Reset to built-in, and the reset must return the
        CURRENT stock shape with the lock restored.
   The fixture is the live config with its music controller mutated
   into exactly what refereeController produces. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));

/* forge the legitimized state: edited label, self-variant, note */
const music = config.controllers.music;
delete music.gen;
music.variant_of = 'music';
music.forked_by_update = { from_gen: 5, stock_gen: 8 };
const firstTile = (music.tiles && music.tiles[0]) ||
  (music.sections && music.sections[0].tiles[0]);
if (firstTile) firstTile.label = 'MY EDITED LABEL';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1400 } });
const errs = [];
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
  ? r.fulfill({ json: config }) : r.fulfill({ json: { ok: true } }));
await ctx.route('**/api/harmonium/workspaces', r =>
  r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'x', path: '/x/' } } } }));
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: 'x' } }));
await ctx.route('**/api/states', r => r.fulfill({ json: [] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2000);

/* NOTE: the Studio heals on load — but a legitimized fork carries
   variant_of, so the referee must SKIP it (that's assertion zero). */
const picked = await p.evaluate(() => {
  const el = [...document.querySelectorAll('#nav .item, #nav button, #nav [role="button"]')]
    .find(x => /music/i.test(x.textContent) && !/library/i.test(x.textContent));
  if (el) { el.click(); return el.textContent.trim().slice(0, 40); }
  return null;
});
await p.waitForTimeout(700);

const state = await p.evaluate(() => {
  const body = document.body.textContent;
  return {
    preservedBanner: body.includes('Your edited copy, preserved'),
    noStockLock: !body.includes('Stock controller — locked'),
    editable: !document.querySelector('[inert]'),
    resetBtn: [...document.querySelectorAll('button')]
      .some(x => x.textContent.includes('Reset to built-in')),
  };
});
if (!picked) errs.push('could not select the music controller in the nav');
if (!state.preservedBanner) errs.push('missing the "Your edited copy, preserved" banner');
if (!state.noStockLock) errs.push('legitimized fork still shows the stock lock');
if (!state.editable) errs.push('legitimized fork rendered inert — the user cannot edit their own copy');
if (!state.resetBtn) errs.push('missing the Reset to built-in button');

/* press reset → current stock, lock restored */
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => x.textContent.includes('Reset to built-in'))?.click();
});
await p.waitForTimeout(700);
const after = await p.evaluate(() => {
  const body = document.body.textContent;
  return {
    lockBack: body.includes('Stock controller — locked'),
    bannerGone: !body.includes('Your edited copy, preserved'),
  };
});
if (!after.lockBack) errs.push('reset did not restore the stock lock');
if (!after.bannerGone) errs.push('reset left the preserved banner behind');

console.log(JSON.stringify({ picked, state, after, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
