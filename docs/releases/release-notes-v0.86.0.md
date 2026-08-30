# Harmonium v0.86.0 — DRAFT (not tagged)

One structural release: the app and platform catalogs are now layered. Update in HACS, restart Home Assistant — the migration below runs once, automatically — then open the Studio and Save & Deploy.

## The spread model

Until now, the built-in app list and platform dialects were copied into your config at first install and never touched again — which meant new built-in apps never reached existing installs. From this release the built-in catalogs live underneath your config, and what you see is your list spread over ours: everything you added, edited, or removed is yours forever; everything you never touched now follows the shipped catalog. When a Harmonium update adds an app to a platform (with its launch command and its logo), it simply appears on your Apps page.

What this means in practice:

- **Built-in catalog updates reach every install.** The four Fire TV apps added in 0.85.8 (Hulu, Fubo TV, ESPN, BritBox) arrive on your Fire TV apps page with this update — nothing to do.
- **Your edits are permanent.** An entry you changed is yours: updates never touch it. The Studio's Apps editor now shows this per entry — a `stock` chip means the entry follows updates, `edited` means it's yours (with one-tap ↺ Reset to built-in if you want back on the update train).
- **Your deletions are permanent.** Remove a built-in app and it stays removed across updates. The Apps editor shows removed built-ins in a "Hidden built-ins" row, each one restorable with a tap.
- **Your config file shrinks.** It now stores only your own apps, edits, and removals — not a copy of everything we ship.

## The migration

On the first restart after updating, each workspace's config is examined once. Every catalog entry that matches a shape Harmonium ever shipped is lifted out (the built-in layer supplies it from now on). Every entry you edited stays in your config as yours. A built-in entry missing from your config is treated as your deletion only if every version we ever shipped included it — an entry newer than your install simply starts appearing.

Before anything is touched, each workspace is backed up beside its deployed file as `config.<workspace>.prelayers.backup.json` in `www/harmonium/`. The migration log (Settings → System → Logs, filter "harmonium") lists exactly what was lifted, what stayed yours, and what was tombstoned.

## Also in this release

- Exported configs now record the catalog generation they were authored against.
- The Studio's Apps editor gained per-entry provenance everywhere: stock / edited chips, per-entry reset, and restorable hidden built-ins for both launch entries and the master list.

If anything looks wrong after the migration, the pre-migration backup restores your exact old config: copy it over the deployed file and call `harmonium.reseed`, or ask on the forum — the backups are kept indefinitely.
