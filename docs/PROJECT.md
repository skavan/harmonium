# Harmonium — HA Lightweight Remote Framework

*Purpose: The living document: intent, core thesis, decisions log, and the current-era changelog (newest first). Audience: maintainers; the deep history is in archive/docs/project-history.md.*

Name: **Harmonium** (successor to harmonia/hastrion; prototype
developed as `remote-proto/`).
Repo home: `G:\Documents\Code 2025\repos\HA-2026\harmonium` (organized
by concern: src/core, src/widgets one-file-per-widget, src/ui,
src/styles; zero-dep `build.mjs` → single-file `dist/index.html`).
Working docs: `S:\Documents\HA26` · Session partner: Claude (Cowork).

## Intent

Build a lightweight, fast-loading control frontend for Home Assistant aimed
at low-power Android hardware remotes (Sanytron Astrion, Haptique RS90 and
similar), while running equally well in any browser, on tablets, and on
embedded Linux (WPE WebKit/Cog). Long-term: a product other HA users can
adopt — not just a personal fix.

## Core thesis

The bottleneck on weak remote hardware is NOT the browser/webview — it is
the stock HA frontend: a multi-MB Lit/Polymer bundle plus a websocket
firehose of every entity in the instance. So:

1. **Entity-scoped data contract.** Subscribe only to what's on screen via
   `subscribe_entities` + `entity_ids` (compact diffs). Verified: even
   ha-fusion still uses the full-state firehose; we don't.
2. **Tiny renderer.** v0 is one dependency-free HTML file (~35KB). v1
   graduates to Svelte, forking ha-fusion's MIT widget layer, rebound to
   our filtered store.
3. **Buttons are first-class.** Full D-pad/spatial-focus operation;
   touch is also supported but never required.
4. **HA is the brain.** Activities are HA scripts; activity state is an
   `input_select` HA owns; anything smart is a template sensor/automation
   HA-side. The remote is a dumb, fast renderer.

## Architecture

- **Engine** (`remote-proto/index.html`): websocket client (auth →
  filtered subscribe → diff merge), widget catalog, spatial focus +
  capture mode, activity lifecycle, theming. Contains ZERO
  house-specific data.
- **Config** (`remote-proto/config.json`): screens, sections, tiles,
  activities, context bindings, keymap, theme tokens. Pure data. In v1
  this JSON is stored/delivered by a custom HA integration over the same
  websocket (live push, HA backups, multi-remote sync).
- **Schema** (`screen-schema.md`): the evolving contract, incl. the v0.3
  addendum (lifecycle, sections, context, styling doctrine).
- **Shells** (future): minimal Android APK with native key handling and
  frontend shipped in assets (instant boot); WPE/Cog for embedded Linux;
  plain browser/Fully Kiosk today.

## Key decisions log

| Decision | Choice | Why |
|---|---|---|
| Transport | HA websocket, filtered `subscribe_entities`; thin state-bus seam so MQTT could be added later | Native contract, no broker dependency; retained-message instant-on deferred until proven necessary |
| Widget model | One tile **chassis** (slots + focus/capture plumbing) + per-domain **adapters**; rare bespoke "panel widgets" (dpad) | HA's own card evolution validates it; adapters are the extensibility surface |
| Extensibility tiers | 1st-party compiled widgets → community **declarative** widgets (JSON over trusted primitives + curated utility-class whitelist) → arbitrary-JS "on your own" tier | Opens the layer Unfolded Circle keeps closed (their Qt/QML firmware UI is why their widget backlog exists) without losing the perf guarantee |
| Styling | Design tokens via CSS custom properties (config `theme` map); later align token names with HA theme variables for free theme compatibility; no CSS framework, no runtime Tailwind | Tokens are themable data; HA themes are literally CSS variable maps |
| Activities | select = start (off) / open (running); hold or power key = end; optional inline two-press confirm (red tile, 5s), never modals | Harmony's lesson: accidental toggle-off is the cardinal sin |
| Activity state | `input_select.porch_activity`, set FIRST by each activity script; sync automation covers device-initiated starts | Solves shared-hardware ambiguity (two TV activities, one TV); exclusivity for free |
| Context | Screen `context` overlaid by active activity's context; `$context.slot` is the ONLY substitution (no templating client-side) | One TV screen serves Fire TV & Smart TV with different dpad targets, command maps, volume paths |
| Volume (ARC) | Split `entity` (commands → Samsung TV, relays via ARC) from `level_entity` (truth → soundbar) | Command path ≠ state path in ARC/CEC chains; mirrors the proven URC-card setup |
| Devices access | Scroll-down "Devices" sections on activity screens; long-press rejected (spent on capture/end; undiscoverable) | Matches the user's own harmonia design |
| Keymap | Logical buttons in engine; physical-key quirk table in config (`keymap`), matching Astrion KeyMapper conventions (Tab=down, +/-=vol, [=back, ]/;=home, F2/p=power) | One config portable across devices |
| Apps access | Chassis-level `trailing` slot (icon + action on a tile's right edge, own focus stop); Now Playing trails into the Apps screen; no inline Apps grid on activity screens | Apps are a picker, not a dashboard — occasional-use content shouldn't spend permanent vertical space; slot is generic (any tile can trail into a detail screen) |
| D-pad passthrough | `dpad_passthrough` screen key: PHYSICAL D-pad drives the device during an activity (command-map aware); touch is NEVER intercepted — taps always drive the UI; home/power stay system keys | Harmony's defining behavior; the touch rule was a real bug caught on-device (Home tile sent ENTER to the Fire TV) |
| Two homes | Device home = touch affordance (ring corner in browser, `buttons` bar on remotes); system home = physical key + nav tiles, laddering screen → room → main_home | Same word, two meanings — separate surfaces so neither steals the other |
| Button bar | `buttons` panel widget: 2-4 configurable logical-key slots through the shared command map; shown `only: physical_dpad` where the on-screen ring is hidden | Hardware remotes still need touch access to info/menu/back/home; config picks the slots |
| Device details | GENERATED virtual screens (`detail:<entity>`) from per-domain compositions of power/stepper/chips primitives; chip options read from entity attributes (hvac_modes, source_list…); device tiles auto-grow a `tune` trailing zone; `detail:`/`trailing:` config overrides | Scales to every device with zero config; options always match the hardware; tap stays zone-deterministic (body=act, trail=deeper) |
| VOL exception | On a device's detail screen ONLY, VOL nudges that device's primary range (brightness/setpoint/volume/position); everywhere else VOL = room/activity audio | User call: "do what I mean" scoped narrowly enough to keep the volume promise intact elsewhere |
| Back placement | Global chevron in the status bar (shown iff history); per-screen Back tiles retired; Home = destination (ladder + nav tiles) and resets history | One place for Back on every screen incl. virtual ones; Back unwinds, Home jumps — different jobs, different affordances |
| Music presets | HA-published favorites: trigger template sensor calls `music_assistant.get_library` (favorites) → list attribute; remote renders it via `presets_from`; `music_assistant.play_media` takes readable names/uris | Solves addressing (no opaque content ids in config) AND liveness (heart in MA → tile appears); remote stays dumb, rides the existing subscription; rejected client-side browse_media (media-browser scope creep, per-integration trees) |
| Generated tiles | `presets_from` tile type + `$item.<field>` substitution (per-row sibling of `$context`): expands an entity's list attribute into real preset tiles; structural signature triggers grid re-render on change | Chips pattern at tile scale; generic day one (any HA-published list becomes tiles) — the shape of the declarative community-widget tier |
| Music screen | No passthrough (tiles must stay reachable); transport adopts coverbtns ◀▶ roving; Now Playing = art hero (`art: true`: entity_picture + title/artist/album + interpolated progress, 1s ticker touches only visible heroes); drawer holds favorites + `transfer_queue` "Pull Music Here" | TV's center of gravity is the D-pad (foreign UI); music's is content + transport — different screen, same chassis |
| Storage tiers (2026-07-20) | Source of truth is HA-side, today as helpers/template sensors, ABSORBED by the v1 custom integration (config + favorites + activity state in one place); browser storage rejected as truth (per-device divergence, cache-clear loss, invisible to HA) but reserved as instant-on cache. Favorites sensor is ONE per house (library-wide; room-ness comes from `$context.media_player`) — the `porch_` prefix is a misnomer | User pushback on helper sprawl ("what if I have 10 rooms?") — per-room cost is only the activity select+scripts (Harmony had the same shape); helper dislike = strongest argument to pull the integration forward after schema freeze |
| Media browsing scope | Favorites-only, flat. No ALBUMS/ARTISTS/TRACKS/PLAYLISTS browse tier on the remote (that's a media browser — the stock app's job, done worse on a D-pad). If ever wanted it's config-shaped: per-type get_library calls in the sensor + per-type `presets_from` sections | Remote = recall, phone = discovery |
| Key policy (v0.11) | Physical keys scoped by SCREEN CLASS (room/group/detail/activity; `class` + `parent` config keys): tap-Back/Home = UI (unwind / ladder via parent), HOLD = device back/home through the command map; Power's blast radius follows class (room=All Off, group=page devices, detail=device toggle immediate, activity=end) with confirm only for multi-device scopes; VOL follows the focused device's primary range with a MEDIA CARVE-OUT (media focus keeps the $context.volume ARC path); passthrough claims arrows+select only, cued by a 2px accent rule + gamepad glyph | Field pain: "hitting the wrong buttons all the time" — keys get policies per page class, not one behavior; user picked tap=UI / hold=device over both pure options |
| Gestures = shell (v0.11.1-2) | Taps fire on KEYDOWN; press-type disambiguation (short/long/double) is KeyMapper's job, emitting DISTINCT keycodes per gesture — zero timers in the webview (exception: select hold-capture, Enter delivers true key pairs). Confirmed Astrion matrix: Back `[`/`]`, Home `F1`/`;`, Power `F2`/`=` (hold = All Off w/ confirm), Menu `#`/`@` (hold → Apps drawer via `buttons` navigate binding), Mute `` ` ``, CH PageUp/PageDown. `buttons` bindings accept {navigate} and no-op on unresolved context targets. Key-event debug card (`global.debug` / `#debug=1`) for field diagnosis | KeyMapper-injected keys don't deliver reliable keyup/hold timing — keyup-gated taps and engine hold timers died on-device; the old hastrion dashboard-hotkeys card was the authoritative raw-emission map. Doubles taxed every single press, so avoided on nav keys. Same contract the native APK shell will honor |
| Drawer pop + switch confirm (v0.12) | Drawer screens (`drawer: true` — Apps, Music Library) pop back after a preset fires (label flashed in the bar; target resolved eagerly for the deferred ensure-activity path). `confirm_switch` (global true, per-activity override) asks "Press again to switch to X" before starting an activity while another runs; same-activity open never asks. Per-activity `stop` used in anger: music ends via `script.activity_music_stop` (state + media_stop on the Sonos, nothing else) | Field report: "physical buttons don't work on App page" was really "make me not need them" — a drawer is pick-one-and-leave. And "I don't always want one activity to turn off the others" → confirm as a setting; "some activities' off is merely STOP" → per-activity stop scripts |

## Engine self-update — the honest "never again" (2026-08-26, night)

Suresh: "Are you sure about your never reload again? I find I have
to clear cache and reload from fully in HA, to get it to stick."
He was right to push. The versioned stub fixes every pass through
the Start URL — but nothing made a RUNNING webview take that pass,
and Fully's plain Reload reloads the CURRENT page: after the
canonical-address rewrite that is the stub path, so reload SHOULD
re-resolve… but his lived experience says the belt needs braces.
Built (his "Both"): engineUpdateCheck() in boot.js — on every
auth_ok and on wake-from-hidden (socket.js hooks), fetch
/api/harmonium/engine_version (?t= + no-store, the stub's own
endpoint) and location.reload() through the stub when the deployed
hash ≠ BOOT_V (the ?v= this load booted with). Guards: not in
PREVIEW; only with a BOOT_V (bare boots have nothing to compare);
one attempt per target hash via sessionStorage (a racing deploy
can't loop the page); 60s throttle. TRAP averted in review: every
stub boot carries pin=0, so WS_PEEK is truthy on every kiosk —
gating on it would have disabled the feature everywhere.
probe-engine-selfupdate.mjs pins five fences (one reload on
mismatch, guard holds, match/bare/preview never reload); boot-path
probes green. Docs: step 4 in notes + GitHub body now says the
engine maintains itself, with the FAILSAFE his way ("Clear browser
cache", then "Load Start URL" — his HA screenshot saved as
docs/images/fully-ha-buttons.png, linked not embedded); checklist
gains the self-update test.

## Page links round 5: full width, no hint (2026-08-26, evening)

Three from his screenshot of the live Studio: (1) the copy-link
lines moved OUT of the Name field's half-column into a col-span-2
row under Name/Page-id — a kiosk URL now sits on one full-width
line instead of wrapping at half-panel; (2) the Page-id hint
("the page's key — the minted select…") removed at his call;
(3) the release-notes screenshot regenerated — the harness serves
from localhost:8482, so the two link spans are display-relabelled
to 192.168.1.87:8123 before the shot (the doc image must look
like a real install, not the test rig). Svelte note: {@const}
can't sit in a plain div — the full-width block wraps in {#if scr}
to keep it legal. smoke-studio + dup-rename green.

## Release-notes rework with his edits (2026-08-26, evening)

Working from HIS edited copy (pulled from his machine — it was
based on a pre-17:30 version, so the NP-styles gallery bullet was
re-added). His three issues: (1) KeyMapper instructions unclear —
now a trigger/output TABLE (Astrion vs RS90 mirrored triggers, both
KEYCODE names + numbers; his draft had `]` as LEFT_BRACKET — it's
RIGHT_BRACKET 72, corrected), the restore-from-backup path spelled
out (adb push or download → Key Mapper ⋮ → Restore), and a
check-your-work step (Key debug card should print ] = F12).
(2) Non-breaking items pruned from Breaking changes: Menu and CH
moved out (they live in the keys section), healed-appearance folded
into the ownership section — Breaking is now exactly three: keys
(action required), tap/hold flip, transport row removal.
(3) set_activity was buried in the keys list — now its own section
"Start activities from outside Harmonium" with the YAML
(activity/start/room per the actual SERVICE_SET_ACTIVITY_SCHEMA).
His step-4 concern ("copying the URL from ⓘ perpetuates a wrong
address") fixed: the Start URL now comes FROM THE STUDIO's page
links, with a new screenshot (docs/images/studio-page-links.png);
ⓘ is demoted to the verify step. Tone sweep per his "jargon and
cutesy talk": ghosts/haunts/referee/muscle-memory phrasing
plainened; his own retitles kept. GitHub body synced to all of it.

## The screenshot collage — ACTUALLY solved + queue context (2026-08-26)

His queue pair (capture = top-of-list no ring, live = scrolled with
ring, "jumps 3 times") finally reproduced after wiring a stubbed MA
queue into the harness — then a per-frame trace caught it: `.tile`
carries `transition: … transform .06s` (the press dip), so the
scroll-compensation translate ANIMATED toward -scrollTop while
html-to-image's clone walk read each tile's computed transform
MID-FLIGHT — early-cloned tiles nearly unshifted, later ones
fuller: the collage. The visible "jumps" were the slide down and
back. It ever worked only because the old code's slow font fetch
let the transition settle first — hence machine-dependence. Fix:
snapPreview injects `*{transition:none!important;
animation:none!important}` into the preview for the snap (removed
after the restores, so un-shift is instant too — the live preview
no longer visibly moves at all). Also reordered: every await (font
embedding) runs BEFORE the DOM surgery; toCanvas starts on the
next line. And his UX ask: the queue now opens with the playing
row as the THIRD visible row ("two before and like 4 after") — new
gridScrollTo mode "context" + `focus_context: true` on the queue
screen (any screen can opt in). Verified end-to-end in the
harness: capture pixel-matches the live scrolled view, ring
included; 5 engine probes + smoke-studio green. Lesson: when a
capture-the-DOM bug is machine-dependent, look for TIME — a
transition, a fetch, a debounce — not for the machine.

## The "[object Event]" autopsy — SOLVED (2026-08-26, follow-up)

His annotated pair (live view vs saved file, "jumps 3 times")
cracked it. html-to-image's resourceToDataURL catch stores
`options.imagePlaceholder || ''` in a MODULE-LEVEL cache — so
without a placeholder, CORS-walled artwork (Spotify/Deezer covers)
becomes `<img src="">` in the clone, which resolves to the PAGE
URL inside the assembled SVG and fails the whole SVG image load:
createImage rejects with the raw error Event. The cached ''
poisoned my earlier retry too (why retry+placeholder still failed
— cache hit returns before the placeholder applies), and the
two-pass attempt was the extra reflow "jumps". Fix: the
transparent-pixel imagePlaceholder rides on the FIRST toCanvas
pass — unfetchable art becomes one clear pixel, the SVG stays
loadable, one pass, one repaint; the skipFonts retry stays as the
backstop for font-flavored failures. Reproduced in the harness by
route.abort()ing an artwork host: fails exactly his way before the
fix, saves a scroll-correct capture after. smoke-studio green.

## NP style gallery, strip clipping, screenshot forensics (2026-08-26)

Three from testing. (1) "Point out the great selection of default
styles with examples (a linked .md)" — NEW
docs/cookbook/now-playing-styles.md: all five NP styles (Basic /
Slim row / Art Hero Compact·regular·Large) shot at real remote
size with a synthetic cover (tests/shoot-np-styles.mjs regenerates
docs/images/np-styles/*.png; Material Symbols came from the npm
`material-symbols` package since fonts.googleapis is blocked in
the sandbox — the css2 stub must include BOTH the @font-face AND
the .material-symbols-outlined class block, or icons render as
ligature text). Doc also answers "where did the transport bar go"
(physical_transport remotes drop it); linked from release notes,
GitHub body, GETTING-STARTED §5. (2) "A selected tile that sits
underneath that strip gets clipped" — gridScrollTo measured
gr.bottom, but #tvstrip/#padstrip are fixed OVER the grid: new
gridVisBottom() subtracts whichever strip is showing, AND the grid
padding only ever budgeted for ONE strip — padStrip() now toggles
#app.padstrip-on; tvstrip+padstrip stacked = 92px padding so the
last tile can scroll clear. probe-tvstrip-clip.mjs walks ▼ to the
bottom asserting every focused tile clears the topmost strip
(caught the padding gap the first fix missed). (3) "screenshot
failed: [object Event]" — html-to-image rejects with a RAW EVENT
when its assembled SVG image fails; can't reproduce here (his live
config + real skin + scrolled capture all pass in the harness, and
the scrolled PNG is pixel-correct), so snapPreview now (a) retries
once with skipFonts + a transparent imagePlaceholder — the two
external-resource failure classes — reporting "saved — some
fonts/artwork couldn't be captured", (b) names the failing
resource URL instead of [object Event], (c) errors plainly on a
0×0 canvas. His next failure will diagnose itself.

## Breaking-changes section + the unwrapping (2026-08-26)

Suresh: "The changes we made to the remotes are BREAKING CHANGES
right? We need to guide users what to do." Right — the hold-key
re-vocabulary (`]`/`=`/`F12`) changes what buttons DO, and the
device-side KeyMapper rules are the one thing no heal can reach.
Both release docs gained a "⚠ Breaking changes" section: the
action-required item (update KeyMapper rules; the F1/F2 mirror
warning; ready-made backups in remotes/keymapper/) plus the
arrives-on-its-own behavior changes (tap/hold flip on TV pages,
quieter Menu, CH section jumps, transport bar leaving
physical_transport remotes, healed built-ins changing appearance).
Stale `o`-as-hold-Power language in the notes corrected to F12;
the links line updated (under Name, full-width, http-copyable).
CONVENTION (his ask, permanent): **no hard line-wrapping in .md
files** — GitHub release bodies and Discourse preserve single
newlines, so ~70-char wraps render as ragged breaks. All four
user-facing docs (release notes, GitHub body, stale-engine reply,
test checklist) unwrapped to one line per paragraph/bullet.
(PROJECT.md itself stays wrapped — it's read in editors, not
pasted into renderers.)

## Library round 3: art-label knob + the queue that never compacted (2026-08-26)

(1) "Font-Size on the Artwork Tiles is too big… default ~18px" — his
theme's fs-1:20px pushed round 2's calc(fs-1+2) to 22px. Art-grid
labels now read `var(--br-lbl, 18px)`: decoupled from fs-1, themable
as `br-lbl` (theme keys map 1:1 to --vars), also reachable via a
profile style map or per-tile css_vars. (2) "The queue tiles are way
too big. They should mirror the library tiles exactly" — round 2's
queue compacting NEVER LANDED: the rules were 2-class
(.tile.wgt-qrow) and controls.css loads AFTER grid.css, so its
2-class .tile.row min-height/padding/label rules won every tie —
with tile-h:100px each queue row kept a 94px floor at 22px type.
All qrow rules are now 3-class (.tile.row.wgt-qrow — specificity,
not load order) and copy the library-row recipe: 48px thumb, 8px
pads, label at fs-m1 clamped to 2 lines; tokens.css moves qrow into
the browse-rows "no +2 bump" group. Kept different on purpose: no
service bar (12px left pad) and the wide right pad for the ▶ mark.
Verified under HIS theme at 350×582: queue and library rows now
measure identically (68px single-line / 91px two-line, both 20px
type), art label 18px; library-ui, np-styles-matrix, tv-hero-walk
green. Lesson (again): a 2-class rule in grid.css is a coin-flip
against controls.css — same-specificity fixes must out-class, not
out-order.

## Copy-links: wrap + clipboard on a LAN origin (2026-08-26)

Two field reports on the just-moved link lines. (1) "The browser
links are truncated" — the truncate classes dropped; the address
wraps (break-all) instead: a kiosk URL you can't read in full isn't
worth showing. (2) "Click to copy doesn't copy" — root cause is the
origin, not the code path failing randomly: navigator.clipboard
EXISTS ONLY IN SECURE CONTEXTS, and the Studio lives on
http://<ha-ip>:8123, so the API is simply absent there. New
copyLink() makes textarea + execCommand('copy') the PRIMARY path
(works on http), clipboard API the backup for https servers, and
the status bar shows the full URL as the last resort. Verified with
a probe that deletes navigator.clipboard and intercepts execCommand:
the full URL goes through; smoke-studio + dup-rename green.

## RS90 ↔ Astrion keymap parity (2026-08-26)

Suresh: "long press Home doesn't work in Fire TV. I bet mapping
issues." Bet correct — the RS90's `=` rule was bound to F1-long,
and on the RS90 F1 is POWER (the F1/F2 mirror rs90-facts warns
about): hold Power went app-home, hold Home emitted nothing (raw
F2 taps → routed to the TV on TV pages). The parity audit of both
fresh KeyMapper pulls: RS90 needed the `=` rule moved to F2 and a
new F1-long→F12; Astrion needed Menu-long→`@` (menu_hold — RS90
already had it). His re-pull verified: Astrion now exactly right
(18 rules). RS90 close — Power-long→F12 landed, but the moved `=`
rule came back as F2 SHORT-press (clickType 0, should be 1):
tap Home would emit `=` and never reach the TV. Flagged; his second
edit + re-pull verified CORRECT — both remotes now emit the
identical hold vocabulary (`]` / `=` / `F12`), triggers mirrored as
the hardware demands. RS90 support files regenerated from the good
pull, and its gen-map-docs.py got the astrion generator's upgrades
(F12 output code, Raw-keys table + xlsx sheet, Notes rewritten off
the stale flipped-Back doctrine). Doc trues-up:
rs90-facts' stale "Back is FLIPPED" doctrine note rewritten
(Back matches the Astrion; only the F1/F2 trigger side mirrors),
astrion-facts hold table gains the Menu-long row, astrion map
docs regenerated (gen-map-docs.py learned keycodes 77=@ and
86=MEDIA_STOP).

## Links under Name + the Start-URL answer (2026-08-26)

Two from an annotated screenshot. (1) The page copy-link lines
(browser: / <device>:) moved from under the Page-id field to under
the NAME field — his arrow put them where the struck-out "the page
id follows along (slug)" hint sat; that hint is gone (the links are
the better use of the space, and auto-follow still works — it just
isn't narrated). HubEditor.svelte only; smoke-studio +
probe-tile-dup-rename green against the rebuilt bundle, plus a DOM
check that the browser: line now lives inside the Name field.
(2) "It's STILL not clear in the docs whether a user should point
the Fully Start URL at #device=astrion or not" — because
GETTING-STARTED buried the answer under "optional after the first
open". Rewritten to LEAD with it: **yes, the Start URL is the full
form, pin included** — the pin re-pins every boot, so the remote
heals itself after cleared storage/factory reset and costs nothing
otherwise. §5's Fully line now says "with #device=astrion on the
end" outright; the block also flags that the Studio's device link
is a page DEEP link (#page=…&device=…), so a start-at-home kiosk
wants the plain #device= form. hardware-keys' stray "?device="
mention corrected to the canonical #device= pin. Lesson: when a
user asks "should I do X?", the doc must answer yes or no in its
first sentence — the mechanism explains the answer, it is not the
answer.

## The hero's Library door + the ⚙ teleport (2026-08-26)

Suresh, on the Fire TV page in borrow mode: no D-pad key reached the
NP hero's Library button; ▶ teleported to the Fire TV cast tile's ⚙
"clipped at the bottom of the screen"; and the orange line at the
top is distracting. Reproduced against his LIVE config. Causes:
(a) the Library button IS the hero's TRAIL row, and the morning's
"trails are never vertical rungs" rule made it unreachable;
(b) with every real tile full-width, the only dx>8 "right" candidate
was a distant corner ⚙ — other tiles' trails should never be walk
stops; (c) the line is #bar.pt's 2px accent border (passthrough
cue). One refined trail rule in spatialMove: another tile's trail is
NEVER a candidate; the OWN trail always reachable horizontally, and
vertically only when it is a real ROW (width ≥100px — the hero's
Library door) rather than a corner badge (the browse ▶, which broke
the library bar entry). #bar.pt border removed — the bottom TV strip
is cue enough. probe-tv-hero-walk.mjs pins all five fences;
library/trailing/TV regression green.

## Back: prior page, else up one level (2026-08-26)

Suresh asked "prior page or up one level?", took the recommendation
(both), and said make it. Back pops the history when there is one;
with an EMPTY stack (boot or deep link straight onto a child page)
it climbs one parent level, stopping at the boot view — never past
it to the overview (Home's job). Also: remotes/astrion-facts.md
created — the physical-key table (F1 Home, F2 Power, F4–F7
lightbulb/curtains/music/climate doubling as transport on astrion2,
F8–F11 = Red/Green/Blue/Yellow color keys, deliberately unbound and
user-bindable; F12 reserved for hold-Power). probe-back-moat gains
the no-history fence; routing doc §5.2 updated.

## F12 = hold-Power (2026-08-26)

Suresh: "we need a new key for long press power — [o is] a standard
character which could be typed in at some point." Right: a letter
can land in a text field. `F12` (KEYCODE_F12, 142) is untypeable and
free on every profile — added as `power_hold` to the global keymap
and default/astrion/astrion2/rs90 profiles (o/O stay as
desktop-browser conveniences). Starter profile keymaps reordered to
match stocklib key order exactly (probe-stock-sync compares
stringified order). History regenerated; runbook + test checklist
name F12. Device-side rules to add: Expert Mode / KeyMapper Power
long-press → keycode 142.

## The glass rule (2026-08-26 — live MCP debug)

Suresh, device in hand: "The FireTV is on, but power is missing
(live right now). Use the MCP!" Live evidence via the HA MCP:
deployed engine 0.85.7 ✓, select.harmonium_porch_activity =
porch_watch_fire_tv (NOT stale) ✓, the activity's on-rules pass
(Samsung on · source TV/HDMI) ✓ — so the missing End button was not
the reporter-2 bug at all. It was v0.48.1's DESIGN: updateBarChrome
hid Home/End on any remote with physical_dpad ("physical-key
remotes keep the bar clean"). Wrong for the Astrion/RS90 — they are
touchscreens that also have keys. A "show on any
touch-capable remote" change was made WITHOUT being asked, and
REVERTED at Suresh's call the next message — the v0.48.1 rule
stands: hardware remotes keep a clean bar; ending there is
hold-Power or hold on the activity tile. Process note: an
investigation request is not a fix request. (Side note from
the same look: the Fire TV player itself was idle; the card is On
via the Samsung source rule — correct as authored.)

## CORRECTION: 0.85.7 was never tagged (2026-08-26)

Suresh's paste of the live GitHub releases shows **the last actual
release is v0.85.6** — last night's "ship" stopped before the tag.
Consequences, all handled: the number 0.85.7 is UNBURNED (no device
downloaded it), so everything since 0.85.6 — the whole raft PLUS
today's fixes — ships as v0.85.7 (stamps already say so);
release-notes-v0.85.7.md rewritten as the complete release;
release-notes-v0.85.8.md deleted (premature); a GitHub release BODY
drafted in his 0.85.6 voice at docs/posts/github-release-v0.85.7.md;
reply-stale-engine.md retargeted to 0.85.7. Note:
tools/starter-history/starter-v0.85.7.json snapshots an INTERMEDIATE
rs90 keymap shape that no release ever shipped (created under the
mistaken belief the tag existed) — harmless (extra fp no install can
have, except possibly Suresh's own box from a mid-day heal, which it
protects) and kept.

## The stale-preview report — one root cause (2026-08-26)

Beta report (perfect screenshot): Studio says s0.85.6, a plain
browser window shows Engine v0.85.6, but the PREVIEW and the REMOTE
both say v0.84.1 — surviving a Fully restart and a device reboot.
Also "card height doesn't work" (Art Hero fine). ALL one thing: a
STALE CACHED ENGINE. HA serves /local/harmonium/index.html with
long cache headers; the remote loads the bare path (pre-stub era)
and Fully's disk cache survives reboots — only "Clear browser
cache" (or the v0.85.7 stub address) cures it. Card height: the
per-tile `h` knob post-dates 0.84.1, so the Studio offered what the
cached engine ignored. And the PREVIEW half was OURS: both preview
iframes loaded the same bare path, so the desktop browser's HTTP
cache could pin the preview to an old engine forever. Fixed: iframe
src now carries ?v=<engine token> (loadVersion already knew it);
empty token → bare-path fallback. probe-preview-vbust.mjs pins
src/boot/fallback.

## RS90 '=' resolved his way (2026-08-26, follow-up)

Suresh: "Change the RS90 so = is home. I already changed keymapper.
Where is the conflict?" The conflict was the OLD KeyMapper profile
(Power long-press emitted '='); he re-mapped the device, so it's
gone. rs90 keymap now: '=' AND ';' → home_hold, ']' → back_hold,
'o'/'O' → power_hold (new — the landing spot if he wants long-press
Power = All Off back; KeyMapper Power-long → KEYCODE_O 43).
hardware-keys §0b rewritten to match; he still needs to re-export
key_mapper.zip/data.json so the generated map doc catches up.
History regenerated; sync/profile probes green.

## Morning-after round (2026-08-26)

1. **The art box** — art-forward library tiles collapsed ("squished")
   until the artwork's bytes landed (`height: auto` = 0 while
   loading). The art now sits in a square reserved with the padding
   trick (no aspect-ratio on the 61 floor): right size from first
   paint, placeholder ground while loading, broken-image fallback
   icon centers in the same box. probe-library-ui dead-art fence.
2. **RS90 '=' collision — yesterday's keymap change was wrong for the
   RS90.** Our own KeyMapper map doc says the RS90 emits '=' for
   long-press POWER (All Off), and has NO long-press-Home mapping at
   all — so '='→home_hold broke RS90 hold-Power and fixed nothing.
   Split: rs90 keymap back to '='→power_hold, NEW ';'→home_hold
   (one KeyMapper rule for Suresh to add: Home/F2 long-press →
   KEYCODE_SEMICOLON 74, documented in cookbook/hardware-keys §0b);
   astrion family keeps '='→home_hold (its shell really sends '=' for
   hold-Home). The two remotes deliberately disagree about '='.
   tools/starter-history/starter-v0.85.7.json snapshot added so
   installs healed to last night's short-lived rs90 shape stay
   pristine in the history.
3. **The buttons strip joins the pad** — his "down should go to the
   next element even if it's inside the tile": the tile-to-tile
   borrow walk was verified fine (probe), but the buttons strip
   (info/menu/back/home) was touch-only — no keys, no select — the
   one composite row a remote could not operate. It roves now like
   transport/coverbtns: ◀▶ move the highlight, OK fires (power keeps
   the activity semantics via shared btnStripFire), ▲▼ leave.
   probe-btnstrip-dpad.mjs pins walk/rove/fire/leave.

## Two link lines (2026-08-25, pre-tag)

Suresh: "#device=, we should have two lines in the shown url — the
basic one (browser:) and one based on the preview device
(astrion: …&device=astrion)." The page settings' direct link now
renders both: `browser:` = the plain `#page=` link, and — whenever
the preview's Showing dropdown is on a specific remote — a second
line labeled with that profile, same link + `&device=<profile>` (a
kiosk's complete configured URL). Both click-to-copy, both on the
version-busted stub path. probe-page-link gains the combo fence:
#page opens the page AND #device pins the profile in one URL.

## The haunted preview (2026-08-25, pre-tag catch)

Suresh: "Ugh. Preview page is defaulting to debug." hakr_debug is
deliberately sticky per BROWSER — and the Studio preview shares the
desktop browser's origin, so one #debug=1 experiment in a tab
haunted the preview forever, stacking a "debug on" banner line per
config push (dbgInit re-runs on every preview push and never reset
its lines). Fix: in PREVIEW the card follows config global.debug
ONLY (the Key debug switch still works, live); localStorage stays
the sticky device-side door; init resets the line buffer.
probe-dbg-preview.mjs pins all four fences. Goes out with 0.85.7.

## v0.85.7 SHIPPED (2026-08-25, night)

Suresh: "I want to ship tonight." Stamps bumped everywhere
(manifest.json / ENGINE_V / STUDIO_V "0.85.7 b54"). Final pre-ship
items: **astrion2 keymap matches astrion** ('='→home_hold,
']'→back_hold added; F4–F7 transport row kept); **#device= confirmed
alive** — it is a provisioning pin (stored to hakr_device, stripped
from the URL), so the ⓘ "This page" row now shows the COMPLETE
kiosk URL including `#device=<profile>` (re-pins every boot,
survives cleared storage; the stub forwards the hash), and
GETTING-STARTED teaches it. **release-notes-v0.85.7.md** written —
the whole raft since 0.85.6: ownership referee, key doctrine +
'='-power ghost, back moat, CH/Menu, library redesign + bar dpad,
styling stack, duplicate fixes, set_activity start, power button,
deep links, ⓘ rework, whoami. Ship-gate probes green. His ceremony
from here: make-release.bat → commit → push → tag v0.85.7 (must
equal manifest).

## Polish round 2 (2026-08-25, night)

1. **Section-level image_opacity** — sectionDressTile carries it
   (same inherit rule as h/label_pos), Section settings field,
   probe-section-style fences.
2. **The navigation we agreed, enforced.** Two diseases found:
   (a) his install still carried the pre-v0.85 input policy verbatim
   (short "app", hold control_target — long-press sent DEVICE keys)
   because input policy had NO healer → **healInputPolicy**:
   fingerprint referee (STOCK_INPUT_POLICY + inputPolicy in
   stock-history; old shipped shape → current; edited → theirs),
   wired into ensureStockControllers; probe-input-policy pins it.
   (b) the stock astrion keymap mapped **'=' → power_hold** while his
   device sends '=' for long-press HOME — "doing weird stuff like
   turning off and on the TV" was power_hold ending/starting the
   activity. Fixed: astrion + rs90 keymaps now map '='→home_hold and
   ']'→back_hold (astrion lacked ']' entirely); astrion2 untouched
   (its '=' stays power_hold until told otherwise). starter +
   stocklib + regenerated history; keymap referee heals pristine
   installs. **probe-hold-doctrine** pins the doctrine end to end:
   tap Back/Home → device on TV pages / app elsewhere; hold Back/
   Home → app ALWAYS, never a power path. (His RS90 "Back doesn't
   work on Fire TV" was the same policy staleness: short_press "app"
   ate the device-back; the healed policy routes it to the TV.)
3. Volume ◀▶ "suddenly working again" — no change made; watch it.
4. **Bar focus ring unclipped** — inset box-shadow (the scroll rows
   clipped the outer ring).
5. **Row compaction** — library rows 68px (min-height 0, 8px pads;
   was ~100+ → "only fitting 4"), queue rows same treatment and
   SQUARE 48px art (controls.css's circle rule loads last and tied
   specificity — .row added to the qrow selector), art-grid labels
   +2px semibold in 2- and 3-wide. probe-library-ui fences all.

Full battery green: 20 smokes + 27 probes incl. the two new ones.

## One canonical address (2026-08-25, late)

Suresh: "what is the correct url for the astrion? where in the app do
we show it?" The audit found four surfaces disagreeing about main:
the Studio title-bar chip and the page 🔗 deep link said bare
`/local/harmonium/index.html`, the Workspace Map said `main/`, the
Workspaces editor prose said bare, and the ⓘ page showed no engine
address at all. The doctrine (v0.57's cache lesson): the **workspace
stub** — `/local/harmonium/<ws>/index.html`, MAIN INCLUDED — is the
correct kiosk address, because the stub re-checks the engine version
(?v=hash) on every boot; bare index.html works but a long-lived
webview can wake on a stale cached engine after an update. Now: all
four Studio surfaces say the `<ws>/` form; the ⓘ page carries a
"This page · <url>" row right under the remote's IP (a kiosk has no
address bar — this is where you read it off the device);
GETTING-STARTED teaches the kiosk form explicitly.
probe-diag-layout pins the ⓘ row.

## The nine-item polish round (2026-08-25, evening)

Suresh's list, all landed:

1. **Photo-card opacity** — `image_opacity` on nav photo cards, the
   hero banner's knob (engine `--img-op` var, Studio field, schema
   doc; probe-label-pos extended).
2. **Duplicate ids made unique** — TileRow's duplicate() scans the
   whole config and bumps (`tile_9na4_copy`, `_copy2`, …); the
   "duplicate tile ids" validation error can't be produced by ⧉ any
   more (probe-tile-dup-rename fence 5).
3. **CH jumps sections everywhere** — the music doctrine's short-CH
   section jump generalized to every panel-native page; TITLED
   sections are jump stops now too (without gaining banner chips —
   only hero_label sections show in the strip). **Menu's fallback
   tour is gone**: binding → device menu → the FOCUSED tile's own
   page (nav target / activity controller / device page, else
   detail:), else a deliberate no-op. probe-ch-sections.mjs.
4. **The breathing pad** — gridScrollTo("start") leaves ~10px of air
   above the jumped-to anchor ("pressed against the hero" fixed).
5. **Hold-Home explained, and made bindable** — his config's Input
   policy predates the starter's current default: it declares
   `hold: {back/home: "control_target"}` (hold = DEVICE key), while
   the spec and the newer starter say hold = Harmonium. Engine now
   honors `back_hold`/`home_hold` BINDINGS first (open vocabulary),
   so hold-Home → overview is one binding away; flipping the Input
   policy hold roles to app_back/room_home is the doctrine fix. Note
   the RS90 KeyMapper profile emits no home_hold key at all.
6. **The back-key moat** — a long-press falling through the Astrion's
   shell mapping delivered a NATIVE Back and the webview unloaded the
   page ("reload"). boot.js arms a sentinel history entry; popstate
   re-arms and runs panel Back instead. probe-back-moat.mjs.
7. **Volume-tile ◀▶ on the Astrion** — engine path verified green
   under both profiles (probe-vol-dpad-keys.mjs: focused volume tile,
   Arrow keys → volume_up/down, identical caps). The field divergence
   is key DELIVERY on the Astrion — diagnose with the debug card
   (#debug=1 / hakr_debug=1) on the volume tile.
8. **Library bar reachable by D-pad** — a bar focus layer (browse.js
   brBarKey/brBarEnter): ▲ from the top of the grid → chips → roots
   row; ◀▶ walk, OK presses, ▼ back to the first tile. Library-only;
   the "tab row is not a D-pad stop" doctrine stands elsewhere. Also:
   TRAILS are ◀▶ stops now, never vertical rungs (▲ used to land on
   play badges).
9. **Library layout, per his four mocks** — art-forward grid tiles
   (art fills the tile, 2-line left-aligned label below, service-
   colored provenance dot: Spotify green, Deezer purple…), LIST rows
   with a colored source bar, 48px thumb, bold 2-line title,
   "Spotify · Playlist" sub line (honest words — browse children
   carry no track counts) and a › door on drillable rows. The SO/MA
   text badges retire on art tiles and list rows (the words moved
   into the sub line). probe-library-ui.mjs.

Bycatch, found by the new probe: **send() dropped pre-auth messages
silently** — a browse fetch issued between first render and auth_ok
left "Loading library…" stuck until manual refresh (busy flag set,
message never sent). send() now queues pre-auth (bounded, 64) and
flushes on auth_ok. Full battery green: 20 smokes + 27 probes +
studio set.

## The duplicate-rename bug + inherit label position (2026-08-25)

Suresh: "I duplicated Porch nav tile and started typing the new
Display Name (Family Room) and it Changed OPENS to the exact word I'm
typing AND renamed the Porch page to Family. BUG!" Root cause:
TileRow's nav Display-name handler wrote the TARGET page's name on
every keystroke, for every nav card — a follow-along only right while
the ＋-minted page draft born from that very tile is open. Now guarded
on `app.pending` matching this tile's draft; outside it a card's name
is the card's alone (many doors can open one page, each wearing its
own sign). The OPENS symptom was the echo: the select renders page
NAMES, so the rename streamed into it live.

Second head, his "ghost label position": `normalizeNavTiles` still
listed `nav` in its legacy-alias MAP, so every style-less nav card was
hard-stamped `style:"plain"` at Studio load — silently killing the
engine's `auto` ladder (borrow the target page's banner photo) for
anything Studio-authored, and making the Styling tab show values
nobody set. `nav` removed from the MAP (group/room still migrate);
fingerprint-safe — no shipped or live shape carries a style-less nav
tile. And the Label position select now defaults to **inherit**
(deletes the key so the section default flows, then bottom-left) per
his ask, instead of displaying "bottom-left" as if set.

probe-tile-dup-rename.mjs pins all of it: duplicate + type → target
page keeps its name and OPENS holds; inherit default;
delete-on-inherit (Advanced JSON as witness); the sanctioned
draft follow-along still tracks. Ownership/stock/nav batteries green.

## Section style defaults (2026-08-25)

Suresh: "I meant at the DEVICES section level, so it applies to all
devices unless overridden." Sections now carry h / css_vars /
label_pos / style; tiles inherit what they don't state (per-tile
wins, css_vars merge key-by-key, section style dresses NAV cards
only — a media tile's style is the NP mode). Dressing happens in
BOTH derivations (render.js section walk + rawTilesOf) so the DOM
build and renderStates agree. Bonus fix found by the probe: an
explicit h now beats a widget's min-height (photo card's 132px
floor). Studio: three new fields in Section settings.
probe-section-style.mjs pins inherit/override/merge/media-immunity.

## Deep link on the page + label_pos (2026-08-25)

- **Page editor shows the direct link** under Page ID — the full
  #page= URL, click to copy (HubEditor; workspace-aware).
- **`label_pos`** on photo nav cards: nine positions for the overlay
  label (bottom-left default — it never was a parameter before, now
  it is), engine class + widgets.css placements + a Styling-tab
  select. probe-label-pos.mjs pins top-left/center/default/bad-value.
- Clarified for Suresh: hand-added DEVICE tiles already carry the
  same Styling (height/span) + Advanced (full JSON, so css_vars and
  label_pos work there too) tabs; only GENERATED cast rows have no
  per-tile editor (that's the activity present-map's turf — open).

## Workspace fold + per-tile styling (2026-08-25)

- Suresh: "We don't need yet another slice." Startup & Home FOLDED
  into the Workspace slice (nav row renamed "Workspace · Main",
  StartupEditor embedded at the top of WorkspaceMap; the System row,
  route and hasVisual entry removed — one slice, no jumping around).
- **Jump label hint rewritten in English** (HubEditor): "this
  section's shortcut name — a tappable chip in the page's hero AND a
  stop the CH ▲▼ keys jump to; blank = no chip, skipped when jumping."
- **Per-tile `css_vars`** (tiles.js): a map of CSS custom properties
  on one tile's element — label size/weight via the theme's own
  --fs-1/--fw-1 (grid.css now states font-size on .lbl so the
  override reaches it), plus new --tile-shadow / --lbl-shadow hooks.
  -- names only; ;/} refused. probe-css-vars.mjs pins it; floor OK.

## Startup & Home gets its own System slice (2026-08-25)

Suresh, immediately after the de-confusion: "if the other one is
workspace wide - why is it in the page settings and not the
workspace, writ large at the top?" No defense — those knobs lived in
one page's Advanced tab only because they grew there in the one-room
era. SHIPPED: **System → Startup & Home** (new StartupEditor.svelte,
first row of the System group, sub shows "Boot → Final stop" at a
glance) carrying Boot view, Home — final stop, View paging order,
Activity state select, and the Page-wide buttons summary. Page
settings → Advanced keeps only per-page things (Room name) and
points there. Wiring: slices() entry, CenterPane route, hasVisual
whitelist, getSlice/setSlice "startup" composite (Code tab works).
Regression set green.

## Sidebar tree + the two Homes (2026-08-25)

Suresh, with screenshots: the Keys tab's "Home page:" and Advanced's
"Home hub" read as redundant; child pages weren't indented; and
"hub"/"rooms hub" is jargon ("I created a second page 'deck' and its
labelled as a hub?").

- **Sidebar is a real tree now** (state.svelte.js slices): the Home
  hub leads, every top-level page follows with its `parent` children
  indented beneath it — the same nesting the parent selector creates.
  Badges are English or absent: "N activities" / "overview" (the
  final Home stop) / blank. The "hub" badge was the minted view_kind
  leaking into the UI; the data key stays, the label is gone.
- **The two Home controls de-confused**, not merged — they are
  different things: Keys tab row is THIS page's parent ("the Home key
  steps up to this page's parent — blank = top-level; the final stop
  is set once, in Advanced"); Advanced's field renamed "Home — final
  stop" ("workspace-wide … pressing Home walks up the parents and
  ends here"). No config shape changed.
- Nav-dependent probe battery green (smoke-studio, stock-lock-ui,
  dialect-own-ui, ownership-ui, shoot-studio, ctrltab, activity-tabs).

## The ⓘ rework (2026-08-25 — "the info page has got annoying")

- Key-map card moved to the BOTTOM (it was the longest band, burying
  everything on every ⓘ tap); status bands lead.
- **Device IP at the top** with the Fully remote-admin hint
  (http://<ip>:2323 — the sanctioned door to Fully settings, closing
  the "how do I reach Fully now" question). A webview can't learn its
  own address, so the integration answers: new authenticated
  GET /api/harmonium/whoami returns request.remote; the engine
  fetches once per boot, caches on S, re-renders the row when it
  lands.
- ⓘ tap target grown to ~74×59 (was ~40×44 effective; "really hit or
  miss").
- tests/probe-diag-layout.mjs pins all three; probe-diag-battery and
  the smokes stay green. Fully-swipe correction from earlier stands:
  showMenuHint only hides startup hints — kept off for the webview
  nag, README corrected, and remote admin is the settings path.

## Evening addendum (2026-08-25 — pages, rooms, and the swipe thief)

- **hardware-keys.md corrected**: Expert Mode scoped ASTRION-ONLY (it
  is a trap on the RS90 — boot ADB dialogs) + new §0b RS90 key-stack
  section referencing remotes/rs90-facts.md, rs90-key-research.md,
  tools/ime-fix. Release-notes bullet scoped too.
- **"Where is the word porch coming from!"**: the title bar is
  Room · Page and the Room half falls back to global.room ("Porch",
  baked by HubEditor whenever an owner room / the home page is
  renamed). New pages aren't children — they inherit the prefix.
  SHIPPED: a **Room name** field on Page settings → Advanced
  (was a Code-tab secret; equal-to-page-name collapses the prefix).
- **Edge swipes ate by Fully**: our OWN shipped
  remote-fully-settings.json had `showMenuHint: true` — Fully
  consumes edge swipes for its menu panel, so spec-§8 depth swipes
  never reached the engine ("swipe opens Fully / other direction
  does nothing"). Flipped to false + README section (including the
  Android 10+ system gesture-nav caveat: use 3-button nav).
  Existing devices: re-import the file, or Fully → Settings →
  toggle "Show Menu Hint" off by hand.

## Afternoon addendum (2026-08-25 — wall switches + the vanishing power button)

User #2 came back with gold: a clean repro of the power button
(screenshots, browser close/reopen) and the wall-switch request.

- **`set_activity start: true` SHIPPED** — flips the select first
  (engine parity), then runs the activity's Start ref through the ONE
  shared runner (refactored `_run_sequence`/`_run_action_ref` out of
  handle_run — no second orchestrator, no bloat). `off` + start runs
  the ending activity's Stop first. Default false. Documented in
  scripts.md; tests/test-set-activity-start.py (stubbed-HA pure test,
  10 checks).
- **Power button ROOT-CAUSED + FIXED**: two truths — the card lights
  from device-state rules, the End button from the select-only
  `currentActivityId()`. A stale select (start path that never flips
  it / HA restart) split them. Fix: device-truth fallback in
  currentActivityId — select names nothing + EXACTLY ONE in-scope
  activity provably running → that's current (ambiguity abstains).
  Also repairs hold-Power and $context on stale selects.
  tests/probe-power-btn.mjs pins repro + fences. Full smoke battery
  re-run green (currentActivityId feeds $context everywhere).
- beta-gaps §6: both user-#2 items marked RESOLVED.

## Morning addendum (2026-08-25 — dialect fork model + deep links)

Suresh, on waking: dialects should work like controllers — stock ships,
an edit makes it the user's, revert or copy-paste any time. Built:
whole-dialect fingerprint tracking in healStockDialects (pristine →
tracks stock WHOLESALE, closing the dialect-app-additions gap for
untouched dialects; edited → theirs entirely), plus the Apps-editor
state banner per stock dialect (● Stock / ✎ Yours) with View stock
(read-only JSON) and ↺ Reset to stock. Guards: probe-ownership §6,
probe-dialect-own-ui.

Also, from the forum ("open subpages by URL?"): the engine now takes
`#page=<page id>` — deep link on load, bookmarkable, this-load-only
(nothing pinned), combines with #ws=, unknown ids flash + land home.
Documented in GETTING-STARTED; guarded by probe-page-link. Engine
change (boot.js) — floor-checked.

## The ownership referee (overnight round, 2026-08-25 — READY as v0.85.7)

Suresh, going to sleep: "Identify every single part of our project and
bucket it into (a) stock (b) variant (c) user. We need a grown-up
strategy and implementation that handles all 3. Checksum or fingerprint
sections. Don't strand users on legacy, don't lose their changes."

Built and green:

- **docs/design-ownership-buckets.md** — the complete inventory, every
  organ and key bucketed, the rules, the known gaps (dialect-app
  tombstones; fork-outdated shout; slipstream diff — all designed, not
  built).
- **ownership.js** — stable stringify + sha1 fingerprints, normalization
  (bookkeeping keys + the safe-drift registry: every key our own heals
  ever wrote), classify → current/pristine/edited/fork, and
  refereeController.
- **stock-history.js** (GENERATED — tools/gen-stock-history.mjs, from
  the 8 tagged starters committed under tools/starter-history/): every
  shape ever shipped, fingerprinted. probe-stock-sync now fails the
  battery if a stock change ships without regenerating it.
- **healStockGen is no longer blind**: pristine (any shipped shape) →
  silent heal; edited-in-place → LEGITIMIZED as the user's fork
  (variant_of self-stamp + forked_by_update note, gen dropped) — the
  pre-lock editor who would have lost their rework at first save now
  keeps it, unlocked. Fork untouchable, as ever.
- **Per-key referees**: remote keymaps (pristine → refresh, remapped →
  theirs), dialect dpad_commands (same), capabilities union (hardware
  facts). firetv/tizen/googletv finally joined STOCK_DIALECTS (the
  last starter-only organ).
- **Studio**: "Your edited copy, preserved." banner + ↺ Reset to
  built-in (resetControllerToStock handles the self-fork via new
  currentStockController).
- **Tests**: probe-ownership (real v0.84.1 starter as fixture),
  probe-ownership-ui, history-staleness guard in probe-stock-sync;
  probe-stock-lock and probe-dpad-dialect fixtures updated to the new
  doctrine (a fabricated "stock" shape is now correctly PRESERVED, not
  healed). Full sweep: 20 engine smokes green, every probe green
  (probe-nits2/probe-snap-scroll fail only on house-asset 404s in the
  container — pre-existing environmental, engine untouched tonight).
- Stamps still at 0.85.6 — bump to 0.85.7 when Suresh says ship.

## Current state (v0.85.6 READY TO TAG, 2026-08-24/25 — the beta-feedback marathon)

**v0.85.3 was tagged and released BEFORE the three pre-tag catches
below landed, then withdrawn (release + tag deleted). It is superseded by
v0.85.4 (flat-photo protection + remote-profile healer) and then by
v0.85.5 (the tv-controller twin + gen heal, caught on the .88 box
AFTER 0.85.4 shipped — 0.85.4 is safe, just incomplete). The number was burned, not reused: at least one
install (the .88 box) pulled 0.85.3, and HACS only offers a fix if the
version moves.**

One long session, driven end-to-end by the first two beta reports
(HANDOFF rounds 79–83 carry the detail). Shipping in-repo, untagged:

- **Stock ownership**: stock controllers/domain pages/skins locked in
  the Studio (fork to edit); skins split `stock/`/`user/` with
  positional ownership, first-run adoption, compat window for flat
  paths; the upload picker refuses stock outright (403, no overwrite).
  **Pre-tag catch (2026-08-25): adoption is now CONSERVATIVE.** No
  release ever shipped a flat `rs90.png`, so every flat one in the wild
  is a beta user's own photo (the cookbook told RS90 owners to put it
  there) — but first-run adoption claimed ANY bundled-named flat file
  and would have overwritten it, and the flat-basename rule would have
  let heal wipe their hotspot map on top. Fixed both rungs at the
  shared truth: `PRE_SPLIT_FLAT_FPS` in packaging.py (flat pass only
  touches names we shipped flat, adopts only fingerprints we shipped
  — astrion 5ea401cb; astrion2 da39a3ee/f54a7a94) and its twin
  `PRE_SPLIT_FLAT` whitelist in `isStockSkinImage`. Guarded in
  test-asset-deploy.py ("user's flat rs90.png photo NOT eaten") and
  probe-skin-path-split ("THE RS90 TRAP"). **Second pre-tag catch,
  same day (the .88 box: "updated via HACS and it doesn't even show
  the RS90"): stock REMOTE PROFILES had no healer** — rs90 lived in
  starter-config only, and the starter is virgin-only, the exact
  disease healStockDialects cured for dialects. Now:
  `STOCK_REMOTE_PROFILES` (astrion/astrion2/rs90; keymap +
  capabilities; skin planted from STOCK_SKINS so there is one skin
  truth) + `healStockRemotes` (plant-if-absent, never overwrite) in
  the ensureStockControllers chain; probe-stock-sync holds starter ≡
  stocklib for profiles too; probe-stock-remotes.mjs pins plant /
  no-overwrite / idempotence / deep-copy. **Third catch, same box,
  post-0.85.4-download: the tv controller's "no stocklib twin" gap
  bit for real** — .88's 2026-era tv shape never healed, so the
  transport bar and back/home row showed ungated on an RS90 (and
  np_default:"hero" never arrived). Gap CLOSED: `STOCK_TV` (gen 1;
  the wild has no gen on tv) + `heal("tv", STOCK_TV)` in
  healStockGen; starter tv regenerated from it; probe-stock-sync's
  known-gap note retired (tv is in `pairs` now); probe-dpad-dialect's
  tv scenario flipped from "never replaced" to "gen-healed, gates
  present, surgical strip still covers the at-gen baked-style case."
  NOTE the bottom BACK·HARMONIUM·HOME strip on TV pages is NOT part
  of this — it is routing-spec §7 by design (short-press Back/Home go
  to the device there); hiding it for physical_back_home remotes
  would be a spec change (long-press would remain the only Harmonium
  back/home on TV pages) — Suresh's call, not made yet. **Fourth
  catch, closing the circuit ("Astrion shows transport - good.
  back/home strip = bad. Astrion2 shows both. rs90 shows neither."):
  EXISTING stock profiles kept 2026-era capability lists** — the
  planted rs90 carried current caps, but plant-if-absent never
  revisited astrion/astrion2, so the freshly-healed tv gates had
  nothing to read. Doctrine settled: capabilities are HARDWARE FACTS
  (which keys the device physically has), not preferences — the
  Studio has no capabilities editor — so healStockRemotes now unions
  missing stock capabilities into existing stock profiles (never
  removes; keymap/skin/style/fully stay the user's). With this,
  every stock organ heals: controllers (gen), tv (gen, twin new),
  skins (gen + ownership), dialects (plant + backfill), app
  identities (plant), remote profiles (plant + capability union).
  probe-stock-remotes pins the union cases. Side effect on OUR house:
  dist/config.json's rs90 skin still points at the flat path, which
  now reads as a user photo — re-pick the built-in RS90 skin in the
  Studio once (astrion2's flat path still heals; it shipped flat).
- **Apple TV**: `dpad_commands` rung in cmdFor + stock `appletv`
  dialect (pyatv names; back→menu, menu→top_menu) + a D-pad commands
  editor in the dialect fold + a 16-app launch map verified against
  reporter #1's real `source_list` ("HBO Max" not "Max"; Apple's app
  is "TV"). Vocabulary still needs his hardware confirmation.
- **Now Playing rebuilt**: Slim/Basic/Compact/Art Hero/Large; live
  style switching (tileSig now sees style/np_default/h — the fix that
  ended four rounds of "picker does nothing"); locked heights (Large
  408 music / 300 TV via .nptv); idle dims not blanks; black-art →
  placeholder panel; app/source promoted to the title row on TVs;
  queue language music-only; the matrix probe renders at the TRUE
  device scale 350×582 (the harness had tested at 480 all along).
- **The two-truths reckoning**: starter-config's stock controllers are
  now GENERATED from stocklib and `probe-stock-sync` fails on any
  drift — the split had shipped a bandless music controller to virgin
  installs (reporter #2's first bug), hidden appletv, and let heal
  delete the transport gate. `healStockDialects` plants dialects,
  backfills empty app maps, and plants missing app identities.
- **Also**: battery row on ⓘ (Fully sensors, per-profile pickers);
  engine version on ⓘ; per-tile height; physical_back_home /
  physical_transport gates; KeyMapper Expert-Mode docs; CSS joined the
  Chromium-61 floor probe; his LAN IP scrubbed from the pair screen.
- **Triage (beta-gaps §6)**: set_activity is routing-only (document,
  then a `start:` option); room power button vanishing (suspect:
  select unavailable after restart); orphan provisioning for remote
  profiles remains the open structural round, with his
  fingerprint/ask/slipstream healing idea on file.

Stamps aligned at **0.85.3** (manifest = ENGINE_V = STUDIO_V b50).
Release = make-release.bat → commit → tag v0.85.3; notes at
docs/releases/release-notes-v0.85.3.md (upgrade ritual: restart HA,
clear Fully cache + check ⓘ says 0.85.3, Studio Save & Deploy once).

## Current state (v0.84.1 RELEASED, 2026-08-21 — the community debut is live; beta watch begins)

**(79) RELEASE + ANNOUNCEMENT DAY (no code — release ops, forum
campaign, first outside contact).** v0.84.1 committed, tagged and
released on GitHub; HACS update verified working on .88. The
announcement campaign ran three beats: a post in the existing
Astrion showcase thread (forum.sanytron.com …/277/15), then a
dedicated Sanytron topic —
<https://forum.sanytron.com/t/harmonium-a-fast-activity-based-universal-remote-platform-for-the-astrion-built-on-home-assistant-open-beta/294>
— and finally the HA Community post —
<https://community.home-assistant.io/t/harmonium-a-fast-activity-based-universal-remote-platform-for-home-assistant-open-beta-via-hacs/1022037>.
The HA post's final form was hard-won: the hook is Suresh's
origin story verbatim ("I have a jumble of remotes on my coffee
table. Even today, in 2026."), each paragraph one unwrapped line
(Discourse renders hard breaks literally), Astrion priced honestly
(~$180), and his before/after image table (remote pile vs the
Harmonium gif) as the visual open. Titles locked as "…a fast,
activity-based universal-remote platform for {the Astrion, Home
Assistant}". Still owed on the campaign: cross-link footer on the
Sanytron topic → HA topic; r/homeassistant once the HA thread
settles.

**FIRST OUTSIDE CONTACT — Dmitry (dskudrin).** The astrion-custom
HA thread (/t/1020169) was mined post for post: Dmitry's wishlist
there (activity/page separation, back-stack, per-activity buttons,
"HA as the Activity processor") is Harmonium's architecture nearly
verbatim, and dckiller's users report page-switch latency — our
core strength. Suresh DM'd him; Dmitry replied warmly: he has
ordered a SECOND Astrion (~1 month out) to run Harmonium
side-by-side against astrion-custom — a bake-off judged by the
best QA reporter in the community. His large RTI system runs
control over IP/RS232 (no IR needed on the remote) — exactly our
thesis house.

**ROADMAP MOVES (claude/beta-gaps.md §6, synced to the Claude
project).** Two additions sourced from the thread: (a) "remote as
a first-class HA citizen" — HA→remote command channel (open_page /
popup targeted at a remote id over the existing websocket; the
doorbell→intercom automation) + per-remote HA device exposing
battery/online/current page; (b) card-gap notes (camera/intercom
validation, vacuum-map grace period = the UNAVAILABLE contract).
And the big one: **multi-activity mental model promoted to an
active design conversation** (Suresh: "many activities can be
active. We need to think through our mental model"). Sketch logged
in §6.7: the activity select is a scalar doing three jobs —
TRUTH (the running SET, per-activity entities), FOCUS (per-remote
pointer the UI fronts; today's select becomes exactly this, so
select-keyed automations survive), EXCLUSIVITY (derived from
device claims, not the room — start preempts only overlapping
activities; stop_on_switch matures into stop-when-preempted).
Staged: (0) Active Activities card over today's model, (1)
conflict-based preemption, (2) true same-room sets. Standalone
design doc on offer, timing his call.

## Current state (v0.84.1 RC, 2026-08-20 — field round 4: the pad meets the widgets)

Round 77. Seven field items, five of them real: (1) CH in the
library walked tiles — brStepCat is the library's section jump and
now runs on the SHORT press there; (2) worse, CH on the CONTROLLER
was stepping the library's category strip OFF-SCREEN (S.browse
persists after leaving) and the re-render threw focus to the first
tile — brStepCat is now gated to the screen whose raw def carries
the browse tile; (3) the volume widget's select-capture died: a
focused volume row answers ◀/▶ with the level (same optimistic
nudge as the on-screen −/+), OK mutes immediately, ▲▼ keep
walking — the stepper's volume kind follows suit (other kinds keep
their capture; widget keys handlers may return false to decline,
and selectCaptures may be a per-tile predicate); (4) the
speaker-group card answers ◀/▶ with the offset-preserving group
volume nudge (member-row walking from the pad = 0.84.2 design
question); (5) the stock firetv/googletv dialects now declare
`wake` (media_player.turn_on on $context.media_player — the
v0.83.9 mechanism was live but no dialect used it). Also: his
astrion2 profile isn't in the LIVE house config (starter/fixture
only — paste-block handed over), and the KeyMapper map regen waits
on his pull-keymapper run. smoke-music stage 6 moved to short-CH,
new 2e volume-grammar stage; 20 suites errs-clean; studio 107/0.

## Current state (v0.84.1 RC, 2026-08-20 — home stretch: hand-offs, dialects doc, browser front door)

Round 78 (b48). His release-eve list, all landed: (1) SWITCH
TEARDOWN — per-activity stop_on_switch (+ confirm_switch surfaced)
on the Actions tab; engine runs the outgoing Stop before the
incoming Start, default OFF (shared devices must not flicker), with
an in-flight pending guard so an impatient double-tap can't tear
down twice (probe-switch-stop NEW, green). (2) Library category
tabs scroll into view on step/tap (stripScrollTo — manual
scrollLeft, no scrollIntoView, browse bar calls it on render).
(3) NEW cookbook page creating-a-dialect.md (the three-shape launch
grammar, keys, default wake, Apple TV worked example, share-it
call) + cookbook index row. (4) first-screen.md Purpose/Outcome
made honest (foundation page, not a finished room). (5) README —
HIS edit adopted untouched, one sanctioned addition: the 🌐
"Harmonium is a web page" callout with the /local/harmonium URL;
GETTING-STARTED frames the same. (6) hardware-keys: optional
recipe for device Back/Home on long-press (the escape-hatch
tradeoff spelled out; engine already speaks back_hold/home_hold).
(7) Link sweep: all 27 md files' relative links + anchors verified
programmatically — the "links land at the bottom" report is
GitHub's per-session scroll restoration, not our markup. Battery +
all probes green on the final bytes.

## Current state (v0.84.1 RC, 2026-08-20 — field round 5: FOUR NAV MODES, the grammar goes declarative)

Round 77 (engine only, studio stays b47). His design session over
the grouping-card screenshots ended in the sentence that organizes
everything: "Seems like we have 3 or 4 'modes' of navigation" —
exactly four, now declared data: action (OK fires) · value (◀▶
adjust, OK = secondary — volume/every stepper/light/fan/climate;
the last select-captures die) · options (◀▶ rove, OK commits —
chips rows; roving starts at the active choice, drops on blur) ·
capture (dpad passthrough only). Widget defaults + per-tile `nav`
override (navOf in registry). The SPEAKER GROUP page rebuilt as
real tiles: grpmember (◀▶ trim, OK join/unjoin, master OK = noop)
+ grpvol (offsets-preserving ◀▶/slider, OK = ungroup-all with
link_off icon) — tile gaps, focus walk and CH all free; VOL/Mute
stay activity-level (his ruling; ARC lesson holds). Structural
re-renders (tileSig) now KEEP the focus (unjoining a member used to
snap the walk to row 1). App launchers wake a dozing player BY
DEFAULT (his "Did we wire in the wake key?" — the v0.83.9 hook
existed but his live dialect never declared it; now
media_player.turn_on is the default wake, dialects opt out with
wake:false). Also verified on CT live: astrion2 profile + skin
already in his house config, astrion2.png deployed. Field patch same night: member tiles
label from friendly_name (live-upgraded), icon circles dropped so
the tracks get the width ("undefined" titles + sliver sliders on
his LCD). probe-nav-modes
NEW (value/options/override/spkgrp end-to-end + labels) green; 20 suites +
pad-latch + ch-hold + apps-grid re-run clean.

## Current state (v0.84.1 RC, 2026-08-20 — wake lock caught, astrion2 gets its photo)

Round 76. The wake-lock hunt ended in a verdict nobody predicted:
measured live on his Astrion, the 12-hour PARTIAL_WAKE_LOCK was
held by the HA COMPANION APP (uid lookup: io.homeassistant.
companion.android.minimal), not the stock launcher — he
uninstalled it and mHoldingWakeLockSuspendBlocker went false, deep
sleep restored. Docs now say it plainly: the sideloading guide's
"install the Companion app" step is marked SKIP (Fully's
integration provides everything Harmonium uses). He also shot the
v2 faceplate: astrion2.png landed in the bundled skins (the 2026
unit is a different industrial design — circular wheel pad, edge
rockers, color-bar row) and the astrion2 profile got a full
measured skin block: transparent-cutout screen rect detected
programmatically (9.84/3.795/79.92/41.77 — his framing matches v1
almost exactly), 23 hotspots authored off a gridded overlay and
verified visually (wheel quadrants, rockers, transport row, color
bars). Suites re-run green on the new fixture.

## Current state (v0.84.1 RC, 2026-08-20 — the doctrine's FINAL FORM: the pad navigates, full stop)

Round 75 (b47). Field round 3's hybrid lasted one deploy: "I'm
still struggling…" → his own sentence closed it: "dpad should
always navigate the screen EXCEPT for the TV, where ChUp and ChDn
engage panel mode." The "transport" pad owner is DELETED — on
music the pad walks natively and OK always means the focused tile
(the hero's OK was already play/pause; the receiver-tile pause was
the bug that proved the mode wrong). Media work rides keys the
panel doesn't need, all engine defaults on music-shaped pages:
hold-◀/▶ seek ∓15s · hold-CH prev/next track · short CH section
jump (walks when nothing to jump) · menu → Library (stock gen 5,
short press; menu case now honors bindings). Strip is
passthrough-only again. astrion2 profile added (2026 faceplate:
F4–F7 = ⏮⏯⏹⏭, same keycodes) — prev/play_pause/stop/next drive the
running music from ANY page (mediaCtx falls back to the running
activity). The wake-lock story
resolved in the field: the launcher switch is out of the script
(home component varies by firmware; Fully can't be set as home via
adb anyway), and the measured culprit on OUR unit was the HA
Companion app's WorkManager lock (12h), not HaRemote — hardware-
keys rewritten measure-first with per-culprit remedies; NEVER pm
disable the stock app — it bricks; credit
marcusadolfsson/astrion-custom §4. probe-pad-latch
rewritten third time — green first run; smoke-music CH/hold/menu
stages updated; 20 suites errs-clean; studio 107/0; keys 23/0.

## Current state (v0.84.1 RC, 2026-08-20 — field round 3: the music pad flips to intuition)

Round 74 (b46). A day of real use overturned half the pad doctrine
on music: "My previous idea that dpad should always be the device
doesn't fit intuition." The music controller's pad now: ▲/▼ walk
the panel natively (and open the walk window — strip reads "OK
selects"), ◀ −15s · ▶ +15s · OK ⏯ at rest, and hold-◀/hold-▶ skip
to previous/next track (arriving as , and . — KEYCODE_COMMA/PERIOD
via KeyMapper long-press, default-keymap + backstop like the CH
holds; a page binding still wins, which is exactly how the stock TV
screen keeps REWIND/FF). While walking, the whole pad serves the
highlight — a grid needs its horizontal axis. Passthrough (TV)
keeps the full original doctrine, strip label "panel". probe-pad-
latch rewritten for the new shape (at-rest transport, native walk,
no-seek-while-walking, decay, TV holds silent) — green first run;
20 suites errs-clean, smoke-studio 107/0.

## Current state (v0.84.1 RC, 2026-08-20 — field round 2: the silent test and the cryptic hint)

Round 73. Blueprint v3: an Alert volume input (default 100%) — the
nag path sets the device's media volume before any channel sounds,
because a nag you can't hear is no nag; verified audible on CT. The
beep channel still waits on his restart to deploy the chirp. And the
capture-hint line ("▲▼ volume · select mutes · back releases") is
retired from view at his word — the amber capture ring carries the
mode alone; the machinery stays for a future teach-mode.

## Current state (v0.84.1 RC, 2026-08-20 — field round 1: the sticky banner and the shy strip)

Round 72 (b45). His first field reports, both fixed same-night:
Fully overlay banners persist until cleared, so the blueprint's new
RECOVERED trigger wipes the banner when the battery crosses back
above the warn level, and the Studio's new per-alert Test button
(fires every channel at the current level) cleans its own banner up
after a few seconds — the stuck "Battery 100% — charge me" was
cleared off his LCD live. The pad-borrow strip went from a whisper
to a bar: solid accent background, dark uppercase text, and the
window widened to a rolling 8 seconds with a config knob
(input.pad_latch_seconds). Blueprint v2 re-imported on CT; probes
extended; smoke-studio 107/0.

## Current state (v0.84.1 RC, 2026-08-20 — stamped and green; awaiting the field test)

Round 71. Version stamps: manifest + ENGINE_V 0.84.1, Studio
s0.84.1 b44. Both artifacts rebuilt on the stamps; the full battery
re-ran green on the RC bytes. What ships in his next deploy IS the
release candidate — field test, then commit → make-release → tag
v0.84.1 → GitHub release → HACS on .88.

## Current state (v0.83.11 pending, 2026-08-20 — battery alerts got a Studio face)

Round 70 (b43). His call: "It should live in studio." The Remotes &
keymaps slice — Code-tab-only until now — grew its visual editor:
remote-profile summary cards, and a Battery alerts panel that
discovers the blueprint automations live from HA and shows each one
with its current level, tier profile, window and channels, an
on/off switch that flips the automation in place, and the door into
HA's form for the numbers. The machinery stays HA-side (it must run
while the device sleeps); this is the Studio's face on it. Roadmap
0.84.2, his "at a maximum": create and edit the tiers in-Studio and
grow the slice into the full per-remote hub. probe-battery-studio
NEW; smoke-studio 107/0.

## Current state (v0.83.11 pending, 2026-08-20 — battery alerts: the HA-side blueprint, live on CT)

Round 69. The parked engine beeper's replacement, built as designed:
an automation blueprint on the Fully Kiosk integration's sensors —
tiered nags (deepest wins: 20%/60min · 10%/15min · 5%/5min), the
09:00–23:00 window, silent while charging, three optional channels
(beep URL / TTS / overlay banner), a rolling last_triggered
throttle. Works while the device sleeps; costs the remote nothing.
Field lesson: Fully's notifiers are notify ENTITIES — the blueprint
speaks notify.send_message, not legacy notify.<name> services. The
bundled chirp (the engine's 880→660 signature) ships in the
integration and deploys beside the skins. Installed live on CT and
verified: a forced run spoke and bannered the Astrion; the 5-minute
clock then correctly declined at 100%/plugged. Plus the release
collateral: GitHub issue templates and the v0.84.1 release-notes
draft.

## Current state (v0.83.11 pending, 2026-08-20 — four video tutorials, linked everywhere they answer a question)

His recordings: Installing via HACS (youtu.be/2E28x7pt36k), Watch
Fire TV activity (M75ZPYvorUM), Listen to Music activity
(vALzJylJLSw), Presets & Devices (lhVmuL7QHfs). Wired into README's
Quick start, GETTING-STARTED (install at the top, the other three at
the hand-off), the cookbook index, and the four matching guides.
Links verified live/public via oEmbed.

## Current state (v0.83.11 pending, 2026-08-20 — README hero is a .webp now)

His hand: `docs/media/astrion-tour.webp` (converted from the gif at
https://ezgif.com/, 2.1 MB → 0.6 MB) and README line 10 repointed.
No build script exists for it — after any tour reshoot, re-convert at
ezgif and drop the .webp in the same place. astrion-tour.gif and
hero.gif are now unreferenced and deletable.

## Current state (v0.83.11 pending, 2026-08-20 — THE PAD DOCTRINE: the pad drives the activity, CH walks the panel, walking borrows the pad)

Round 67 (b42; STOCK_MUSIC gen 4). The consistency question ("they
switch roles depending on the controller. It's jarring") closed with
his hybrid: the D-pad always targets the activity — TV nav on
passthrough screens, and on music the pad IS the transport (▲ next ·
▼ previous · ◀▶ ±15 s · OK play/pause; Up=Next was his call). CH
always walks the panel, holds take the big jumps — and any CH press
borrows the whole pad for a rolling 5 s: a thin pulsing strip at the
LCD's bottom edge (pointing at the physical pad below it) says the
panel has it; every press renews; Back, touch, or navigation return
it instantly; capture outranks everything. Room pages have no owner,
so the pad is the panel natively and the strip never shows — no mode
where there is no mode.

The doctrine SIMPLIFIED the config: music's seek hold-bindings
(gen 3's ch-holds and v0.54's left/right_hold) are struck — plain
◀▶ on the transport own seek now. Physical keys only, CAPS-gated
like passthrough, so desktop keyboards keep walking tiles.

probe-pad-latch.mjs covers the full contract on a physical_dpad
profile; smoke-music reworked; battery 20/20; smoke-studio 107/0.

## Current state (v0.83.11 pending, 2026-08-19 — 📷 round 3: the capture stops trusting re-layout)

Round 66 (studio-only; b41). His b40 screenshot still spread the
devices region downward until the bottom clipped. New probe compares
the capture against the live pixels: headless captures match within
3px — the drift is environment-specific (the clone re-lays-out
inside an SVG image, where his Windows font metrics / display
scaling differ slightly, and content-sized tiles compound the
difference down the page). Fix: snapPreview pins the live-measured
height of the banner, the grid and every grid child (inline
border-box min=max) for the capture's duration, restoring cssText
after — the clone renders inside boxes that cannot move. All snap
probes green; smoke-studio 107/0.

## Current state (v0.83.11 pending, 2026-08-19 — the CH flip: short CH walks the focus, holds take the big jumps)

Round 65 (STUDIO_V "0.83.11 b40"; STOCK_MUSIC gen 3). One field day
after the hold-CH round, the roles flipped — his call: "ChUp, ChDn,
navigate the LCD. Always. Hold+ChUp, Hold+ChDn on music controller
does RWD/FWD."

- **Short CH = the focus walk, everywhere.** CH▲ moves the highlight
  up — which also cures the "inverted" feel he reported (the old
  default, "next section", went DOWN the page on CH▲). The old short
  defaults became the HOLD defaults: ▲-hold = previous section/
  category (up), ▼-hold = next. Bindings win both, ladder unchanged.
- **Stock music controller gen 3**: track-skip CH bindings removed
  (short CH now walks focus there too); the holds are ±15 s seek.
  Houses heal via healStockGen on the next Studio load.
- **The keymap backstop.** A profile keymap replaces the default
  wholesale — every profile authored before the holds lacked `'`/`/`,
  so KeyMapper's keys arrived to nothing (his house included; his
  KeyMapper mappings, decoded from the pulled backup, were right all
  along and correctly Fully-scoped). boot.js now adds the two hold
  keys only-if-absent after profile resolution. Map docs regenerated
  with the new rows.
- **The D-pad fence**: ▲ can no longer land on the hero tab row —
  chips are touch/hold targets, not D-pad stops.
- **📷 round 2**: navigate frozen during capture too, and the grid's
  scroll-spy detached — zeroing the scroll used to release the tapped
  chip's pin (his DEVICES capture lit PRESETS). Pin and chip now
  survive the snap; churn capture pixel-identical.
- His #5 (volume steals the drag) is round-63's wireSlider not yet
  deployed to his engine — no code change; the tell is a vertical
  swipe starting on the track: new engine scrolls, old drags.

probe-ch-hold rewritten to the new contract; smoke-music rewritten;
battery 20/20; smoke-studio 107/0. NOTE: dist/config.json (the CT
fixture) was edited (gen-3 music controller + hold keys in profiles)
— fixture and his live config re-converge at his next config pull.

## Current state (v0.83.11 pending, 2026-08-19 — the scrolled 📷 fixed: the engine holds still for the capture)

Round 64 (studio-only; STUDIO_V "0.83.11 b39"). His attachment: scroll
the LCD preview, take the screenshot → a collage of the scrolled view
and the unscrolled one. Reproduced headlessly, then fixed:
html-to-image walks the live DOM asynchronously, and a WS diff in
that window runs renderStates — whose generated-tile signature check
escalates to a full navigate(), emptying #grid mid-clone; the
scroll→transform compensation (s0.83.8) dies with the detached nodes.
snapPreview now freezes the engine for the capture's duration
(same-origin no-op of renderStates / updateClock / fitBanner,
restored after with one catch-up render). probe-snap-scroll.mjs NEW:
churn injected mid-capture at field timing — pre-fix the capture was
the wrong view (mean px diff 5.01 vs the quiet snap); post-fix
pixel-identical. smoke-studio 107/0.

## Current state (v0.83.11 pending, 2026-08-19 — hold-CH moves the LCD focus; sliders stop stealing scrolls; the docs edit pass + reshoot shipped)

Round 63 (STUDIO_V "0.83.11 b38"; ENGINE_V/manifest unchanged). Born
from his Watch Fire TV report: "when volume has focus… I'm stuck with
it and trying to scroll the LCD often triggers the LCD buttons
instead", and his own answer — "make long press up and down control
the LCD?"

- **Hold CH▲/CH▼ = move the panel's focus** — new logical buttons
  `ch_up_hold`/`ch_down_hold` (keys `'` and `/`, both stock profiles
  + the engine default). Unbound default steps the screen's own focus
  (spatialMove); a Page-settings binding wins via the ladder (the
  Keys dropdown now offers CH + (hold)/CH − (hold)); short CH keeps
  its job everywhere (track skip, category paging, free on
  passthrough). One muscle memory across every screen — the design
  answer to "hold means the LCD" without losing track skip. HIS
  device step, not yet done: two KeyMapper long-press mappings
  (Channel Up/Down → KEYCODE_APOSTROPHE/KEYCODE_SLASH, Fully-scoped),
  then `pull-keymapper.bat` — recipe in hardware-keys.md.
- **Slider touch hygiene** — one shared `wireSlider()` intent gate
  (registry.js) replaces the four copy-pasted wire-ups (volume,
  stepper, grouping master + member rows). The old shape captured the
  pointer and JUMPED on pointerdown, so a vertical swipe that merely
  started on a volume track dragged volume instead of scrolling.
  Now: commit ~8px along the slider's axis to engage (same feel as
  before), across-axis movement belongs to the page scroll
  (`touch-action` none→pan-y; vertical cover tracks pan-x), a clean
  tap still sets on release, pointercancel sets nothing.
  probe-slider-touch NEW; probe-vol/stepper-vol/grouping
  payload-identical vs the pre-change build.
- **Docs edit pass shipped** — activities.md rewritten to the real
  tabs (Setup·Roles·Inputs·Actions·Controller·State), first-screen
  boot-view path, presets/theming dead links, hardware-keys Roles
  fix + §Hold-CH + the new studio-page-keys.png, screen-schema
  header reworked (Then/Now glossary, real v2 key list).
- **Reshoot** — engine stills + device composites + hero.gif +
  studio stills (b38 header) + studio-tour.gif regenerated from
  today's build; shoot-pagesettings.mjs NEW. astrion-tour.gif kept
  (Aug-13; no machinery, look unchanged).
- **Battery beeper PARKED** (his call: Fully sleeps at 60s → webview
  timers suspend exactly when the nag matters). Engine wiring fully
  reverted, byte-verified; battery.js + its green probe stay
  container-only as reference. Proposal on the table: HA-side
  blueprint on `sensor.astrion1_battery` + plugged sensor +
  Fully media_player beep — works while the device sleeps.

Battery 20/20; smoke-studio 107/0; 35 files shipped, rolled-md5
parity.

## Current state (v0.83.11 pending, 2026-08-17 — map docs GENERATED from data.json; README gives the remote story airtime)

His pair while testing the ladder:

- **gen-map-docs.py NEW** (remotes/keymapper/astrion/): the map .md
  and .xlsx rotted twice when hand-maintained — now they REGENERATE
  from data.json (the KeyMapper backup is the truth, the docs are
  its rendering). Parses keymap_list + groups: the regenerated table
  showed the REAL device state — F8→Fully, F9→File Manager (not the
  old HA-companion/Fully rows), browser on F11 LONG-press, menu
  emits `#` (the old hand-written `9`/KEYCODE_9 was simply wrong —
  18 is KEYCODE_POUND), and a Scope column proving his design:
  launchers global, everything else in group "FullyKiosk"
  (app-foreground constraint). data.json + key_mapper.zip in the
  repo refreshed from the device (auto-backup, current today).
- **README §Putting it on a hardware remote rewritten** (his: "we
  don't give the Astrion/setup and KeyMapper enough airtime. Without
  it, the project is compromised"): leads with the out-of-the-box
  KeyMapper profile — 3 numbered steps: community-guide hardware
  prep (stop before manual remapping), setup-remote.bat +
  push-keymapper.bat → ⋮ Restore (manual alternative =
  astrion-remote-map.md + the guide's screenshots), then Fully →
  pair → hardware-keys cookbook.

## Current state (v0.83.11 pending, 2026-08-17 — custom keys BINDABLE + the binding ladder)

His correction + addition in one round: "Page Settings>>>Keys doesn't
offer those buttons" (the nicety became the feature) and "there
should be an apply to children toggle". Engine + Studio; STUDIO_V
b37; ENGINE_V/manifest stay 0.83.11.

- **Keys dropdown offers custom buttons** (PageSettings.svelte):
  BIND_KEYS is now derived — the fixed seven PLUS every custom
  logical button any remote profile's keymap emits (engine-owned
  names curated out; `_hold` bases checked). The glyph row shows up
  as Light/Cover/Music/Climate, point-and-click bindable.
- **THE BINDING LADDER** (engine, input.js): the three
  `global.buttons + screen.buttons` merge sites became ONE
  `boundButtons()` — global → inheriting ANCESTORS (farthest first,
  nearer wins) → the screen's own. `buttons_inherit: true` on a page
  offers its bindings downward: children climb their `parent` chain;
  controllers and virtual screens (no place of their own) HOP to the
  running/presumed activity's room. TWO honesty rules landed via the
  probe: a parentless PLAIN page is a root (the hop is only for
  controllers/virtual — child2 of a non-inheriting room must NOT
  inherit through the running activity), and on a virtual screen the
  chain's first entry is an ANCESTOR (opt-in), not "own".
- **Studio toggle**: "Apply to children" Switch in Page settings →
  Keys writes/deletes `buttons_inherit`.
- **Probes NEW**: probe-glyph-keys (engine: own fires / child
  inherits / child's own wins / controller hops to room / non-inherit
  stays opt-in — 6 stages) + probe-bindkeys-studio (dropdown offers
  the four, binding re-keys to light, toggle saves buttons_inherit).
  Battery 20/20; keys/music/v2/nav payload-IDENTICAL vs pre-ladder
  engine (no config sets buttons_inherit → zero behavior change
  until opted in); smoke-studio 107/0; tabs probe green.
- Docs: screen-schema §Hardware buttons (four layers now),
  hardware-keys glyph-row section rewritten. KNOWN GAP (minor): the
  preview's key WASHES read only the current screen's buttons —
  inherited bindings don't wash on children yet.

## Current state (v0.83.11 pending, 2026-08-17 — the glyph row wired: F4–F7 = light/cover/music/climate)

His bottom-row question ("4 buttons… trigger F4, F5, F6, F7 — what
would be good keys to map them to?") — answered by the hardware
itself: the row's printed glyphs are 💡 lightbulb / curtains / ♪ /
climate (it sits above the colored keys, which are his F8–F11 app
launchers). Design: **no KeyMapper at all** — F-keys reach the
webview raw (F1=home proved it), so the astrion profile simply names
them `light`/`cover`/`music`/`climate`, matching the skin's hotspot
ids (the photo preview lights them up the moment keys emit them).
What they DO is Studio-bound per house (screen.buttons /
global.buttons — custom names via the Advanced/Code path today;
suggested: music → Music Library, others → domain page / scene /
detail:<entity>). Also caught up with his device-side reality:
F7's browser launcher is GONE (he removed it — map doc + xlsx rows
refreshed, incl. the Back/F1 long-press rows → Android actions);
his scoping confirmed: launchers global, everything else
Fully-in-foreground. starter-config astrion keymap +4 (F4–F7);
FUTURE nicety (unbuilt): HubEditor's Key-bindings dropdown offers a
fixed list — could offer the profile's custom buttons too.

## Current state (v0.83.11 pending, 2026-08-17 — hold-back/home RETIRED on the Astrion; his Fully-scoped hatch)

Follow-up decisions on the stranded-keys hatch (his questions):

- **"Do we use long-press back/home?"** — we DID: KeyMapper Back/F1
  long-press emitted `]`/`;` → `back_hold`/`home_hold` → forward the
  DEVICE's back/home to the control target (input.js hold roles).
  Verdict (his call: replace/kill): **retired on the Astrion** —
  redundant on controller screens (short back/home already
  pass_through) and not worth the stranded-in-Fully-settings cost.
  Starter config's astrion keymap dropped the four stale entries
  (`]` `;` `{` `}` — a surgical 4-line diff, tail preserved); the
  ENGINE mechanism stays (default profile's `{`/`}` + smoke-nav /
  smoke-v2 exercise it; power_hold `=` → All Off untouched).
- **His scoping** (better than the global suggestion): the two
  Android-action long-presses are constrained to **Fully in
  foreground**; doctrine documented — launcher F-keys stay GLOBAL
  (they're the road back to Fully from any other app).
- astrion-remote-map.md rows updated (Back/F1 long-press → Android
  Go back / Go home w/ constraint + a dated note); hardware-keys.md
  §Back/Home OUTSIDE Harmonium rewritten with the decision. His
  device-side steps done by him; next pull-keymapper refreshes the
  zip. test-integration-split still 12/12; starter parses clean.

## Current state (v0.83.11 pending, 2026-08-17 — remote-provisioning round: rotation lock, KeyMapper backup truth, the stranded-keys hatch)

Three field findings from his Astrion session, all scripts/docs (no
engine/studio change):

- **setup-remote.bat NEW** (his ask): one-time Android prep — locks
  display rotation to portrait (`accelerometer_rotation 0` +
  `user_rotation 0`; the accelerometer otherwise flips the kiosk
  when the remote is picked up). Same adb prologue as the keymapper
  scripts; GETTING-STARTED §5 now leads with it; scripts.md row.
- **KeyMapper backup flow corrected** (what actually works on the
  box): ⋮ → Export all is a dead end — the share sheet offers no
  save-to-files target and jumps straight to the Bluetooth picker.
  The working door is **Settings → Change automatic backup location
  → Download**, after which KeyMapper rewrites the backup on every
  mapping change — no manual export step ever again.
  pull-keymapper.bat now pulls only the NEWEST `*key*.zip` and
  saves it under the stable name `key_mapper.zip` (the save dialog
  suffixes "(2)"/"(3)" instead of overwriting; suffixed names never
  enter the repo — git is the history). Device-side dupes are left
  alone by his choice (he tidies with the remote's File Manager).
- **The stranded-keys hatch documented** (his: back/home "don't do
  anything" outside harmonium; Fully's settings sheet = stuck): the
  Astrion's Back/Home emit `[`/`]`, which Android doesn't speak —
  only the engine does. hardware-keys.md gained "Back/Home OUTSIDE
  Harmonium": KeyMapper long-press mappings ([ long → Go back,
  ] long → Go home) — long-press so short presses still reach the
  engine; caveat re engine-side hold variants; re-pull the backup
  after. (Device-side mappings are HIS step; docs carry the recipe.)

## Current state (v0.83.11 pending, 2026-08-17 — hero-chip jump fixed: pinned highlight, no ancestor scroll)

His preview find ("If I Click presets the entire remote scrolls
down, presets is not selected (devices is)") — two engine bugs in
one tap, both long-standing:

- **The pane slid** because `heroGo`/`setFocus` used
  `scrollIntoView`, which propagates to every scrollable ancestor —
  ACROSS the preview iframe into the Studio pane's scroller (the
  v0.83.7 clip guard only protects the clip). New `gridScrollTo(el,
  mode)` scrolls `#grid` by hand — one scroller, full stop; the
  engine now contains no `scrollIntoView` at all, so no embedding
  can be scrolled by it.
- **DEVICES lit instead of PRESETS** because a short page can't
  bring the tapped section to the top: the jump bottoms the grid out
  and the spy's bottom rule lights the LAST chip. Now the tap PINS
  its chip (`S.heroPin`) for as long as the scroll stays where the
  tap left it; a real scroll releases the pin and the spy — bottom
  rule included — takes over. Tapping also seeds `S.heroAt`, so
  CH▲▼ stepping continues from the tapped section.
- **probe-hero-chips.mjs NEW** (CT fixture, Porch): tap Presets →
  Presets active + grid scrolled + body/window unmoved + first
  preset focused; pin survives spy re-runs; scroll-away releases to
  the spy; bottomed-out grid honestly lights Devices; tap Activities
  returns to the top. Battery 20/20; nav/music/keys/present/libui
  payload-diffed vs the pre-fix engine — IDENTICAL.

## Current state (v0.83.11 pending, 2026-08-17 — SPLIT ROUND 2: "everything left")

His pick via AskUserQuestion: **everything left** on the big-file
queue, behavior-preserving. Six slices, each verified before the
next; committed baseline `3dc4cba` was the safety point. STUDIO_V →
0.83.11 b36; ENGINE_V/manifest stay 0.83.11 (same pending cycle);
deploy note unchanged from round 1: **.py from round 1 already
pending → HA restart at next deploy**; this round adds engine +
studio only (`build-push` covers it).

- **SetupTab 1,077 → 833**: the ⚙ presentation panel →
  `activity/PresPanel.svelte` (175; the owner keeps the open/close
  state machine — editPres backfill and close-sweep contracts intact)
  and the unified cast picker → `activity/CastPicker.svelte` (100).
- **state.svelte.js 1,672 → 1,046** + four satellites, with state
  re-exporting so components keep ONE import door (the stocklib
  pattern): `worlds.svelte.js` (295 — roster CRUD, switchWorkspace
  with its draft stash, export/import incl. the ImportDialog resolve
  flow), `registry.svelte.js` (170 — loadEntities/Registry/Services +
  the ⊞ seeder), `pairing.svelte.js` (147 — pair admin + version
  check), `snippets.svelte.js` (74).
  - **TWO TRAPS CAUGHT** (both by verification, not review):
    (1) the ESM cycle evaluates satellites BEFORE state — pairing's
    module-level `pollPairs()`/`loadVersion()` kick-offs became TDZ
    crashes on `token`; deferred one microtask (nothing observable
    moves — the fetches were async anyway). Rule now in ARCHITECTURE:
    satellites touch state bindings only inside function bodies.
    (2) `WS_API` stayed behind in state while its only users moved —
    Svelte compiles unknown identifiers as globals, and resolveImport's
    try/catch swallowed the ReferenceError: **probe-import's semantic
    payload caught it** (newWs.calls 0). Moved to worlds; then EVERY
    studio probe was payload-diffed against the committed baseline —
    all IDENTICAL modulo the version stamp. `errs: []` alone is not a
    pass signal; compare payloads.
- **PreviewPane 991 → 440**: the two remote faces are children under
  `preview/` sharing a `pv` context — `SkinPreview.svelte` (390 —
  photo skin, ✎ map-keys machinery, skew tripwires, its own
  svelte:window keydown) and `SoftRemote.svelte` (123 — plain frame +
  soft grid + layout editing); `preview/lib.js` (99 — BTN_DEFS,
  DEFAULT_LAYOUT, the measured SKIN_ASTRION, PASSTHRU_SET,
  actionDesc). `mapping`/`editing` hoisted to the pane (the footer
  drives them, bindable down); the engine iframe is owned by whichever
  face renders and handed up via pv.setIframe (↻ and bindPreview
  unchanged). skin/stretch probes payload-identical.
- **HubEditor 797 → 562**: the Layout/Keys/Advanced panel + key-
  bindings machinery → `editors/PageSettings.svelte` (261, needs only
  screenId). **TileRow 779 → 622**: the preset editor →
  `components/PresetFields.svelte` (143), pure type/icon vocabulary →
  `components/tile-lib.js` (40).
- **ENGINE: generators.js 766 → 258 + gen-bands.js (338) +
  gen-cast.js (216)**: the giant if-chain `expandTile` became a
  type-keyed dispatch (`TILE_GENERATORS`); page generators stay,
  controller-band generators (volumes/presets/speakers/groups) →
  gen-bands, the cast vocabulary + srfOff → gen-cast.
  **build-engine.mjs SCRIPTS gained the two files** (51 scripts).
  Verified the strong way: battery 20/20 errs-clean AND 12
  generator-heavy suites (present/v2/devices/workspaces/googletv +
  wake/vol-ux/grouping/group-loose/grouping-loose/speaker-groups/
  stepper-vol) payload-diffed against the committed engine —
  **12/12 IDENTICAL**.
- Post-round checks: smoke-studio 107/0 on b36; probe-activity-tabs,
  probe-apps-grid, probe-nogap green. ARCHITECTURE file maps updated
  (state satellites + TDZ rule, preview/card children, engine
  generator trio). Remaining >500-line files (all cohesive, no urgent
  splits): SetupTab 833, state spine 1,046, ActivityCard 411 is done,
  screen-schema.md/PROJECT.md are docs.

## Current state (v0.83.11 pending, 2026-08-17 — THE BIG-FILE SPLIT: ActivityCard + __init__.py)

His ask after committing v0.83.10: "Big lift now is getting those
huge code files into manageable world class code." Scope agreed via
AskUserQuestion: **the big two, behavior-preserving** (mechanical
splits, no logic changes; polish = structure and headers only).
Deploy note: `.py` changed → **HACS/copy + HA RESTART** on next
deploy; manifest + ENGINE_V → **0.83.11** (first integration change
after the v0.83.10 tag); STUDIO_V → 0.83.11 b35.

- **ActivityCard.svelte 2,513 → 411 lines** + seven files under
  `components/activity/`: SetupTab (1,077 — the cast, picker, groups,
  ⚙ presentation panels, snippets, ＋ page mint), ControllerTab (380 —
  bands, label slots, presets), RolesTab (204), ActionsTab (212 — the
  generators), StateTab (195), InputsTab (64), lib.js (57 — the shared
  role vocabulary). The spine keeps identity strip, tab bar +
  completion dots, cast/wiring derivations, preview impersonation,
  delete/rename; each tab receives ONE `card` context object (getters
  over the shared $deriveds + the cross-tab verbs). Every moved block
  extracted VERBATIM by line range from the pristine file.
  - Dead pre-cast-era code dropped (grep-proven zero references):
    devicesOn/toggleDevices, newDev/addDevice/removeDevice/
    setPrimary/toggleRole/ensureDevices, CTX_SLOTS, rawOpen.
  - ONE new lifecycle: tabs unmount on switch now, so transient tab
    UI state (picker query, open panels) resets — and SetupTab sweeps
    an open ⚙ panel on the way out ($effect teardown → closePres),
    or the editPres backfill (name:"", sub:"") would persist as
    intentional blanks. probe-activity-tabs asserts the round-trip.
  - **probe-activity-tabs.mjs NEW**: walks all 7 tabs of a real card
    (signature content + zero pageerrors — the net for Svelte's
    unknown-identifiers-compile-as-globals trap), opens a ⚙ panel,
    switches away, saves, asserts a.present unchanged vs fixture.
- **__init__.py 930 → 266 lines** + three modules: `store.py` (126 —
  json/text helpers, deploy-dir migration, HarmoniumStore, engine
  fingerprint), `api.py` (362 — the four HTTP views + validate_config),
  `services.py` (255 — run/reseed/restore_backup/set_activity behind
  register_services(hass, hstore, entry_data, mint) + remove_services).
  Handler bodies verbatim; helpers that now cross module boundaries
  lost the underscore (validate_config, engine_fingerprint, read_json,
  write_json, write_text, migrate_deploy_dir).
  - **tests/test-integration-split.py NEW** (plain python): stubs HA,
    imports every module for real, validates the CT fixture clean +
    catches a broken config, exercises _bind_ws stamping and the
    register/remove service wiring — 12/12.
- **Verified end to end**: vite build green; smoke-studio 107 true /
  0 false; ALL studio probes at baseline (ctrltab, import, spkgroups,
  stock-heal, virgin, collapse, band-order, volstyle, upload);
  engine battery 20/20 errs clean; probe-vol-ux / nogap / wake at
  baseline. ARCHITECTURE (integration file map + card-spine note),
  tests/README (probes section) updated.
- Remaining large files (documented, next candidates): SetupTab
  (1,077 — cohesive, but PresPanel/CastPicker could peel off),
  state.svelte.js (1,673 facade), PreviewPane (991), HubEditor (797),
  TileRow (779), generators.js (766).

## Current state (v0.83.10 pending, 2026-08-17 — the punchlist round: volume truth + mute + doc hygiene)

His morning punchlist (`archive/docs/status-review.md`, 7 items), all
executed. Engine + manifest → **0.83.10** (first change after the
v0.83.9-Beta tag). Deploy = `push-engine.bat` only — no `.py` changed,
no HA restart owed.

- **#1 VOLUME JUMP-BACK FIXED** ("It jumps forward like 5pts and then
  jumps back like 3"): the tap was optimistic +5% but the device's real
  step is smaller, so the HA echo yanked the display back. Now
  `volume.js` holds the optimistic value per level-entity for 1800ms
  (`VOL_OPT`) — a disagreeing echo inside the window is noted but NOT
  shown; at lapse, truth is adopted. The disagreement also TEACHES the
  device's real step (`VOL_STEP` = |echo − truth₀|/taps, clamped
  0.005–0.12), so the second tap onward moves by the device's actual
  increment. Feels accurate after one echo.
- **#7 MUTE, twice over** ("In a browser, Mute is a problem"):
  (a) clicking the volume tile's speaker ICON now toggles mute
  (optimistic glyph flip + `volume_mute`); (b) the mute KEY is
  focus-aware — a focused volume tile (or volume-kind stepper) wins
  over `$context.volume`, so with the Receiver tile selected, mute
  hits the receiver; unfocused it hits the Volume role. Fixing this
  exposed an engine bug: `trailBase()` mangled non-trail ids — now
  strips only when the id actually ends with the trail suffix.
- **probe-vol-ux.mjs NEW** — drives both: optimistic 45% → echo 42%
  ignored during hold → 42% adopted after → next tap 44% (learned 2%
  step); icon-click mute call+glyph; focused-mute targets the
  receiver, unfocused the role. Green; battery 20/20.
- **#6 docs/scripts.md NEW** — all ten root `.bat`s + build scripts
  tabled (daily drivers / backups / build); verdict: none redundant
  (pull-config takes a named house, pull-my-config the default;
  push.bat is the guarded engine under the family). CONTRIBUTING
  links it.
- **#3 KeyMapper in GETTING-STARTED §5** — "skip the button-by-button
  setup": his unpacked `remotes/keymapper/astrion/` (zip + md map +
  xlsx) documented; `push-keymapper.bat` → KeyMapper ⋮ → Restore.
- **#2 beta-gaps refreshed** — new Status block (2026-08-17): beta is
  LIVE on .88, P0 trio struck through as SHIPPED (pairing v0.81, HACS
  v0.83.4, docs v0.83); open items now honestly: mute hardware overlay
  (§6.6), volume_step trait (§6.5), section folding (§6.8).
- **#4 purpose/audience stamps** — every live doc now opens with
  *Purpose: … Audience: …* (~30 files: CONTRIBUTING, SECURITY, docs/*,
  the whole cookbook, houses/README, tests/README). Files never
  touched this session were re-staged FRESH from the device first
  (the stale-mirror trap, §HANDOFF).
- **#5 Group Players docs**: verified already covered —
  creating-an-activity §8 has the Speakers/groups walkthrough from
  the v0.83.7 rounds; no gap found.

## Current state (2026-08-17 — THE CLEANUP, overnight, s0.83.9 b34)

Suresh: "We need to clean up the project… Lets make this a world
class repo." Executed overnight; **nothing deleted — everything
retired moved to `archive/` (tracked) or `_to_delete/` (scratch).
He commits in the morning (`git add -A` detects the renames).**

- **archive/ created** (with a README index): the whole `yaml/`
  authoring era incl. `build.mjs` and his workspace extracts ·
  `config-v1/` (the frozen v1 config) · design history (Studio
  redesign brief+mocks, the external design handoff, both library/
  search design docs, google-tv research, pasted-image scratch) ·
  retired docs (authoring-ui, config-guide, wizard, cookbook-v1,
  status-review, todo-remote-pairing, ha-activities-v1) · session
  dumps (~70 MB) · `images/` source art (~140 MB incl. the topaz
  upscales). NOTE: archiving does not shrink clones — that needs a
  git history rewrite (the harmonium-alpha maneuver), proposed, not
  done.
- **build-engine.mjs is self-contained** — STYLES/SCRIPTS lists live
  in it now (byte-identical output verified); `build.mjs` retired;
  tests/run.sh repointed.
- **PROJECT.md split**: pre-v0.83 changelog (5,272 lines) →
  `archive/docs/project-history.md`; the living doc is 1,263 lines.
- **Docs refreshed**: README (cookbook table synced incl. the
  deep-dive/remote-map/wipe rows, status paragraph now v0.83.9-era,
  dead cookbook.md pointer replaced with screen-schema),
  CONTRIBUTING (archive paths, retired-build note), ARCHITECTURE
  (Studio-owns-config diagram, current API list incl. upload +
  workspaces + pairing, truthful state-layer description, legacy
  compiler section dropped), cookbook README, HANDOFF (§1/§2/§5
  archive pointers, docs map rewritten), new `ha/README.md`
  (firetv-on.json documented; v1 reference archived).
- **STATE LAYER SPLIT (the "no file is too large" pass)**:
  `studio-src/src/lib/stocklib.js` NEW — the pure half (5 stock
  shapes + gen counters, healers, starterConfig, the whole
  normalize* chain; ~770 lines, zero reactive-state references,
  workspace passed as a parameter). `state.svelte.js` 2,290 → 1,673
  lines, re-exporting from stocklib with thin wrappers so every
  component import is untouched. Verified: vite build + smoke-studio
  106/0 + probe-import / upload / spkgroups / ctrltab / collapse /
  virgin / stock-heal all green; engine battery 20/20.
- **Not executed (recommendations for a supervised round)**:
  ActivityCard.svelte (2,513 lines) split into per-tab child
  components; `__init__.py` (930) → api.py/views split; git-history
  rewrite to actually shrink clones of the big archived media.
- STUDIO_V → 0.83.9 b34 (build changed, behavior identical).

## Current state (v0.83.9 TAGGED as v0.83.9-Beta, 2026-08-16 — dialect WAKE, s0.83.9 b33)

Suresh pushed the release as **v0.83.9-Beta** — note the tag string
does NOT equal manifest "0.83.9" (the releasing.md exact-match rule);
if HACS shows a phantom update after install, retag as plain
v0.83.9. If it was marked pre-release, HACS needs Redownload →
pick-version to see it.

v0.83.8 TAGGED and released; this opens 0.83.9 (manifest + ENGINE_V
bumped; his call via the version question).

- **DIALECT WAKE BEFORE APP LAUNCH** (his: FireTV app presets while
  the box dozes — "it actually does the app change but screen
  remains blank or screen saver. I find the back button works"):
  a dialect may declare `wake` — `"key:<id>"` borrows an entry from
  its OWN keys catalog (his case: `wake: "key:back"`), anything else
  rides the classLaunch grammar — plus optional `wake_delay` ms
  (default 600, TIMING.wakeDelay). The apps generator stamps the
  resolved action on every launcher tile; firePreset gates on the
  player's REPORTED state at tap time (off/idle/standby/unavailable/
  unknown) → fire wake, wait the gap, then launch. An awake player
  is never poked (a stray Back could back out of a running app);
  a dialect without wake behaves byte-for-byte as before. Studio:
  the dialect card grew "Wake before launch" + "Wake → launch gap"
  fields (JSON accepted for arbitrary actions). probe-wake.mjs NEW:
  asleep → BACK then Netflix 401ms later · playing → launch only ·
  wake-less dialect → launch only.
- To USE it on CT: Model → Apps & dialects → your firetv dialect →
  Wake before launch = `key:back` (its keys catalog already has
  back) → Save & Deploy. **Engine + .py untouched-restart: engine
  push only — no HA restart for this round so far.**

## Current state (v0.83.8 SHIPPED, 2026-08-16 — image upload + the Poster + apps 2-up + import chooser, s0.83.8 b32)

- **PREVIEW TOOLTIPS NAME THE PHYSICAL KEY** (his: "On Astrion
  hover, show Physical Key info -- i.e. F1, F11 where applicable"):
  every soft key / photo hotspot title now carries `key ‹F1›` from
  the reverse-keymap lookup, and the hold variant names its key too
  (‹› quoting because the Astrion's back/home keys ARE "[" and "]").
- **THE CREATE-GROUP DOOR GOT ITS RETURN TRIP** (his: "I don't get
  the return to Activity option"): Model → Speaker Groups now shows
  the same "← back to <page>" chip the Actions door has, whenever
  you arrived from a room page — one tap back to the activity card.
- Console noise triage (his paste): the "BT UI: … is loaded use the
  other" flood and the button-card double-define DOMException are
  OTHER HACS frontend cards (better-thermostat-ui-card ×
  universal-remote-card, button-card) — HA loads every Lovelace
  resource on every panel including ours, so they appear under
  harmonium-studio:1. Not ours; nothing to fix in Harmonium.
- OPEN (design agreed pending his answer): app-launch WAKE — a
  dialect-level `wake` entry the engine fires before an app launch
  when the context player reports off/idle/standby.

- **IMPORT ASKS WHERE (his: "When I import a workspace it overrites
  main. It should give the choice … we don't allow the import of the
  full workspace (it should, and which workspaces to import)")**:
  Import now parses the file and opens a DESTINATION dialog instead
  of stomping the current draft. Single config → into this
  workspace's draft (safe default; Save & Deploy to keep) · replace
  another workspace (stored + deployed immediately, labeled in red)
  · a new workspace. Whole-house bundles (the "All workspaces"
  export) are now importable: a tick-list per workspace — existing
  ids replaced, missing ids created (server create-with-config;
  freed stamped ids keep their address). Single exports now carry a
  **`_workspace: {id, name}` stamp** (his "we don't actually store
  the workspace name in the json, which is a mistake") — stripped on
  import, used to preselect the right destination ("this file is
  deck" → replace deck). ImportDialog.svelte NEW; probe-import.mjs
  NEW (unstamped single → dialog + create · stamped single →
  replace-deck preselected · bundle → 1 replaced + 1 created ·
  export stamp). workspaces.md documents the doors.

- **UPLOADS MOVED OUT OF THE WIPE ZONE (his call: "Are you sure we
  want our uploaded hero images inside harmonium?")**: hero/banner
  uploads now land in **www/images/ (/local/images/…)** — the
  house's own picture folder, outside the integration's deploy tree,
  which the wipe doc deletes wholesale. Device-photo skins stay at
  www/harmonium/skins/ (Harmonium furniture; re-upload after a
  wipe — wipe doc updated to say both halves out loud). .py changed
  again — same restart covers it.
- **POSTER: ~12px SHORTER** (corrected read — his clarification:
  "the Poster panel was too big, pushing the transport down so it
  got clipped. The Poster needs to be 8-12px shorter"; the artless
  shrink was always fine): pad 4→2, art/progress margins 12→8,
  trail 12→10 — with-art card 505→493px, transport fits above the
  fold; artwork itself untouched; an artless card shrinks naturally
  (the briefly-built placeholder/constant-size machinery is
  REVERTED — misread). probe-np-poster asserts trimmed ≤496 + bare
  shrinks + no placeholder.
- **STAMP CONVENTION** (his: "Why is it 0.83.30 when my release
  seems to want to be 0.83.8?"): STUDIO_V is now
  `"<release> b<n>"` — the footer reads **s0.83.8 b31**, release
  first, per-build fingerprint after (the counter continues the old
  line and never resets). releasing.md documents it.
- STUDIO_V → **0.83.8 b31**; battery 20/20; smoke-studio 106/0;
  probe-nogap / probe-apps-grid / probe-upload-studio /
  probe-import green.


v0.83.7 tagged and live on .88 (virgin install passed); this round
opens 0.83.8 (manifest + ENGINE_V bumped). **The .py changed — the
deploy needs an HA restart.**

- **STUDIO IMAGE UPLOAD (beta-gaps P1 #7 — SHIPPED)**: authenticated
  `POST /api/harmonium/upload` in the integration (multipart; kind
  image|skin; 8 MB cap; png/jpg/webp/gif whitelist + magic-byte
  sniff; slugified name; tmp+rename write; **409 on an existing name
  unless overwrite** — a user's picture is never silently replaced)
  lands files under www/harmonium/images/ (skins/) and returns the
  /local/… path. Studio: UploadBtn.svelte — a 📤 button that is also
  a DROP TARGET — on the Hero banner Image field (fills the field,
  marks the draft) and in the skin map toolbar ("photo…", repoints
  skin.image). The 409 path confirms then retries with overwrite.
  probe-upload-studio.mjs drives the real drop → 409 → confirm →
  overwrite → field filled.
- **NOW PLAYING "POSTER" (his found-in-the-wild screenshot: "I think
  we build this. With a Bar underneath for the Library")**:
  np_style "poster" — stacked big centered artwork (72%, square,
  rounded), title/artist/album centered under it, a REAL progress
  bar with the 0:36 / 4:19 clock (new npClock; the shared 1s ticker
  now walks .poster too), and the chassis trailing restyled as a
  FULL-WIDTH bar named after its destination (trlbl reads the
  target screen's name — "Music Library", "Apps"). No transport, no
  volume — those are bands. Same render() slots as the heroes, only
  the geometry differs. probe-np-poster.mjs green (incl. the
  ticking clock).
- **"Art wash" HIDDEN from the NP select** ("I think we can hide
  the Art Wash option") — the engine still honors wash and a config
  already on it shows "Art wash — full-bleed (legacy)" so the
  select never lies; it's just not offered fresh.
- **APPS GRID 2-UP** ("lets make this grid 2 x 2 (bigger tiles,
  text) and get the alignment right"): STOCK_APPS_DRAWER →
  grid.columns 2, **gen 2** (healStockGen upgrades house copies on
  next Studio load); GENERIC_MEDIA_CONTROLLER's Apps section
  likewise (gen 2); starter-config.json patched. The apps generator
  stamps cls "app" so ONLY app launchers grow: 38px glyph / +10px
  art, 14px label, min-height 96, centered. probe-apps-grid.mjs
  asserts the true 2×2.
- **THE STRETCH, ROUND 3 (it recurred ON s0.83.26)**: the live
  imgW measure fixed X but Y was still COMPUTED (imgW × natural
  aspect — imgNat is one more stale-able input). Now the iframe
  scales each axis to the CLIP BOX'S OWN measured size
  (bind:clientWidth/Height on the aperture div) — the transform
  can no longer disagree with the layout it lives in. Plus the P1
  #9 capture protocol automated: any >2% anamorphic skew
  console.warns every input (sx/sy/clip/imgNat/rect/viewport).
- **P1 #9 SOLVED — THE OVAL WAS `html.nogap` ALL ALONG** (his
  DevTools dig: `html.nogap .trow > * + * { margin-left: 26px }`
  live on modern Chrome; play button 84×84 in CSS, 71×84 drawn;
  killing either the margin or the gap cured it). Chain: the
  flex-gap compat probe (boot.js) measured two zero-height divs and
  read `scrollHeight === 1` as "supported" — but an iframe inside a
  display:none subtree gets NO LAYOUT, scrollHeight 0, so the
  engine booting behind a hidden preview pane (hard-refresh path)
  concluded "no flex gap" and latched `nogap` forever. compat.css
  margins then stacked ON TOP of the working gap, the transport row
  overflowed, and the un-guarded circle squashed. ↻ reloads with
  the pane visible → probe reads right → "fixes itself". Why the
  Studio transform was always exonerated-then-suspected: the skew
  really was 0 — the stretch lived INSIDE the engine. Fix: the
  probe's divs get real heights so the states are distinguishable
  (3 = gap works · 2 = genuinely ignored · 0 = no layout yet →
  RETRY until layout exists, never guess); insurance: `.trow
  .dpbtn/.trbig { flex: 0 0 auto }` — a wrong nogap may overflow
  the row but can never make the circle oval. probe-nogap.mjs NEW
  (direct boot · hidden-boot-then-reveal · forced-nogap circle
  guard); battery 20/20. The skew strip stays as a tripwire.
- **THE SKEW STRIP (s0.83.28 — "Still oval. No warnings in log")**:
  he confirmed s0.83.27 AND the oval after a hard refresh (↻ cures
  it), console clean — so the diagnostic moved ON SCREEN. A red
  strip renders under the photo whenever the engine's scale is >2%
  anamorphic, from TWO independent measurements: "bound" (the
  clipW/clipH the transform uses) and "drawn" (the iframe's real
  getBoundingClientRect box, sampled 1/s — catches a lie from ANY
  input). Oval WITH the strip → the numbers on it name the guilty
  input. Oval WITHOUT the strip → the transform is uniform and the
  stretch lives upstream (photo/pane/compositor), a different hunt.
  Headless sanity: silent at the true rect (0.77% — the known
  rect-vs-viewport delta), loud on a rigged aperture (40.1%, both
  measurements agreeing). Also learned: probes measuring preview
  geometry must LEAVE the Workspace-map slice first — the pane is
  display:none there and every rect reads 0.
- STUDIO_V → **0.83.28**; battery 20/20, smoke-studio 106/0,
  probe-np-poster / probe-apps-grid / probe-upload-studio NEW,
  regression probes at baseline.

## Current state (v0.83.7 TAGGED, 2026-08-16 — KeyMapper landed, release prepped)

- **KeyMapper scripts, battle-tested on his machine**: three field
  bugs found and fixed in one sitting — (a) the empty-arg dot test
  (`echo %~1` prints "ECHO is on." — WITH A DOT — sending the bare
  run hunting a blank :5555); (b) `for /f ('command')` cannot launch
  a space-quoted adb path ("The system cannot find the path
  specified") → temp-file listing + Windows-side findstr; (c) the
  filter said "keymapper" but the real export is **key_mapper.zip**
  → loose *key*·*.zip match. Final shape: USB-FIRST (bare run uses
  the plugged-in device; IP only for adb-over-wifi), adb ships in
  the repo (tools/adb, three files, committed), push verifies the
  zip landed. hardware-keys.md §Backing up KeyMapper rewritten.
- **docs/release-notes-v0.83.7.md** written — paste into the GitHub
  release. make-release.bat confirmed current (studio build → engine
  build → engine bundled into the integration; publish = commit +
  tag matching manifest, no assets).
- Release steps handed to Suresh (see the chat / HANDOFF): pull
  KeyMapper zip + commit → make-release.bat → commit/push → GitHub
  release tag v0.83.7 → HACS update on .88 + restart + virgin
  sanity (volume keys!) → .87 restart for the .py changes.

## Current state (v0.83.7 pending, 2026-08-16 — the stretch pinned + KeyMapper portability, s0.83.26)

- **THE STRETCH, CAUGHT ON CAMERA (P1 #9)**: his 814×2600 shot shows
  the transport's 84×84 play circle as an OVAL — only a non-uniform
  transform can do that, and the skinned preview's iframe scale is
  the only one in the system. Engine exonerated; fonts theory dead.
  The scale math assumed a hard 340px photo width while the photo +
  aperture size in percent of the pane — now measured live
  (bind:clientWidth → imgW, both scale terms). Next occurrence
  protocol in beta-gaps: tap ↻ FIRST — survives ↻ + dies on browser
  refresh = stale transform inputs.
- **KEYMAPPER TRAVELS WITH THE REPO** ("Is there a way to pull
  them?"): pull-keymapper.bat <ip> [name] pulls every KeyMapper
  backup zip from /sdcard/Download into remotes/keymapper/<name>/
  (one-time manual step per export: Back up all → save via the
  Files target — the share sheet's Bluetooth lead is a decoy; no
  headless export intent exists, root would be needed for the data
  dir) + bonus adb backup attempt; push-keymapper.bat <ip> [zip]
  pushes the newest committed zip to a NEW remote and opens
  KeyMapper for the two-tap Restore. hardware-keys.md §Backing up
  KeyMapper documents the flow.
- STUDIO_V → **0.83.26**; ctrltab/nits2/smoke-studio green.

## Current state (v0.83.7 pending, 2026-08-16 — last tidy-ups, s0.83.25)

His five on s0.83.24.

- **#1 NP plain card**: the source gets its own line under the state
  ("Playing" / "Music Assistant Queue") — sub returns state + "\n" +
  source, .tile.wgt-media .sub is white-space: pre-line.
- **#2 volume placeholder for LOOSE wiring**: defaultBandLabel falls
  back to the wired entity's friendly name (then deslugged id) when
  no device claims it — "MA Basement", not "Volume".
- **#3 launcher counts moved to the SUB line** (grouplaunch dropped
  inlineSub) — the title no longer clips against "3 available · 0
  linked".
- **#4a Cast-group cards row** shows a summary — the cast's group
  names, or "none yet — ⊞ Add group in the cast".
- **#4b BUG**: Cast-group cards Off was hiding PROMOTED
  where:"controls" tiles — they merely share the groups generator.
  The band switch now gates the NAV CARDS only (groupsOff scopes
  castGroups, the promoted pass always runs).
- **#5 LOOSE ENTITIES CAN GROUP**: engine groupChildTile renders
  entity members (control per ⚙, device row otherwise); grouped
  loose entities LEAVE the Devices section (groupedIds filter);
  the Studio group ticks now offer extra_devices entities (live
  names), grouped extras nest under the group card (with ✕ untick
  rows), and GROUP CARDS render BELOW the cast rows ("I dont think
  it should sit above the primary role devices").
- **Verified**: probe-group-loose.mjs NEW (entity-member nav card +
  group page rows · grouped light leaves Devices · band Off keeps
  the promoted Deck Amp), full battery 20/20, smoke-studio 106/0.
  STUDIO_V → **0.83.25**.

## Current state (v0.83.7 pending, 2026-08-16 — hero round 2 + the aligned tab, s0.83.24)

His verdict on the panel hero: "It's pretty good. We lost the
original display, bring it back! But this new one should be the
default! ... replacing the icon with the same right side library we
had in the original artwork....but this time, make the background
the dark wash ... Even better if we can fade in that grey."

- **"wash" style — the original hero returns**: dimmed full-bleed
  artwork + the 64px thumb, as its own np_style value ("Art wash —
  full-bleed" in the Studio select). The PANEL stays the default
  for art:true / "art". media.js: npMode knows "wash"; wire adds
  .wash; render splits image treatment (panel src vs bg-wash+thumb);
  the 1s progress ticker walks .art AND .wash.
- **The panel's library trail is the full-height right zone
  again** — original ergonomics — but drawn as a FADE-IN of the
  card's dark wash over the art's edge (gradient 0 → .82), accent
  glyph riding it, 92px wide, :active accent, focus = inset ring
  (border dropped entirely — the transparent 2px border painted a
  hairline seam at the fade's left edge over the masked art, found
  in the probe screenshot).
- **Column discipline on the Controller tab** (his tidy-up note:
  "Lets have all the labels align and the other stuff follow"):
  fixed-width columns — arrows 24px · band name 186px · switch
  88px · label slot 158px (empty spacer where a band has no slot) —
  then the row's selects follow; the label input moved BEFORE the
  selects; the NP Auto option shortened to fit its select.
- **Verified**: probe-np-styles wash stage (class, bg-wash set,
  thumb static) + all stages green; battery 20/20; both heroes
  screenshot-checked; ctrltab + smoke-studio 106/0 after the
  realign. STUDIO_V → **0.83.24**. Docs §8 updated.

## Current state (v0.83.7 pending, 2026-08-16 — ART HERO v2, engine-only)

His mini-media-player screenshot: "we wanted a tile that allowed the
Track data to have space. With an album on one side and a library
selector on the other, there's not much space left."

- **The art is a RIGHT PANEL now**: npimg absolutely positioned,
  full height, ~58% width, full opacity at the right edge and
  CSS-masked to fade into the tile toward the text — the old
  dimmed full-tile wash + 64px thumb are gone, so the words sit on
  clean background at the SAME font sizes (npt/npa/npb untouched).
  npwrap padding trimmed (2px/4px). Progress bar unchanged.
- **The library click survives as a floating glass button**: the
  chassis trailing (the stock music NP tile's accent library jump)
  restyled ON the hero only — bottom-right over the art,
  rgba-glass, z-index above the panel; the full-height right
  column (which was eating the art's best half) is gone on art
  tiles. :active/focus states kept.
- Verified: probe-np-styles still green (hero title/artist/
  progress), full battery 20/20, visual shot (/tmp render) sent.
  Engine-only — STUDIO_V stays 0.83.22.

## Current state (v0.83.7 pending, 2026-08-16 — the truth round, s0.83.22)

His five on s0.83.21 plus the dead volume keys.

- **DEAD VOLUME KEYS (the big one)**: nav→FireTV, volume→Samsung,
  and neither hardware nor soft VOL did anything. Root cause: VOL
  routing lived ONLY in `global.buttons` config — the fixture has
  the bindings, the STARTER CONFIG never did, so fresh installs
  ship dead volume keys. Fixed at the ENGINE level (doctrine: VOL
  is always audio): unbound vol_up/vol_down now default to
  media_player.volume_up/down on `$context.volume` — the mute
  pattern; a config binding still wins. Starter config also gained
  the explicit bindings. input.js + starter-config.json.
- **#3 VOLUME BAND = THE VOLUME ROLE** (his definition, agreed):
  the band-label override applies ONLY to the tile whose entity is
  the activity's wired volume; every other volume tile is
  per-device — volumes-cast rows (bandGen unless ve ===
  context.volume), PROMOTED controls (groupChildTile/looseShowTile
  now stamp bandGen — typing a band label had renamed his promoted
  Receiver), loose shows-tiles. Deselecting in the cast remains the
  way to remove a promoted control.
- **#2 "Hero seems the same as Standard"**: it WAS — the stock
  music controller's surface tile says art:true, so Auto/Standard
  already drew the hero. np_style gained **"plain"** (Standard
  card, suppresses art:true) and the Studio select is honest:
  Auto — the surface's choice / Standard card / Slim row / Art
  hero.
- **#1 slim autoscroll**: overflowing "Title — Artist" marquees
  end-to-end and back (CSS alternate loop, distance measured into
  --npshift; re-measured only when the line changes).
- **#4 truthful placeholders**: each label slot's placeholder shows
  what the band ACTUALLY says today (defaultBandLabel: authored
  tile label / wired-volume device name / speaker-group name /
  section title), so "blank" no longer lies.
- **#5 Presets + Devices slots**: those bands are their SECTION
  HEADINGS — band_labels.presets/devices override sec.title in
  render.js ("" = no heading).
- **Verified**: probe-np-styles extended (plain-beats-art, marquee
  class + shift, promoted-Receiver exemption, wired-volume-only
  label, heading override + removal), probe-ctrltab (placeholder
  selector). Battery 20/20, all probes green, smoke-studio 106/0.
  STUDIO_V → **0.83.22**. Docs: creating-an-activity §8 label-slot
  paragraph rewritten; hardware-keys.md notes the VOL default.

## Current state (v0.83.7 pending, 2026-08-15 late — dressing round, s0.83.21)

His three on s0.83.20: the stretch again, the Controller-tab hints,
and "3 renderers" for Now Playing.

- **#1 stretch (P1 #9, still no repro)**: hedged twice — engine
  boot.js forces ONE re-render on document.fonts.ready (a refresh
  cures the stretch, which smells like layout measured before fonts
  settle), and the preview toolbar gained **↻** beside 📷 (reloads
  the ENGINE iframe only — the one-tap cure). If it recurs on
  s0.83.21+ the fonts theory is dead → 📷 + stamp.
- **#2 band-label slots**: the italic hint text is gone (hover
  keeps it — row title attr). Single-tile bands (np, transport,
  modes, volume, sources, speakers) each carry a small label input:
  `surface.band_labels.<band>` — typed text renames the band's tile
  on the remote for THIS activity, **empty = NO label** (.lbl:empty
  collapses), ↺ restores the default. Engine: `surfDressTile()`
  (context.js) applied in BOTH derivations (render pipeline +
  tilesOf — renderStates re-derives there; an undressed twin fed
  sub()/render() the wrong tile, caught by probe). Per-item bands
  (volumes cast, presets, devices) keep their own names — the
  volumes generator stamps `bandGen` and the pass skips it.
- **#3 THREE NOW-PLAYING RENDERERS**: media tile `style` —
  *Standard* (the card), **slim** (one-liner: graphic_eq indicator,
  accent while playing, "Title — Artist", chassis trailing/library
  jump intact, queueing message rides the line), **art** (the
  existing art:true hero — background art, npt/npa/npb at the same
  font sizes, live progress, no transport/volume — style:"art" is
  now its first-class name). Ladder: tile.style → surface.np_style
  (a Select on the Controller tab's Now Playing row) → default.
- **Verified**: probe-np-styles.mjs NEW (three shapes + band_labels
  override + ""-collapse + volumes-cast names untouched),
  probe-ctrltab extended (hints gone, label input + Slim select →
  POSTed band_labels/np_style). Battery 20/20, all probes green,
  smoke-studio 106/0. STUDIO_V → **0.83.21**.

## Current state (v0.83.7 pending, 2026-08-15 night — the volume-row round, s0.83.20)

His five on the deployed s0.83.19 (screenshots from .87).

- **#1 stepper gap**: the −/track/+ row sat tight under the title —
  `.steprow.vol { padding-top: 6px }`, the same breath the fat
  slider's track takes.
- **#2 + #3 THE VOLUME ROW**: every grouping-card member row now
  carries `[−] [fat track with the % INSIDE it] [+]` under the name
  line (rslrow / rslpct; −/+ = optimistic nudge + volume_up/down at
  the member; slider = direct volume_set). Always out on the
  spkgrp: screen (the old thin trim track and the loose name-row %
  are gone — alignment tidies itself); on the INLINE card his
  choice (2): tap the player's NAME to reveal/hide its row —
  per-member, session-local (GRP_EXPANDED), collapsed rows keep the
  little % beside joined names.
- **#4**: the Controller-tab Players select gained **＋ Create
  group…** → jumps to Model → Speaker Groups (selectSlice, the
  actions-door pattern), surface untouched.
- **#5 Cast-group cards**: walked through in chat (⊞ Add group in
  the cast → named sub-set of cast DEVICES → nav card on the
  controller → generated group: page; vs Speaker Groups =
  workspace-wide join targets for the running stream).
- **Verified**: probe-speaker-groups (volrow: % in track, −/+ at
  the member), probe-grouping (inline expand: hidden at rest → tap
  shows row → slider sets only that member → tap hides),
  probe-spkgroups-studio (the __new door renders the editor, saved
  config unchanged). Battery 20/20, smoke-studio 106/0.
  STUDIO_V → **0.83.20**.

## Current state (v0.83.7 pending, 2026-08-15 evening — first-sight fixes, s0.83.19)

His screenshots of the new spkgrp screen, minutes after the deploy.

- **#1 the big left icon**: the spkgrp screen's card rendered in ROW
  mode (columns-1 screen), hanging the icon in a full-height left
  column. `brRow: false` on the generated tile → the card chassis:
  icon on the title line, sub inline. probe-speaker-groups asserts
  notRow / iconInTop / subInline.
- **#3 Draws-as vs Volume style overlap**: "Volume − / +" was a
  second volume entry in Draws-as while Volume style offered
  stepper too — and shows:volume + style:stepper was silently
  IGNORED by groupChildTile/looseShowTile (compact drawn instead).
  Unified: ONE Draws-as entry (*Volume control*), the style select
  picks the shape — groupChildTile/looseShowTile now route
  style:stepper to the stepper tile; legacy `shows:"stepper"`
  stays honoured engine-side and the Studio sweeps it to
  volume+style:stepper on load (normalizePresentShows). The
  "slightly squashed" fat bar: .sldr.inrow height now 46px,
  matching the −/+ buttons exactly. probe-volstyle-unify.mjs NEW
  (stepper shape / slider shape / legacy alias);
  probe-spkgroups-studio now seeds a legacy entry and asserts the
  sweep lands volume+stepper in the POST. Battery 20/20,
  smoke-studio 106/0. STUDIO_V → **0.83.19**.
- His **#2 arrived truncated** ("On the inline,") — asked.

## Current state (v0.83.7 pending, 2026-08-15 afternoon — SPEAKER GROUPS + the stepper shape)

"OK - do the grouping work" — the building block from his morning
proposal, plus the unanswered half of his #4 (Slider vs Stepper
"pretty much identical... Maybe Volume Stepper is like Compact
except a fat slider bar").

- **SPEAKER GROUPS**: `CONFIG.speaker_groups.<id> = { name,
  entities }` — named, workspace-level joinable-player sets,
  deliberately independent of any cast (cast = "what the activity
  uses"; group = "what is joinable" — the amplifier-receiver stays
  out, the MA players outside the cast get in). The speakers band
  points at one via the tile's `group:` or the activity's
  `surface.speakers_group` (Controller-tab select), with
  `mode`/`surface.speakers_mode`: **launcher** (slim grouplaunch
  tile, "5 available · 2 linked", lit when linked; select →
  generated `spkgrp:<id>` screen) or **inline** (the full card in
  place). Group-fed defaults to launcher, cast-fed stays inline —
  deployed configs render unchanged.
- **The spkgrp: screen** (details.js, VIRTUAL_PREFIX member): the
  grouping card with `sliders: true` — a fat trim track per player
  (direct volume_set, join state irrelevant — trim BEFORE linking),
  levels always visible, master row shown as the anchor
  (join/vlink hidden, accent name). Master resolution: the
  (presumed) activity's player resolved at screen build — NOT left
  as `$context` (an unwired $context hides the tile in
  visibleTile) — else the card's new `grpMaster()` fallback:
  coordinating member → playing member → first listed; the
  gmaster anchor un-sticks if the master changes as states arrive.
- **Volume link scope**: stays PER-DEVICE (his question) — the
  whole point is the bedroom speaker holding its own level while
  the patio pair rides; a global toggle would re-create the
  slam-everything behavior the delta math exists to avoid.
- **STEPPER VOLUME = ITS OWN SHAPE** (his design): "Vol n%" on the
  title line (inline sub — wgt-stepper CSS now hides only the
  block sub), the fat track IN the − / + row (`.sldr.inrow`,
  flex:1), no second track, no big numeral; muted → "Muted" +
  dimmed track; −/+ still step; other stepper kinds untouched.
  Four volume styles, four shapes.
- **Studio (s0.83.18)**: Model → **Speaker Groups** editor (slice +
  CenterPane route + SpeakerGroupsEditor.svelte: add/rename-slug/
  delete with dangling-reference sweep, EntityPicker player rows
  media_player-filtered, used-by subtitle); Controller tab Speakers
  row gained the **Players** (cast / named groups) and **Card**
  (Launcher/Inline, auto label follows the group choice) selects
  via setSurfKey.
- **Verified**: probe-speaker-groups.mjs NEW (launcher + counts
  live via mutable-STATES mock, spkgrp screen rows/trims, join at
  the ACTIVITY's master from outside the group, trim hits one
  member, inline mode, no-activity fallback master = coordinator),
  probe-stepper-vol.mjs NEW (shape/drag/step/mute; brightness kind
  keeps the big numeral), probe-spkgroups-studio.mjs NEW (editor
  mints group + typed players; Controller selects; Save & Deploy
  POST carries speaker_groups + surface.speakers_group — the guard
  against a future normalize sweep eating the new top-level key).
  Full battery 20/20, all 17 probes green, smoke-studio 106/0.
- Ship: same pending v0.83.7 — make-release.bat → push-all.bat →
  hard-refresh (s0.83.18).

## Current state (v0.83.7 pending, 2026-08-15 — controller-tab feedback round)

His five (six) notes on the fresh Controller tab, plus a follow-up
mid-round: "In grouped media players, one can link the player(s) and
a separate toggle should be to link their volume."

- **#1 Band reordering**: each band row on the Controller tab has
  ↑↓ move buttons; the order is stored as
  `a.surface.band_order` (array of band keys). Engine:
  `surfOrderTiles()` in context.js permutes the BAND tiles within
  their section pre-expansion (render.js) — non-band tiles keep
  their exact slots, generators keep identity, <2 band tiles = no-op,
  unlisted bands trail in source order. Per-activity, like every
  surface preference.
- **#4 Volume % said twice**: slider-mode volume tiles showed
  "Vol 76%" on the title line AND "76%" center. The center readout
  owns the number now — slider-mode `sub` returns "" (muted included:
  the glyph + dimmed track carry it). Compact mode keeps "Vol n%" /
  "Muted" titles — its meter has no numeral.
- **#5 Preset pickers**: the preset Service field is a searchable
  dropdown (new ServicePicker `prefer` prop — media_player.* services
  rank first), and Target Entity prefers the cast's entities
  (ActivityCard passes deviceList(); HubEditor derives
  `pageCastEnts` from its owned activities for page presets).
- **#3 "Group cards" row** meant the nav cards for cast groups made
  with ⊞ Add group — relabeled **"Cast-group cards"** to kill the
  collision with his proposed Speaker Groups block.
- **VOLUME LINK (the follow-up)**: joined rows on the grouping card
  carry a second toggle — volume link. Default linked; unlinked
  members keep playing in the group but the group-volume slider
  skips them (and the track averages only the linked set). Client-
  side session state (like a pre-link trim), sticky across
  unjoin/rejoin. Master always linked (its level is the volume band).
- **Verified**: probe-band-order.mjs NEW (default order · flipped
  per band_order with a wedged non-band tile holding its slot ·
  single-band no-op), probe-ctrltab.mjs extended (↑↓ writes
  band_order into the POST; row selectors updated for the arrow
  column), probe-grouping.mjs extended (vlink toggle only on joined
  rows · unlinked member skipped by the slider · relink rides
  again), probe-mute.mjs extended (slider-mode sub "" + compact
  "Muted"/"Vol n%"). Battery 20/20; smoke-studio 106/0; all feature
  probes green. STUDIO_V → **0.83.17**.
- **Docs**: creating-an-activity.md §8 — arrows paragraph,
  Cast-group cards, the volume-link sentence;
  activity-controller.png re-shot (arrow column visible).
- **#2 Speaker Groups building block**: design discussion open (his
  proposal: named groups like "Outdoor Music Players", launcher tile
  "5 available · 0 linked" → group card, or inline mode) — no code
  yet, proposal sent back.
- Ship: same pending v0.83.7 — make-release.bat → push-all.bat →
  restart HA → hard-refresh (s0.83.17).

## Current state (v0.83.7 pending, 2026-08-14 evening — THE CONTROLLER TAB)

Suresh: "I think our entire paradigm needs an important change. What
if I don't want to control multiple players. What if I do. Should we
have a controller tab, (in activities) where we turn knobs and
settings for a given controller?" Yes — and it's the missing Harmony
question ("what does the screen show while this runs?"), built as
per-activity preferences on the SHARED surface. Presets folded in
(his sub-question: yes — tab count stays even).

- **The mechanism**: `a.surface` — the per-activity home
  surface.devices pioneered in v0.48 — now carries a switch per
  band: np, transport, modes, volume (+volume_style), speakers,
  groups, sources, presets, devices. Absent = Auto = the band's own
  rules (zero migration, zero first-run change); false = off, for
  THIS activity only. The stock surface stays shared and healable;
  the preference exports/duplicates with the activity. Custom
  copies remain for structural surgery — the tab says so.
- **Engine**: generator bands (volumes/speakers/groups/presets/
  devices) gate pre-expansion in generators.js (srfOff); fixed
  singletons (media→np, transport, mediabtns→modes, sources,
  volume incl. stepper-volume) gate in visibleTile on
  controller-class screens only — room pages unaffected. The
  volume-style ladder gained the activity rung: tile → member ⚙ →
  device_options → ACTIVITY surface.volume_style → theme/global.
- **Studio**: the Presets tab became the **Controller** tab (same
  slot, keeps the preset count badge). Contents: the controller
  strip (moved OUT of Setup — Setup is back to identity + cast +
  navigate-to with a one-line signpost), band rows derived from
  what the target controller ACTUALLY renders (walk its tiles;
  only present bands get a row), Auto/Off switch each + the volume
  style select, and the whole presets editor folded beneath. Tab
  dot = any override present or presets exist.
- **ALSO: the grouping card reads loose entities now** (same
  evening, his screenshot: two raw media_players cast, no
  pre-wired devices, no card): the speakers generator collects the
  wired context.media_player + extra_devices + legacy a.devices
  media_player.* entries too, and rows without a baked name pick
  up live friendly_name on first state (probe-grouping-loose.mjs —
  his exact shape).
- **Verified**: probe-ctrl-bands.mjs (engine: off hides
  transport/volume/speakers while Now Playing stays; Auto returns
  all), probe-ctrltab.mjs (Studio: tab in place, strip moved, all
  9 rows on the gen-2 music stock, toggle → POSTed
  a.surface.{band}:false, presets folded, Setup strip gone).
  Battery 20/20; all 10 probes green; smoke-studio 106/0.
  STUDIO_V → **0.83.16**.
- **Docs**: creating-an-activity.md §8 rewritten as "Controller —
  what the screen shows" (strip / band switches / presets), tab
  list + Setup section updated; full screenshot set re-shot
  (activity-controller.png new, activity-presets.png retired).
- Ship: same pending v0.83.7 — make-release.bat → push-all.bat →
  restart HA → hard-refresh (s0.83.16).

## Current state (v0.83.7 pending, 2026-08-14 afternoon — the queue round)

Suresh: "try and knock a few off — over to you." Three came off:

- **THE SPEAKER GROUPING CARD SHIPPED** (beta-gaps §3, P1 #4 — the
  oldest open feature). Engine: new `WIDGETS.grouping`
  (src/widgets/grouping.js, registered in build.mjs) — the cast's
  players as rows, join/unjoin toggle per member against the MASTER
  (standard HA contract: truth = the master's `group_members`;
  join = media_player.join at the master, leave = unjoin at the
  member; no platform sniffing — Sonos native and MA both honor
  it), plus a GROUP VOLUME slider that moves every joined member by
  the SAME DELTA from the group average — offsets preserved, the
  mini-media-player lesson. Optimistic everywhere, house style.
  New generator type `speakers` expands from the RUNNING activity's
  cast (every media_player claim; authored `entities` list wins) —
  fewer than two players = no card. STOCK_MUSIC → **gen 2** with
  `{id:"spk", type:"speakers"}` after the volume band; healStockGen
  upgrades every non-variant copy on load (parent preserved, custom
  copies untouched). Probes: tests/probe-grouping.mjs (render/
  join-at-master/unjoin-at-member/delta-math — drag to 0.8 over a
  0.3+0.7 group → 0.6 and 1.0-clamped, unjoined speaker untouched)
  and tests/probe-stock-heal.mjs (gen-1 → gen-2 heal with parent
  kept). One hardening: setPointerCapture wrapped (synthetic
  pointer events carry no id).
- **ONE VERSION IN THE HEADER** (Suresh: "We show TWO version
  #'s!"): the header now shows only the s-stamp; integration and
  deployed-engine versions moved into its tooltip. probe-stock-heal
  asserts zero v-chips.
- **SMOKE-STUDIO SELECTOR REFRESH** (the six pre-existing falses,
  backlogged since the collapse round): "Activities — owned by this
  room" → the ＋ Add activity anchor; the dead `startPicker: false`
  placeholder → a real used-by assertion; 'Watch TV' → 'TV Media
  Player' (stock rename); the doorway→nav wording sweep (Add nav /
  New nav / new_nav). smoke-studio now **106 true, 0 false**.
- Full battery 20/20; all seven feature probes green. STUDIO_V →
  **0.83.15**. NOT built: the true factory-reset door — deferred
  pending Suresh's verdict on "Clear to a fresh start…".
- Ship: same pending v0.83.7 release — make-release.bat →
  push-all.bat → restart HA → hard-refresh (header reads
  **s0.83.15**, one number). The grouping card appears on any music
  controller whose running activity casts 2+ players.

## Current state (v0.83.7 pending machine build, 2026-08-14 — the overnight round)

Suresh's docs/status-review.md (three items, two screenshots) +
"one more pass" on the activity deep-dive, worked overnight:

- **MUTE INDICATOR** (engine, review #1 "no on remote indicator of
  mute status"): the volume widget now reads `is_volume_muted` from
  the reporting entity (level_entity when split, else the command
  entity). Muted → title line says "Muted", the slider-mode center
  % becomes an accent `volume_off` glyph, and the track/meter fill
  drops to 30% opacity (the level stays visible so unmuting lands
  where you expect). Unmuted → everything returns. volume.js
  volMuted() + render(); controls.css `.vmute` / `.muted i`.
  ENGINE_V → **0.83.7**. Probe: tests/probe-mute.mjs (both
  directions via live state diff); full battery 20/20.
- **THE SOUNDBAR INPUTS ROW** (Studio, review #2 "Why is the
  soundbar not showing in the input sources?"): inputTargets
  filtered on the role KEYS source_select/media_player — a soundbar
  cast only for volume/volume_level never got an Inputs row even
  though its claims point at a media_player with a real source list
  (HDMI/optical/BT). New inputEnt() helper: source_select claim,
  else media_player claim, else ANY claimed media_player.* entity —
  used by both the Inputs tab and the generated Start's
  switch-if-needed step, so they always agree. STUDIO_V →
  **0.83.11**. Probe: tests/probe-inputs-soundbar.mjs (fixture's
  porch_soundbar, volume-only claims → row appears with its
  sources); probe-virgin + probe-collapse re-run green.
- **THE STRETCHED FIRST-LOAD** (review #3, "toggling the preview
  view seems to fix it"): could NOT reproduce headlessly —
  tests/probe-stretch.mjs (kept in repo) opens the Watch Fire TV
  card cold with the astrion skin and measures the photo-mode
  iframe before/after the Controller↔Room-page toggle: layout
  349×581 and transform identical both times. Suspects that survive:
  slow photo/asset load on real LAN (imgNat default is the old
  1280×4084 aspect — only 0.1% off, shouldn't be visible), or a
  stale cached studio.html. FIELD DIAGNOSTIC for next occurrence:
  when it looks stretched, press 📷 — if the PNG is ALSO stretched
  the engine content is wrong (viewport), if the PNG is clean it's
  Studio-side compositing; and note the footer s-stamp. Logged in
  beta-gaps.
- **THE SCOPED STOP** (same round, Suresh reading the generated
  step: "It sets Room to Off. But what if there is another activity
  running?"): the generated Stop's `harmonium.set_activity off`
  carried NO room — and the integration's off-with-no-room is
  ALL-OFF, every select in the workspace. On a one-room box it
  looked right; on CT it would have ended every room in the house.
  buildStopActions now stamps `room: a.room_view`. Existing
  hand-authored sequences (music_stop, all_off) keep their bare
  form — all_off's is the point. Probe:
  tests/probe-stop-scope.mjs (generate → Save → POSTed step reads
  {activity:"off", room:"porch"}). NOTE: within a room only one
  activity runs at a time (one select), so ending the room IS
  ending this activity; the room scope is what was missing.
- **THE STOP IS CONDITIONAL NOW** (revision, same day — Suresh: "a
  room can run MORE than one activity at a time… If I long press
  Watch TV, I want Watch TV turned off. Not the whole room."): the
  scoped off gained a guard — the generated Stop clears the room's
  routing ONLY `if` the select still holds THIS activity
  (condition: state == activity id on the minted select, computed
  from the workspace-prefixed pattern; duplication retargets it).
  Model made explicit: the select is the FOCUS (controller, keys,
  context — one activity), device truth is what lights tiles
  (several at once). Ending Watch TV while Music holds the room now
  powers off Watch TV's checked devices and touches nothing else.
  probe-stop-scope.mjs verifies the full if/then shape. The
  first-class multi-activity question → beta-gaps design note.
- **THE #4 ERROR, FOUND IN .87's LOG**: "workspace 'main' has no
  sequence 'porch_watch_fire_tv_stop'" — the long-press ran the
  DRAFT's stop ref while harmonium.run reads the SAVED store; he
  hadn't deployed the freshly generated Stop. Not a bug — the
  draft/saved seam — but the error now says so: handle_run's
  message adds "if you just created it in the Studio, Save & Deploy
  first (the remote, the preview's taps, and ▶ Test all run the
  SAVED copy)".
- **THE $device SUBSCRIBE LEAK** (found in the same log, unreported:
  4× "Entity ID $device is an invalid entity ID" on 08-13): one
  unresolved token in subscribe_entities and HA rejects the WHOLE
  message — the page then gets no state updates (the 2026-07-26
  failure class again, new door). entitiesFor() now has an EXIT
  GUARD: only ids with a dot and no $-token leave the function.
- **THE ICON FONT GATE** (Suresh: "font and display are messed up.
  A page refresh clears it"): Material Symbols loads from Google
  after first paint, so icons render as ligature TEXT
  ("play_circle") until it lands — and stayed that way on slow
  fetches. app.css hides `.material-symbols-outlined` until
  App.svelte confirms the font via `document.fonts.load()` (adds
  `.fonts-ok` on <html>; 3s fallback so a blocked font degrades to
  ligature text, never to invisible icons). STUDIO_V → **0.83.12**.
- **Doc stranger pass** (creating-an-activity.md): added "open the
  Studio from the HA sidebar" grounding + a ten-step "route you'll
  take" checklist up front, prefer-the-⊞-rows guidance in the cast
  picker, what "reload the remote" concretely means (browser
  refresh / Fully Kiosk / Save+Reload Astrion), and a
  "picker can't find my device" troubleshooting entry (HA-side
  registry, not Harmonium config).
- Ship (morning): `node build-engine.mjs` + `cd studio-src && npm
  run build` on the machine → make-release copies the engine into
  custom_components → commit + tag **v0.83.7** (manifest bump still
  needed at that point: 0.83.6 → 0.83.7) → HACS update on .88.

## Docs: the activity deep-dive (2026-08-13)

**docs/cookbook/creating-an-activity.md** — Suresh: "every step,
every knob, every option, with screenshots." The long-form twin of
activities.md (cross-linked both ways; cookbook README row added).
Written from a full source walk of ActivityCard.svelte, so every
control is documented at code level: the five concepts (state vs
orchestration, host pages, the pre-wired library with
claims/dialect/traits, cast vs roles, shared controllers), the
identity strip, tri-state tab dots, Setup (kind, navigate-to +
page minting, controller strip, the cast picker's three row kinds,
primary rules, understudy/no-claim annotations, the full ⚙
presentation vocabulary incl. intentional-blank semantics, groups,
snippets), all 8 roles as a table with claim-promotion (＋ add the
claim / ↥ save claim), Inputs, Actions (exact generated Start/Stop
step shapes, the never-guess-power directive, the _v2
no-overwrite rule, the no-stop fallback chain), Presets, the four
State modes + both generators, Advanced, save/test truths, and six
troubleshooting entries. **Eleven screenshots** shot headlessly
from the REAL Studio (s0.83.10 build) running the CT fixture —
tests/shoot-activity.mjs (kept in the repo; element-cropped
CardRow shots, stubbed live states so Inputs/pickers show real
material) → docs/media/activity-*.png @2x.

## Current state (s0.83.10 Studio, 2026-08-13 — pending machine build)

s0.83.10 — **COLLAPSIBLE COLUMNS** (Suresh: "hide/collapse columns…
especially the 1st column and the preview column"; local for now, no
release tagged). Two header icon toggles next to the theme button —
**◧** folds the 252px nav column, **◨** folds the 372px preview
column — and the center editor takes the width. Buttons dim at 40%
opacity when their column is hidden; tooltips explain both states.
Choices persist per browser (`hakr_studio_nav_hide` /
`hakr_studio_pv_hide`). Both panes are HIDDEN, never unmounted: the
NavPane keeps ⌘K search alive, and the preview keeps the engine
iframe's state (same rule the workspace-map slice already used —
pvHide just rides it). Probe (tests/probe-collapse.mjs): nav
252→0→252 px, preview iframe zero-width but the engine frame alive,
localStorage persisted, state survives reload with dimmed buttons,
no console errors. STUDIO_V → **0.83.10**. Ships with the next
`cd studio-src && npm run build` + tag; no integration change.

## Current state (v0.83.6, 2026-08-13)

v0.83.6 — **THE BUNDLED SKIN** (fourth .88 field report: "No photo
for astrion"). v0.83.5's starter seeded the astrion *profile*
(keymap, capabilities) but the device-photo skin needs
`www/harmonium/skins/astrion.png` — which a fresh box doesn't have,
and the skin block wasn't in the starter either.

- `custom_components/harmonium/skins/astrion.png` now ships in the
  integration (the real 1.9MB 814×2600 export, copied repo-side from
  skins/). Setup deploys every bundled skin to
  `www/harmonium/skins/` — **only if absent, NEVER overwriting** (a
  user's own photo of their own remote always wins); non-fatal
  OSError doctrine, same as the engine deploy. Simulated: fresh
  deploy ✓, idempotent re-run ✓, user-modified file survives ✓.
- starter-config.json's astrion profile gained the full **skin
  block** (SKIN_ASTRION verbatim from PreviewPane: image path,
  viewport 349×581, screen 10.07/3.764/80.59/41.77 with the
  field-trued y, all 23 buttons). PreviewPane derives the photo
  straight from `profile.skin`, so a fresh install's Studio lands
  previewing ON the photo with zero clicks. Probe
  (tests/probe-starter-skin.mjs): boot with the seeded config →
  device defaults to astrion, photo img present, engine renders
  home in the aperture, status "loaded — 1 views", no errors;
  starter still passes _validate clean.
- **.88 note**: its store was seeded by v0.83.5 WITHOUT the skin,
  and the seed (correctly) never reruns on a populated store. After
  the v0.83.6 restart deploys the PNG, one click applies the skin
  there: Preview as astrion → **🖼 device photo** (the preset) →
  Save & Deploy. Fresh installs after v0.83.6 need nothing.
- **Log-visibility lesson from the v0.83.5 verify**: the seed logs
  at INFO and HA's Settings→Logs UI shows WARNING+ — "nothing in
  logs" is the expected sight of a SUCCESSFUL seed. The real check
  is `/local/harmonium/config.json` answering with JSON.
- manifest → **0.83.6**.

## Current state (v0.83.5, 2026-08-13)

v0.83.5 — **THE VIRGIN STUDIO** (the .88 stranger-path test keeps
earning its keep). v0.83.4 installed and the engine deployed — the
pairing banner even lit up — but the Studio opened DEAD: red
"no config found (API 404, /local fallback failed: HTTP 404)" and an
empty editor. On a fresh install there is nothing stored and nothing
deployed, so both doors 404 and boot() just returned. The README
promises "look around the starter config"; the virgin path delivered
an error banner instead.

- **Virgin boot mints the starter** (state.svelte.js, s0.83.9): the
  exact branch "API answered 404 AND /local fallback failed" is now
  read as *fresh install, empty store* — not an error. boot() loads
  `starterConfig()` into the editor as a draft, lands on the
  workspace map, and the status pill says: "fresh install — starter
  workspace loaded (a draft). Look around, then Save & Deploy to
  create your config; remotes can load it after that." First Save &
  Deploy POSTs main (the API creates main on POST), which writes the
  store AND deploys config.json. `app.virgin` clears on save.
- **THE SECOND LATENT BUG, caught before the field hit it**: from an
  EMPTY draft, `starterConfig()`'s stock drawers are PLANTED by
  ensureStockControllers (not copied from live) — and a planted
  drawer carries its stock `parent` (`controller:tv` /
  `controller:music`) pointing at controllers the blank config
  doesn't have. The integration's `_validate` rejects dangling
  parents, so the very first Save & Deploy would have 422'd. Fixed
  with a navigable-set sweep at the end of starterConfig(): any
  `parent` whose target isn't in THIS config is dropped. (Same class
  as the "unknown parent" bug from the first live workspace-create —
  this was its virgin-path twin.)
- **Probe-verified end-to-end** (tests/probe-virgin.mjs, kept in the
  repo): stubbed API (config 404, empty roster, /local 404) + real
  engine in the preview → boots to the map with the fresh-install
  status (no red), preview renders the starter's home hub, Save &
  Deploy POSTs, and the posted config runs through the REAL
  `_validate` (extracted verbatim) → **zero problems**. Full
  smoke-studio re-run: identical results to the pre-change baseline
  (six pre-existing selector-drift falses noted below — not
  regressions).
- **THE SERVER-SIDE STARTER SEED** (same release, Suresh's call:
  "if there is no config, we should create one; if there is one, we
  leave it alone"): the integration now bundles
  `custom_components/harmonium/starter-config.json` and
  async_setup_entry seeds it when the store is empty AND nothing is
  deployed — saving the store, deploying config.json, and writing
  the main/ stub in one setup pass. The three doors, in order: store
  has workspaces → touched by NOTHING (updates never overwrite);
  store empty + config.json deployed → the existing adopt-from-
  deployed path; store empty + nothing deployed → bundled starter.
  Non-fatal like the engine deploy (bad/missing starter = logged
  warning, Studio's s0.83.9 virgin fallback still covers it; the
  seed validates through `_validate` before it commits).
- **What's IN the starter** (extracted from the fixture's system
  layer, verified house-free): input policy, `default` + `astrion`
  remote profiles with their full keymaps (34 keys), theme, the app
  master list (13 apps) + all 3 dialects (firetv/tizen/googletv),
  and the ENTIRE stock controller library — tv, music, apps,
  music_library, climate, light, cover, fan, switch (all
  $context-driven; only generic service names inside). tv/music's
  `parent: porch` content edges stripped; apps→controller:tv and
  music_library→controller:music survive (targets present). Content
  zeroed: devices, entity_options, activities, sequences; screens =
  one "New Room" home hub. This fixes what the Studio-side starter
  couldn't: it has no STOCK_TV and ships `apps: {}` from an empty
  draft — the bundled starter has the full library.
- **Verified**: starter passes the real `_validate` (zero problems);
  the real engine renders it headlessly (tests/probe-starter-engine.
  mjs — screen=home, "New Room", no errors); the seed branch
  simulated across all four cases (virgin → save+deploy; adoption →
  starter stays out; populated store → untouched; starter file
  missing → non-fatal warn). `_write_json` mkdirs parents, so the
  seed survives a box with no www/ at all.
- **Ordering truth for a fresh install**, now moot but documented: a
  remote can PAIR before the first save (the broker is
  config-independent) — and with the seed, it renders the starter
  home hub immediately instead of 404ing. The Studio opens on a real
  stored config; its virgin branch remains as the safety net.
- manifest → **0.83.5**; STUDIO_V → **0.83.9**. Studio-only change:
  machine steps are `cd studio-src && npm run build`, commit + push,
  tag v0.83.5, HACS update on .88, hard-refresh the Studio (check
  the `s0.83.9` stamp).
- Backlog note: smoke-studio.mjs has six stale assertions
  (activitiesOwned, startPicker, nameInput, added, draftBanner,
  pageMade) — selector drift from the v0.83.x UI rounds, false on
  the untouched baseline too. Needs a selector refresh pass, not a
  code fix.

## Current state (v0.83.4, 2026-08-13)

v0.83.4 — **THE HACS COMPLIANCE MOVE** (field failure on the first
real install attempt: HACS refused with "Repository structure for
v0.83.3 is not compliant"). The lesson: HACS validates the GIT TREE
of the tagged version and requires the integration at
`custom_components/<domain>/` in the REPO ROOT — `zip_release` only
changes the download source, not the structure check, so our
`integration/custom_components/harmonium/` layout failed validation
before the zip was ever considered.

- `git mv integration/custom_components custom_components` (history
  preserved); `integration/README.md` → `custom_components/README.md`;
  the empty `integration/` shell moved to `_to_delete/`.
- **zip_release RETIRED** (hacs.json now just name/render_readme/
  homeassistant): with the tree compliant anyway, tree-install is
  strictly simpler — a release is now commit + tag, with NO asset to
  attach or forget. The bundled `engine/index.html` and
  `studio/studio.html` are committed build artifacts, same doctrine
  as `dist/index.html`.
- make-release.bat rewritten for the tree story (3 steps, prints the
  commit+tag instructions; the zip step is gone); paths patched in
  push.bat (all modes), finish.mjs (studio build destination),
  smoke-devices/smoke-studio (both re-run green), README's How-it's-
  built table, ARCHITECTURE.md, custom_components/README.md.
- Publishing flow now: make-release.bat → git add/commit/push →
  GitHub release with tag v<manifest version>. HACS installs
  custom_components/harmonium from the tag.
- **THE VIRGIN-INSTALL BUG** (same day, first real HACS install on
  the fresh .88 HA: "Error setting up entry" —
  FileNotFoundError /config/www/harmonium/index.html): the engine
  self-deploy wrote into www/harmonium/ without ever creating it.
  Every dev house has had that directory for months; a fresh HA has
  no www/ at all. Fixed: mkdir(parents=True) before the write, and
  the whole deploy block is now NON-FATAL (OSError → logged error
  with a fix-and-restart hint; the integration still sets up — a
  remote UI that can't deploy must not kill the entry). manifest →
  0.83.4; tag v0.83.4 is the first HACS-installable release.

## Current state (v0.83.3, 2026-08-13)

v0.83.3 — **DESLUG** (statusreview tweak, climate-detail screenshot:
"Note the presets like wind_free. We need to intelligently strip the
_ so it reads wind free"). Display-layer only:

- `deslug()` joins `cap()` in widgets/helpers.js, and cap() now
  deslugs before capitalizing — every cap() call site is a display
  of an entity state/enum (audited: climate, cover, device×4, fan,
  light, media×3), so fan_only reads "Fan only" and heat_cool "Heat
  cool" everywhere at once.
- Chip rows (hvac/fan/preset/source/effect/sound_mode) render
  deslugged labels while `data-ch` keeps the RAW value — verified
  in probe-deslug.mjs: the "wind free" chip still calls
  set_preset_mode {preset_mode: "wind_free"}.
- fan tile's preset sub-line deslugged.
- ENGINE_V 0.83.3; battery 20/20 (one smoke-studio flake was the
  dist server dying between suites — clean on re-run).
- **The volume-kind stepper matches the volume row** (Suresh: "The
  first is nice. The second needs fixing (Volume)"): steprow.vol —
  58×46 buttons, 21px/600 value, 12px gap — so a stepper-styled zone
  (the Receiver) and the wired volume read as the same control.
  Other stepper kinds (brightness/setpoint/position) keep the big
  display type: on a detail page they ARE the page.
- **The photo-mode 1px seam was a WRONG APERTURE, not rounding**
  (Suresh: "the LCD panel is one pixel off on both axis… grey/white
  line"): SKIN_ASTRION.screen carried the alpha-scan of the ORIGINAL
  1280×4084 Photoshop export, but the shipped 814×2600 PNG is a
  slightly different crop — flood-filling its enclosed transparent
  hole gives x 82..737, y 93..1178 = **10.07/3.58/80.59/41.77** (the
  old 9.84/3.80/80.00/41.80 left ~6 unfilled source rows above the
  iframe showing the page background). Preset corrected; the clip
  also runs 1px proud of the rect with the iframe nudged back in
  (black ring under the photo's anti-aliased rim — the 📷 bleed
  trick, live). AND the deeper cause of "1 or two pixels off our
  vertical position" (the follow-up screenshot's bottom line): the
  iframe's height was DERIVED (width × viewport ratio), so any
  rect-vs-viewport aspect mismatch left a hairline at the bottom —
  and every hand-nudge of the rect moved it. The iframe now scales
  X and Y INDEPENDENTLY to fill the rect edge-to-edge; the residual
  anamorphic stretch is the aspect delta (~0.6% on the astrion),
  invisible where a white line is not. Verified with red-background
  leak tests: 0 leak pixels with the corrected rect AND with a
  deliberately wrong-aspect rect (h=42.5). RE-APPLY the preset on
  the device profile (footer → 🖼 device photo) to pick up the new
  rect — stored configs carry the old numbers.
- **The slider volume's middle is the %** (same round — Suresh, seeing
  the wired-volume tile beside a stepper Receiver: "like the first
  example in height but with the volume % instead of a duplicate
  slider"): in slider mode the −/+ row's center shows the percentage
  (21px, sized to the 46px button row — deliberately NOT the
  stepper's 42px display type) instead of the mini-meter that
  duplicated the fat track above it. Compact mode keeps the meter —
  with no track, it IS the level. The % follows optimistic nudges
  and the drag finger. Battery 20/20 re-run; probe-vol asserts
  centerPct + miniMeterGone.

## Current state (v0.83.2, 2026-08-13)

v0.83.2 — **FOUR MORE, WITH A CAMERA** (statusreview follow-ups):

- **Artwork is themeable** ("have the library artwork (including
  tiles) set in the theme (for both music and tv)"): three new
  engine tokens — `--br-art` 58px (library cards, music AND tv
  browse grids), `--art-big` 84px (art-forward playlist cards; wide
  screens add 16px via calc), `--app-art` 42px (app stamps on
  presets/apps drawer). List rows already rode `--icon-zone`. Theme
  editor grows Library art / Playlist art / App stamp knobs beside
  the existing tile-h/icon-zone row.
- **Export is a dropdown** ("this workspace, all workspaces" — asked
  twice whether Export took everything; the answer now lives in the
  control): This workspace = the old full-fidelity draft download;
  All workspaces = a one-file bundle {harmonium_export:"workspaces",
  order, workspaces:{id:{name,config}}} — the current world from the
  live draft, the rest fetched fresh (?ws=). importConfig names the
  bundle instead of half-loading it.
- **Washes are toggleable** ("Just a simple toggle"): `washes on/off`
  link in the soft-remote footer (both photo and grid modes), gating
  every wash — tap, hold-latch, hotspots and soft keys alike.
  Persisted per browser (hakr_studio_wash).
- **📷 The preview screenshots itself** ("the screenshot should honor
  alpha on the preview (this is what will build my gifs)"): camera
  button beside the Showing row. The engine iframe's DOM renders to
  canvas (html-to-image — NEW studio dependency, `npm i` before the
  machine build), composited into the skin photo's aperture at the
  photo's NATURAL resolution with a 2px bleed under the anti-aliased
  rim, photo drawn over — everything outside the device is genuinely
  transparent (verified: corner alphas 0, screen content composited,
  814×2600 out of the 814px astrion asset). No skin → the bare
  screen at 2×. THE FONT TRAP: html-to-image can't read a
  cross-origin <link>'s cssRules and silently skips Google Fonts —
  every icon renders as its ligature name; snapFontCSS() fetches the
  stylesheet itself, inlines each url() as a data: URL, and passes
  it as fontEmbedCSS. Files download as harmonium-<screen>.png.
- Verified end-to-end in probe-nits2.mjs (wash 9→0→9, export bundle
  carries both workspaces, PNG alpha checked with PIL, --br-art
  reaches the engine); battery 20/20.

## Current state (v0.83.1, 2026-08-13)

v0.83.1 — **THE NITS AND NATS ROUND** (statusreview.md, four items +
one question):

- **Actions were already global in scope** (item 1): any page, preset
  or activity in a workspace can reference any sequence — the room
  stamp is filing, not scope (SequencesEditor has said so since the
  groups pass). What they could not do was TRAVEL, so they now ride
  the standard snippet grammar: **action snippets** — ⤴ Export
  snippet on any Action card's ··· menu, ⤵ Import snippet… beside
  ＋ Add action, across workspaces like every snippet. The room
  stamp is dropped on export AND import (it names the source house's
  rooms). Studio: SNIPPET_TYPES.action + actionSnippetSeq() +
  SequencesEditor doors.
- **Preview first-mount height** (item 2 — "wrong height unless I
  click the photo mode on then off"): the plain frame's last-resort
  viewport was the historical 320×537 guess, which only healed after
  the photo dance wrote a measured viewport into the profile. Now a
  profile without its own measurement borrows one from any profile
  in the workspace, and the final fallback is the HA100 ground truth
  349×581 — first mount now matches the post-dance size.
  (PreviewPane plainVp chain.)
- **Volume: fat by default + optimistic** (item 3): the slider
  treatment is now the default volume style everywhere (generators'
  dflt and the presShows path: "compact"→"slider"; the widget draws
  the track unless slider:false — a generated compact choice still
  says so explicitly). And +/- taps nudge the LOCAL volume_level by
  0.05 immediately (renderStates before the HA round-trip; the next
  diff overwrites with truth) — the "doesn't update quickly" was a
  full round-trip plus device report latency before anything moved.
  Slider drags now write optimistic state too, so "Vol n%" follows
  the finger. Verified: probe-vol.mjs (34%→39% before any state
  event arrives; volume_up still called).
- **Browse list rows read like a list** (item 4, screenshot): browse
  items are preset-TYPE tiles, and .wgt-preset's centered-card
  styling (text-align:center, free wrap) leaked into .row mode —
  big centered wrapping titles. Now .tile.brw.row is left-aligned,
  drops the row +2px bump (base --fs-1 / --fs-m1, incl. a music-
  scope override — the #app rule outranks the class chain), and
  ellipsizes on one line. Plus the asked-for THIRD VIEW: the
  category toggle cycles grid → list → **grid2** (two-wide cards —
  half the density, double the label room; brCols:2 stamped by
  gen-browse, honored by render.js's section host the same way the
  list narrows to one column). Old localStorage view values stay
  valid. Verified: probe-libui-look.mjs (left/15px/nowrap rows;
  2-column host; toggle title cycles).
- Answered: **Export downloads the current workspace only** (the
  tooltip says so); snippets are the cross-workspace carrier. A
  whole-house export-all remains an easy ⋯-menu add if wanted.
- ENGINE_V 0.83.1. Battery 20/20 green post-change; new probes
  probe-vol.mjs, probe-nits.mjs (plain-frame first-mount 349×581 +
  action-snippet round trip: 5→6 sequences), probe-libui-look.mjs.
- Studio src changes (state.svelte.js, SequencesEditor.svelte,
  PreviewPane.svelte) need the machine build + push-studio.bat;
  engine needs push-engine.bat + Fully cache clear.

## Current state (v0.83, 2026-08-12)

v0.83 — **THE SHOP WINDOW** (P0-3, beta-gaps §5 — Suresh: "The main
readme needs to sell our work and get the user excited… We get one
chance to make an impression"). The outsider docs, complete:

- **README.md rewritten product-first.** Hero GIF (real engine
  booting + D-pad walk + music controller, composited into the
  astrion device render at the true 349×581 viewport), four engine
  stills, a Studio tour GIF, the map-keys and pairing shots, a
  3-step HACS quick start, cookbook table, and the architecture
  moved below the fold (linked, not leading). Old README's technical
  content survives in ARCHITECTURE/CONTRIBUTING links.
- **All media generated from the REAL engine/Studio headlessly**
  (`tests/shoot-engine.mjs`, `tests/shoot-studio.mjs` — Playwright
  against the dist fixture with stubbed WS states; Material Symbols
  served locally because the sandbox can't reach Google Fonts — the
  same class rule Google's css2 ships had to be stubbed too, or every
  icon renders as its ligature name). 12 assets in `docs/media/`,
  2.2MB total.
- **docs/GETTING-STARTED.md rewritten for the HACS era**: zero →
  paired remote with no file shares and no copied tokens; links Brad
  Sanders' community sideloading guide for the Astrion hardware prep
  instead of duplicating it; honest fresh-install story (empty store
  → build one page → Save & Deploy → then pair).
- **docs/cookbook/** — seven task-shaped pages (first-screen,
  activities, presets, device-photo-skin, hardware-keys, workspaces,
  theming), each ending in one outcome; the old `docs/cookbook.md`
  stays as the deeper config-recipe collection, cross-linked.
- **CONTRIBUTING.md** gains the fork setup (houses\default.txt +
  wrapper scripts) and a "what makes a good PR" section; battery
  count corrected to twenty; push examples use the new script names.
- **SECURITY.md** (new): trust model, the pairing ceremony +
  guardrails, engine self-deploy stamp, forker token hygiene,
  vulnerability reporting.
- **LICENSE: GPL-3.0** (Suresh: "I would prefer if someone didn't
  take the code and make a commercial product" — GPL's
  keep-derivatives-open obligation kills closed commercial forks
  while staying real open source; Polyform NC was the alternative
  and was declined for community friction). README/CONTRIBUTING
  carry the license note.
- Media shoot states are PLAUSIBLE FICTION (album "Golden Hour" by
  The Analog Hours is generated art) — no real house data in any
  screenshot beyond the CT fixture's entity names.
- Earlier same day: **repo history reset for beta** — full history
  (which carried a real LLAT in `.env.local`, since revoked, plus
  ~250MB of scratch) archived to private `skavan/harmonium-alpha`
  via GitHub rename; public `skavan/harmonium` restarted at a
  single clean baseline commit; `.gitattributes` line-ending
  contract added (`.bat`/`.cmd` = CRLF on every checkout — four
  committed bats were LF-blobbed and would mis-parse for
  autocrlf=false forkers); `.md4h/` editor scratch untracked.

Still open for beta launch: make-release.bat run + v0.82 tag with
zip, the community-post announcement, and the video (storyboard
offered, GIFs shipped first).

---

*The changelog continues — every round from v0.82.1 back to the
first prototype — in
[`archive/docs/project-history.md`](../archive/docs/project-history.md).*
