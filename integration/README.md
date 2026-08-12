# Installing the Harmonium integration

The integration is the third leg of the Harmonium stack:

    yaml/ authoring model  →  compiled runtime config  →  engine (kiosk)

It stores the runtime config in HA storage, serves it over an
authenticated API (`/api/harmonium/config`), deploys saved configs to
`/config/www/remote-proto/config.json` (the path every remote reads),
and adds the **Harmonium Studio** editor panel to the HA sidebar.

## Install (manual copy — one time)

Home Assistant does not allow writing to `custom_components/` through
its API, so this step is done by hand (Samba/SSH/File editor add-on):

1. Copy the whole folder

       integration/custom_components/harmonium/

   into your HA config directory so it becomes

       /config/custom_components/harmonium/

   (containing `__init__.py`, `manifest.json`, `const.py`,
   `config_flow.py`, `strings.json`, `translations/`, `studio/`).

2. Restart Home Assistant (Settings → System → Restart).

3. Settings → Devices & Services → **Add Integration** → search
   "Harmonium" → add it. There is nothing to configure — it is a
   single-instance integration.

4. **Harmonium Studio** now appears in the sidebar (admin users only).

## First open

The Studio's live preview is the real engine loaded from
`/local/remote-proto/index.html#preview=1`, and it talks to HA over
websocket for live entity states. It uses the same long-lived access
token as the remote itself, shared via `localStorage` (`hakr_token`,
same origin). If the browser you open the Studio in has never run the
remote, the Studio shows a token prompt once — paste an LLAT and it is
remembered for both the Studio and the remote preview.

## What Save does

**Save & Deploy** validates the draft (same structural checks as
`yaml/build_config.py`), stores it in HA storage
(`.storage/harmonium.config`), and writes it to
`/config/www/remote-proto/config.json`. Remotes pick it up on their
next reload. **Save + Reload Astrion** additionally presses the
kiosk's clear-cache and load-start-URL buttons so the device reloads
immediately (button entity ids are configurable in the Studio,
defaults: `button.astrion1_clear_browser_cache`,
`button.astrion1_load_start_url`).

On first run the integration seeds its store from the currently
deployed `config.json`, so the Studio opens showing exactly what the
remotes are running.

## Relationship to yaml/

`yaml/` remains the source-of-record authoring model in the repo
(`build_config.py` compiles it). The Studio edits the *compiled*
runtime config live. If you make a change in the Studio that you want
to keep long-term, port it back into `yaml/` — otherwise the next
`node build.mjs` deploy will overwrite it. (Studio ↔ yaml round-trip
is a future phase; see docs/authoring-ui.md.)
