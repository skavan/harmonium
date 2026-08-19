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
    "power", "stepper"]);  /* v0.79.2: Draws-as round trips need them here */

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
