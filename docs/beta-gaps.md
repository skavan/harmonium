# Harmonium — Beta Gap Analysis & Living Roadmap

*Purpose: the running scoreboard between "works in two houses" and
"any HA user can install this without us in the room" — what shipped,
what's open, in what order. Audience: maintainers planning the next
round.*

**Status (2026-08-21, v0.84.1 PUBLIC BETA — announced on the
Sanytron AND Home Assistant forums, same day)**: the community
debut is out. Everything the
original analysis gated on is shipped — pairing, HACS packaging,
outsider docs, the grouping card, Speaker Groups (now real tiles),
the pad doctrine's final form, four nav modes, battery alerts, four
video tutorials, dialect docs, the removal guide. §6 was rewritten
top to bottom on release day: it is now the LIVING ROADMAP, and the
first rule of this era is that **incoming issues and forum feedback
outrank everything on it**. Sections 1–5 remain the original
2026-08-12 analysis, kept for the reasoning.

Four inputs: our own pain list (auth), a scan of the two Astrion
custom firmwares, the card ecosystem's best media tricks, and the
Unfolded Circle Remote's API model. Verdicts are honest: **HAVE**
(we do this, sometimes better), **PARTIAL**, **MISS** (worth
stealing), **SKIP** (not our thesis).

---

*(§1 Onboarding & authentication, §2 Competitor scan, §3 Grouping
card, §4 UC-model adoptions, §5 Beta logistics — original analysis
preserved unchanged below §6; every P0/P1 verdict in them is now
resolved and tracked in §6.)*

---

## 6. THE LIVING ROADMAP (rewritten 2026-08-21, v0.84.1 day)

**INCOMING (2026-08-30, beta tester config-pass feedback — triage.
Reporter on the 0.86.0-dev line; NOTHING here has shipped.):**

- **Volume band type won't change — stuck on the fat (slider) default
  (FIXED in-repo 2026-08-30, unreleased).** `gen-bands.js` resolves the style on a ladder:
  per-tile `present.style` -> `device_options[entity].volume_style` ->
  the Controller-tab default (`surface.volume_style`) -> global. The
  Studio's Controller-tab "Volume style" dropdown writes the LOWEST
  rung, so any per-tile ⚙ style or a `device_options.volume_style`
  silently pins it and the dropdown reads as dead ("could change it
  earlier today"). The real defect is the SILENT override, not the
  precedence. FIXED: the dropdown now lists every pin beside it
  ("pinned: <member> = <style>") with a one-tap clear per pin
  (ControllerTab.svelte) — the override is visible and undoable where
  it bites. Tester's GitHub issue can close on the release.
- **"Advanced" reads as a checkbox but is a one-way tab (BUG, fixed
  in 0.86.0-dev source).** In `ActivityCard` / `TileRow` /
  `PageSettings` the Advanced control is a TAB (`tab = "advanced"`)
  dressed with a little square that looks like a checkbox: the square
  never fills when active, and clicking it again just re-selects the
  same tab instead of toggling off — so the only exit is clicking
  another tab ("navigating away fixes it"). FIX: fill the square when
  active and make a second click return to the default tab
  (main / setup / layout). Rebuild the Studio to verify.
- **Save + Reload Astrion fails silently unless the Fully entities are
  named `astrion1` (FIXED in-repo 2026-08-30, unreleased).** Root
  causes: hardcoded `button.astrion1_*` ids, and HA pressing a
  nonexistent button without complaint. FIXED: explicit mapping in
  map > Startup & Home (global.fully_cache_button / _reload_button),
  ladder config -> localStorage -> legacy astrion1 defaults, and both
  entities verified to exist before pressing (a miss fails loudly and
  names the fix). Button relabeled "Save + Reload Remote".
- **Entity rename orphans Activity references (LIMITATION / doc).**
  `context`, device `roles`, `device_options` and presets each hold
  entity ids; no rename-refactor rewrites them together and some refs
  aren't UI-surfaced, so a rename leaves danglers. Delete + recreate is
  the current path (and often easier). ACTION: document the "no
  automatic entity-rename" caveat; consider a "references to this
  entity" finder later.
- **Fire TV sendevent / fast d-pad — no obvious place to set it
  (ALREADY BUILT; needs Studio UI + docs).** Action-valued
  `dpad_commands` (androidtv.adb_command -> sendevent, single-digit ms)
  ship in the engine — see `docs/design-fast-dpad.md` — but it's a
  Code-tab tuning with no Studio field yet. ACTION: point testers to
  the design doc; promote "Studio field for action-valued dpad
  commands" (already deferred) — there's real demand now.
- **Fully Plus license needed for battery / reload / autostart (DOC
  gap).** Not flagged up front; the per-device cost adds up. ACTION:
  call out the Plus requirement in `GETTING-STARTED` and the astrion
  setup guide.
- **Music vs TV controllers show different bottom chrome (BY DESIGN —
  document).** TV pages carry the extra on-screen Back/Home strip
  (`boot.js`, the §7 TV strip, 2026-08-24) because the PHYSICAL pair
  drives the device there, so touch gets its own UI back/home; music
  pages don't need it. ACTION: one line of docs so it doesn't read as
  inconsistency.
- **Denon / Panasonic over IP — non-Android AVR commands (FEATURE /
  roadmap).** Tester offers testing + documentation help. ACTION: park
  under dialect expansion; take him up as a second-device test partner
  for IP-based dialects.
- **Nav opens the wrong room's controller (FIXED in-repo, 2026-08-30 —
  live-config verified, unreleased).** Deck's activities/context are correct and the
  tap flips `select.harmonium_deck_activity` — but NO room page in the
  config carries `activity_select`, so on the shared `controller:tv`
  `roomActivitySelect()` finds nothing on the whole trail and falls to
  `global.activity_select` (porch's select, holding
  `porch_watch_fire_tv`), which trumps the tapped pending activity.
  FIXED: `wire_activity_selects()` (workspaces.py), applied on a deep
  copy in `HStore.deploy()` - every deployed config carries each
  activity-owning room page's minted select (explicit values never
  overridden; the STORE copy is untouched so nothing enters the 3-way
  merge). Fences: 6 checks in test-integration-split.py +
  tests/probe-room-select.mjs (deck answers deck, porch answers porch,
  the unwired global fall-through pinned). Reaches a house via
  integration update + HA restart + one Save & Deploy. The deeper
  pending-vs-global ordering question stays with §6.7 multi-room.
- **No Back/Home chrome in a browser (FIXED in-repo, 2026-08-30,
  unreleased).**
  Not the device profile (browser was on `default`). The live config
  still has `home_screen: porch`: the Home button is hidden ON porch by
  design (you are home), Back needs nav history, and the user's new
  "Home" page - not being the configured home - shows a Home button
  that navigates to porch. FIX (today): set the workspace home screen
  to the Home page (`home_screen: home`). FOLLOW-UP: the Studio never
  surfaces which page is the home screen when pages are added around
  it - consider a hint. (The separate capability question - a browser
  on a hardware `#device=` profile inherits `physical_dpad` and loses
  touch chrome - is real but was NOT this bug.)


**INCOMING (2026-08-24, forum beta reports — triage. Both reporters
are on v0.84.1; NOTHING from the 2026-08-24 session has shipped.):**

- **Stock bands missing on a virgin install (user #2: "presets,
  speakers, groups, devices… nevermind, now it works").** Root-caused:
  the deployed starter-config reaches the ENGINE unhealed — the heal
  chain (ensureStockControllers) runs only in the STUDIO — and
  v0.84.1's starter carried an ancient 5-tile flat music controller.
  So a fresh install renders without those bands until the user first
  opens the Studio and Save & Deploys (his "now it works" moment).
  FIXED in-repo 2026-08-24: the starter's stock controllers are now
  GENERATED from stocklib, and `probe-stock-sync` fails the battery on
  any starter/stocklib drift (the same split also hid the appletv
  dialect and un-gated the transport bar). Ships with the next release.
- **`set_activity` "did nothing" (user #2).** RESOLVED (v0.85.7):
  `harmonium.set_activity` now takes `start: true` — flips the select
  first (engine parity: the tap IS the intent), then runs the
  activity's Start action ref through the SAME runner harmonium.run
  uses (sequence: refs via the stored config; script.* refs via
  script.turn_on). `activity: "off"` + `start: true` runs the ending
  activity's Stop first. Default false — every existing caller
  unchanged. His wall-switch case verbatim. tests/test-set-activity-start.py.
- **Room-page power button missing (user #2).** ROOT-CAUSED with his
  screenshots + repro (browser close/reopen) and FIXED (v0.85.7): the
  activity CARD lights from the activity's own device-state rules,
  but the End button lit from `currentActivityId()`, which read the
  SELECT alone — stale select (a start path that never flips it, an
  HA restart) → card says On, button gone. `currentActivityId` now
  falls back to device truth when the select names nothing and
  EXACTLY ONE in-scope activity is provably running (ambiguity
  abstains — never guess between rooms). Fixes the button, hold-Power
  and $context in one place. tests/probe-power-btn.mjs pins the repro
  and its fences.
- **User #1's items** (KeyMapper Expert-Mode docs; the Apple TV dialect
  + D-pad commands editor + his app-source table now the stock appletv
  app map; per-card height + the NP style family) are all in-repo,
  UNRELEASED. The Apple TV vocabulary is doc-derived — ask him to
  confirm on hardware in the release thread.


**INCOMING (2026-08-24, forum beta reports — triage):**

- **`set_activity` "did nothing" (user #2).** The service is working as
  designed but the design surprises: it flips the ROUTING select only —
  it does not run the activity's Start sequence, so no device powers on
  and "nothing seemed to happen." The HA-side full start is
  `harmonium.run` with the activity's Start sequence (whose generated
  steps include the `set_activity`, workspace-stamped by `_bind_ws`).
  ACTION: document both entry points in services.yaml + cookbook; then
  DECIDE whether `set_activity` should grow a `start: true` option that
  runs the sequence — probably yes, it is what every caller expects.
- **Room-page power button intermittently missing while an activity
  runs (user #2, no repro yet).** `updateBarChrome` hides `#endBtn`
  when `currentActivityId()` is null; prime suspects: (a) the standing
  room's select briefly `unknown/unavailable` after an HA restart or
  integration reload — the button vanishes until the next state diff;
  (b) multi-room: standing on a room whose OWN select is off while
  another room runs (per-room by design, but reads as a bug). ACTION:
  reproduce via select-unavailable in a probe; consider keeping the
  button while the select is merely unavailable.
- **Both users' shipped fixes** (Expert-Mode docs, the Apple TV dialect
  + D-pad commands editor + stock app map, per-card height + the NP
  style family, stock bands on virgin installs via the starter
  regeneration + `probe-stock-sync` drift guard) ride the next release.
  The Apple TV command vocabulary is doc-derived — ask reporter #1 to
  confirm on hardware in the release thread.


### 6.0 Shipped since the last update (v0.83.10 → v0.84.1)

Pad doctrine final form (pad navigates; passthrough + CH-borrow on
TV only) · four nav modes (action/value/options/capture, per-tile
`nav` override) · chips/steppers/climate/light/fan converted to
value/options (select-capture dead outside passthrough) · Speaker
Group page as real tiles (join/unjoin on OK, group volume,
unlink-all) · focus survives structural re-renders · CH section
jumps scoped to on-screen browse · library tab strip auto-scroll ·
media holds (seek/track-skip) + menu→Library · astrion2 profile +
skin (2026 faceplate, F4–F7 transport) · default app-launcher wake
· switch teardown (`stop_on_switch` + `confirm_switch` in Studio) ·
battery-alerts blueprint v3 + Studio panel + Test · wake-lock
forensics (Companion-app SKIP warning; measure-first guide) ·
creating-a-dialect + remove-harmonium + browser-front-door docs ·
four videos · key map regenerated with all hold gestures.

### 6.1 Now (the beta-watch fortnight — no speculative code)

- Answer forum replies + GitHub issues FAST; first reporters get
  same-day turnaround. Incoming feedback re-orders everything below.
- Re-point CT's blueprint import at the GitHub URL; repo links into
  the YouTube descriptions; delete `skins/_to_delete/`.
- Announcements LIVE (watch both):
  [Sanytron topic](https://forum.sanytron.com/t/harmonium-a-fast-activity-based-universal-remote-platform-for-the-astrion-built-on-home-assistant-open-beta/294)
  ·
  [HA Community topic](https://community.home-assistant.io/t/harmonium-a-fast-activity-based-universal-remote-platform-for-home-assistant-open-beta-via-hacs/1022037)
  (plus showcase-thread post #15). Still owed: cross-link footer on
  the Sanytron topic pointing at the HA topic; r/homeassistant once
  the HA thread settles. One venue at a time.
- **Public ROADMAP.md in the repo** distilled from this section, so
  the community sees where it's going and issues can link to it.
- 2026-08-21 (RS90 round): the **HA100 density story** — the
  Astrion's density-220 is a FACTORY override (physical 200 +
  shipped override; fleet-verified on a virgin Sanytron user's
  unit), so no user-facing gap existed. `remotes/setup-remote.bat` now
  RE-ASSERTS it per model (insurance against a reset clearing it);
  README/GETTING-STARTED updated. Same fleet probe delivered the
  real find: **stock Astrion webview = Chromium 61** → the engine
  gained a hard SYNTAX FLOOR (six post-61 usages fixed, guarded
  forever by `tests/probe-syntax-floor.mjs`, doctrine in
  CONTRIBUTING). A `device-facts.bat` ask to any forum user =
  fleet telemetry; keep doing it.

### 6.2 v0.84.x candidates (small, high-value, in rough order)

1. **Per-remote hub in the Studio** — his "at a maximum": battery
   tiers edited in-Studio, skin, keymap, provisioning in one place.
2. **`nav` mode dropdown** on the tile editor (engine honors it
   today).
3. **Volume/mute hardware-key OVERLAY** (§2 astrion trick) — big
   transient overlay readable at 3 m.
4. **`volume_step` per device + the UNAVAILABLE-contract test**
   (§4.1/§4.2).
5. **Section-card folding** in the Studio (§ old 6.8 second half).
6. **Dialect visual editor** (the cookbook promises it).
7. **astrion2 in the flesh**: verify color-bar keycodes (unknown
   until hardware), hotspot tweaks, transport row end to end.
8. **Stock TV: menu_hold → Apps drawer** (2026-08-21, Suresh: "Its
   the one screen on TV controller that is kind of hard to get to
   without screen press"): ship it as a stock TV-screen binding
   (gen bump), symmetric with music's menu → Library — short Menu
   stays device passthrough, long Menu opens Apps. Engine is ready
   today (menu_hold rides the binding ladder); the gen-heal
   delivers it to existing configs. Document the KeyMapper half
   (Menu long-press → KEYCODE_AT) in hardware-keys' hold table.
   (His house: fixed by hand 2026-08-21 — KeyMapper row + Studio
   binding; his fresh KeyMapper pull had LOST the Menu long-press
   row, and his live config never had the binding.)
9. **Stock keyboard (IME) text entry** (2026-08-21, Suresh): today
   the only typing surface is the library search's key-walk plus a
   physical keyboard. Focusing a real `<input>` summons Android's
   soft keyboard in Fully — offer it as an opt-in text mode for
   library search (and reuse it anywhere text is needed: pair-screen
   host entry, future rename fields). Mind the search-typing
   doctrine (printable keys must keep routing as buttons when the
   IME mode is off).

### 6.3 New cards (the widget gap list — 2026-08-21, Suresh)

Inventory of missing/thin tile types, roughly by expected demand:

- **Lock** — state + lock/unlock (confirm on unlock), jammed state.
- **Vacuum** — state, start/pause/dock, battery, fan speed chips.
  (Map rendering, if ever: Dmitry's flicker report next door says
  hold the last-known image through brief unavailability — our
  UNAVAILABLE contract, §4.2, already implies this.)
- **Sensor readout** — value + unit + name; template-able; the
  building block half the requests will reduce to. (Sparkline/
  history is a possible later layer — keep the first cut static.)
- **Weather** — current + short forecast from a `weather` entity.
- **Fan upgrade** — widget exists (toggle + ◀▶ speed); add preset
  chips + oscillate where the entity offers them.
- **Camera** — snapshot tile (still refresh, tap for larger; MJPEG
  streams are a battery/webview hazard — stills first). Validated
  by Dmitry's intercom use case in the astrion-custom thread: the
  full story is camera card + HA→remote push (§6.7) + a `when`
  clause (§6.5).
- **Alarm panel** — arm/disarm with code entry; pairs with Lock as
  the "security" story.
- **Scene** — scene domain sibling of the script tile.
- **Generic select** — any `select`/`input_select` as an options
  row (falls out of the composite card's data-driven chips ↓).
- Humidifier, timer, person/presence — demand-driven tail.

Each lands as: widget + nav-mode declaration + detail-page
generator entry + Studio Draws-as entry + a probe stage + a
FORMAT.md row. The chassis makes these mostly mechanical.

### 6.4 THE COMPOSITE CARD (design sketch — "a receiver with
### surround modes")

The generalization that makes half of §6.3 configuration instead of
code. Today `CHIP_KINDS`/`STEP_KINDS` are a hard-coded vocabulary;
the composite card makes the same primitives **data-driven**: a
tile whose config is a list of ROWS, each row one of the existing
interaction primitives bound to any entity/attribute/service.

```jsonc
{ "type": "card", "label": "Denon AVR", "entity": "media_player.denon",
  "rows": [
    { "row": "options", "label": "Input",
      "options_attr": "source_list", "current_attr": "source",
      "set": { "service": "media_player.select_source", "key": "source" } },
    { "row": "options", "label": "Surround",
      "options_attr": "sound_mode_list", "current_attr": "sound_mode",
      "set": { "service": "media_player.select_sound_mode", "key": "sound_mode" } },
    { "row": "value", "kind": "volume" },
    { "row": "buttons", "items": [
      { "label": "Pure Direct", "action": { "service": "denonavr.set_sound_mode_pure" } },
      { "label": "Zone 2", "action": { "navigate": "detail:media_player.denon_zone2" } } ] },
    { "row": "readout", "label": "Now", "attr": "media_title" }
  ] }
```

Row vocabulary = exactly the four nav modes: `options` (chips,
◀▶ rove + OK commits), `value` (a stepper/slider on any numeric
attr with a set service), `buttons` (a preset row), `readout`
(sensor line). The pad walks rows inside the card like the speaker-
group page walks tiles (rows as focus stops — the machinery the
grouping rewrite proved out). Studio: a row-list editor, each row a
small form. This one deserves a short design doc before code —
focus-stop nesting and the Studio editor are the two real problems;
the engine rendering is assembled from parts we have.

### 6.5 CONDITIONALS (design sketch — "show this card WHEN")

Per-tile / per-section `when` clause, declarative (no Jinja in the
engine — it must stay evaluable client-side against subscribed
state):

```jsonc
"when": { "entity": "binary_sensor.house_occupied", "is": "on" }
"when": { "entity": "sensor.astrion1_battery", "below": 20 }
"when": { "all": [ {…}, { "entity": "select.x", "not": "off" } ] }
```

Grammar: `is` / `not` / `above` / `below` / `in`, combinable with
`all`/`any`. Evaluated in `visibleTile` (the hide machinery already
exists — unwired-context hiding and capability `only`/`unless` are
the precedents); referenced entities join the page's subscription
list automatically. Section-level `when` folds the whole section.
Studio: a small condition-builder on tile ⚙ and Section settings.
Care: focus repair when the focused tile disappears (the tileSig
focus-keeper already handles this), and a "why is my tile missing"
affordance in the Studio preview (badge tiles hidden by `when`).

### 6.6 RS90 — proper UI & setup support (2026-08-21, promoted)

The second remote model, treated as a product feature rather than a
personal runbook. Pieces (see also `todo-remote-pairing.md`):

- Field-test the v0.56 describe-and-learn loop on real hardware
  (the `e.key` stability question is THE risk).
- A stock `rs90` profile once the hardware is in hand: capabilities,
  keymap conventions, KeyMapper recipe doc, device photo + hotspots.
- The **photo-hotspot V2 UX**: photograph the remote, drag regions,
  each region a slot — describing hardware stops being a typing
  exercise. (Open: image storage, rect authoring, Studio-only vs
  engine.)
- Generalized setup docs: "pairing a NEW remote model" as a
  first-class cookbook path (remote-map.md is the seed).

### 6.7 Design conversations (need Suresh before code)

- **Multi-activity rooms** (music + TV concurrently) — PROMOTED
  2026-08-21 (Suresh, after Dmitry's DM: "many activities can be
  active. We need to think through our mental model"). Sketch: the
  activity select is a scalar doing three separable jobs. (1)
  TRUTH = the RUNNING SET, not a scalar — per-activity running
  entities minted by the integration (Dmitry's "array of
  activities"). (2) FOCUS = per-REMOTE pointer to the activity the
  UI fronts (controller shown, volume/mute + padMedia target);
  today's select becomes exactly this, so select-keyed automations
  survive. (3) EXCLUSIVITY = derived from DEVICE CLAIMS, never from
  the room: activities already declare devices/roles, so start
  preempts only overlapping activities — `stop_on_switch` matures
  into "stop when actually preempted" and music surviving a TV
  launch needs no config. One-liner: activities are processes,
  devices are resources, the remote focuses one process at a time.
  Staged: (0) Active Activities card over today's model (tap =
  refocus, hold = stop — Dmitry's original ask; shippable before
  his second Astrion arrives), (1) conflict-based preemption
  replacing blanket switch teardown, (2) true same-room sets +
  per-remote focus. Open for the design doc: where running-set
  truth lives, what a room hub shows with 2 running, select-as-API
  migration. Dmitry (dskudrin) is running a side-by-side vs
  astrion-custom on a second Astrion (~1 month out) — the natural
  first outside reviewer for this design.
- **Teach-mode**: the hidden capture-hint machinery, resurrected
  deliberately (first-run hints? long-press ⓘ?).
- **IR / Bond**: his README calls it out. Possible shape: IR
  blasters as a dialect-like catalog (learned codes as keys), Bond
  as the first backend.
- **Microphone / voice** (2026-08-21, promoted from the parked
  tail): the Astrion has a mic pill and HA has **Assist
  pipelines** — the natural shape is push-to-talk on the voice key:
  `getUserMedia` in the Fully webview (mic permission is a Fully
  setting) → HA's `assist_pipeline` WebSocket API (binary audio
  frames) → transcript + response in a transient overlay; the same
  capture could drive dictation into library search. Open
  questions: the stock webview's audio-capture reliability
  (stock Astrion = Chromium 61, fleet-measured 2026-08-21; the
  reference unit runs sideloaded Google WebView 136, RS90 stock is
  91 and firmware-locked), pipeline selection per house, and whether
  responses speak (TTS to the remote) or stay visual. Marcus's
  native Siri work shows the appetite; ours must stay
  webview-honest.
- **Remote as a first-class HA citizen** (2026-08-21, sourced from
  Dmitry/dskudrin's feedback in the astrion-custom HA thread —
  /t/1020169): two halves. (a) **HA→remote command channel**: HA
  tells a SPECIFIC remote to navigate — `open_page`, `back`, `home`,
  open-current-activity, transient popup — for automations like
  "doorbell rings → intercom page on the living-room remote". The
  engine already holds a live websocket; the cheap shape is
  subscribing to a `harmonium_command` event filtered by remote id
  (profile name). Latency is our advantage — dckiller's users
  report visible page-switch lag; ours would ride the same socket
  the state diffs do. (b) **Exposed remote state**: battery /
  charging / online exist today via the Fully Kiosk integration but
  as loose sensors; a per-remote HA device grouping them + current
  page + running activity (the select already covers activity) is
  the tidy version. (b) is integration work; (a) is mostly engine
  and pairs naturally with conditionals (§6.5). Dmitry's wishlist —
  activity/page separation, back-stack, per-activity buttons,
  HA-side activity truth — is otherwise a checklist of things
  Harmonium ALREADY does; he is the profile of user the beta wants.
- **Composite card** (§6.4) and **conditionals** (§6.5) both get a
  blessing conversation before build.

### 6.8 Infrastructure (community-proofing)

- **CI**: GitHub Action running the smoke battery + probes on PRs
  (community PRs are coming; today only our ceremony guards them).
  The suites are headless-Chromium already — this is wiring, not
  writing.
- **Release automation**: Action that rebuilds engine+studio,
  verifies build determinism against the tagged dist, attaches the
  zip, runs the link sweep and hacs validation.
- **Diagnostics export**: one tap on the diag: screen → sanitized
  bundle (versions, caps, profile, tile counts — never tokens/
  entity names without consent) for pasting into issues.
- **Config safety**: auto-snapshot before every Save & Deploy with
  a visible restore list (restore_backup exists server-side; give
  it a Studio face).
- **Perf guard for big houses**: an entity-count/subscription audit
  probe — strangers have 3,000-entity installs.
- **HACS default store + home-assistant/brands** submission once
  the beta stabilizes; git-history rewrite if wanted before that
  spotlight.

### 6.9 Parked, demand-driven (unchanged)

PIN pairing variant · idle/burn-in view · transport auto-collapse ·
i18n (two layers) · TTS responses (rides the mic work, §6.7) ·
`device_class` Studio smarts (§4.4) ·
dialect naming conventions doc (§4.3) · auto-derived Watched
entities · per-person profiles.

---

*(Original §1–§5 follow, unchanged, for the reasoning.)*

---

## 1. Onboarding & authentication (the #1 beta blocker)

Today: paste a long-lived token into a tiny on-screen keyboard, or
bake it into a provisioning URL. Fine for us; disqualifying for beta.

### What HA actually offers (verified against the auth docs)

- **OAuth2/IndieAuth** (`/auth/authorize` → `/auth/token`): the
  proper flow, but it requires the USER TO LOG IN **on the device
  doing the flow** — typing an HA password on a remote is worse than
  the token.
- **`auth/long_lived_access_token`** WebSocket command: any
  authenticated session can mint a named long-lived token
  (`client_name`, `lifespan`) for its own user. **This is the key.**
  The Studio, already authenticated in a desktop browser, can mint
  tokens on the remote's behalf.
- Integrations can also reach `hass.auth` internals, but the WS
  command from the Studio's user context is the documented, least-
  magic path.

### Proposed design: Bluetooth-style pairing (the "does this code
### match?" flow)

The trusted side is the STUDIO (a full browser, logged in). The
untrusted side is the remote. The Harmonium integration brokers.

1. **Remote, unprovisioned**: boots to a Pair screen. Finds HA
   (mDNS, or the one thing you type once: the host). POSTs to a new
   unauthenticated integration endpoint `POST /api/harmonium/pair`
   → gets `{session, code}` and displays the code big:
   **`FIG-482`** (5–6 chars, unambiguous alphabet, no 0/O/1/I).
   Remote then long-polls `GET /api/harmonium/pair/<session>`.
2. **HA side**: the integration fires a persistent notification
   ("A Harmonium remote asks to pair — open the Studio") and the
   Studio shows a pending-pair banner with the SAME code.
3. **The human check**: user compares the code on the remote's
   screen with the code in the Studio — numeric-comparison pairing,
   exactly the Bluetooth model. Click **Approve**.
4. **Mint & release**: the Studio calls
   `auth/long_lived_access_token` over its own authenticated
   websocket (`client_name: "Harmonium <remote-name>"`), hands the
   token to the integration (`POST /api/harmonium/pair/<session>/
   approve`, authenticated), which releases it **once** to the
   remote's poll and closes the session. Remote stores it in
   localStorage exactly as today — everything downstream is
   unchanged.
5. **PIN variant** (remote has no screen yet / headless kiosk): the
   Studio displays a 4-digit PIN instead; the user types it on the
   remote's D-pad. Same session, direction reversed. Both variants
   share the session machinery; build the code-match first (zero
   typing beats four digits).

Security posture: the pair endpoint is unauthenticated but only
creates a short-lived session (5 min TTL, rate-limited, LAN only);
nothing is released without an authenticated approval bound to the
code the human compared; the token is fetched exactly once; every
minted token is visibly named in the user's HA profile and
individually revocable there (instant remote de-authorization —
a feature we should document, not hide).

Interim cheap win (steal from astrion-custom): even before pairing
lands, "**enter the token from your phone**" — the remote briefly
serves (or the integration proxies) a tiny provisioning page so the
token is pasted from a real keyboard on a phone browser, never typed
on the remote. Possibly one evening of work; retire it when pairing
ships.

Effort: integration endpoint + session store (~150 lines Python),
Studio banner + approve flow (~100 lines Svelte), engine Pair screen
(~100 lines). No new dependencies. **P0.**

---

## 2. Competitor scan — the tricks matrix

### marcusadolfsson/astrion-custom (Kotlin launcher for the HA100)

| Trick | Verdict | Notes |
| --- | --- | --- |
| Setup web server on the remote (:8099) for credential entry from a phone | **MISS** (as interim) | The pragmatic half of §1; superseded by pairing |
| Volume/mute OVERLAY on hardware volume keys | **PARTIAL** | We flash the status bar; a large transient overlay reads better at 3m. Cheap. |
| VOICE key → mic streaming | **SKIP** (for beta) | Already on our roadmap as mic/IME; not a beta gate |
| Screen-wake input bridge (keys work with screen off) | **SKIP** | Device-specific root/ADB territory; document, don't build |
| Conditional card rendering on entity state | **HAVE** | `only`/`unless` capability flags + `when` visibility rules |
| YAML layout in HA + "Sync" push | **HAVE** | Studio + deployed config.json is strictly stronger |
| Auto-collapse transport when idle | **PARTIAL** | Our Now Playing is static; idle collapse is a nice-to-have |

### dckiller51/astrion-custom-dashboard (fork)

| Trick | Verdict | Notes |
| --- | --- | --- |
| Online visual editor (GitHub Pages) | **HAVE** | The Studio, and ours is live-preview |
| In-app update checker against GitHub Releases | **MISS** | Beta users need to KNOW they're stale — see §5 |
| Two-layer i18n (UI strings + HA state label translations) | **MISS** (accept for beta) | We are English-only; note it in the README, collect demand |
| Harmony Hub integration | **SKIP** | HA integrations already surface Harmony as remote entities |
| CardRegistry / dynamic card types | **HAVE** | WIDGETS registry |

### kalkih/mini-media-player (the card everyone actually uses)

| Trick | Verdict | Notes |
| --- | --- | --- |
| **Speaker group management** — checkbox join/unjoin, coordinator-aware | **MISS — the headline** | See §3. We have config-time cast groups; we have NO runtime bonding UI |
| `sync_volume` + per-speaker `volume_offset` (group volume that keeps relative levels) | **MISS** | Belongs in the same card |
| Media shortcuts row (playlists/sources as buttons) | **HAVE** | Presets, and ours warm-start activities |
| TTS input box | **SKIP** (beta) | Wall-panel feature, not remote-first |
| Idle view / artwork modes / adaptive text color | **PARTIAL** | We have art + hero; no burn-in-conscious idle view for always-on kiosks. P2. |
| Progress bar | **HAVE** | Shared 1s ticker, interpolated |

### Unfolded Circle Remote Two/Three (the commercial benchmark)

| Concept | Verdict | Notes |
| --- | --- | --- |
| Activities with on/off sequences, button maps, per-activity UI pages | **HAVE** | Our activities + controllers + dialects are the same shape, deeper on routing |
| Profiles (per-person UI configs) | **PARTIAL** | We have per-REMOTE profiles + workspaces; per-PERSON is a non-goal for beta |
| Groups with a group power switch, collapsible | **HAVE** | Cast groups + group nav cards |
| Page image headers | **HAVE** | Banner/hero |
| `simple_commands` vocabulary with prefix conventions (`INPUT_`, `APP_`, `MODE_`, `ZONE_`) | **PARTIAL** | See §4 — our dialects are richer but less regular |
| `volume_steps` option per device | **MISS** (tiny) | Fixed-step devices (AVRs) overshoot with repeat-fire; a per-device step size is one field |
| Explicit `UNAVAILABLE`/`UNKNOWN` states in the contract | **PARTIAL** | We grey-out ad hoc; §4 proposes making it a rule |

---

## 3. The media_player GROUPING card (build this)

The one important trick the scan surfaced that we truly lack.
Verified: nothing in `src/` calls `media_player.join` /
`media_player.unjoin` or reads `group_members` — every Harmonium
"group" today is a config-time VIEW (cast groups), and bonding two
speakers requires a hand-authored preset sequence.

Design sketch (fits the existing grammar):

- **A `bond` generator** (sibling of `volumes`/`groups`): renders one
  row per groupable player in the activity's world — checkbox tiles,
  coordinator-aware (`group_members[0]` is the master; joining acts
  on the CARD's player as coordinator, mini-media-player's rule).
  Tap = `media_player.join` / `unjoin` with optimistic UI off the
  `group_members` attribute we already receive in state diffs.
- **Group volume** — when ≥2 members are bonded, the volume band's
  master row drives all members PROPORTIONALLY (keep relative
  offsets, the `sync_volume` lesson), member rows stay individual.
- **Where**: `shows: "bond"` in the ⚙ Draws-as list for media_player
  members, and the generator on music controllers by default when
  the platform supports grouping (Sonos, MA, Squeezebox, HEOS…
  detectable: `group_members` present in attributes).
- The astrion overlay trick folds in here too: hardware vol keys
  while a group is active → transient overlay showing per-member
  bars.

Effort: one generator + one widget + capability sniff; the Studio
side is a Draws-as entry. **P1, first feature after auth.**

---

## 4. JSON-structure ideas worth adopting (from the UC entity model)

Their discipline, our vocabulary — four cheap adoptions:

1. **`volume_steps` / step size per device** (`devices.<id>.traits.
   volume_step`): AVRs and TVs with coarse steps stop overshooting.
2. **A stated UNAVAILABLE contract**: one rule in the engine — an
   entity in `unavailable`/`unknown` renders its tile dimmed with a
   subtitle, never dead buttons. We mostly do this; write it down in
   FORMAT.md and test it (a 21st suite case, not a rework).
3. **Command-name conventions for dialect keys**: UC's `APP_*` /
   `INPUT_*` / `MODE_*` prefixes make configs self-documenting and
   future export/import to other ecosystems tractable. Adopt as a
   RECOMMENDATION in docs, not a migration.
4. **`device_class` on devices** (`tv`, `receiver`, `speaker`,
   `streaming_box`, `set_top_box`): one optional field that lets the
   Studio pick smarter defaults (icon, guessed roles, Draws-as
   filtering) than domain sniffing alone. We already guess from
   domain + platform; this is the tie-breaker.

Their features/attributes/commands split itself: **SKIP** — our
widget-infers-from-entity model is the lighter design and it's the
thesis; formalizing capability flags buys generality we don't need.

---

## 5. Beta logistics (nothing to do with code quality)

- **Distribution**: HACS is the only channel beta users accept.
  Restructure: the integration (already `custom_components/
  harmonium`) HACS-installable; engine + studio ship INSIDE it
  (served from the integration, not hand-copied to `www/`). Our
  push*.bat workflow stays for us; beta users get HACS + a Studio
  "update available" banner (the dckiller51 trick, pointed at
  GitHub Releases).
- **Versioning**: we already stamp engine versions; add a repo-level
  semver + tagged releases + a CHANGELOG.md distilled from
  PROJECT.md's log.
- **Docs for outsiders**: README (what/why/screenshots), INSTALL
  (HACS + pairing), a 10-minute quickstart (starter config → first
  activity → first remote), SECURITY.md (token model, revocation,
  LAN posture). Our internal docs are deep but written for us.
- **The frozen-house problem generalized**: beta users = many
  Jamaicas. The config `version:` field + normalize-on-load already
  heals old configs — state a compatibility promise ("configs never
  break within a beta series") and keep the healers additive.
- **Issue intake**: GitHub issue templates asking for config export
  (Export button exists) + engine version + device. No telemetry.
- **License**: pick one before the first outside install (MIT to
  match the ha-fusion/mini-media-player ecosystem, unless you feel
  otherwise).
- **i18n**: explicitly deferred; English-only noted in README.

Sources: HA auth API docs (developers.home-assistant.io/docs/auth_api),
marcusadolfsson/astrion-custom README, dckiller51/astrion-custom-
dashboard README, kalkih/mini-media-player README,
unfoldedcircle.github.io/core-api (entities index, media_player
entity, remote-ui).
