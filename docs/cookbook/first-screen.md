# Your first screen

**Outcome:** a room page — activities up top, one-tap presets, live
device tiles — on every remote in the house.

<p align="center">
  <img src="../media/engine-porch.png" width="300"
    alt="A finished room hub: Activities, Presets, Devices" />
</p>

## 1. Add a page

In the Studio's left rail: **Pages → + Add page**. Give it a name
("Porch", "Living Room" — the page id follows the name as a slug and
becomes the key everything else references).

A page is one screen on the remote. The editor shows its sections in
render order; the preview on the right is already showing it live.

## 2. Give it sections

A room page reads best in the standard liturgy — **Hero → Activities
→ Presets → Devices** — and the Studio adds new sections into those
slots. Start with two:

- **Activities** — the "what you're doing" cards. Skip filling this
  for now; the [activities guide](activities.md) does it properly.
- **Devices** — live tiles for the room's hardware. **+ Add device**,
  pick an entity (lights, climate, covers, media players all render
  with the right controls). Every tile gets a ⚙ for per-tile options.

Each section has a **Section settings** dialog (label, columns,
enabled toggle — a switched-off section keeps its contents but stops
rendering and subscribing).

## 3. Watch the preview

Every edit re-renders the preview immediately — it is the real
engine, not a mock. The **Showing** strip above it jumps the preview
to any page; **Preview it** follows whatever you're editing. If
you've set up [a device photo](device-photo-skin.md), the preview
renders inside it with your physical buttons washed live.

## 4. Save & Deploy

**Save & Deploy** validates the config server-side, stores it, and
republishes to every remote. Deploys are atomic: remotes pick up the
new config on their next load (the ⋯ menu's *Save + Reload Astrion*
also remote-reloads a paired Fully Kiosk device).

If you make a mess: **Revert** reloads the last saved config, and any
*Remove* offers a 10-second Undo toast.

## 5. Make it home

*System → Workspaces* (or the page's settings) sets the home screen —
the page the remote boots into and returns to on **Home**. One page
per house is a fine start; the **overview** pattern (a hub page of
room navs, like the screenshot's `Home` page) scales it later.

## Next

- [Activities](activities.md) — the reason the top of the page exists
- [Presets](presets.md) — one-tap shortcuts under them
- [Theming](theming.md) — make it yours
