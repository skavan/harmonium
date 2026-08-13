import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
/* VIRGIN INSTALL probe (v0.83.9 — the .88 fresh-HACS-install test):
   API alive but store EMPTY (config GET 404), /local/config.json 404,
   workspaces roster empty. The Studio must NOT dead-end on a red
   "no config found" — it mints the starter, says so, and the first
   Save & Deploy posts a config that passes the integration's real
   _validate (the planted stock drawers' dangling parents were 422ing). */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const engine = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
const r = {}; const errs = []; let postedConfig = null;

await ctx.route('**/api/harmonium/config*', route => {
  if (route.request().method() === 'POST') {
    postedConfig = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true, workspace: 'main', deployed: 'stub' } });
  }
  return route.fulfill({ status: 404, json: { message: "no config stored for workspace 'main'" } });
});
await ctx.route('**/api/harmonium/workspaces', route =>
  route.fulfill({ json: { order: [], workspaces: {} } }));
await ctx.route('**/api/harmonium/pair_admin*', route =>
  route.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', route =>
  route.fulfill({ json: { version: '0.83.3' } }));
await ctx.route('**/api/states', route => route.fulfill({ json: [] }));
await ctx.route('**/api/services', route => route.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/config.json*', route =>
  route.fulfill({ status: 404, body: 'not found' }));
await ctx.route('**/local/harmonium/index.html*', route =>
  route.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', route =>
  route.fulfill({ body: studio, contentType: 'text/html' }));

const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('hakr_token', 'stub-token'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2000);

// 1. booted into the starter, not the dead red banner
r.boot = await p.evaluate(() => ({
  status: document.getElementById('status').textContent,
  statusErr: document.getElementById('status').classList.contains('err'),
  navItems: document.querySelectorAll('#nav .item').length,
  mapLanded: !!document.querySelector('[data-map]'),
  stamp: (document.body.textContent.match(/s0\.\d+\.\d+/) || [''])[0],
}));

// 2. preview iframe got the starter (real engine, one home hub)
const fr = p.frames().find(f => f.url().includes('/local/harmonium'));
r.preview = fr ? await fr.evaluate(() => ({
  screen: S.screen,
  tiles: document.querySelectorAll('#grid .tile').length,
  body: document.body.textContent.slice(0, 80),
})).catch(e => ({ err: e.message })) : { err: 'no engine frame' };

// 3. first Save & Deploy: click, capture the POST
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(b => b.textContent.trim() === 'Save & Deploy')?.click();
});
await p.waitForTimeout(800);
r.save = {
  posted: !!postedConfig,
  screens: postedConfig ? Object.keys(postedConfig.screens || {}) : null,
  controllers: postedConfig ? Object.keys(postedConfig.controllers || {}) : null,
  danglingParents: postedConfig ? Object.entries(postedConfig.controllers || {})
    .filter(([, c]) => c.parent).map(([k, c]) => k + '→' + c.parent) : null,
  status: await p.evaluate(() => document.getElementById('status').textContent),
};
if (postedConfig) writeFileSync('/tmp/virgin-posted.json', JSON.stringify(postedConfig));

console.log(JSON.stringify(r, null, 2));
console.log('errs', JSON.stringify(errs));
await b.close();
