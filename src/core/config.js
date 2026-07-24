/* ================================================================
   CONFIG — loaded from config.json at boot. Everything user-
   specific (screens, sections, activities, keymap, theme) is data.
   ================================================================ */
let CONFIG = null;
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
  "F2": "power", "p": "power", "P": "power",
  "o": "power_hold", "O": "power_hold"
};

async function loadConfig() {
  const r = await fetch("config.json", { cache: "no-store" });
  if (!r.ok) throw new Error("config.json: HTTP " + r.status);
  return r.json();
}

let THEMED = [];   /* vars set by the last applyTheme — cleared first so
                      a REMOVED key falls back to the stylesheet default
                      (live Studio editing relies on this) */
function applyTheme(theme) {
  for (const k of THEMED) document.documentElement.style.removeProperty(k);
  THEMED = [];
  for (const [k, v] of Object.entries(theme || {})) {
    document.documentElement.style.setProperty("--" + k, v);
    THEMED.push("--" + k);
  }
}
