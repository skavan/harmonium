/* SHOOT-NP-STYLES — regenerates the docs/images/np-styles/*.png set
   for docs/cookbook/now-playing-styles.md. Not a probe (no asserts);
   rerun after a Now Playing style changes visually.
   Needs the icon font + cover fixture in /tmp/msym:
     mkdir -p /tmp/msym && cd /tmp/msym && npm i material-symbols
     (cover.png: any square image; font.b64: base64 of
      node_modules/material-symbols/material-symbols-outlined.woff2)
   Then: node shoot-np-styles.mjs   (dist server on :8482 required) */
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
const FONTB64 = readFileSync('/tmp/msym/font.b64','utf8');
const FONT = readFileSync('/tmp/msym/node_modules/material-symbols/material-symbols-outlined.woff2');
const COVER = readFileSync('/tmp/msym/cover.png');
mkdirSync('/root/work/harmonium/docs/images/np-styles', { recursive: true });

const mkConfig = (style) => ({
  version: 2, home_screen: 'music', screen_order: ['music'],
  global: { room: 'Den', activity_select: 'select.harmonium_den_activity' },
  theme: {},
  remotes: { default: { capabilities: ['touch', 'pointer'] } },
  activities: { listen: { name: 'Listen', room_view: 'music',
    context: { media_player: 'media_player.den' } } },
  screens: { music: { name: 'Music', type: 'hub', font_scope: 'music',
    grid: { columns: 2 },
    tiles: [
      { id: 'm_np', type: 'media', art: true, entity: 'media_player.den',
        icon: 'material:music_note', label: 'Now Playing', span: 2,
        ...(style ? { style } : {}),
        trailing: { icon: 'material:library_music', action: {}, emphasis: 'accent' } },
    ] } },
});

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [style, name] of [['plain','basic'], ['slim','slim'], ['art','art-hero-compact'], ['hero','art-hero'], ['poster','art-hero-large']]) {
  const ctx = await b.newContext({ viewport: { width: 350, height: 582 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await ctx.route('**/config.json*', r => r.fulfill({ json: mkConfig(style) }));
  await ctx.route('**/fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css',
    body: "@font-face{font-family:'Material Symbols Outlined';font-style:normal;font-weight:400;src:url(data:font/woff2;base64," + FONTB64 + ") format('woff2');}.material-symbols-outlined{font-family:'Material Symbols Outlined';font-weight:normal;font-style:normal;line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;word-wrap:normal;direction:ltr;-webkit-font-feature-settings:'liga';-webkit-font-smoothing:antialiased;}" }));
  await ctx.route('**/msym.woff2', r => r.fulfill({ contentType: 'font/woff2', body: FONT }));
  await ctx.route('**/cover.png', r => r.fulfill({ contentType: 'image/png', body: COVER }));
  await p.addInitScript(() => {
    localStorage.setItem('hakr_token', 't');
    localStorage.setItem('hakr_host', 'localhost:8482');
    window.WebSocket = class {
      constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) }), 20); }
      send(m) { const msg = JSON.parse(m);
        const reply = (o) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 15);
        if (msg.type === 'auth') reply({ type: 'auth_ok' });
        else if (msg.type === 'subscribe_entities') {
          reply({ type: 'result', id: msg.id, success: true, result: null });
          reply({ type: 'event', id: msg.id, event: { a: {
            'select.harmonium_den_activity': { s: 'listen', a: {} },
            'media_player.den': { s: 'playing', a: {
              media_title: 'Golden Hour', media_artist: 'Aster Field',
              media_album_name: 'Late Light', app_name: 'Spotify', source: 'Spotify',
              entity_picture: '/cover.png', volume_level: 0.4,
              media_duration: 214, media_position: 76,
              media_position_updated_at: new Date().toISOString() } },
          } } });
        } else reply({ type: 'result', id: msg.id, success: true, result: null });
      }
      close() {}
    };
  });
  await p.goto('http://localhost:8482/index.html');
  await p.waitForTimeout(1400);
  await p.evaluate(() => { try { setFocus(null); } catch (e) {} });
  await p.waitForTimeout(150);
  const el = p.locator('#tile_m_np');
  await el.screenshot({ path: '/root/work/harmonium/docs/images/np-styles/' + name + '.png' });
  const h = await p.evaluate(() => document.getElementById('tile_m_np').getBoundingClientRect().height);
  console.log(style, '->', name + '.png', Math.round(h) + 'px');
  await ctx.close();
}
await b.close();
