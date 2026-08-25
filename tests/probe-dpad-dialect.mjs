/* THE DIALECT COMMAND RUNG (v0.84.7 — forum report, 2026-08-24: an
   Apple TV answered "command not recognized" to every button, and the
   reporter could find no way to map commands; dialects looked like the
   right place and carried only app launching).

   The engine's DPAD_DEFAULT speaks Android/Fire TV (UP/ENTER/BACK).
   pyatv — what HA's apple_tv integration wraps — only accepts its own
   lowercase vocabulary. A dialect now declares that vocabulary once and
   every device on it is fixed. Ladder:
     DPAD_DEFAULT < dialect.dpad_commands < tile.commands < ctx.dpad_commands
   Also guards the stock appletv dialect and the Studio's fallback
   table against the engine's real defaults. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const starter = JSON.parse(readFileSync(
  '/root/work/harmonium/custom_components/harmonium/starter-config.json', 'utf8'));
const editor = readFileSync(
  '/root/work/harmonium/studio-src/src/lib/editors/AppsEditor.svelte', 'utf8');
const helpers = readFileSync('/root/work/harmonium/src/widgets/helpers.js', 'utf8');

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

/* --- THE HEAL (v0.84.9). Shipping a dialect in starter-config only
       reaches a VIRGIN install — starterConfig() copies dialects from
       the LIVE config, and dialects had no healer, so `appletv` never
       appeared for anyone already running (Suresh: "I don't see a
       stock appletv dialect?"). healStockDialects plants a missing
       stock dialect and NEVER overwrites one the user has touched. --- */
{
  const { STOCK_DIALECTS, healStockDialects } =
    await import('../studio-src/src/lib/stocklib.js');
  const existing = { dialects: { firetv: { name: 'Fire TV', apps: {} } } };
  healStockDialects(existing);
  ck('heal plants appletv into an existing config',
    !!existing.dialects.appletv &&
    existing.dialects.appletv.dpad_commands.back === 'menu');
  ck('heal leaves the house\'s own dialects alone',
    existing.dialects.firetv.name === 'Fire TV');
  const edited = { dialects: { appletv: { name: 'MINE', dpad_commands: { up: 'X' } } } };
  healStockDialects(edited);
  ck('heal NEVER overwrites a dialect the user edited',
    edited.dialects.appletv.name === 'MINE' &&
    edited.dialects.appletv.dpad_commands.up === 'X');
  const empty = {};
  healStockDialects(empty);
  ck('heal mints dialects{} when absent', !!empty.dialects.appletv);
  ck('every stock dialect declares commands',
    Object.values(STOCK_DIALECTS).every(d => !!d.dpad_commands));
}

/* --- the stock appletv dialect speaks pyatv --- */
const atv = (starter.dialects || {}).appletv;
ck('starter ships an appletv dialect', !!atv);
if (atv) {
  const c = atv.dpad_commands || {};
  ck('appletv: arrows are lowercase pyatv names',
    c.up === 'up' && c.down === 'down' && c.left === 'left' && c.right === 'right');
  ck('appletv: select is select', c.select === 'select');
  /* the two that are NOT a straight lowercasing — Apple TV's back IS
     `menu`, and its main menu is `top_menu` */
  ck('appletv: back maps to menu', c.back === 'menu');
  ck('appletv: menu maps to top_menu', c.menu === 'top_menu');
  ck('appletv: nothing is left in Android UPPERCASE',
    !Object.values(c).some(v => /^[A-Z_]+$/.test(String(v))));
}

/* --- the Studio's fallback table must mirror the engine's defaults,
       or the placeholders would lie about what gets sent --- */
const engineDefaults = {};
const block = helpers.slice(helpers.indexOf('const DPAD_DEFAULT'),
  helpers.indexOf('};', helpers.indexOf('const DPAD_DEFAULT')));
block.replace(/(\w+):\s*"([^"]+)"/g, (_, k, v) => { engineDefaults[k] = v; return _; });
ck('engine defaults parsed', Object.keys(engineDefaults).length >= 10);
const uiFallback = {};
const ublock = editor.slice(editor.indexOf('const DPAD_FALLBACK'),
  editor.indexOf('};', editor.indexOf('const DPAD_FALLBACK')));
ublock.replace(/(\w+):\s*"([^"]+)"/g, (_, k, v) => { uiFallback[k] = v; return _; });
ck('Studio DPAD_FALLBACK matches the engine DPAD_DEFAULT',
  JSON.stringify(engineDefaults) === JSON.stringify(uiFallback));

/* --- THE BAKED-STYLE REPAIR (v0.85.2). v0.85 wrote `style` onto the
       stock Now Playing tiles, which disabled the activity's picker.
       Two repairs must both work, or the people it broke stay broken:
       music via the gen bump, tv via a surgical key strip (tv is not
       gen-healed at all). --- */
{
  const { STOCK_MUSIC, ensureStockControllers } =
    await import('../studio-src/src/lib/stocklib.js');
  const broken = { controllers: {
    music: Object.assign(JSON.parse(JSON.stringify(STOCK_MUSIC)), { gen: 6 }),
    tv: { name: 'TV', type: 'controller',
      sections: [{ tiles: [{ id: 't_np', type: 'media', style: 'poster', entity: 'x' }] }] },
  } };
  const mnp = broken.controllers.music.sections[0].tiles[0];
  delete mnp.np_default; mnp.style = 'hero';       // the shape v0.85 shipped
  ensureStockControllers(broken);
  const m2 = broken.controllers.music.sections[0].tiles[0];
  ck('music: the baked style is gone (picker free again)', !m2.style);
  ck('music: np_default carries the default instead', m2.np_default === 'hero');
  ck('music: gen moved past the broken release', broken.controllers.music.gen > 6);
  ck('tv: baked style stripped surgically (tv never gen-heals)',
    !broken.controllers.tv.sections[0].tiles[0].style);
  ck('tv: the controller itself was NOT replaced',
    broken.controllers.tv.name === 'TV');
}

/* --- the ladder, in the real engine --- */
const CONFIG = {
  version: 2, home_screen: 'den', screen_order: ['den'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  devices: {},
  dialects: { appletv: JSON.parse(JSON.stringify(atv)) },
  activities: { watch: { name: 'Watch', room_view: 'den',
    context: { media_player: 'media_player.atv', dpad: 'remote.atv',
      dialect: 'appletv' },
    screen: 'controller:tv1' } },
  screens: { den: { name: 'Den', type: 'hub', room: true,
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'den' }] }] } },
  controllers: { tv1: { name: 'TV', type: 'controller', class: 'activity',
    view_kind: 'controller',
    control_target: { label: '$activity.name', navigation: '$context.dpad', pass_through: [] },
    tiles: [
      { id: 'pad', type: 'dpad', entity: '$context.dpad', label: 'Remote', span: 2 },
      /* a tile-level override must still beat the dialect */
      { id: 'pad2', type: 'dpad', entity: '$context.dpad', label: 'Odd', span: 2,
        commands: { select: 'TILE_WINS' } },
    ] } },
};
const STATES = {
  'media_player.atv': { s: 'playing', a: { friendly_name: 'Apple TV' } },
  'remote.atv': { s: 'on', a: { friendly_name: 'Apple TV Remote' } },
  'select.harmonium_den_activity': { s: 'watch', a: { options: ['watch', 'off'] } },
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript((STATES) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window._calls = [];
  window._STATES = STATES;
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        const a = {}; (msg.entity_ids || []).forEach(e => {
          if (window._STATES[e]) a[e] = window._STATES[e]; });
        reply({ type: 'event', id: msg.id, event: { a } });
      } else { if (msg.type === 'call_service') window._calls.push(msg);
        reply({ type: 'result', id: msg.id, success: true, result: null }); }
    }
    close() {}
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => navigate('controller:tv1'));
await p.waitForTimeout(500);

const sent = await p.evaluate(() => {
  window._calls.length = 0;
  const out = {};
  ['up', 'down', 'left', 'right', 'select', 'back', 'home', 'menu'].forEach(k => {
    out[k] = cmdFor({}, k);
  });
  out._tile = cmdFor({ commands: { select: 'TILE_WINS' } }, 'select');
  return out;
});
ck('dialect: up → up', sent.up === 'up');
ck('dialect: select → select', sent.select === 'select');
ck('dialect: back → menu (Apple TV back)', sent.back === 'menu');
ck('dialect: menu → top_menu', sent.menu === 'top_menu');
ck('dialect: nothing still UPPERCASE',
  !Object.keys(sent).filter(k => k[0] !== '_').some(k => /^[A-Z_]+$/.test(sent[k])));
ck('tile commands still beat the dialect', sent._tile === 'TILE_WINS');

/* a surface with NO dialect keeps the Android defaults (no regression
   for every Fire TV in the field) */
const plain = await p.evaluate(() => {
  delete CONFIG.activities.watch.context.dialect;
  return { up: cmdFor({}, 'up'), select: cmdFor({}, 'select') };
});
ck('no dialect → Android defaults preserved',
  plain.up === 'UP' && plain.select === 'ENTER');

console.log(JSON.stringify({ sent, plain, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
