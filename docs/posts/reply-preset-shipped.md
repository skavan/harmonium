# Reply — preset service SHIPPED (the promised ping)

Paste to the thread where he posted the three presets (egoFM / Mix der Woche / Das Erste). Owed since v0.85.8 tagged — reply-preset-service-2.md ended with "I'll post here when it ships."

---

Following up as promised: `harmonium.run_preset` shipped in v0.85.8, so if you've updated through HACS since, you already have it.

One call, same behavior as tapping the tile:

```yaml
service: harmonium.run_preset
data:
  preset: tile_pfh5    # egoFM — the preset's id, from Studio → the card → Advanced
```

The details we discussed all made it in: if the preset's activity isn't running it starts it first and waits for it to come up; if it's already running it skips straight to the action (so firing it repeatedly is safe); and the data block passes through verbatim — the nested `media:` form of your Das Erste preset works unchanged. You can retire the two-step `set_activity` workaround.

A small thank-you: your three presets became the acceptance tests for the service, so that exact shape is now guarded by the test suite in every future release.
