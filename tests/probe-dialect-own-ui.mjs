/* DIALECT OWNERSHIP, Studio side (v0.85.7 — Suresh: "stock dialects;
   if edited that becomes a user dialect. They can revert to stock at
   any time or at least look at it and copy paste what they need").
   In the Apps editor, a stock dialect fold must state its bucket:
     pristine → "Stock — untouched … updates keep it current";
     edited   → "Yours — … updates won't touch it" + View stock
                (read-only JSON to copy from) + ↺ Reset to stock,
                and reset flips it back to the pristine banner. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));

/* edit googletv (delete one app) so it classifies as the user's;
   leave firetv pristine */
if (config.dialects && config.dialects.googletv) {
  const apps = config.dialects.googletv.apps || {};
  delete apps[Object.keys(apps)[0]];
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1500 } });
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

/* open Building Blocks → Apps */
await p.evaluate(() => {
  const el = [...document.querySelectorAll('#nav .item, #nav button, #nav [role="button"]')]
    .find(x => x.textContent.includes('Apps') && x.textContent.includes('dialect'));
  el?.click();
});
await p.waitForTimeout(700);

/* expand the googletv (edited) and firetv (pristine) folds */
await p.evaluate(() => {
  for (const name of ['Google TV', 'Fire TV'])
    [...document.querySelectorAll('button, [role="button"]')]
      .find(x => x.textContent.includes(name + ' — device class'))?.click();
});
await p.waitForTimeout(600);

const state = await p.evaluate(() => {
  const body = document.body.textContent;
  return {
    pristineBanner: body.includes('untouched, so updates keep it'),
    editedBanner: body.includes('differs from the\n                shipped one') ||
      body.includes('differs from the shipped one') ||
      /Yours[\s\S]{0,80}won't touch it/.test(body),
    viewStockBtn: [...document.querySelectorAll('button')].some(x => x.textContent.trim() === 'View stock'),
    resetBtn: [...document.querySelectorAll('button')].some(x => x.textContent.includes('Reset to stock')),
  };
});
if (!state.pristineBanner) errs.push('pristine dialect missing its "stock — updates keep it current" banner');
if (!state.editedBanner) errs.push('edited dialect missing its "yours" banner');
if (!state.viewStockBtn) errs.push('edited dialect missing View stock');
if (!state.resetBtn) errs.push('edited dialect missing Reset to stock');

/* View stock shows the shipped JSON read-only */
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'View stock')?.click();
});
await p.waitForTimeout(400);
const view = await p.evaluate(() => {
  const ta = [...document.querySelectorAll('textarea[readonly]')]
    .find(t => t.value.includes('"apps"'));
  return { shown: !!ta, hasApps: !!ta && ta.value.includes('"apps"') };
});
if (!view.shown) errs.push('View stock did not reveal the shipped JSON');

/* Reset flips the fold back to pristine */
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('Reset to stock'))?.click();
});
await p.waitForTimeout(500);
const after = await p.evaluate(() => ({
  backToPristine: (document.body.textContent.match(/untouched, so updates keep it/g) || []).length >= 2,
  bannerGone: ![...document.querySelectorAll('button')].some(x => x.textContent.includes('Reset to stock')),
}));
if (!after.backToPristine) errs.push('reset did not return the dialect to the pristine banner');
if (!after.bannerGone) errs.push('reset left the edited controls behind');

console.log(JSON.stringify({ state, view, after, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
