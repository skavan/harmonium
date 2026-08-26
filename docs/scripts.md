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
| `setup-remote.bat [ip]` | One-time Android prep for a fresh remote: locks display rotation to portrait (the Astrion's accelerometer otherwise flips the kiosk when the remote is handled) |
| `pull-keymapper.bat [ip]` | Pull the NEWEST KeyMapper backup zip into `remotes/keymapper/` over USB (or ADB-over-wifi); one-time device setup = KeyMapper Settings → automatic backup location → Download |
| `push-keymapper.bat [ip] [zip]` | Provision a NEW remote: push the newest backed-up zip and open KeyMapper for the two-tap Restore |

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
