/* The tile vocabulary — nav styles, the type taxonomy, search
   classes, and the domain→icon map. Pure. Split out of
   TileRow.svelte (v0.83.11 round 2). */
export const NAV_STYLES = [
    { value: "auto", label: "Auto — image if it has one · summary if the page has devices · plain otherwise" },
    { value: "plain", label: "Plain — icon + label button" },
    { value: "image", label: "Image — full-bleed photo tile" },
    { value: "summary", label: "Summary — live “n entities · k active” from its page" },
  ];

  /* the Type list, grouped so it reads: device + doorway (the two
     archetypes), content generators, then raw widgets for the
     advanced hand — Advanced-tab furniture only */
  /* v0.60: `volumes` and `groups` are cast GENERATORS like `devices` —
     they name no device, so ONE tile on a shared controller serves
     every room (this house's zones, the next house's whatever) */
export const CONTENT_TYPES = ["activity", "activities", "devices", "volumes",
    "groups", "presets", "preset", "presets_from", "apps", "browse",
    "sources", "scene", "script"];

  /* the kinds a media search may ask for (media_filter_classes) */
export const SEARCH_CLASSES = ["artist", "album", "track", "playlist",
    "radio", "podcast", "audiobook"];
export const RAW_TYPES = ["light", "switch", "climate", "cover", "fan", "media",
    "volume", "transport", "mediabtns", "dpad", "buttons", "power"];
export const ENTITY_TYPES = new Set(["light", "switch", "climate", "cover", "fan", "media",
    "volume", "transport", "mediabtns", "script", "scene", "presets_from",
    "sources",     /* sources (v0.35): ONE tile that opens the input picker */
    "power", "stepper",
    /* 2026-09-01 (Suresh's img: "chose number as What it Shows and
       entire Tab contents disappeared"): every adapter token the
       Draws-as select can WRITE must round-trip back into this
       branch, or picking it vaporises the very fields that chose it */
    "number", "select",
    /* V7 §9: the stateless & binary adapters */
    "lock", "press"]);

export const DOM_ICON = {
    media_player: (r) => (r?.device_class === "tv" ? "material:tv" : "material:speaker"),
    light: () => "material:lightbulb",
    switch: () => "material:toggle_on",
    fan: () => "material:mode_fan",
    climate: () => "material:thermostat",
    remote: () => "material:settings_remote",
    cover: () => "material:blinds",
    camera: () => "material:videocam",
  };

/* THE CONTEXT-WIDGET PRIMER (2026-09-04 — Suresh: "many options are
   hidden behind a 'it draws itself from the page's context…'.
   Everywhere we do that we should have a blue info icon that pops up
   a description with an example (or two), that could be copy and
   pasted."). One entry per widget type that reaches TileRow's
   draws-itself branch: what it is in plain words, plus paste-ready
   tile JSON for the Advanced tab / Code view. $context.* refs resolve
   from whatever activity or device supplies the page. */
export const CONTEXT_WIDGET_INFO = {
  dpad: {
    title: "On-screen navigation pad",
    text: "Arrows, OK, back and home as touch buttons. They send to the page's navigation target — $context.dpad, wired by the activity (or the device, on a device page). `unless: physical_dpad` hides it on remotes that have real keys.",
    examples: [
      { label: "the stock pad — hidden on hardware remotes",
        json: { id: "t_pad", type: "dpad", entity: "$context.dpad",
          icon: "material:gamepad", label: "Remote", span: 2, unless: "physical_dpad" } },
      /* token-bound, paste-ready (feedback-3 round 2 — Suresh: "It
         hard codes devices, instead of $device or $context…"): drop
         the `unless` and the pad shows even where physical keys
         exist — a real change you can see immediately */
      { label: "always shown — even on hardware remotes (no `unless`)",
        json: { id: "pad2", type: "dpad", entity: "$context.dpad", span: 2 } },
    ],
  },
  buttons: {
    title: "A row of device keys",
    text: "Named keys (back, home, menu, info, …) as a compact row, sent to the entity the same way the physical keys would be. `only: physical_dpad` shows it just where hardware keys exist to mirror.",
    examples: [
      { label: "the stock back/home pair",
        json: { id: "t_btns", type: "buttons", entity: "$context.dpad",
          buttons: ["back", "home"], label: "On-screen device buttons",
          span: 2, only: "physical_dpad" } },
      { label: "a menu + info row",
        json: { id: "row2", type: "buttons", entity: "$context.dpad",
          buttons: ["menu", "info"], span: 2 } },
    ],
  },
  keys: {
    title: "The dialect's key catalog",
    text: "One tile per key the active DIALECT declares (its keys map) — platform vocabulary as data. Nothing renders when the page's dialect declares no keys, and the whole section then hides itself.",
    examples: [
      { label: "the keys of whatever dialect the page speaks",
        json: { id: "keys", type: "keys" } },
      { label: "pinned to one dialect",
        json: { id: "keys", type: "keys", dialect: "tizen" } },
    ],
  },
  apps: {
    title: "The app launcher grid",
    text: "One launcher tile per app the resolved dialect offers — logo cards, wake-then-launch on a sleeping box. The dialect resolves from the page's context (the drawer serves its opener: from a device page it is THAT device's apps).",
    examples: [
      { label: "every app the dialect offers",
        json: { id: "apps_grid", type: "apps" } },
      { label: "a hand-picked subset",
        json: { id: "apps_grid", type: "apps", include: ["netflix", "youtube", "max"] } },
    ],
  },
  activities: {
    title: "The activity launcher band",
    text: "One tile per activity owned by a room, in registry order, wearing each activity's icon and accent. `room` names the room page the activities belong to.",
    examples: [
      { label: "this room's activities",
        json: { id: "acts", type: "activities", room: "porch" } },
    ],
  },
  devices: {
    title: "The cast band",
    text: "One device tile per cast member of the running activity — tap opens each device's own page (the takeover page for pre-wired devices). Draws nothing when no activity runs.",
    examples: [
      { label: "the running activity's cast",
        json: { id: "cast", type: "devices" } },
    ],
  },
  volumes: {
    title: "The volume band",
    text: "A volume control per cast member that claims one — the activity's audio mixing desk. Members and levels come from the running activity's cast.",
    examples: [
      { label: "the cast's volumes",
        json: { id: "vols", type: "volumes" } },
    ],
  },
  presets: {
    title: "The activity's preset band",
    text: "The presets the running activity declares, as tiles — stations, scenes, favourite inputs. Authored on the activity's card; this widget just gives them a home on the page.",
    examples: [
      { label: "the running activity's presets",
        json: { id: "pres", type: "presets" } },
    ],
  },
  speakers: {
    title: "The speaker grouping card",
    text: "Renders only when the running activity casts two or more players — join and unjoin speakers without leaving the page.",
    examples: [
      { label: "the grouping card",
        json: { id: "spk", type: "speakers" } },
    ],
  },
  groups: {
    title: "Cast group nav cards",
    text: "One nav card per cast group declared by the running activity — names no group itself, so a room without groups renders nothing here.",
    examples: [
      { label: "the activity's groups",
        json: { id: "grp", type: "groups" } },
    ],
  },
  /* 2026-09-05 — Suresh, of dsrc/dsnd: "Chips Widget info not good
     enough - need real world example that does something" */
  chips: {
    title: "Option chips",
    text: "One row of tappable options read live from the entity — `kind` names which list: source (the TV's inputs — tap Fire TV and the set switches to that HDMI), sound_mode (the soundbar's EQ presets), hvac_mode / fan_mode / preset (climate), effect (light effects). Tapping a chip calls the matching select service; the current option is highlighted; an entity that offers no options hides the row entirely.",
    /* token-bound, paste-ready (feedback-3 round 2 — "It hard codes
       devices, instead of $device or $context.media_player and the
       example doesn't show a sample payload that actually might do
       something"): $device follows the device this page shows, so
       pasting the first shape into a Media Device copy's Advanced tab
       renders that device's live input row — tap Fire TV and the set
       really switches. The second binds the activity's wired player,
       for activity controllers. */
    examples: [
      { label: "this device's inputs — tap a chip and the set switches ($device = the device this page shows)",
        json: { id: "dsrc", type: "chips", kind: "source",
          entity: "$device",
          icon: "material:input", label: "", span: 2 } },
      { label: "the activity's player: its sound modes, via the wired role",
        json: { id: "dsnd", type: "chips", kind: "sound_mode",
          entity: "$context.media_player",
          icon: "material:graphic_eq", label: "", span: 2 } },
    ],
  },
  browse: {
    title: "The media library tree",
    text: "Browse and play the standard media_player library of the page's player ($context.media_player) — Sonos, Music Assistant, Plex, whatever the cast player serves. Search rides the same tile via a `search` block.",
    examples: [
      { label: "the library",
        json: { id: "lib", type: "browse" } },
    ],
  },
};

/* FRIENDLY NAMES for label-less tiles (2026-09-05 — Suresh, of
   dsrc/dsnd: "cant we have friendly names for all these keys"):
   the stock device-page tiles ship with empty labels (the widgets
   speak for themselves on the panel), which left the editor rows
   titled by their ids. Display-only — nothing is written to the
   config. */
export function friendlyTileName(t) {
  if (!t) return null;
  if (t.type === "chips") return {
    source: "Source picker", sound_mode: "Sound modes",
    hvac_mode: "HVAC modes", fan_mode: "Fan modes",
    preset: "Presets", effect: "Effects", select: "Options",
  }[t.kind] || "Option chips";
  if (t.type === "stepper") return {
    volume: "Volume", temperature: "Temperature",
    brightness: "Brightness", percentage: "Fan speed",
    position: "Position", number: "Value",
  }[t.kind] || "Stepper";
  return {
    power: "Power", transport: "Transport", media: "Now Playing",
    dpad: "Remote pad", volume: "Volume", coverbtns: "Cover buttons",
    sources: "Source picker", buttons: "Device keys",
    /* the bands, in plain words (2026-09-05, feedback-2: "lets use
       english names. Volume, Speakers, Groups") */
    volumes: "Volume", speakers: "Speakers", groups: "Groups",
    mediabtns: "Modes", devices: "Devices", activities: "Activities",
    presets: "Presets", keys: "Dialect keys", apps: "Apps",
    browse: "Library",
  }[t.type] || null;
}
