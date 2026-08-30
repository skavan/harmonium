# remotes/ — per-remote provisioning, tooling, and facts

Everything for setting up and maintaining a Harmonium hardware remote. Organized by remote **type**, with shared tooling at the top.

## Layout

```
remotes/
  README.md            this map
  lib/                 shared: Resolve-AdbTarget.ps1 (USB-or-wireless device picker)
  setup-remote.bat / pull-keymapper.bat / push-keymapper.bat
  units.example.json   template for units.json (your remotes; gitignored)
  device-facts.bat     capture a device's identity + versions (any type)
  fully/               shared Fully Kiosk config (README + canonical settings)

  astrion/             Astrion HA100 - everything
    README.md            setup guide (v2 IME path = canonical)
    facts.md             what the keys send, hold gestures, quirks
    key-input-findings.md  the reboot/injection investigation + dead ends
    keymapper/           gen-map-docs.py + versioned configs v1/ v2/ (each: key_mapper.zip, data.json, remote-map.md, KeyCodes.xlsx) - see its README
    assets/              USBConnect/Disconnect sounds
    scripts/             scrcpy-wifi.bat, scrcpy-usb.bat

  rs90/                Haptique RS90 - everything
    facts.md, key-research.md
    keymapper/           gen-map-docs.py + v1/ (config + generated map)
```

## units.json (yours, gitignored)

Copy `units.example.json` to `units.json` and list your remotes. Each entry has:

- `name` — what the picker shows.
- `type` — the folder here (`astrion`, `rs90`). Tools route by it.
- `keymap` — which Key Mapper config VERSION the unit runs (`v1`, `v2`). Upgrading = change this and re-push. Never forced.
- `ip` (+ optional `port`) — for wireless ADB; omit for USB-only.

Your LAN addresses live only in `units.json`, never in the repo.

## The tools (all take USB or wireless; run with no args to be prompted)

- `setup-remote.bat` — one-time Android prep (rotation lock, density check).
- `push-keymapper.bat` — deploy a config version to a remote (`remotes/<type>/keymapper/<keymap>/`).
- `pull-keymapper.bat` — grab a remote's current backup into the same place.
- `device-facts.bat` — dump identity + app/webview versions.
- `astrion/scripts/scrcpy-*.bat` — mirror the screen (wifi via the picker, or USB).
- `<type>/keymapper/gen-map-docs.py` — re-render a version's `remote-map.md` + `KeyCodes.xlsx` from its `key_mapper.zip` (pull offers to run it).

Each `.bat` is a thin launcher over a `.ps1`; double-click works (it pauses so you can read the output) and args pass straight through (`-Target`, `-Type`, `-Keymap`).
