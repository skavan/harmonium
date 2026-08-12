/* PRESENTATION, PER MEMBER (v0.76 — "put the device options in the
   device rows"): act.present drives (1) an ungrouped cast device
   drawn INLINE as a control on the Devices section, its bundle
   collapsed to the one tile; (2) a loose entity drawn as a control on
   itself; (3) name/icon/tap overrides on classic device tiles (tap
   "none" = pure readout, no ⚙ trail); (4) a group member's `shows`
   beating the group's own; (5) an activity with no `present` renders
   byte-classically. */
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const r = {}; const errs = [];
const p = await (await b.newContext({ viewport: { width: 480, height: 900 } })).newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8482/index.html');
await p.waitForTimeout(700);

await p.evaluate(() => {
  document.getElementById('auth').classList.add('hidden');
  window._sent = []; S.connected = true;
  S.ws = { send: m => window._sent.push(JSON.parse(m)) };
  CONFIG.devices.t_tv = { name: 'Big TV',
    roles: { media_player: 'media_player.t_tv', power: 'media_player.t_tv' } };
  CONFIG.devices.t_amp = { name: 'Zone Amp', icon: 'material:speaker',
    roles: { volume: 'media_player.t_amp',
             source_select: 'media_player.t_amp_src' } };
  CONFIG.devices.t_gm = { name: 'Gm', roles: { volume: 'media_player.t_gm' } };
  CONFIG.controllers.t_presc = { name: 'Pres C', class: 'activity',
    view_kind: 'controller', type: 'controller',
    sections: [{ tiles: [{ id: 'dv', type: 'devices' },
                         { id: 'gp', type: 'groups' }] }] };
  CONFIG.activities.t_pres = {
    name: 'Pres Test', screen: 'controller:t_presc', room_view: 'porch',
    cast: ['t_tv', 't_amp',
      { group: 'z', name: 'Zones', shows: 'volume', members: ['t_gm'] }],
    devices: ['media_player.t_tv', 'media_player.t_amp',
      'media_player.t_amp_src', 'media_player.t_gm', 'media_player.t_loose'],
    extra_devices: ['media_player.t_loose'],
    context: { media_player: 'media_player.t_tv' },
    present: {
      t_amp: { name: 'Upper Amp', shows: 'volume' },
      t_tv: { tap: 'none' },
      t_gm: { shows: 'stepper' },
      'media_player.t_loose': { name: 'Amp Power', shows: 'power' },
    },
  };
  ['t_tv', 't_amp', 't_amp_src', 't_gm', 't_loose'].forEach(x =>
    S.states.set('media_player.' + x,
      { s: 'idle', a: { friendly_name: x, volume_level: 0.4 } }));
  S.states.set('select.harmonium_porch_activity', { s: 't_pres', a: {} });
  S.lastAct = 't_pres';
  navigate('controller:t_presc');
});
await p.waitForTimeout(200);

/* 1+2+3: the Devices section */
r.devices = await p.evaluate(() =>
  Array.from(document.querySelectorAll('#grid .tile')).map(el => ({
    id: el.id, type: el.className.match(/wgt-(\w+)/)?.[1],
    label: (el.querySelector('.lbl') || {}).textContent,
    trail: !!el.querySelector('.trail') })));
r.inlineVolume = await p.evaluate(() => {
  const el = Array.from(document.querySelectorAll('#grid .tile.wgt-volume'))
    .find(x => /Upper Amp/.test(x.textContent));
  return !!el;
});
r.bundleCollapsed = await p.evaluate(() =>
  !Array.from(document.querySelectorAll('#grid .tile.wgt-device'))
    .some(el => /t_amp/.test(el.id)));
r.loosePower = await p.evaluate(() => {
  const el = Array.from(document.querySelectorAll('#grid .tile.wgt-power'))
    .find(x => /Amp Power/.test(x.textContent));
  return !!el;
});
r.tapNoneNoTrail = await p.evaluate(() => {
  const el = Array.from(document.querySelectorAll('#grid .tile.wgt-device'))
    .find(x => /Big TV|t_tv/.test(x.textContent));
  return el ? !el.querySelector('.trail') : null;
});

/* 4: the group page — member stepper beats group volume */
await p.evaluate(() => navigate('group:z'));
await p.waitForTimeout(150);
r.groupMember = await p.evaluate(() =>
  Array.from(document.querySelectorAll('#grid .tile')).map(el =>
    el.className.match(/wgt-(\w+)/)?.[1]));

/* 5: no present → classic device tiles (and the ⚙ trail returns) */
await p.evaluate(() => {
  delete CONFIG.activities.t_pres.present;
  navigate('controller:t_presc', true);
});
await p.waitForTimeout(150);
r.classic = await p.evaluate(() => ({
  types: Array.from(document.querySelectorAll('#grid .tile'))
    .map(el => el.className.match(/wgt-(\w+)/)?.[1]),
  tvTrail: (() => {
    const el = Array.from(document.querySelectorAll('#grid .tile.wgt-device'))
      .find(x => /Big TV|t_tv/.test(x.textContent));
    return el ? !!el.querySelector('.trail') : null;
  })(),
}));

/* 6: CONTROLS ARE CARDS (v0.76.4): in a columns-1 section — where
   device tiles rightly render as ROWS — an inline control must stay
   a CARD; the volume widget crammed into the row chassis was the
   field wreck. */
await p.evaluate(() => {
  CONFIG.activities.t_pres.present = {
    t_amp: { name: 'Upper Amp', shows: 'volume' },
    'media_player.t_loose': { shows: 'stepper' },
  };
  CONFIG.controllers.t_presc.sections = [{ columns: 1,
    tiles: [{ id: 'dv', type: 'devices' }] }];
  navigate('controller:t_presc', true);
});
await p.waitForTimeout(150);
r.cardsInList = await p.evaluate(() => ({
  volumeIsCard: (() => { const el = document.querySelector('#grid .tile.wgt-volume');
    return el ? !el.classList.contains('row') : null; })(),
  stepperIsCard: (() => { const el = document.querySelector('#grid .tile.wgt-stepper');
    return el ? !el.classList.contains('row') : null; })(),
  deviceIsRow: (() => { const el = document.querySelector('#grid .tile.wgt-device');
    return el ? el.classList.contains('row') : null; })(),
}));

/* 7: THE LOOSE VOLUME (v0.76.5): a legacy/loose activity — no cast
   devices, volume wired to a RAW ENTITY — still gets its volume
   control on the controller's volumes band. And a group member's
   presentation NAME lands on the group page (the field report said
   the member ⚙ "does nothing" — prove where it acts). */
await p.evaluate(() => {
  CONFIG.controllers.t_presc2 = { name: 'Loose C', class: 'activity',
    view_kind: 'controller', type: 'controller',
    sections: [{ tiles: [{ id: 'vv', type: 'volumes' }] }] };
  CONFIG.activities.t_loosevol = {
    name: 'Loose Vol', screen: 'controller:t_presc2', room_view: 'porch',
    cast: [], devices: null,
    context: { media_player: 'media_player.t_loose',
      volume: 'media_player.t_loose' },
  };
  S.states.set('select.harmonium_porch_activity', { s: 't_loosevol', a: {} });
  S.lastAct = 't_loosevol';
  navigate('controller:t_presc2', true);
});
await p.waitForTimeout(150);
r.looseVolume = await p.evaluate(() => {
  const el = document.querySelector('#grid .tile.wgt-volume');
  return el ? { entity: el.id.includes('t_loose'), card: !el.classList.contains('row') } : null;
});
await p.evaluate(() => {
  /* back to t_pres for the group-member name check */
  CONFIG.activities.t_pres.present = { t_gm: { shows: 'stepper', name: 'Zone Two' } };
  S.states.set('select.harmonium_porch_activity', { s: 't_pres', a: {} });
  S.lastAct = 't_pres';
  /* stand on the OWNING activity's controller first — group:z resolves
     against the presumed activity of the CURRENT screen */
  navigate('controller:t_presc', true);
  navigate('group:z', true);
});
await p.waitForTimeout(150);
r.groupMemberName = await p.evaluate(() => {
  const el = document.querySelector('#grid .tile.wgt-stepper');
  return el ? (el.querySelector('.lbl') || {}).textContent : null;
});

/* 8: WHERE THINGS LIVE (v0.77): where:"controls" promotes a loose
   entity's control up beside the group cards; where:"devices" sends
   a group's nav card down after the device tiles. Defaults byte-
   identical to v0.76. */
await p.evaluate(() => {
  CONFIG.activities.t_pres.present = {
    'media_player.t_loose': { shows: 'volume', where: 'controls' },
  };
  CONFIG.activities.t_pres.cast = ['t_tv',
    { group: 'z', name: 'Zones', shows: 'volume', members: ['t_gm'],
      where: 'devices' }];
  CONFIG.controllers.t_presc.sections = [
    { tiles: [{ id: 'gp', type: 'groups' }] },
    { tiles: [{ id: 'dv', type: 'devices' }] }];
  navigate('controller:t_presc', true);
});
await p.waitForTimeout(150);
r.where = await p.evaluate(() => {
  const ids = Array.from(document.querySelectorAll('#grid .tile')).map(el => el.id);
  return {
    promotedVolume: ids.some(i => i.startsWith('tile_gp_') && i.includes('t_loose')),
    notInDevices: !ids.some(i => i.startsWith('tile_dv_') && i.includes('t_loose')),
    demotedGroup: ids.some(i => i.startsWith('tile_dv_g_z')),
    groupNotInControls: !ids.some(i => i === 'tile_gp_z'),
  };
});

/* 9: THE BAND JOINS THE PRESENTATION SYSTEM (v0.77.1): name
   override, the intentional blank (name:"" = no label), and the fat
   slider via present.style — on the volumes generator. */
await p.evaluate(() => {
  CONFIG.devices.t_amp2 = { name: 'Amp Two',
    roles: { volume: 'media_player.t_amp_src' } };
  CONFIG.activities.t_vols = {
    name: 'Vols', screen: 'controller:t_presc2', room_view: 'porch',
    cast: ['t_amp', 't_amp2'],
    devices: ['media_player.t_amp', 'media_player.t_amp_src'],
    context: { media_player: 'media_player.t_amp' },
    present: {
      t_amp: { name: 'Basement', style: 'slider' },
      t_amp2: { name: '' },
    },
  };
  S.states.set('select.harmonium_porch_activity', { s: 't_vols', a: {} });
  S.lastAct = 't_vols';
  navigate('controller:t_presc2', true);
});
await p.waitForTimeout(150);
r.bandPres = await p.evaluate(() => {
  const tiles = Array.from(document.querySelectorAll('#grid .tile.wgt-volume'));
  return tiles.map(el => ({
    label: (el.querySelector('.lbl') || {}).textContent,
    fat: !!el.querySelector('.sldr') }));
});

/* 10: PRESS-SHAPED DOMAINS (v0.78.1): a loose button entity's tile
   PRESSES on tap, and its sub says when — never the raw ISO state. */
await p.evaluate(() => {
  const iso = new Date(Date.now() - 5 * 60000).toISOString();
  S.states.set('button.t_fav', { s: iso, a: { friendly_name: 'favorite' } });
  CONFIG.activities.t_pres.extra_devices = ['button.t_fav'];
  CONFIG.activities.t_pres.devices = ['media_player.t_tv', 'button.t_fav'];
  delete CONFIG.activities.t_pres.present;
  CONFIG.controllers.t_presc.sections = [{ tiles: [{ id: 'dv', type: 'devices' }] }];
  S.states.set('select.harmonium_porch_activity', { s: 't_pres', a: {} });
  S.lastAct = 't_pres';
  navigate('controller:t_presc', true);
  window._sent = [];
});
await p.waitForTimeout(150);
r.buttonTile = await p.evaluate(() => {
  const el = Array.from(document.querySelectorAll('#grid .tile.wgt-device'))
    .find(x => /favorite/.test(x.textContent));
  return el ? { id: el.id,
    sub: (el.querySelector('.sub') || {}).textContent } : null;
});
await p.evaluate(() => {
  const el = Array.from(document.querySelectorAll('#grid .tile.wgt-device'))
    .find(x => /favorite/.test(x.textContent));
  el?.click();
});
await p.waitForTimeout(120);
r.buttonPress = await p.evaluate(() => {
  const m = window._sent.filter(x => x.type === 'call_service').pop();
  return m ? { domain: m.domain, service: m.service,
    target: m.target && m.target.entity_id } : null;
});

/* 11: THE STATUS LINE (v0.78.2): present.sub overrides the smart
   summary — custom text shows, intentional "" shows nothing. */
await p.evaluate(() => {
  CONFIG.activities.t_pres.present = {
    'button.t_fav': { sub: 'Adds this track to MA favorites' },
    'media_player.t_tv': { sub: '' },
  };
  CONFIG.activities.t_pres.devices = ['media_player.t_tv', 'button.t_fav'];
  navigate('controller:t_presc', true);
});
await p.waitForTimeout(150);
r.subOverride = await p.evaluate(() => {
  const out = {};
  for (const el of document.querySelectorAll('#grid .tile.wgt-device')) {
    if (/favorite/.test(el.textContent)) out.custom = (el.querySelector('.sub') || {}).textContent;
    if (el.id.includes('t_tv')) out.blank = (el.querySelector('.sub') || {}).textContent;
  }
  return out;
});

/* 12: v0.79 — no preset glow, the default landing, live {tokens} */
await p.evaluate(() => {
  CONFIG.controllers.t_presc3 = { name: 'Hub3', class: 'group', type: 'hub',
    sections: [{ tiles: [
      { id: 'pp', type: 'preset', label: 'Discover', icon: 'material:play_circle',
        activity: 't_pres',
        action: { service: 'music_assistant.play_media',
          target: 'media_player.t_tv', data: { media_id: 'library://playlist/41' } } },
    ] }] };
  CONFIG.activities.t_pres.present = {
    'media_player.t_tv': { sub: 'Now: {media_title}' } };
  CONFIG.activities.t_pres.devices = ['media_player.t_tv'];
  CONFIG.activities.t_pres.extra_devices = [];
  S.states.set('media_player.t_tv', { s: 'playing',
    a: { friendly_name: 't_tv', media_title: 'Dear August', volume_level: 0.4 } });
  S.states.set('select.harmonium_porch_activity', { s: 't_pres', a: {} });
  S.lastAct = 't_pres';
  navigate('controller:t_presc3', true);
  window._sent = [];
});
await p.waitForTimeout(150);
r.presetGlow = await p.evaluate(() => {
  const el = document.getElementById('tile_pp');
  return el ? el.classList.contains('on') : null;   /* must be FALSE */
});
await p.evaluate(() => document.getElementById('tile_pp')?.click());
await p.waitForTimeout(200);
r.defaultLanding = await p.evaluate(() => S.screen);  /* expect controller:t_presc */
r.liveToken = await p.evaluate(() => {
  const el = Array.from(document.querySelectorAll('#grid .tile.wgt-device'))
    .find(x => x.id.includes('t_tv'));
  return el ? (el.querySelector('.sub') || {}).textContent : null;
});

r.errs = errs;
console.log(JSON.stringify(r, null, 1));
await b.close();
process.exit(errs.length ? 1 : 0);
