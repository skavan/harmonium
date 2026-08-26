/* THE RENAME-COUPLING BUG + INHERIT LABEL POSITION (v0.85.7 — Suresh:
   "I duplicated Porch nav tile (so it duplicated, including OPENS:
   Porch) — and started typing the new Display Name (Family Room) and
   it (a) Changed OPENS to the exact word I'm typing AND (b) renamed
   the Porch PAGE to Family. BUG!" — plus: "in Label Position, one
   option (and the default) should be inherit".

   Root cause: TileRow's nav Display-name handler wrote the TARGET
   page's name on every keystroke, for every nav card — a follow-along
   that is only right while the ＋-minted page draft born FROM that
   very tile is still open. And the OPENS select renders page NAMES,
   so the rename echoed into it live.

   Fences:
     1. duplicate a nav card, type a new Display name → the target
        page keeps its name (sidebar + the row's Opens select);
     2. the copy's Label position select reads "inherit" (no key);
     3. picking a position writes label_pos; picking inherit back
        DELETES the key (Advanced JSON is the witness) — so the
        section default can flow;
     4. the sanctioned follow-along survives: a nav card's ＋-minted
        page DRAFT still tracks the tile's Display name while the
        draft is pending. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));

/* the fixture: his exact shape — a base page whose nav card opens a
   child page, names distinct from anything in the live config */
config.screens.zz_base = {
  name: 'ZZ Base', class: 'group', view_kind: 'hub', type: 'hub',
  sections: [{ title: 'Rooms', tiles: [
    { id: 'zz_navp', type: 'nav', label: 'ZZ Porch', target: 'zz_porch' },
    { id: 'zz_navq', type: 'nav', label: 'ZZ Loose' },   /* for the ＋ mint fence */
  ] }],
};
config.screens.zz_porch = {
  name: 'ZZ Porch', class: 'group', view_kind: 'hub', type: 'hub',
  parent: 'zz_base', sections: [],
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

const navClick = async (label) => {
  const hit = await p.evaluate((lbl) => {
    const el = [...document.querySelectorAll('#nav .item')]
      .find(x => x.textContent.includes(lbl));   /* the group-token glyph prefixes the text */
    if (el) { el.click(); return true; }
    return false;
  }, label);
  if (!hit) errs.push('sidebar item not found: ' + label);
  await p.waitForTimeout(500);
  return hit;
};
/* rows by POSITION — text filters die the moment we rename the copy
   or switch its tab (the text that matched unmounts) */
const rows = p.locator('div[role="listitem"]');

/* ---- 1. duplicate the nav card, type a new Display name ---------- */
await navClick('ZZ Base');
const n0 = await rows.count();
if (n0 !== 2) errs.push('expected the 2 fixture rows, saw ' + n0);
await rows.nth(0).locator('button[title="Duplicate"]').first().click();
await p.waitForTimeout(300);
if (await rows.count() !== n0 + 1) errs.push('duplicate did not add a row');

const copyRow = rows.nth(1);            /* splice(index+1): right under the original */
await copyRow.locator('span:text("▶")').first().click();   /* fold open */
await p.waitForTimeout(300);
await copyRow.locator('input').first().fill('ZZ Family Room');
await p.waitForTimeout(400);

const after1 = await p.evaluate(() => {
  const nav = document.getElementById('nav').textContent;
  return { porchStays: nav.includes('ZZ Porch'),
           noFamilyPage: !nav.includes('ZZ Family Room') };
});
if (!after1.porchStays) errs.push('BUG: target page lost its name (no "ZZ Porch" in sidebar)');
if (!after1.noFamilyPage) errs.push('BUG: typing the tile Display name renamed the target page');
/* the Opens select still says ZZ Porch (it echoes page names live) */
const opens = await copyRow.locator('select').first()
  .evaluate(s => s.selectedOptions[0]?.textContent.trim());
if (opens !== 'ZZ Porch') errs.push('BUG: Opens no longer reads the target page name: "' + opens + '"');

/* ---- 2+3. Label position: inherit default, delete-on-inherit ----- */
await copyRow.locator('button:text("Styling")').first().click();
await p.waitForTimeout(200);
const lpSel = copyRow.locator('select').last();   /* Style, then Label position */
const lp0 = await lpSel.evaluate(s => s.value);
if (lp0 !== 'inherit') errs.push('Label position does not default to inherit: "' + lp0 + '"');
await lpSel.selectOption('center');
await p.waitForTimeout(200);
const readAdvanced = async () => {
  await copyRow.locator('button:has-text("Advanced")').first().click();
  await p.waitForTimeout(250);
  const txt = await copyRow.locator('textarea').first().inputValue();
  return JSON.parse(txt);
};
const j1 = await readAdvanced();
if (j1.label_pos !== 'center') errs.push('picking center did not write label_pos (' + j1.label_pos + ')');
if (j1.id !== 'zz_navp_copy') errs.push('unexpected copy id: ' + j1.id);
if (j1.target !== 'zz_porch') errs.push('copy target drifted: ' + j1.target);
await copyRow.locator('button:text("Styling")').first().click();
await p.waitForTimeout(200);
await copyRow.locator('select').last().selectOption('inherit');
await p.waitForTimeout(200);
const j2 = await readAdvanced();
if ('label_pos' in j2) errs.push('picking inherit left label_pos behind (must DELETE so the section default flows)');

/* ---- 4. the ＋-minted draft still follows along ------------------- */
const looseRow = rows.nth(2);                      /* original, copy, loose */
await looseRow.locator('span:text("▶")').first().click();
await p.waitForTimeout(300);
await looseRow.locator('button[title^="Create the page"]').first().click();
await p.waitForTimeout(600);                       /* jumped into the draft */
await navClick('ZZ Base');                         /* walk back, draft pending */
const looseRow2 = rows.nth(2);
await looseRow2.locator('span:text("▶")').first().click();
await p.waitForTimeout(300);
await looseRow2.locator('input').first().fill('ZZ Garden');
await p.waitForTimeout(400);
const draftFollows = await p.evaluate(() =>
  document.getElementById('nav').textContent.includes('ZZ Garden'));
if (!draftFollows) errs.push('the ＋-minted DRAFT page no longer follows the tile name (sanctioned follow-along lost)');

/* ---- 5. duplicate TWICE → unique ids, not two _copy twins -------- */
await rows.nth(0).locator('button[title="Duplicate"]').first().click();
await p.waitForTimeout(300);
const row2 = rows.nth(1);                          /* newest copy lands under the original */
await row2.locator('span:text("▶")').first().click();
await p.waitForTimeout(300);
const secondId = await row2.evaluate(el =>
  (el.textContent.match(/zz_navp_copy\d*/) || [''])[0]);
if (secondId !== 'zz_navp_copy2')
  errs.push('second duplicate did not mint a unique id: "' + secondId + '"');

console.log(JSON.stringify({ after1, opens, lp0, secondId, j1_label: j1.label_pos,
  j2_has_key: 'label_pos' in j2, draftFollows, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
