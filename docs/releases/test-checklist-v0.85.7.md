# v0.85.7 test checklist — everything since v0.85.6

Work top to bottom. Each line says where to test and what you should see. Items marked ⚠ are the ones most likely to bite.

## 1. Versions and addresses (do this first — everything else lies if
the engine is stale)

- [ ] ⚠ Every remote's ⓘ page says **Engine v0.85.7**. If not: Fully device page in HA → Clear browser cache → reload. (Closing Fully or rebooting does NOT clear it.)
- [ ] Studio title bar says **s0.85.7 b54**.
- [ ] ⚠ Studio preview shows the SAME engine version as ⓘ on a real remote (open Showing → diag:). This was broken — the preview could run a stale cached engine.
- [ ] ⓘ shows a "This page ·" row near the top with the full boot URL including `#device=<profile>`.
- [ ] Set one remote's Fully Start URL to that address. Reboot the device. Still 0.85.7, correct profile (skin/keys right).
- [ ] ⚠ **Engine self-update**: with the remote running and on the stub address, deploy a rebuilt engine (any byte change) — within a screen-wake or reconnect the remote reloads itself and ⓘ shows the new build, no Fully buttons touched. Failsafe check: *Clear browser cache* + *Load Start URL* from HA also lands the new build.
- [ ] ⓘ shows "This remote · <ip>" with the Fully `:2323` hint.
- [ ] ⓘ layout: IP and URL near the top, key map card at the bottom, ⓘ itself easy to hit.
- [ ] Studio title-bar address chip reads `/local/harmonium/main/index.html`.

## 2. Upgrade safety (Studio, once)

- [ ] Export the config BEFORE Save & Deploy. Keep the file.
- [ ] Open the Studio, press **Save & Deploy** once. No errors.
- [ ] Your pages, activities, photos, names all intact afterward.
- [ ] ⚠ Your RS90 skin photo untouched (and re-pick the built-in RS90 skin once on the main box — its config still points at the old flat path).

## 3. Ownership (Studio)

- [ ] Untouched built-ins (music, tv, apps, library, dialects) show NO banners and are current — no "stranded on old" look.
- [ ] If you ever edited a built-in in place: it shows **"Your edited copy, preserved."**, is editable, and **↺ Reset to built-in** returns current stock and re-locks.
- [ ] Apps editor: stock dialects show ● Stock; edit one → ✎ Yours appears with **View stock** and **↺ Reset to stock**.
- [ ] After Save & Deploy, ⓘ's key map card shows the NEW hold keys (see §4) — proof the keymap heal landed.

## 4. Physical keys — run on Astrion, astrion2, AND RS90

On a normal page (Porch):

- [ ] Tap Back = back one page. Tap Home = up one level.
- [ ] ⚠ **Hold Home** (`=`) = walks toward home. It must NOT toggle the TV / end the activity (that was the bug).
- [ ] **Hold Back** (`]`) = back. It must NOT reload the page (Astrion had this).
- [ ] ⚠ **Hold Power** still ends the activity / All Off. If it does nothing now: the profiles moved hold-Power to **F12** (KEYCODE_F12, 142) — add that rule in KeyMapper / Expert Mode (hardware-keys §0b).
- [ ] Ch▲/Ch▼ jump between sections (Activities → Presets → Devices), with a little air above each section — not pressed against the hero. On a page with no sections they walk tile-by-tile.
- [ ] Menu with a nav or device tile focused = opens that tile's page. Nothing focused = nothing happens.
- [ ] Focused volume tile: ◀▶ change volume. Mute works.

On the Watch Fire TV page:

- [ ] Arrows drive the Fire TV. Tap Back / tap Home go to the Fire TV.
- [ ] ⚠ Hold Back and hold Home come back to Harmonium — always.
- [ ] Ch▲/Ch▼ borrow the arrows for the panel: ring appears, walks the cards, hands back after ~8 idle seconds.
- [ ] During the borrow: the back/menu/home button strip is usable — ◀▶ move the highlight inside it, OK presses, ▲▼ move on to the next card. (Was touch-only.)
- [ ] Transport row: ◀▶ move between ⏮ ⏯ ⏭, OK presses.

In a desktop browser (no physical keys):

- [ ] Browser back button acts as Harmonium back — never leaves or reloads the page.
- [ ] Start an activity, close the tab, reopen: the End button in the header is there (the vanishing power button fix).

## 5. Services (Developer Tools → Actions)

- [ ] `harmonium.set_activity` with `activity: porch_listen_to_music` and `start: true` → the select flips AND the Start sequence runs (music actually starts). This is the wall-switch wiring.
- [ ] Same with `activity: "off"` and `start: true` → the running activity's Stop sequence runs, then off.
- [ ] Without `start:` both are routing-only (old behavior kept).

## 6. Deep links

- [ ] `…/main/index.html#page=porch` in a browser lands on Porch.
- [ ] Unknown page id → brief notice, lands on home, no crash.
- [ ] Page settings (Studio): two link lines under Page ID — `browser:` and, when Preview-as is set to a remote, a second line with `&device=<profile>`. Click copies.
- [ ] The `&device=` link opens the page AND pins the profile.

## 7. Music Library (browser AND RS90)

- [ ] Grid view: artwork fills the tiles, name under it (up to two lines), service dot (Spotify green / Deezer purple).
- [ ] ⚠ While art is still loading (fresh boot, slow network) tiles hold their square size — no collapsed/squished tiles.
- [ ] List view: compact rows (~7 on the RS90 screen), square 48px art, "Spotify · Playlist" line, colored left bar, › on rows that drill.
- [ ] Queue: same compact rows, square art (was round).
- [ ] Grid labels readable in 2-wide and 3-wide.
- [ ] D-pad: ▲ from the first item → category chips → ▲ again → Favorites / Music Library / Search row. ◀▶ walk it, OK presses, ▼ back down to the first item. The highlight ring is not clipped at the row edges.
- [ ] ⚠ Cold boot straight onto the library: it loads — no "Loading library…" stuck until refresh.
- [ ] Ch▲/Ch▼ still step the category chips.

## 8. Studio odds and ends

- [ ] Sidebar: pages are a tree, children indented; no "hub" wording anywhere.
- [ ] Startup & Home (boot view, Home final stop, paging order) sits at the top of the Workspace view.
- [ ] ⚠ Duplicate a nav card, type a new Display Name: the TARGET page keeps its name and OPENS doesn't chase your typing.
- [ ] Duplicate the same card twice: two different ids, no "duplicate tile ids" error on save.
- [ ] Nav card Styling: Label position defaults to **inherit**; nine positions work on a photo card.
- [ ] Image opacity on a photo card, and once on a whole section (Section settings) — card's own value wins.
- [ ] Section settings: card height / label position / CSS variables apply to every card in the section unless a card overrides.
- [ ] Advanced JSON `css_vars` on one tile: `--fs-1`, `--fw-1`, `--tile-shadow`, `--lbl-shadow` all take.
- [ ] A nav card with no image set, pointing at a page with a banner photo, shows that photo (auto style — this had silently broken for Studio-authored cards).
- [ ] Key debug switch on a page: preview shows the key card when on, hides when off — and a leftover `#debug=1` in your browser does NOT force it on in the preview.

## 9. Second box (the .88 install)

- [ ] Update it, Save & Deploy once: RS90 profile present, TV controller current, no transport/back-home rows on remotes that have the physical keys.
