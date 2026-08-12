# Houses

One repo, one codebase, **n houses**.

    CODE    engine (src/ → dist/index.html), the integration, the Studio
            — identical everywhere, lives in the repo, pushed to houses

    CONFIG  rooms, activities, presets, devices, theme
            — different in every house, lives in that house's Home
              Assistant, authored in the Studio, NEVER pushed from the repo

Everything here exists to keep that line from being crossed by accident.

## Your first house (fork setup — two small files)

1. Copy the template and fill in four values:

       copy houses\example.cmd houses\myhouse.cmd

2. Name it as the default the convenience scripts use:

       echo myhouse> houses\default.txt

Then, once, with the drive actually mapped to that HA's config share:

       push myhouse init

which writes the `.house` marker the push scripts check — so a stale
drive mapping can never push code to the wrong house.

## What stays private

`houses/*.cmd` (your IPs and share letters), `houses/default.txt`, and
`houses/<house>/config.json` snapshots are **gitignored** — they never
leave your machine. `example.cmd` is the only tracked profile.

## The scripts

| script | what | HA restart? |
| --- | --- | --- |
| `build-push.bat` | build Studio + engine, push both — THE routine deploy | no |
| `push-engine.bat` | engine only | no |
| `push-studio.bat` | Studio only (build it first) | no |
| `push-all.bat` | engine + Studio + integration `.py` | **yes** |
| `pull-my-config.bat` | snapshot the house's live config into `houses/<house>/` | no |
| `push.bat <house> <mode>` | the generic core the wrappers call | per mode |
| `make-release.bat` | cut `release/harmonium.zip` for a GitHub release (HACS) | n/a |

All the wrappers act on the default house; `push.bat` takes any house
explicitly when you have more than one.
