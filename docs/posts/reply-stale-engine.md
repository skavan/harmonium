# Reply — "preview and remote say v0.84.1, browser says v0.85.6"

## FORUM (short)

Great report — the screenshot told the whole story. All three symptoms (the version mismatch, the D-pad, card height) are ONE thing: your remote and the Studio preview were running a **cached v0.84.1 engine**. Home Assistant serves the engine file with long cache headers, and Fully's web cache survives closing the app and even rebooting the device — a reboot reloads the page, but the reload is served straight from Fully's disk cache. Fix, one time: on the Fully device page in HA press **Clear browser cache**, then **Load Start URL** — ⓘ should now show the current version, and card height and the newer D-pad behavior start working the moment the real engine loads (they shipped after 0.84.1, which is why the Studio offered knobs the old engine ignored). v0.85.7 makes this whole class of bug impossible going forward — details on the GitHub issue.

## GITHUB (deep)

Thanks for this one — the screenshot (Studio `s0.85.6` top-left, `Engine v0.84.1` inside the preview) diagnosed itself, and it flushed out a real bug on our side. What was going on:

**Why your remote showed v0.84.1 after a reboot.** The engine is a static file under HA's `/local/` path, which HA serves with long `Cache-Control` headers. Your remote loads `/local/harmonium/index.html` — Fully cached the v0.84.1 copy of that URL on disk, and Fully's HTTP cache survives closing the app *and* rebooting the device: the reboot re-navigates, but the navigation is answered from cache without ever asking the server. Updating the integration replaced the file on the server (which is why a fresh browser window showed 0.85.6), but the remote never saw it. *Remedy, one time:* HA → the Fully device page → **Clear browser cache**, then **Load Start URL**.

**v0.85.7 makes this unrepeatable, twice over.** First, every workspace has a version-checking address — `http://<ha>:8123/local/harmonium/main/index.html#device=<profile>` — a tiny stub that asks the integration for the current engine hash on every boot and loads `index.html?v=<hash>`, so a cache can never pin a boot to an old engine. Set Fully's Start URL to it: the easiest way is from the Studio — open the page the remote should boot to and click the second copy-link under its Name (the one ending `&device=…`). Second, the engine now **updates itself**: a running remote checks the deployed version whenever its connection comes back or the screen wakes, and reloads through that address when a newer engine has landed — so after this one fix, updates reach your remote with no buttons pressed at all.

**Why the *preview* also showed v0.84.1 — that one was our bug.** The Studio's preview iframe loaded the engine through the same bare URL, so your *desktop browser's* cache pinned the preview to v0.84.1 too, no matter what was deployed. Fixed in v0.85.7: the preview version-checks the engine the same way the kiosk address does. (`probe-preview-vbust` guards it in CI.)

**Why "card height doesn't work" and the D-pad differences.** Not config problems — the per-card **Card height** knob and the newer focused-tile D-pad behavior shipped after 0.84.1. Your Studio (0.85.6) was offering knobs that the cached 0.84.1 engine rendering the preview had never heard of. "Art Hero – Large" worked because it predates 0.84.1. Everything you set is already in your config and starts rendering the moment the real engine loads — nothing to redo.

**TL;DR:** update to v0.85.7, press Clear browser cache + Load Start URL once, set the Start URL to the versioned address from the Studio's page links — and from then on the remote keeps itself current. All three symptoms disappear together.
