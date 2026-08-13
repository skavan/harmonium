import { copyFileSync, statSync } from "node:fs";
const out = "../custom_components/harmonium/studio/studio.html";
copyFileSync("build/index.html", out);
console.log(`studio.html -> ${out} (${statSync(out).size} bytes)`);
