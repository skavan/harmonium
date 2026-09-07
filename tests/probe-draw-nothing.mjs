/* DRAWS-AS NOTHING fence (2026-09-06 — Suresh: "we need to offer a
   DRAW AS = Nothing for members of the cast, that I don't want to
   see a device tile in the panel for"). A cast-member-only option:
   the member stays cast (roles/keys/claims wired, aggregate bands
   still read it) but draws NO tile of its own. Two sides:

   ENGINE — a member with present[key].type: "none" emits no device
   tile (Devices section), no promoted control, no group-child tile;
   its volume-BAND row (an aggregate, role-driven) still renders.

   STUDIO — the cast ⚙ offers "Nothing" in Draws-as; a hand-placed
   page tile's Draws-as never does (you don't place a tile to hide
   it). */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

/* ================= ENGINE ================= */
const ECFG = { version: 2, home_screen: 'p', screen_order: ['p'],
  global: { room: 'P', activity_select: 'select.act' },
  controllers: { music: { name: 'Music', class: 'activity', type: 'controller',
    sections: [{ tiles: [
      { id: 'vols', type: 'volumes' },
      { id: 'cast', type: 'devices' } ] }] } },
  remotes: { default: { capabilities: ['touch', 'pointer'] } },
  activities: { music: { name: 'Listen', room_view: 'p',
    screen: 'controller:music',
    cast: ['sonos_dev', 'amp_dev', 'media_player.loose'],
    /* the compiled Devices list (the Studio's regenDevices writes
       this from the cast) — castOf reads it */
    devices: ['media_player.sonos', 'media_player.amp', 'media_player.loose'],
    /* sonos draws normally; amp draws as NOTHING; the loose entity
       is promoted to controls but ALSO nothing */
    present: {
      amp_dev: { type: 'none' },
      'media_player.loose': { where: 'controls', type: 'none' } },
    context: { media_player: 'media_player.sonos', volume: 'media_player.sonos' } } },
  devices: {
    sonos_dev: { name: 'Sonos',
      roles: { media_player: 'media_player.sonos', volume: 'media_player.sonos' } },
    amp_dev: { name: 'Zone Amp',
      roles: { media_player: 'media_player.amp', volume: 'media_player.amp' } },
  },
  screens: { p: { name: 'P', type: 'hub', tiles: [
    { id: 'd1', type: 'device', entity: 'media_player.sonos', label: 'S' }] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
{
  const p = await (await b.newContext({ viewport: { width: 349, height: 800 } })).newPage();
  p.on('pageerror', e => errs.push('engine pageerror: ' + String(e.message).slice(0, 120)));
  await (p.context()).route('**/config.json*', r => r.fulfill({ json: ECFG }));
  await p.addInitScript(() => {
    localStorage.setItem('hakr_token', 't');
    localStorage.setItem('hakr_host', 'localhost:8482');
    window.WebSocket = class {
      constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
      send(m) { const g = JSON.parse(m);
        const r = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
        if (g.type === 'auth') r({ type: 'auth_ok' });
        else r({ type: 'result', id: g.id, success: true, result: null }); }
      close() {}
    };
  });
  await p.goto('http://localhost:8482/index.html');
  await p.waitForTimeout(800);
  await p.evaluate(() => { S.stack = []; navigate('controller:music', true); });
  await p.waitForTimeout(300);
  const ids = await p.evaluate(() =>
    [...document.querySelectorAll('.tile')].map(x => x.id).join('|'));

  ck('engine: the normally-drawn cast device renders its device tile',
    /cast_media_player_sonos/.test(ids));
  ck('engine: the "Nothing" device draws NO device tile',
    !/cast_media_player_amp/.test(ids));
  ck('engine: the "Nothing" loose+controls member draws NO promoted tile',
    !/media_player_loose/.test(ids));
  /* the aggregate Volume band still reads the "Nothing" member's role */
  ck('engine: the Volume band still carries the "Nothing" member (aggregate, role-driven)',
    /vols_amp_dev/.test(ids));
  ck('engine: the primary\'s own volume row is there too',
    /vols_sonos_dev/.test(ids));

  /* flip amp back to a launcher — its device tile returns (proof the
     suppression is the type, nothing structural) */
  ck('engine: clearing type: "none" brings the device tile back',
    await p.evaluate(() => {
      delete CONFIG.activities.music.present.amp_dev.type;
      S.stack = []; navigate('controller:music', true);
      return new Promise(res => setTimeout(() => {
        const ids2 = [...document.querySelectorAll('.tile')].map(x => x.id).join('|');
        CONFIG.activities.music.present.amp_dev.type = 'none';
        S.stack = []; navigate('controller:music', true);
        res(/cast_media_player_amp/.test(ids2));
      }, 250));
    }));
  await p.close();
}

/* ================= STUDIO ================= */
{
  const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
  const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
  const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
  const ctx = await b.newContext({ viewport: { width: 1680, height: 1400 } });
  await ctx.route('**/api/harmonium/config*', r => r.fulfill({ json: config }));
  await ctx.route('**/api/harmonium/workspaces', r =>
    r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'x', path: '/x/' } } } }));
  await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
  await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: 'x' } }));
  await ctx.route('**/api/states', r => r.fulfill({ json: [] }));
  await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
  await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
  await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('studio pageerror: ' + String(e.message).slice(0, 140)));
  await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
  await p.goto('http://localhost:8482/harmonium-static/studio.html');
  await p.waitForTimeout(2000);
  await p.evaluate(() => {
    [...document.querySelectorAll('#nav .item')].find(x => x.textContent.includes('Porch'))?.click();
  });
  await p.waitForTimeout(500);
  /* Watch Fire TV carries a device cast (fire_tv, samsung_q90,
     porch_soundbar) — its rows have the ⚙ */
  await p.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find(x => /^[▶▼]/.test(x.textContent.trim()) && x.textContent.includes('Watch Fire TV'))?.click();
  });
  await p.waitForTimeout(700);
  /* open the ⚙ on the first cast row */
  await p.evaluate(() => {
    [...document.querySelectorAll('button[title^="Presentation"]')][0]?.click();
  });
  await p.waitForTimeout(400);
  const drawsOpts = await p.evaluate(() => {
    const sel = [...document.querySelectorAll('select')].find(s =>
      [...s.options].some(o => /Launcher tile/.test(o.textContent)));
    return sel ? [...sel.options].map(o => o.textContent.trim()) : null;
  });
  ck('studio: the cast ⚙ Draws-as offers "Nothing"',
    drawsOpts && drawsOpts.includes('Nothing'));
  ck('studio: "Nothing" sits last in the cast ⚙ list',
    drawsOpts && drawsOpts[drawsOpts.length - 1] === 'Nothing');

  await ctx.close();
}

console.log(JSON.stringify({ ok: !errs.length, errs }, null, 1));
await b.close();
process.exit(errs.length ? 1 : 0);
