#!/usr/bin/env node
/* Harmonium ENGINE-ONLY build — writes dist/index.html and NOTHING else.

   Why this exists. `build.mjs` does two jobs: it concatenates src/ into
   the single-file engine, AND it regenerates dist/config.json from the
   yaml/ authoring model (falling back to config/config.json). This
   clone has neither yaml/ nor config/ — dist/config.json IS the source
   of truth here, hand-authored and Studio-authored. Running build.mjs
   here therefore ranges from "crashes half-way" to "silently overwrites
   the config", depending on which sibling directories exist.

   So: same engine, same file order, zero chance of touching config.
   The STYLES / SCRIPTS lists are PARSED OUT OF build.mjs rather than
   duplicated, so adding a widget there can never leave this script
   building a stale engine.

     node build-engine.mjs      →  dist/index.html
     push-to-ha.bat             →  copies it to HA

   Zero dependencies, same as build.mjs. */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const src = p => readFileSync(join(ROOT, "src", p), "utf8");

const bm = readFileSync(join(ROOT, "build.mjs"), "utf8");
const list = name => {
  const m = bm.match(new RegExp("const " + name + " = \\[([\\s\\S]*?)\\n\\];"));
  if (!m) throw new Error(
    "could not find `const " + name + " = [...]` in build.mjs — the two " +
    "builds have drifted; fix this parser rather than duplicating the list");
  return [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
};

const STYLES = list("STYLES"), SCRIPTS = list("SCRIPTS");

const out = src("index.template.html")
  .replace("/*__STYLES__*/", () => STYLES.map(src).join("\n"))
  .replace("/*__SCRIPT__*/", () => SCRIPTS.map(src).join("\n"));

mkdirSync(join(ROOT, "dist"), { recursive: true });
writeFileSync(join(ROOT, "dist", "index.html"), out);
console.log(
  `built dist/index.html (${out.length} bytes) from ` +
  `${STYLES.length} styles + ${SCRIPTS.length} scripts — config.json untouched`);
