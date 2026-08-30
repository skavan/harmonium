"use strict";
/* ================================================================
   HA Remote — single-file engine.

   Architecture in one breath: config.json (pure data: screens,
   sections, tiles, activities, context, keymap, theme) is rendered
   by this engine over a filtered Home Assistant websocket —
   subscribe_entities with entity_ids means we receive diffs for
   ONLY the entities on the current screen (~20 msgs, not the
   full-instance firehose the stock frontend drinks).

   Load-bearing concepts, in reading order below:
   · Device profiles / CAPS   — capability set drives tile
     visibility (only/unless) and input behavior per device.
   · Context                  — screen `context` overlaid by the
     active activity's; `$context.slot` is the ONLY substitution.
   · Activities               — HA scripts + an input_select HA
     owns; select=start/open, hold|power=end (inline confirm).
   · Detail screens           — virtual screens generated per
     domain (power/stepper/chips); options come from attributes.
   · Widget catalog           — one tile chassis, per-type adapters
     (sub/isOn/meter/select/capture/body/wire/render).
   · Focus                    — spatial D-pad nav from DOM rects;
     capture mode gives a widget the D-pad; trailing zones and
     hero elements are extra focus stops.
   · Passthrough              — on screens declaring
     dpad_passthrough, PHYSICAL keys drive the device (Harmony
     rule); touch always drives the UI.
   ================================================================ */
const T0 = performance.now();

/* Gesture/flow tunables (ms). Candidates for shell settings later. */
const TIMING = {
  hold: 450,          // select held this long = hold gesture
  powerHold: 600,     // power held this long = All Off
  confirm: 5000,      // two-press confirm window (tile + status bar)
  presetPoll: 300,    // ensure-activity: poll interval for state flip
  wakeDelay: 600,     // dialect wake → app launch gap (v0.83.9)
  dpadRepeat: 170,    // fast-dpad pacing: min gap between ACTION-valued
                      // dpad sends (Fire TV field tests, 2026-08-27: the
                      // UI consumes ~6 presses/sec and no transport beats
                      // it — 150ms host-paced and 200ms device-paced
                      // bursts converged on the same ceiling)
  padLatch: 8000      // CH borrows the D-pad this long (his field call: "5 secs
                      // maybe a touch to small" — 8s default; config
                      // input.pad_latch_seconds overrides per house)
};
