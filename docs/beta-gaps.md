# Harmonium — Beta Gap Analysis (2026-08-12)

Purpose: what stands between "works beautifully in two houses" and
"another HA user can install this without us in the room." Four
inputs: our own pain list (auth), a scan of the two Astrion custom
firmwares, the card ecosystem's best media tricks, and the Unfolded
Circle Remote's API model. Verdicts are honest: **HAVE** (we do this,
sometimes better), **PARTIAL**, **MISS** (worth stealing), **SKIP**
(not our thesis).

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

---

## 6. Priorities

**P0 — gates the beta**
1. Pairing auth (§1) — code-match flow, PIN variant after.
2. HACS packaging + versioned releases + update banner (§5).
3. Outsider docs: README / INSTALL / quickstart / SECURITY (§5).

**P1 — first features after the gates**
4. Grouping card + proportional group volume (§3).
5. `volume_step` trait (§4.1) and the UNAVAILABLE contract test
   (§4.2).
6. Volume/mute hardware-key overlay (§2, astrion).

**P2 — polish that can trail the beta**
7. Idle/burn-in view for always-on kiosks; transport auto-collapse.
8. `device_class` Studio smarts (§4.4); dialect naming conventions
   doc (§4.3).
9. i18n, TTS, mic — demand-driven.

Sources: HA auth API docs (developers.home-assistant.io/docs/auth_api),
marcusadolfsson/astrion-custom README, dckiller51/astrion-custom-
dashboard README, kalkih/mini-media-player README,
unfoldedcircle.github.io/core-api (entities index, media_player
entity, remote-ui).
