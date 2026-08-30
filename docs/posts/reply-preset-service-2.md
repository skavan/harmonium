# Reply — preset service, follow-up (their three example presets)

Paste to the thread.

---

Perfect, that's exactly what I needed — thank you.

Good news: your presets are the easy case. All three name their player explicitly (`media_player.audio_wohnzimmer`, `media_player.philips_tv`) rather than relying on "whatever player the activity wired up", so there's no remote-side context to reproduce. The service just has to do what a tap does: check `wohnzimmer_musik_hoeren` (or `_fernsehen`), start it only if it isn't already running, wait for it to come up, then fire your action exactly as written — the data block passes through verbatim, so the nested `media:` form of your Das Erste preset works unchanged.

So the shape will be:

```yaml
service: harmonium.run_preset
data:
  preset: tile_pfh5    # the preset's id, from Studio → the card → Advanced
```

One call from an automation, a wall switch, an NFC tag — same behavior as tapping the tile, including the skip-if-already-running part that makes it safe to fire repeatedly.

It's on the list for the next release. I'll post here when it ships so you can retire the two-step workaround.
