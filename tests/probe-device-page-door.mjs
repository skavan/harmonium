/* THE DEVICE-PAGE DOOR fences (2026-09-04, Media Device round 2 —
   Suresh: "if someone wants to edit it and have the Porch Q90 look
   different — how do they assign that? This is the tricky bit. We
   have devices in a lot of places."):
   · a pre-wired device's card (Pre-wired Devices) states which page
     it opens and offers ⧉ Customize its page;
   · the door creates the per-device copy and, on return, flips to
     "its own custom copy" + ✎ Edit its page;
   · the DOMAIN stock editor previews A DEVICE, not an activity —
     entities claimed by pre-wired devices lead the list, labeled;
   · picking one steers the preview to that device's page;
   · a domain stock offers NO "Duplicate variant" (an unbound
     duplicate is unreachable — the per-device copy is the fork);
   · the copy picker reads as live (the "choose a device" cue). */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
/* the ARC split (2026-09-05 drift round): the Samsung's volume readout
   lives on the soundbar — the per-device copy must BAKE this wiring
   so the config says what renders */
config.devices.samsung_q90.roles.volume_level = 'media_player.ma_soundbar_porch';
const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1600 } });
await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
  ? r.fulfill({ json: config }) : r.fulfill({ json: { ok: true } }));
await ctx.route('**/api/harmonium/workspaces', r =>
  r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'x', path: '/x/' } } } }));
await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: 'x' } }));
await ctx.route('**/api/states', r => r.fulfill({ json: [
  /* a junk player FIRST — the panel's own Fully entity, his field
     confusion: sourceless, unowned. The wired ones must outrank it. */
  { entity_id: 'media_player.wall_panel', attributes: { friendly_name: 'Wall Panel' } },
  { entity_id: 'media_player.sts_samsung_q90_porch', attributes: { friendly_name: 'Samsung Q90' } },
  { entity_id: 'media_player.fire_tv_stick', attributes: { friendly_name: 'Fire TV' } },
] }));
await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(2500);

const click = (fn) => p.evaluate(fn);
const openSamsungCard = async () => {
  await click(() => {
    [...document.querySelectorAll('button, [role="button"]')]
      .find(x => x.textContent.includes('Pre-wired Devices'))?.click();
  });
  await p.waitForTimeout(600);
  await click(() => {
    [...document.querySelectorAll('button, [role="button"]')]
      .filter(x => /Samsung/i.test(x.textContent) && /claims/.test(x.textContent))[0]?.click();
  });
  await p.waitForTimeout(500);
};

/* ---- the door, before any copy exists (round 3: a SELECT, not a
   lone Customize — his "it only shows Customize its page, not
   select one") ---- */
await openSamsungCard();
let t = await p.evaluate(() => document.body.textContent);
ck('device card: "Its page" strip present', t.includes('Its page'));
ck('device card: says it uses the shared stock page',
  t.includes('the shared stock Media Device page'));
ck('device card: offers ⧉ New copy for this device', await p.evaluate(() =>
  [...document.querySelectorAll('button')].some(x => x.textContent.includes('New copy for this device'))));

/* ---- through the door: a per-device copy, selected ---- */
await click(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('New copy for this device'))?.click();
});
await p.waitForTimeout(900);
t = await p.evaluate(() => document.body.textContent);
ck('door: lands in a Custom copy editor for the device',
  t.includes('Custom copy') && t.includes('sts_samsung_q90_porch'));
ck('door: the copy editor offers ⟶ Show <entity>', await p.evaluate(() =>
  [...document.querySelectorAll('button')].some(x => x.textContent.includes('Show media_player.sts'))));
/* round 3: the copy editor's preview is NOT locked to its entity */
ck('copy editor: offers "preview another device"', await p.evaluate(() =>
  [...document.querySelectorAll('input')].some(x =>
    /preview another device/.test(x.placeholder || ''))));
/* the drift fix (2026-09-05 — "Volume shows stepper in config, but
   compact (correct) in ui"): the copy BAKES the device's ARC split
   at creation — canonical variant, level_entity, $device kept */
ck('door copy: the ARC split is BAKED into the copy (config = truth)',
  await p.frames().find(f => f.url().includes('local/harmonium/index.html'))
    .evaluate(() => {
      const c = CONFIG.controllers.media_player__sts_samsung_q90_porch;
      const t = c && (c.tiles || []).filter(x => x.id === 'ds')[0];
      return !!(t && t.type === 'volume' && t.variant === 'compact' &&
        t.level_entity === 'media_player.ma_soundbar_porch' &&
        t.entity === '$device' && !t.kind);
    }));

/* the drift fix, editor side (2026-09-05 — "We've lost the source
   picker DRAWS AS and VARIANT… We have it activity>custom but not in
   device>Custom"): the copy's working-spelled {type:"chips",
   kind:"source"} row reads as the SOURCES adapter — Draws-as
   offered, Variant honestly reads Chips — and a variant write heals
   the spelling to canonical (the engine's compat reader renders it
   identically). */
await click(() => {
  [...document.querySelectorAll('button')]
    .filter(x => x.textContent.trim().startsWith('▶') &&
      x.textContent.includes('Source picker'))
    .sort((x, y) => x.textContent.length - y.textContent.length)[0]?.click();
});
await p.waitForTimeout(500);
const srcSelects = () => p.evaluate(() => {
  const sels = [...document.querySelectorAll('select')];
  const va = sels.find(s => [...s.options].some(o => o.textContent === 'Chips') &&
    [...s.options].some(o => o.textContent === 'Cycle'));
  const da = sels.find(s => [...s.options].some(o => o.textContent === 'Source picker') &&
    [...s.options].some(o => o.textContent === 'Now Playing'));
  return { variant: va ? va.value : null, drawsAs: da ? da.value : null };
});
let srcSel = await srcSelects();
ck('copy editor: Source picker row offers Draws-as (reads sources)',
  srcSel.drawsAs === 'sources');
ck('copy editor: its Variant reads Chips (the working spelling, honestly)',
  srcSel.variant === 'chips');
await p.evaluate(() => {
  const sels = [...document.querySelectorAll('select')];
  const va = sels.find(s => [...s.options].some(o => o.textContent === 'Chips') &&
    [...s.options].some(o => o.textContent === 'Cycle'));
  if (va) { va.value = 'picker'; va.dispatchEvent(new Event('change', { bubbles: true })); }
});
await p.waitForTimeout(800);
ck('copy editor: a Variant write heals the spelling to canonical sources',
  await p.frames().find(f => f.url().includes('local/harmonium/index.html'))
    .evaluate(() => {
      const c = CONFIG.controllers.media_player__sts_samsung_q90_porch;
      const t = c && (c.tiles || []).filter(x => x.id === 'dsrc')[0];
      return !!(t && t.type === 'sources' && t.variant === 'picker' && !t.kind);
    }));
/* back to chips — leave the copy as the door minted it */
await p.evaluate(() => {
  const sels = [...document.querySelectorAll('select')];
  const va = sels.find(s => [...s.options].some(o => o.textContent === 'Chips') &&
    [...s.options].some(o => o.textContent === 'Cycle'));
  if (va) { va.value = 'chips'; va.dispatchEvent(new Event('change', { bubbles: true })); }
});
await p.waitForTimeout(400);

/* ---- back on the card: the door knows the copy, and the SELECT
   can pin the stock — the assignment lands on the device ---- */
await openSamsungCard();
t = await p.evaluate(() => document.body.textContent);
ck('device card after copy: Auto reads "its own copy"', t.includes('Auto — its own copy'));
ck('device card after copy: offers ✎ Edit its page', await p.evaluate(() =>
  [...document.querySelectorAll('button')].some(x => x.textContent.includes('Edit its page'))));
await click(() => {
  const s = [...document.querySelectorAll('select')]
    .find(x => [...x.options].some(o => /^Stock — /.test(o.textContent)));
  if (s) { s.value = 'media_player'; s.dispatchEvent(new Event('change', { bubbles: true })); }
});
await p.waitForTimeout(900);
const engFrame = () => p.frames().find(f => f.url().includes('local/harmonium/index.html'));
ck('device card: pinning the stock writes page onto the DEVICE (reaches the preview)',
  await engFrame().evaluate(() =>
    CONFIG.devices.samsung_q90 && CONFIG.devices.samsung_q90.page === 'media_player'));
await click(() => {   /* back to Auto — leave the fixture clean */
  const s = [...document.querySelectorAll('select')]
    .find(x => [...x.options].some(o => /^Stock — /.test(o.textContent)));
  if (s) { s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); }
});
await p.waitForTimeout(600);

/* ---- the door on a PAGE's device tile (round 3: "a page's device
   page") ---- */
await click(() => {
  [...document.querySelectorAll('button, [role="button"]')]
    .find(x => /^P?Porch/.test(x.textContent.trim()) && /activities/.test(x.textContent))?.click();
});
await p.waitForTimeout(700);
await click(() => {
  [...document.querySelectorAll('button, [role="button"]')]
    .find(x => x.textContent.includes('dev_tv') || (/device/.test(x.textContent) && /sts_samsung/.test(x.textContent)))?.click();
});
await p.waitForTimeout(600);
ck('page device tile: the same door renders on the tile row',
  await p.evaluate(() => document.body.textContent.includes('Its page')));

/* ---- the domain stock editor ---- */
await click(() => {
  [...document.querySelectorAll('button, [role="button"]')]
    .find(x => /stock device page/.test(x.textContent))?.click();
});
await p.waitForTimeout(500);
await click(() => {
  [...document.querySelectorAll('button, [role="button"], .item')]
    .filter(x => x.textContent.includes('Media Device') && x.textContent.includes('stock'))
    .slice(-1)[0]?.click();
});
await p.waitForTimeout(700);
/* the banner pick is the COMBOBOX now (2026-09-05 — his side-by-side:
   "img1 is a better picker") — open it and read the rows */
await p.evaluate(() => {
  const inp = [...document.querySelectorAll('input')]
    .find(x => /pick a .* type to search/.test(x.placeholder || ''));
  inp && inp.focus();
});
await p.waitForTimeout(400);
const stock = await p.evaluate(() => {
  const inp = [...document.querySelectorAll('input')]
    .find(x => /pick a .* type to search/.test(x.placeholder || ''));
  const rows = [...document.querySelectorAll('button')]
    .filter(x => /media_player\./.test(x.textContent))
    .map(x => x.textContent.replace(/\s+/g, ' ').trim());
  return {
    combo: !!inp,
    rows: rows.slice(0, 6),
    prewiredChip: rows.length > 0 && /pre-wired/i.test(rows[0]),
    pinnedHeading: document.body.textContent.includes('Pre-wired devices'),
    dupVariant: [...document.querySelectorAll('button')].some(x => x.textContent.includes('Duplicate variant')),
    createBtn: [...document.querySelectorAll('button')].some(x => x.textContent.includes('Create custom copy')),
  };
});
await p.evaluate(() => document.activeElement && document.activeElement.blur());
await p.waitForTimeout(300);
ck('stock editor: the banner pick is the combobox', stock.combo);
ck('stock editor: pre-wired devices pinned + chipped — got ' + JSON.stringify(stock.rows),
  stock.pinnedHeading && stock.prewiredChip);
ck('stock editor: no Duplicate variant on a domain stock', !stock.dupVariant);
ck('stock editor: the Create-custom-copy door is in the banner', stock.createBtn);
/* pick a device → the preview opens its page (combobox row tap) */
await click(() => {
  const inp = [...document.querySelectorAll('input')]
    .find(x => /pick a .* type to search/.test(x.placeholder || ''));
  inp && inp.focus();
});
await p.waitForTimeout(400);
await click(() => {
  const row = [...document.querySelectorAll('button')]
    .find(x => x.textContent.includes('media_player.fire_tv_stick'));
  row && row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
});
await p.waitForTimeout(800);
ck('stock editor: picking a device steers the preview to its page',
  await p.evaluate(() => {
    try {
      return /Fire TV/i.test(document.querySelector('iframe').contentWindow
        .document.getElementById('screenName').textContent);
    } catch (e) { return false; }
  }));
/* THE CONTROL-TARGET PANEL TELLS THE TRUTH (2026-09-06 — Suresh's
   inversion: the panel said "physical keys drive the app" while the
   preview showed BACK | HOME). A device page's target comes from the
   device it's shown for; the panel says so and reads the previewed
   device — fire_tv has a D-pad role, so the keys drive it. */
{
  const body = await p.evaluate(() => document.body.textContent.replace(/\s+/g, ' '));
  /* the DEVICE flag, both places (his #1): the tree tags device
     pages $device; the edit page says which kind it is */
  ck('device flag: the controllers tree tags Media Device with $device', await p.evaluate(() =>
    [...document.querySelectorAll('#nav .item')].some(x =>
      x.textContent.includes('Media Device') && x.textContent.includes('$device'))));
  ck('device flag: the edit page says Device page', await p.evaluate(() =>
    !!document.querySelector('[data-ctrl-kind="device"]') &&
    document.body.textContent.includes('Device page')));
  ck('control target panel: a device page says its target comes FROM THE DEVICE',
    body.includes('From the device.') && !body.includes('No control target — physical keys drive the app'));
  const readLine = () => p.evaluate(() =>
    (document.querySelector('[data-pvkeys]')?.textContent || '').replace(/\s+/g, ' '));
  /* fire_tv_stick is a LOOSE entity here (no pre-wired device owns
     it) — no D-pad role to derive from, so the keys stay with the app
     and the preview shows no strip: the panel must say exactly that */
  const loose = await readLine();
  ck('control target panel: a loose entity — keys stay with the app',
    /Previewing/.test(loose) && /loose entity/.test(loose) && /stay with the app/.test(loose));
  /* now the pre-wired Fire TV (a D-pad role) — the keys drive it */
  await click(() => {
    const inp = [...document.querySelectorAll('input')]
      .find(x => /pick a .* type to search/.test(x.placeholder || ''));
    inp && inp.focus();
  });
  await p.waitForTimeout(400);
  await click(() => {
    const row = [...document.querySelectorAll('button')]
      .find(x => x.textContent.includes('media_player.fire_tv_family'));
    row && row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await p.waitForTimeout(800);
  const wired = await readLine();
  ck('control target panel: a pre-wired D-pad device drives the keys (matches the strip)',
    /Previewing .*Fire TV/.test(wired) && /physical keys drive the device/.test(wired) &&
    wired.includes('remote.fire_tv_family'));
}

/* ---- THE TEMPLATE (2026-09-05, feedback-1: a stock-editor copy is
   "a custom copy for any compatible device", named "Custom Media
   Device 01", previewed through a LENT device). The banner pick made
   BEFORE Create rides into the new editor (feedback-2 #4: "it blanks
   my Preview Selection … I cant see what I chose"). ---- */
await click(() => {
  const inp = [...document.querySelectorAll('input')]
    .find(x => /pick a .* type to search/.test(x.placeholder || ''));
  inp && inp.focus();
});
await p.waitForTimeout(400);
await click(() => {
  const row = [...document.querySelectorAll('button')]
    .find(x => x.textContent.includes('media_player.sts_samsung_q90_porch'));
  row && row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
});
await p.waitForTimeout(300);
await click(() => {
  [...document.querySelectorAll('button')].find(x => x.textContent.includes('Create custom copy'))?.click();
});
await p.waitForTimeout(1100);
/* the seed is VISIBLE and live in the template editor's combobox */
ck('template: the banner pick rides in as the visible preview pick',
  await p.evaluate(() =>
    [...document.querySelectorAll('input')].some(x =>
      /preview with a device/.test(x.placeholder || '') &&
      x.value === 'media_player.sts_samsung_q90_porch')));
const tpl = await p.evaluate(() => {
  const t = document.body.textContent;
  const nameInp = [...document.querySelectorAll('input')].find(x => x.value && /Custom Media Device/.test(x.value));
  return {
    named: !!nameInp && /Custom Media Device 0\d/.test(nameInp.value),
    unbound: !/— for\s*media_player\./.test(t.replace(/\s+/g, ' ')),
    lentSelect: [...document.querySelectorAll('input')].some(x =>
      /preview with a device/.test(x.placeholder || '')),
  };
});
ck('template: named Custom Media Device NN (never the device)', tpl.named);
ck('template: offers "preview with a device"', tpl.lentSelect);
await click(() => {
  const inp = [...document.querySelectorAll('input')]
    .find(x => /preview with a device/.test(x.placeholder || ''));
  inp && inp.focus();
});
await p.waitForTimeout(400);
await click(() => {
  const row = [...document.querySelectorAll('button')]
    .find(x => x.textContent.includes('media_player.fire_tv_stick'));
  row && row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
});
await p.waitForTimeout(900);
ck('template: the lent device binds $device in the preview',
  await engFrame().evaluate(() => {
    const sc = screenOf(S.screen);
    const j = JSON.stringify(sc || {});
    return S.screen.indexOf('controller:media_player_custom') === 0 &&
      j.indexOf('"$device"') < 0 && j.indexOf('media_player.fire_tv_stick') >= 0;
  }));

console.log(JSON.stringify({ ok: !errs.length, errs }, null, 1));
await b.close();
process.exit(errs.length ? 1 : 0);
