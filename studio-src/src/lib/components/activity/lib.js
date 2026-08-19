/* The activity card's shared vocabulary — role catalog, per-role
   domain filters, and the Roles tab's copy. Pure constants: no state,
   no imports. Split out of ActivityCard.svelte (v0.83.11). */

export /* smart pickers: each slot only offers COMPATIBLE domains */
const SLOT_DOMAINS = {
  media_player: ["media_player"],
  dpad: ["remote", "media_player"],
  power: ["media_player", "switch", "remote"],
  volume: ["media_player"],
  volume_level: ["media_player"],
  source_select: ["media_player"],
  commands: ["media_player", "remote"],
  search: ["media_player"],
};

/* ---- Setup v2: DEVICES are the nouns, ROLES are the wiring ----
   The device list is the activity's cast (first = ★ primary, the
   activity's face). Role chips wire logical buttons/paths to a
   device; they compile to the same $context map the engine reads. */
export const ROLES = ["media_player", "dpad", "power", "volume", "volume_level",
  "source_select",    /* source_select (v0.36): who owns inputs — wiring
                         it makes the controller's Source tile appear */
  "commands",         /* commands (v0.44 as `system`, renamed v0.45.1 —
                         Suresh): the COMMAND channel — the ADB entity
                         on Google TV / Fire TV. Launches and system
                         keycodes route here; $context.commands-bound
                         tiles hide when it's unwired. */
  "search"];          /* search (v0.69): who answers a library
                         search. Usually the Music Assistant twin of
                         the speaker that plays — MA searches, the
                         native player often cannot, and NEITHER can
                         be told apart by supported_features. */

/* ROLES tab copy (Suresh's ruling, v0.45.1): control name leads,
   mono role key beside it, effect line as the tooltip/hint — no
   baby english; the audience speaks HA. */
export const ROLE_CONTROLS = {
  media_player: "Now Playing",
  dpad: "Navigation",
  power: "Power button",
  volume: "Volume keys",
  volume_level: "Volume readout",
  source_select: "Source picker",
  commands: "Commands",
  search: "Search",
};
export const ROLE_EFFECTS = {
  media_player: "the media tile, transport, play/pause state",
  dpad: "arrows · select · back · home — physical remote keys pass through here",
  power: "DEVICE power — the physical power tap and $context.power tiles toggle this; the on-screen ⏻ ends/starts the ACTIVITY itself (v0.48.1) and needs no wiring",
  volume: "volume up/down (hardware + on-screen) send here",
  volume_level: "where the slider reads truth, when it differs from who takes volume keys",
  source_select: "whose input list the Source tile offers — setting every device's input at start lives in Inputs",
  commands: "app launches + system keycodes (ADB on Android platforms)",
  search: "who answers when you search the library — usually this speaker's Music Assistant twin; unwired means the library page simply offers no search",
};
