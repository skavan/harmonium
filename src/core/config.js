/* ================================================================
   CONFIG — loaded from config.json at boot. Everything user-
   specific (screens, sections, activities, keymap, theme) is data.
   ================================================================ */
let CONFIG = null;
let WS = "main";  /* WORKSPACE (v0.34) — which world this remote lives
                     in. main = the repo-built config.json; any other
                     id loads config.<ws>.json (Studio-published).
                     Provisioned like `device`: #ws=bedroom once →
                     localStorage. Rides along on harmonium.* service
                     calls so sequences run from the right workspace. */
let DEVICE = {};                              // active device profile
let CAPS = new Set(["touch", "pointer"]);     // its capabilities

let KEYMAP = {                    // default shell quirk table
  "ArrowUp": "up", "ArrowDown": "down", "Tab": "down",
  "ArrowLeft": "left", "ArrowRight": "right",
  "Enter": "select", " ": "select",
  "+": "vol_up", "=": "vol_up", "-": "vol_down",
  "PageUp": "ch_up", "PageDown": "ch_down",
  "m": "mute", "M": "mute",
  "`": "mute", "AudioVolumeMute": "mute",      // Astrion mute = backtick (kc 192)
  "[": "back", "Escape": "back", "Backspace": "back",
  "]": "home", ";": "home",
  "F1": "home", "BrowserHome": "home",          // Astrion home = F1 (kc 112)
  "{": "back_hold", "}": "home_hold",           // shell long-press keys
  "#": "menu",                                   // Astrion menu key
  "@": "menu_hold",                              // menu long-press (KeyMapper)
  "'": "ch_up_hold", "/": "ch_down_hold",        // CH long-press → LCD focus
  ",": "left_hold", ".": "right_hold",           // ◀▶ long-press (KeyMapper)
  "F2": "power", "p": "power", "P": "power",
  "o": "power_hold", "O": "power_hold"
};

async function loadConfig(ws) {
  /* a non-main workspace reads its own deployed file; if it isn't
     there (deleted, never published) fall back to main so the remote
     still boots — with a flag the caller can surface */
  if (ws && ws !== "main") {
    const r = await fetch("config." + ws + ".json", { cache: "no-store" });
    if (r.ok) return { cfg: await r.json(), ws };
  }
  const r = await fetch("config.json", { cache: "no-store" });
  if (!r.ok) throw new Error("config.json: HTTP " + r.status);
  return { cfg: await r.json(), ws: "main", missed: ws && ws !== "main" ? ws : null };
}

let THEMED = [];   /* vars set by the last applyTheme — cleared first so
                      a REMOVED key falls back to the stylesheet default
                      (live Studio editing relies on this) */
/* focus-ring (v0.87.0): a colour rides through as the --focus-ring
   token like any other key; the words off / none / false / 0 mean
   "no ring" and become html.noring instead (an invalid colour in the
   token would fall to currentColor and paint a WHITE ring — the
   opposite of what was asked). The class is recomputed on every
   apply, so a remote profile can switch it either way (remotes.<id>
   .style rides the same map: a touch-only phone turns it off while
   the d-pad remotes keep theirs). */
const RING_OFF = /^(off|none|false|0|no)$/i;
function applyTheme(theme) {
  for (const k of THEMED) document.documentElement.style.removeProperty(k);
  THEMED = [];
  let noring = false;
  for (const [k, v] of Object.entries(theme || {})) {
    if (k === "focus-ring" && RING_OFF.test(String(v).trim())) { noring = true; continue; }
    document.documentElement.style.setProperty("--" + k, v);
    THEMED.push("--" + k);
  }
  document.documentElement.classList.toggle("noring", noring);
}
