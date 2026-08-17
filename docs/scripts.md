# The repo-root scripts

*Purpose: what every `.bat` (and build script) at the repo root does,
who runs it, and when. Audience: developers and forkers wondering
which of the ten batch files they actually need.*

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
| `pull-keymapper.bat [ip]` | Pull the remote's KeyMapper backup zip into `remotes/keymapper/` over USB (or ADB-over-wifi) |
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
