/* FOCUS RING OFF (v0.87.0 — a tester on an old iPhone: "a setting to
   turn off the orange highlight ring, everywhere"). The theme key
   `focus-ring` takes a colour (re-tints the d-pad cursor) or the word
   "off" (paints it transparent everywhere it would show). Transparent,
   not absent: the .focused class and S.focusId are untouched, so a
   d-pad remote that shares the config keeps its cursor logic. A remote
   profile's style map carries the same key, so one touch-only phone
   can turn it off while the d-pad remotes keep theirs. */
import { chromium } from 'playwright-core';
const errs = []; const ck = (n, c) => { if (!c) errs.push(n); };

const base = (theme, remotes) => ({
  version: 2, home_screen: 'den', screen_order: ['den'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  theme, remotes,
  devices: {}, activities: {},
  screens: { den: { name: 'Den', type: 'hub', room: true,
    sections: [{ role: 'devices', hero_label: 'Devices',
      tiles: [
        { id: 'a', type: 'device', entity: 'light.a', label: 'A' },
        { id: 'b', type: 'device', entity: 'light.b', label: 'B' },
      ] }] } },
});
const STATES = {
  'light.a': { s: 'on', a: { friendly_name: 'A' } },
  'light.b': { s: 'off', a: { friendly_name: 'B' } },
  'select.harmonium_den_activity': { s: 'off', a: { options: ['off'] } },
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function boot(cfg, devName) {
  const ctx = await b.newContext({ viewport: { width: 480, height: 800 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
  await ctx.route('**/config.json*', r => r.fulfill({ json: cfg }));
  await p.addInitScript(({ STATES, devName }) => {
    localStorage.setItem('hakr_token', 't');
    localStorage.setItem('hakr_host', 'localhost:8482');
    if (devName) localStorage.setItem('hakr_device', devName);
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
        } else reply({ type: 'result', id: msg.id, success: true, result: null });
      }
      close() {}
    };
  }, { STATES, devName });
  await p.goto('http://localhost:8482/index.html');
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => {
    const f = document.querySelector('.tile.focused');
    const cs = f && getComputedStyle(f);
    return {
      noring: document.documentElement.classList.contains('noring'),
      focusId: S.focusId || null,
      focusedClass: !!f,
      border: cs ? cs.borderTopColor : null,
      bg: cs ? cs.backgroundImage + '|' + cs.backgroundColor : null,
      ringVar: getComputedStyle(document.documentElement).getPropertyValue('--focus-ring').trim(),
      ringInline: document.documentElement.style.getPropertyValue('--focus-ring'),
    };
  });
  await ctx.close();
  return r;
}

const ACC = 'rgb(255, 176, 32)';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

/* 1. default — the ring is the accent, as ever */
const d = await boot(base({}, {}));
ck('default: a tile is focused', d.focusedClass && !!d.focusId);
ck('default: no noring class', !d.noring);
ck('default: ring paints in the accent', d.border === ACC);
ck('default: the wash lifts the focused tile', /gradient/.test(d.bg));

/* 2. theme focus-ring: off — transparent everywhere, cursor intact */
const off = await boot(base({ 'focus-ring': 'off' }, {}));
ck('off: html.noring set', off.noring);
ck('off: ring paints transparent', off.border === TRANSPARENT);
ck('off: the lift behind it is gone too (no visible wash)',
  !/rgba\(255, 176, 32/.test(off.bg));
ck('off: the cursor still exists (class + S.focusId)', off.focusedClass && off.focusId === d.focusId);
ck('off: the word never lands in the CSS var (would fall to currentColor)', off.ringInline === '');

/* 3. a colour re-tints */
const green = await boot(base({ 'focus-ring': '#4ade80' }, {}));
ck('colour: ring paints in the given colour', green.border === 'rgb(74, 222, 128)');
ck('colour: no noring class', !green.noring);

/* 4. the spelling variants the engine accepts */
for (const w of ['none', 'false', '0', 'OFF']) {
  const v = await boot(base({ 'focus-ring': w }, {}));
  ck('off spelled "' + w + '"', v.noring && v.border === TRANSPARENT);
}

/* 5. per remote: the phone profile turns it off, the d-pad remote keeps it */
const cfg = base({}, {
  phone: { name: 'Old phone', style: { 'focus-ring': 'off' } },
  pad: { name: 'D-pad remote' },
});
const phone = await boot(cfg, 'phone');
const pad = await boot(cfg, 'pad');
ck('phone profile: off', phone.noring && phone.border === TRANSPARENT);
ck('d-pad profile on the same config: ring intact', !pad.noring && pad.border === ACC);

/* 6. a profile can also switch it back ON over a theme that says off */
const cfg2 = base({ 'focus-ring': 'off' }, { pad: { name: 'D-pad', style: { 'focus-ring': '#ffb020' } } });
const back = await boot(cfg2, 'pad');
ck('profile colour overrides a theme-level off', !back.noring && back.border === ACC);

/* 7. static: no .focused rule paints through --accent directly */
import { readFileSync } from 'node:fs';
for (const f of ['grid', 'chrome', 'controls', 'widgets']) {
  const css = readFileSync(new URL('../src/styles/' + f + '.css', import.meta.url), 'utf8');
  /* rule bodies: any block whose selector mentions .focused must not
     use var(--accent) for border/outline/box-shadow */
  const re = /([^{}]*\.focused[^{}]*)\{([^}]*)\}/g; let m;
  while ((m = re.exec(css))) {
    /* the fallback spelling var(--focus-ring, var(--accent)) is the
       sanctioned one — strip it before looking for a bare --accent */
    const body = m[2].replace(/var\(--focus-ring,\s*var\(--accent\)\)/g, 'RING');
    if (/(border(-color)?|outline|box-shadow)\s*:[^;]*var\(--accent\)/.test(body))
      errs.push(f + '.css: a .focused rule still paints the ring with --accent: ' + m[1].trim().slice(0, 60));
  }
}

console.log(JSON.stringify({ d, off, green, phone, pad, back, ok: errs.length === 0, errs }, null, 1));
await b.close();
if (errs.length) process.exit(1);
