/* STOCK LOCK, Studio side (v0.84.5). Opening a NAMED stock controller
   in the editor must be look-don't-touch: the body is inert, the banner
   says it's locked, and the only door forward is ⧉ Duplicate to edit —
   which forks a variant_of copy that IS editable (no inert, "Custom
   copy" banner). Domain stocks and custom copies are unaffected (proved
   elsewhere; here we only drive the named-stock path). */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
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

/* select the stock TV Media Player controller from the nav tree */
const picked = await p.evaluate(() => {
  const el = [...document.querySelectorAll('#nav .item, #nav button, #nav [role="button"]')]
    .find(x => x.textContent.includes('TV Media Player'));
  if (el) { el.click(); return true; }
  return false;
});
await p.waitForTimeout(600);

const lockedState = await p.evaluate(() => {
  const body = document.body.textContent;
  return {
    picked: body.includes('TV Media Player'),
    lockBanner: body.includes('Stock controller — locked'),
    hasDupBtn: [...document.querySelectorAll('button')].some(x => x.textContent.includes('Duplicate to edit')),
    inertPresent: !!document.querySelector('[inert]'),
  };
});

/* fork it — the only door forward */
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('Duplicate to edit'))?.click();
});
await p.waitForTimeout(700);

const forkState = await p.evaluate(() => {
  const body = document.body.textContent;
  return {
    customBanner: body.includes('Custom copy'),
    stillLocked: body.includes('Stock controller — locked'),
    inertGone: !document.querySelector('[inert]'),
    hasResetBtn: [...document.querySelectorAll('button')].some(x => x.textContent.includes('Reset to stock')),
  };
});

/* DOMAIN STOCK (1b): a domain stock is locked too, but its fork door is
   the per-device entity picker — and its Per-device options (entity_
   options) stay live BELOW the lock. */
/* domain stocks are collapsed behind a "+ N stock device pages"
   expander — open it first, then pick Climate. */
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item, #nav button, #nav [role="button"]')]
    .find(x => /stock device pages/i.test(x.textContent))?.click();
});
await p.waitForTimeout(400);
await p.evaluate(() => {
  const el = [...document.querySelectorAll('#nav .item, #nav button, #nav [role="button"]')]
    .find(x => x.textContent.includes('Climate'));
  el?.click();
});
await p.waitForTimeout(600);
const domainState = await p.evaluate(() => {
  const body = document.body.textContent;
  return {
    lockBanner: body.includes('Climate — locked'),
    inertPresent: !!document.querySelector('[inert]'),
    hasDeviceCopyBtn: [...document.querySelectorAll('button')].some(x => x.textContent.includes('Custom copy for device')),
    perDeviceLive: body.includes('Per-device options'),
  };
});

if (!picked || !lockedState.picked) errs.push('could not select the stock TV controller');
if (!lockedState.lockBanner) errs.push('stock editor missing the locked banner');
if (!lockedState.hasDupBtn) errs.push('stock editor missing the Duplicate-to-edit CTA');
if (!lockedState.inertPresent) errs.push('stock editor body is NOT inert (editable stock — the hole)');
if (!forkState.customBanner) errs.push('after fork: not shown as a Custom copy (variant_of not set)');
if (forkState.stillLocked) errs.push('after fork: still showing the locked banner');
if (!forkState.inertGone) errs.push('after fork: body still inert (the copy should be editable)');
if (!forkState.hasResetBtn) errs.push('after fork: no Reset-to-stock (variant machinery not wired)');
if (!domainState.lockBanner) errs.push('domain stock missing the locked banner');
if (!domainState.inertPresent) errs.push('domain stock body is NOT inert (editable domain stock)');
if (!domainState.hasDeviceCopyBtn) errs.push('domain stock missing the per-device copy fork door');
if (!domainState.perDeviceLive) errs.push('domain per-device options not present (should stay live below the lock)');

console.log(JSON.stringify({ lockedState, forkState, domainState, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
