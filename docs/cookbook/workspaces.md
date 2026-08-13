# Workspaces

**Outcome:** a second remote with a different world — the bedroom
tablet gets bedroom pages, the porch remote gets the porch — deployed
side by side from one Studio.

## What a workspace is

A workspace is a remote's **whole world**: its own pages, activities,
theme, everything. Each deploys to its own address —

    /local/harmonium/index.html            ← main
    /local/harmonium/<workspace>/index.html

— so pointing a device at a workspace is just pointing it at that
URL. The workspace pills in the Studio header switch which world
you're editing; everything below the header — editor and preview —
is that workspace.

Workspaces are also the sandbox story: duplicate your main world,
experiment freely, and nothing touches the remotes booted from main.

## 1. Make one

*System → Workspaces* → add (duplicate main, or start clean). It
appears as a header pill and gets its own address immediately on the
next Save & Deploy.

## 2. Point a device at it

Set the device's URL to `/local/harmonium/<workspace>/index.html`
and pair as usual ([GETTING-STARTED §4](../GETTING-STARTED.md)). The
mono chip in the Studio header is the current workspace's address —
click it to open the running app.

## 3. What's shared, what isn't

Per-workspace: pages, activities, presets, controllers, theme.
Minted activity selects are prefixed per workspace
(`select.harmonium_<ws>_<room>_activity`) — main stays unprefixed so
existing automations never break. The engine build, the integration,
and pairing are house-wide.

Move things between workspaces with **snippets** (⤴ export on the
piece, ⤵ import in the other workspace — see
[presets](presets.md#2-reuse-them-snippets)).

## Notes

- Deleting a workspace retires its deployed files and address.
- `harmonium.run` / `set_activity` calls from a remote carry its
  workspace automatically — two workspaces' "Watch TV" don't
  collide.
