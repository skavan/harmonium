# The repo-root scripts

*Purpose: what every `.bat` (and build script) at the repo root does,
who runs it, and when. Audience: developers and forkers wondering
which of the eleven batch files they actually need.*

All deploy scripts act on **your default house**, one line in
`houses\default.txt` naming a profile in `houses\<name>.cmd`
(`houses/example.cmd` is the tracked template — a fork needs those
two small files and nothing else). Every push is guarded: `push.bat`
refuses unless the target share's `.house` marker matches, so a
mapped drive letter can never send one house's files to another.

## Daily drivers

| Script | What it does | Restart HA? |
|---|---|---|
| `build-push.bat` | **The routine deploy**: builds Studio + engine, pushes both, prints the cache rituals | no |
| `push-engine.bat` | Push the already-built engine only | no |
| `push-studio.bat` | Push the already-built Studio only | no |
| `push-all.bat` | Push engine + Studio + integration (no build) | only if it says so |
| `make-release.bat` | Release build: Studio → engine → engine bundled into the integration. Then commit + tag (see [cookbook/releasing.md](cookbook/releasing.md)) | — |

`push.bat` is the engine under all of these (house guard, `.py`
change probe that tells you when a restart is actually needed) —
you rarely run it directly.

## Backups & provisioning

| Script | What it does |
|---|---|
| `pull-config.bat <house>` | Snapshot a named house's LIVE config into `houses/<house>/` — a backup and a record; nothing in the push path reads it |
| `pull-my-config.bat` | The same, for your default house (no argument) — sugar over the same idea, both earn their keep |
| `remotes/setup-remote.bat` | One-time Android prep for a fresh remote: locks display rotation to portrait. USB or wireless is chosen by the shared device picker (`remotes/lib/Resolve-AdbTarget.ps1`); `-Target <name\|ip\|serial>` to name one. |
| `remotes/pull-keymapper.bat` | Pull the newest KeyMapper backup into `remotes/<type>/keymapper/<keymap>/` (routed by the unit's serial → type/keymap in `units.json`); never overwrites (timestamps the old); offers to regenerate the map `.md`/`.xlsx`. |
| `remotes/push-keymapper.bat` | Provision a remote: push `remotes/<type>/keymapper/<keymap>/key_mapper.zip` (routed by the unit) and open KeyMapper for the two-tap Restore. `-Type`/`-Keymap`/`-Zip` override. |
| `remotes/pull-fully.bat` | Pull a Fully Kiosk settings export off a remote (after you tap Export in Fully, so `/sdcard/fully-settings.json` exists) into `remotes/fully/<type>-fully-settings-raw.json` (gitignored); offers to distill it into the device-neutral `remote-fully-settings.json` via `fully/distill-fully.py`. Routed by the unit. |
| `remotes/push-fully.bat` | Push a Fully Kiosk settings file (default the canonical `remotes/fully/remote-fully-settings.json`) to a remote's `/sdcard` root for Import in Fully. `-File` overrides. |
| `remotes/device-facts.bat` | Dump a remote's identity (incl. `ro.serialno` for `units.json`), display, webview, and app versions. |
| `remotes/scrcpy.bat` | Mirror and control a remote with scrcpy. USB or wireless is chosen by the same shared picker; `-Target <name\|ip\|serial>` skips the picker. |
| `remotes/battery-mon-start.bat` | Start a clean 24–48 hour battery-attribution window on a picked remote; refuses external power and records baseline battery, power, CPU, package/UID, and wake-lock data. |
| `remotes/battery-mon-report.bat` | Reconnect to that same remote and finish the run with batterystats, final diagnostics, a summary, and a Battery Historian-compatible bugreport under gitignored `remotes/battery-runs/`. |

## Build scripts (not batch)

| Script | What it does |
|---|---|
| `build-engine.mjs` | The ONLY engine build: concatenates `src/` into `dist/index.html`. Self-contained; the STYLES/SCRIPTS lists in it are the authority |
| `tests/run.sh` | Serve `dist/` and run the whole smoke battery |

None of the scripts are redundant: the two pull scripts differ by
explicit-house vs default-house, and the push family differs by what
gets built vs merely copied. The retired yaml-era `build.mjs` lives
at `archive/yaml/`.


## `harmonium.set_activity` — `start: true` (v0.85.7)

By default `set_activity` only changes which activity a room SHOWS
(the routing select) — it runs nothing. With `start: true` it also
runs the activity's Start action, exactly as a tap on the remote
would — the same sequence, the same runner:

    action: harmonium.set_activity
    data:
      activity: music
      start: true

Wire that to a wall switch or an HA automation and the button does
the whole job: receiver on, input set, volume set, player started —
whatever the activity's Start sequence says in Harmonium. One wiring,
every trigger. Ending works the same way:

    action: harmonium.set_activity
    data:
      activity: "off"
      start: true      # runs the ending activity's Stop action first

Presets that are sequences are already directly callable:
`harmonium.run` with `sequence: <id>`.
