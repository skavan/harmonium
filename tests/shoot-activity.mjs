import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
/* DOC MEDIA: screenshots for docs/cookbook/creating-an-activity.md.
   Real Studio (scratch build) + the CT fixture config (real
   watch_firetv activity, real cast) + stubbed HA states so the
   Inputs tab and pickers have live-looking material. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'media');
mkdirSync(OUT, { recursive: true });
const engine = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync(join(ROOT, 'dist', 'config.json'), 'utf8'));
const png = readFileSync(join(ROOT, 'skins', 'astrion.png'));

/* states: every entity any device claims, alive and answering */
const ents = new Set();
for (const d of Object.values(config.devices || {}))
  for (const e of Object.values(d.roles || {})) ents.add(e);
for (const a of Object.values(config.activities || {}))
  for (const e of [...(a.devices || []), ...(a.state?.entities || [])]) ents.add(e);
const states = [...ents].filter(e => e.includes('.')).map(e => ({
  entity_id: e,
  state: e.startsWith('media_player.') ? 'on' : 'on',
  attributes: {
    friendly_name: e.split('.')[1].replace(/_/g, ' '),
    ...(e.startsWith('media_player.') ? {
      source_list: ['Fire TV', 'Smart TV', 'HDMI 1', 'HDMI 2', 'Optical'],
      source: 'Fire TV', volume_level: 0.4,
    } : {}),
  },
}));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1400 }, deviceScaleFactor: 2 });
const errs = [];
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
  ? r.fulfill({ json: config })
  : r.fulfill({ json: { ok: true } }));
await ctx.route('**/api/harmonium/workspaces', r =>
  r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'config.json', path: '/local/harmonium/main/' } } } }));
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: '0.83.3' } }));
await ctx.route('**/api/states', r => r.fulfill({ json: states }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/skins/astrion.png*', r => r.fulfill({ body: png, contentType: 'image/png' }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));

const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('hakr_token', 'stub-token'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2200);

const nav = label => p.evaluate(l => {
  [...document.querySelectorAll('#nav .item')]
    .find(el => (el.querySelector('.truncate')?.textContent || el.textContent).trim().startsWith(l))?.click();
}, label);

/* the ActivityCard for watch_firetv lives on its owner page */
const room = Object.values(config.screens).find(s => s.room && Object.values(config.activities || {})
  .some(a => a.room_view && config.screens[a.room_view] === s));
const roomName = room?.name || 'Porch';
const actId = Object.entries(config.activities || {}).find(([, a]) => a.cast?.length)?.[0]
  || Object.keys(config.activities || {})[0];
const actName = config.activities[actId]?.name || actId;
console.log('room:', roomName, '· activity:', actId, `(${actName})`);

await nav(roomName);
await p.waitForTimeout(700);

/* find + open the activity card (CardRow header reads "▶ <name> <id>") */
const headerBtn = name => [...document.querySelectorAll('button')]
  .find(x => x.closest('#nav') === null && x.textContent.includes(name)
    && /^[▶▼]/.test(x.textContent.trim()) && x.textContent.length < 120);
const openCard = async () => {
  await p.evaluate(`(${headerBtn.toString()})(${JSON.stringify(actName)})?.click()`);
  await p.waitForTimeout(600);
};
/* 0. the page's Activities SECTION, cards closed, ＋ Add activity
      visible — the "where activities live" establishing shot */
const section = await p.evaluateHandle(`(() => {
  const add = [...document.querySelectorAll('button')]
    .find(x => x.textContent.trim() === '＋ Add activity');
  let el = add;
  while (el && !el.textContent.includes(${JSON.stringify(actName)}))
    el = el.parentElement;
  return el;
})()`);
if (section.asElement()) {
  await section.asElement().screenshot({ path: join(OUT, 'activity-section.png') });
  console.log('shot activity-section.png');
}

await openCard();

const card = () => p.evaluateHandle(`(() => {
  const btn = (${headerBtn.toString()})(${JSON.stringify(actName)});
  let el = btn;
  while (el && !(el.textContent.includes("Activity id") && el !== btn))
    el = el.parentElement;
  return el;
})()`);

async function shotCard(file) {
  const h = await card();
  const el = h.asElement();
  if (!el) { console.log('NO CARD for', file); return; }
  await el.screenshot({ path: join(OUT, file) });
  console.log('shot', file);
}
const tab = async label => {
  await p.evaluate(l => {
    /* tab text = optional dot + label + optional COUNT ("State 2") —
       strip both before matching, or counted tabs never click */
    [...document.querySelectorAll('button')]
      .find(x => x.textContent.trim().replace(/^[•●○\s]*/, '').replace(/\s*\d+$/, '') === l &&
        (x.className.includes('rounded-t') || x.className.includes('px-3.5')))?.click();
  }, label);
  await p.waitForTimeout(450);
};

/* 1. Setup tab (the card opens on it) */
await tab('Setup');
await shotCard('activity-setup.png');

/* 3. presentation ⚙ panel on the first cast row */
await p.evaluate(() => {
  [...document.querySelectorAll('button[title^="Presentation"]')][0]?.click();
});
await p.waitForTimeout(400);
await shotCard('activity-setup-pres.png');
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'done')?.click();
});
await p.waitForTimeout(300);

/* 4. the cast picker, open */
await p.evaluate(() => {
  const i = [...document.querySelectorAll('input')]
    .find(x => (x.placeholder || '').startsWith('cast a device'));
  i?.focus();
});
await p.waitForTimeout(500);
await p.screenshot({ path: join(OUT, 'activity-cast-picker.png'),
  clip: await p.evaluate(() => {
    const i = [...document.querySelectorAll('input')]
      .find(x => (x.placeholder || '').startsWith('cast a device'));
    const r = i.getBoundingClientRect();
    return { x: Math.max(0, r.x - 30), y: Math.max(0, r.y - 40),
      width: Math.min(r.width + 60, innerWidth), height: 420 };
  }) });
console.log('shot activity-cast-picker.png');
await p.keyboard.press('Escape');
await p.evaluate(() => document.activeElement?.blur());
await p.waitForTimeout(400);

/* 5-10. the other tabs */
for (const [label, file] of [
  ['Roles', 'activity-roles.png'],
  ['Inputs', 'activity-inputs.png'],
  ['Actions', 'activity-actions.png'],
  ['Controller', 'activity-controller.png'],
  ['State', 'activity-state.png'],
  ['Advanced', 'activity-advanced.png'],
]) { await tab(label); await shotCard(file); }

/* 11. the pre-wired device library, one device open — element crop */
await nav('Pre-wired Devices');
await p.waitForTimeout(700);
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button')]
    .find(x => x.closest('#nav') === null && /^[▶▼]/.test(x.textContent.trim())
      && /fire tv/i.test(x.textContent) && x.textContent.length < 80);
  btn?.click();
});
await p.waitForTimeout(600);
const devCard = await p.evaluateHandle(() => {
  const btn = [...document.querySelectorAll('button')]
    .find(x => x.closest('#nav') === null && /^[▶▼]/.test(x.textContent.trim())
      && /fire tv/i.test(x.textContent) && x.textContent.length < 80);
  let el = btn;
  while (el && !(el !== btn && el.textContent.includes('Device id')))
    el = el.parentElement;
  return el;
});
if (devCard.asElement()) {
  await devCard.asElement().screenshot({ path: join(OUT, 'activity-device-library.png') });
  console.log('shot activity-device-library.png');
} else console.log('NO DEVICE CARD');

console.log('errs', JSON.stringify(errs));
await b.close();
