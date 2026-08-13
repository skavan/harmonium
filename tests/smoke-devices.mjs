import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
/* DEVICE ROUND (v0.45): the healer (devices→remotes rename + lifting
   legacy contexts into cast/wiring), the device library editor, the
   tabbed activity builder (Setup·Devices·Jobs·Inputs·Actions·State
   with completion dots), compile parity (wiring → context), the
   Consumes strip, and generation (never-guess-power doctrine). */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const studio = readFileSync(
  join(ROOT, 'custom_components', 'harmonium', 'studio', 'studio.html'), 'utf8');
const engine = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8');

/* a PRE-v0.45 config: hardware profiles under `devices`, one legacy
   activity wired by raw context — the store-migration case */
const legacyCfg = {
  version: 2, theme: {}, entity_options: {},
  devices: { default: { capabilities: ['touch', 'pointer'] },
    astrion: { fully: true, capabilities: ['physical_dpad', 'touch'] } },
  keymap: {}, home_screen: 'porch', screen_order: ['porch'],
  global: { room: 'Porch', activity_select: 'select.harmonium_porch_activity' },
  input: {}, sequences: {}, apps: {}, app_classes: {
    firetv: { name: 'Fire TV', apps: {} } },
  controllers: { media: {
    name: 'Media Player', class: 'activity', view_kind: 'controller', type: 'controller',
    control_target: { label: '$activity.name', navigation: '$context.dpad',
      power: '$context.power', volume: '$context.volume' },
    sections: [{ tiles: [
      { id: 't_np', type: 'media', entity: '$context.media_player', span: 2 },
      { id: 't_vol', type: 'volume', entity: '$context.volume',
        level_entity: '$context.volume_level', span: 2 },
      { id: 't_src', type: 'sources', entity: '$context.source_select', span: 2 },
    ] }] } },
  activities: {
    watch_test: {
      name: 'Watch Test', room_view: 'porch', screen: 'controller:media',
      context: {
        media_player: 'media_player.porch_tv',
        dpad: 'remote.porch_tv',
        power: 'media_player.porch_tv',
        app_class: 'firetv',
      },
    },
  },
  screens: { porch: { name: 'Porch', type: 'hub', room: true,
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'porch' }] }] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
const r = {}; const errs = []; let postedConfig = null;

await ctx.route('**/api/harmonium/config*', route => {
  if (route.request().method() === 'POST') {
    postedConfig = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true, workspace: 'main', deployed: 'stub' } });
  }
  return route.fulfill({ json: legacyCfg });
});
await ctx.route('**/api/harmonium/workspaces', route =>
  route.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'config.json' } } } }));
await ctx.route('**/api/states', route => route.fulfill({ json: [
  { entity_id: 'media_player.porch_tv', state: 'on',
    attributes: { friendly_name: 'Porch TV', source_list: ['HDMI 1', 'Fire TV', 'TV/HDMI'] } },
  { entity_id: 'remote.porch_tv', state: 'on', attributes: { friendly_name: 'Porch TV Remote' } },
  { entity_id: 'media_player.porch_soundbar', state: 'on', attributes: { friendly_name: 'Soundbar' } },
  { entity_id: 'media_player.deck_proj', state: 'on', attributes: { friendly_name: 'Deck Projector' } },
  { entity_id: 'remote.deck_proj', state: 'on', attributes: { friendly_name: 'Deck Projector Remote' } },
  { entity_id: 'media_player.deck_proj_2', state: 'on', attributes: { friendly_name: 'Deck Projector ADB' } },
] }));
await ctx.route('**/local/harmonium/index.html*', route =>
  route.fulfill({ body: engine, contentType: 'text/html' }));
await ctx.route('**/harmonium-static/studio.html', route =>
  route.fulfill({ body: studio, contentType: 'text/html' }));

const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('hakr_token', 'stub-token'));
/* fake /api/websocket: auth handshake + entity registry with PLATFORMS —
   media_player.deck_proj_2 is androidtv (the ADB channel) and its NAME
   carries no _adb marker, so only the registry can identify it */
await p.addInitScript(() => {
  const REG = [
    { entity_id: 'media_player.porch_tv', platform: 'samsungtv_smart' },
    { entity_id: 'remote.porch_tv', platform: 'samsungtv_smart' },
    { entity_id: 'media_player.porch_soundbar', platform: 'sonos' },
    { entity_id: 'media_player.deck_proj', platform: 'androidtv_remote' },
    { entity_id: 'remote.deck_proj', platform: 'androidtv_remote' },
    { entity_id: 'media_player.deck_proj_2', platform: 'androidtv' },
  ];
  window.WebSocket = class {
    constructor() {
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 30);
    }
    send(m) {
      const msg = JSON.parse(m);
      if (msg.type === 'auth')
        setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_ok' }) }), 10);
      else if (msg.type === 'config/entity_registry/list')
        setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'result', id: msg.id, result: REG }) }), 10);
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/harmonium-static/studio.html');
await p.waitForTimeout(1500);

const navClick = label => p.evaluate(l => {
  [...document.querySelectorAll('#nav .item')]
    .find(el => (el.querySelector('.truncate')?.textContent || el.textContent).startsWith(l))?.click();
}, label);
const clickText = txt => p.evaluate(t => {
  [...document.querySelectorAll('button')]
    .find(b => b.textContent.trim() === t || b.textContent.trim().startsWith(t))?.click();
}, txt);
/* the builder's tab bar lives inside the open activity card */
const builderTab = name => p.evaluate(n => {
  [...document.querySelectorAll('button')]
    .filter(b => b.textContent.trim().endsWith(n) && b.closest('.space-y-4'))
    .forEach(b => b.click());
}, name);

// 1. THE HEALER: profiles moved devices→remotes; the legacy activity
//    lifted to cast/wiring (raw entities — no library yet); context
//    byte-preserved. Save immediately and read the POST.
await navClick('Porch');
await p.waitForTimeout(300);
await p.click('#saveBtn');
await p.waitForTimeout(400);
r.healer = {
  remotes: Object.keys(postedConfig?.remotes || {}).sort().join(','),
  devicesIsLib: JSON.stringify(postedConfig?.devices) === '{}',
  wiring: postedConfig?.activities?.watch_test?.wiring || null,
  castEmpty: (postedConfig?.activities?.watch_test?.cast || []).length === 0,
  ctxPreserved:
    postedConfig?.activities?.watch_test?.context?.media_player === 'media_player.porch_tv' &&
    postedConfig?.activities?.watch_test?.context?.dialect === 'firetv',   /* v0.46 migrated */
  dialectMigrated: !!postedConfig?.dialects?.firetv && !postedConfig?.app_classes,
  appClassOverride: postedConfig?.activities?.watch_test?.overrides?.dialect === 'firetv',
};

// 2. DEVICE LIBRARY: seed from an entity — siblings stem-matched,
//    claims prefilled by domain
await navClick('Pre-wired Devices');
await p.waitForTimeout(200);
await p.evaluate(() => {
  const inp = [...document.querySelectorAll('input')]
    .find(i => i.placeholder === 'pick any of its entities…');
  inp.focus();
  inp.value = 'media_player.porch_tv';
  inp.dispatchEvent(new Event('input', { bubbles: true }));
});
await p.waitForTimeout(150);
await p.evaluate(() => {
  const inp = [...document.querySelectorAll('input')]
    .find(i => i.placeholder === 'pick any of its entities…');
  inp.blur();   /* EntityPicker commits on blur */
});
await p.waitForTimeout(300);
r.library = await p.evaluate(() => {
  const body = document.body.textContent;
  return {
    card: body.includes('Porch Tv'),
    claims: [...document.querySelectorAll('input')]
      .filter(i => i.value === 'media_player.porch_tv').length >= 2, /* plays + power + … */
    dpadClaim: [...document.querySelectorAll('input')]
      .some(i => i.value === 'remote.porch_tv'),
  };
});
/* mark it never-off (the Fire TV doctrine) for the Actions test */
await p.evaluate(() => {
  [...document.querySelectorAll('label')]
    .find(l => l.textContent.includes('Never turn this off'))
    ?.querySelector('button')?.click();
});
await p.waitForTimeout(150);

// 3. THE BUILDER: open the activity — six tabs with completion dots
await navClick('Porch');
await p.waitForTimeout(250);
await p.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(b => b.textContent.includes('Watch Test'))?.click();
});
await p.waitForTimeout(250);
r.tabs = await p.evaluate(() => {
  const labels = ['Setup', 'Roles', 'Inputs', 'Actions', 'State'];
  const bar = [...document.querySelectorAll('button')].map(b => b.textContent.trim());
  return {
    all: labels.every(l => bar.some(t => t === l || t.startsWith(l))),
    advanced: bar.some(t => t.includes('Advanced')),
    dots: document.querySelectorAll('span[title="Done"], span[title="Not answered yet"]').length >= 4,
  };
});

// 4. CAST the library device; jobs prefill only UNCLAIMED roles (the
//    legacy raw-entity wiring stays — first come, first served)
/* v0.47: the cast lives on the (merged) Setup tab — the card opens there */
const castPick = async (q, label) => {
  await p.evaluate((query) => {
    const inp = [...document.querySelectorAll('input')]
      .find(i => i.placeholder === 'cast a device — or type any entity…');
    inp.focus();
    inp.value = query;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, q);
  await p.waitForTimeout(200);
  await p.evaluate((l) => {
    [...document.querySelectorAll('button')]
      .find(b => b.textContent.includes(l))
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  }, label);
  await p.waitForTimeout(250);
};
await castPick('porch', '⊞ Porch Tv');          /* library device */
r.cast = await p.evaluate(() => ({
  row: [...document.querySelectorAll('.font-semibold')].some(e => e.textContent === 'Porch Tv'),
  primary: document.body.textContent.includes('★ primary'),
}));
/* 4b. IMPLIED device: never defined — the picker mints ⊞ Deck Proj
   into the library and casts it in one gesture; its commands claim
   resolves by PLATFORM (deck_proj_2 = androidtv), not by name */
await castPick('deck', '⊞ Deck Proj');
r.implied = await p.evaluate(() => ({
  row: [...document.querySelectorAll('.font-semibold')].some(e => e.textContent === 'Deck Proj'),
  minted: document.body.textContent.includes('added to your library'),
}));

// 5. JOBS: wire volume to the device via the question select; the
//    compiled context follows (the JS twin of the python compiler)
await builderTab('Roles');
await p.waitForTimeout(150);
r.consumes = await p.evaluate(() => ({
  strip: document.body.textContent.includes('This controller consumes'),
  wired: [...document.querySelectorAll('span')].some(s => s.textContent.trim().startsWith('●') && s.textContent.includes('media_player')),
}));
await p.evaluate(() => {
  const row = [...document.querySelectorAll('span')]
    .find(s => s.textContent === 'Volume keys')?.closest('div');
  const sel = row?.querySelector('select');
  sel.value = 'porch_tv';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await p.waitForTimeout(200);

// 6. INPUTS: the sourced device asks its question; answer Fire TV
await builderTab('Inputs');
await p.waitForTimeout(150);
await p.evaluate(() => {
  const row = [...document.querySelectorAll('span')]
    .find(s => s.textContent === 'Porch Tv')?.parentElement;
  const sel = row?.querySelector('select');
  sel.value = 'Fire TV';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await p.waitForTimeout(200);

// 7. ACTIONS: never_off renders locked; generate start; the draft is a
//    real sequence wired to a.start
await builderTab('Actions');
await p.waitForTimeout(150);
r.neverOff = await p.evaluate(() =>
  document.body.textContent.includes('never off'));
await clickText('⚙ Start Action');
await p.waitForTimeout(250);

// 8. STATE: derive from the answers (display on + source in [Fire TV])
await builderTab('State');
await p.waitForTimeout(150);
await clickText('⚙ From inputs');
await p.waitForTimeout(200);

// 9. SAVE — the whole round-trip in one POST
await p.click('#saveBtn');
await p.waitForTimeout(400);
const act = postedConfig?.activities?.watch_test || {};
const seqs = postedConfig?.sequences || {};
const startSid = (act.start || '').startsWith('sequence:') ? act.start.slice(9) : null;
const gen = startSid ? seqs[startSid] : null;
const deckDev = postedConfig?.devices?.deck_proj || {};
r.saved = {
  cast: (act.cast || []).sort().join(','),
  deckMinted: !!postedConfig?.devices?.deck_proj,
  /* the registry fact beat the name: no _adb in the id, platform won */
  deckCommands: deckDev.roles?.commands === 'media_player.deck_proj_2',
  deckMedia: deckDev.roles?.media_player === 'media_player.deck_proj',
  deckDpad: deckDev.roles?.dpad === 'remote.deck_proj',
  volumeJob: act.wiring?.volume === 'porch_tv',
  volumeCompiled: act.context?.volume === 'media_player.porch_tv',
  legacyKept: act.wiring?.media_player === 'media_player.porch_tv' &&
    act.context?.media_player === 'media_player.porch_tv',
  input: act.inputs?.porch_tv === 'Fire TV',
  libSaved: !!postedConfig?.devices?.porch_tv &&
    postedConfig.devices.porch_tv.traits?.never_off === true,
};
r.generated = {
  linked: !!gen,
  firstStep: gen?.actions?.[0]?.action === 'harmonium.set_activity',
  inputStep: JSON.stringify(gen?.actions || []).includes('"source":"Fire TV"') ||
    JSON.stringify(gen?.actions || []).includes('"source": "Fire TV"'),
  /* never_off device + no wake trait → NO power action anywhere:
     power is never guessed */
  noPowerGuess: !JSON.stringify(gen?.actions || []).includes('turn_off'),
  sig: !!gen?.generated_sig,
};
r.state = {
  derived: act.state?.on?.all?.length === 2 &&
    JSON.stringify(act.state.on.all).includes('Fire TV') &&
    act.state.on.all[0].entity === 'media_player.porch_tv',
};

r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
