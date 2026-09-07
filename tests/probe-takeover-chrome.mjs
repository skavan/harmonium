/* DEVICE TAKEOVER fence (2026-09-04, design-device-takeover — the
   forum ask: "if I click on the Sony TV from the cast, all roles
   switch to the Sony TV"; Suresh's rulings: build it, and the wash
   is the ACTIVITY's accent — "this is a child of that activity").
   · a pre-wired device's generated detail page speaks the DEVICE:
     own_context beats the activity's overlay, the physical pad rides
     the device's dpad role through the passthrough gate, and the
     device's own dpad_commands are what the keys say;
   · the BACK/HOME strip appears and names the device;
   · the title bar wears the CURRENT ACTIVITY's accent wash on the
     device page (and only there — no activity accent, no wash);
   · an entity no device owns keeps the old page exactly: activity
     context, no strip, no wash. */
import { chromium } from 'playwright-core';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

const CONFIG = { version: 2, home_screen: 'p', screen_order: ['p'],
  global: { room: 'P', activity_select: 'select.act' },
  controllers: { apps: { name: 'Apps', drawer: true,
    tiles: [{ id: 'ag', type: 'apps' }] },
    /* CH in the authored pass-through (2026-09-05 — forum: "we
       actually use those for navigating the tv") */
    tvc: { name: 'TV Chan', class: 'activity', type: 'controller',
      control_target: { label: 'x', navigation: 'remote.samsung',
        pass_through: ['up', 'down', 'left', 'right', 'select',
          'ch_up', 'ch_down'] },
      tiles: [{ id: 'x1', type: 'device', entity: 'light.z', label: 'X' }] } },
  remotes: { default: { capabilities: ['physical_dpad', 'touch', 'pointer'] } },
  /* the activity carries a `controls` block AND an object-command
     dialect, LIKE HIS HOUSE — rounds 2 & 3 (2026-09-04): round 2,
     controlTarget() fell back to the activity's controls; round 3,
     "the activity fills gaps" let the activity's DIALECT leak onto
     the device page, and its object dpad_commands carry a HARDCODED
     foreign entity — the keys fired at the Fire TV with our target
     ignored. The fixture now carries both traps. */
  dialects: { ftv: { name: 'FTV', dpad_commands: {
    up: { service: 'androidtv.adb_command',
      entity: 'media_player.firetv', data: { command: 'sendevent up' } } },
    /* an app catalog per dialect — the drawer-serves-opener fences
       tell them apart by which app renders */
    wake: false,
    apps: { ftvapp: { name: 'FtvApp', service: 'media_player.select_source',
      entity: '$context.media_player', data: { source: 'ftvapp' } } } },
    tiz: { name: 'Samsung Tizen', wake: false,
      apps: { samapp: { name: 'SamApp', service: 'media_player.select_source',
        entity: '$context.media_player', data: { source: 'samapp' } } } } },
  activities: { watch: { name: 'Watch TV', accent: 'lg', room_view: 'p',
    controls: { navigation: 'remote.firetv',
      pass_through: ['up', 'down', 'left', 'right', 'select'] },
    /* the ⚙ Display name (2026-09-04 — "we should show whatever was
       set or ends up as the Display Name"): tops the chain */
    present: { samsung: { name: 'Big TV' } },
    context: { dpad: 'remote.firetv', media_player: 'media_player.firetv',
      volume: 'media_player.avr', dialect: 'ftv' } } },
  devices: {
    samsung: { name: 'Samsung Q90', dialect: 'tiz',
      roles: { dpad: 'remote.samsung', media_player: 'media_player.samsung',
        volume: 'media_player.samsung' },
      traits: { dpad_commands: { up: 'KEY_UP', select: 'KEY_ENTER',
        back: 'KEY_RETURN', home: 'KEY_HOME' } } },
    /* HIS porch Samsung: a device with a dpad role but NO dialect and
       NO key vocabulary of its own — the page must fall to the engine
       defaults on the DEVICE's target, never to the activity's voice */
    bare: { name: 'Bare Box', roles: { dpad: 'remote.barebox' } },
  },
  screens: {
    p: { name: 'P', type: 'hub',
      /* an app-level binding on the OPENER (menu → a page): the
         takeover page must inherit it — his Samsung-settings report */
      buttons: { menu: { navigate: 'menupage' } },
      tiles: [
        { id: 'd1', type: 'device', entity: 'media_player.samsung', label: 'TV' },
        { id: 'd2', type: 'device', entity: 'light.z', label: 'Lamp' }] },
    menupage: { name: 'Menu Page', type: 'hub', tiles: [
      { id: 'm1', type: 'device', entity: 'light.z', label: 'M' }] },
  } };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 349, height: 800 } })).newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await (p.context()).route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.__svc = []; window.__subs = [];
  window.WebSocket = class {
    constructor() { window.__ws = this;
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const g = JSON.parse(m);
      if (g.type === 'subscribe_entities') window.__subs.push(g);
      if (g.type === 'call_service') window.__svc.push(g);
      const r = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (g.type === 'auth') r({ type: 'auth_ok' });
      else r({ type: 'result', id: g.id, success: true, result: null }); }
    close() {}
  };
  window.__diff = (ents) => {
    for (const sub of window.__subs) {
      const c = {};
      for (const k in ents) c[k] = { '+': { s: ents[k].s, a: ents[k].a } };
      window.__ws.onmessage({ data: JSON.stringify({ type: 'event', id: sub.id,
        event: { a: {}, c } }) });
    }
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(800);
await p.evaluate(() => { CAPS = new Set(['physical_dpad', 'touch', 'pointer']); });
/* Watch TV is running */
await p.evaluate(() => window.__diff({ 'select.act': { s: 'watch', a: {} } }));
await p.waitForTimeout(300);

const chrome = () => p.evaluate(() => {
  const bar = document.getElementById('bar');
  return {
    strip: !document.getElementById('tvstrip').classList.contains('hidden'),
    name: document.getElementById('tvName').textContent,
    wash: bar.classList.contains('ptwash'),
    ptw: bar.style.getPropertyValue('--ptw'),
    bgi: getComputedStyle(bar).backgroundImage,
    title: screenOf(S.screen).name,
    vol: resolveEntity('$context.volume'),
    dpad: resolveEntity('$context.dpad'),
  };
});

/* ---- the hub: the activity answers, no takeover chrome ---- */
let c = await chrome();
ck('hub: the activity supplies $context (volume = AVR)', c.vol === 'media_player.avr');
ck('hub: no strip, no wash', !c.strip && !c.wash && c.bgi === 'none');

/* ---- the drawer opened from an ORDINARY page keeps the activity's
   voice — the new drawer law changes nothing here ---- */
await p.evaluate(() => navigate('controller:apps'));
await p.waitForTimeout(300);
ck("apps from the hub: the ACTIVITY's dialect answers",
  await p.evaluate(() => ctxFor(S.screen).dialect === 'ftv'));
ck("apps from the hub: the activity's catalog renders",
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('.tile')].map(x => x.textContent).join('|');
    return t.indexOf('FtvApp') >= 0 && t.indexOf('SamApp') < 0;
  }));
ck('apps from the hub: titled by the dialect — "FTV Apps"',
  await p.evaluate(() =>
    document.getElementById('screenName').textContent === 'FTV Apps'));
await p.evaluate(() => { S.stack = []; navigate('p', true); });
await p.waitForTimeout(300);

/* ---- the Samsung's page: the DEVICE answers everything ---- */
await p.evaluate(() => navigate('detail:media_player.samsung'));
await p.waitForTimeout(300);
c = await chrome();
ck("device page: titled by the DISPLAY NAME (the activity's ⚙ beats the library name)",
  c.title === 'Big TV');
ck('device page: the device beats the activity ($context.volume = the Samsung)',
  c.vol === 'media_player.samsung');
ck('device page: the pad rides the device dpad role', c.dpad === 'remote.samsung');
ck('device page: the strip is up', c.strip);
ck('device page: the strip wears the same display name', c.name === 'Big TV');
ck('device page: the bar wears the ACTIVITY accent wash (lg)',
  c.wash && c.ptw.indexOf('--id-lg-w') >= 0 && c.bgi.indexOf('gradient') >= 0);
ck('device page: POWER leads, slim Now Playing right below (2026-09-04: "The Now Playing should be below the Power button")',
  await p.evaluate(() => {
    const np = document.getElementById('tile_dnp');
    const pw = document.getElementById('tile_dp');
    return !!np && np.className.indexOf('wgt-media') >= 0 && !!pw &&
      pw.getBoundingClientRect().top < np.getBoundingClientRect().top;
  }));
ck("device page: the NP's trailing is the APPS drawer (his do-nothing Apps button)",
  await p.evaluate(() => {
    const tr = document.querySelector('#tile_dnp .trail');
    return !!tr;
  }));
/* tap the Apps trail — it must land on the drawer, and the drawer
   must serve the OPENER: the Samsung's dialect, the Samsung's apps,
   the dialect-named title (2026-09-04 — "it looks suspiciously like
   Fire TV Apps … would be better if said FireTV Apps or Samsung
   Apps") */
await p.evaluate(() => document.querySelector('#tile_dnp .trail').click());
await p.waitForTimeout(300);
ck('apps from the device page: the drawer opens', await p.evaluate(() =>
  S.screen === 'controller:apps'));
ck("apps from the device page: the drawer speaks the DEVICE's dialect",
  await p.evaluate(() => ctxFor(S.screen).dialect === 'tiz'));
ck("apps from the device page: the DEVICE's catalog renders (tizen app, no ftv app)",
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('.tile')].map(x => x.textContent).join('|');
    return t.indexOf('SamApp') >= 0 && t.indexOf('FtvApp') < 0;
  }));
ck('apps from the device page: titled by the dialect — "Samsung Tizen Apps"',
  await p.evaluate(() =>
    document.getElementById('screenName').textContent === 'Samsung Tizen Apps'));
/* back to the device page for the key fences below */
await p.evaluate(() => { S.stack = []; navigate('detail:media_player.samsung', true); });
await p.waitForTimeout(300);
/* the physical pad speaks the SAMSUNG's key language */
await p.evaluate(() => { window.__svc.length = 0;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' })); });
await p.waitForTimeout(250);
ck('device page: ArrowUp sends the device its OWN command (KEY_UP → remote.samsung)',
  await p.evaluate(() => window.__svc.some(s => s.domain === 'remote' &&
    s.service === 'send_command' && s.service_data &&
    s.service_data.command === 'KEY_UP' &&
    (s.target && s.target.entity_id) === 'remote.samsung')));
ck('device page: the activity controls NEVER intercept (nothing to the fire tv)',
  await p.evaluate(() => !window.__svc.some(s =>
    (s.target && s.target.entity_id) === 'remote.firetv')));
ck('device page: the activity DIALECT never leaks (no adb to its hardcoded entity)',
  await p.evaluate(() => !window.__svc.some(s =>
    s.domain === 'androidtv' ||
    (s.target && s.target.entity_id) === 'media_player.firetv')));

/* ---- HIS PORCH SHAPE (round 3): a bare device — dpad role, no
   dialect, no keys. The page must speak engine defaults on the
   DEVICE's target, never the activity's object-command voice. ---- */
await p.evaluate(() => { S.stack = []; navigate('detail:remote.barebox'); });
await p.waitForTimeout(300);
await p.evaluate(() => { window.__svc.length = 0;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' })); });
await p.waitForTimeout(250);
ck('bare device: ArrowUp = engine default UP to the DEVICE',
  await p.evaluate(() => window.__svc.some(s => s.domain === 'remote' &&
    s.service === 'send_command' && s.service_data &&
    s.service_data.command === 'UP' &&
    (s.target && s.target.entity_id) === 'remote.barebox')));
ck('bare device: the foreign dialect NEVER fires (his Fire TV bug)',
  await p.evaluate(() => !window.__svc.some(s => s.domain === 'androidtv' ||
    (s.target && s.target.entity_id) === 'media_player.firetv')));
ck('bare device: no ⚙ name set — the library name answers',
  await p.evaluate(() => document.getElementById('tvName').textContent === 'Bare Box'));

/* ---- the OPENER's app keys ride along (menu → its page, never
   the device's settings — his Samsung report) ---- */
await p.evaluate(() => { window.__svc.length = 0; S.stack = [];
  navigate('p'); navigate('detail:media_player.samsung'); });
await p.waitForTimeout(300);
await p.evaluate(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '#' })); });
await p.waitForTimeout(300);
ck("menu on the takeover page follows the OPENER's binding (navigates)",
  await p.evaluate(() => S.screen === 'menupage'));
ck('menu never reaches the device (no KEY_MENU to the samsung)',
  await p.evaluate(() => !window.__svc.some(s => s.service === 'send_command' &&
    s.service_data && s.service_data.command === 'KEY_MENU')));
await p.evaluate(() => { S.stack = []; navigate('p'); navigate('detail:media_player.samsung'); });
await p.waitForTimeout(250);

/* ---- §7's contract: tap Back/Home = the DEVICE, hold = Harmonium ---- */
await p.evaluate(() => { window.__svc.length = 0;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
await p.waitForTimeout(250);
ck('device page: tap-Back speaks the device (KEY_RETURN → remote.samsung)',
  await p.evaluate(() => window.__svc.some(s => s.service === 'send_command' &&
    s.service_data && s.service_data.command === 'KEY_RETURN' &&
    (s.target && s.target.entity_id) === 'remote.samsung')));
ck('device page: tap-Back does NOT navigate', await p.evaluate(() =>
  S.screen === 'detail:media_player.samsung'));
await p.evaluate(() => { window.__svc.length = 0;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: ']' })); });
await p.waitForTimeout(250);
ck('device page: tap-Home speaks the device (KEY_HOME → remote.samsung)',
  await p.evaluate(() => window.__svc.some(s => s.service === 'send_command' &&
    s.service_data && s.service_data.command === 'KEY_HOME')));
await p.evaluate(() => { window.__svc.length = 0;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '{' })); });
await p.waitForTimeout(250);
ck('device page: HOLD-Back is Harmonium — navigates out, no device key',
  await p.evaluate(() => S.screen === 'p' &&
    !window.__svc.some(s => s.service === 'send_command')));
await p.evaluate(() => navigate('detail:media_player.samsung'));
await p.waitForTimeout(250);

/* ---- an entity NO device owns: the old page, untouched ---- */
await p.evaluate(() => { S.stack = []; navigate('detail:light.z'); });
await p.waitForTimeout(300);
c = await chrome();
ck('unowned entity: activity context still wins (volume = AVR)',
  c.vol === 'media_player.avr');
ck('unowned entity: no strip, no wash', !c.strip && !c.wash && c.bgi === 'none');

/* ---- no current activity: keys stay the device's, wash goes ---- */
await p.evaluate(() => window.__diff({ 'select.act': { s: 'off', a: {} } }));
await p.evaluate(() => { S.stack = []; navigate('detail:media_player.samsung'); });
await p.waitForTimeout(300);
c = await chrome();
ck('no activity: the device page still takes the keys', c.strip && c.name === 'Samsung Q90');
ck('no activity: no accent to wear — no wash', !c.wash && c.bgi === 'none');

/* ---- leaving resets the chrome ---- */
await p.evaluate(() => { S.stack = []; navigate('p'); });
await p.waitForTimeout(300);
c = await chrome();
ck('back on the hub: wordmark resets, strip down, wash off',
  c.name === 'Harmonium' && !c.strip && !c.wash);

/* ---- CH IN THE PASS-THROUGH (2026-09-05 — forum: "we actually use
   those for navigating the tv"; Suresh's flow: add ChUp/ChDn to
   KEYS PASSED TO THE DEVICE): an authored ch_up/ch_down in the
   pass-through routes CH to the device like the tuner flag — and
   the generated takeover page, which deliberately does NOT pass CH,
   keeps CH as the panel's walk. ---- */
await p.evaluate(() => window.__diff({ 'select.act': { s: 'watch', a: {} } }));
await p.evaluate(() => { S.stack = []; navigate('controller:tvc', true); });
await p.waitForTimeout(300);
await p.evaluate(() => { window.__svc.length = 0;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp' })); });
await p.waitForTimeout(250);
ck('authored CH pass-through: ch_up reaches the DEVICE (CHANNEL_UP)',
  await p.evaluate(() => window.__svc.some(s => s.domain === 'remote' &&
    s.service === 'send_command' && s.service_data &&
    s.service_data.command === 'CHANNEL_UP' &&
    (s.target && s.target.entity_id) === 'remote.samsung')));
await p.evaluate(() => { S.stack = []; navigate('detail:media_player.samsung', true); });
await p.waitForTimeout(300);
await p.evaluate(() => { window.__svc.length = 0;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp' })); });
await p.waitForTimeout(250);
ck('takeover page: CH stays the panel walk (never auto-passed)',
  await p.evaluate(() => !window.__svc.some(s =>
    s.service_data && /^CHANNEL_/.test(s.service_data.command || ''))));

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
