# Activities

*Purpose: A "Watch TV" activity that turns everything on in order and routes the remote. Audience: users.*

**Outcome:** a "Watch Fire TV" card that powers the TV and soundbar,
switches inputs, hands the D-pad to the Fire TV — and shows as *On*
on every remote in the house.

*(This is the quick version. Every tab, every knob, and the concepts
behind them — with screenshots — live in
[Creating an Activity — the deep dive](creating-an-activity.md).)*

## The idea (read this once)

An activity is Harmony's best idea done HA-side. The remote never
runs the sequence — it asks Home Assistant to, via the integration's
`harmonium.run`. State lives in a minted
`select.harmonium_<room>_activity` that the integration owns, so
automations can react to it and every remote agrees about what's
running. The engine is a dumb, fast window.

Each activity declares:

- **a cast** — the devices it involves (from your device library);
- **roles** — which cast member is the volume, which is the D-pad,
  which is the power (`media_player`, `dpad`, `power`, `volume`…);
- **actions** — the start/stop sequences;
- **a controller** — the page shown while it runs (the stock
  TV / Music controllers work out of the box), plus per-activity
  band switches and presets;
- **state** — which entity states mean "this is on" (so the card is
  truthful even when someone used another remote, or the TV's own).

## 1. Build one

On your room page: **Activities section → ＋ Add activity**. The
builder is tabbed — **Setup · Roles · Inputs · Actions · Controller ·
State** (Advanced holds the raw JSON) — with completion dots showing
what still needs attention.

1. **Setup**: name ("Watch Fire TV"), icon, accent — then cast the
   devices. One search box does it all: pick from your library, take
   a suggested ⊞ bundle (minted into the library on pick), or cast a
   raw entity directly. Pick **Navigate to** — the controller the
   activity lands on — or let ＋ mint a control page for you.
2. **Roles**: which cast member fills each role — who takes the
   volume keys, who owns the D-pad, who is power. Cast devices offer
   their claims first; picking an unclaimed one saves the claim back
   to the library, so the next cast fills itself.
3. **Inputs**: which input each device must land on ("Fire TV" on
   the TV). Feeds the generated start action and state detection.
4. **Actions**: the start/stop sequences. Don't write them — the
   **⚙ Generate from the answers** buttons build them from the cast,
   roles and inputs (power is never guessed: only devices you check
   get turned off on stop). The drafts are ordinary editable Actions;
   regenerating never overwrites your edits.
5. **Controller**: what the screen shows while this runs — one
   switch per band (Now Playing, transport, volume, speakers…) plus
   this activity's presets. The surface stays shared; the choices
   travel with the activity.
6. **State**: what makes the card say *On*. With no rule, the
   primary device's player implies it; the ⚙ buttons generate a rule
   from your inputs or the primary device in one click.

The activities *tile* on the page renders every activity for the room
automatically — you never lay out the cards by hand.

## 2. What running feels like

Press the card: the sequence runs HA-side, the remote navigates to
the activity's controller screen, and the physical D-pad becomes the
device's D-pad (passthrough — touch always stays with the UI).
Volume keys drive the wired volume target. **Hold the card** (or the
End button in the bar) to stop; activities with `confirm_end` ask
twice, so a pocket-press can't shut the room down.

Start a *different* activity and the engine hands over cleanly —
shared devices stay on, departed ones power off.

## 3. Presets on top

Once "Watch Fire TV" works, [presets](presets.md) put Netflix and
YouTube TV one tap away — a preset can target an activity, so
pressing *Netflix* starts the activity if needed, then launches the
app. They live on the activity's **Controller** tab.

## Troubleshooting

- **Card stuck on Off while the TV is clearly on** — the State tab's
  declaration doesn't match reality; check which entity and states
  you declared. Truth comes from device state, not from whether the
  sequence ran.
- **Volume keys do nothing during the activity** — the `volume` role
  isn't wired, or is wired to a device whose volume HA can't drive;
  re-check the Roles tab.
- **D-pad drives the UI instead of the device** — passthrough claims
  arrows + select only while an activity's controller screen is
  showing; make sure the activity's **Navigate to** is set and the
  `dpad` role is wired.
