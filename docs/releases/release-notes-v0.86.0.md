# Harmonium v0.86.0

**Coming from v0.85.7 — the last tagged release — this is a double jump:** v0.85.8 was never published to HACS, so everything from it arrives here too (its section is below). Export your current workspace(s) for safety. Update in HACS, restart Home Assistant — the migration runs once, automatically — then open the Studio and Save & Deploy.

## Breaking & behavior changes

- **One-time config migration (layered catalogs).** On the first restart, each workspace's catalogs are restructured (details in "The migration" below). It is automatic and backed up first — `config.<workspace>.prelayers.backup.json` lands beside your deployed config, kept indefinitely — but it is a real format change: after it, your config stores only your own apps/edits/removals.
- **A custom image on a TV app now fills the whole tile as a channel card** (from the unreleased 0.85.8). Concretely: if you had put your own artwork on, say, the Netflix app, it used to render as a small icon stamp — it now becomes the full logo card, matching the shipped logos. And nothing is hardcoded: adding art for an app we don't ship (Sky TV, say) is one file named after the app id, or one image path in the Studio (**Platforms → Master list → open the app → the Icon field** — a `/local/…` path there becomes the card; a plain icon name is the no-logo fallback) — the two-minute recipe is in [App logos](../cookbook/app-logos.md).
- **The Apps section of the Studio is now called "Platforms"** — same place in the left nav, better name for what it edits.
- **"Save + Reload Astrion" is now "Save + Reload Remote" — and it works for any remote.** First, what this even is: it's the item under the **⋯ menu at the Studio's top right** that saves your config and then makes your hardware remote clear its browser cache and reload, so your change appears on the remote immediately (it presses two buttons that HA's Fully Kiosk integration provides for your remote). Until now it was hardwired to a device named `astrion1` and **silently did nothing** for a remote named anything else. Now you can point it at *your* remote: in the Studio's **map** section, under **Startup & Home**, two new **Remote reload** pickers let you choose your Fully device's *Clear browser cache* and *Load Start URL* button entities. It reloads that **one** remote — with several remotes on a workspace, the others pick the change up on their next page load (or press their own Fully buttons in HA). If your device happens to be named `astrion1`, there's nothing to do — the old defaults still apply. Either way, a missing button now fails loudly, naming exactly what to wire, instead of pretending it worked.
- **Browsers now get a Home button on room pages.** The touch Home button used to hide on the boot view; it now walks parent → boot view → your overview page and hides only at the top. Hardware remotes are unchanged (clean bar).
- No engine/config schema changes beyond the above; the breaking hold-key changes some users asked about shipped back in v0.85.7.

## The spread model

Until now, the built-in app list and platform dialects were copied into your config at first install and never touched again — which meant new built-in apps never reached existing installs. From this release the built-in catalogs live underneath your config, and what you see is your list spread over ours: everything you added, edited, or removed is yours forever; everything you never touched now follows the shipped catalog. When a Harmonium update adds an app to a platform (with its launch command and its logo), it simply appears on your Apps page.

What this means in practice:

- **Built-in catalog updates reach every install.** The four Fire TV apps added in 0.85.8 (Hulu, Fubo TV, ESPN, BritBox) arrive on your Fire TV apps page with this update — nothing to do.
- **Your edits are permanent.** An entry you changed is yours: updates never touch it. The Studio's Apps editor now shows this per entry — a `stock` chip means the entry follows updates, `edited` means it's yours (with one-tap ↺ Reset to built-in if you want back on the update train).
- **Your deletions are permanent.** Remove a built-in app and it stays removed across updates. The Apps editor shows removed built-ins in a "Hidden built-ins" row, each one restorable with a tap.
- **Your config file shrinks.** It now stores only your own apps, edits, and removals — not a copy of everything we ship. Hand-editing JSON? You lose nothing: the Studio's **Code view** and the deployed `www/harmonium/config.json` both show the complete merged result, every built-in entry included — the shrinkage is in what's *stored*, not in what you see or edit. Change an entry in the Code view and it's yours; leave one identical to stock and it simply lifts back out on save.

## The migration

On the first restart after updating, each workspace's config is examined once. Every catalog entry that matches a shape Harmonium ever shipped is lifted out (the built-in layer supplies it from now on). Every entry you edited stays in your config as yours. A built-in entry missing from your config is treated as your deletion only if every version we ever shipped included it — an entry newer than your install simply starts appearing.

Before anything is touched, each workspace is backed up beside its deployed file as `config.<workspace>.prelayers.backup.json` in `www/harmonium/`. The migration log (Settings → System → Logs, filter "harmonium") lists exactly what was lifted, what stayed yours, and what was tombstoned.

## Derived classes — clone a platform, keep it updating

Any built-in platform now has **⑂ Derive a class**: it seeds a new class of your own from the built-in (say, `firetv_custom` → rename it FireTV-SE), and the built-in keeps flowing underneath — new stock apps still arrive in your derivative, your changes win forever, apps you remove stay removed. It is the spread model applied one level out: the config stores only your deltas plus a `derived_from` marker. The class card shows what it derives from, offers View parent / Reset to parent, and can adopt the parent's activities in one tap. One level deep — you derive from built-ins, not from derivatives.

## Fast d-pad is first-class

A dialect's D-pad command may now be a **full HA action** instead of a name — the fast-dpad path (`androidtv.adb_command` → `sendevent`, single-digit-ms presses; see `docs/design-fast-dpad.md`). The Studio's D-pad fields now render an action as a **⚡ chip with a JSON editor** (previously they showed `[object Object]` and a stray keystroke would destroy the action), and every string field has a ⚡ button that converts it to an action template. Combined with derived classes, the intended recipe is: derive your platform, ⚡ the arrow keys, adopt your activities.

## The Platforms editor

The Apps section is now **Platforms** — that's what it edits. Built-in platforms and yours are visually separated, and per-entry provenance (stock / edited chips, hidden built-ins, resets) now works on derived classes too, computed against the parent.

## The hardware remote story — reboot-proof keys, and the cord is cut

If you run an Astrion / HA100, the repo-side work in this release is as big as anything in the app:

- **New-firmware units are fixed.** On the newest Astrion firmware the well-known Expert-Mode Key Mapper setup **dies at every reboot** — its shell bridge cannot be recreated at boot, and volume/mute/back go dead until you plug USB back in. We root-caused it and rebuilt the whole button story on Key Mapper's **IME path**, which the system starts at boot like any keyboard. Keys survive reboot after reboot; the full investigation (and every dead end, so you don't have to walk them) is in `remotes/astrion/key-input-findings.md`. It's an hour of work...but worth it to me.
- **Wireless ADB lives on the Blue key.** If you update KeyMapper to the latest shipped [key_mapper.zip,](http://keymapper.zip) press Blue — wireless ADB turns on and the remote plays a confirmation chime; long-press Blue turns it off. Which means: do the setup once over USB, then **screw the back cover on and never open it again**. Push and pull key maps, manage every Fully setting, even mirror and control the remote from your PC with scrcpy — all over the air, with the remote sitting in its charging cradle.
- **A complete, field-tested setup guide** — [`remotes/astrion/README.md`](../../remotes/astrion/README.md) — takes a unit from out-of-box to sealed case: Fully + Key Mapper (IME path), KISS as the Home app (so the remote actually sleeps and charges instead of holding a wake lock), the four colour keys (Red = Harmonium, Green = launcher, Blue = wireless ADB, Yellow = recovery), the tuned Fully settings applied in **one import**, and the reboot test you run *before* sealing the case.
- **A fleet toolkit** under `remotes/`: pull/push scripts for Key Mapper and Fully configs that work over USB *or* wireless, route by each remote's serial number (`units.json` — your LAN details never enter a repo), never overwrite a backup, and regenerate the key-map documentation straight from the device's actual config.

This part is repo-side — clone the repo or grab the few files the guide names from GitHub; it's independent of the HACS update.

## Fixed — much of it straight off the beta thread's feedback list ([post #23](https://community.home-assistant.io/t/harmonium-a-fast-activity-based-universal-remote-platform-for-home-assistant-open-beta-via-hacs/1022037/23))

- **Multi-room navigation opens the right room's controller.** With two room pages sharing a controller (Deck and Porch both using the TV controller), tapping an activity on the second room could open the FIRST room's version — the deployed config never named each room's activity select, so the controller fell back to the global one. Every room page's minted select is now wired automatically at deploy (and served to the Studio preview the same way); nothing to configure, and the fix cannot regress into hand-wiring because the wiring is derived, never stored.
- **A browser now gets Home/Back navigation on room pages.** The touch Home button used to hide on the boot view (where it's needed most) because it checked the wrong "home": it now follows the same walk as the physical Home key — parent → boot view → your overview page — and hides only where the walk has nowhere to go. Back remains history-based, appearing once you've navigated.
- **The volume band's style can't get silently stuck.** The Controller tab's Volume style dropdown sets the activity default, but a per-row ⚙ style or member volume option overrides it — and used to do so invisibly, leaving the dropdown apparently dead. The overrides are now listed right beside the dropdown (`⚙ pinned: <member> = <style>`), each with a one-tap ↺ to clear it.
- **Save + Reload Remote (né "Save + Reload Astrion") works for any remote — and says so when it can't.** It was hardcoded to buttons named `astrion1_…` and failed silently on anything else. Wire your remote's Fully *Clear browser cache* and *Load Start URL* buttons in map → Startup & Home → Remote reload; if a wired (or default) button doesn't exist, the save still lands but the reload fails loudly, naming the missing entity.
- **"Clear to a fresh start" now keeps what its tooltip promised.** It resets the current workspace's draft to a blank starter (pages, activities, sequences — nothing is saved until you Save & Deploy) while KEEPING your remote profiles, key maps, theme, and devices; it used to wipe those too, and minted the wrong activity select on non-main workspaces.
- **The Advanced tab behaves like the checkbox it resembles.** Its square fills when active, and clicking it again returns to the first tab instead of stranding you.

## Also aboard: the unreleased v0.85.8

Everything from 0.85.8 ships in this update (full detail: [release-notes-v0.85.8.md](release-notes-v0.85.8.md)):

- **`harmonium.run_preset`** — fire any preset tile from an automation, script, or wall switch; starts its activity first if needed.
- **TV app logos** — a 21-service logo pack; app tiles become uniform channel-poster cards, your own art wins, per-file ownership across updates.
- **Four more stock Fire TV apps** (Hulu, Fubo TV, ESPN, BritBox) — and with this release's spread model they finally reach existing installs automatically.
- **Per-activity view tuning** (`views` map — restyle a built-in page per activity without forking it), a **scroll cue**, and **photo presets** (a preset tile with an `image` becomes a full-bleed photo card).
- **Fixes:** Now Playing artwork/progress follow the track; RS90 preview REW/FWD = prev/next; app names instead of package names; preview tooltips know the built-in transport keys.

## Also in this release

- **Disney+ joined the stock Fire TV catalog** (launch verified on hardware) — and thanks to the spread model, it simply appears on existing installs' Fire TV pages, including in derived classes that don't override it.
- Exported configs now record the catalog generation they were authored against.
- The Studio's Platforms editor gained per-entry provenance everywhere: stock / edited chips, per-entry reset, and restorable hidden built-ins for both launch entries and the master list.
- Exported configs now record the catalog generation they were authored against.
- The Studio's Apps editor gained per-entry provenance everywhere: stock / edited chips, per-entry reset, and restorable hidden built-ins for both launch entries and the master list.

If anything looks wrong after the migration, the pre-migration backup restores your exact old config: copy it over the deployed file and call `harmonium.reseed`, or ask on the forum — the backups are kept indefinitely.
