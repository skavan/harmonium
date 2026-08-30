# Reply — preset-as-a-service request

Paste to the forum/GitHub thread.

---

You've read it exactly right, and it's a good idea.

The part of a preset you can't reproduce with `harmonium.run` is precisely the part you named: **Belongs to activity**. On the remote, tapping your preset does three things in order — starts *Musik hören* if it isn't already running (and skips that if it is), waits until the activity is actually up and its player is wired, then fires your service call with that player as the target. All of that logic currently lives on the remote itself, which is why there's no single HA call that does it for a service-call preset.

What v0.85.7 gives you as a stopgap: `harmonium.set_activity` with `start: true` now does the first half properly — it flips the routing select *and* runs the activity's Start action, through the same runner the remote uses. So a two-step script (set_activity, then your service call) gets close. Two caveats to be straight about: `start: true` runs the Start action even if the activity is already running, so if that matters, add a condition on the activity select before the call; and your service call has to name its own target, since the preset's automatic "use this activity's player" resolution is also remote-side today.

The real fix is what you're asking for: `harmonium.run_preset` with a preset id, doing exactly what a tap does — ensure the activity (skip when running), wait for it to come up, resolve the target from the activity, fire the action. Everything it needs is already in the stored config, so it's very buildable, and it would make a wall switch, an NFC tag and the remote the same button. It's on the list for the next release.

One thing that would help me get it right the first time: paste the JSON of one of your presets (Studio → the preset card → Advanced) so I can make sure the target resolution covers your exact shape.
