# Harmonium v0.85.4

This release is dominated by two things: a ground-up rework of **what
the physical buttons do**, and a long list of fixes and features driven
directly by the first beta reports. Thank you to both reporters — most
of this release exists because you wrote things down.

*(v0.85.4 replaces a short-lived v0.85.3 release, withdrawn the same
day: it could overwrite a user-made RS90 photo skin during migration,
and updated installs never received the RS90 remote profile. If you
installed 0.85.3, update normally. One check for RS90 owners who made
their own photo skin: if 0.85.3's restart replaced your photo with the
stock one, re-upload your photo — 0.85.4 will never touch it again.)*

## ⚠ Upgrading from v0.84.1 — three steps

1. **Restart Home Assistant** after the HACS update. The integration's
   Python changed this time.
2. **Make sure the remote actually got the new engine.** Fully Kiosk
   caches aggressively — if the remote looks unchanged, press **Clear
   browser cache** on the Fully device page in HA and reload. The ⓘ
   page now shows the engine version at the top; it should say
   **0.85.4**. If it doesn't, you're still on the old engine.
3. **Open the Studio and press Save & Deploy once.** Updates to the
   built-in pages (controllers, skins, the Apple TV support) are
   applied when *you* save — never behind your back. One save brings
   your config up to date.

## The buttons finally make sense

Until now, what a physical button did could depend on where you were in
ways that were hard to predict. There is now one written rule set
(`docs/HARMONIUM-INPUT-ROUTING.md`) and the remote follows it:

- **The arrows drive whatever you're looking at.** On a TV page (Fire
  TV, Apple TV — anything you operate by watching the television) the
  arrows and OK go to the television. On every other page they move
  around the remote's own screen.
- **On TV pages, short-press Back and Home go to the television too** —
  that's where you need them. The remote's own Back and Home move to a
  small pinned strip at the bottom of the screen, and **holding** the
  physical Back or Home always goes to Harmonium, from anywhere. Hold
  Power is All Off. Double-tap Home jumps to the remote's root.
- **Channel ± walks the remote's screen** — element to element, or
  section to section on longer pages. On a TV page, pressing Ch±
  *borrows* the arrows for the remote: a focus ring appears, and you
  can drive on-screen controls for as long as you keep pressing. Go
  quiet for five seconds and a small bar visibly drains on the focused
  tile, the ring disappears, and the arrows belong to the television
  again. No modes, no toggle to remember — if you can see a ring, the
  arrows work the screen; no ring, they work the TV.
- **Volume, mute and the transport keys never change meaning.** They
  always go to whatever plays the sound, on every page, no exceptions.
  On the one real exception — a page whose subject is a cable/satellite
  tuner — Ch± sends real channel up/down to the box.
- **Swiping is depth.** Swipe right from the left edge to go up a
  level; swipe left from the right edge to open the page's detail
  (Apps, Music Library) where one exists — it rubber-bands where one
  doesn't. Vertical swipes only ever scroll.
- **Press ⓘ on any page** to see exactly what every physical key does
  *on that page*. If the routing is ever surprising, the answer is one
  tap away.

Remotes with real transport keys (the Haptique RS90 and the Astrion v2)
no longer show the on-screen transport bar — you have the buttons.
Remotes with real Back/Home keys don't get on-screen ones either.

## Apple TV works now

If your buttons produced "command not recognized" on an Apple TV: the
remote was sending Fire TV's command names, and Home Assistant's Apple
TV integration only accepts its own — lowercase names, and its "back"
command is literally called `menu`. Both problems are fixed:

- Each **dialect** (the per-platform settings under Apps) can now say
  which command names its platform accepts, under **D-pad commands** —
  exactly where you'd look for it. Set it once per platform, and every
  device of that kind works.
- A ready-made **Apple TV** dialect ships with the right names filled
  in, plus sixteen launchable apps checked against a real Apple TV.
  Delete the ones you don't use — one tap each, and your edits are
  never overwritten by updates.
- If launching an app does nothing, the app's name in Harmonium must
  match your Apple TV's own list *exactly* (Developer Tools → States →
  your player → `source_list`). The names occasionally change with app
  rebrands — Warner's app is currently "HBO Max", not "Max".

## Now Playing, rebuilt

The Now Playing card comes in five looks, chosen per activity on the
Controller tab, and switching takes effect instantly: **Slim row**,
**Basic**, and three sizes of artwork card — **Art Hero Compact**,
**Art Hero**, and **Art Hero Large** (near full screen; a touch shorter
on TV pages, which have less to say). Along the way:

- Cards **hold their size**. Play, pause, idle, missing artwork — the
  card is the same height and the page below it never jumps.
- Pausing **dims the artwork instead of erasing it**.
- On a TV, the **app you're in ("YouTube TV") is the headline** — big,
  bright, directly under the state — and the Slim row reads
  "Playing • YouTube TV". A music player with an empty queue says
  "No items in the queue".
- Sources that publish a **solid black frame as "artwork"** get a clean
  placeholder panel instead.
- Separately, **any card on any page can now be given its own height**
  (the tile's Styling tab) — the page-wide size settings still cover
  everything you don't override.

## Device photo skins

- The **Astrion v2** and **Haptique RS90** get proper photo skins with
  a transparent screen cutout — the live remote shows through the
  device photo, with every physical key mapped.
- The **RS90 remote profile itself now reaches existing installs**.
  Until now a new built-in remote profile only reached fresh installs,
  so an updated system wouldn't even list the RS90 under Remotes &
  keymaps. After the update, one Save & Deploy in the Studio plants it
  — keymap, capabilities and skin — without touching any profile you
  already have.
- The Studio bug where **uploading a skin showed the wrong image** is
  fixed (it was a caching problem, not you).
- Skin storage is reorganised: the skins we ship live in their own
  `stock` folder and your uploaded photos in `user`. Updates can now
  refresh the shipped skins **without ever touching your photos** —
  even a photo named `rs90.png` is safe.
- If you made your **own RS90 photo skin** on v0.84.1 (a `rs90.png`
  dropped into the skins folder, per the cookbook): it is explicitly
  protected. No earlier release ever shipped a file by that name, so
  the updater refuses to claim yours — the photo, your key mapping
  and your screen cutout stay exactly as you made them. The new
  built-in RS90 skin is in the Studio whenever you want to switch.

## Your changes are yours — stock is locked

The built-in controllers, device pages and skins are now **read-only**
in the Studio. That isn't a restriction — it's a promise: updates keep
the built-ins current, and since you can't edit them in place, an
update can never silently wipe your work again. To customise one,
press **⧉ Duplicate to edit** (or upload your own photo, for a skin) —
the copy is yours forever and updates never touch it. Uploading over a
shipped skin is refused outright rather than offered an "overwrite
anyway", because the next update would just restore it.

This also fixes a bug a beta tester hit on day one: **fresh installs
were missing several bands on the stock Music controller** (speakers,
groups, presets, devices) until their first save. New installs now get
the complete library from first boot, and a test keeps the shipped
defaults honest.

## Smaller things

- **Battery on the ⓘ page** — level and charging state, read from the
  Fully Kiosk sensors. Set the two sensors per remote profile under
  System → Remotes & keymaps.
- The ⓘ page shows the **engine version** — the first thing to check
  when a remote seems stale.
- The **menu button opens the Apps/Library page** on both the TV and
  music controllers, and the **source button opens the source list**.
- **KeyMapper's Expert Mode is now documented** (hardware-keys guide):
  buttons that control the launcher but never reach Harmonium need it,
  it requires a one-line ADB grant — and a KeyMapper backup does *not*
  carry the setting, so it must be enabled on each device.
- The engine still runs on the stock Astrion's 2017-era browser; that
  compatibility promise is now machine-checked for stylesheets as well
  as code (one styling bug had slipped through exactly that gap).

## Known, and next

- `harmonium.set_activity` changes which activity a room *shows*; it
  does not run the activity's Start sequence. For a full start from an
  automation, use `harmonium.run` with the activity's Start sequence.
  A proper `start:` option is planned.
- The Apple TV button names were taken from Home Assistant's
  documentation and a real device's app list — if you have an Apple TV,
  confirmation (or corrections) in the release thread would be very
  welcome.
