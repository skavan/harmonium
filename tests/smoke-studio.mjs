import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
/* Harmonium Studio v2 (Svelte): load → nav → visual editor → code
   editor live-edit → preview follows → soft remote → save round-trip.
   The HA API is stubbed with routes; the preview iframe is the REAL
   engine (route-mapped to dist). */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const engine = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8');
const studio = readFileSync(
  join(ROOT, 'custom_components', 'harmonium', 'studio', 'studio.html'), 'utf8');
const config = JSON.parse(readFileSync(join(ROOT, 'dist', 'config.json'), 'utf8'));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
const r = {}; const errs = []; let postedConfig = null; let postedWs = null;
const wsPosts = [];

/* WORKSPACES (v0.34): stateful roster stub — main + den to start,
   creates append. Config GET/POST dispatches on ?ws=. */
const denCfg = {
  version: 2, theme: {}, devices: config.devices, keymap: config.keymap,
  home_screen: 'den', screen_order: ['den'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_den_activity' },
  input: {}, controllers: {},
  activities: { watch_den: { name: 'Watch Den TV', room_view: 'den' } },
  sequences: {},
  screens: { den: { name: 'Den', type: 'hub', room: true,
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'den' }] }] } },
};
const roster = { order: ['main', 'den'], workspaces: {
  main: { name: 'Main', file: 'config.json' },
  den: { name: 'Den', file: 'config.den.json' } } };
const wsConfigs = { main: config, den: denCfg };

await ctx.route('**/api/harmonium/config*', route => {
  const ws = new URL(route.request().url()).searchParams.get('ws') || 'main';
  if (route.request().method() === 'POST') {
    postedConfig = route.request().postDataJSON();
    postedWs = ws;
    return route.fulfill({ json: { ok: true, workspace: ws, deployed: 'stub' } });
  }
  return wsConfigs[ws]
    ? route.fulfill({ json: wsConfigs[ws] })
    : route.fulfill({ status: 404, json: { message: 'no such workspace' } });
});
await ctx.route('**/api/harmonium/workspaces', route => {
  if (route.request().method() === 'POST') {
    const b = route.request().postDataJSON();
    wsPosts.push(b);
    if (b.action === 'create' || b.action === 'duplicate') {
      const id = (b.id || b.name).toLowerCase().replace(/[^a-z0-9]+/g, '_');
      roster.order.push(id);
      roster.workspaces[id] = { name: b.name, file: 'config.' + id + '.json' };
      wsConfigs[id] = b.config || wsConfigs[b.from] || config;
      return route.fulfill({ json: { ok: true, workspace: id, file: 'config.' + id + '.json' } });
    }
    return route.fulfill({ json: { ok: true } });
  }
  return route.fulfill({ json: roster });
});
await ctx.route('**/api/states', route => route.fulfill({ json: [
  { entity_id: 'media_player.demo_tv', state: 'on', attributes: { friendly_name: 'Demo TV' } },
] }));
await ctx.route('**/api/services/button/press', route =>
  route.fulfill({ json: [] }));
let ranSequence = null;
await ctx.route('**/api/services/harmonium/run', route => {
  ranSequence = route.request().postDataJSON();
  return route.fulfill({ json: [] });
});
await ctx.route('**/local/harmonium/index.html*', route =>
  route.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', route =>
  route.fulfill({ body: studio, contentType: 'text/html' }));

const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('hakr_token', 'stub-token'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(1500);

const cardTab = name => p.evaluate(n => {
  [...document.querySelectorAll('button')]
    .filter(b => b.textContent.trim().startsWith(n) && !b.closest('#nav'))
    .forEach(b => b.click());
}, name);

const navClick = label => p.evaluate(l => {
  [...document.querySelectorAll('#nav .item')]
    .find(el => (el.querySelector('.truncate')?.textContent || el.textContent).startsWith(l)).click();
}, label);

// 1. loaded: status + nav slices (Room + 7 views + Activities + 3 system)
r.load = await p.evaluate(() => ({
  status: document.getElementById('status').textContent,
  navItems: document.querySelectorAll('#nav .item').length,
  dev: document.getElementById('devSel').value,
  authHidden: document.getElementById('auth').classList.contains('hidden')
}));

// 2. preview booted with the real config (frame realm for engine internals)
const fr = p.frames().find(f => f.url().includes('/local/harmonium'));
r.preview = await fr.evaluate(() => ({
  screen: S.screen,
  tiles: document.querySelectorAll('#grid .tile').length > 0
}));

// 2b. WORKSPACE MAP (final round): the LANDING slice — whole workspace
//     at a glance, read-only, Edit → is the doorway into real editors
r.map = await p.evaluate(() => ({
  landed: !!document.querySelector('[data-map]'),
  navPinned: !!document.getElementById('navMap'),
  pageCards: document.querySelectorAll('[data-map] .grid-cols-2 > div').length >= 3,
  rootBadge: document.body.textContent.includes('Root page'),
  controllers: [...document.querySelectorAll('[data-map] span')]
    .some(s => s.textContent === 'Controllers'),
  sharedNote: document.body.textContent.includes('an edit here reaches both'),
}));
await p.evaluate(() => {
  const card = [...document.querySelectorAll('[data-map] .grid-cols-2 > div')]
    .find(d => d.querySelector('span.truncate')?.textContent === 'Porch');
  [...card.querySelectorAll('button')]
    .find(b => b.textContent.trim() === 'Edit')?.click();
});
await p.waitForTimeout(500);
r.map.editJump = await p.evaluate(() =>
  [...document.querySelectorAll('input')].some(i => i.value === 'Porch'));

// 3. VISUAL editor: default slice is the ROOM (room.porch) — rename the
//    room through the form; the room OWNS its activities (4 cards)
r.roomForm = await p.evaluate(() => {
  const out = {
    activitiesOwned: document.body.textContent.includes('＋ Add activity'),   /* v0.83.7 selector refresh: section header phrase changed */
    activityCards: [...document.querySelectorAll('.font-semibold')]
      .filter(el => ['Watch Fire TV', 'Watch Smart TV', 'Listen to Music'].includes(el.textContent)).length
  };
  const room = [...document.querySelectorAll('input')].find(i => i.value === 'Porch');
  if (!room) return { ...out, found: false };
  room.value = 'Veranda';
  room.dispatchEvent(new Event('input', { bubbles: true }));
  return { ...out, found: true };
});
await p.waitForTimeout(500);

// 3b. All-activities INDEX groups by owner room
await navClick('All activities');
r.index = await p.evaluate(() => ({
  grouped: document.body.textContent.includes('edit in page'),
  rows: [...document.querySelectorAll('button')]
    .filter(b => /watch_firetv|watch_smart|music/.test(b.textContent)).length >= 3,
  noOrphans: !document.body.textContent.includes('Unassigned')
}));

// 3c. theme toggle flips the chrome (light is the default)
const themeBefore = await p.evaluate(() => document.documentElement.dataset.theme);
await p.click('#themeBtn');
await p.waitForTimeout(100);
const themeAfter = await p.evaluate(() => document.documentElement.dataset.theme);
await p.click('#themeBtn');
await p.waitForTimeout(100);
r.theme = {
  before: themeBefore, after: themeAfter,
  restored: await p.evaluate(() => document.documentElement.dataset.theme) === themeBefore
};

// 3d. Building blocks: 5 ported sequences, typed action rows, Test runs
await navClick('Actions');
await p.evaluate(() => {
  [...document.querySelectorAll('.font-semibold')]
    .find(el => el.textContent === 'Fire TV On')?.closest('button')?.click();
});
await p.waitForTimeout(300);
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(b => b.textContent.includes('Test'))?.click();
});
await p.waitForTimeout(300);
r.blocks = await p.evaluate(() => ({
  cards: [...document.querySelectorAll('.font-semibold')]
    .filter(el => ['Fire TV On', 'Smart TV On', 'Music On', 'Music Stop', 'All Off'].includes(el.textContent)).length,
  typedRows: [...document.querySelectorAll('span')]
    .filter(el => ['CALL SERVICE', 'DELAY', 'WAIT FOR', 'HA ACTION (JSON)'].includes(el.textContent.toUpperCase())).length >= 3,
  usedBy: document.body.textContent.includes('used by:')   /* v0.83.7: replaced dead `startPicker: false` placeholder */
}));
r.blocks.testRan = ranSequence && ranSequence.sequence === 'firetv_on';

// 4. Watch TV view: visual editor shows the form, then the CODE tab
//    live-edits a label -> the real engine re-renders it
await navClick('TV Media Player');
r.viewForm = await p.evaluate(() => ({
  visualSelected: document.getElementById('tabVisual').getAttribute('aria-selected'),
  nameInput: [...document.querySelectorAll('input')].some(i => i.value === 'TV Media Player')   /* v0.83.7: stock rename */
}));
await p.click('#tabCode');
await p.evaluate(() => {
  const ta = document.getElementById('json');
  ta.value = ta.value.replace('"Now Playing"', '"Studio Was Here"');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
});
await p.waitForTimeout(900);
r.liveEdit = await fr.evaluate(() => {
  /* v0.46.1: the player is PURE $context — an activity must be live
     for its tiles to exist (the house defaults are gone by doctrine) */
  S.states.set('select.harmonium_porch_activity', { s: 'watch_firetv', a: {} });
  navigate('controller:tv');
  return document.querySelector('#tile_t_np .lbl')?.textContent || null;
});

// 5. soft remote key reaches the engine
await fr.evaluate(() => { navigate('porch', true); });
await p.click('#soft button[data-k="ArrowDown"]');
await p.waitForTimeout(250);
r.softKey = await fr.evaluate(() => S.focusId);

// 5b. SOFT-REMOTE LAYOUT is per-profile DATA, edited in place
//     (v0.54 — Suresh: "mirror the remote… mute blank menu";
//      v0.56 — the REMOTE-CREATION screen: cells are free text over a
//      datalist, so a CUSTOM slot name ("Red") types straight in and
//      renders by fallback; empty stays a blank spacer)
await p.click('#softEdit');
await p.waitForTimeout(200);
await p.evaluate(() => {
  const cells = [...document.querySelectorAll('#soft input')];
  const last = cells.slice(-3);                    // bottom row cells
  const set = (el, v) => { el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true })); };
  set(last[0], 'mute'); set(last[1], ''); set(last[2], 'Red');
});
await p.click('#softDone');
await p.waitForTimeout(200);
r.softLayout = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('#soft > div')];
  const lastRow = rows[rows.length - 1];
  const red = document.querySelector('#soft button[data-btn="Red"]');
  return {
    bottom: [...lastRow.children].map(el =>
      el.dataset?.btn || (el.tagName === 'SPAN' ? '·' : el.tagName)),
    editorClosed: !document.querySelector('#soft input'),
    holdStill: !!document.getElementById('softHold'),
    datalist: document.querySelectorAll('#softbtns option').length >= 15,
    // custom slot: fallback glyph is the name, label is it uppercased,
    // and it renders DISABLED until a key is captured for it
    customGlyph: red && red.textContent.replace(/\s+/g, '') === 'RedRED',
    customUnmapped: red ? red.disabled : null,
  };
});

// 5c. ＋ NEW REMOTE PROFILE — naming a remote is where describing one
//     starts; the blank profile is capabilities + an empty keymap
//     (the keys arrive from the engine's capture-assign screen)
const devBefore = await p.evaluate(() => document.getElementById('devSel').value);
await p.click('#devNew');
await p.waitForTimeout(150);
await p.evaluate(() => {
  const i = document.getElementById('devNewId');
  i.value = 'RS 90'; i.dispatchEvent(new Event('input', { bubbles: true }));
});
await p.click('#devNewAdd');
await p.waitForTimeout(300);
r.newProfile = await p.evaluate(() => ({
  selected: document.getElementById('devSel').value,
  inList: [...document.querySelectorAll('#devSel option')].map(o => o.value).includes('rs_90'),
}));
// back to the profile the rest of the suite expects
await p.evaluate((d) => {
  const s = document.getElementById('devSel');
  s.value = d; s.dispatchEvent(new Event('change', { bubbles: true }));
}, devBefore);
await p.waitForTimeout(300);

// 6. invalid JSON flags, does not clobber the draft
await p.evaluate(() => {
  const ta = document.getElementById('json');
  ta.value = '{ broken';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
});
await p.waitForTimeout(500);
r.badJson = await p.evaluate(() => ({
  flagged: document.getElementById('json').classList.contains('bad'),
  statusErr: document.getElementById('status').classList.contains('err')
}));

// 7. Save posts the DRAFT: the code edit AND the visual room rename
await p.click('#saveBtn');
await p.waitForTimeout(400);
r.save = {
  posted: !!postedConfig,
  codeEditSurvived: postedConfig &&
    JSON.stringify(postedConfig.controllers.tv).includes('Studio Was Here'),
  visualEditSurvived: postedConfig && postedConfig.global.room === 'Veranda',
  status: await p.evaluate(() => document.getElementById('status').textContent)
};

// 9. NEW-ACTIVITY fast path: the id AUTO-FILLS from the display name
//    on blur (room-prefixed slug), refs stay honest. (v0.53: the old
//    section 8 SCRATCH test went with the scratch workspace — its
//    generated-tile assert lives here now, on the live draft.)
await navClick('Veranda'); /* section 3 renamed the room */
await p.waitForTimeout(400);
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('Add activity'))?.click();
});
await p.waitForTimeout(900);
r.addGen = await fr.evaluate(() => ({
  genTile: !!document.querySelector('[id^="tile_acts"]'),
}));
await p.evaluate(() => {
  const inp = [...document.querySelectorAll('input')].find(i => i.value === 'New Activity');
  inp.focus();
  inp.value = 'Watch Bluray';
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  inp.blur();
});
await p.waitForTimeout(500);
r.autoId = await p.evaluate(() => ({
  renamed: [...document.querySelectorAll('input')].some(i => i.value === 'veranda_watch_bluray'),
}));

// 10. ＋ on an empty Start action opens a DRAFT in the Actions editor:
//     seeded, NOT linked until Confirm; Confirm links + returns to the
//     origin view with the activity card re-opened
await cardTab('Actions');
await p.waitForTimeout(200);
await p.evaluate(() => {
  document.querySelector('button[title*="Watch Bluray — Start"]')?.click();
});
await p.waitForTimeout(600);
r.createSeq = await p.evaluate(() => ({
  draftMode: document.body.textContent.includes('nothing is linked until you confirm'),
  notYetLinked: !JSON.stringify(
    [...document.querySelectorAll('select')].map(s => s.value)
  ).includes('veranda_watch_bluray_start'),
  /* the step alias renders as an input VALUE, not textContent */
  seeded: [...document.querySelectorAll('input')].some(i => i.value === 'Set activity state'),
}));
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('Confirm & link'))?.click();
});
await p.waitForTimeout(700);
await cardTab('Actions');
await p.waitForTimeout(200);
r.createSeq.linked = await p.evaluate(() =>
  [...document.querySelectorAll('select')].some(
    s => s.value === 'sequence:veranda_watch_bluray_start'));
r.createSeq.cardReopened = await p.evaluate(() =>
  [...document.querySelectorAll('input')].some(i => i.value === 'Watch Bluray'));

// 10b. the other half: ＋ on Stop, then DISCARD — nothing linked,
//      the draft is deleted, and we land back on the card
await cardTab('Actions');
await p.waitForTimeout(200);
await p.evaluate(() => {
  document.querySelector('button[title*="Watch Bluray — Stop"]')?.click();
});
await p.waitForTimeout(600);
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('Discard'))?.click();
});
await p.waitForTimeout(600);
await cardTab('Actions');
await p.waitForTimeout(200);
r.discard = await p.evaluate(() => ({
  noLink: ![...document.querySelectorAll('select')].some(
    s => s.value === 'sequence:veranda_watch_bluray_stop'),
  backOnCard: [...document.querySelectorAll('input')].some(i => i.value === 'Watch Bluray'),
}));

// 11. entity COMBOBOX: type-to-search, click a hit
await navClick('Veranda'); /* section 3 renamed the room */
await p.waitForTimeout(400);
await p.evaluate(() => {
  /* open the card only if it's CLOSED (a tab bar means open — the
     draft-confirm return leaves it open on some tab) */
  if (![...document.querySelectorAll('button')]
      .some(b => b.textContent.trim().startsWith('Roles') && !b.closest('#nav')))
    [...document.querySelectorAll('.font-semibold')]
      .find(el => el.textContent === 'Watch Bluray')?.closest('button')?.click();
});
await p.waitForTimeout(300);
await cardTab('Setup');
await p.waitForTimeout(200);
await p.evaluate(() => {
  const inp = [...document.querySelectorAll('input')]
    .find(i => i.placeholder === 'cast a device — or type any entity…');
  inp.focus();
  inp.value = 'demo';
  inp.dispatchEvent(new Event('input', { bubbles: true }));
});
await p.waitForTimeout(300);
r.combo = await p.evaluate(() => {
  const opt = [...document.querySelectorAll('button')]
    .find(b => b.textContent.includes('media_player.demo_tv'));
  const out = { dropdown: !!opt };
  opt?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  return out;
});
await p.waitForTimeout(200);
/* picking from the dropdown now ADDS the device (v0.43.8): it joins
   the cast and the box clears for the next one */
r.combo.picked = await p.evaluate(() =>
  [...document.querySelectorAll('.font-mono')].some(el => el.textContent === 'media_player.demo_tv') &&
  ![...document.querySelectorAll('input')].some(i => i.value === 'media_player.demo_tv'));

// 10c. EVERY activity card opens (music lacks confirm_end — the
//      bind-to-undefined crash class; open them all)
r.allCardsOpen = { crashes: 0 };
for (const nm of ['Watch Fire TV', 'Watch Smart TV', 'Listen to Music']) {
  await p.evaluate((n) => {
    [...document.querySelectorAll('.font-semibold')]
      .find(el => el.textContent === n)?.closest('button')?.click();
  }, nm);
  await p.waitForTimeout(250);
  r.allCardsOpen[nm] = await p.evaluate((n) =>
    [...document.querySelectorAll('input')].some(i => i.value === n), nm);
}
r.allCardsOpen.crashes = errs.length;

// 11a. ＋ Create control page: mints the controller view AND jumps
//      into it as a PAGE DRAFT (the generalized ＋ contract); Keep
//      returns to the card with the link in place
await cardTab('Setup');
await p.waitForTimeout(200);
await p.evaluate(() => {
  document.querySelector('button[title*="Create control page"]')?.click();
});
await p.waitForTimeout(600);
r.createPage = await p.evaluate(() => ({
  draftBanner: document.body.textContent.includes('Discard removes it and unlinks'),
  onPageEditor: [...document.querySelectorAll('input')].some(i => i.value === 'veranda_watch_bluray'),
}));
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('Keep this page'))?.click();
});
await p.waitForTimeout(600);
await cardTab('Setup');
await p.waitForTimeout(200);
r.createPage.linked = await p.evaluate(() =>
  [...document.querySelectorAll('select')].some(s => s.value === 'veranda_watch_bluray'));
r.createPage.editLink = await p.evaluate(() =>
  [...document.querySelectorAll('button')].some(b => b.title === 'Open this page'));

// 11c. NAV CARD: ＋ Add nav card in Devices, ＋ mints its page and
//      jumps in as a draft; DISCARD deletes the page and unlinks
await p.evaluate(() => {
  /* blessed sections (R2): Devices is always visible — add a doorway */
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('Add nav'))?.click();
});
await p.waitForTimeout(400);
r.navCard = await p.evaluate(() => ({
  added: [...document.querySelectorAll('.font-semibold')]
    .some(el => el.textContent === 'New nav'),
}));
await p.evaluate(() => {
  /* open the new tile's card row, then hit its ＋ (mint page) */
  [...document.querySelectorAll('.font-semibold')]
    .find(el => el.textContent === 'New nav')?.closest('button')?.click();
});
await p.waitForTimeout(300);
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.title?.startsWith('Create the page'))?.click();
});
await p.waitForTimeout(600);
r.navCard.draftBanner = await p.evaluate(() =>
  document.body.textContent.includes('Discard removes it and unlinks'));
r.navCard.pageMade = await p.evaluate(() =>
  [...document.querySelectorAll('input')].some(i => i.value === 'new_nav'));
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '✕ Discard')?.click();
});
await p.waitForTimeout(600);
r.navCard.discarded = await p.evaluate(() => ({
  pageGone: !document.getElementById('nav')?.textContent.includes('New nav'),
  backOnRoom: [...document.querySelectorAll('input')].some(i => i.value === 'porch'),
}));

// 11b. exactly ONE canonical Devices fold (device tiles must infer
//      role "devices" in compiler AND editor — regression guard)
r.devicesFold = await p.evaluate(() =>
  document.querySelectorAll('[data-sec="Devices"]').length === 1);

// 11b2. SECTION ACCORDION (v0.43.6): editor-only fold — chevron hides
//       the section's rows, config untouched, expand brings them back
await p.evaluate(() => document.querySelector('[aria-label="Collapse Devices"]')?.click());
await p.waitForTimeout(250);
r.accordion = { folded: await p.evaluate(() =>
  ![...document.querySelectorAll('.font-semibold')].some(e => e.textContent === 'Porch TV')) };
await p.evaluate(() => document.querySelector('[aria-label="Expand Devices"]')?.click());
await p.waitForTimeout(250);
r.accordion.back = await p.evaluate(() =>
  [...document.querySelectorAll('.font-semibold')].some(e => e.textContent === 'Porch TV'));

// 11d. ITEM-CARD GRAMMAR ON TILES (R4): a fresh device opens onto
//      "The device" tab; Styling holds Column span; Advanced (glass)
//      holds Type + the always-on JSON
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('Add device'))?.click();
});
await p.waitForTimeout(300);
await p.evaluate(() => {
  [...document.querySelectorAll('.font-semibold')]
    .find(el => el.textContent === 'New device')?.closest('button')?.click();
});
await p.waitForTimeout(300);
r.tileGrammar = await p.evaluate(() => ({
  deviceTab: [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'The device'),
  stylingTab: [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Styling'),
  idChip: [...document.querySelectorAll('div')].some(d => d.title?.includes('editable under Advanced')),
  entityOnMain: [...document.querySelectorAll('span')].some(s => s.textContent.trim() === 'Entity'),
}));
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Styling')?.click();
});
await p.waitForTimeout(200);
r.tileGrammar.spanSegmented = await p.evaluate(() =>
  [...document.querySelectorAll('span')].some(s => s.textContent.trim() === 'Column span') &&
  [...document.querySelectorAll('[role="tablist"] button')].some(b => b.textContent.trim() === '2'));
await p.evaluate(() => {
  [...document.querySelectorAll('button')].filter(b => b.textContent.trim().endsWith('Advanced')).at(-1)?.click();
});
await p.waitForTimeout(200);
r.tileGrammar.advanced = await p.evaluate(() => ({
  typeSelect: [...document.querySelectorAll('option')].some(o => o.textContent.includes('device — auto from its entity')),
  json: [...document.querySelectorAll('textarea')].some(t => t.value.includes('"New device"')),
}));
/* leave the board as we found it: delete the probe tile */
await p.evaluate(() => {
  [...document.querySelectorAll('.font-semibold')]
    .filter(el => el.textContent === 'New device')
    .map(el => el.closest('div')?.querySelector('button[title="Delete"]'))
    .find(Boolean)?.click();
});
await p.waitForTimeout(300);
/* the probe delete raised an undo toast — dismiss so it can't linger */
await p.evaluate(() => document.querySelector('#undoToast button[title="Dismiss"]')?.click());

// 11e. REORDER + UNDO + DIRTY (final round): ··· menu moves; Remove
//      gets a 10s undo toast; edits wear an ● Edited chip that clears
//      when the item matches saved again
const rowMenuClick = async (rowTitle, item) => {
  await p.evaluate((t) => {
    [...document.querySelectorAll('.font-semibold')]
      .find(el => el.textContent === t)?.closest('div')
      ?.querySelector('button[title="More actions"]')?.click();
  }, rowTitle);
  await p.waitForTimeout(150);
  await p.evaluate((l) => {
    [...document.querySelectorAll('button')]
      .find(b => b.textContent.trim() === l)?.click();
  }, item);
  await p.waitForTimeout(250);
};
const presetOrder = () => p.evaluate(() => {
  const names = [...document.querySelectorAll('.font-semibold')].map(e => e.textContent);
  return names.indexOf('Netflix') - names.indexOf('YouTube TV');
});
r.reorder = { before: await presetOrder() };            // negative: Netflix first
await rowMenuClick('Netflix', 'Move down');
r.reorder.moved = await presetOrder();                  // positive: now after
await rowMenuClick('Netflix', 'Move up');
r.reorder.restored = await presetOrder();
r.reorder.ok = r.reorder.before < 0 && r.reorder.moved > 0 && r.reorder.restored < 0;

await rowMenuClick('Netflix', 'Remove');
r.undo = await p.evaluate(() => ({
  toast: document.getElementById('undoToast')?.textContent.includes('Removed Netflix'),
  gone: ![...document.querySelectorAll('.font-semibold')].some(e => e.textContent === 'Netflix'),
}));
await p.click('#undoBtn');
await p.waitForTimeout(300);
r.undo.restored = await p.evaluate(() =>
  [...document.querySelectorAll('.font-semibold')].some(e => e.textContent === 'Netflix'));

/* dirty chip: edit → chip; edit BACK → chip clears (set-based baseline).
   NB the row title follows the label, so check under BOTH names. */
const netflixEdited = () => p.evaluate(() =>
  [...document.querySelectorAll('.font-semibold')]
    .find(e => e.textContent === 'Netflix' || e.textContent === 'NetflixX')?.closest('button')
    ?.textContent.includes('● Edited') ?? false);
await p.evaluate(() => {
  [...document.querySelectorAll('.font-semibold')]
    .find(el => el.textContent === 'Netflix')?.closest('button')?.click();
});
await p.waitForTimeout(300);
const setNetflixLabel = (v) => p.evaluate((val) => {
  const inp = [...document.querySelectorAll('input')]
    .find(i => i.value === (val === 'NetflixX' ? 'Netflix' : 'NetflixX'));
  inp.value = val;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
}, v);
r.dirty = { cleanBefore: !(await netflixEdited()) };
await setNetflixLabel('NetflixX');
await p.waitForTimeout(250);
r.dirty.chipOn = await netflixEdited();
await setNetflixLabel('Netflix');
await p.waitForTimeout(250);
r.dirty.chipCleared = !(await netflixEdited());
await p.evaluate(() => {   /* close the card */
  [...document.querySelectorAll('.font-semibold')]
    .find(el => el.textContent === 'Netflix')?.closest('button')?.click();
});
await p.waitForTimeout(200);

// 11f. PAGE SETTINGS PANEL (final round): Layout tab — grid columns
//      segmented with a source chip; SET HERE ↔ Reset round-trip
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Page settings')?.click();
});
await p.waitForTimeout(250);
r.pageSettings = await p.evaluate(() => ({
  layoutTab: [...document.querySelectorAll('span')].some(s => s.textContent.trim() === 'Grid columns'),
  /* porch ships grid.columns:1, so the chip STARTS at Set here —
     assert a source chip exists in either state */
  sourceChip: document.body.textContent.includes('From workspace') ||
    document.body.textContent.includes('Set here'),
  tileHeight: [...document.querySelectorAll('span')].some(s => s.textContent.trim() === 'Tile height'),
  fallThrough: document.body.textContent.includes('Values fall through'),
}));
await p.evaluate(() => {
  [...document.querySelectorAll('[role="tablist"] button')]
    .find(b => b.textContent.trim() === '3')?.click();
});
await p.waitForTimeout(250);
r.pageSettings.setHere = await p.evaluate(() => document.body.textContent.includes('Set here'));
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Reset')?.click();
});
await p.waitForTimeout(250);
r.pageSettings.resetBack = await p.evaluate(() => document.body.textContent.includes('From workspace'));
/* leave the fixture as found: porch ships columns:1 */
await p.evaluate(() => {
  [...document.querySelectorAll('[role="tablist"] button')]
    .find(b => b.textContent.trim() === '1')?.click();
});
await p.waitForTimeout(200);
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Page settings')?.click();
});
await p.waitForTimeout(200);

// 12. PAGE ID is editable: rename porch → veranda, every ref walks
await p.evaluate(() => {
  const inp = [...document.querySelectorAll('input')].find(i => i.value === 'porch');
  inp.focus();
  inp.value = 'veranda';
  inp.dispatchEvent(new Event('change', { bubbles: true }));
});
await p.waitForTimeout(600);
await p.click('#saveBtn');
await p.waitForTimeout(400);
r.pageId = {
  renamed: postedConfig && !!postedConfig.screens.veranda && !postedConfig.screens.porch,
  home: postedConfig?.home_screen === 'veranda',
  roomView: postedConfig?.activities?.watch_firetv?.room_view === 'veranda',
  parent: postedConfig?.controllers?.tv?.parent === 'veranda',
  overviewTile: postedConfig?.screens?.overview?.sections?.[0]?.tiles?.[0]?.target === 'veranda',
  seqRoom: postedConfig?.sequences?.firetv_on?.room === 'veranda',
  /* the minted control page rode along with its cast generator */
  castPage: !!postedConfig?.screens?.veranda_watch_bluray?.sections?.some(
    s => (s.tiles || []).some(t => t.type === 'devices' && t.activity === 'veranda_watch_bluray')),
};

// 13. HOSTING IS INFERRED (v0.26): no Room-view toggle anywhere; a
//     fresh ＋ Add view page becomes a host (sticky room marker) the
//     moment it gets its first activity — select-worthy on save
r.hostInfer = { toggleGone: await p.evaluate(() =>
  !document.body.textContent.includes('Room view')) };
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(b => b.title?.startsWith('Create a free-standing'))?.click();
});
await p.waitForTimeout(500);
r.hostInfer.plainBorn = await p.evaluate(() => {
  const cfgInput = [...document.querySelectorAll('input')].find(i => i.value === 'new_view');
  return !!cfgInput;
});
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('Add activity'))?.click();
});
await p.waitForTimeout(500);
await p.click('#saveBtn');
await p.waitForTimeout(400);
r.hostInfer.stamped = {
  room: postedConfig?.screens?.new_view?.room === true,
  cls: postedConfig?.screens?.new_view?.class === 'room',
  owns: Object.values(postedConfig?.activities || {})
    .some(a => a.room_view === 'new_view'),
};

// 14. KEY BINDINGS (v0.28): the off activity dissolved into a
//     power_hold binding — the room shows it as a bindings row
//     (Run action → All Off); "Page functions" is gone everywhere
await navClick('Veranda');
await p.waitForTimeout(400);
/* key mappings live in the Page settings panel now (§6.4): open it */
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Page settings')?.click();
});
await p.waitForTimeout(200);
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .filter(b => b.textContent.trim().startsWith('Keys')).at(-1)?.click();
});
await p.waitForTimeout(300);
r.bindings = await p.evaluate(() => ({
  foldGone: !document.body.textContent.includes('Page functions'),
  keyRow: [...document.querySelectorAll('select')]
    .some(sel => sel.value === 'power_hold'),
  action: [...document.querySelectorAll('select')]
    .some(sel => sel.value === 'all_off'),
  addBtn: [...document.querySelectorAll('button')]
    .some(b => b.textContent.includes('Add key binding')),
  offActivityGone: ![...document.querySelectorAll('.font-semibold')]
    .some(el => el.textContent === 'All Off' && el.closest('#nav') === null &&
      el.parentElement?.textContent.includes('off')),
}));

// 14b. BLESSED SECTIONS (R2): the Presets switch — off keeps items,
//      stops rendering (preview loses the preset tiles), Save posts
//      enabled:false; back on restores everything
await navClick('Veranda');
await p.waitForTimeout(400);
const presetCount = () => fr.evaluate(() =>
  document.querySelectorAll('[id^="tile_p_"]').length);
r.secSwitch = { before: await presetCount() };
await p.evaluate(() => {
  document.querySelector('[data-sec="Presets"] [role="switch"]')?.click();
});
await p.waitForTimeout(700);
r.secSwitch.offPreview = await presetCount();
await p.click('#saveBtn');
await p.waitForTimeout(400);
r.secSwitch.posted = (postedConfig?.screens?.veranda?.sections || [])
  .some(sec => sec.enabled === false);
await p.evaluate(() => {
  document.querySelector('[data-sec="Presets"] [role="switch"]')?.click();
});
await p.waitForTimeout(700);
r.secSwitch.backOn = await presetCount();


// 15. WORKSPACES (v0.34): roster pills, per-workspace save routing,
//     the manager page, and create-from-starter
r.ws = { pills: await p.evaluate(() => ({
  main: document.getElementById('wsLive')?.textContent,
  den: document.getElementById('ws_den')?.textContent,
  /* v0.53: scratch is GONE — no pill, no manager row */
  scratchGone: !document.getElementById('wsScratch'),
})) };
await p.click('#ws_den');
await p.waitForTimeout(900);
const fr2 = p.frames().find(f => f.url().includes('/local/harmonium'));
r.ws.denPreview = await fr2.evaluate(() => ({ screen: S.screen, ws: WS }));
await p.click('#saveBtn');
await p.waitForTimeout(400);
r.ws.savedTo = postedWs;
r.ws.denPosted = postedConfig?.home_screen === 'den';
await navClick('Workspaces');
await p.waitForTimeout(400);
r.ws.manager = await p.evaluate(() => ({
  mainRow: document.body.textContent.includes('repo-built'),
  denEditing: document.body.textContent.includes('editing now'),
  scratchRowGone: !document.body.textContent.includes('this browser only'),
  createBtn: [...document.querySelectorAll('button')]
    .some(b => b.textContent.includes('Create & deploy')),
}));
await p.evaluate(() => {
  const inp = [...document.querySelectorAll('input')].find(i => i.placeholder === 'Bedroom');
  inp.value = 'Guest Room';
  inp.dispatchEvent(new Event('input', { bubbles: true }));
});
await p.waitForTimeout(200);
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create & deploy'))?.click();
});
await p.waitForTimeout(1000);
const created = wsPosts.find(x => x.action === 'create');
r.ws.created = {
  posted: !!created,
  hasConfig: !!created?.config?.screens,
  /* the stock library rides WITHOUT content-graph edges — a parent
     pointing at the old workspace's pages fails server validation
     ("unknown parent 'porch'", Suresh's first live create) */
  noStaleParents: Object.values(created?.config?.controllers || {})
    .every(c => !c.parent),
  librarySurvived: Object.keys(created?.config?.controllers || {}).length > 0,
  pillAppeared: await p.evaluate(() => !!document.getElementById('ws_guest_room')),
  nowEditing: await p.evaluate(() =>
    document.getElementById('ws_guest_room')?.className.includes('bg-accent')),
};

r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
