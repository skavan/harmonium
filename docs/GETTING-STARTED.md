# Getting started

*Purpose: Zero to a paired remote: install via HACS, open the Studio, pair a device, put it on hardware. Audience: new users.*

Zero → a paired remote showing your house. Fifteen minutes, no file
shares, no tokens copied anywhere. **📺 Prefer to watch? The whole
install is a video: [Installing Harmonium via HACS](https://youtu.be/2E28x7pt36k).**

Harmonium is three pieces. The **integration** (a HACS custom
component) stores your config, brokers pairing, and deploys the
**engine** — one dependency-free HTML file that is the remote UI — to
`/local/harmonium/`. The **Studio**, hosted by the integration as an
HA panel, is where you build everything; its live preview is the real
engine.

---

## 1. What you need

| | |
|---|---|
| Home Assistant | 2024.6 or newer, admin access |
| HACS | [Installed](https://hacs.xyz/docs/use/download/download/) — this is how Harmonium arrives and updates |
| A device for the remote | Anything with a browser: phone, tablet, or an Android hardware remote running Fully Kiosk. **Hardware remotes: budget ~$10/device for a Fully Kiosk PLUS license** — Remote Administration, Start on Boot, and the battery/reload wiring the HA integration uses are all PLUS features |

No file access, no tokens, no command line. HACS delivers the
integration; the integration deploys the engine by itself.

## 2. Install the integration

1. HACS → ⋮ → **Custom repositories** → add `skavan/harmonium`,
   type **Integration**.
2. Search HACS for **Harmonium** → **Download**.
3. **Restart Home Assistant.**
4. *Settings → Devices & services → Add integration* → **Harmonium**.

On setup the integration deploys the bundled engine to
`www/harmonium/index.html` and registers the Studio panel. (It stamps
what it deploys, and never overwrites an engine you pushed there
yourself — see `SECURITY.md` and the CONTRIBUTING notes if you build
from source.)

## 3. Open the Studio

**Harmonium Studio** appears in the HA sidebar. First visit, connect
it with a long-lived token when prompted — the Studio is the *admin*
side, it approves remotes; remotes themselves never see a token
field.

The left rail is everything you own: pages, controllers, building
blocks, system. The right column is the live preview — the actual
engine, rendering your draft as you type.

A fresh install starts empty. Build one small page now — the
[first-screen cookbook](cookbook/first-screen.md) is ten minutes —
then press **Save & Deploy**. Deploying is what publishes a config
for remotes to boot from, so do this once before pairing anything.

## 4. Pair a remote

On any device, open:

    http://<your-ha>:8123/local/harmonium/index.html

This URL is the whole product: Harmonium **is a web page**, and any
browser is a remote — your laptop (keyboard keys work: arrows,
Enter, +/− volume, PgUp/PgDn), a wall tablet, a phone, a TV
webview. Hardware remotes just open the same page in a kiosk. Keep
it bookmarked; it's also the fastest way to sanity-check a config
change without leaving your desk.

**For a permanent kiosk or hardware remote** (an Astrion, a wall
tablet, Fully Kiosk), the question everyone asks is *"does the
Start URL include the `#device=` part, or not?"* **It does. Set
the Start URL to the full form, pin included:**

    http://<your-ha>:8123/local/harmonium/main/index.html#device=astrion

Swap `astrion` for the profile this device wears (astrion2, rs90 —
or one you created). Two things make this the right Start URL:

- The `main/` form re-checks the engine version on every boot, so
  a webview that stays up for months never wakes on a stale cached
  engine after an update.
- `#device=<profile>` is a provisioning pin — stored on first
  load, then stripped from the address bar. That makes it
  *technically* optional after the first open, which is why people
  wonder whether to keep it. Keep it: left in the configured URL
  it re-pins on every boot, so the remote heals itself after
  cleared browser storage or a factory reset, and it costs nothing
  when the pin is already set.

Other workspaces follow the same shape
(`/local/harmonium/<id>/index.html#device=…`). You never have to
assemble this address by hand: the ⓘ page on the remote you're
holding shows the exact line near the top ("This page ·") — copy
that into Fully. The Studio's page settings also show copyable
links under each page's Name; the device-pinned one there is a
*page deep link* (`#page=<id>&device=<profile>`) — same pin, but
it boots to that page, so use the plain `#device=` form above for
a kiosk that should start at home.

1. Tap **Pair with Home Assistant** (the host field is prefilled when
   you're on the same origin).
2. The device shows a short code, big: `FIG-482`.
3. The Studio shows the same code in a banner with **Approve /
   Deny** (an HA notification also announces the request). Codes
   expire in five minutes.
4. Approve → the remote receives its own named, revocable token and
   connects. You'll find the token later under *your HA profile →
   Security*, named after the device and code — revoke it there any
   time to un-pair the remote.

That's the whole loop. Repeat per device; each gets its own token.

## 5. A hardware remote (Astrion / HA100-class)

The hardware prep — sideloading Fully Kiosk Browser, installing
KeyMapper, remapping the physical buttons — is covered start to
finish by Brad Sanders' community guide:
[Astrion Remote for Home Assistant — sideloading, Fully Kiosk, button
remapping](https://community.home-assistant.io/t/astrion-remote-for-home-assistant-sideloading-fully-kiosk-button-remapping-guide/1008570).

One profile fact worth knowing up front: the **RS90 and the Astrion
"v2" profile declare physical transport keys**, so the stock music
controller drops the on-screen transport bar from the LCD on those
remotes — the real REW/Play-Pause/FWD buttons drive the player, and
the screen space goes to the Now Playing card (styles and pictures:
`docs/cookbook/now-playing-styles.md`).

When Fully Kiosk is running: set its Start URL to the address from
step 4 — the full form **with** `#device=astrion` on the end — then
pair as in step 4, and come back to
[our hardware-keys guide](cookbook/hardware-keys.md) to make every
physical button do the right thing — and to
[the device-photo guide](cookbook/device-photo-skin.md) to get the
Studio previewing on a picture of the remote itself.

**First, with the remote on USB, run `remotes/setup-remote.bat`** from the
repo root: it locks the display to portrait (the Astrion's
accelerometer otherwise flips the kiosk the moment the remote is
picked up) and *reports* the display density — on an HA100 it warns
if the factory 220 override has been lost (the astrion profile is
built on it) and prints the one command to restore it; it never
changes anything itself. Sanity check on any device: tap ⓘ on the
remote and compare the Viewport line with the profile's
`skin.viewport`.

### ⚠️ Update the WebView — do this, it's two minutes

Every Astrion carries the **2017 stock webview (Chromium 61)** as
its built-in fallback; the units we've inspected *run* a **Google
WebView 136 baked into /system** (`/system/priv-app/NWebView_x15`,
factory) — and that's where all of Harmonium's tuning happened.
Whether any retail unit actually runs the 61 fallback is unproven
either way, so trust nothing but the device in your hand. The
engine is written to run on 61 regardless (that floor is enforced
in our test battery), but newer is faster and far better tested.
So:

1. **Check first**: tap **ⓘ** on the remote → read the **WebView
   Chromium** row. **136+**: you're done, skip this section.
   **61**: continue.
2. Download the current stable **Android System WebView**
   (`com.google.android.webview`) APK — arm64, Android 8+ — from a
   source you trust (APKMirror carries Google's signed builds).
3. `adb install com.google.android.webview.apk` — Android 8.1's
   provider list includes Google's package by AOSP default, so the
   system should adopt it. (If it doesn't:
   `adb shell dumpsys webviewupdate` names every candidate and why
   it was rejected — open an issue with that output.)
4. Verify: tap **ⓘ** again — the WebView row should show the new
   version. (That row exists precisely so the webview is never
   invisible again.)

The Haptique RS90 is the opposite case: its Android 12 firmware
locks the provider list to its stock Chromium 91 — no upgrade is
possible, none is needed, and Fully's "please update WebView" nag
there can be ignored.

**Skip the button-by-button KeyMapper setup**: the repo ships a
ready-made Astrion mapping at `remotes/astrion/keymapper/v1/` —
`key_mapper.zip` is a full KeyMapper backup, and the mapping is
documented key-by-key in `astrion-remote-map.md` (with keycodes and
scancodes in `KeyCodes Astrion.xlsx`). With the remote on USB and
KeyMapper installed, run `remotes/push-keymapper.bat` from the repo root: it
pushes the backup onto the device and opens KeyMapper — finish with
⋮ → *Restore* → pick the file from Downloads. (Your own mapping can
be backed up the same way with `remotes/pull-keymapper.bat`; details in
[hardware-keys](cookbook/hardware-keys.md).)

Two Fully Kiosk settings worth setting immediately: enable
*Autostart* and disable battery optimization for Fully (the
community guide covers both). Both of these — plus Remote
Administration and the battery/reload features the Home Assistant
Fully integration rides on — need the one-time **Fully PLUS license**
(~$10 per device). Plan for it per remote; there is no free path to
autostart or remote admin.

One more that's worth real battery: check whether some app is
holding a **wake lock** that blocks the remote's deep sleep (on our
own unit it was the HA Companion app, held since boot; others have
caught the stock launcher). Two adb commands diagnose it, and the
remedy depends on the culprit — the recipe, credit, and one
important **do-not-brick warning** in
[hardware-keys → wake locks eat the
battery](cookbook/hardware-keys.md#wake-locks-eat-the-battery-measure-first--and-a-brick-warning).

While you're in hardware-remote land: the
[battery-alerts blueprint](cookbook/battery-alerts.md) makes the
remote nag you before it dies — tiered, windowed, charging-aware,
and it works while the device sleeps.

## What to build first — on video

Three more tutorials pick up exactly where this page ends:
**[a Watch TV activity](https://youtu.be/M75ZPYvorUM)**,
**[a Listen to Music activity](https://youtu.be/vALzJylJLSw)**, and
**[Presets & Devices](https://youtu.be/lhVmuL7QHfs)**. The written versions live in
[the cookbook](cookbook/README.md).

## 6. Where things stand

- **Diagnostics on the device:** tap **ⓘ** in the remote's top bar.
  Engine version, config version, viewport (you'll want this for the
  device photo), connection state, and **Sign out & re-pair**.
- **Updates:** HACS tells you when a new release lands; update,
  restart HA, and the integration redeploys the new engine itself.
  The Studio header shows the installed version and flags newer
  releases.
- **Un-pairing a device:** revoke its token in your HA profile
  (Security tab), or on the device: ⓘ → *Sign out & re-pair*.

## Troubleshooting

**The remote shows the pair screen but the Studio shows no banner.**
The Studio polls every 10 seconds — wait one beat. Still nothing:
you're signed into the Studio without admin rights, or the code
expired (5 min). Ask the remote to pair again.

**Approve fails with "already exists".** A token with that name
already exists from an earlier attempt — revoke it in your profile
(Security) and approve again. (Since v0.81.2 codes are baked into
token names precisely so this is rare.)

**The engine loads but everything says unavailable.** The config
references entities this HA doesn't have — you're likely looking at
someone else's config, or the starter placeholders. Open the Studio
and wire your own entities in.

**I renamed a device (or its entities) and my Activity broke.** There is no automatic entity-rename: an activity holds entity ids in several places (context wiring, device roles, device options, presets), and a rename leaves dangling references — some with no visible field in the Studio. Chasing them one by one is rarely worth it: **delete the activity and recreate it** against the new names (the wizard makes this fast), and prefer renaming entities *before* building activities on them.

**The TV controller has Back/Home buttons at the bottom that the Music controller doesn't.** By design: on TV pages the physical Back/Home keys drive the *device* (passthrough), so Harmonium pins its own touch Back/Home strip to keep UI navigation reachable. Music pages don't need it — there the physical keys already navigate Harmonium.

**Fully Kiosk shows a stale version after an update.** Fully caches
`/local/` hard: Fully settings → *Web Content* → clear cache, then
reload. (The Studio's ⋯ menu has *Save + Reload Astrion* which does
this remotely for paired Fully devices.)

## Deep links — open a page by URL

In a browser, append `#page=<page id>` to the engine URL to land
directly on that page:

    http://<ha>:8123/local/harmonium/main/index.html#page=porch

The page id is the one shown in the Studio (Pages list). It combines
with a workspace (`#ws=guest&page=porch`), it is bookmarkable, and it
affects that load only — nothing is pinned, so kiosks and remotes are
unaffected. An unknown id shows a brief notice and lands on home.
