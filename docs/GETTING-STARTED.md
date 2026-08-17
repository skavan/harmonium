# Getting started

*Purpose: Zero to a paired remote: install via HACS, open the Studio, pair a device, put it on hardware. Audience: new users.*

Zero → a paired remote showing your house. Fifteen minutes, no file
shares, no tokens copied anywhere.

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
| A device for the remote | Anything with a browser: phone, tablet, or an Android hardware remote running Fully Kiosk |

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

When Fully Kiosk is running: set its Start URL to the address above,
pair as in step 4, then come back to
[our hardware-keys guide](cookbook/hardware-keys.md) to make every
physical button do the right thing — and to
[the device-photo guide](cookbook/device-photo-skin.md) to get the
Studio previewing on a picture of the remote itself.

**Skip the button-by-button KeyMapper setup**: the repo ships a
ready-made Astrion mapping at `remotes/keymapper/astrion/` —
`key_mapper.zip` is a full KeyMapper backup, and the mapping is
documented key-by-key in `astrion-remote-map.md` (with keycodes and
scancodes in `KeyCodes Astrion.xlsx`). With the remote on USB and
KeyMapper installed, run `push-keymapper.bat` from the repo root: it
pushes the backup onto the device and opens KeyMapper — finish with
⋮ → *Restore* → pick the file from Downloads. (Your own mapping can
be backed up the same way with `pull-keymapper.bat`; details in
[hardware-keys](cookbook/hardware-keys.md).)

Two Fully Kiosk settings worth setting immediately: enable
*Autostart* and disable battery optimization for Fully (the
community guide covers both).

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

**Fully Kiosk shows a stale version after an update.** Fully caches
`/local/` hard: Fully settings → *Web Content* → clear cache, then
reload. (The Studio's ⋯ menu has *Save + Reload Astrion* which does
this remotely for paired Fully devices.)
