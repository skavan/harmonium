/* STUDIO IMAGE UPLOAD probe (v0.83.8 — beta-gaps P1 #7: "a
   drag-and-drop / file-picker upload … returning the /local/... path
   straight into the field. … a stranger never needs filesystem
   access"). Drives the REAL UploadBtn on the Porch banner editor:
   drop a File on it → POST /api/harmonium/upload (mocked) answers
   409 exists → confirm() → retry carries overwrite=1 → 200 → the
   banner Image field holds the returned /local/… path. Also checks
   the NP style select: Poster is offered, Art wash is NOT (a config
   not already on wash). */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1400 } });
const errs = []; const uploads = [];
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
  ? r.fulfill({ json: config })
  : r.fulfill({ json: { ok: true } }));
await ctx.route('**/api/harmonium/workspaces', r =>
  r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'x', path: '/x/' } } } }));
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: 'x' } }));
let refuseStock = false;   // stage 3 flips this (v0.84.6 rung 2)
await ctx.route('**/api/harmonium/upload', async r => {
  const req = r.request();
  const body = req.postData() || '';
  const overwrite = body.includes('name="overwrite"');
  uploads.push({ overwrite, hasFile: body.includes('filename=') });
  if (refuseStock)
    return r.fulfill({ status: 403, json: { ok: false,
      message: 'stock skins are locked — upload your own photo instead; '
        + 'it lands in skins/user/' } });
  if (!overwrite)
    return r.fulfill({ status: 409, json: { ok: false, exists: true,
      path: '/local/images/sunset_photo.png' } });
  return r.fulfill({ json: { ok: true,
    path: '/local/images/sunset_photo.png', file: 'sunset_photo.png' } });
});
await ctx.route('**/api/states', r => r.fulfill({ json: [] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  window.confirm = () => { window._confirmed = true; return true; };
});
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2000);

const r = {};
// 1. open the Porch hub — its banner section already exists; the
//    Hero card's body hides behind its Section settings fold
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')]
    .find(el => el.textContent.includes('Porch'))?.click();
});
await p.waitForTimeout(700);
await p.evaluate(() => {
  [...document.querySelectorAll('[data-sec="Hero"] button')]
    .find(x => x.textContent.trim() === 'Section settings')?.click();
});
await p.waitForTimeout(500);
r.btn = await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button')]
    .find(x => (x.title || '').startsWith('Upload a picture'));
  return btn ? { found: true, label: btn.textContent.trim() } : { found: false };
});

// 2. drop a PNG on it → 409 → confirm → overwrite retry → field filled
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button')]
    .find(x => (x.title || '').startsWith('Upload a picture'));
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dt = new DataTransfer();
  dt.items.add(new File([png], 'Sunset Photo.png', { type: 'image/png' }));
  btn.dispatchEvent(new DragEvent('drop',
    { dataTransfer: dt, bubbles: true, cancelable: true }));
});
await p.waitForTimeout(1200);
r.confirmed = await p.evaluate(() => !!window._confirmed);
r.field = await p.evaluate(() =>
  [...document.querySelectorAll('input')]
    .some(i => i.value === '/local/images/sunset_photo.png'));
r.status = await p.evaluate(() =>
  document.body.textContent.includes('uploaded → /local/images/sunset_photo.png'));

// 3. NP style select: Poster offered, wash hidden (config isn't on wash)
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => /^[▶▼]/.test(x.textContent.trim()) && x.textContent.includes('Listen to Music'))?.click();
});
await p.waitForTimeout(700);
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => x.textContent.trim().replace(/^[•●○\s]*/, '').replace(/\s*\d+$/, '') === 'Controller' &&
      x.className.includes('px-3.5'))?.click();
});
await p.waitForTimeout(500);
r.npSelect = await p.evaluate(() => {
  const sel = [...document.querySelectorAll('select')]
    .find(s => [...s.options].some(o => o.value === 'poster'));
  if (!sel) return { found: false };
  const vals = [...sel.options].map(o => o.value);
  return { found: true, poster: vals.includes('poster'), wash: vals.includes('wash') };
});

/* 3. THE PICKER REFUSES STOCK (v0.84.6 rung 2): a 403 is a REFUSAL,
   not a collision — the Studio must NOT offer "replace it?", must not
   retry with overwrite, and must say why. */
refuseStock = true;
const callsBefore = uploads.length;
await p.evaluate(() => { window._confirmed = false; });
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button')]
    .find(x => (x.title || '').startsWith('Upload a picture'));
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dt = new DataTransfer();
  dt.items.add(new File([png], 'rs90.png', { type: 'image/png' }));
  btn.dispatchEvent(new DragEvent('drop',
    { dataTransfer: dt, bubbles: true, cancelable: true }));
});
await p.waitForTimeout(1000);
r.refusal = {
  oneCallOnly: uploads.length === callsBefore + 1,   // no overwrite retry
  noConfirmAsked: await p.evaluate(() => !window._confirmed),
  saysWhy: await p.evaluate(() =>
    document.body.textContent.includes('stock skins are locked')),
};
if (!r.refusal.oneCallOnly) errs.push('refusal: Studio retried with overwrite');
if (!r.refusal.noConfirmAsked) errs.push('refusal: Studio offered to replace stock');
if (!r.refusal.saysWhy) errs.push('refusal: no explanation surfaced');

console.log(JSON.stringify({ ...r,
  uploadCalls: uploads.length, firstPlain: uploads[0] && !uploads[0].overwrite,
  secondOverwrite: uploads[1] && uploads[1].overwrite, errs }, null, 1));
await b.close();
