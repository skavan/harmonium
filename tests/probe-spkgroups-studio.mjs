/* SPEAKER GROUPS, Studio side (v0.83.7 — s0.83.18): the Model →
   Speaker Groups editor exists, ＋ Add speaker group mints one,
   players add by typed entity id, and the activity's Controller tab
   Speakers row gains the Players / Card selects; choosing a group
   writes surface.speakers_group and the whole block survives Save &
   Deploy (speaker_groups is a new TOP-LEVEL config key — this probe
   is also the guard against a future normalize sweep eating it). */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
/* seed a LEGACY shows:"stepper" ⚙ entry (v0.83.7 Draws-as
   unification) — the load-time sweep must turn it into
   volume + style: stepper in the saved config */
{
  const anyAct = Object.keys(config.activities || {})[0];
  if (anyAct) config.activities[anyAct].present =
    Object.assign({}, config.activities[anyAct].present,
      { 'media_player.legacy_zone': { shows: 'stepper' } });
}
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
await ctx.route('**/api/states', r => r.fulfill({ json: [
  { entity_id: 'media_player.ma_deck', attributes: { friendly_name: 'Deck MA' } },
  { entity_id: 'media_player.ma_patio', attributes: { friendly_name: 'Patio MA' } },
] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2000);

const r = {};
// 1. the nav slice exists; open it
r.slice = await p.evaluate(() => {
  const it = [...document.querySelectorAll('#nav .item')]
    .find(el => el.textContent.includes('Speaker Groups'));
  it?.click();
  return !!it;
});
await p.waitForTimeout(500);

// 2. mint a group, name it, add two players by typed id
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(x => x.textContent.includes('＋ Add speaker group'))?.click();
});
await p.waitForTimeout(300);
const typeInto = async (sel, val) => {
  await p.evaluate(([sel, val]) => {
    const inp = [...document.querySelectorAll(sel)].at(-1);
    if (!inp) return;
    inp.focus(); inp.value = val;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    inp.blur();
  }, [sel, val]);
  await p.waitForTimeout(200);
};
await typeInto('input[placeholder="media_player.* — type to search"]', 'media_player.ma_deck');
await typeInto('input[placeholder="media_player.* — type to search"]', 'media_player.ma_patio');
r.editor = await p.evaluate(() => {
  const body = document.body.textContent;
  return {
    deckListed: body.includes('media_player.ma_deck'),
    patioListed: body.includes('media_player.ma_patio'),
  };
});

// 3. Controller tab of Listen to Music → the Speakers row offers the
//    group; choose it → Players select set, Card select shows
//    Launcher (auto)
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')].find(el => el.textContent.includes('Porch'))?.click();
});
await p.waitForTimeout(500);
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
r.row = await p.evaluate(() => {
  const lbl = x => x.querySelector('span.w-\\[186px\\]')?.textContent;
  const row = [...document.querySelectorAll('.flex.flex-wrap')]
    .find(x => lbl(x) === 'Speakers (grouping)');
  if (!row) return { found: false };
  const sels = [...row.querySelectorAll('select')];
  return {
    found: true,
    players: sels[0] ? [...sels[0].options].map(o => o.textContent) : [],
  };
});
// 3a. the ＋ Create group… door: choosing it jumps to the editor and
//     leaves the surface untouched
await p.evaluate(() => {
  const lbl = x => x.querySelector('span.w-\\[186px\\]')?.textContent;
  const row = [...document.querySelectorAll('.flex.flex-wrap')]
    .find(x => lbl(x) === 'Speakers (grouping)');
  const sel = row?.querySelector('select');
  if (!sel) return;
  sel.value = '__new';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await p.waitForTimeout(400);
r.door = await p.evaluate(() =>
  document.body.textContent.includes('A speaker group is a'));
// back to the activity's Controller tab
await p.evaluate(() => {
  [...document.querySelectorAll('#nav .item')].find(el => el.textContent.includes('Porch'))?.click();
});
await p.waitForTimeout(500);
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
await p.evaluate(() => {
  const lbl = x => x.querySelector('span.w-\\[186px\\]')?.textContent;
  const row = [...document.querySelectorAll('.flex.flex-wrap')]
    .find(x => lbl(x) === 'Speakers (grouping)');
  const sel = row?.querySelector('select');
  if (!sel) return;
  const opt = [...sel.options].find(o => o.textContent.includes('New speaker group'));
  if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
});
await p.waitForTimeout(300);
r.modeAuto = await p.evaluate(() => {
  const lbl = x => x.querySelector('span.w-\\[186px\\]')?.textContent;
  const row = [...document.querySelectorAll('.flex.flex-wrap')]
    .find(x => lbl(x) === 'Speakers (grouping)');
  const sels = [...(row?.querySelectorAll('select') || [])];
  return sels[1] ? sels[1].options[sels[1].selectedIndex].textContent : null;
});

// 4. Save & Deploy → the POST carries both halves
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('Save & Deploy'))?.click();
});
await p.waitForTimeout(800);
r.saved = posted ? {
  groups: Object.fromEntries(Object.entries(posted.speaker_groups || {})
    .map(([k, g]) => [k, { name: g.name, n: (g.entities || []).length }])),
  surface: Object.fromEntries(
    Object.entries(posted.activities || {})
      .filter(([, a]) => a.surface?.speakers_group)
      .map(([k, a]) => [k, a.surface.speakers_group])),
  legacySwept: Object.values(posted.activities || {})
    .map(a => a.present?.['media_player.legacy_zone']).find(Boolean) || null,
} : null;

console.log(JSON.stringify({ r, errs }, null, 1));
await b.close();
