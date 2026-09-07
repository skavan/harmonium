/* WHOSE-VOICE fence (2026-09-04 — Suresh: "dialect is a device
   property everywhere and then in roles, you pick the device from
   the cast (default is primary)"). compileContext's contract:
   · default: the primary (media_player-wired) device's dialect;
   · wiring.dialect names a cast DEVICE whose dialect wins;
   · a voiceless voice-pick yields no dialect (never a guess);
   · the legacy pinned NAME (overrides.dialect) still spreads over
     the compile through recompileContext, unchanged. */
import { compileContext, recompileContext, healPinnedDialects, NORMALIZE_REPORT } from "../studio-src/src/lib/stocklib.js";

const errs = [];
const ck = (n, c) => { if (!c) errs.push(n); };

const devices = {
  firetv: { name: "Fire TV", dialect: "firetv_custom",
    roles: { media_player: "media_player.ftv", dpad: "remote.ftv" } },
  samsung: { name: "Samsung", dialect: "tizen",
    roles: { media_player: "media_player.sam", volume: "media_player.sam" } },
  soundbar: { name: "Bar", roles: { volume: "media_player.bar" } },
};

/* default: the primary device's voice */
let ctx = compileContext({ wiring: { media_player: "firetv", volume: "samsung" } }, devices);
ck("default: the primary (media_player) device's dialect", ctx.dialect === "firetv_custom");

/* the voice pick: another cast device's dialect wins */
ctx = compileContext({ wiring: { media_player: "firetv", dialect: "samsung" } }, devices);
ck("wiring.dialect: the picked device's dialect wins", ctx.dialect === "tizen");
ck("the voice pick never leaks as a role entity", !("dialect2" in ctx) &&
  ctx.media_player === "media_player.ftv");

/* a voiceless pick is honest — the primary's voice stays */
ctx = compileContext({ wiring: { media_player: "firetv", dialect: "soundbar" } }, devices);
ck("a voiceless voice-pick falls back to the primary, never guesses",
  ctx.dialect === "firetv_custom");

/* the legacy pinned NAME still spreads over everything */
const a = { wiring: { media_player: "firetv", dialect: "samsung" },
  overrides: { dialect: "pinned_thing" } };
recompileContext(a, devices);
ck("legacy overrides.dialect still wins over the voice pick",
  a.context.dialect === "pinned_thing");

/* ---- THE PIN HEAL (migration half of the ruling) ---- */
/* rung 2 — HIS PORCH SHAPE: pin firetv_custom, voiceless primary */
let cfg = { devices: { ftv: { name: "F", roles: { media_player: "media_player.f", dpad: "remote.f" } } },
  dialects: { firetv_custom: { name: "Fire TV-SE" } },
  activities: { watch: { cast: ["ftv"], wiring: { media_player: "ftv", dpad: "ftv" },
    context: {}, overrides: { dialect: "firetv_custom" } } } };
healPinnedDialects(cfg);
let w = cfg.activities.watch;
ck("rung 2: the pin becomes the voiceless primary device's OWN dialect",
  cfg.devices.ftv.dialect === "firetv_custom");
ck("rung 2: the pin is dropped and the compiled voice is unchanged",
  !w.overrides && w.context.dialect === "firetv_custom");
ck("rung 2: reported as healed", NORMALIZE_REPORT.pins === 1 && NORMALIZE_REPORT.pinsKept === 0);

/* rung 1 — a cast device already speaks the pinned dialect */
cfg = { devices: {
    ftv: { name: "F", dialect: "ftv_d", roles: { media_player: "media_player.f" } },
    sam: { name: "S", dialect: "tizen", roles: { volume: "media_player.s" } } },
  dialects: { ftv_d: {}, tizen: {} },
  activities: { watch: { cast: ["ftv", "sam"], wiring: { media_player: "ftv", volume: "sam" },
    context: {}, overrides: { dialect: "tizen" } } } };
healPinnedDialects(cfg);
w = cfg.activities.watch;
ck("rung 1: the speaker becomes the whose-voice pick",
  w.wiring.dialect === "sam" && !w.overrides && w.context.dialect === "tizen");

/* rung 3 — ambiguous: the primary already speaks something else */
cfg = { devices: { ftv: { name: "F", dialect: "other", roles: { media_player: "media_player.f" } } },
  dialects: { other: {}, mystery: {} },
  activities: { watch: { cast: ["ftv"], wiring: { media_player: "ftv" },
    context: { dialect: "mystery" }, overrides: { dialect: "mystery" } } } };
healPinnedDialects(cfg);
w = cfg.activities.watch;
ck("rung 3: an ambiguous pin is KEPT and counted, never guessed",
  w.overrides && w.overrides.dialect === "mystery" &&
  cfg.devices.ftv.dialect === "other" && NORMALIZE_REPORT.pinsKept === 1);

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
if (errs.length) process.exit(1);
