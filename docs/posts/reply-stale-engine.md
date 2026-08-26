# Reply — "preview and remote say v0.84.1, browser says v0.85.6"

## FORUM (short)

Great report — the screenshot told the whole story. All three symptoms (the version mismatch, the D-pad, card height) are ONE thing: your remote and the Studio preview were running a **cached v0.84.1 engine**. Home Assistant serves the engine file with long cache headers, and Fully's web cache survives closing the app and even rebooting the device. Fix: on the Fully device page in HA, press **Clear browser cache**, then reload — ⓘ should now say 0.85.6+. Card height and the newer D-pad behavior start working the moment the real engine loads (they're newer than 0.84.1, which is why the Studio offered knobs the old engine ignored). v0.85.7 makes this whole class of bug impossible going forward — details on the GitHub issue.

## GITHUB (deep)

Thanks for this one — the screenshot (Studio `s0.85.6` top-left, `Engine v0.84.1` inside the preview) diagnosed itself, and it flushed out a real bug on our side. What was going on:

**Why your remote showed v0.84.1 after a reboot.** The engine is a static file under HA's `/local/` path, which HA serves with long `Cache-Control` headers. Your remote loads `/local/harmonium/index.html` — Fully cached the v0.84.1 copy of that URL on disk, and Fully's HTTP cache survives closing the app *and* rebooting the device. Updating the integration replaced the file on the server (which is why a fresh browser window showed 0.85.6), but Fully never asked the server again. *Remedy:* HA → the Fully device page → **Clear browser cache** → reload. One time only, because:

**v0.85.7+ makes this unrepeatable.** Every workspace now has a version-checking address — `http://<ha>:8123/local/harmonium/main/index.html` — a tiny stub that asks the integration for the current engine hash on every boot and loads `index.html?v=<hash>`, so a cache can never pin you to an old engine. After you update, the remote's ⓘ page shows the exact address to configure (the "This page" row, including your `#device=` pin). Point Fully's Start URL there and you'll never clear a cache again.

**Why the *preview* also showed v0.84.1 — that one was our bug.** The Studio's preview iframe loaded the engine through the same bare URL, so your *desktop browser's* cache pinned the preview to v0.84.1 too, no matter what was deployed. Fixed in v0.85.7: the preview now version-checks the engine the same way the kiosk stub does. (`probe-preview-vbust` guards it in CI.)

**Why "card height doesn't work" and the D-pad differences.** Not config problems — the per-card **Card height** knob and the newer focused-tile D-pad behavior shipped after 0.84.1. Your Studio (0.85.6) was offering knobs that the cached 0.84.1 engine rendering the preview had never heard of. "Art Hero – Large" worked because it predates 0.84.1. Everything you set is already in your config and starts rendering the moment the real engine loads — nothing to redo.

**TL;DR:** clear Fully's browser cache once, update to v0.85.7, switch the remote's URL to the one shown on ⓘ, and all three symptoms disappear together.
