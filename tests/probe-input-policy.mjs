/* INPUT POLICY REFEREE (v0.85.7 round 2 — Suresh: "I want the
   navigation we agreed"). His install carried the pre-v0.85 policy
   verbatim (short "app", hold control_target) because input policy
   had no healer. Fingerprint doctrine, node-side pins:
     1. the exact OLD SHIPPED shape heals to current;
     2. an EDITED policy is the user's — untouched;
     3. current stays current (idempotent);
     4. absent input: untouched. */
import { readFileSync } from "node:fs";
import { healInputPolicy, STOCK_INPUT_POLICY }
  from "../studio-src/src/lib/stocklib.js";

const errs = [];
const ck = (n, c) => { console.log((c ? "ok   " : "FAIL ") + n); if (!c) errs.push(n); };
const clone = (o) => JSON.parse(JSON.stringify(o));

/* the real shipped shape, straight from the tagged snapshot */
const OLD = JSON.parse(readFileSync(
  new URL("../tools/starter-history/starter-v0.84.1.json", import.meta.url),
  "utf8")).input.physical_buttons;

const c1 = { input: { physical_buttons: clone(OLD) } };
healInputPolicy(c1);
ck("old shipped shape heals to current",
  JSON.stringify(c1.input.physical_buttons) === JSON.stringify(STOCK_INPUT_POLICY));
ck("healed shape has hold home = room_home (long press → the app)",
  c1.input.physical_buttons.hold.home === "room_home");

const edited = clone(OLD);
edited.hold_ms.navigation = 700;               /* one deliberate tweak */
const c2 = { input: { physical_buttons: clone(edited) } };
healInputPolicy(c2);
ck("edited policy is the user's — untouched",
  JSON.stringify(c2.input.physical_buttons) === JSON.stringify(edited));

const c3 = { input: { physical_buttons: clone(STOCK_INPUT_POLICY) } };
healInputPolicy(c3);
healInputPolicy(c3);
ck("current stays current (idempotent)",
  JSON.stringify(c3.input.physical_buttons) === JSON.stringify(STOCK_INPUT_POLICY));

const c4 = { global: {} };
healInputPolicy(c4);
ck("absent input untouched", !c4.input);

console.log(errs.length ? "\ninput-policy: FAIL" : "\ninput-policy: ALL PASS");
process.exit(errs.length ? 1 : 0);
