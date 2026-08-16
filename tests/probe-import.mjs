/* IMPORT DESTINATION probe (v0.83.8 follow-up — Suresh: "When I
   import a workspace it overrites main. It should give the choice.
   … we don't allow the import of the full workspace (it should, and
   which workspaces to import)"). Drives the REAL file input:
   (1) a single un-stamped config (his extracted deck.json shape) →
       the dialog appears (no silent overwrite), "new workspace"
       path POSTs a create with the config;
   (2) a STAMPED single export preselects its home workspace on the
       replace path;
   (3) a whole-house bundle → tick list; import replaces the
       existing id via POST config?ws= and creates the missing one;
   (4) export now stamps _workspace. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));

const roster = { order: ['main', 'deck'], workspaces: {
  main: { name: 'Main', file: 'config.json', path: '/x/' },
  deck: { name: 'Deck', file: 'config.deck.json', path: '/x/' } } };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1400 } });
const errs = []; const posts = []; const wsPosts = [];
await ctx.route('**/api/harmonium/config*', r => {
  if (r.request().method() === 'GET') return r.fulfill({ json: config });
  posts.push({ url: r.request().url(),
    screens: !!r.request().postDataJSON()?.screens });
  return r.fulfill({ json: { ok: true } });
});
await ctx.route('**/api/harmonium/workspaces', r => {
  if (r.request().method() === 'POST') {
    const body = r.request().postDataJSON();
    wsPosts.push({ action: body.action, id: body.id, name: body.name,
      hasConfig: !!body.config?.screens });
    return r.fulfill({ json: { ok: true, workspace: body.id || 'minted' } });
  }
  return r.fulfill({ json: roster });
});
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: 'x' } }));
await ctx.route('**/api/states', r => r.fulfill({ json: [] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2000);

const r = {};
const feed = async (name, obj) => {
  await p.evaluate(([name, json]) => {
    const inp = [...document.querySelectorAll('input[type=file]')]
      .find(i => (i.accept || '').includes('json'));
    const dt = new DataTransfer();
    dt.items.add(new File([json], name, { type: 'application/json' }));
    Object.defineProperty(inp, 'files', { value: dt.files, configurable: true });
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }, [name, JSON.stringify(obj)]);
  await p.waitForTimeout(600);
};

// 1. UN-STAMPED single (his extracted files) → dialog, not overwrite
const single = JSON.parse(JSON.stringify(config));
await feed('deck.json', single);
r.dialog = await p.evaluate(() => ({
  open: !!document.querySelector('#impDlg'),
  noStamp: document.querySelector('#impDlg')?.textContent.includes('no workspace stamp'),
  draftDefault: document.querySelector('#impDlg input[type=radio][value=draft]')?.checked,
}));
// take the NEW-workspace path
await p.evaluate(() => {
  const dlg = document.querySelector('#impDlg');
  dlg.querySelector('input[type=radio][value=new]').click();
  const nameIn = [...dlg.querySelectorAll('input')].find(i => i.placeholder?.includes('Deck'));
  nameIn.value = 'Scratch Two';
  nameIn.dispatchEvent(new Event('input', { bubbles: true }));
  dlg.querySelector('#impGo').click();
});
await p.waitForTimeout(800);
r.newWs = { calls: wsPosts.length, ...(wsPosts[0] || {}) };

// 2. STAMPED single from 'deck' → replace path preselected on deck
const stamped = { ...JSON.parse(JSON.stringify(config)),
  _workspace: { id: 'deck', name: 'Deck' } };
await feed('harmonium-deck.json', stamped);
r.stamped = await p.evaluate(() => {
  const dlg = document.querySelector('#impDlg');
  return { open: !!dlg,
    saysDeck: dlg?.textContent.includes('exported from Deck'),
    replaceChecked: dlg?.querySelector('input[type=radio][value=replace]')?.checked,
    wsSel: dlg?.querySelector('select')?.value };
});
await p.evaluate(() => document.querySelector('#impDlg #impGo').click());
await p.waitForTimeout(800);
r.replaced = posts.map(x => x.url.includes('ws=deck') && x.screens);

// 3. BUNDLE: existing 'deck' + missing 'porchB'
const bundle = { harmonium_export: 'workspaces', order: ['deck', 'porchB'],
  workspaces: {
    deck: { name: 'Deck', config: JSON.parse(JSON.stringify(config)) },
    porchB: { name: 'Porch B', config: JSON.parse(JSON.stringify(config)) },
  } };
posts.length = 0; wsPosts.length = 0;
await feed('harmonium-all.json', bundle);
r.bundle = await p.evaluate(() => {
  const dlg = document.querySelector('#impDlg');
  const rows = [...(dlg?.querySelectorAll('input[type=checkbox]') || [])];
  return { open: !!dlg, rows: rows.length,
    allTicked: rows.every(x => x.checked),
    marksReplace: dlg?.textContent.includes('replaces existing'),
    marksNew: (dlg?.textContent.match(/new/g) || []).length > 0 };
});
await p.evaluate(() => document.querySelector('#impDlg #impGo').click());
await p.waitForTimeout(1000);
r.bundleLanded = {
  replacedDeck: posts.some(x => x.url.includes('ws=deck') && x.screens),
  createdPorchB: wsPosts.some(x => x.action === 'create' && x.id === 'porchB' && x.hasConfig),
  status: await p.evaluate(() => document.getElementById('status')?.textContent),
};

// 4. export stamps _workspace
const dl = p.waitForEvent('download');
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith('Export'))?.click();
});
await p.waitForTimeout(300);
await p.evaluate(() => {
  [...document.querySelectorAll('#expMenu button')]
    .find(x => x.textContent.includes('This workspace'))?.click();
});
const d = await dl;
const path = await d.path();
const exported = JSON.parse(readFileSync(path, 'utf8'));
/* the earlier new-workspace stage switched to the mock-minted ws,
   so assert the stamp EXISTS and matches the live workspace id */
r.stampOnExport = !!exported._workspace?.id &&
  exported._workspace.id === await p.evaluate(() =>
    localStorage.getItem('hakr_studio_ws') || 'main');

console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close();
