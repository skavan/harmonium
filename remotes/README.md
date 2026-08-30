# remotes/ — per-remote provisioning, tooling, and facts

Everything for setting up and maintaining a Harmonium hardware remote. Organized by remote **type**, with shared tooling at the top.

## Layout

```
remotes/
  README.md            this map
  lib/                 shared: Resolve-AdbTarget.ps1 (USB-or-wireless device picker)
  setup-remote.bat / pull-keymapper.bat / push-keymapper.bat
  scrcpy.bat           mirror/control any remote through the shared picker
  battery-mon-*.bat    start/finish a discharge + process-attribution run
  units.example.json   template for units.json (your remotes; gitignored)
  device-facts.bat     capture a device's identity + versions (any type)
  fully/               shared Fully Kiosk config (README + canonical settings)

  astrion/             Astrion HA100 - everything
    README.md            setup guide (v2 IME path = canonical)
    facts.md             what the keys send, hold gestures, quirks
    key-input-findings.md  the reboot/injection investigation + dead ends
    keymapper/           gen-map-docs.py + versioned configs v1/ v2/ (each: key_mapper.zip, data.json, remote-map.md, KeyCodes.xlsx) - see its README
    assets/              USBConnect/Disconnect sounds

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
- `scrcpy.bat` — mirror and control a remote over USB or wireless ADB through the shared picker.
- `battery-mon-start.bat` / `battery-mon-report.bat` — bracket a 24–48 hour discharge run and collect Android batterystats, wake-lock/CPU diagnostics, and a Battery Historian bugreport under gitignored `battery-runs/`.
- `<type>/keymapper/gen-map-docs.py` — re-render a version's `remote-map.md` + `KeyCodes.xlsx` from its `key_mapper.zip` (pull offers to run it).

Each `.bat` is a thin launcher over a `.ps1`; double-click works (it pauses so you can read the output) and args pass straight through (`-Target`, `-Type`, `-Keymap`).

## Battery discharge and process attribution

Remove the remote from external power, enable wireless ADB, and run `battery-mon-start.bat`. It uses the shared picker, refuses to start while the device still reports external power, resets Android's accumulated batterystats, enables full wake-lock history when supported, and remembers both the device and run folder. For the least-biased standby measurement, turn wireless ADB back off after it starts, do not use scrcpy, and leave the device in its normal configuration.

After 24–48 hours, enable wireless ADB again and run `battery-mon-report.bat`. It reconnects to the same device and writes final battery/power/CPU snapshots, human and machine-readable batterystats, package-to-UID mappings, `REPORT.txt`, and `bugreport.zip` into that run's folder. Load the zip into Battery Historian to correlate drain with packages, processes, wake locks, jobs, alarms, CPU-running time, screen state, and network activity.
