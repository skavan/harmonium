/* KEY-BINDINGS DROPDOWN + APPLY-TO-CHILDREN probe, Studio side
   (v0.83.11 — Suresh: "Page Settings>>>Keys doesn't offer those
   buttons" + "There should be an apply to children toggle").
   The binding-key select must offer every CUSTOM logical button the
   workspace's remote profiles emit (the Astrion glyph row:
   light/cover/music/climate), a binding on one must save, and the
   new Apply-to-children switch must write buttons_inherit. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
/* the CT fixture predates the glyph row — teach its astrion profile */
Object.assign(config.remotes.astrion.keymap,
  { F4: 'light', F5: 'cover', F6: 'music', F7: 'climate' });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1400 } });
const errs = []; let posted = null;
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
  ? r.fulfill({ json: config })
  : (posted = r.request().postDataJSON(), r.fulfill({ json: { ok: true } })));
await ctx.route('**/api/harmonium/workspaces', r =>
  r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'x', path: '/x/' } } } }));
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: 'x' } }));
await ctx.route('**/api/states', r => r.fulfill({ json: [] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2000);
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')].find(el => el.textContent.includes('Porch'))?.click();
});
await p.waitForTimeout(500);
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Page settings')?.click();
});
await p.waitForTimeout(400);
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => x.textContent.trim().replace(/\s*\d+$/, '') === 'Keys')?.click();
});
await p.waitForTimeout(400);

const r = {};
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => x.textContent.includes('Add key binding'))?.click();
});
await p.waitForTimeout(300);
/* the new binding's key select: what does it offer? */
r.options = await p.evaluate(() =>
  [...(document.querySelector('select.w-36')?.options || [])].map(o => o.text));
/* re-key the binding to the glyph row's light */
await p.evaluate(() => {
  const sel = document.querySelector('select.w-36');
  sel.value = 'light';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await p.waitForTimeout(300);
/* flip Apply to children */
await p.evaluate(() => {
  const sw = [...document.querySelectorAll('[role="switch"]')]
    .find(s => s.closest('div')?.textContent.includes('Apply to children'));
  sw?.click();
});
await p.waitForTimeout(300);
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('Save & Deploy'))?.click();
});
await p.waitForTimeout(800);
const porch = Object.values(posted?.screens || {}).find(s => s.name === 'Porch') || null;
r.saved = porch ? { light: porch.buttons?.light ?? null,
  inherit: porch.buttons_inherit ?? null } : null;

console.log(JSON.stringify({ ...r,
  ok: ['Light', 'Cover', 'Music', 'Climate'].every(x => (r.options || []).includes(x)) &&
      !!r.saved?.light && r.saved?.inherit === true && errs.length === 0,
  errs }, null, 1));
await b.close();
