# Harmonium — getting started

Harmonium is an instant-on control frontend for Home Assistant, built
for low-power Android hardware remotes but equally at home in a
browser or on a tablet. It is three pieces:

    yaml/ authoring model  →  compiled runtime config  →  engine (kiosk)
                                    ▲
                          the Harmonium integration
                    (stores it, serves it, deploys it,
                     and hosts the Studio editor panel)

The **engine** is one dependency-free HTML file. The **config** is pure
data. The **integration** owns the config in HA storage and gives you
the Studio — a visual editor whose live preview is the real engine.

Nothing in the engine is house-specific. Everything about *your* house
lives in the config, and you can build all of it in the Studio.

---

## 0. What you need

| | |
|---|---|
| Home Assistant | 2025.x or newer (developed against 2026.7), admin access |
| Write access to `/config` | Once, for `custom_components/`. Samba share, SSH/Terminal add-on, or the File editor add-on — any is fine |
| A long-lived access token | HA → your profile → Security → Long-lived access tokens → Create |
| Node 18+ and Python 3 | **Only if you build from source.** The repo ships a prebuilt `dist/` |

> **Why the manual copy?** HA's API deliberately refuses writes to
> `custom_components/`. Every other step in this guide can be done from
> a browser; that one needs a file share for sixty seconds.

---

## 1. Get the artifacts

Clone the repo, then either use what's already built:

    dist/index.html      the engine (single file)
    dist/config.json     a compiled runtime config

…or rebuild it from the authoring model:

    node build.mjs

`build.mjs` concatenates `src/` into `dist/index.html` and runs
`yaml/build_config.py` to compile `yaml/` into `dist/config.json`.
If no Python is found it falls back to the frozen `config/config.json`
and says so — check the build output if you care which you got.

---

## 2. Copy the engine into HA

Copy both files into your HA config directory:

    dist/index.html   →  /config/www/harmonium/index.html
    dist/config.json  →  /config/www/harmonium/config.json

That path is served by HA at `/local/harmonium/`.

On Windows with the config share mapped to a drive letter, the repo's
`push-to-ha.bat` does this plus the integration in one go — edit its
`SRC` and `DST` lines for your machine first.

---

## 3. Copy the integration into HA

    integration/custom_components/harmonium/  →  /config/custom_components/harmonium/

Copy the whole folder — `__init__.py`, `manifest.json`, `const.py`,
`config_flow.py`, `workspaces.py`, `select.py`, `sensor.py`,
`services.yaml`, `strings.json`, `translations/`, `studio/`. Skip
`__pycache__`.

---

## 4. Restart Home Assistant

Settings → System → ⋮ → Restart Home Assistant.

Any time you change a `.py` file under `custom_components/harmonium/`,
you restart. Engine and Studio changes never need one.

---

## 5. Add the integration

Settings → Devices & services → **Add integration** → search
**Harmonium** → add. It is single-instance and has nothing to
configure.

Setting up, it:

- seeds its store from the `config.json` you just deployed, so it opens
  showing exactly what your remotes are running;
- writes the canonical entry stub `/config/www/harmonium/main/index.html`;
- serves `/api/harmonium/config` and `/api/harmonium/workspaces`
  (authenticated);
- mounts the Studio at `/harmonium-static` and adds the **Harmonium
  Studio** item to the sidebar (admin users only);
- mints `select.harmonium_<page>_activity` for every page that owns
  activities — the published "what's running here" state;
- registers the services `harmonium.run`, `harmonium.set_activity`,
  `harmonium.reseed`, `harmonium.restore_backup`.

> **Order matters slightly.** Deploy the engine and a config *before*
> adding the integration and the store seeds itself. Do it the other way
> round and you start from an empty store — recoverable with
> `harmonium.reseed` once `config.json` is in place, but the tidy order
> saves a step.

---

## 6. Open the Studio

Sidebar → **Harmonium Studio**.

The first open asks for your long-lived token. It is kept in the
browser's `localStorage` under `hakr_token`, same origin — which is why
the Studio's live preview (the real engine in `#preview=1` mode) shows
live entity states without asking again.

The Studio lands on the **Workspace map**: every page, its activities,
presets and devices, and which control surfaces are shared. Everything
on it is a doorway into the real editor.

---

## 7. Open the remote

    http://<your-ha>:8123/local/harmonium/main/index.html

First run asks for host + token. On a kiosk device you never type
that — provision by URL instead, once:

    .../index.html#host=<ha-host:8123>&token=<LLAT>&device=<profile-id>

The engine stores the values, strips them from the address bar, and
canonicalises the URL to `<workspace>/index.html`. Paste it from a
desktop via your kiosk browser's remote admin — the token never gets
typed on a remote's keyboard.

**A word on tokens:** long-lived tokens in a URL are a *development*
convenience. The intended ladder for real installs is HA's own OAuth
login flow, or the Trusted Networks auth provider for dedicated LAN
devices. See `docs/todo-remote-pairing.md`.

---

## 8. Build your house — a blank workspace

A fresh install has no rooms. The shortest honest path:

1. **＋ Add view** (under Views). Name it — "Living Room". The page id
   follows the name until you pin it.
2. **＋ Add activity** on that page — "Watch TV". Naming it is enough:
   the id auto-fills as a page-prefixed slug, the page becomes a *host*
   (it owns activities), and the integration mints its routing select.
   An activity tile appears in the preview immediately.
3. **Setup tab → devices & roles.** Add the entities this activity
   uses; the roles (`media_player`, `dpad`, `power`, `volume`,
   `volume_level`, `source_select`, `commands`) say who does what.
   Roles are what the shared control surfaces bind to.
4. **Start & stop.** Press ＋ next to Start and the Studio mints a
   sequence seeded with the set-activity step, opens it as a draft, and
   links it when you confirm. Add the device orchestration you want.
   Blank Stop is legal — the page's hold-Power action ends it.
5. **Navigate to (after start) → ＋.** Mints this activity's control
   page from the stock Media Player anatomy: Now Playing, transport,
   volume (with the ARC split when you wire `volume_level` separately),
   a remote pad when a `dpad` role exists, and a cast generator that
   always shows exactly the devices this activity casts.
6. **Save & Deploy.** Validates, stores, writes the runtime file.
   Remotes pick it up on their next reload.

Then repeat per room. Controllers are shared by default — one "TV Media
Player" surface serves every TV activity, parameterised by each
activity's roles. Duplicate one only when a room genuinely needs a
different *shape*.

Two things arrive free in every workspace, so a blank start is never
truly blank: the **stock controller library** (Media Player plus the
generated per-domain device pages — light, switch, climate, cover, fan)
and the **app registry + device dialects**. They are system, not
content.

---

## 9. Describe your remote, then teach it its keys

If you are driving Harmonium from a physical Android remote:

1. In the Studio, under the preview, **✎ edit layout**. Type the
   remote's physical buttons in order, row by row. Standard names are
   offered; custom slot names (Red, Green, `.`, `..`) are legal; an
   empty cell is a blank. `＋` beside "Preview as" mints a new remote
   profile first if this is a new device.
2. On the remote itself, **hold the ⓘ icon** in the title bar → **Key
   capture**. Press a physical button, then tap the slot it belongs to.
   Repeat. **💾 Save** writes the keymap back through the same API and
   applies it live.

Full detail, including the KeyMapper half and what's still open, is in
`docs/todo-remote-pairing.md`.

---

## 10. Day-to-day: how changes reach the remotes

| You changed | What to do |
|---|---|
| Anything in the Studio | **Save & Deploy** (the button validates, stores and deploys) |
| `src/` (the engine) | `node build.mjs`, copy `dist/index.html`, reload the remote |
| `yaml/` (the authoring model) | `node build.mjs`, copy `dist/config.json`, then call `harmonium.reseed` |
| `custom_components/harmonium/*.py` | copy, then **restart HA** |
| `studio/studio.html` | copy, then hard-refresh the Studio tab |

`harmonium.reseed` is a **three-way merge**, not an overwrite: it keeps
Studio-side edits that the repo didn't touch, lets repo deletions
through, and on a genuine conflict the repo wins and says so in the
log. The outgoing config is snapshotted first —
`harmonium.restore_backup` is a one-deep undo.

---

## 11. Things worth knowing before they bite

- **The Studio edits the compiled config, not `yaml/`.** There is no
  round-trip yet. A change you want to keep long-term should be ported
  back into `yaml/` by hand; the three-way merge stops deploys from
  destroying it in the meantime, but that is a safety net, not a
  substitute.
- **Bare `/local/harmonium/<ws>` returns 403.** HA's static handler
  serves no directory index. Always use the full
  `<ws>/index.html` — that is the canonical address, and the engine
  rewrites the bar to it.
- **Workspaces are separate worlds.** One workspace = one remote's
  whole config. `main` is the repo-built one; others deploy as
  `config.<ws>.json` with their own entry stub. All of them are live at
  once.
- **A page becomes a "room" by owning activities** — you never declare
  it. The marker is sticky for the life of the page so the minted
  select never flaps.
- **Material Symbols load from Google's CDN.** On an isolated network
  the icons render as their literal names. Self-hosting is a known debt.
- **The engine subscribes only to what is on screen.** That is the
  whole performance thesis; if you find yourself wanting a global
  subscription, something else has gone wrong.

---

## Appendix A — the Jamaica install (192.168.1.95)

**Status: installed and running since 2026-08-03** (engine v0.59,
config v8, one room; **v0.60 / config v9 built in the repo, awaiting
`push-to-ha.bat`**). What follows is what this house actually is, not a
plan. For the session-to-session view see `docs/HANDOFF.md`.

**Machine and paths**

    repo clone   G:\Local Documents\Code 2025\repos\harmonium   (dragonfly-evo)
    HA config    H:\   →  \\192.168.1.95\config
    HA           http://192.168.1.95:8123

`push-to-ha.bat` is already pointed at this machine and refuses to run
if `H:` is not the config share.

**It was built from a BLANK workspace**, as planned — one `bar` room
page, then activities. What is NOT blank, and matters if you build the
next room: the stock controller library came across, and so did the app
registry and device dialects. Those are *not* minted by the Studio — the
docs above claim they arrive free and only the controller half is true.
A genuinely empty install gets `apps: {}` and `dialects: {}`.

**The deploy loop here**

1. `push-to-ha.bat`
2. `harmonium.reseed`
3. **No cache clear** — the entry stub version-stamps the engine URL
   from a hash of the deployed file (v0.57.1). Every tablet inherits
   this; there is nothing per-device to configure and no IPs to pin.
4. HA restart only for `custom_components/harmonium/*.py`
5. `studio.html` is browser-cached — hard-refresh that tab

**⚠ Do not run `node build.mjs` in this clone.** There is no Jamaica
yaml model; the build would recompile the *Porch* yaml over
`dist/config.json` and wipe this house. The engine half is safe, the
config half is not. Until yaml round-trip lands, treat
`dist/config.json` here as hand-authored source.

**The webview floor.** The wall tablet is a Fire HD 8 (Fire OS 7) whose
WebView Amazon pins at **Chromium 75**, with exactly one valid provider —
so it cannot be upgraded and the ADB provider swap is closed. The engine
now targets **ES2019 / Chromium 75** because of it (v0.56.1). If a device
shows the chrome but a blank grid, load `/local/harmonium/diag.html`:
ES5, and it names the missing syntax feature outright.

**Remote profiles.** `default` is the shipped chrome. `tablet` carries a
100px header via `remotes.tablet.style`. Provision once with
`…/main/index.html#device=tablet`.

**Things that did not carry over from home**

- The Astrion kiosk button entities (`button.astrion1_*`) do not exist
  here, so *Save + Reload Astrion* has nothing to press. The versioned
  stub makes that irrelevant for engine updates.
- The home instance's helpers, activity scripts and sync automation are
  Porch-specific history. This house runs `harmonium.run` sequences
  authored in its own config; the legacy `script.bar_*` scripts are
  still in HA but nothing references them.
- Music favourites sensors (`sensor.harmonium_music_*`) are published by
  the integration and appeared on their own once Music Assistant was
  seen.

**A second HA, not a second workspace.** Two houses are two Home
Assistant instances, each with its own Harmonium install. Workspaces are
for two *remotes* in one house — don't reach for them here.
