/* ================================================================
   STOCK LIBRARY + CONFIG HEALING — the pure half of the Studio's
   state layer (split out of state.svelte.js, 2026-08-17 cleanup).

   Everything in this module is a plain function or constant over a
   config object: the stock controller shapes (with their `gen`
   migration counters — bump the gen when you change a shape, the
   healer does the rest), the starter config a fresh install mints,
   and the normalize* chain every config passes through on its way
   into the editor ("one config door, one normalizer", v0.75).

   Nothing here touches reactive app state — the functions that need
   the current workspace take it as a parameter, and state.svelte.js
   wraps them with the live values.
   ================================================================ */

/* the GUARANTEED stock: a house-neutral Media Player controller —
   pure $context (zero entity ids), the v0.20.1 mint anatomy. Present
   in every workspace so Navigate-to always offers a controller. */
import { refereeController, unitFp } from "./ownership.js";
import STOCK_HISTORY from "./stock-history.js";

export const GENERIC_MEDIA_CONTROLLER = {
  name: "Media Player",
  gen: 3,   /* gen 3 (v0.85.7): t_tr gated unless physical_transport;
               gen 2 (v0.83.8): the Apps section went 2-up */
  class: "activity", view_kind: "controller", type: "controller",
  control_target: {
    label: "$activity.name", navigation: "$context.dpad",
    power: "$context.power", volume: "$context.volume",
    pass_through: ["up", "down", "left", "right", "select", "back", "home", "power"],
  },
  dpad_passthrough: "$context.dpad",
  sections: [
    { tiles: [
      { id: "t_np", type: "media", entity: "$context.media_player",
        icon: "material:smart_display", label: "Now Playing", span: 2 },
      { id: "t_tr", type: "transport", entity: "$context.media_player",
        label: "Transport", span: 2, unless: "physical_transport" },
      { id: "t_btns", type: "buttons", entity: "$context.dpad",
        label: "On-screen device buttons", span: 2, only: "physical_dpad",
        buttons: ["back", "home"] },
      { id: "t_pad", type: "dpad", entity: "$context.dpad",
        icon: "material:gamepad", label: "Remote", span: 2, unless: "physical_dpad" },
      { id: "t_vol", type: "volume", entity: "$context.volume",
        level_entity: "$context.volume_level",
        icon: "material:volume_up", label: "Volume", span: 2 },
      /* CAST GROUPS (v0.60): one nav card per group in the running
         activity. Names no group, so the shared surface stays generic
         — a room with no groups renders nothing here. */
      { id: "t_grp", type: "groups" },
      /* SOURCE tile (v0.36): role-governed — appears iff the activity
         wires source_select (hide-unwired otherwise) */
      { id: "t_src", type: "sources", entity: "$context.source_select",
        icon: "material:input", label: "Source", span: 2 },
    ] },
    /* v0.46: ONE player — dialects supply the differences. Both
       sections self-hide when the active dialect declares nothing. */
    { columns: 2, title: "Device keys", hero_label: "Device keys", role: "keys",
      tiles: [{ id: "keys", type: "keys" }] },
    /* 2-up since v0.83.8 (Suresh: "lets make this grid 2 x 2 (bigger
       tiles, text)") — the engine sizes app tiles up via cls "app" */
    { columns: 2, title: "Apps", hero_label: "Apps", role: "apps",
      tiles: [{ id: "apps", type: "apps" }] },
    { columns: 1, title: "Devices", hero_label: "Devices", role: "devices",
      tiles: [{ id: "cast", type: "devices" }] },
  ],
};
/* the DOMAIN stocks — the built-in detail surfaces as editable
   library entries ($device = the addressed entity); mirrors the
   compiler's DOMAIN_STOCKS exactly */

export const DOMAIN_STOCKS = {
  climate: { name: "Climate", gen: 1, tiles: [
    { id: "dp", type: "power", entity: "$device", label: "", span: 2 },
    { id: "ds", type: "stepper", kind: "temperature", entity: "$device", icon: "material:thermostat", label: "", span: 2 },
    { id: "dm", type: "chips", kind: "hvac_mode", entity: "$device", icon: "material:hvac", label: "", span: 2 },
    { id: "df", type: "chips", kind: "fan_mode", entity: "$device", icon: "material:mode_fan", label: "", span: 2 },
    { id: "dpr", type: "chips", kind: "preset", entity: "$device", icon: "material:tune", label: "", span: 2 } ] },
  light: { name: "Light", gen: 1, tiles: [
    { id: "dp", type: "power", entity: "$device", label: "", span: 2 },
    { id: "ds", type: "stepper", kind: "brightness", entity: "$device", icon: "material:light_mode", label: "", span: 2 },
    { id: "de", type: "chips", kind: "effect", entity: "$device", icon: "material:auto_awesome", label: "", span: 2 } ] },
  cover: { name: "Cover", gen: 1, tiles: [
    { id: "dc", type: "coverbtns", entity: "$device", label: "", span: 2 },
    { id: "ds", type: "stepper", kind: "position", entity: "$device", icon: "material:height", label: "", span: 2 } ] },
  fan: { name: "Fan", gen: 1, tiles: [
    { id: "dp", type: "power", entity: "$device", label: "", span: 2 },
    { id: "ds", type: "stepper", kind: "percentage", entity: "$device", icon: "material:mode_fan", label: "", span: 2 },
    { id: "dpr", type: "chips", kind: "preset", entity: "$device", icon: "material:tune", label: "", span: 2 } ] },
  switch: { name: "Switch", gen: 1, tiles: [
    { id: "dp", type: "power", entity: "$device", label: "", span: 2 } ] },
};
/* the APPS DRAWER is a library citizen (v0.47.4): pure, ships in
   every workspace so the player's apps button never dead-ends —
   mirrors the compiler's views/apps.yaml output exactly */

export const STOCK_APPS_DRAWER = {
  name: "Apps",
  /* gen 2 (v0.83.8 — Suresh: "lets make this grid 2 x 2"): two
     columns; the engine's cls "app" stamp does the bigger-tile half */
  gen: 2, class: "group", view_kind: "library", type: "library",
  parent: "controller:tv",
  control_target: { label: "$activity.name", navigation: "$context.dpad",
    power: "$context.power", volume: "$context.volume", pass_through: ["power"] },
  drawer: true,
  grid: { columns: 2 },
  sections: [{ tiles: [{ id: "apps_grid", type: "apps" }], hero_label: "Apps" }],
};

/* the MUSIC LIBRARY drawer — same library citizenship (v0.47.5),
   mirrors the compiler's views/music_library.yaml output exactly */

export const STOCK_MUSIC_LIBRARY =
  {
    "name": "Music Library",
    "gen": 1,
    "class": "group",
    "view_kind": "library",
    "type": "library",
    "font_scope": "music",
    "parent": "controller:music",
    "drawer": true,
    "grid": { "columns": 3 },
    /* v0.49 (Suresh: "We mustn't be hardcoded to ma"): ONE browse
       tile — the standard media_player/browse_media contract serves
       whatever library the CAST PLAYER has (Sonos, MA, Plex, …);
       playback is the standard media_player.play_media. Categories
       are the tree's top level. Pull-Music-Here stays as an MA
       nicety. */
    "sections": [
      {
        "tiles": [
          { "id": "lib", "type": "browse" }
        ],
        "hero_label": "Library"
      }
    ]
  };

/* the MUSIC controller, AT LAST A NAMED STOCK (v0.71.1). This shape
   matured in Jamaica's config — volumes / groups / presets / devices
   generators, the accented library trail, the 760px cap — and never
   made it back into the stock library, so CT's flat Porch-v2 copy
   could not heal and a cast addition rendered nothing ("it works in
   Jamaica!"). No `parent`: that is a per-house content-graph edge,
   preserved by the gen healer. */

export const STOCK_MUSIC = {
  name: "Music Media Player",
  /* gen 5 (2026-08-20 — the PAD DOCTRINE'S FINAL FORM after three
     field rounds: the pad ALWAYS walks the panel here — OK = the
     focused tile — and the media work rides keys the panel doesn't
     need, all engine-level: hold-◀/▶ seek ∓15s, hold-CH = previous/
     next track, short CH = section jump (walks when nothing to
     jump). The one binding left is his hamburger: menu → the
     Library, a SHORT press now (gen 4 had it on menu_hold, which
     reverts to the global Apps-drawer binding).
     gen 4 (2026-08-20 am): the transport-pad experiment; seek holds
     struck. gen 3 (2026-08-19): ch_up/ch_down track-skip removed.
     gen 2 (v0.83.7): the SPEAKERS grouping card joined the band —
     renders only when the running activity casts 2+ players. */
  /* gen 8 (v0.85.7): m_tr gained unless:physical_transport — a remote
     with real transport keys hides the on-screen bar.
     gen 7 (v0.85.2): the gen HAD to move again. v0.85 shipped this
     tile with a baked `style: "hero"`, which silently disabled the
     activity's Now Playing picker — and because the fix landed at the
     same gen 6, heal skipped every config that had already saved the
     broken shape. A fix that cannot reach the configs it broke is not
     a fix; the gen is the only thing that carries it. */
  gen: 8,
  class: "activity", view_kind: "controller", type: "controller",
  buttons: {
    menu: { navigate: "music_library" },
  },
  control_target: { label: "$activity.name",
    power: "$context.power", volume: "$context.volume" },
  font_scope: "music",
  sections: [
    { tiles: [
      /* ART HERO is the music default (v0.85 — Suresh: "middle art
         hero should be the default for music"). style beats the legacy
         art:true flag; the fixed height means the Modes and Volume
         tiles below never move. */
      { id: "m_np", type: "media", art: true, np_default: "hero",
        entity: "$context.media_player",
        icon: "material:music_note", label: "Now Playing", span: 2,
        trailing: { icon: "material:library_music",
          action: { navigate: "music_library" }, emphasis: "accent" } },
      /* unless physical_transport (v0.85.7 — his: "How do I prevent
         the transport bar from showing for the Astrion 2 and RS90?"
         He shouldn't have to: those profiles DECLARE transport keys.
         The gate was added to starter-config long ago but never to
         THIS shape — so gen-heal kept writing the ungated tile back
         over every install. The stock shapes are the truth heal
         enforces; a fix that skips them is a fix heal deletes. */
      { id: "m_tr", type: "transport", entity: "$context.media_player",
        label: "Transport", span: 2, unless: "physical_transport" },
      { id: "m_cmd", type: "mediabtns", entity: "$context.media_player",
        label: "Modes", span: 2 },
      { id: "vol", type: "volumes" },
      { id: "spk", type: "speakers" },
      { id: "grp", type: "groups" },
      { id: "m_src", type: "sources", entity: "$context.source_select",
        icon: "material:input", label: "Source", span: 2 },
    ] },
    { columns: 2, title: "Presets", hero_label: "Presets", role: "presets",
      tiles: [{ id: "acts_presets", type: "presets" }] },
    { columns: 1, title: "Devices",
      tiles: [{ id: "cast", type: "devices" }] },
  ],
  grid: { max_width: 760 },
};

/* STOCK GENERATIONS (v0.71.1 — Suresh: "We should probably add a
   version number in the json?"). Every stock shape carries `gen`, an
   integer BUMPED WHENEVER THE SHAPE CHANGES. The healer then needs no
   shape-sniffing (the pile above grew one hand-written sniffer per
   change and missed `music` entirely): a non-variant copy whose gen
   is missing or behind is replaced by the current stock, keeping its
   `parent` — the per-house content-graph edge. Custom copies
   (variant_of) are yours and are never touched — the same doctrine
   every healer above already follows. */


/* THE STOCK TV CONTROLLER (v0.85.4 — the .88 box, third instance of
   the starter-only disease in one week: dialects, then remote
   profiles, now this). The tv controller was born in the starter and
   NEVER healed — the "known gap" probe-stock-sync used to shrug at.
   So an existing install kept its 2026-era tv shape forever: no
   `unless: physical_transport` on the transport bar, no
   `unless: physical_back_home` on the back/home row, no
   np_default: "hero" — which is exactly what an updated .88 showed on
   an RS90. gen 1 (the wild has NO gen at all on tv), heals through
   healStockGen like every other stock controller; custom copies
   (variant_of) are yours, never touched. probe-stock-sync now holds
   the starter's tv equal to this. */
export const STOCK_TV = {
  "gen": 1,
  "name": "TV Media Player",
  "class": "activity",
  "view_kind": "controller",
  "type": "controller",
  "buttons": {
    "left_hold": {
      "service": "remote.send_command",
      "entity": "$context.dpad",
      "data": {
        "command": "REWIND"
      }
    },
    "right_hold": {
      "service": "remote.send_command",
      "entity": "$context.dpad",
      "data": {
        "command": "FAST_FORWARD"
      }
    },
    "source": {
      "navigate": "sources:$context.source_select"
    },
    "menu": {
      "navigate": "apps"
    }
  },
  "control_target": {
    "label": "$activity.name",
    "navigation": "$context.dpad",
    "power": "$context.power",
    "volume": "$context.volume",
    "pass_through": [
      "up",
      "down",
      "left",
      "right",
      "select",
      "back",
      "home",
      "power"
    ]
  },
  "dpad_passthrough": "$context.dpad",
  "sections": [
    {
      "tiles": [
        {
          "id": "t_np",
          "type": "media",
          "entity": "$context.media_player",
          "icon": "material:smart_display",
          "label": "Now Playing",
          "span": 2,
          "trailing": {
            "icon": "material:apps",
            "action": {
              "navigate": "apps"
            }
          },
          "np_default": "hero"
        },
        {
          "id": "t_tr",
          "unless": "physical_transport",
          "type": "transport",
          "entity": "$context.media_player",
          "label": "Transport",
          "span": 2
        },
        {
          "id": "t_btns",
          "type": "buttons",
          "entity": "$context.dpad",
          "label": "On-screen device buttons",
          "span": 2,
          "only": "physical_dpad",
          "buttons": [
            "back",
            "home"
          ],
          "unless": "physical_back_home"
        },
        {
          "id": "t_pad",
          "type": "dpad",
          "entity": "$context.dpad",
          "icon": "material:gamepad",
          "label": "Remote",
          "span": 2,
          "unless": "physical_dpad"
        },
        {
          "id": "t_btns2",
          "type": "buttons",
          "entity": "$context.dpad",
          "label": "",
          "span": 2,
          "unless": "physical_dpad",
          "buttons": [
            "back",
            "home",
            "power"
          ]
        },
        {
          "id": "t_vol",
          "type": "volume",
          "entity": "$context.volume",
          "level_entity": "$context.volume_level",
          "icon": "material:volume_up",
          "label": "Volume",
          "span": 2
        },
        {
          "id": "t_src",
          "type": "sources",
          "entity": "$context.source_select",
          "icon": "material:input",
          "label": "Source",
          "span": 2
        }
      ]
    },
    {
      "columns": 2,
      "tiles": [
        {
          "id": "keys",
          "type": "keys"
        }
      ],
      "title": "Device keys"
    },
    {
      "columns": 1,
      "tiles": [
        {
          "id": "cast",
          "type": "devices"
        }
      ],
      "title": "Devices"
    }
  ]
};

/* the current shipped shape for a stock controller id (deep copy,
   domain extras applied) — the Studio's "Reset to built-in" uses it
   to un-fork a legitimized copy (v0.85.7). null for non-stock ids. */
export function currentStockController(cid) {
  const named = { music: STOCK_MUSIC, apps: STOCK_APPS_DRAWER,
    music_library: STOCK_MUSIC_LIBRARY, tv: STOCK_TV,
    media: GENERIC_MEDIA_CONTROLLER };
  if (named[cid]) return JSON.parse(JSON.stringify(named[cid]));
  if (DOMAIN_STOCKS[cid])
    return Object.assign(JSON.parse(JSON.stringify(DOMAIN_STOCKS[cid])),
      { domain: cid, class: "activity", view_kind: "controller", type: "controller" });
  return null;
}

export function healStockGen(cfg) {
  /* v0.85.7 — THE REFEREE replaces the blind gen check. The old rule
     ("gen behind → replace wholesale") was correct for pristine
     copies and DESTRUCTIVE for pre-lock in-place edits: a v0.84.1
     user who reshaped their music controller would have lost it at
     first save. Now ownership.js decides by content fingerprint
     against stock-history.js: any shape we ever shipped heals
     silently (repo wins — it was always ours); anything else under a
     stock id is LEGITIMIZED as the user's fork (variant_of stamped,
     unlocked, forked_by_update note for the Studio's notice + Reset
     to built-in). Nothing is ever silently overwritten, nothing is
     ever silently stranded. */
  const heal = (cid, stock, extra) =>
    refereeController(cfg, cid, stock, STOCK_HISTORY.controllers[cid] || [],
      extra);
  heal("apps", STOCK_APPS_DRAWER);
  heal("music_library", STOCK_MUSIC_LIBRARY);
  heal("music", STOCK_MUSIC);
  heal("tv", STOCK_TV);
  heal("media", GENERIC_MEDIA_CONTROLLER);
  for (const [dom, stock] of Object.entries(DOMAIN_STOCKS))
    heal(dom, stock, { domain: dom, class: "activity",
      view_kind: "controller", type: "controller" });
}


/* STOCK SKINS (v0.84.4) — device-photo geometry for the built-in
   remote profiles, gen-stamped like the stock controllers.
   healStockSkins refreshes a stock profile's skin when ours is newer,
   UNLESS the profile points at the user's OWN photo (a non-stock image
   path is theirs, never touched) — the skin twin of healStockGen. Kept
   in sync with custom_components/harmonium/starter-config.json by
   tests/probe-stock-skins-sync.mjs (a drift guard). */
export const STOCK_SKINS = {
  "astrion": {
    "gen": 2,
    "image": "/local/harmonium/skins/stock/astrion.png",
    "viewport": {
      "w": 349,
      "h": 581
    },
    "screen": {
      "x": 10.07,
      "y": 3.764,
      "w": 80.59,
      "h": 41.77
    },
    "buttons": [
      {
        "btn": "back",
        "x": 9.84,
        "y": 52.2,
        "w": 20.3,
        "h": 5.3
      },
      {
        "btn": "home",
        "x": 30.14,
        "y": 52.2,
        "w": 39.1,
        "h": 5.3
      },
      {
        "btn": "power",
        "x": 69.24,
        "y": 52.2,
        "w": 20.6,
        "h": 5.3
      },
      {
        "btn": "vol_up",
        "x": 9.84,
        "y": 59.7,
        "w": 17,
        "h": 9.5
      },
      {
        "btn": "ch_up",
        "x": 73.24,
        "y": 59.7,
        "w": 17,
        "h": 9.5
      },
      {
        "btn": "vol_down",
        "x": 9.84,
        "y": 69.5,
        "w": 17,
        "h": 9.2
      },
      {
        "btn": "ch_down",
        "x": 73.24,
        "y": 69.5,
        "w": 17,
        "h": 9.2
      },
      {
        "btn": "up",
        "x": 39.74,
        "y": 60.0,
        "w": 20,
        "h": 5.5
      },
      {
        "btn": "left",
        "x": 27.24,
        "y": 65.5,
        "w": 12.5,
        "h": 7.5
      },
      {
        "btn": "select",
        "x": 39.74,
        "y": 65.5,
        "w": 20,
        "h": 7.3
      },
      {
        "btn": "right",
        "x": 59.74,
        "y": 65.5,
        "w": 13.5,
        "h": 7.5
      },
      {
        "btn": "down",
        "x": 39.74,
        "y": 72.8,
        "w": 20,
        "h": 5.6
      },
      {
        "btn": "mute",
        "x": 9.84,
        "y": 81.2,
        "w": 20.3,
        "h": 5.3
      },
      {
        "btn": "voice",
        "x": 30.14,
        "y": 81.2,
        "w": 39.1,
        "h": 5.3
      },
      {
        "btn": "menu",
        "x": 69.24,
        "y": 81.2,
        "w": 20.6,
        "h": 5.3
      },
      {
        "btn": "light",
        "x": 9.84,
        "y": 86.7,
        "w": 20.2,
        "h": 5.2
      },
      {
        "btn": "cover",
        "x": 30.04,
        "y": 86.7,
        "w": 20.2,
        "h": 5.2
      },
      {
        "btn": "music",
        "x": 50.24,
        "y": 86.7,
        "w": 20.2,
        "h": 5.2
      },
      {
        "btn": "climate",
        "x": 70.44,
        "y": 86.7,
        "w": 20.2,
        "h": 5.2
      },
      {
        "btn": "red",
        "x": 9.84,
        "y": 93.9,
        "w": 20.2,
        "h": 4.4
      },
      {
        "btn": "green",
        "x": 30.04,
        "y": 93.9,
        "w": 20.2,
        "h": 4.4
      },
      {
        "btn": "blue",
        "x": 50.24,
        "y": 93.9,
        "w": 20.2,
        "h": 4.4
      },
      {
        "btn": "yellow",
        "x": 70.44,
        "y": 93.9,
        "w": 20.2,
        "h": 4.4
      }
    ]
  },
  "astrion2": {
    "gen": 2,
    "image": "/local/harmonium/skins/stock/astrion2.png",
    "viewport": {
      "w": 349,
      "h": 581
    },
    "screen": {
      "x": 9.84,
      "y": 3.795,
      "w": 79.92,
      "h": 41.77
    },
    "buttons": [
      {
        "btn": "back",
        "x": 10.0,
        "y": 52.3,
        "w": 19,
        "h": 4.6
      },
      {
        "btn": "home",
        "x": 33.0,
        "y": 52.3,
        "w": 34,
        "h": 4.6
      },
      {
        "btn": "power",
        "x": 71.0,
        "y": 52.3,
        "w": 19,
        "h": 4.6
      },
      {
        "btn": "vol_up",
        "x": 9.5,
        "y": 59.5,
        "w": 14,
        "h": 6.0
      },
      {
        "btn": "ch_up",
        "x": 70.0,
        "y": 59.5,
        "w": 18,
        "h": 6.0
      },
      {
        "btn": "up",
        "x": 40,
        "y": 60.0,
        "w": 20,
        "h": 4.5
      },
      {
        "btn": "left",
        "x": 26,
        "y": 66.5,
        "w": 12,
        "h": 6.0
      },
      {
        "btn": "select",
        "x": 40,
        "y": 65.7,
        "w": 20,
        "h": 7.0
      },
      {
        "btn": "right",
        "x": 62,
        "y": 66.5,
        "w": 12,
        "h": 6.0
      },
      {
        "btn": "down",
        "x": 40,
        "y": 73.8,
        "w": 20,
        "h": 4.5
      },
      {
        "btn": "vol_down",
        "x": 9.5,
        "y": 73.5,
        "w": 14,
        "h": 6.0
      },
      {
        "btn": "ch_down",
        "x": 70.0,
        "y": 73.5,
        "w": 18,
        "h": 6.0
      },
      {
        "btn": "mute",
        "x": 10,
        "y": 81.0,
        "w": 19,
        "h": 4.6
      },
      {
        "btn": "voice",
        "x": 33,
        "y": 81.0,
        "w": 34,
        "h": 4.6
      },
      {
        "btn": "menu",
        "x": 71,
        "y": 81.0,
        "w": 19,
        "h": 4.6
      },
      {
        "btn": "prev",
        "x": 10.3,
        "y": 86.6,
        "w": 19,
        "h": 4.6
      },
      {
        "btn": "play_pause",
        "x": 30.1,
        "y": 86.6,
        "w": 19,
        "h": 4.6
      },
      {
        "btn": "stop",
        "x": 49.8,
        "y": 86.6,
        "w": 19,
        "h": 4.6
      },
      {
        "btn": "next",
        "x": 69.9,
        "y": 86.6,
        "w": 19,
        "h": 4.6
      },
      {
        "btn": "red",
        "x": 10.3,
        "y": 93.4,
        "w": 19,
        "h": 4.6
      },
      {
        "btn": "green",
        "x": 30.1,
        "y": 93.4,
        "w": 19,
        "h": 4.6
      },
      {
        "btn": "blue",
        "x": 50.4,
        "y": 93.4,
        "w": 19,
        "h": 4.6
      },
      {
        "btn": "yellow",
        "x": 69.4,
        "y": 93.4,
        "w": 19,
        "h": 4.6
      }
    ]
  },
  "rs90": {
    "gen": 4,
    "image": "/local/harmonium/skins/stock/rs90.png",
    "viewport": {
      "w": 350,
      "h": 582
    },
    "screen": {
      "x": 12.97,
      "y": 4.14,
      "w": 73.939,
      "h": 40.103
    },
    "buttons": [
      {
        "btn": "power",
        "x": 8,
        "y": 47.5,
        "w": 24,
        "h": 6
      },
      {
        "btn": "home",
        "x": 38,
        "y": 47.5,
        "w": 24,
        "h": 6
      },
      {
        "btn": "mic",
        "x": 67,
        "y": 47.5,
        "w": 24,
        "h": 6
      },
      {
        "btn": "ch_up",
        "x": 5,
        "y": 56.5,
        "w": 17,
        "h": 7
      },
      {
        "btn": "up",
        "x": 40,
        "y": 57,
        "w": 18,
        "h": 6
      },
      {
        "btn": "vol_up",
        "x": 78,
        "y": 56.5,
        "w": 16,
        "h": 7
      },
      {
        "btn": "left",
        "x": 25,
        "y": 64,
        "w": 13,
        "h": 6
      },
      {
        "btn": "select",
        "x": 42,
        "y": 63,
        "w": 16,
        "h": 8
      },
      {
        "btn": "right",
        "x": 62,
        "y": 64,
        "w": 13,
        "h": 6
      },
      {
        "btn": "ch_down",
        "x": 5,
        "y": 70,
        "w": 17,
        "h": 7
      },
      {
        "btn": "down",
        "x": 40,
        "y": 71,
        "w": 18,
        "h": 6
      },
      {
        "btn": "vol_down",
        "x": 78,
        "y": 70,
        "w": 16,
        "h": 7
      },
      {
        "btn": "back",
        "x": 8,
        "y": 76.5,
        "w": 24,
        "h": 5.5
      },
      {
        "btn": "menu",
        "x": 38,
        "y": 76.5,
        "w": 24,
        "h": 5.5
      },
      {
        "btn": "mute",
        "x": 67,
        "y": 76.5,
        "w": 24,
        "h": 5.5
      },
      {
        "btn": "prev",
        "x": 8,
        "y": 82.5,
        "w": 24,
        "h": 5
      },
      {
        "btn": "play_pause",
        "x": 38,
        "y": 82.5,
        "w": 24,
        "h": 5
      },
      {
        "btn": "next",
        "x": 67,
        "y": 82.5,
        "w": 24,
        "h": 5
      },
      {
        "btn": "screencast",
        "x": 8,
        "y": 88.5,
        "w": 24,
        "h": 5
      },
      {
        "btn": "source",
        "x": 38,
        "y": 88.5,
        "w": 24,
        "h": 5
      },
      {
        "btn": "settings",
        "x": 67,
        "y": 88.5,
        "w": 24,
        "h": 5
      },
      {
        "btn": "app_fully",
        "x": 8,
        "y": 94,
        "w": 24,
        "h": 4
      },
      {
        "btn": "app_haptique",
        "x": 38,
        "y": 94,
        "w": 24,
        "h": 4
      },
      {
        "btn": "app_keymapper",
        "x": 67,
        "y": 94,
        "w": 24,
        "h": 4
      }
    ]
  }
};

/* IS THIS SKIN OURS? (v0.84.6 — the stock/user path split). Ownership
   is POSITIONAL now: anything under /skins/stock/ is ours, anything
   under /skins/user/ is theirs, full stop. The basename fallback is
   the MIGRATION path only — a pre-split config still points at the
   flat /skins/<name>.png, and we may claim that iff the name matches a
   stock skin. A user photo that happens to be called rs90.png is
   protected the moment it sits in user/, which is where every upload
   lands now.

   The engine, the Studio's lock and this healer all read ownership
   through THIS function, so they can never disagree. */
/* Names that ever shipped FLAT (pre-split, v0.83.6–v0.84.1). Only
   these may be claimed by bare basename. rs90.png is deliberately
   absent: no release ever shipped a flat rs90.png, so a config pointing
   at flat rs90.png is a USER'S OWN photo skin (the cookbook told RS90
   owners to put one exactly there) — heal must keep its hands off it,
   and the Studio must show it unlocked (v0.85.3, caught pre-tag).
   Twin of packaging.py's PRE_SPLIT_FLAT_FPS. */
const PRE_SPLIT_FLAT = ["astrion.png", "astrion2.png"];

export function isStockSkinImage(image, stockImage) {
  const img = String(image || "");
  if (img.indexOf("/skins/user/") >= 0) return false;   // theirs, always
  if (img.indexOf("/skins/stock/") >= 0) return true;   // ours, always
  const a = img.split("/").pop();
  const b = String(stockImage || "").split("/").pop();
  /* pre-split flat claim — only names we actually shipped flat */
  return !!a && a === b && PRE_SPLIT_FLAT.indexOf(a) >= 0;
}

export function healStockSkins(cfg) {
  if (!cfg || !cfg.remotes) return;
  for (const id in STOCK_SKINS) {
    const stock = STOCK_SKINS[id];
    const r = cfg.remotes[id];
    if (!r || !r.skin) continue;                     // profile absent / no skin
    const sk = r.skin;
    if ((sk.gen || 0) >= (stock.gen || 0)) continue; // already current
    if (!isStockSkinImage(sk.image, stock.image)) continue;  // user photo — theirs
    /* refresh geometry + gen AND repoint the image at skins/stock/ —
       the path move is just another thing heal fixes (v0.84.6). */
    r.skin = JSON.parse(JSON.stringify(stock));
  }
}

/* STOCK DIALECTS (v0.84.9 — Suresh: "I don't see a stock appletv
   dialect? did I misunderstand?"). He did not: starter-config.json is
   only read on a VIRGIN install, and starterConfig() copies dialects
   from the LIVE config — so a new stock dialect never reached an
   existing house. Controllers heal (healStockGen) and skins heal
   (healStockSkins); dialects had NO healer at all, which is why
   shipping `appletv` in the starter changed nothing for anyone
   already running.

   PLANT-IF-ABSENT, never overwrite: a dialect the user has edited (or
   deliberately pruned down) is theirs — same doctrine as the stock
   drawers in ensureStockControllers. Adding an entry here is how a new
   platform reaches every existing install. */
/* firetv/tizen/googletv joined STOCK_DIALECTS in v0.85.7 — they were
   starter-only since v0.83.5 (the LAST starter-only organ found by the
   ownership sweep): a content fix to any of them would never have
   reached an existing install. Copied verbatim from the starter;
   probe-stock-sync holds the two equal. */
export const STOCK_DIALECTS = {
  "firetv": {
    "name": "Fire TV",
    "channels": {
      "commands": {
        "integration": "androidtv",
        "domain": "media_player",
        "label": "ADB channel"
      }
    },
    "apps": {
      "netflix": {
        "source": "com.netflix.ninja"
      },
      "prime": {
        "action": "androidtv.adb_command",
        "entity": "$context.media_player",
        "data": {
          "command": "am start com.amazon.firebat/com.amazon.firebatcore.deeplink.DeepLinkRoutingActivity"
        }
      },
      "youtube": {
        "source": "com.amazon.firetv.youtube"
      },
      "youtubetv": {
        "source": "com.amazon.firetv.youtube.tv"
      },
      "peacock": {
        "source": "com.peacock.peacockfiretv"
      },
      "paramount": {
        "source": "com.cbs.ott"
      },
      "max": {
        "action": "androidtv.adb_command",
        "entity": "$context.media_player",
        "data": {
          "command": "am start -n com.hbo.hbonow/com.wbd.beam.BeamActivity"
        }
      },
      "appletv": {
        "source": "com.apple.atve.amazon.appletv"
      },
      "hulu": {
        "source": "com.hulu.plus"
      },
      "disney": {
        "source": "com.disney.disneyplus"
      },
      "fubo": {
        "source": "com.fubo.firetv.screen"
      },
      "espn": {
        "action": "androidtv.adb_command",
        "entity": "$context.media_player",
        "data": {
          "command": "am start -n com.espn.gtv/com.espn.startup.presentation.StartupActivity"
        }
      },
      "britbox": {
        "action": "androidtv.adb_command",
        "entity": "$context.media_player",
        "data": {
          "command": "am start -n com.britbox.us.firetv/axis.androidtv.sdk.app.MainActivity"
        }
      }
    },
    "wake": {
      "service": "media_player.turn_on",
      "entity": "$context.media_player"
    },
    "capabilities": {
      "settings": {
        "service": "androidtv.adb_command",
        "entity": "$context.media_player",
        "data": {
          "command": "input keyevent --longpress 3"
        }
      }
    }
  },
  "tizen": {
    "name": "Samsung Tizen",
    "apps": {
      "netflix": {
        "source": "Netflix"
      },
      "prime": {
        "source": "Prime Video"
      },
      "youtube": {
        "source": "YouTube"
      },
      "youtubetv": {
        "source": "YouTube TV"
      },
      "hulu": {
        "source": "Hulu"
      },
      "disney": {
        "source": "Disney+"
      },
      "appletv": {
        "source": "Apple TV"
      },
      "max": {
        "source": "Max"
      },
      "peacock": {
        "source": "Peacock TV"
      },
      "paramount": {
        "source": "Paramount+"
      }
    }
  },
  "googletv": {
    "name": "Google TV",
    "channels": {
      "commands": {
        "integration": "androidtv",
        "domain": "media_player",
        "label": "ADB channel"
      }
    },
    "keys": {
      "settings": {
        "name": "Settings",
        "icon": "material:settings",
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell input keyevent 176"
        }
      },
      "search": {
        "name": "Search",
        "icon": "material:search",
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell input keyevent 117"
        }
      },
      "allapps": {
        "name": "All apps",
        "icon": "material:apps",
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell input keyevent 284"
        }
      },
      "quicksettings": {
        "name": "Quick settings",
        "icon": "material:tune",
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell input keyevent 83"
        }
      },
      "livetv": {
        "name": "Live TV",
        "icon": "material:live_tv",
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell input keyevent 170"
        }
      }
    },
    "forbidden": [
      {
        "name": "SEARCH",
        "code": 84,
        "why": "voice search \u2014 activates the microphone"
      },
      {
        "name": "MUTE",
        "code": 91,
        "why": "mutes the MICROPHONE (use VOLUME_MUTE 164)"
      },
      {
        "name": "POWER",
        "code": 26,
        "why": "powers the device off"
      },
      {
        "name": "TV_POWER",
        "code": 177,
        "why": "powers the device off"
      },
      {
        "name": "SLEEP",
        "code": 223,
        "why": "powers the device off"
      },
      {
        "name": "SOFT_SLEEP",
        "code": 276,
        "why": "powers the device off"
      },
      {
        "name": "TV_INPUT",
        "code": 178,
        "why": "kills the picture"
      },
      {
        "name": "TV_INPUT_HDMI_1",
        "code": 243,
        "why": "kills the picture"
      },
      {
        "name": "TV_INPUT_HDMI_2",
        "code": 244,
        "why": "kills the picture"
      },
      {
        "name": "TV_INPUT_HDMI_3",
        "code": 245,
        "why": "kills the picture"
      },
      {
        "name": "TV_INPUT_HDMI_4",
        "code": 246,
        "why": "kills the picture"
      },
      {
        "name": "PAIRING",
        "code": 225,
        "why": "drops into Bluetooth pairing"
      },
      {
        "name": "PROFILE_SWITCH",
        "code": 288,
        "why": "changes the Google TV profile"
      },
      {
        "name": "STB_POWER",
        "code": 179,
        "why": "power-cycles OTHER devices over CEC"
      },
      {
        "name": "AVR_POWER",
        "code": 181,
        "why": "power-cycles OTHER devices over CEC"
      }
    ],
    "apps": {
      "netflix": {
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell am start -n com.netflix.ninja/.MainActivity"
        }
      },
      "prime": {
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell am start -n com.amazon.amazonvideo.livingroom/com.amazon.ignition.IgnitionActivity"
        }
      },
      "youtube": {
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell am start -n com.google.android.youtube.tv/com.google.android.apps.youtube.tv.activity.ShellActivity"
        }
      },
      "youtubetv": {
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell am start -n com.google.android.youtube.tvunplugged/com.google.android.apps.youtube.tvunplugged.activity.ChrobaltMainActivity"
        }
      },
      "peacock": {
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell am start -n com.peacocktv.peacockandroid/com.peacock.peacocktv.GoogleMainActivity"
        }
      },
      "paramount": {
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell am start -n com.cbs.ott/com.paramount.android.pplus.features.splash.tv.SplashMediatorActivity"
        }
      },
      "max": {
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell am start -n com.wbd.stream/com.wbd.beam.BeamActivity"
        }
      },
      "appletv": {
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell am start -n com.apple.atve.androidtv.appletv/.MainActivity"
        }
      },
      "hulu": {
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell am start -n com.hulu.livingroomplus/.WKFactivity"
        }
      },
      "disney": {
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell am start -n com.disney.disneyplus/com.bamtechmedia.dominguez.main.MainActivity"
        }
      },
      "fubo": {
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell am start -n com.fubo.firetv.screen/tv.fubo.mobile.presentation.onboarding.dispatch.controller.DispatchActivity"
        }
      },
      "espn": {
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell am start -n com.espn.score_center/com.espn.startup.presentation.StartupActivity"
        }
      },
      "britbox": {
        "action": "androidtv.adb_command",
        "entity": "$context.commands",
        "data": {
          "command": "adb shell am start -n com.britbox.tv/axis.androidtv.sdk.app.MainActivity"
        }
      }
    },
    "wake": {
      "service": "media_player.turn_on",
      "entity": "$context.media_player"
    }
  },
  appletv: {
    name: "Apple TV",
    /* pyatv's vocabulary — HA's apple_tv rejects anything else with
       "command not recognized". Two are NOT a straight lowercasing:
       Apple TV's back IS `menu`, and its main menu is `top_menu`. */
    dpad_commands: {
      up: "up", down: "down", left: "left", right: "right",
      select: "select", back: "menu", home: "home", menu: "top_menu",
      ch_up: "channel_up", ch_down: "channel_down",
    },
    /* the launchable APPS (v0.85.8 — the forum reporter's own table +
       the HA apple_tv docs): pyatv launches by select_source with the
       app's NAME from source_list, so the entry IS the source string.
       Note Apple's own app is just "TV", and Warner's is "HBO Max" —
       NOT "Max" — per a real device's source_list (forum reporter,
       2026-08-25). Names drift with app rebrands: the string must
       match the player's source_list attribute EXACTLY, so a user
       whose launch fails should check Developer Tools → States.
       Only master-list identities appear here (the dialect carries
       launch, never identity). */
    apps: {
      netflix: { source: "Netflix" },
      youtube: { source: "YouTube" },
      youtubetv: { source: "YouTube TV" },
      disney: { source: "Disney+" },
      hulu: { source: "Hulu" },
      max: { source: "HBO Max" },
      prime: { source: "Prime Video" },
      appletv: { source: "TV" },
      peacock: { source: "Peacock" },
      paramount: { source: "Paramount+" },
      /* v0.85.3 (his call: "add them to the stock — users (a) won't
         have them all or (b) care for them all"): the drawer offers
         what the dialect lists; pruning is one delete, and a pruned
         map is the user's (the backfill only ever fills an EMPTY one). */
      spotify: { source: "Spotify" },
      plex: { source: "Plex" },
      plutotv: { source: "Pluto TV" },
      tubi: { source: "Tubi" },
      pbs: { source: "PBS" },
      philo: { source: "Philo" },
    },
  },
};

/* identities for stock-dialect apps that postdate a house's master
   list (the list is copied from live at workspace-mint and never
   healed) — planted-if-absent so a backfilled dialect never points at
   a missing identity and the drawer never shows a raw id. */
/* v0.86.0: grown to the FULL master list — the layered-catalog
   provenance badges classify a config's app identities against this
   (it is the stocklib twin of starter-config's `apps`; probe-stock-sync
   guards the twinning). */
export const STOCK_APP_IDENTITIES = {
  netflix: { name: "Netflix", icon: "material:movie" },
  prime:   { name: "Prime Video", icon: "material:play_circle" },
  youtube: { name: "YouTube", icon: "material:smart_display" },
  youtubetv: { name: "YouTube TV", icon: "material:live_tv" },
  peacock: { name: "Peacock", icon: "material:theaters" },
  paramount: { name: "Paramount+", icon: "material:star" },
  max:     { name: "Max", icon: "material:local_movies" },
  appletv: { name: "Apple TV", icon: "material:tv_gen" },
  hulu:    { name: "Hulu", icon: "material:video_library" },
  disney:  { name: "Disney+", icon: "material:castle" },
  fubo:    { name: "Fubo TV", icon: "material:sports_football" },
  espn:    { name: "ESPN", icon: "material:sports_basketball" },
  britbox: { name: "BritBox", icon: "material:tv_gen" },
  spotify: { name: "Spotify", icon: "material:equalizer" },
  plex:    { name: "Plex", icon: "material:play_circle" },
  plutotv: { name: "Pluto TV", icon: "material:live_tv" },
  tubi:    { name: "Tubi", icon: "material:smart_display" },
  pbs:     { name: "PBS", icon: "material:account_balance" },
  philo:   { name: "Philo", icon: "material:connected_tv" },
};

export function healStockDialects(cfg) {
  if (!cfg) return cfg;
  if (!cfg.dialects) cfg.dialects = {};
  for (const id in STOCK_DIALECTS) {
    if (!cfg.dialects[id]) {
      cfg.dialects[id] = JSON.parse(JSON.stringify(STOCK_DIALECTS[id]));
      continue;
    }
    /* WHOLE-DIALECT TRACKING (v0.85.7 — Suresh: "stock dialects; if
       edited that becomes a user dialect. They can revert to stock at
       any time or at least look at it and copy paste what they need").
       The fingerprint decides: a dialect matching ANY shipped shape is
       provably untouched — deletions included — so it may track stock
       WHOLESALE, which is how new stock apps finally reach existing
       installs (the tombstone problem dissolves: an edited dialect is
       the user's and is left alone entirely; the Studio shows its
       state and offers View stock / Reset to stock). */
    {
      const cur0 = cfg.dialects[id];
      const stockFp = unitFp(STOCK_DIALECTS[id]);
      const hist = (STOCK_HISTORY.dialects || {})[id] || [];
      const myFp = unitFp(cur0);
      if (myFp !== stockFp && hist.indexOf(myFp) >= 0) {
        cfg.dialects[id] = JSON.parse(JSON.stringify(STOCK_DIALECTS[id]));
        continue;                       // fully current — sub-heals moot
      }
    }
    /* an EMPTY apps map is untouched by definition — installs that got
       appletv planted before the app catalog existed (v0.85.8) may
       safely receive it; one curated entry and it is theirs. */
    const cur = cfg.dialects[id];
    if ((!cur.apps || !Object.keys(cur.apps).length) &&
        Object.keys(STOCK_DIALECTS[id].apps || {}).length)
      cur.apps = JSON.parse(JSON.stringify(STOCK_DIALECTS[id].apps));
    /* dpad_commands heal by fingerprint (v0.85.7): if the platform's
       command names get corrected upstream, the fix must reach every
       install that never touched them. Pristine (any shipped shape,
       or absent) → refresh to current; edited → the user's, kept. */
    const stockDpad = STOCK_DIALECTS[id].dpad_commands;
    if (stockDpad) {
      const hist = (STOCK_HISTORY.dialectDpad || {})[id] || [];
      const mine = cur.dpad_commands;
      if (!mine || unitFp(mine) === unitFp(stockDpad) ||
          hist.indexOf(unitFp(mine)) >= 0)
        cur.dpad_commands = JSON.parse(JSON.stringify(stockDpad));
    }
  }
  if (!cfg.apps) cfg.apps = {};
  for (const aid in STOCK_APP_IDENTITIES)
    if (!cfg.apps[aid])
      cfg.apps[aid] = JSON.parse(JSON.stringify(STOCK_APP_IDENTITIES[aid]));
  return cfg;
}

/* every config gets the generic media stock + the domain stocks */


/* STOCK REMOTE PROFILES (v0.85.3 — Suresh's .88 box: "updated via HACS
   and it doesn't even show the RS90"). Same disease healStockDialects
   cured for dialects: the rs90 profile was born in starter-config.json,
   and the starter is read ONLY by a virgin install — so a new stock
   remote profile never reaches an existing house. Controllers heal,
   skins heal, dialects heal; remote profiles had NO healer.

   PLANT-IF-ABSENT, never overwrite: an existing profile — including a
   remapped keymap or trimmed capabilities — is the user's, same
   doctrine as dialects. The skin is NOT stored here; it is planted
   from STOCK_SKINS so there is exactly one skin truth. `default` is
   deliberately absent (it has existed since v0.x and carries no skin).
   probe-stock-sync holds this equal to the starter's profiles. */
export const STOCK_REMOTE_PROFILES = {
  "astrion": {
    "fully": true,
    "capabilities": [
      "physical_dpad",
      "physical_volume",
      "touch",
      "physical_back_home"
    ],
    "keymap": {
      "ArrowUp": "up",
      "ArrowDown": "down",
      "Tab": "down",
      "ArrowLeft": "left",
      "ArrowRight": "right",
      "Enter": "select",
      " ": "select",
      "+": "vol_up",
      "=": "home_hold",
      "-": "vol_down",
      "PageUp": "ch_up",
      "PageDown": "ch_down",
      "m": "mute",
      "M": "mute",
      "`": "mute",
      "AudioVolumeMute": "mute",
      "[": "back",
      "Escape": "back",
      "Backspace": "back",
      "]": "back_hold",
      "F1": "home",
      "BrowserHome": "home",
      "F4": "light",
      "F5": "cover",
      "F6": "music",
      "F7": "climate",
      "#": "menu",
      "@": "menu_hold",
      "'": "ch_up_hold",
      "/": "ch_down_hold",
      "F2": "power",
      "p": "power",
      "P": "power",
      "o": "power_hold",
      "F12": "power_hold",
      "O": "power_hold",
      ",": "left_hold",
      ".": "right_hold"
    }
  },
  "astrion2": {
    "fully": true,
    "capabilities": [
      "physical_dpad",
      "physical_volume",
      "physical_transport",
      "touch",
      "physical_back_home"
    ],
    "keymap": {
      "ArrowUp": "up",
      "ArrowDown": "down",
      "Tab": "down",
      "ArrowLeft": "left",
      "ArrowRight": "right",
      "Enter": "select",
      " ": "select",
      "+": "vol_up",
      "=": "home_hold",
      "-": "vol_down",
      "PageUp": "ch_up",
      "PageDown": "ch_down",
      "m": "mute",
      "M": "mute",
      "`": "mute",
      "AudioVolumeMute": "mute",
      "[": "back",
      "Escape": "back",
      "Backspace": "back",
      "]": "back_hold",
      "F1": "home",
      "BrowserHome": "home",
      "F4": "prev",
      "F5": "play_pause",
      "F6": "stop",
      "F7": "next",
      "#": "menu",
      "@": "menu_hold",
      "'": "ch_up_hold",
      "/": "ch_down_hold",
      "F2": "power",
      "p": "power",
      "P": "power",
      "o": "power_hold",
      "F12": "power_hold",
      "O": "power_hold",
      ",": "left_hold",
      ".": "right_hold"
    }
  },
  "rs90": {
    "capabilities": [
      "physical_dpad",
      "physical_volume",
      "physical_transport",
      "touch",
      "physical_back_home"
    ],
    "keymap": {
      "ArrowUp": "up",
      "ArrowDown": "down",
      "Tab": "down",
      "ArrowLeft": "left",
      "ArrowRight": "right",
      "Enter": "select",
      " ": "select",
      "+": "vol_up",
      "-": "vol_down",
      "=": "home_hold",
      "o": "power_hold",
      "F12": "power_hold",
      "O": "power_hold",
      ";": "home_hold",
      "PageUp": "ch_up",
      "PageDown": "ch_down",
      "`": "mute",
      "AudioVolumeMute": "mute",
      "[": "back",
      "Escape": "back",
      "Backspace": "back",
      "]": "back_hold",
      "F2": "home",
      "BrowserHome": "home",
      "F1": "power",
      "F5": "mic",
      "F6": "screencast",
      "F7": "source",
      "F8": "settings",
      "#": "menu",
      "@": "menu_hold",
      "'": "ch_up_hold",
      "/": "ch_down_hold",
      ",": "left_hold",
      ".": "right_hold",
      "\\": "play_pause",
      "MediaPlayPause": "play_pause",
      "MediaRewind": "prev",
      "MediaFastForward": "next",
      "MediaTrackPrevious": "prev",
      "MediaTrackNext": "next",
      "MediaStop": "stop"
    }
  }
};

export function healStockRemotes(cfg) {
  if (!cfg) return;
  if (!cfg.remotes) cfg.remotes = {};
  for (const id in STOCK_REMOTE_PROFILES) {
    if (!cfg.remotes[id]) {
      const p = JSON.parse(JSON.stringify(STOCK_REMOTE_PROFILES[id]));
      if (STOCK_SKINS[id]) p.skin = JSON.parse(JSON.stringify(STOCK_SKINS[id]));
      cfg.remotes[id] = p;
      continue;
    }
    /* EXISTING stock profile: capabilities heal by UNION (v0.85.5 —
       Suresh, testing .88: "Astrion shows transport - good. back/home
       strip = bad. Astrion2 shows both. rs90 shows neither." The
       planted rs90 carried current capabilities; the astrions'
       profiles predate physical_back_home / physical_transport and
       plant-if-absent never revisited them, so the unless-gates had
       nothing to read). Capabilities are HARDWARE FACTS — which keys
       the device physically has — not preferences, and the Studio has
       no capabilities editor; they were starter-born, so they heal.
       Union only: never remove, and everything else in the profile —
       keymap, skin, style — stays the user's, exactly as before. */
    const r = cfg.remotes[id];
    const stock = STOCK_REMOTE_PROFILES[id].capabilities || [];
    if (!Array.isArray(r.capabilities)) r.capabilities = [];
    for (const cap of stock)
      if (r.capabilities.indexOf(cap) < 0) r.capabilities.push(cap);
    /* keymap heal by fingerprint (v0.85.7): a keymap matching ANY
       shipped shape is pristine — refresh it so new stock keys (the
       hold pairs, new buttons) reach existing installs. One remapped
       key and it is the user's, kept verbatim (the engine still
       backfills the hold keys only-if-absent at runtime). */
    const stockMap = STOCK_REMOTE_PROFILES[id].keymap;
    if (stockMap) {
      const hist = (STOCK_HISTORY.remoteKeymaps || {})[id] || [];
      if (!r.keymap || unitFp(r.keymap) === unitFp(stockMap) ||
          hist.indexOf(unitFp(r.keymap)) >= 0)
        r.keymap = JSON.parse(JSON.stringify(stockMap));
    }
  }
}

export function ensureStockControllers(cfg) {
  if (!cfg.controllers) cfg.controllers = {};
  /* v0.47.4: plant the apps drawer where it's missing (workspaces
     created before it joined the library — the deck bug) */
  if (!cfg.controllers.apps && !(cfg.screens || {}).apps)
    cfg.controllers.apps = JSON.parse(JSON.stringify(STOCK_APPS_DRAWER));
  if (!cfg.controllers.music_library && !(cfg.screens || {}).music_library)
    cfg.controllers.music_library = JSON.parse(JSON.stringify(STOCK_MUSIC_LIBRARY));
  /* v0.49 MIGRATION: a stock music_library still on the retired
     MA-sensor shape (sensor.harmonium_music_*) upgrades to the
     standard browse tree; custom copies (variant_of) are yours. */
  {
    const ml = cfg.controllers.music_library;
    if (ml && !ml.variant_of &&
        JSON.stringify(ml).includes("sensor.harmonium_music_"))
      cfg.controllers.music_library = JSON.parse(JSON.stringify(STOCK_MUSIC_LIBRARY));
  }
  /* v0.51 (Suresh: "we ditch Pull Music — too confusing"): remove the
     Pull-Music-Here tile from stock browse-era copies */
  {
    const ml = cfg.controllers.music_library;
    if (ml && !ml.variant_of && JSON.stringify(ml).includes('"browse"'))
      (ml.sections || []).forEach(sec => {
        sec.tiles = (sec.tiles || []).filter(x => x.id !== "mq_pull");
      });
  }
  /* v0.50.2: the browse-era stock dropped its 118px banner (the bands
     want the pixels — Suresh: "the title Music Library is redundant");
     heal stock copies still carrying it */
  {
    const ml = cfg.controllers.music_library;
    if (ml && !ml.variant_of && ml.banner &&
        JSON.stringify(ml).includes('"browse"'))
      delete ml.banner;
  }
  /* v0.52.1 (Suresh: "Primary and Secondary font for the music
     player separately"): stock music surfaces copied before the
     font_scope key existed gain it, so the theme's music faces
     reach every workspace. Custom copies (variant_of) are yours. */
  for (const cid of ["music", "music_library"]) {
    const c = cfg.controllers[cid];
    if (c && !c.variant_of && !c.font_scope) c.font_scope = "music";
  }
  const hasMedia = Object.values(cfg.controllers).some(
    (c) => !c.variant_of && !c.domain);
  if (!hasMedia)
    cfg.controllers.media = JSON.parse(JSON.stringify(GENERIC_MEDIA_CONTROLLER));
  for (const [dom, stock] of Object.entries(DOMAIN_STOCKS))
    if (!cfg.controllers[dom])
      cfg.controllers[dom] = { ...JSON.parse(JSON.stringify(stock)),
        domain: dom, class: "activity", view_kind: "controller", type: "controller" };
  /* PURITY HEALER (v0.48.2 — Suresh's deck music page still bound to
     the BASEMENT Sonos): stock media surfaces are pure $context by
     doctrine (v0.46.1/v0.47.5) — activities supply everything. A
     workspace copied before purification still carries a baked
     context that silently aims every action at the wrong room; strip
     it. Custom copies (variant_of) keep theirs — they're yours. */
  for (const cid of ["tv", "music", "apps", "music_library", "media"]) {
    const c = cfg.controllers[cid];
    if (c && !c.variant_of && !c.domain && c.context) delete c.context;
  }
  /* THE BAKED-STYLE REPAIR (v0.85.2). v0.85 wrote `style` onto the
     stock Now Playing tiles of `music` AND `tv`. Gen bumps carry the
     repair when the gen moved (music; and tv has a twin + gen heal
     since v0.85.4) — this strip stays as the belt-and-braces for a
     config already AT the current gen with the style baked in:
     remove `style` from a stock np tile that still carries `np_default`
     alongside it, or from the known stock ids on a non-variant
     controller. One key, no controller replaced, nothing a user typed
     is touched — the same targeted shape as the music_library heals. */
  for (const cid of ["tv", "music", "media"]) {
    const c = cfg.controllers[cid];
    if (!c || c.variant_of) continue;
    const groups = [c.tiles || []];
    for (const sec of (c.sections || [])) groups.push(sec.tiles || []);
    for (const g of groups)
      for (const t of g)
        if (t && t.type === "media" && t.style &&
            (t.id === "t_np" || t.id === "m_np" || t.np_default))
          delete t.style;      /* np_default (or the stock default) rules again */
  }
  healStockGen(cfg);
  healStockSkins(cfg);
  healStockDialects(cfg);
  healStockRemotes(cfg);
  healInputPolicy(cfg);
  return cfg;
}

/* THE CURRENT INPUT POLICY (one truth, mirrored by the starter —
   probe-stock-sync holds them equal). v0.85 flipped the doctrine to
   Suresh's agreed navigation: SHORT Back/Home go to the control
   target where the view passes them through (the TV), the app
   everywhere else; HOLD Back/Home ALWAYS target the app. */
export const STOCK_INPUT_POLICY = {
  short_press: "control_target",
  hold: { back: "app_back", home: "room_home", power: "all_off" },
  hold_ms: { navigation: 500, power: 1200 },
};

/* INPUT POLICY REFEREE (v0.85.7 round 2 — Suresh: "I want the
   navigation we agreed. Home and Back target the app except on TV
   where they target the TV. Long Press Back and Home always target
   the App."). His own install disagreed: it still carried the
   pre-v0.85 policy verbatim (short "app", hold "control_target" —
   long-press sent DEVICE keys), because the input policy had no
   healer — the same stranded-on-legacy disease every other organ
   already cured. Fingerprint doctrine: a policy matching ANY shipped
   shape is pristine and heals to current; one edited key and it is
   the user's, untouched. */
export function healInputPolicy(cfg) {
  const pb = cfg && cfg.input && cfg.input.physical_buttons;
  if (!pb) return cfg;                     /* absent: engine v1 defaults */
  const cur = unitFp(STOCK_INPUT_POLICY);
  const mine = unitFp(pb);
  if (mine === cur) return cfg;
  const hist = (STOCK_HISTORY.inputPolicy || {}).physical_buttons || [];
  if (hist.indexOf(mine) >= 0)
    cfg.input.physical_buttons = JSON.parse(JSON.stringify(STOCK_INPUT_POLICY));
  return cfg;
}

/* a minimal starter: keeps hardware/system (remotes, keymaps, theme,
   input policy) and wipes the content — build from a clean slate */

export function starterConfig(base, ws) {
  const cur = base || {};
  const live = cur;
  const cfg = ensureStockControllers({
    version: 2,
    entity_options: cur.entity_options || {},
    theme: cur.theme || {},
    remotes: cur.remotes || { default: { capabilities: ["touch", "pointer"] } },
    devices: cur.devices || {},
    keymap: cur.keymap || {},
    home_screen: "home",
    screen_order: ["home"],
    global: { room: "New Room", confirm_switch: true, debug: false,
      /* minted select id is workspace-prefixed (main bare) */
      activity_select: "select.harmonium_" +
        (ws === "main" || !ws ? "" : ws + "_") + "home_activity" },
    /* the STOCK library rides along — it's system, not content. But a
       controller's `parent` is a CONTENT-graph edge (it points at a
       page of the old workspace) — strip it, or a blank starter fails
       validation with "unknown parent" (Suresh, first live create) */
    controllers: Object.fromEntries(Object.entries(live.controllers || {})
      .filter(([, c]) => !c.variant_of)
      .map(([k, v]) => {
        const c = JSON.parse(JSON.stringify(v));
        delete c.parent;
        return [k, c];
      })),
    input: cur.input || {},
    activities: {},
    sequences: {},
    /* the app MASTER LIST + DIALECTS are stock (system, not
       content) — like the controller library, they come from LIVE */
    apps: JSON.parse(JSON.stringify(live.apps || cur.apps || {})),
    dialects: JSON.parse(JSON.stringify(live.dialects || cur.app_classes || {})),
    screens: {
      home: { name: "New Room", class: "room", type: "hub", room: true,
        banner: { image: "", image_opacity: 0.5, height: "230px", min_height: "150px", show_time: true },
        view_kind: "room hub", grid: { columns: 1 },   // room-hub doctrine: one column; sections override
        sections: [{ role: "activities", hero_label: "Activities",
          tiles: [{ id: "acts", type: "activities", room: "home" }] }] },
    },
  });
  /* VIRGIN SWEEP (v0.83.9, the .88 fresh-install test): from an EMPTY
     draft the stock drawers above are PLANTED, not copied — and a
     planted drawer carries its stock parent (controller:tv /
     controller:music) pointing at controllers this config doesn't
     have. The integration's _validate rejects dangling parents, so
     the very first Save & Deploy would 422. Drop any parent whose
     target isn't in THIS config. */
  const navigable = new Set([
    ...Object.keys(cfg.screens || {}),
    ...Object.keys(cfg.controllers || {}).map((c) => "controller:" + c),
  ]);
  for (const c of Object.values(cfg.controllers || {}))
    if (c.parent && !navigable.has(c.parent)) delete c.parent;
  return cfg;
}

/* NAV UNIFICATION (v0.25): group / room / plain-nav tiles are ONE
   type — `nav` with a style. The compiler hard-migrates yaml; this
   heals configs stored before the migration (live store, old scratch,
   imports) so the engine never needs legacy aliases. */

export function normalizeNavTiles(cfg) {
  /* v0.85.7 (Suresh's ghost-position report): `nav` is the CURRENT
     type, not a legacy alias — stamping style:"plain" onto every
     style-less nav card here was silently killing the engine's `auto`
     ladder (borrow the target page's banner photo → image; page has
     devices → summary; else plain) for anything authored in the
     Studio. Only the truly legacy types migrate; a modern nav card
     without `style` stays auto, exactly as authored. Pre-v0.25
     configs whose bare `nav` meant the icon button still render
     sanely — auto's own ladder ends at plain. */
  const MAP = { group: "summary", room: "image" };
  const surfaces = [...Object.values(cfg?.screens || {}), ...Object.values(cfg?.controllers || {})];
  for (const scr of surfaces)
    for (const g of [scr.tiles || [], ...(scr.sections || []).map((s) => s.tiles || [])])
      for (const t of g)
        if (MAP[t.type]) {
          if (!t.style) t.style = MAP[t.type];
          t.type = "nav";
        }
  return cfg;
}

/* HOSTING IS INFERRED (v0.26): a page that owns activities IS a place
   where things run. The `room` marker is the STICKY record of that —
   stamped when the first activity arrives, never removed until the
   page is deleted (its minted select must not flap under automations).
   No user-facing toggle. */

export function stampHost(scr) {
  if (!scr || scr.room || (scr.type || "hub") === "controller") return;
  scr.room = true;
  scr.class = "room";
  scr.view_kind = "room hub";
}

export function normalizeHosts(cfg) {
  for (const act of Object.values(cfg?.activities || {}))
    if (act?.room_view && cfg.screens?.[act.room_view]) stampHost(cfg.screens[act.room_view]);
  return cfg;
}

/* ALL OFF DISSOLVES (v0.28): the special "off" activity is legacy —
   it becomes its owner page's hold-Power binding (just an Action).
   The select's "off" option is minted regardless. */

export function normalizeOffActivity(cfg) {
  const off = cfg?.activities?.off;
  if (!off) return cfg;
  const owner = cfg.screens?.[off.room_view];
  const start = off.start || "";
  if (owner && start.startsWith("sequence:")) {
    if (!owner.buttons) owner.buttons = {};
    if (!owner.buttons.power_hold)
      owner.buttons.power_hold = { sequence: start.slice(9) };
  }
  delete cfg.activities.off;
  return cfg;
}

/* APP CLASSES (v0.30): heal configs from the entity-keyed era — build
   a single "tv" class from the master list's default source names so
   the drawer keeps rendering; identity stays in the master list. */

export function normalizeApps(cfg) {
  if (!cfg) return cfg;
  if (!cfg.dialects) cfg.dialects = {};
  const hasLegacy = Object.values(cfg.apps || {}).some((a) => a && (a.source || a.launch));
  if (!Object.keys(cfg.dialects).length && hasLegacy) {
    const entries = {};
    for (const [aid, a] of Object.entries(cfg.apps || {}))
      if (a && a.source) entries[aid] = { source: a.source };
    if (Object.keys(entries).length)
      cfg.dialects.tv = { name: "TV", apps: entries };
  }
  return cfg;
}

/* DEVICE BUNDLES (v0.45 — the Device Round).
   Top-level `devices` is the first-class device LIBRARY now; hardware
   profiles renamed to `remotes`. Activities may carry cast (device
   ids) + wiring (role → device id | raw entity); the engine still
   reads the compiled context — compileContext is the JS twin of
   build_config.py's compile_activity_devices (keep in sync). Studio
   stores explicit per-activity exceptions in `overrides` (role pins,
   dialect picks, custom keys) and derives context = compiled ∪
   overrides on every wiring edit. */

export const ROLE_KEYS = ["media_player", "dpad", "power", "volume",
  "volume_level", "source_select", "commands",
  /* search (v0.69): WHICH entity answers a library search. A fact
     about the device — a Sonos speaker's searchable index lives on
     its Music Assistant twin — so it is claimed once in the library
     rather than pinned inside a stock controller. */
  "search"];

/* ---- CAST GROUPS (v0.60) ------------------------------------------
   `cast` is a mixed array: device ids (strings) and GROUP objects
     { group, name, icon, shows, members[], target?, style? }
   A group is a VIEW — it says where some of the cast's controls are
   drawn, never what the cast is. Members stay first-class cast
   members (so they keep their jobs, their entities and their row);
   the group only moves their control behind a nav card. Everything
   here is the Studio's twin of context.js's castGroups/
   groupedDeviceIds — keep the two in sync. */

export const isCastGroup = (m) => !!m && typeof m === "object" && !!m.group;
/* what a group's children can be DRAWN as. `device` is the default and
   the universal fallback: a control that fits in a tile is drawn, and
   anything needing more room becomes a launcher into that device's own
   controller (Suresh: "we'd want the parent tile that launched its
   child controller"). Role column = the claim the child binds to;
   null = none needed. Mirrors SHOWS_ROLE in core/context.js. */

export const SHOWS_KINDS = [
  { value: "device", label: "Launcher tile", role: null,
    hint: "opens the device's own controller — always available" },
  /* ONE volume entry (v0.83.7 — Suresh: "we have Volume Control and
     Volume Stepper in DRAWS AS. And we have Volume Style with
     overlapping choices"): Draws-as picks the CONTROL, the Volume
     style select beside it picks the SHAPE. The legacy "stepper"
     value is swept to volume + style: stepper on load. */
  { value: "volume", label: "Volume control", role: "volume",
    hint: "level + − / + — the Volume style select picks its shape" },
  { value: "power", label: "Power button", role: "power",
    hint: "toggles the device itself" },
  { value: "media", label: "Now Playing", role: "media_player",
    hint: "art, title, state" },
  { value: "transport", label: "Transport", role: "media_player",
    hint: "play / pause / skip" },
  { value: "sources", label: "Source picker", role: "source_select",
    hint: "the device's input list" },
  /* entity-controls Phase 2: the native adapters — a Number always
     reads and writes a number, a Select always picks one option;
     variants are shapes, never different service contracts */
  { value: "number", label: "Number", role: null,
    hint: "the entity's own range — slider or − / + set its value" },
  { value: "select", label: "Select", role: null,
    hint: "one of the entity's own options — picker, cycle, or chips" },
];
/* THE ADAPTER REGISTRY (entity-controls Phase 1) — the Studio twin of
   src/core/adapters.js. The region between the markers is BYTE-
   IDENTICAL in both files; probe-entity-phase1 compares them, so the
   two surfaces can never drift. See the engine file for the doc. */
export const ADAPTERS =
/* @adapter-table-begin v1 */
{
  device:    { role: null,            variants: [] },
  volume:    { role: "volume",        domains: ["media_player"],
               variants: ["compact", "slider", "stepper"], dflt: "slider" },
  power:     { role: "power",
               domains: ["media_player", "switch", "light", "fan",
                         "input_boolean"], variants: [] },
  media:     { role: "media_player",  domains: ["media_player"],
               variants: [], row: false },
  transport: { role: "media_player",  domains: ["media_player"],
               variants: [] },
  sources:   { role: "source_select", domains: ["media_player"],
               variants: ["auto", "picker", "cycle", "chips"],
               dflt: "auto" },
  number:    { role: null, domains: ["number", "input_number"],
               variants: ["auto", "compact", "slider", "stepper",
                          "vertical"], dflt: "auto" },
  select:    { role: null, domains: ["select", "input_select"],
               variants: ["auto", "picker", "cycle", "chips"],
               dflt: "auto" },
}
/* @adapter-table-end */
;
/* the variant vocabulary, labeled ONCE — every surface's shape select
   reads this list so the wording can never fork (parity contract) */
/* labels are PROFESSIONAL one-worders (Suresh, 2026-08-31: "tidy up
   our casual language") — the meaning lives in VARIANT_HINTS, shown
   as the option's tooltip where the select supports it */
export const VARIANT_LABELS = {
  auto: "Auto",
  compact: "Compact",
  slider: "Slider",
  stepper: "Stepper",
  vertical: "Vertical slider",
  picker: "Picker",
  cycle: "Cycle",
  chips: "Chips",
};
export const VARIANT_HINTS = {
  auto: "Follows the entity's own hint and range",
  compact: "Value on the title line with − / + controls",
  slider: "A full-width drag track",
  stepper: "− / + buttons with the value between them",
  vertical: "An upright drag track",
  picker: "Shows the current option; opens the full list",
  cycle: "Each press advances to the next option",
  chips: "Every option shown inline",
};
/* the blank option IS Auto for auto-default adapters ("variant
   defaults to Auto and Studio does not write the word" — the design's
   Number/Select rule), so the explicit "auto" row is skipped there */
export const variantOptions = (adapter, blankLabel) => [
  { value: "", label: blankLabel },
  ...((ADAPTERS[adapter] || {}).variants || [])
    .filter((v) => v !== "auto")
    .map((v) => ({ value: v, label: VARIANT_LABELS[v] || v })),
];
/* PHASE 0 #3 → PHASE 1: ONE Draws-as filter per member shape, shared
   by the activity ⚙ (PresPanel) and the page-tile row (TileRow), now
   DRIVEN BY THE REGISTRY: an adapter with no `domains` offers itself
   to any entity (the Launcher rule); otherwise the entity's domain
   must be listed. Devices filter by claimed roles instead. */
export const showsForDomain = (dom) =>
  SHOWS_KINDS.filter((k) => {
    const a = ADAPTERS[k.value] || {};
    return !a.domains || a.domains.includes(dom);
  });
/* devices offer the launcher plus their CLAIMED roles — the role-less
   native adapters (Number, Select) are entity-only until a device
   trait maps them (the design's Sonos bass/treble rule: a bundle
   must not guess which of several number siblings a control means) */
export const showsForRoles = (roles) =>
  SHOWS_KINDS.filter((k) =>
    k.value === "device" || (k.role && (roles || {})[k.role]));

export function compileContext(a, devices) {
  const ctx = {};
  for (const [role, target] of Object.entries(a?.wiring || {})) {
    const dev = devices?.[target];
    if (dev) {
      const ent = dev.roles?.[role];
      if (!ent) continue;               /* claimless wiring — UI warns */
      ctx[role] = ent;
      if (role === "dpad" && dev.traits?.dpad_commands)
        ctx.dpad_commands = JSON.parse(JSON.stringify(dev.traits.dpad_commands));
      if (role === "media_player" && (dev.dialect || dev.app_class) && !ctx.dialect)
        ctx.dialect = dev.dialect || dev.app_class;
    } else if (typeof target === "string" && target.includes(".")) {
      ctx[role] = target;               /* raw-entity escape hatch */
    }
  }
  return ctx;
}

export function recompileContext(a, devices) {
  if (!a || (!a.wiring && !a.cast)) return;
  a.context = { ...compileContext(a, devices), ...(a.overrides || {}) };
}

/* Heal pre-v0.45 configs: (1) move hardware profiles devices→remotes,
   (2) lift each activity's context into cast/wiring by matching
   entities against the library's role claims — unmatched entities stay
   as raw-entity wiring; anything the compile can't reproduce becomes
   an explicit override. Runs before rebaseline, so it never dirties. */

export function normalizeDevices(cfg) {
  if (!cfg) return cfg;
  /* v0.46 (the Dialect Round): app_classes → dialects; the per-item
     key app_class → dialect (activities' context/overrides, device
     bundles, view contexts, apps tiles' `class` attr); retired
     controller:googletv folds into controller:tv (one player —
     dialects supply the differences). */
  if (cfg.app_classes) {
    /* another healer may have minted an empty dialects {} first —
       merge, existing dialects entries winning */
    cfg.dialects = { ...cfg.app_classes, ...(cfg.dialects || {}) };
    delete cfg.app_classes;
  }
  const dialectKey = (o) => {
    if (o && typeof o === "object" && "app_class" in o && !("dialect" in o)) {
      o.dialect = o.app_class;
      delete o.app_class;
    }
  };
  for (const a of Object.values(cfg.activities || {})) {
    dialectKey(a?.context);
    dialectKey(a?.overrides);
    if (a?.screen === "controller:googletv") a.screen = "controller:tv";
  }
  for (const d of Object.values(cfg.devices || {})) dialectKey(d);
  for (const scr of Object.values({ ...(cfg.screens || {}), ...(cfg.controllers || {}) })) {
    dialectKey(scr?.context);
    for (const g of [scr?.tiles || [], ...((scr?.sections || []).map((x) => x.tiles || []))])
      for (const t of g)
        if (t?.type === "apps" && t.class && !t.dialect) { t.dialect = t.class; delete t.class; }
  }
  if (cfg.controllers?.googletv) delete cfg.controllers.googletv;
  /* v0.45.1 (Suresh): the command-channel role renamed system→commands.
     Heal every store-side carrier: device claims, activity context /
     wiring / overrides, and $context.system strings baked into screens
     and controllers (exact-value swap — never a substring replace). */
  const renameKey = (o) => {
    if (o && typeof o === "object" && "system" in o && !("commands" in o)) {
      o.commands = o.system;
      delete o.system;
    }
  };
  for (const d of Object.values(cfg.devices || {})) renameKey(d.roles);
  for (const a of Object.values(cfg.activities || {})) {
    renameKey(a?.context);
    renameKey(a?.wiring);
    renameKey(a?.overrides);
  }
  const swapCtx = (node) => {
    if (Array.isArray(node)) { node.forEach(swapCtx); return; }
    if (node && typeof node === "object")
      for (const [k, v] of Object.entries(node)) {
        if (v === "$context.system") node[k] = "$context.commands";
        else swapCtx(v);
      }
  };
  swapCtx(cfg.screens || {});
  swapCtx(cfg.controllers || {});
  const looksRemote = (v) => v && typeof v === "object" &&
    ("capabilities" in v || "keymap" in v || "fully" in v);
  if (!cfg.remotes && cfg.devices &&
      Object.values(cfg.devices).some(looksRemote)) {
    cfg.remotes = cfg.devices;
    cfg.devices = {};
  }
  if (!cfg.remotes) cfg.remotes = { default: { capabilities: ["touch", "pointer"] } };
  if (!cfg.devices || Object.values(cfg.devices).some(looksRemote)) cfg.devices = {};
  const lib = cfg.devices;
  for (const a of Object.values(cfg.activities || {})) {
    if (!a || a.wiring || a.cast) continue;
    const ctx = a.context || {};
    const wiring = {}, cast = [];
    for (const role of ROLE_KEYS) {
      const ent = ctx[role];
      if (typeof ent !== "string" || !ent) continue;
      const devId = Object.keys(lib).find((d) => lib[d]?.roles?.[role] === ent);
      wiring[role] = devId || ent;
      if (devId && !cast.includes(devId)) cast.push(devId);
    }
    if (!Object.keys(wiring).length) continue;   /* context-free activity */
    a.wiring = wiring;
    a.cast = cast;
    const derived = compileContext(a, lib);
    const overrides = {};
    for (const [k, v] of Object.entries(ctx))
      if (JSON.stringify(derived[k]) !== JSON.stringify(v)) overrides[k] = v;
    if (Object.keys(overrides).length) a.overrides = overrides;
    a.context = { ...derived, ...overrides };
  }
  return cfg;
}

/* THE SELECT MUST NAME A CURRENT ROOM (v0.47.2): configs renamed
   before the renameScreen fix carry an activity_select minted for a
   room id that no longer exists — re-mint it when the repair is
   unambiguous (exactly one room hub). */

export function normalizeSelect(cfg, ws) {
  if (!cfg) return cfg;
  const sel = cfg.global?.activity_select;
  if (typeof sel !== "string" || !sel.endsWith("_activity")) return cfg;
  const rooms = Object.entries(cfg.screens || {})
    .filter(([, scr]) => scr?.room).map(([id]) => id);
  if (!rooms.length) return cfg;
  if (rooms.some((r) => sel.endsWith("_" + r + "_activity"))) return cfg;  /* healthy */
  if (rooms.length !== 1) return cfg;          /* ambiguous — leave it */
  cfg.global.activity_select = "select.harmonium_" +
    (ws === "main" || !ws ? "" : ws + "_") + rooms[0] + "_activity";
  return cfg;
}

/* SECTION LITURGY HEAL (v0.79.1 — Suresh: "On my Main Porch Presets
   are after activities… In my Scratch Porch Page they appear under
   Devices?"): the HubEditor DISPLAYS Hero → Activities → Presets →
   Devices whatever the array says, but the ENGINE renders the array
   as written — and addRoleSection used to push() a new role section
   to the end, so a Presets fold toggled on after Devices rendered
   below it, a lie the editor then hid (there is no way to even SEE
   the true order in the Studio). The role trio is re-seated in
   liturgy order within the exact index slots it already occupies;
   custom sections never move. Role inference mirrors HubEditor's
   roleOf. Safe on hand-written configs: a config already in liturgy
   order (every config the Studio has ever displayed truthfully) is
   untouched byte-for-byte. */

export function normalizeSectionOrder(cfg) {
  const LITURGY = { activities: 0, presets: 1, devices: 2 };
  const roleOf = (s) => {
    if (s.role) return s.role;
    const types = new Set((s.tiles || []).map((t) => t.type));
    if (types.has("activity") || types.has("activities")) return "activities";
    if (types.has("preset") || types.has("presets") ||
        types.has("presets_from")) return "presets";
    if (types.has("apps")) return "custom";
    return types.size ? "devices" : "custom";
  };
  for (const scr of Object.values(cfg.screens || {})) {
    if (!Array.isArray(scr?.sections)) continue;
    const slots = [];                       /* indices held by the trio */
    for (let i = 0; i < scr.sections.length; i++)
      if (LITURGY[roleOf(scr.sections[i])] != null) slots.push(i);
    if (slots.length < 2) continue;
    const trio = slots.map((i) => scr.sections[i])
      .sort((a, b) => LITURGY[roleOf(a)] - LITURGY[roleOf(b)]);  /* stable */
    slots.forEach((i, n) => { scr.sections[i] = trio[n]; });
  }
  return cfg;
}

/* THE CANONICAL-SPELLING NORMALIZER (entity-controls Phase 1,
   absorbing v0.83.7's normalizePresentShows). ONE spelling in the
   activity envelope: the adapter token is `type`, the shape is
   `variant` — legacy `shows`/`style` (and the `stepper` alias) heal
   on Studio load and are never written anew. Idempotent
   (normalize(normalize(x)) == normalize(x) — probe-entity-phase1);
   preserves every unknown field; scoped to the ACTIVITY envelope
   (present + surface), which is wholly user-owned — tile respelling
   inside possibly-stock controllers waits for its subtract-aware
   ruling (Phase 2), though the engine already reads canonical tiles
   and the fingerprint referee already treats the spellings as one
   (ownership.js FP-NORM v1). Cast-group `shows` (the legacy group
   default) stays untouched: `style` on a group is its NAV-CARD
   style, not a variant, and renaming beside it invites the exact
   confusion this normalizer exists to end. */

/* the UPGRADE SUMMARY's raw material (Phase 4): how many legacy
   spellings the LAST normalizeVariants call healed — the load path
   reads it and tells the user before their first post-migration
   Save & Deploy, per the design's rollout section */
export const NORMALIZE_REPORT = { variants: 0 };

export function normalizeVariants(cfg) {
  let n = 0;
  for (const a of Object.values(cfg?.activities || {})) {
    for (const p of Object.values(a?.present || {})) {
      if (!p || typeof p !== "object") continue;
      if (p.shows) { if (!p.type) p.type = p.shows; delete p.shows; n++; }
      if (p.type === "stepper") {           /* the v0.83.7 alias */
        p.type = "volume";
        if (!p.variant && !p.style) p.variant = "stepper";
        n++;
      }
      if (p.style) { if (!p.variant) p.variant = p.style; delete p.style; n++; }
    }
    const s = a?.surface;
    if (s && s.volume_style) {
      if (!s.volume_variant) s.volume_variant = s.volume_style;
      delete s.volume_style;
      n++;
    }
  }
  NORMALIZE_REPORT.variants = n;
  return cfg;
}

export function normalizeConfig(cfg, ws) {
  ensureStockControllers(cfg);
  normalizeVariants(cfg);
  normalizeNavTiles(cfg);
  normalizeHosts(cfg);
  normalizeOffActivity(cfg);
  normalizeApps(cfg);
  normalizeDevices(cfg);
  normalizeSelect(cfg, ws);
  normalizeSectionOrder(cfg);
  return cfg;
}
