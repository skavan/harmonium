/* PRESET STYLING TAB (v0.85.8 — presets as first-class citizens:
   "artwork, opacity, font stuff, just like devices"). The Studio's
   preset card grows the nav card's photo knobs on its Styling tab.
   Fences:
     1. a preset's Styling tab offers an Image field; opacity and
        label-position stay hidden while no image is set;
     2. typing an image path writes tile.image (Advanced JSON is the
        witness) and reveals the two photo knobs;
     3. opacity writes image_opacity clamped; label position defaults
        to inherit, a pick writes label_pos, inherit back DELETES the
        key (the v0.85.7 inherit doctrine);
     4. clearing the image deletes tile.image. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));

config.screens.zz_p = {
  name: 'ZZ Presets', class: 'group', view_kind: 'hub', type: 'hub',
  sections: [{ title: 'Presets', tiles: [
    { id: 'zz_pre', type: 'preset', label: 'ZZ egoFM', icon: 'material:radio',
      action: { service: 'music_assistant.play_media',
                entity: 'media_player.mp', data: { media_id: 'library://radio/3' } } },
  ] }],
};

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
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2000);

await p.evaluate(() => {
  const el = [...document.querySelectorAll('#nav .item')]
    .find(x => x.textContent.includes('ZZ Presets'));
  if (el) el.click();
});
await p.waitForTimeout(500);

const rows = p.locator('div[role="listitem"]');
const row = rows.nth(0);
await row.locator('span:text("▶")').first().click();
await p.waitForTimeout(300);
await row.locator('button:text("Styling")').first().click();
await p.waitForTimeout(200);

const imgInput = row.locator('input[placeholder="/local/images/egofm.jpg"]');
const opInput = row.locator('input[placeholder="0.85"]');

/* ---- 1. Image offered; photo knobs hidden while image is blank --- */
if (await imgInput.count() !== 1) errs.push('preset Styling tab has no Image field');
if (await opInput.count() !== 0) errs.push('opacity shows before an image is set');

/* ---- 2. an image path writes tile.image and reveals the knobs ---- */
await imgInput.fill('/local/images/egofm.jpg');
await imgInput.press('Tab');
await p.waitForTimeout(300);
const readAdvanced = async () => {
  await row.locator('button:has-text("Advanced")').first().click();
  await p.waitForTimeout(250);
  const txt = await row.locator('textarea').first().inputValue();
  await row.locator('button:text("Styling")').first().click();
  await p.waitForTimeout(200);
  return JSON.parse(txt);
};
const j1 = await readAdvanced();
if (j1.image !== '/local/images/egofm.jpg')
  errs.push('image path did not land on the tile: ' + j1.image);
if (await opInput.count() !== 1) errs.push('opacity knob did not appear with the image');

/* ---- 3. opacity + label position, inherit deletes ---------------- */
await opInput.fill('0.5');
await opInput.press('Tab');
await p.waitForTimeout(200);
const lpSel = row.locator('select').last();
const lp0 = await lpSel.evaluate(s => s.value);
if (lp0 !== 'inherit') errs.push('Label position does not default to inherit: "' + lp0 + '"');
await lpSel.selectOption('top-left');
await p.waitForTimeout(200);
const j2 = await readAdvanced();
if (j2.image_opacity !== 0.5) errs.push('opacity did not write 0.5: ' + j2.image_opacity);
if (j2.label_pos !== 'top-left') errs.push('label_pos did not write: ' + j2.label_pos);
await row.locator('select').last().selectOption('inherit');
await p.waitForTimeout(200);
const j3 = await readAdvanced();
if ('label_pos' in j3) errs.push('inherit left label_pos behind (must DELETE)');

/* ---- 4. clearing the image deletes the key ----------------------- */
await imgInput.fill('');
await imgInput.press('Tab');
await p.waitForTimeout(300);
const j4 = await readAdvanced();
if ('image' in j4) errs.push('clearing the image left tile.image behind');

console.log(JSON.stringify({ lp0, j1_image: j1.image, j2_op: j2.image_opacity,
  j2_lp: j2.label_pos, j3_has_lp: 'label_pos' in j3, j4_has_img: 'image' in j4,
  ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
