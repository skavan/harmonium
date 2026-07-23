#!/usr/bin/env node
/* Harmonium build — reassembles the single-file deployable from src/.
   Zero dependencies: concatenation in a defined order into the HTML
   template, plus a config copy. Output: dist/index.html + dist/config.json.

   The single-file artifact is the PRODUCT (instant-on kiosk load, one
   /local/ drop-in); the modular src/ tree is for humans. Order matters
   only at declaration-execution level — widgets register themselves on
   the WIDGETS registry, so widget file order is alphabetical-friendly. */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const src = p => readFileSync(join(ROOT, "src", p), "utf8");

const STYLES = [
  "styles/tokens.css",     // design tokens + resets + app shell
  "styles/chrome.css",     // status bar + hero banner + jump strip
  "styles/widgets.css",    // widget-specific bodies (rows, bars, detail primitives)
  "styles/grid.css",       // screen grid + tile chassis
  "styles/controls.css",   // trailing zones, meters, touch buttons, dpad ring
  "styles/auth.css",       // auth overlay + .hidden
];

const SCRIPTS = [
  "core/header.js",        // architecture comment + TIMING tunables
  "core/config.js",        // CONFIG globals, loadConfig, theme
  "core/socket.js",        // websocket: auth → filtered subscribe → diffs
  "core/context.js",       // $context resolution, entity_options, subscriptions
  "core/activities.js",    // activity lifecycle, presets, actions
  "core/details.js",       // generated detail screens (steppers/chips/compositions)
  "widgets/registry.js",   // WIDGETS = {} + shared capture/wiring helpers
  // widget adapters (self-registering; order-independent)
  "widgets/light.js", "widgets/fan.js", "widgets/script.js", "widgets/nav.js",
  "widgets/preset.js", "widgets/transport.js",
  "widgets/mediabtns.js", "widgets/buttons.js", "widgets/activity.js",
  "widgets/climate.js", "widgets/media.js", "widgets/volume.js",
  "widgets/power.js", "widgets/cover.js", "widgets/coverbtns.js",
  "widgets/stepper.js", "widgets/chips.js", "widgets/passthrough.js",
  "widgets/dpad.js", "widgets/device.js",
  "widgets/helpers.js",    // command maps, cmdFor, nudge helpers
  "ui/render.js",          // banner/hero/grid/tile rendering + navigate
  "ui/focus.js",           // spatial focus, trails, capture
  "ui/input.js",           // key routing, passthrough, holds
  "ui/boot.js",            // auth overlay + provisioning + boot
];

const template = src("index.template.html");
const css = STYLES.map(src).join("\n");
const js = SCRIPTS.map(src).join("\n");

const out = template
  .replace("/*__STYLES__*/", () => css)
  .replace("/*__SCRIPT__*/", () => js);

mkdirSync(join(ROOT, "dist"), { recursive: true });
writeFileSync(join(ROOT, "dist", "index.html"), out);

/* Config: the yaml/ v2 authoring model is the SOURCE OF TRUTH — every
   build recompiles it and ships the result as dist/config.json.
   config/config.json remains as the frozen v1 reference (and the
   fallback when no Python is available to run the compiler). */
let configNote = "dist/config.json (v1 fallback)";
let compiled = false;
if (existsSync(join(ROOT, "yaml", "config.yaml"))) {
  const py = ["python3", "python", "uv"].find(cmd =>
    spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0);
  if (!py) {
    console.warn("yaml/: no python found — shipping v1 fallback config (run `uv run yaml/build_config.py` and rebuild)");
  } else {
    const args = py === "uv"
      ? ["run", join(ROOT, "yaml", "build_config.py")]
      : [join(ROOT, "yaml", "build_config.py")];
    const r = spawnSync(py, args, { encoding: "utf8" });
    if (r.status !== 0) {
      console.error("yaml/ v2 config INVALID:\n" + (r.stderr || r.stdout));
      process.exit(1);
    }
    copyFileSync(join(ROOT, "yaml", "config.v2.json"), join(ROOT, "dist", "config.json"));
    configNote = "dist/config.json (v2: " + r.stdout.trim().replace(/^wrote [^:]*: /, "") + ")";
    compiled = true;
  }
}
if (!compiled)
  copyFileSync(join(ROOT, "config", "config.json"), join(ROOT, "dist", "config.json"));
console.log(`built dist/index.html (${out.length} bytes) + ${configNote}`);
