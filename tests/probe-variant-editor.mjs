/* CONTROLLER-VARIANT EDITOR fences (2026-09-04 QA round — Suresh's
   first controller variant):
   · B1 "shouldn't now playing offer me all the options … no variants
     are offered": a media tile's Draws-as switches live, and the
     Variant select offers the NP styles (blank = the activity's pick;
     the choice writes `style`, the engine's own field);
   · B3 "we should probably make the default (i.e. browser) preview,
     wider": a profile with no physical_dpad previews at 480×800
     instead of borrowing a handheld's 349px glass;
   · B5 "Remote can't be hidden, but t_btns2 doesn't seem to do
     anything": only/unless gates read out loud in the row subtitle;
   · Preview-as steers the preview to the fork and the editor stays
     open (the B4 report — with the engine's pending-goto belt). */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1400 } });
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
  ? r.fulfill({ json: config }) : r.fulfill({ json: { ok: true } }));
await ctx.route('**/api/harmonium/workspaces', r =>
  r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'x', path: '/x/' } } } }));
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: 'x' } }));
await ctx.route('**/api/states', r => r.fulfill({ json: [
  /* the fixture activity's context player, with real attributes —
     the live-pick token resolution reads them (2026-09-05: "$device
     attributes should load the relevant attributes of the preview
     device. Same for $context") */
  { entity_id: 'media_player.fire_tv_family_192_168_1_65', state: 'playing',
    attributes: { media_title: 'x', source_list: ['a'], volume_level: 0.4,
      friendly_name: 'Fire TV' } },
] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2500);

/* ---- B3: the browser profile previews wide ---- */
const vpOf = () => p.evaluate(() => {
  const f = document.querySelector('iframe');
  return f ? f.style.width + '×' + f.style.height : null;
});
ck('astrion previews at its measured glass (349×581)',
  (await vpOf()) === '349px×581px');
await p.evaluate(() => {
  const s = [...document.querySelectorAll('select')]
    .find(x => [...x.options].some(o => /astrion/i.test(o.textContent)));
  s.value = 'default';
  s.dispatchEvent(new Event('change', { bubbles: true }));
});
await p.waitForTimeout(900);
ck('the dpad-less default profile previews browser-wide (480×800)',
  (await vpOf()) === '480px×800px');

/* ---- fork the stock TV controller ---- */
await p.evaluate(() => {
  [...document.querySelectorAll('button, [role="button"], .item')]
    .find(x => x.textContent.includes('TV Media Player'))?.click();
});
await p.waitForTimeout(700);
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('Create custom copy'))?.click();
});
await p.waitForTimeout(900);
ck('fork exists (Custom copy banner)',
  await p.evaluate(() => document.body.textContent.includes('Custom copy')));

/* ---- Preview-as steers to the fork; the editor stays put ---- */
await p.evaluate(() => {
  const s = [...document.querySelectorAll('select')]
    .find(x => [...x.options].some(o => /preview as an activity/.test(o.textContent)));
  s.value = [...s.options].map(o => o.value).find(Boolean);
  s.dispatchEvent(new Event('change', { bubbles: true }));
});
await p.waitForTimeout(1500);
/* the title now wears the IMPERSONATED activity's name (2026-09-06,
   preview-as is the law — exactly as the live activity titles it), so
   the fence pins the intent directly: the preview's screen IS the
   fork, not the stock and not home */
ck('preview-as: the preview lands on the fork, not home',
  await p.frames().find(f => f.url().includes('local/harmonium/index.html'))
    .evaluate(() => typeof S !== 'undefined' && /^controller:/.test(S.screen || '') &&
      S.screen !== 'controller:tv' && /tv/.test(S.screen)));
ck('preview-as: the editor stays open',
  await p.evaluate(() => document.body.textContent.includes('Custom copy')));

/* ---- B5: gates read out loud ---- */
const txt = await p.evaluate(() => document.body.textContent);
ck('unless-gate subtitle ("hidden on remotes with physical_dpad")',
  txt.includes('hidden on remotes with physical_dpad'));
ck('only-gate subtitle ("shows only on remotes with physical_dpad")',
  txt.includes('shows only on remotes with physical_dpad'));

/* ---- B1: the NP row offers Draws-as AND the style variants ---- */
await p.evaluate(() => {
  [...document.querySelectorAll('button, [role="button"]')]
    .find(x => x.textContent.includes('Now Playing') && x.textContent.includes('media'))?.click();
});
await p.waitForTimeout(700);
const npVar = await p.evaluate(() => {
  const s = [...document.querySelectorAll('select')]
    .find(x => [...x.options].some(o => /Hero/.test(o.textContent)) &&
               [...x.options].some(o => /Slim/.test(o.textContent)));
  return s ? [...s.options].map(o => o.value) : null;
});
/* the $context.media_player token row reads the PREVIEW-AS pick —
   the attrs live in the ＋ token select's options */
ck('token row: $context resolves through the preview-as activity (media_title offered)',
  await p.evaluate(() =>
    [...document.querySelectorAll('select')].some(x =>
      [...x.options].some(o => o.value === 'media_title') &&
      [...x.options].some(o => o.value === 'source_list'))));
ck('NP style select offers plain/slim/wash/art/poster/hero + blank',
  !!npVar && ['', 'plain', 'slim', 'wash', 'art', 'poster', 'hero']
    .every(v => npVar.includes(v)));
const drawsOk = await p.evaluate(() => {
  const s = [...document.querySelectorAll('select')]
    .find(x => [...x.options].some(o => /Now Playing/.test(o.textContent)) &&
               [...x.options].some(o => /Transport/.test(o.textContent)));
  if (!s || s.value !== 'media') return 'bad-start:' + (s && s.value);
  s.value = 'transport';
  s.dispatchEvent(new Event('change', { bubbles: true }));
  return 'switched';
});
await p.waitForTimeout(600);
ck('NP draws-as switches (media → transport sticks)',
  drawsOk === 'switched' && await p.evaluate(() => {
    const s = [...document.querySelectorAll('select')]
      .find(x => [...x.options].some(o => /Transport/.test(o.textContent)) &&
                 [...x.options].some(o => /Launcher/.test(o.textContent)));
    return s && s.value === 'transport';
  }));

/* ---- the BLUE ⓘ on draws-itself widgets (2026-09-04 — Suresh:
   "Everywhere we do that we should have a blue info icon that pops
   up a description with an example (or two), that could be copy and
   pasted"): open the Remote (dpad) row — a context-drawn widget —
   and the primer must pop with paste-ready JSON ---- */
/* the control-target header carries its own ⓘ (same round), so the
   row's ⓘ is found by POSITION: open the Remote row until a second
   info button exists, then click the LAST one (tile rows render
   after the control-target block) */
for (let tries = 0; tries < 3; tries++) {
  await p.evaluate(() => {
    [...document.querySelectorAll('button, [role="button"]')]
      .find(x => x.textContent.includes('Remote') && x.textContent.includes('dpad'))?.click();
  });
  await p.waitForTimeout(600);
  const n = await p.evaluate(() =>
    [...document.querySelectorAll('button')].filter(x =>
      x.title && x.title.includes('copy-paste examples')).length);
  if (n >= 2) break;
}
ck('draws-itself row: the blue ⓘ is present', await p.evaluate(() =>
  [...document.querySelectorAll('button')].filter(x =>
    x.title && x.title.includes('copy-paste examples')).length >= 2));
await p.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
    .filter(x => x.title && x.title.includes('copy-paste examples'));
  btns[btns.length - 1]?.click();
});
await p.waitForTimeout(400);
const primer = await p.evaluate(() => {
  const t = document.body.textContent;
  return {
    title: t.includes('On-screen navigation pad'),
    example: t.includes('"type": "dpad"') && t.includes('$context.dpad'),
    copyBtn: [...document.querySelectorAll('button')].some(x => x.textContent.trim() === 'copy'),
  };
});
ck('ⓘ pops the primer with a copy-ready dpad example',
  primer.title && primer.example && primer.copyBtn);

/* ---- the VOLUMES BAND's Volume style (2026-09-05, feedback-2:
   "We used to have the proper DRAWS AS and VARIANT for Volume. Its
   gone") — fork the Music stock, open its Volume band row (friendly
   name, feedback-2: "lets use english names"), pick Stepper, and the
   variant lands on the band tile ---- */
await p.evaluate(() => {
  [...document.querySelectorAll('button, [role="button"], .item')]
    .find(x => x.textContent.includes('Music Media Player'))?.click();
});
await p.waitForTimeout(700);
await p.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('Create custom copy'))?.click();
});
await p.waitForTimeout(900);
await p.evaluate(() => {
  const cands = [...document.querySelectorAll('button, [role="button"]')]
    .filter(x => /Volume/.test(x.textContent) && /volumes/.test(x.textContent));
  cands.sort((a, b) => a.textContent.length - b.textContent.length);
  cands[0]?.click();
});
await p.waitForTimeout(600);
/* the row may need a second tap if the first landed mid-render */
if (!(await p.evaluate(() =>
  [...document.querySelectorAll('select')].some(x =>
    [...x.options].some(o => /Theme default/.test(o.textContent)))))) {
  await p.evaluate(() => {
    const cands = [...document.querySelectorAll('button, [role="button"]')]
      .filter(x => /Volume/.test(x.textContent) && /volumes/.test(x.textContent));
    cands.sort((a, b) => a.textContent.length - b.textContent.length);
    cands[0]?.click();
  });
  await p.waitForTimeout(600);
}
const volSel = await p.evaluate(() => {
  const s = [...document.querySelectorAll('select')]
    .find(x => [...x.options].some(o => /Theme default/.test(o.textContent)) &&
               [...x.options].some(o => /Stepper/.test(o.textContent)));
  if (!s) return { found: false };
  s.value = 'stepper';
  s.dispatchEvent(new Event('change', { bubbles: true }));
  return { found: true };
});
await p.waitForTimeout(800);
ck('volumes band: Volume style select present on the row', volSel.found);
ck('volumes band: the pick lands on the band tile (variant: stepper)',
  volSel.found && await p.evaluate(() => {
    try {
      const c = document.querySelector('iframe').contentWindow;
      return false; /* engine read below via frames API */
    } catch (e) { return false; }
  }) === false && await (async () => {
    const f = p.frames().find(x => x.url().includes('local/harmonium/index.html'));
    return f ? f.evaluate(() => {
      const cs = CONFIG.controllers || {};
      for (const k in cs) {
        if (!cs[k].variant_of) continue;
        const all = [...(cs[k].tiles || []),
          ...((cs[k].sections || []).flatMap(x => x.tiles || []))];
        if (all.some(t => t.type === 'volumes' && t.variant === 'stepper')) return true;
      }
      return false;
    }) : false;
  })());

console.log(JSON.stringify({ ok: !errs.length, errs }, null, 1));
await b.close();
process.exit(errs.length ? 1 : 0);
