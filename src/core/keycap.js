/* ================================================================
   KEY CAPTURE (v0.55 — Suresh: "we need a v1 capture helper") — a
   VIRTUAL SCREEN (the queue: pattern: an address, no config
   authoring). Open it, press keys on whatever remote is paired to
   this device, and every arriving event renders as a row — raw
   key · code · keyCode, plus what the CURRENT keymap resolves it
   to. UNMAPPED rows get the accent ring: those are the codes you
   are hunting when learning a new remote. While this screen is
   up, the engine SWALLOWS every key (logging is the point — a
   captured "back" must not navigate); exit is the title-bar ‹
   chevron (touch/mouse — this is a setup surface, someone is
   holding the device). Rows are newest-first, capped at 60.

   v0.56 — CAPTURE-ASSIGN (Suresh: "in next iteration of capture, I
   can hit the remote key, and on the tile, press to assign the
   physical key!"). The screen now leads with THE REMOTE: the
   profile's soft_layout (the Studio's ✎ layout builder — the same
   data, the same order, blanks included) rendered as slot tiles.
   The flow is two gestures and no typing: press a key on the
   physical remote (it becomes PENDING, shown in the hint tile),
   then tap the slot it belongs to. 💾 Save reads the live config
   over the authenticated Studio API, merges the assignments into
   remotes.<this device>.keymap, POSTs it back (the integration
   validates + deploys), and applies them to the running KEYMAP
   immediately — so the very next press already routes.

   Custom slot names are first-class by v0.54's open button
   vocabulary: assigning "Red" mints the logical button `Red`,
   bindable from any screen's `buttons:` map with zero engine
   edits.
   ================================================================ */
S.keycap = [];
S.keyPending = null;    // last raw key captured — the thing to assign
S.keyAssign = {};       // raw key → logical slot name (this session)

/* the glyph vocabulary, mirrored from the Studio's soft remote so the
   slot grid READS as the remote's face. Plain text on purpose — no
   icon font between you and a diagnostic surface. A CUSTOM slot name
   (Red, "..", anything Suresh types into the layout builder) has no
   glyph and doesn't get a dot: its own name is the legend, and the
   stylesheet promotes a glyph-less slot's label to key size. */
const KEYCAP_GLYPHS = {
  back: "↩", home: "⌂", power: "⏻", menu: "≡",
  up: "▲", down: "▼", left: "◀", right: "▶", select: "OK",
  vol_up: "＋", vol_down: "－", ch_up: "CH＋", ch_down: "CH－",
  mute: "🔇", info: "ⓘ",
};
const keycapGlyph = n => KEYCAP_GLYPHS[n] || "";

/* the stock arrangement, mirrored from the Studio's soft-remote
   editor: what a remote looks like before anyone describes one */
const KEYCAP_DEFAULT_LAYOUT = [
  ["back", "home", "power"],
  ["vol_up", "up", "ch_up"],
  ["left", "select", "right"],
  ["vol_down", "down", "ch_down"],
  ["menu", "mute", null],
];

function keycapLog(e) {
  S.keycap.unshift({
    key: e.key, code: e.code || "?", kc: e.keyCode,
    mapped: keycapMap()[e.key] || null,
  });
  if (S.keycap.length > 60) S.keycap.length = 60;
  S.keyPending = e.key;
  if (S.screen === "keys:") navigate(S.screen, true);
}

/* effective map = what the profile ships + what this session has
   assigned but not yet saved (so a slot's sub tells the truth the
   instant you tap it, before the round trip) */
function keycapMap() { return Object.assign({}, KEYMAP, S.keyAssign); }

/* every raw key that currently emits this logical button */
function keysForSlot(name) {
  const m = keycapMap();
  return Object.keys(m).filter(k => m[k] === name);
}

function keycapLayout() {
  const L = (DEVICE && DEVICE.soft_layout) || KEYCAP_DEFAULT_LAYOUT;
  return Array.isArray(L) && L.length ? L : KEYCAP_DEFAULT_LAYOUT;
}

/* tap a slot = the pending key becomes this slot's key. Reassigning
   a raw key simply overwrites — one key, one logical button. */
function keycapAssign(name) {
  if (!S.keyPending) {
    flashBar("Press a key on the remote first", "off");
    return;
  }
  const k = S.keyPending;
  S.keyAssign[k] = name;
  S.keyPending = null;
  /* the log rows show resolutions — refresh them with the new truth */
  S.keycap.forEach(r => { r.mapped = keycapMap()[r.key] || null; });
  /* re-render FIRST: navigate() rewrites the bar title, so the flash
     has to land after it or it never gets read */
  navigate("keys:", true);
  flashBar(JSON.stringify(k) + " → " + name);
}

/* Save: GET the live config for THIS workspace, merge the session's
   assignments into this remote's keymap, POST it back. The Studio
   API is the same authenticated endpoint the Studio itself uses —
   the integration validates and deploys, so the change reaches
   every remote on this workspace, not just the one in your hand. */
function keycapApiBase() {
  const host = localStorage.getItem("hakr_host");
  return (host && host !== location.host)
    ? location.protocol + "//" + host : "";
}
async function keycapSave() {
  const n = Object.keys(S.keyAssign).length;
  if (!n) { flashBar("Nothing to save — capture a key, then tap a slot", "off"); return; }
  const dev = S.deviceName || "default";
  const url = keycapApiBase() + "/api/harmonium/config" +
    (WS && WS !== "main" ? "?ws=" + encodeURIComponent(WS) : "");
  const auth = { Authorization: "Bearer " + (localStorage.getItem("hakr_token") || "") };
  let msg, tone;
  try {
    const g = await fetch(url, { headers: auth, cache: "no-store" });
    if (!g.ok) throw new Error("GET " + g.status);
    const cfg = await g.json();
    if (!cfg.remotes) cfg.remotes = {};
    const p = cfg.remotes[dev] ||
      (cfg.remotes[dev] = { capabilities: ["touch", "pointer"] });
    /* a profile with no keymap of its own has been riding the global
       one — inherit it once, so saving never silently narrows it */
    p.keymap = Object.assign({}, p.keymap || cfg.keymap || {}, S.keyAssign);
    const q = await fetch(url, {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, auth),
      body: JSON.stringify(cfg),
    });
    if (!q.ok) throw new Error("POST " + q.status);
    /* live, immediately: the next press already routes */
    KEYMAP = Object.assign({}, KEYMAP, S.keyAssign);
    if (DEVICE) DEVICE.keymap = Object.assign({}, p.keymap);
    if (CONFIG) {
      if (!CONFIG.remotes) CONFIG.remotes = {};
      CONFIG.remotes[dev] = p;
    }
    S.keyAssign = {};
    msg = "Saved " + n + " key" + (n > 1 ? "s" : "") + " to '" + dev + "'";
    tone = "on";
  } catch (err) {
    msg = "Save failed: " + err.message;
    tone = "off";
  }
  /* re-render first (the sub lines and the Save tile change), then
     flash — navigate() would otherwise overwrite the message */
  navigate("keys:", true);
  flashBar(msg, tone);
}

function keysScreen() {
  const dev = S.deviceName || "default";
  const pend = S.keyPending;
  const nAssign = Object.keys(S.keyAssign).length;

  /* --- band 1: THE REMOTE (the slot grid, in the profile's order) */
  const slots = [];
  keycapLayout().forEach((row, ri) => (row || []).forEach((name, ci) => {
    const id = "ks_" + ri + "_" + ci;
    if (!name) {           // a blank in the physical grid stays a blank
      slots.push({ id, type: "kslot", blank: true, icon: " ", label: "" });
      return;
    }
    slots.push({ id, type: "kslot", slot: name, icon: keycapGlyph(name), label: name });
  }));

  /* --- band 2: the pending readout + save */
  const tools = [{
    id: "kc_hint", type: "preset",
    icon: "material:" + (pend ? "touch_app" : "keyboard"),
    ...(pend ? { color: "var(--accent)" } : {}),
    label: pend ? "Pending: " + JSON.stringify(pend) : "Press a key on the remote…",
    sub_label: pend
      ? "now tap the slot it belongs to"
      : "then tap its slot above · accent ring below = unmapped · exit with ‹",
    action: {},
  }, {
    id: "kc_save", type: "kslot", save: true, icon: "💾",
    label: nAssign ? "Save " + nAssign + " to '" + dev + "'" : "Save",
    sub_label: nAssign ? "writes this remote's keymap and deploys"
      : "nothing assigned yet",
  }];

  /* --- band 3: RECENT KEYS (the v0.55 log, unchanged in spirit) */
  const rows = S.keycap.map((r, i) => ({
    id: "kc_" + i, type: "preset",
    icon: "material:" + (r.mapped ? "keyboard_return" : "help"),
    ...(r.mapped ? {} : { color: "var(--accent)" }),
    label: JSON.stringify(r.key) + " · " + r.code + " · kc " + r.kc,
    sub_label: r.mapped ? "→ " + r.mapped : "unmapped in '" + dev + "'",
    action: {},
  }));

  return {
    name: "Key capture", virtual: true, class: "group",
    grid: { columns: 1 },
    sections: [
      { title: "The remote — " + dev, hero_label: "Remote",
        columns: 3, tiles: slots },
      { columns: 1, tiles: tools },
      { title: "Recent keys", hero_label: "Keys", columns: 1, tiles: rows },
    ],
    initial_focus: "kc_hint",
  };
}
