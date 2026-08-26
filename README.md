# Harmonium

**Fast-loading remote control dashboards for Home Assistant.** Aimed at low-power Android hardware remotes (Sanytron Astrion, Haptique RS90 and  
similar), while running equally well in any browser, on tablets, and on embedded Linux (WPE WebKit/Cog). Long-term: a product other HA users can adopt — not just a personal fix.

<p align="center">
  <img src="docs/media/astrion-tour.webp" width="280"
    alt="Harmonium running on a hardware remote (astrion)" />
</p>

<p align="center">
  <img src="docs/media/engine-porch.png" width="24%" alt="A room hub: activities, presets, devices" />
  <img src="docs/media/engine-music.png" width="24%" alt="The music controller with live album art" />
  <img src="docs/media/engine-comfort.png" width="24%" alt="Climate, lights and covers" />
  <img src="docs/media/engine-pair.png" width="24%" alt="Bluetooth-style pairing: match the code, tap approve" />
</p>

## Why

I miss the simplicity of the Logitech Harmony, activity + device control through a dedicated handheld remote. Home Assistant takes our control powers to a whole new level.

The new generation of physical remotes (Astrion, Haptique, UnfoldedCircle) have tremendous potential but, by nature, they have modest hardware that struggles with the massive load of the HA UI. Each tries to work around that by providing custom cards to talk to HA. In some cases they use both the remote hardware AND bridges to HA to do their work. But development is slow. Community leverage is weak and as a result, all the products show promise, but none IMO, sufficiently solves real world use cases.

<img src="docs/media/remotes.jpg" align="right" width="200" alt="A pile of remotes" />

For me, the goal is not to replace my complex tablet and browser based dashboards that manage every aspect of my "smart home". I have that already. And a tablet/browser is the right form factor to interface with it. For me, it started the way it probably started for you: a coffee table full of remotes.

I wanted an AV first replacement, and thus was born **Harmonium**.

The bottleneck on remote hardware is not the webview — it is the stock HA frontend: a multi-megabyte bundle plus a websocket firehose of every entity in your instance. Harmonium subscribes to **only the** **entities on the current screen** (~20 messages instead of thousands) and renders them with a dependency-free engine that ships as **one** **auditable HTML file**. The result on a Sanytron Astrion or Haptique RS90: a fast load and a responsive page — not the multi-second Lovelace crawl.

- **Fast.** Quick cold boot even on ancient vendor webviews — the engine's enforced compatibility floor is 2017-era Chromium 61, the Astrion's built-in fallback. No framework, no multi-megabyte bundle, no loading spinner.
- **Buttons are first-class.** Full D-pad / spatial-focus operation. During an activity, the physical D-pad *is* the device's D-pad (Harmony-style passthrough); touch always drives the UI.
- **Activities live in HA, not the remote.** Start "Watch Fire TV" and the TV, soundbar and input switching run HA-side; the remote is a dumb, fast 2-way window onto them. Every remote in the house agrees about what's running.
- **Pairing, not tokens.** A new remote shows a short code; you approve it in the Studio. No copying long-lived tokens onto a kiosk device.
- **A real editor.** The Studio runs as an HA panel. Its live preview IS the engine — rendered inside a photo of your remote, with every physical button mapped and washed live as bindings change.
- **Opinionated, but highly configurable**. The Studio generated pages are "opinionated". The height of a tile, the fonts, the border-radius and so on. But almost all of these are configurable and as I learn more, I (and the community) can do more.

## 📺 Video tutorials — watch it built

Four short videos take you from nothing to a working remote:  
install, two common activities, and device control.

| ![Installing Harmonium via HACS](https://i.ytimg.com/vi/2E28x7pt36k/hqdefault.jpg) | ![Building a Watch TV activity](https://i.ytimg.com/vi/M75ZPYvorUM/hqdefault.jpg) | ![Building a Listen to Music activity](https://i.ytimg.com/vi/vALzJylJLSw/hqdefault.jpg) | ![Presets & Devices](https://i.ytimg.com/vi/lhVmuL7QHfs/hqdefault.jpg) |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **[1 · Install via HACS](https://youtu.be/2E28x7pt36k)**                           | **[2 · Watch TV activity](https://youtu.be/M75ZPYvorUM)**                         | **[3 · Listen to Music activity](https://youtu.be/vALzJylJLSw)**                         | **[4 · Presets & Devices](https://youtu.be/lhVmuL7QHfs)**              |

## The Studio

Everything is built visually in the Studio, an HA panel: screens, activities, presets and key bindings, with a live preview that IS the real engine — rendered inside a photo of your remote, physical buttons mapped by dragging hotspots onto the photo, and new remotes approved with a pairing code, no tokens copied anywhere. Build a 
working activities page with connected controllers in half an hour.
(The tutorials above show all of it in motion.)

![The Studio touring the preview through the hub, music controller, comfort page and diagnostics](docs/media/studio-tour.gif)

## Quick start

#### This is an early release. It is running on 2 HA instances that I have, but YMMV. Please provide feedback so I can make it more robust, as needed. Right now, we don't use on-remote IR (I have Bond units, but it should probably be on the t0-do list). There are likely loads of tweaks needed - so feel free to open issues and requests.

**📺 Every step below is also on video — see** **[Video tutorials](#-video-tutorials--watch-it-built) above.**

1. **Install the integration** — add this repo as a [custom repository in HACS](https://hacs.xyz/docs/faq/custom_repositories) (`skavan/harmonium`, type *Integration*), install **Harmonium**, restart HA, then add the integration under *Settings → Devices & services*. It deploys the engine to `/local/harmonium/` by itself.
2. **Open the Studio** — it appears in HA's sidebar. Build your first
  page, or just look around the starter config.
3. **Point a device at it** — open `http://<your-ha>:8123/local/harmonium/index.html` in any browser, tablet or remote webview. Tap **Pair with Home Assistant**, then approve the code in the Studio. Done.

> **🌐 No special hardware required — Harmonium is a web page.** Everything above runs in **any browser** (desktop, tablet, phone, TV webview) at:
>
> ```
> http://<your-ha>:8123/local/harmonium/index.html
> ```
>
> Open it on your laptop right now and drive the house with your keyboard — the hardware remote is the same page in a kiosk.

The full walk-through (including hardware remotes) is in **[docs/GETTING-STARTED.md](docs/GETTING-STARTED.md)**.

### Putting it on a hardware remote

This is where Harmonium earns its keep — and the physical buttons are half of it, so don't skip this part. **Harmonium ships a ready-made KeyMapper profile for the Sanytron Astrion / HA100**: the whole button story — app-launcher keys, volume/mute/menu, the long-press escape hatches — restores onto a fresh remote in two taps, no button-by-button authoring.

1. **Hardware prep** (once per remote): sideload Fully Kiosk and
  KeyMapper per Brad Sanders' excellent community guide — **and
  check the Astrion's webview** (ⓘ on the remote shows the version —
  if it reads Chromium 61, [update it](docs/GETTING-STARTED.md#%EF%B8%8F-update-the-webview--do-this-its-two-minutes)) —  
   **[Astrion Remote for Home Assistant — sideloading, Fully Kiosk,](https://community.home-assistant.io/t/astrion-remote-for-home-assistant-sideloading-fully-kiosk-button-remapping-guide/1008570)**  
  **[ button remapping](https://community.home-assistant.io/t/astrion-remote-for-home-assistant-sideloading-fully-kiosk-button-remapping-guide/1008570)**  
   (stop before its manual button remapping — the profile below replaces that step).
2. **With the remote on USB**: run `setup-remote.bat` from the repo
  root (locks the display to portrait and warns — without changing
  anything — if the HA100's factory display density of 220 has been lost), then `push-keymapper.bat` — it pushes the bundled profile from [`remotes/keymapper/astrion/`](remotes/keymapper/astrion/) and opens KeyMapper; finish with **⋮ → Restore**. Prefer doing it by hand? The mapping is documented key-by-key in 
   [`astrion-remote-map.md`](remotes/keymapper/astrion/astrion-remote-map.md), and the community guide's screenshots show where everything lives.
3. **Point Fully Kiosk at the URL above**, pair, and pick up at [our hardware-keys cookbook](docs/cookbook/hardware-keys.md) for what every key does — including the glyph row you can bind to anything in the Studio.
4. **Turn on Remote Administration in Fully** (Settings → Remote Administration → enable, set a password). Then you never touch the remote's tiny settings screens again: manage every Fully setting from a desktop browser at `http://<remote-ip>:2323` (the remote's IP is on Harmonium's ⓘ screen), and HA's Fully Kiosk integration gets its device buttons — *Clear browser cache*, *Load Start URL* — which are also Harmonium's update failsafe.

## Cookbook

Task-shaped guides, one outcome each — start here after install:

| Guide                                                                         | You end up with                                      |
| ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| [Your first screen](docs/cookbook/first-screen.md)                            | A room page with live tiles                          |
| [Activities](docs/cookbook/activities.md)                                     | "Watch TV" that turns everything on, in order        |
| [Creating an Activity — the deep dive](docs/cookbook/creating-an-activity.md) | Every tab, every knob, with screenshots              |
| [Presets](docs/cookbook/presets.md)                                           | One-tap Netflix / scene / favorite buttons           |
| [Mapping a physical remote](docs/cookbook/remote-map.md)                      | A new remote model fully described, end to end       |
| [Creating a dialect](docs/cookbook/creating-a-dialect.md)                    | Teach a new platform (Apple TV) its apps and keys    |
| [The device photo](docs/cookbook/device-photo-skin.md)                        | The Studio preview inside a photo of *your* remote   |
| [Hardware keys](docs/cookbook/hardware-keys.md)                               | Physical buttons doing the right thing on every page |
| [Workspaces](docs/cookbook/workspaces.md)                                     | A second remote with a different world               |
| [Theming](docs/cookbook/theming.md)                                           | Your accent, your radius, per-device fonts           |
| [Wipe & reinstall](docs/cookbook/wipe-and-reinstall.md)                       | A box with zero trace, for a clean test              |
| [Removing Harmonium](docs/cookbook/remove-harmonium.md)                      | Complete removal — HA, data, tokens, and the remotes |

Hand-edited config beyond what the Studio surfaces: the config  
contract lives in [docs/screen-schema.md](docs/screen-schema.md).

## How it's built

| Piece           | What it is                                                                                                               | Ships as                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| **Engine**      | The remote UI: screens, tiles, activities, D-pad focus, passthrough, media library + search                              | `dist/index.html` — one file, zero deps         |
| **Integration** | HA custom component: config store, validate→store→deploy API, `harmonium.*` services, pairing broker, engine self-deploy | `custom_components/harmonium/`                  |
| **Studio**      | The visual editor, hosted as an HA panel — the live preview is the real engine                                           | `studio-src/` (Svelte 5) → single `studio.html` |
| **Config**      | Pure data: screens, tiles, activities, keymaps, theme — owned per house by its HA                                        | `www/harmonium/config.json` on each house       |

The engine targets **ES2019 / Chromium 75**, because some remotes ship vendor-frozen webviews and that floor is the normal case. A 20-suite Playwright battery drives the real engine against stubbed websockets on every change.

Architecture, doctrines and the full decision log:  
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·  
[docs/PROJECT.md](docs/PROJECT.md)

> **`dist/config.json` is a test fixture, not a deployable.** Code is shared; config belongs to each house's Home Assistant and is never pushed from the repo. See `houses/README.md` for the multi-house model.

## Developing & contributing

```sh
node build-engine.mjs            # engine → dist/index.html (no npm, no bundler)
cd studio-src && npm run build   # Studio → integration/.../studio/studio.html
cd dist && python3 -m http.server 8482 &
cd tests && for t in smoke-*.mjs; do node "$t"; done   # errs must stay empty
```

Fork setup, deploy scripts (`build-push.bat` and friends, driven by `houses\default.txt`), the house style, and what makes a good PR: **[CONTRIBUTING.md](CONTRIBUTING.md)**. Security model and how to report issues: **[SECURITY.md](SECURITY.md)**.

## Status

Beta (v0.85.7). Daily-driving on a Sanytron Astrion and a Haptique RS90 (Fully Kiosk) across two houses. Recent: a config ownership system (updates refresh built-ins without ever touching your edits), the physical-key routing doctrine with a fixed hold-key vocabulary, a redesigned Music Library and queue, engine self-update on deployed remotes, per-activity Now Playing styles with a [picture menu](docs/cookbook/now-playing-styles.md), and page deep links. Release notes: [docs/releases](docs/releases). Roadmap and open items:  
[docs/PROJECT.md](docs/PROJECT.md).

## Asks

Really need some testers to:

1. Make sure HACS install works outside of my little world.
2. Do a run through of all the basics
3. Help wire up the dialects needed for Apple TV and other popular platforms
4. Identify bugs, warts and inconsistencies
5. Identify missing Tile types and how they should work (i.e. Conditional Tiles)
6. **Weigh in on the D-pad targeting model** — D-pad/Back/Home drive the on-screen remote everywhere *except* TV pages, where taps drive the television. Does that resonate, or does it fight your thumbs? The discussion: [issue #5](https://github.com/skavan/harmonium/issues/5).

## License

[GPL-3.0](LICENSE). Use it, fork it, improve it — but derivatives you distribute must stay open source under the same terms.
