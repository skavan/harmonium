/* PHOTO PRESETS (v0.85.8 — presets as first-class citizens: "support
   for artwork, opacity, font stuff, just like devices"). A preset
   with `image` wears the same full-bleed .photo dress the nav/room
   card wears. Pins:
     1. `image` → .photo dress: full-bleed roomimg, icon hidden,
        label overlaid;
     2. image_opacity applies (chassis-level since v0.85.8);
     3. label_pos positions the overlay label (shared lp- CSS);
     4. a preset WITHOUT image is untouched — icon square, no dress;
     5. icon_image stays an icon-slot art stamp, NOT a photo dress;
     6. a dead photo URL sheds the dress — the tile falls back to its
        icon square (v0.68.7 understudy doctrine);
     7. a tap on a photo preset still fires its action. */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'p', screen_order: ['p'],
  global: { room: 'X' },
  remotes: { default: { capabilities: ['touch', 'pointer'] } },
  screens: { p: { name: 'P', tiles: [
    { id: 'ph', type: 'preset', label: 'egoFM', image: '/art.png',
      image_opacity: 0.5, label_pos: 'top-left',
      action: { service: 'music_assistant.play_media',
                entity: 'media_player.mp',
                data: { media_id: 'library://radio/3' } } },
    { id: 'pl', type: 'preset', label: 'Plain', icon: 'material:radio',
      action: { service: 'media_player.play_media',
                entity: 'media_player.mp', data: {} } },
    { id: 'st', type: 'preset', label: 'Stamp', icon: 'material:tv',
      icon_image: '/art.png',
      action: { service: 'media_player.play_media',
                entity: 'media_player.mp', data: {} } },
    { id: 'dd', type: 'preset', label: 'Dead', icon: 'material:radio',
      image: '/gone.png',
      action: { service: 'media_player.play_media',
                entity: 'media_player.mp', data: {} } },
  ] } },
};

const ART = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGP8tcWGARtgwio6aCUAgtEB+iohLfEAAAAASUVORK5CYII=';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 350, height: 582 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 100)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await ctx.route('**/art.png', r => r.fulfill({ body: Buffer.from(ART, 'base64'), contentType: 'image/png' }));
await ctx.route('**/gone.png', r => r.fulfill({ status: 404, body: 'no' }));
await p.addInitScript(() => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.__calls = [];
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'call_service') window.__calls.push(msg.domain + '.' + msg.service);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        reply({ type: 'event', id: msg.id, event: { a: {
          'media_player.mp': { s: 'playing', a: {} } } } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
});
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(1100);

const r = await p.evaluate(() => {
  const g = (id) => document.getElementById('tile_' + id);
  const cs = (el) => getComputedStyle(el);
  const ph = g('ph'), pl = g('pl'), st = g('st'), dd = g('dd');
  const img = ph.querySelector('.roomimg');
  return {
    phPhoto: ph.classList.contains('photo'),
    phImg: !!img && img.getAttribute('src') === '/art.png',
    /* clientHeight = the padding box: the absolute img fills it, the
       2px tile border stays outside — same geometry as nav photo cards */
    phFull: !!img && Math.abs(img.getBoundingClientRect().height
      - ph.clientHeight) <= 2,
    phOp: img ? cs(img).opacity : '?',
    phLp: ph.classList.contains('lp-top-left'),
    phIconHidden: cs(ph.querySelector('.ic')).display === 'none',
    phLblVisible: cs(ph.querySelector('.lbl')).display !== 'none',
    plClean: !pl.classList.contains('photo') && !pl.querySelector('.roomimg'),
    stClean: !st.classList.contains('photo') && !st.querySelector('.roomimg'),
    stStamp: !!st.querySelector('.top img'),
    ddShed: !dd.classList.contains('photo') && !dd.querySelector('.roomimg'),
    ddIconBack: cs(dd.querySelector('.ic')).display !== 'none',
  };
});
await p.click('#tile_ph');
await p.waitForTimeout(400);
const calls = await p.evaluate(() => window.__calls);
const ck = (n, cnd) => { if (!cnd) errs.push(n + ' :: ' + JSON.stringify(r)); };
ck('image → .photo dress', r.phPhoto);
ck('full-bleed roomimg rendered', r.phImg && r.phFull);
ck('image_opacity applies (0.5)', Math.abs(+r.phOp - 0.5) < 0.01);
ck('label_pos rides the shared lp- CSS', r.phLp);
ck('icon hidden, label overlaid', r.phIconHidden && r.phLblVisible);
ck('imageless preset untouched', r.plClean);
ck('icon_image stays an icon-slot stamp', r.stClean && r.stStamp);
ck('dead photo URL sheds the dress', r.ddShed);
ck('icon square returns after the shed', r.ddIconBack);
ck('tap on a photo preset fires its action',
  calls.includes('music_assistant.play_media'));
console.log(JSON.stringify({ ...r, calls, ok: errs.length === 0, errs: errs.map(e => e.split(' :: ')[0]) }, null, 1));
await b.close();
if (errs.length) process.exit(1);
