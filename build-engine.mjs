#!/usr/bin/env node
/* Harmonium ENGINE build — writes dist/index.html and NOTHING else.

   dist/config.json is NEVER touched by any build: it is a test
   fixture (one real house's config, which the smoke battery was
   written against). Real configs are authored in the Studio and live
   in each Home Assistant's storage — see docs/ARCHITECTURE.md.

   The STYLES / SCRIPTS lists below are THE authority on what goes
   into the engine and in what order. (They used to be parsed out of
   the legacy yaml-era build.mjs, retired to archive/yaml/ in the
   2026-08-17 cleanup.) Add a new widget or stylesheet HERE.

     node build-engine.mjs      →  dist/index.html

   Zero dependencies. */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const src = p => readFileSync(join(ROOT, "src", p), "utf8");

const STYLES = [
  "styles/tokens.css",
  "styles/chrome.css",
  "styles/widgets.css",
  "styles/grid.css",
  "styles/controls.css",
  "styles/auth.css",
  "styles/compat.css",
];

const SCRIPTS = [
  "core/header.js",
  "core/config.js",
  "core/socket.js",
  "core/context.js",
  "core/gen-cast.js",
  "core/generators.js",
  "core/gen-bands.js",
  "core/gen-browse.js",
  "core/gen-browse-amalgam.js",
  "core/gen-browse-search.js",
  "core/subscribe.js",
  "core/activities.js",
  "core/routing.js",
  "core/browse.js",
  "core/sonos-index.js",
  "core/search.js",
  "core/queue.js",
  "core/keycap.js",
  "core/diag.js",
  "core/details.js",
  "widgets/registry.js",
  "widgets/light.js",
  "widgets/fan.js",
  "widgets/script.js",
  "widgets/nav.js",
  "widgets/preset.js",
  "widgets/qrow.js",
  "widgets/transport.js",
  "widgets/mediabtns.js",
  "widgets/buttons.js",
  "widgets/activity.js",
  "widgets/climate.js",
  "widgets/media.js",
  "widgets/volume.js",
  "widgets/grouping.js",
  "widgets/power.js",
  "widgets/cover.js",
  "widgets/coverbtns.js",
  "widgets/stepper.js",
  "widgets/chips.js",
  "widgets/passthrough.js",
  "widgets/dpad.js",
  "widgets/device.js",
  "widgets/sources.js",
  "widgets/kslot.js",
  "widgets/helpers.js",
  "ui/tiles.js",
  "ui/render.js",
  "ui/focus.js",
  "ui/input.js",
  "ui/boot.js",
];

const out = src("index.template.html")
  .replace("/*__STYLES__*/", () => STYLES.map(src).join("\n"))
  .replace("/*__SCRIPT__*/", () => SCRIPTS.map(src).join("\n"));

mkdirSync(join(ROOT, "dist"), { recursive: true });
writeFileSync(join(ROOT, "dist", "index.html"), out);
console.log(
  `built dist/index.html (${out.length} bytes) from ` +
  `${STYLES.length} styles + ${SCRIPTS.length} scripts — config.json untouched`);
