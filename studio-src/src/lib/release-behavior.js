/* WHAT CHANGED IN BEHAVIOR, per release (the upgrade audit's ruling
   #1: engine-side law changes never touch the config, so no heal can
   report them — a hand-written line each, distilled from the release
   notes, rendered in the audit panel clearly separated from the
   config findings). Add a key per release that changes behavior; a
   release with no entry simply shows none. Keep each line one plain
   sentence — the release notes carry the detail. */
export const RELEASE_BEHAVIOR = {
  "0.87.0": [
    "Tapping a pre-wired device's tile opens a page that speaks THAT device — its keys, its dialect, its apps — instead of the running activity's; its physical keys drive the device when it has a D-pad.",
    "Now Playing defaults to the Art hero on the stock TV and Music controllers and on the Media Device page; Auto means that default. Set a different look on a custom copy's tile, or per activity on its Controller tab.",
    "The Controller tab's ↑↓ is the one order lever for the panel — the Setup tab's cast no longer carries order arrows (member rows inside a group still do).",
    "In a controller's editor the preview shows the controller's own settings with the picked activity's cast; an activity's Controller-tab overrides apply on the remote and in the activity's own card.",
    "Lands-on offers activity surfaces only — stock or custom — grouped by what suits the activity's shape; device pages are adopted from device cards, and custom copies of a device page are templates any compatible device can adopt.",
    "Channel up/down pass through to the device when the TV-tuner switch is on — it is the same thing as ch_up / ch_down in the keys passed to the device.",
    "A cast member can draw as Nothing: kept in the cast, no tile of its own.",
    "Steppers register taps instantly instead of waiting for the device to confirm.",
  ],
};
