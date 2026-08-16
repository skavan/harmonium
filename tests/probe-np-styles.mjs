/* NOW PLAYING RENDERERS + BAND LABELS probe (v0.83.7 — Suresh:
   "lets come up with 3 renderers" / "a label slot, so we can
   override labels ... No text means no label!").
   Asserts: default card (state sub, no npslim/npwrap) · slim
   (surface.np_style: one line "Title — Artist", live indicator while
   playing, top row hidden by class) · art hero (npwrap + title/
   artist/album + progress) · band_labels overrides the volume tile's
   label, "" collapses it (.lbl:empty), and the volumes CAST tiles
   keep their device names (bandGen). */
import { chromium } from 'playwright-core';

const STATES = {
  'media_player.sonos': { s: 'playing', a: {
    friendly_name: 'Sonos', media_title: 'Golden Hour',
    media_artist: 'JVKE', media_album_name: 'this is what ____ feels like',
    media_duration: 200, media_position: 60,
    media_position_updated_at: '2026-08-15T00:00:00Z',
    entity_picture: '/art.png',
    volume_level: 0.4, supported_features: 84351 } },
  'media_player.zone2': { s: 'idle', a: {
    friendly_name: 'Zone Two', volume_level: 0.2, supported_features: 84351 } },
  'select.harmonium_den_activity': { s: 'listen', a: { options: ['listen', 'off'] } },
};
const CONFIG = {
  version: 2, home_screen: 'den', screen_order: ['den'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  devices: {
    sonos: { name: 'Sonos', roles: { media_player: 'media_player.sonos', volume: 'media_player.sonos' } },
    zone2: { name: 'Zone Two', roles: { volume: 'media_player.zone2' } },
  },
  activities: { listen: { name: 'Listen', room_view: 'den',
    cast: ['sonos', 'zone2'],
    context: { media_player: 'media_player.sonos', volume: 'media_player.sonos' },
    screen: 'controller:music7' } },
  screens: { den: { name: 'Den', type: 'hub', room: true,
    sections: [{ role: 'activities', hero_label: 'Activities',
      tiles: [{ id: 'acts', type: 'activities', room: 'den' }] }] } },
  controllers: { music7: { name: 'Music', type: 'controller', class: 'activity',
    view_kind: 'controller',
    control_target: { label: '$activity.name', volume: '$context.volume', pass_through: [] },
    tiles: [
      { id: 'np', type: 'media', entity: '$context.media_player', label: 'Now Playing', span: 2 },
      { id: 'grp', type: 'groups' },
      { id: 'vols', type: 'volumes' },
    ] } },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
await p.addInitScript((STATES) => {
  localStorage.setItem('hakr_token', 't');
  localStorage.setItem('hakr_host', 'localhost:8482');
  window.WebSocket = class {
    constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
    send(m) { const msg = JSON.parse(m);
      const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
      if (msg.type === 'auth') reply({ type: 'auth_ok' });
      else if (msg.type === 'subscribe_entities') {
        reply({ type: 'result', id: msg.id, success: true, result: null });
        const a = {}; (msg.entity_ids || []).forEach(e => { if (STATES[e]) a[e] = STATES[e]; });
        reply({ type: 'event', id: msg.id, event: { a } });
      } else reply({ type: 'result', id: msg.id, success: true, result: null });
    }
    close() {}
  };
}, STATES);
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(900);
await p.evaluate(() => navigate('controller:music7'));
await p.waitForTimeout(500);

const np = () => p.evaluate(() => {
  const t = document.querySelector('.tile.wgt-media');
  return {
    slim: t?.classList.contains('slim'), art: t?.classList.contains('art'),
    sub: t?.querySelector('.sub')?.textContent,
    slimLine: t?.querySelector('.npst')?.textContent,
    slimLive: t?.querySelector('.npsind')?.classList.contains('live'),
    heroTitle: t?.querySelector('.npt')?.textContent,
    heroArtist: t?.querySelector('.npa')?.textContent,
    heroProg: t?.querySelector('.npprog') && !t.querySelector('.npprog').classList.contains('hidden'),
  };
});
const r = {};
r.dflt = await np();
await p.evaluate(() => {
  CONFIG.activities.listen.surface = { np_style: 'slim' };
  navigate('den'); navigate('controller:music7');
});
await p.waitForTimeout(400);
r.slim = await np();
await p.evaluate(() => {
  CONFIG.activities.listen.surface = { np_style: 'art' };
  navigate('den'); navigate('controller:music7');
});
await p.waitForTimeout(400);
r.art = await np();

// "wash" = the ORIGINAL full-bleed hero, back by request ("We lost
// the original display, bring it back!"): dimmed background art +
// the 64px thumb (position static, not the panel)
await p.evaluate(() => {
  CONFIG.activities.listen.surface = { np_style: 'wash' };
  navigate('den'); navigate('controller:music7');
});
await p.waitForTimeout(400);
r.wash = await p.evaluate(() => {
  const t = document.querySelector('.tile.wgt-media');
  const img = t?.querySelector('.npimg');
  return {
    washClass: t?.classList.contains('wash'), artClass: t?.classList.contains('art'),
    bg: !!(t?.style.backgroundImage || '').includes('linear-gradient'),
    thumbStatic: img ? getComputedStyle(img).position === 'static' : null,
    heroTitle: t?.querySelector('.npt')?.textContent,
  };
});

// "plain" suppresses a surface tile's art:true (the stock-music case:
// Standard used to BE the hero)
await p.evaluate(() => {
  CONFIG.controllers.music7.tiles[0].art = true;
  CONFIG.activities.listen.surface = {};
  navigate('den'); navigate('controller:music7');
});
await p.waitForTimeout(400);
r.autoArt = await np();          /* Auto → the tile's own art:true */
await p.evaluate(() => {
  CONFIG.activities.listen.surface = { np_style: 'plain' };
  navigate('den'); navigate('controller:music7');
});
await p.waitForTimeout(400);
r.plain = await np();            /* plain beats art:true */
await p.evaluate(() => {
  delete CONFIG.controllers.music7.tiles[0].art;
});

// slim AUTOSCROLL: a long line overflows → marquee class + measured
// shift; short line stays put
await p.evaluate(() => {
  CONFIG.activities.listen.surface = { np_style: 'slim' };
  navigate('den'); navigate('controller:music7');
});
await p.waitForTimeout(400);
await p.evaluate(() => {
  const cur = S.states.get('media_player.sonos');
  cur.a.media_title = 'An Extremely Long Song Title That Cannot Possibly Fit';
  cur.a.media_artist = 'An Orchestra With A Very Long Name Indeed';
  renderStates();
});
await p.waitForTimeout(300);
r.marquee = await p.evaluate(() => {
  const box = document.querySelector('.npst');
  return { scroll: box?.classList.contains('scroll'),
    shift: box?.querySelector('.npstx')?.style.getPropertyValue('--npshift') };
});

// BAND LABELS: override the wired volume tile's label; "" = no label;
// the volumes-cast device tiles keep their own names
await p.evaluate(() => {
  CONFIG.activities.listen.surface = { band_labels: { np: 'Music', volume: 'Loudness' } };
  navigate('den'); navigate('controller:music7');
});
await p.waitForTimeout(400);
r.labels = await p.evaluate(() => ({
  np: document.querySelector('.tile.wgt-media .lbl')?.textContent,
  volLbls: [...document.querySelectorAll('.tile.wgt-volume .lbl, .tile.wgt-stepper .lbl')]
    .map(x => x.textContent),
}));
// a PROMOTED volume (his Receiver: ⚙ where "With the controls") is a
// per-device tile — the band label must NOT rename it
await p.evaluate(() => {
  CONFIG.activities.listen.present = { zone2: { shows: 'volume', where: 'controls' } };
  navigate('den'); navigate('controller:music7');
});
await p.waitForTimeout(400);
r.promoted = await p.evaluate(() =>
  [...document.querySelectorAll('.tile.wgt-volume .lbl, .tile.wgt-stepper .lbl')]
    .map(x => x.textContent));
await p.evaluate(() => { delete CONFIG.activities.listen.present; });
await p.evaluate(() => {
  CONFIG.activities.listen.surface = { band_labels: { np: '' } };
  navigate('den'); navigate('controller:music7');
});
await p.waitForTimeout(400);
r.noLabel = await p.evaluate(() => {
  const l = document.querySelector('.tile.wgt-media .lbl');
  return { text: l?.textContent, collapsed: l ? getComputedStyle(l).display === 'none' : null };
});

// SECTION-HEADING BANDS: devices heading takes the override; "" kills it
await p.evaluate(() => {
  CONFIG.controllers.music7.sections = [
    { tiles: CONFIG.controllers.music7.tiles },
    { title: 'Devices', tiles: [{ id: 'dev', type: 'devices' }] },
  ];
  delete CONFIG.controllers.music7.tiles;
  CONFIG.activities.listen.devices = ['media_player.sonos', 'media_player.zone2'];
  CONFIG.activities.listen.surface = { band_labels: { devices: 'THE GEAR' } };
  navigate('den'); navigate('controller:music7');
});
await p.waitForTimeout(400);
r.heading = await p.evaluate(() =>
  [...document.querySelectorAll('.shead')].map(x => x.textContent));
await p.evaluate(() => {
  CONFIG.activities.listen.surface = { band_labels: { devices: '' } };
  navigate('den'); navigate('controller:music7');
});
await p.waitForTimeout(400);
r.headingGone = await p.evaluate(() =>
  [...document.querySelectorAll('.shead')].map(x => x.textContent));

console.log(JSON.stringify({ r, errs }, null, 1));
await b.close();
