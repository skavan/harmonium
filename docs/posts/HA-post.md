I have a jumble of remotes on my coffee table. Even today, in 2026.

There are hardware remotes out there — the Astrion, the Haptique RS90, the Unfolded Circle — with exactly the right form factor, but the software isn't (IMO) ready for daily-driver duty, and most of it is closed source. Two of them, the Astrion and the RS90, run stock Android under the hood — but their modest hardware can't cope with the firehose of Lovelace connections that comes with the HA Companion app, which is why all these vendors end up building custom UIs in the first place.

So I built Harmonium: a single, dependency-free web page that cold-boots fast even on an ancient webview and gives me a performant, activity-centric workflow — one button for "Watch Fire TV" or "Listen to Music", along with Presets and Device control — that let me actually retire the pile of remotes on the coffee table(s). It's been running my house for a couple of weeks, and it's now in open beta on HACS.

A few minutes watching short videos, says it better than I can:

- [1 · Install via HACS](https://youtu.be/2E28x7pt36k)
- [2 · Build a Watch TV activity](https://youtu.be/M75ZPYvorUM)
- [3 · Build a Listen to Music activity](https://youtu.be/vALzJylJLSw)
- [4 · Presets & Devices](https://youtu.be/lhVmuL7QHfs)

Much more comprensive info at the repo: [https://github.com/skavan/harmonium](https://github.com/skavan/harmonium)

[upload: astrion-tour.webp]

[upload: engine-porch.png]

How it works: everything lives HA-side. Activities call your existing scripts and scenes; the engine talks straight to the HA websocket with one token per remote, minted with a pairing code — nothing copied around. **You build it all visually in the Studio** (an HA panel) where the live preview IS the real engine, rendered inside a photo of your actual remote, physical buttons mapped by dragging hotspots onto the photo. There's a full music library browser (Music Assistant / Sonos), a hardware-key doctrine, per-remote skins, and battery alerts that fire even while the device sleeps. If you ever loved the Logitech Harmony way of doing things, the activity model will feel familiar.

Hardware: any browser is a remote — a wall tablet, an old phone, a spare laptop tab. My daily driver is the Astrion (~$180, stock Android, real buttons) and a Haptique RS90; @thebradleysanders excellent [sideloading guide](https://community.home-assistant.io/t/astrion-remote-for-home-assistant-sideloading-fully-kiosk-button-remapping-guide/1008570) gets you from box to Fully Kiosk, and there's a dedicated Astrion thread over on the [Sanytron forum](https://forum.sanytron.com/t/harmonium-a-fast-activity-based-universal-remote-platform-for-the-astrion-built-on-home-assistant-open-beta/294). One caution from my own bench: skip the guide's "install the HA Companion app" step — a background wake lock kept my unit from ever deep-sleeping, and Harmonium doesn't need it.

This is an open beta and I'd love volunteers: install it, break it, and tell me what happened — bugs, rough edges, and feature requests all welcome as [GitHub issues](https://github.com/skavan/harmonium/issues). And if your streaming platform isn't covered yet (Fire TV, Google TV and Tizen ship today), app launching is driven by small JSON "dialects" — the [creating-a-dialect cookbook](https://github.com/skavan/harmonium/blob/main/docs/cookbook/creating-a-dialect.md) walks through an Apple TV example end to end, and dialect PRs are very welcome.
