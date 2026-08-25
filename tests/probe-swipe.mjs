/* EDGE-SWIPE DEPTH NAVIGATION (spec §8, 2026-08-24). Left edge → right
   = parent; right edge → left = detail (explicit key or derived from a
   trailing navigate); vertical = scroll (never navigates); no target =
   rubber-band. Touch/pen only. Synthetic PointerEvents drive it. */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'porch', screen_order: ['porch'],
  global: { room: 'X', activity_select: 'select.x', main_home: 'porch' },
  remotes: { pad: { capabilities: ['touch'] } },
  screens: {
    porch: { name: 'Porch', type: 'hub', grid: { columns: 1 },
      sections: [{ tiles: [{ id: 'h1', type: 'preset', label: 'Go', action: {} }] }] },
    sub: { name: 'Sub', type: 'hub', parent: 'porch', grid: { columns: 1 },
      sections: [{ tiles: [{ id: 's1', type: 'preset', label: 'S', action: {} }] }] },
    ctl: { name: 'Controller', type: 'controller', grid: { columns: 1 },
      sections: [{ tiles: [
        { id: 'c1', type: 'preset', label: 'NP', action: {},
          trailing: { icon: 'x', action: { navigate: 'apps' } } } ] }] },
    apps: { name: 'Apps', type: 'hub', grid: { columns: 1 },
      sections: [{ tiles: [{ id: 'a1', type: 'preset', label: 'Netflix', action: {} }] }] },
  },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  localStorage.setItem('hakr_device', 'pad');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(800);

// synthetic edge swipe: down at (x0,y0), up at (x1,y1), pointerType touch
async function swipe(x0, y0, x1, y1) {
  await p.evaluate(([x0, y0, x1, y1]) => {
    const opt = (x, y) => ({ clientX: x, clientY: y, pointerType: 'touch', bubbles: true });
    document.dispatchEvent(new PointerEvent('pointerdown', opt(x0, y0)));
    document.dispatchEvent(new PointerEvent('pointerup', opt(x1, y1)));
  }, [x0, y0, x1, y1]);
  await p.waitForTimeout(120);
}
const at = () => p.evaluate(() => S.screen);
const rubberSeen = () => p.evaluate(() =>
  document.getElementById('grid').className.indexOf('rubber') >= 0);
const r = {};

// 1. left edge → right on a child → up to parent
await p.evaluate(() => navigate('sub')); await p.waitForTimeout(120);
await swipe(8, 300, 120, 320);
r.parent = await at();                                  // 'porch'

// 2. right edge → left on a controller with a trailing → detail
await p.evaluate(() => navigate('ctl')); await p.waitForTimeout(120);
await swipe(472, 300, 360, 315);
r.detail = await at();                                  // 'apps'

// 3. vertical (at edge) → no nav (scroll)
await p.evaluate(() => navigate('ctl')); await p.waitForTimeout(120);
await swipe(8, 200, 24, 460);
r.verticalNoNav = await at();                          // 'ctl'

// 4. right edge → left on a page with no detail → rubber-band, no nav
await p.evaluate(() => navigate('porch')); await p.waitForTimeout(120);
await swipe(472, 300, 360, 315);
r.noDetail = { screen: await at(), rubber: await rubberSeen() };   // 'porch' · true

r.ok = r.parent === 'porch' && r.detail === 'apps' &&
  r.verticalNoNav === 'ctl' &&
  r.noDetail.screen === 'porch' && r.noDetail.rubber === true &&
  errs.length === 0;
console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close();
