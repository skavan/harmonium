/* THE PAD DOCTRINE probe — FINAL FORM (2026-08-20, three field
   rounds converged: "dpad should always navigate the screen EXCEPT
   for the TV, where ChUp and ChDn engage panel mode"). Runs on a
   physical_dpad profile. Under test:
   · MUSIC = a normal panel: ▲▼◀▶ walk, OK = the focused tile,
     NO strip, NO mode, ever;
   · media defaults on the keys the panel doesn't need:
     hold-◀/▶ (, .) = seek ∓15s · hold-CH (' /) = previous/next
     track · short CH = section jump, walking when nothing to jump;
   · dedicated transport names (astrion2 glyph row): prev /
     play_pause / stop / next drive the player from the music page
     AND from home via the running activity (mediaCtx fallback);
   · TV passthrough keeps the FULL original doctrine: pad → device,
     CH borrows the pad for the panel (strip "panel", rolling
     window, config knob), Back/touch end it, holds stay silent. */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'home', screen_order: ['home'],
  global: { room: 'X', activity_select: 'select.x' },
  activities: {
    music: { name: 'Music', context: { media_player: 'media_player.amp' } },
  },
  remotes: { pad: { capabilities: ['physical_dpad', 'touch'] } },
  screens: {
    home: { name: 'Home', type: 'hub', grid: { columns: 1 }, sections: [{
      tiles: [{ id: 'h1', type: 'preset', label: 'Go', action: {} }] }] },
    music: { name: 'Music', type: 'controller', class: 'activity',
      context: { media_player: 'media_player.amp' },
      grid: { columns: 1 },
      sections: [{ title: 'Body', tiles: [
        { id: 'p1', type: 'preset', label: 'One',
          action: { service: 'light.toggle', entity: 'light.x' } },
        { id: 'p2', type: 'preset', label: 'Two', action: {} },
      ] }] },
    tv: { name: 'TV', type: 'controller', class: 'activity',
      dpad_passthrough: 'remote.fire',
      context: { dpad: 'remote.fire' },
      grid: { columns: 1 },
      sections: [{ title: 'Body', tiles: [
        { id: 't1', type: 'preset', label: 'Uno', action: {} },
        { id: 't2', type: 'preset', label: 'Dos', action: {} },
      ] }] },
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
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        reply({ type: 'event', id: msg.id, event: { a: {
          'select.x': { s: 'music', a: {} },
          'media_player.amp': { s: 'playing', a: { media_position: 60,
            media_position_updated_at: new Date().toISOString(), media_duration: 300 } },
        } } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);

/* short window for the TV decay stage; record service calls */
await p.evaluate(() => {
  TIMING.padLatch = 1200;
  window._calls = [];
  const o = callService;
  window.callService = (d, s, data, t) => { window._calls.push(d + '.' + s); };
});
const calls = () => p.evaluate(() => window._calls.splice(0));
const strip = () => p.evaluate(() =>
  !document.getElementById('padstrip').classList.contains('hidden'));
const focus = () => p.evaluate(() => S.focusId);

const r = {};
/* ---- MUSIC: a normal panel — the pad walks, OK = the tile ---- */
await p.evaluate(() => navigate('music')); await p.waitForTimeout(250);
await p.evaluate(() => setFocus('p2'));
await p.keyboard.press('ArrowUp'); await p.waitForTimeout(120);
r.walk = { focus: await focus(), calls: await calls(),
  strip: await strip() };                        /* p1 · [] · false */
await p.keyboard.press('Enter'); await p.waitForTimeout(200);
r.okIsTile = await calls();                      /* light.toggle */

/* media defaults: hold-◀/▶ seek, hold-CH skips, short CH walks
   (this page has one section and no browse — nothing to jump) */
await p.keyboard.press(','); await p.keyboard.press('.');
await p.waitForTimeout(200);
r.holdSeek = await calls();                      /* media_seek ×2 */
await p.keyboard.press("'"); await p.keyboard.press('/');
await p.waitForTimeout(200);
r.holdChTracks = await calls();                  /* previous, next */
await p.evaluate(() => setFocus('p1'));
await p.keyboard.press('PageDown'); await p.waitForTimeout(120);
r.shortCh = { focus: await focus(), calls: await calls(),
  strip: await strip() };                        /* p2 walked · [] · false */
r.musicNeverStrips = !(await strip());

/* dedicated transport names (astrion2 glyph row) — on the page… */
await p.evaluate(() => { window._calls.length = 0;
  act('prev', true); act('play_pause', true); act('stop', true); act('next', true); });
await p.waitForTimeout(150);
r.transportKeys = await calls();
/* …and from HOME, following the RUNNING activity (mediaCtx) */
await p.evaluate(() => navigate('home')); await p.waitForTimeout(250);
await p.evaluate(() => { window._calls.length = 0; act('play_pause', true); });
await p.waitForTimeout(150);
r.transportFromHome = await calls();             /* play_pause via select.x */

/* home: neither CH nor arrows ever arm anything */
await p.keyboard.press('PageDown');
await p.keyboard.press('ArrowDown'); await p.waitForTimeout(120);
r.homeNoStrip = !(await strip());

/* ---- TV passthrough: the FULL original doctrine ---- */
await p.evaluate(() => { navigate('tv'); window._calls.length = 0; });
await p.waitForTimeout(250);
await p.keyboard.press('ArrowDown'); await p.waitForTimeout(150);
r.tvPass = await calls();                        /* remote.send_command */
await p.keyboard.press('.'); await p.waitForTimeout(150);
r.tvHoldSilent = (await calls()).length === 0;   /* no media default here */
await p.keyboard.press('PageDown'); await p.waitForTimeout(120);
await p.evaluate(() => setFocus('t1'));
await p.keyboard.press('ArrowDown'); await p.waitForTimeout(120);
r.tvBorrow = { strip: await strip(), focus: await focus() };  /* t2 */
r.tvBorrowCalls = await calls();
/* rolling decay: renew once, then let it lapse */
await p.keyboard.press('ArrowUp'); await p.waitForTimeout(800);
r.renewed = await strip();
await p.waitForTimeout(1700);
r.decayed = !(await strip());
await p.keyboard.press('ArrowDown'); await p.waitForTimeout(150);
r.backToDevice = await calls();                  /* passthrough again */
/* Back ends it early */
await p.keyboard.press('PageUp'); await p.waitForTimeout(120);
const armedForBack = await strip();
await p.keyboard.press('Escape'); await p.waitForTimeout(120);
r.backEnds = armedForBack && !(await strip());
/* touch ends it early (Back above popped the stack — come back) */
await p.evaluate(() => navigate('tv')); await p.waitForTimeout(250);
await p.keyboard.press('PageUp'); await p.waitForTimeout(120);
const armedForTouch = await strip();
await p.mouse.click(240, 700); await p.waitForTimeout(120);
r.touchEnds = armedForTouch && !(await strip());

/* the CONFIG KNOB (input.pad_latch_seconds) beats the default */
await p.evaluate(() => { CONFIG.input = { pad_latch_seconds: 2 }; });
await p.keyboard.press('PageDown'); await p.waitForTimeout(120);
r.knobWindow = await p.evaluate(() => S.padLatch - Date.now());  /* ~1900 */
await p.evaluate(() => { delete CONFIG.input; padClear(); });

console.log(JSON.stringify({ ...r,
  ok: r.walk.focus === 'p1' && r.walk.calls.length === 0 && !r.walk.strip &&
      JSON.stringify(r.okIsTile) === '["light.toggle"]' &&
      JSON.stringify(r.holdSeek) === JSON.stringify(
        ['media_player.media_seek', 'media_player.media_seek']) &&
      JSON.stringify(r.holdChTracks) === JSON.stringify(
        ['media_player.media_previous_track', 'media_player.media_next_track']) &&
      r.shortCh.focus === 'p2' && r.shortCh.calls.length === 0 &&
      !r.shortCh.strip && r.musicNeverStrips &&
      JSON.stringify(r.transportKeys) === JSON.stringify(
        ['media_player.media_previous_track', 'media_player.media_play_pause',
         'media_player.media_stop', 'media_player.media_next_track']) &&
      JSON.stringify(r.transportFromHome) === '["media_player.media_play_pause"]' &&
      r.homeNoStrip &&
      JSON.stringify(r.tvPass) === '["remote.send_command"]' &&
      r.tvHoldSilent &&
      r.tvBorrow.strip && r.tvBorrow.focus === 't2' &&
      r.tvBorrowCalls.length === 0 &&
      r.renewed && r.decayed &&
      JSON.stringify(r.backToDevice) === '["remote.send_command"]' &&
      r.backEnds && r.touchEnds &&
      r.knobWindow > 1500 && r.knobWindow <= 2100 &&
      errs.length === 0,
  errs }, null, 1));
await b.close();
