import { chromium } from 'playwright-core';
/* Studio preview handshake: config injection, live re-injection, and
   synthetic key delivery — all over same-origin postMessage. */
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const r = {}; const errs = [];

const p = await (await b.newContext({ viewport: { width: 900, height: 700 } })).newPage();
p.on('pageerror', e => errs.push(e.message));

// host page embedding the engine as the Studio would
await p.goto('http://localhost:8482/config.json'); // establish origin (script-free page)
await p.setContent(`
  <iframe id="pv" src="http://localhost:8482/index.html#preview=1"
          style="width:320px;height:533px"></iframe>
  <script>
    window._msgs = [];
    window.addEventListener('message', e => window._msgs.push(e.data));
    window.sendCfg = cfg => document.getElementById('pv').contentWindow
      .postMessage({ type: 'harmonium_config', config: cfg }, '*');
    window.sendKey = k => document.getElementById('pv').contentWindow
      .postMessage({ type: 'harmonium_key', key: k }, '*');
  </script>`);
await p.waitForTimeout(900);

// 1. engine announces readiness and waits (no config fetch)
r.ready = await p.evaluate(() => window._msgs.some(m => m && m.type === 'harmonium_ready'));
r.waiting = await p.evaluate(() =>
  document.getElementById('pv').contentDocument.getElementById('screenName').textContent);

// minimal draft config
const draft = {
  version: 2,
  theme: { accent: '#00c2a8' },
  devices: { default: { capabilities: ['touch', 'pointer'] } },
  home_screen: 'demo', screen_order: ['demo'],
  global: { room: 'Studio', main_home: 'demo' },
  activities: {},
  screens: { demo: { name: 'Demo', class: 'group', tiles: [
    { id: 'd1', type: 'light', entity: 'light.demo', icon: 'material:lightbulb', label: 'Demo Light', span: 2 },
    { id: 'd2', type: 'nav', target: 'demo', icon: 'material:home', label: 'Nowhere', span: 2 }
  ] } }
};

// 2. inject -> renders, applied message, theme applied
await p.evaluate(cfg => window.sendCfg(cfg), draft);
await p.waitForTimeout(300);
r.applied = await p.evaluate(() => {
  const d = document.getElementById('pv').contentDocument;
  const w = document.getElementById('pv').contentWindow;
  return {
    msg: window._msgs.some(m => m && m.type === 'harmonium_applied' && m.screen === 'demo'),
    tile: !!d.getElementById('tile_d1'),
    bar: d.getElementById('screenName').textContent,
    accent: w.getComputedStyle(d.documentElement).getPropertyValue('--accent').trim()
  };
});

// 3. RE-injection (the live-edit loop): label change shows up
const draft2 = JSON.parse(JSON.stringify(draft));
draft2.screens.demo.tiles[0].label = 'Renamed Light';
await p.evaluate(cfg => window.sendCfg(cfg), draft2);
await p.waitForTimeout(250);
r.reinjected = await p.evaluate(() =>
  document.getElementById('pv').contentDocument
    .querySelector('#tile_d1 .top .lbl').textContent);

// 4. synthetic keys drive focus (soft remote)
await p.evaluate(() => window.sendKey('ArrowDown'));
await p.waitForTimeout(150);
r.keyFocus = await p.evaluate(() =>
  document.getElementById('pv').contentDocument
    .getElementById('tile_d2').classList.contains('focused'));

// 5. bad config (no screens) -> engine degrades silently and survives;
//    a following good config still renders (the live-edit loop heals)
await p.evaluate(() => window.sendCfg({ version: 2 }));
await p.waitForTimeout(200);
r.badCfgAlive = await p.evaluate(() =>
  !!document.getElementById('pv').contentDocument.getElementById('grid'));
await p.evaluate(cfg => window.sendCfg(cfg), draft);
await p.waitForTimeout(250);
r.recovered = await p.evaluate(() =>
  !!document.getElementById('pv').contentDocument.getElementById('tile_d1'));

r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
