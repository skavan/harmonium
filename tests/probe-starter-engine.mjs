import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const engine = readFileSync('/root/work/harmonium/dist/index.html', 'utf8');
const starter = readFileSync('/root/work/harmonium/custom_components/harmonium/starter-config.json', 'utf8');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 349, height: 581 } });
const errs = [];
await ctx.route('**/local/harmonium/config.json*', r => r.fulfill({ body: starter, contentType: 'application/json' }));
await ctx.route('**/local/harmonium/index.html*', r => r.fulfill({ body: engine, contentType: 'text/html' }));
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8482/local/harmonium/index.html');
await p.waitForTimeout(1800);
const r = await p.evaluate(() => ({
  screen: S.screen,
  title: document.body.textContent.includes('New Room'),
  actsHero: document.body.textContent.includes('Activities'),
  tiles: document.querySelectorAll('#grid .tile').length,
}));
console.log(JSON.stringify({ r, errs }));
await b.close();
