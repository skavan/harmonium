/* UPGRADE AUDIT fence (2026-09-06 — Suresh: "I'm a bit worried users
   will get left behind… Do you think, upon an upgrade they should get
   an audit report?"; design-upgrade-audit.md "never overwrite, always
   disclose"). The laws under test:
   · a version change WITH findings → one quiet banner naming the
     pair, expandable to findings with their doors;
   · a fork the built-in moved past gets a Recommendation and an
     open-it door into its editor;
   · behavior lines (hand-written per release) render separated;
   · dismiss hides it and rides the draft — Save & Deploy carries
     dismissed: true and the new version stamp;
   · a config with NO stamp gets the stamp written and NO report (a
     first audit about nothing trains people to dismiss);
   · same version = nothing at all. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const baseCfg = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function studioWith(config, integration) {
  const ctx = await b.newContext({ viewport: { width: 1680, height: 1400 } });
  const state = { posted: null };
  await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
    ? r.fulfill({ json: config })
    : (state.posted = r.request().postDataJSON(), r.fulfill({ json: { ok: true } })));
  await ctx.route('**/api/harmonium/workspaces', r =>
    r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'x', path: '/x/' } } } }));
  await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
  await ctx.route('**/api/harmonium/engine_version', r =>
    r.fulfill({ json: { integration, v: 'x' } }));
  await ctx.route('**/api/states', r => r.fulfill({ json: [] }));
  await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
  await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
  await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 140)));
  await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
  await p.goto('http://localhost:8482/harmonium-static/studio.html');
  await p.waitForTimeout(2200);
  return { ctx, p, state };
}
const body = (p) => p.evaluate(() => document.body.textContent.replace(/\s+/g, ' '));
const save = async (p) => {
  await p.evaluate(() => {
    [...document.querySelectorAll('button')].find(x => x.textContent.includes('Save & Deploy'))?.click();
  });
  await p.waitForTimeout(900);
};

/* ---- 1: upgraded config with a behind fork → banner + doors ---- */
{
  const cfg = JSON.parse(JSON.stringify(baseCfg));
  cfg.last_audited_version = '0.86.0';
  cfg.controllers.media_player__old = { name: 'My TV Page',
    variant_of: 'media_player', domain: 'media_player',
    entity: 'media_player.sts_samsung_q90_porch',
    forked_by_update: { from_gen: 1, stock_gen: 1 },
    tiles: [{ id: 'dp', type: 'power', entity: '$device', span: 2 }] };
  const { ctx, p, state } = await studioWith(cfg, '0.87.0');
  let t = await body(p);
  ck('banner: names the version pair', /Upgraded 0\.86\.0 → 0\.87\.0/.test(t));
  ck('banner: counts the findings', /thing(s)? worth a look/.test(t));
  await p.evaluate(() => {
    [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'show me')?.click();
  });
  await p.waitForTimeout(300);
  t = await body(p);
  ck('panel: the behind fork gets a Recommendation',
    t.includes('My TV Page') && t.includes('Recommendation'));
  ck('panel: gen arithmetic said out loud', /made from v1/.test(t) &&
    /moved to v2/.test(t));
  ck('panel: behavior lines render separated',
    t.includes('What changed in behavior') &&
    t.includes('speaks THAT device'));
  /* the door: open it → lands in the fork's editor */
  await p.evaluate(() => {
    [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'open it →')?.click();
  });
  await p.waitForTimeout(500);
  t = await body(p);
  ck('door: open-it lands in the fork\'s editor', t.includes('My TV Page'));
  /* dismiss + save: the stamp and the dismissal persist */
  await p.evaluate(() => {
    [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'dismiss')?.click();
  });
  await p.waitForTimeout(300);
  t = await body(p);
  ck('dismiss: the banner is gone', !/worth a look/.test(t));
  await save(p);
  ck('save: the new version stamp rides', state.posted?.last_audited_version === '0.87.0');
  ck('save: dismissed rides too', state.posted?.audit?.dismissed === true);
  await ctx.close();
}

/* ---- 2: no stamp yet → stamp written, NO report ---- */
{
  const cfg = JSON.parse(JSON.stringify(baseCfg));
  delete cfg.last_audited_version;
  const { ctx, p, state } = await studioWith(cfg, '0.87.0');
  const t = await body(p);
  ck('first sight: no report about nothing', !/worth a look/.test(t));
  await save(p);
  ck('first sight: the stamp is written on save',
    state.posted?.last_audited_version === '0.87.0');
  ck('first sight: no audit object', !('audit' in (state.posted || {})));
  await ctx.close();
}

/* ---- 3: same version → nothing at all ---- */
{
  const cfg = JSON.parse(JSON.stringify(baseCfg));
  cfg.last_audited_version = '0.87.0';
  const { ctx, p } = await studioWith(cfg, '0.87.0');
  const t = await body(p);
  ck('same version: silence', !/worth a look/.test(t));
  await ctx.close();
}

console.log(JSON.stringify({ ok: !errs.length, errs }, null, 1));
await b.close();
process.exit(errs.length ? 1 : 0);
