import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(
  new URL('../custom_components/harmonium/manifest.json', import.meta.url),
  'utf8'));
const engine = readFileSync(new URL('../src/core/diag.js', import.meta.url), 'utf8');
const studio = readFileSync(
  new URL('../studio-src/src/lib/state.svelte.js', import.meta.url), 'utf8');

const engineVersion = engine.match(/const ENGINE_V = "([^"]+)";/)?.[1];
const studioStamp = studio.match(/export const STUDIO_V = "([^"]+) b(\d+)";/);
const errors = [];

if (engineVersion !== manifest.version) {
  errors.push(`ENGINE_V ${engineVersion || 'missing'} != manifest ${manifest.version}`);
}
if (studioStamp?.[1] !== manifest.version) {
  errors.push(`STUDIO_V ${studioStamp?.[1] || 'missing'} != manifest ${manifest.version}`);
}
if (!studioStamp || Number(studioStamp[2]) < 55) {
  errors.push(`STUDIO_V build counter ${studioStamp?.[2] || 'missing'} reset below b55`);
}

console.log(JSON.stringify({
  manifest: manifest.version,
  engine: engineVersion,
  studio: studioStamp ? `${studioStamp[1]} b${studioStamp[2]}` : null,
  errs: errors,
}, null, 2));

if (errors.length) process.exit(1);