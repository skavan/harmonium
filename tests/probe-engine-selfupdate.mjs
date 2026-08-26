/* ENGINE SELF-UPDATE (v0.85.7 — Suresh: "Are you sure about your
   never reload again? I have to clear cache and reload from fully").
   On (re)connect and on wake, the engine compares its booted ?v=
   against /api/harmonium/engine_version and reloads through the
   stub when they differ. Fences:
     1. booted ?v=OLD, server says NEW → exactly ONE reload;
     2. after the reload the loop guard holds (same target hash →
        no second reload, even though the fixture still boots OLD);
     3. booted ?v=X, server says X → no reload;
     4. no ?v= at all (bare boot) → no reload;
     5. PREVIEW → no reload. */
import { chromium } from 'playwright-core';

const CONFIG = {
  version: 2, home_screen: 'h', screen_order: ['h'],
  global: { room: 'X' },
  remotes: { default: { capabilities: ['touch', 'pointer'] } },
  screens: { h: { name: 'H', tiles: [
    { id: 't1', type: 'preset', icon: 'material:home', label: 'T', action: {} } ] } },
};

async function boot(hash, serverV, opts) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 350, height: 582 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
  await ctx.route('**/config.json*', r => r.fulfill({ json: CONFIG }));
  await ctx.route('**/api/harmonium/engine_version*', r =>
    r.fulfill({ json: { v: serverV }, headers: { 'Cache-Control': 'no-store' } }));
  await p.addInitScript(() => {
    localStorage.setItem('hakr_token', 't');
    localStorage.setItem('hakr_host', 'localhost:8482');
    // count real loads across reloads
    window.name = window.name || '0';
    window.name = String(Number(window.name) + 1);
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
  await p.goto('http://localhost:8482/index.html' + (opts && opts.q || '') + hash);
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => ({
    loads: Number(window.name),
    path: location.pathname,
    upg: (() => { try { return sessionStorage.getItem('hakr_upg'); } catch (e) { return null; } })(),
  }));
  await b.close();
  return { ...r, errs };
}

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

/* 1+2: OLD boot, NEW deployed → one reload, then the guard holds.
   The fixture always serves ?q v=OLD (the "stub" here is the same
   page), so without the guard this would reload forever. */
const a = await boot('', 'NEWHASH', { q: '?v=OLDHASH' });
ck('mismatch reloaded once, guard held (loads=' + a.loads + ')', a.loads === 2);
ck('guard remembers the target (' + a.upg + ')', a.upg === 'NEWHASH');

/* 3: matching version → no reload */
const c = await boot('', 'SAMEHASH', { q: '?v=SAMEHASH' });
ck('matching v never reloads (loads=' + c.loads + ')', c.loads === 1);

/* 4: bare boot (no ?v=) → nothing to compare, no reload */
const d = await boot('', 'NEWHASH', { q: '' });
ck('bare boot never reloads (loads=' + d.loads + ')', d.loads === 1);

/* 5: preview → never */
const e = await boot('#preview=1', 'NEWHASH', { q: '?v=OLDHASH' });
ck('preview never reloads (loads=' + e.loads + ')', e.loads === 1);

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
if (errs.length) process.exit(1);
