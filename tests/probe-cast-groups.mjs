/* CAST GROUPS fence (2026-09-05 groups round — Suresh: "Add Group in
   an activity is flaky"). Two sides:

   ENGINE — the defects his Basement Sonos Bass hit:
   · a grouped PRE-WIRED device's entities leave the Devices band
     (the old filter matched member STRINGS only, so ticking a
     pre-wired device into a group changed nothing on the panel:
     "It shows independtly - and the group stays hidden");
   · the group's nav card draws (summary, non-empty) and its page
     wears the GROUP's name ("for the title to represent the groups
     name");
   · under roles-only preview-as, a group with no role-filling
     members folds away with the rest of the riders.

   STUDIO — the flaky flow, walked end to end:
   · the group card SAYS why it can't draw ("I should have some
     indicator - so I go and turn it on"): the Cast-group cards band
     switched off gets a Turn-it-on button; a landing page with no
     groups band gets an honest note;
   · a device cast while the edit pane is OPEN appears in the tick
     list at once ("adding a new device to the cast isn't reflected
     until I close the pane");
   · done → edit reopens the pane ("I can't open it again");
   · "Members draw as" writes g.shows (the subpage default — "select
     how the tile renders on its subpage [i.e. Launcher | inline]");
   · removing a loose entity from the cast sweeps its group
     membership (the stale member that made re-adding lie). */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

/* ================= ENGINE ================= */
const ECFG = { version: 2, home_screen: 'p', screen_order: ['p'],
  global: { room: 'P', activity_select: 'select.act' },
  controllers: { music: { name: 'Music', class: 'activity', type: 'controller',
    sections: [{ tiles: [
      { id: 'np', type: 'media', entity: '$context.media_player', span: 2 },
      { id: 'vols', type: 'volumes' },
      { id: 'grps', type: 'groups' },
      { id: 'cast', type: 'devices' } ] }] } },
  remotes: { default: { capabilities: ['physical_dpad', 'touch', 'pointer'] } },
  activities: { music: { name: 'Listen to Music', room_view: 'p',
    screen: 'controller:music',
    /* ONE ordered cast (round 3): the loose entity is a first-class
       member sitting BETWEEN the device and the group; a legacy
       extra_devices entity still trails (unmigrated-config read) */
    cast: ['sonos_dev', 'media_player.pamp',
      { group: 'zone', name: 'Zones', members: ['amp_dev'],
        /* feedback-3 round 2: the authored status line */
        sub: '{count} zones · {active} live' }],
    devices: ['media_player.sonos', 'media_player.amp', 'media_player.pamp',
      'media_player.legamp'],
    extra_devices: ['media_player.legamp'],
    present: { 'media_player.pamp': { where: 'controls', type: 'volume' },
      'media_player.legamp': { where: 'controls', type: 'volume' } },
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
  let ids = await p.evaluate(() =>
    [...document.querySelectorAll('.tile')].map(x => x.id).join('|'));
  ck('engine: ungrouped cast device renders in Devices',
    /cast_media_player_sonos/.test(ids));
  ck('engine: grouped device\'s entity LEAVES the Devices band',
    !/cast_media_player_amp/.test(ids));
  /* round 8 ("Honor the order in the Controller"): bands are
     separate again — the volumes tile emits volume rows only, the
     groups tile emits the cards and promos, and the STACKING of
     whole bands is the Controller tab's ↑↓ order (round 7's merged
     band and the rounds-4-6 lead hoist are retired) */
  ck('engine: the group\'s nav card draws (in the groups band)', /grps_zone/.test(ids));
  ck('engine: the volumes band carries no group cards (bands separate)',
    !/vols_zone/.test(ids));
  /* round 3 — ONE ordered cast: the groups band walks a.cast in
     order, so the in-cast loose promotion sits before the group
     card, and the legacy extra_devices promotion trails everything */
  ck('engine: the in-cast loose promotion renders at its cast position (before the card)',
    ids.indexOf('grps_media_player_pamp') >= 0 &&
    ids.indexOf('grps_media_player_pamp') < ids.indexOf('grps_zone'));
  ck('engine: the legacy extra_devices promotion trails the cast',
    ids.indexOf('grps_media_player_legamp') > ids.indexOf('grps_zone'));
  /* the group moves like any other tile: swap it above the loose
     member in a.cast and the band re-draws in the new order */
  ck('engine: moving the group in a.cast reorders the band', await p.evaluate(() => {
    const c = CONFIG.activities.music.cast;
    [c[1], c[2]] = [c[2], c[1]];        /* group above the loose member */
    S.stack = []; navigate('controller:music', true);
    return new Promise(res => setTimeout(() => {
      const ids2 = [...document.querySelectorAll('.tile')].map(x => x.id).join('|');
      [c[1], c[2]] = [c[2], c[1]];      /* restore */
      S.stack = []; navigate('controller:music', true);
      res(ids2.indexOf('grps_zone') >= 0 &&
        ids2.indexOf('grps_zone') < ids2.indexOf('grps_media_player_pamp'));
    }, 250));
  }));
  ck('engine: the authored status line substitutes {count}/{active}',
    await p.evaluate(() =>
      /1 zones · 0 live/.test(document.querySelector('[id$="grps_zone"]')?.textContent || '')));
  ck('engine: sub "" blanks the line entirely', await p.evaluate(() => {
    const g2 = CONFIG.activities.music.cast.filter(m => m && m.group)[0];
    const saved = g2.sub;
    g2.sub = '';
    S.stack = []; navigate('controller:music', true);
    return new Promise(res => setTimeout(() => {
      const txt = document.querySelector('[id$="grps_zone"]')?.textContent || '';
      g2.sub = saved;
      S.stack = []; navigate('controller:music', true);
      res(!/zones|entities/.test(txt));
    }, 250));
  }));

  /* ONE ORDER LEVER (round 8 — "Remove the order stuff from the
     Setup Tab... Honor the order in the Controller"): whole bands
     stack in the Controller tab's ↑↓ order (surface.band_order) and
     NOTHING second-guesses it — the rounds-4-7 lead hoist is gone,
     so a group leading the cast changes nothing about the stacking */
  ck('engine: no band_order — bands keep the section\'s authored order (NP, volume, then the card)',
    ids.indexOf('tile_np') >= 0 &&
    ids.indexOf('tile_np') < ids.indexOf('tile_vols_sonos_dev') &&
    ids.indexOf('tile_vols_sonos_dev') < ids.indexOf('tile_grps_zone'));
  ck('engine: a group LEADING the cast does NOT hoist — the Controller\'s order stands',
    await p.evaluate(() => {
      const c = CONFIG.activities.music.cast;
      const g = c.splice(2, 1)[0];       /* the group, to the front */
      c.unshift(g);
      S.stack = []; navigate('controller:music', true);
      return new Promise(res => setTimeout(() => {
        const ids2 = [...document.querySelectorAll('.tile')].map(x => x.id).join('|');
        const gfirst = c.shift(); c.splice(2, 0, gfirst);   /* restore */
        S.stack = []; navigate('controller:music', true);
        res(ids2.indexOf('tile_np') >= 0 &&
          ids2.indexOf('tile_np') < ids2.indexOf('tile_vols_sonos_dev') &&
          ids2.indexOf('tile_vols_sonos_dev') < ids2.indexOf('tile_grps_zone'));
      }, 250));
    }));
  ck('engine: band_order puts the group cards first when the Controller says so',
    await p.evaluate(() => {
      const a2 = CONFIG.activities.music;
      a2.surface = { band_order: ['groups', 'volume'] };
      S.stack = []; navigate('controller:music', true);
      return new Promise(res => setTimeout(() => {
        const ids2 = [...document.querySelectorAll('.tile')].map(x => x.id).join('|');
        delete a2.surface;
        S.stack = []; navigate('controller:music', true);
        res(ids2.indexOf('tile_grps_zone') >= 0 &&
          ids2.indexOf('tile_grps_zone') < ids2.indexOf('tile_vols_sonos_dev'));
      }, 250));
    }));

  await p.evaluate(() => navigate('group:zone'));
  await p.waitForTimeout(300);
  const gpage = await p.evaluate(() => ({
    name: screenOf(S.screen).name,
    ids: [...document.querySelectorAll('.tile')].map(x => x.id).join('|'),
  }));
  ck('engine: the group page wears the GROUP\'s name',
    gpage.name === 'Zones');
  ck('engine: the member draws on the group page',
    /g_zone_amp_dev/.test(gpage.ids));

  /* roles-only preview-as: the group's members fill no role → the
     card folds with the rest of the riders */
  await p.evaluate(() => { S.pvActivity = 'music'; S.pvRolesOnly = true;
    S.stack = []; navigate('controller:music', true); });
  await p.waitForTimeout(300);
  ids = await p.evaluate(() =>
    [...document.querySelectorAll('.tile')].map(x => x.id).join('|'));
  ck('engine: roles-only folds the no-role group card', !/grps_zone/.test(ids));
  ck('engine: roles-only keeps the role-filler', /cast_media_player_sonos/.test(ids));
  await p.close();
}

/* ================= STUDIO ================= */
{
  const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
  const studio = readFileSync('/tmp/studio-test/build/index.html', 'utf8');
  const config = JSON.parse(readFileSync('/root/work/harmonium/dist/config.json', 'utf8'));
  /* the flaky start: the Cast-group cards band is OFF */
  config.activities.music.surface = { groups: false };
  const ctx = await b.newContext({ viewport: { width: 1680, height: 1400 } });
  let posted = null;
  await ctx.route('**/api/harmonium/config*', r => r.request().method() === 'GET'
    ? r.fulfill({ json: config })
    : (posted = r.request().postDataJSON(), r.fulfill({ json: { ok: true } })));
  await ctx.route('**/api/harmonium/workspaces', r =>
    r.fulfill({ json: { order: ['main'], workspaces: { main: { name: 'Main', file: 'x', path: '/x/' } } } }));
  await ctx.route('**/api/harmonium/pair_admin*', r => r.fulfill({ json: { pending: [] } }));
  await ctx.route('**/api/harmonium/engine_version', r => r.fulfill({ json: { version: 'x' } }));
  await ctx.route('**/api/states', r => r.fulfill({ json: [
    { entity_id: 'media_player.test_loose', state: 'idle',
      attributes: { friendly_name: 'Loose Amp' } }] }));
  await ctx.route('**/api/services', r => r.fulfill({ json: [] }));
  await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
  await ctx.route('**/harmonium-static/studio.html', r => r.fulfill({ body: studio, contentType: 'text/html' }));
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('studio pageerror: ' + String(e.message).slice(0, 140)));
  await p.addInitScript(() => localStorage.setItem('hakr_token', 't'));
  await p.goto('http://localhost:8482/harmonium-static/studio.html');
  await p.waitForTimeout(2000);
  await p.evaluate(() => {
    [...document.querySelectorAll('#nav .item')].find(el => el.textContent.includes('Porch'))?.click();
  });
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find(x => /^[▶▼]/.test(x.textContent.trim()) && x.textContent.includes('Listen to Music'))?.click();
  });
  await p.waitForTimeout(700);

  const body = () => p.evaluate(() => document.body.textContent.replace(/\s+/g, ' '));
  const click = (txt) => p.evaluate((t) => {
    const el = [...document.querySelectorAll('button')]
      .find(x => x.textContent.trim() === t);
    el?.click(); return !!el;
  }, txt);

  /* ⊞ Add group opens the edit pane */
  ck('studio: Add group button found', await click('⊞ Add group'));
  await p.waitForTimeout(400);
  let t = await body();
  ck('studio: edit pane open (Status line offered)',
    t.includes('Status line'));
  ck('studio: the Members-draw-as select is retired (feedback-3 round 2)',
    !t.includes('Members draw as'));
  /* indicator stage 1: the band is switched off — say so, offer the fix */
  ck('studio: band-off indicator', t.includes('Cast-group cards') &&
    t.includes('switched off'));
  ck('studio: Turn it on button', await click('Turn it on'));
  await p.waitForTimeout(300);
  t = await body();
  /* band back on: the stock music controller CARRIES a groups band,
     so no note remains at all */
  ck('studio: band-off indicator gone', !t.includes('switched off'));
  ck('studio: no note on a groups-capable target', !t.includes('nowhere to draw'));
  /* indicator stage 2: point the activity at a PLAIN page (no groups
     band anywhere) — the honest no-band note takes over */
  const setNav = (v) => p.evaluate((val) => {
    const sel = [...document.querySelectorAll('select')]
      .find(s => [...s.querySelectorAll('optgroup')].some(g => g.label === 'Controllers'));
    if (sel) { sel.value = val;
      sel.dispatchEvent(new Event('change', { bubbles: true })); }
    return !!sel;
  }, v);
  ck('studio: Navigate-to select found', await setNav('porch'));
  await p.waitForTimeout(300);
  t = await body();
  ck('studio: no-groups-band note appears on a plain page',
    t.includes('nowhere to draw'));
  await setNav('controller:music');
  await p.waitForTimeout(300);
  t = await body();
  ck('studio: note clears when the target has the band again',
    !t.includes('nowhere to draw'));

  /* cast a library device WHILE the pane is open — it must appear in
     the tick list without closing anything */
  await p.evaluate(() => {
    const inp = [...document.querySelectorAll('input')]
      .find(x => (x.placeholder || '').startsWith('cast a device'));
    inp?.focus();
  });
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find(x => x.textContent.includes('⊞ Fire TV'))
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
  await p.waitForTimeout(400);
  const tickBox = () => p.evaluate(() => {
    const lbl = [...document.querySelectorAll('label')]
      .find(x => x.querySelector('input[type=checkbox]') &&
        x.textContent.includes('Fire TV') && !x.textContent.includes('on controller'));
    return lbl ? { found: true, checked: lbl.querySelector('input').checked } : { found: false };
  });
  let tb = await tickBox();
  ck('studio: freshly cast device appears in the OPEN pane\'s ticks', tb.found);

  /* tick it into the group — the member row nests under the card */
  await p.evaluate(() => {
    const lbl = [...document.querySelectorAll('label')]
      .find(x => x.querySelector('input[type=checkbox]') &&
        x.textContent.includes('Fire TV') && !x.textContent.includes('on controller'));
    lbl?.querySelector('input')?.click();
  });
  await p.waitForTimeout(400);
  tb = await tickBox();
  ck('studio: the tick takes', tb.found && tb.checked);
  ck('studio: member row nests under the group', await p.evaluate(() =>
    !!document.querySelector('.border-l-2')?.textContent.includes('Fire TV')));
  /* feedback-3 alternate ruling: the member row wears a draws-as TAG
     (settings honored from its own ⚙ / the group default — the tag
     just says the resolved answer) */
  const memberTag = () => p.evaluate(() => {
    const row = [...document.querySelectorAll('.border-l-2 [title^="how this member draws"]')];
    return row.map(x => x.textContent.trim()).join('|');
  });
  ck('studio: the grouped row wears the draws-as tag (launcher default)',
    (await memberTag()) === 'launcher');

  /* done closes; edit REOPENS (his #4) */
  ck('studio: done button', await click('done'));
  await p.waitForTimeout(300);
  t = await body();
  ck('studio: pane closed on done', !t.includes('Status line'));
  ck('studio: edit button', await click('edit'));
  await p.waitForTimeout(300);
  t = await body();
  ck('studio: pane REOPENS on edit', t.includes('Status line'));

  /* the STATUS LINE takes the retired select's slot: tokens in, ∅
     for blank; the tag stays the member's own resolution */
  await p.evaluate(() => {
    const inp = [...document.querySelectorAll('input')]
      .find(x => (x.placeholder || '').startsWith('auto — 3 entities'));
    if (inp) { inp.value = '{count} controls · {active} active';
      inp.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await p.waitForTimeout(300);
  ck('studio: the tag stays the member\'s own resolution (launcher)',
    (await memberTag()) === 'launcher');
  /* round 8 ("Remove the order stuff from the Setup Tab (But keep
     it inside the group items)"): cast rows and the group card
     carry NO order arrows anymore — the Controller tab's ↑↓ is the
     one order lever; member rows KEEP theirs (the group page's
     order) */
  ck('studio: member rows keep their order arrows', await p.evaluate(() =>
    [...document.querySelectorAll('.border-l-2 button')]
      .some(x => (x.title || '').startsWith('Move up — the group page'))));
  ck('studio: cast rows and the group card carry no order arrows', await p.evaluate(() =>
    ![...document.querySelectorAll('button')]
      .some(x => (x.title || '').startsWith('Move up — the cast'))));

  /* cast a loose entity, tick it in, then REMOVE it from the cast —
     the membership must sweep with it (his #2/#3 stale member) */
  await p.evaluate(() => {
    const inp = [...document.querySelectorAll('input')]
      .find(x => (x.placeholder || '').startsWith('cast a device'));
    if (inp) { inp.focus(); inp.value = 'test_loose';
      inp.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find(x => x.textContent.includes('media_player.test_loose'))
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const lbl = [...document.querySelectorAll('label')]
      .find(x => x.querySelector('input[type=checkbox]') &&
        x.textContent.includes('Loose Amp') && !x.textContent.includes('on controller'));
    lbl?.querySelector('input')?.click();
  });
  await p.waitForTimeout(300);
  /* a GROUPED loose entity offers no cast-remove (its row nests under
     the group) — take it out via its tick first, then remove it from
     the cast; the removeExtraEnt sweep stays as the belt for legacy
     configs that already carry a dangling member */
  await p.evaluate(() => {
    const lbl = [...document.querySelectorAll('label')]
      .find(x => x.querySelector('input[type=checkbox]') &&
        x.textContent.includes('Loose Amp') && !x.textContent.includes('on controller'));
    lbl?.querySelector('input')?.click();
  });
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    [...document.querySelectorAll('button[aria-label="Remove entity"]')].pop()?.click();
  });
  await p.waitForTimeout(400);

  await p.evaluate(() => {
    [...document.querySelectorAll('button')].find(x => x.textContent.includes('Save & Deploy'))?.click();
  });
  await p.waitForTimeout(900);
  const saved = posted?.activities?.music;
  const grp = (saved?.cast || []).find(m => m && typeof m === 'object' && m.group);
  ck('studio: the group saved', !!grp);
  ck('studio: the status line saved onto the group',
    grp?.sub === '{count} controls · {active} active');
  ck('studio: no g.shows seed on a fresh group', !('shows' in (grp || {})));
  ck('studio: the ticked device is a member', (grp?.members || []).includes('fire_tv'));
  ck('studio: the removed loose entity is no member',
    !(grp?.members || []).includes('media_player.test_loose'));
  ck('studio: the removed loose entity left the cast too (one list)',
    !(saved?.cast || []).includes('media_player.test_loose'));
  ck('studio: extra_devices is never written anymore',
    !('extra_devices' in (saved || {})));
  ck('studio: Turn it on cleared surface.groups', !saved?.surface?.hasOwnProperty?.('groups')
    && !(saved?.surface && 'groups' in saved.surface));
  await ctx.close();
}

console.log(JSON.stringify({ ok: !errs.length, errs }, null, 1));
await b.close();
process.exit(errs.length ? 1 : 0);
