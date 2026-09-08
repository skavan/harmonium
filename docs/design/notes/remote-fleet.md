# The remote fleet — units, the command bus, and Save + Reload fan-out

Status: **RULED (2026-09-02).** Suresh: "I now have 4 remotes registered with Harmonium, but in the Remotes & Keymaps page, I only see remote profiles and Battery alerts. Surely I should see the remotes? And be able to manage them. Wouldn't that be step 1?" — yes. This doc is that step and the fan-out it unlocks, designed under one hard constraint he stated in the same breath: **battery is a platform weakness** (a stripped remote burns ~22%/day; fully loaded ~80%/day), so the fleet feature must add approximately nothing to the radio budget.

## What "registered" actually leaves behind (the gap)

Pairing deliberately burns its session after handing over the token (pairbook.py's security posture — correct, keep it). What remains per unit: a named long-lived token in the owner's HA profile, credentials in that device's localStorage, and loose Fully sensors if wired. `config.remotes` is PROFILES — outfits (skin, keymap, battery wiring), not units. Nothing anywhere lists "these four units exist, wearing these profiles, last seen here." The Remotes & keymaps page shows everything the system knows, which is why it shows no remotes.

## The design in one paragraph

Each running engine announces itself over channels it already pays for, the integration keeps a small persisted ledger (the FLEET), the Studio's Remotes & keymaps page grows a "Your remotes" section reading that ledger with per-unit Reload and Identify buttons, and commands travel DOWN over the state stream the remotes already subscribe to — a one-entity bus. Save & Deploy fan-out is then not a feature but a consequence: after a successful deploy the Studio drops one `reload` on the bus addressed to the workspace.

## Unit identity

A unit is not a profile (two units can wear one profile). Each engine mints a persistent unit id once — `hakr_unit` in localStorage, 6 chars — and introduces itself as `{unit, name, profile, workspace, version, page}` where name defaults to the profile. The ledger is keyed by unit id. Wiping a device's storage mints a new id; the old row goes stale and can be removed from the Studio — honest, and no heuristics.

## Channel UP — hello (REST, piggybacked)

`POST /api/harmonium/hello` (authenticated view, ANY token's privilege — remotes are not admins). Body: unit, name, profile, workspace, version, page, and battery/charging read locally via Fully's JS API when present (no HA sensor dependency, works for every unit). Fired: once on `auth_ok` (connect and every reconnect), and then piggybacked on the EXISTING 25s staleness-watchdog tick — every 12th tick (~5 min), only while the page is visible. **Battery ledger: zero new timers, zero new sockets, one small POST per 5 visible minutes on a radio the watchdog ping wakes anyway; a sleeping remote sends nothing and its row honestly reads "asleep".**

## Channel DOWN — the command bus (one entity on the existing subscription)

The obvious shape — engine subscribes to a custom `harmonium_command` event — is wrong twice: `subscribe_events` for custom events is admin-only in HA (remote tokens must not be admins), and a second subscription is a second thing to keep alive. Instead the integration owns one sensor, `sensor.harmonium_command_bus`: state = a sequence number, attributes = `{seq, verb, target, workspace, ts}`. Every engine adds this one entity id to `entitiesFor()` unconditionally, so commands arrive as ordinary state diffs on the socket that is already open — allowed for any token, zero marginal battery. Engines guard with: seq must be unseen this session, `ts` must be fresh (≤30s — a remote booting hours later must NOT replay the last reload), and the address must match (unit id, profile, workspace, or `all`).

`POST /api/harmonium/command` (admin — this is the Studio's side) validates the verb and bumps the bus.

## Verbs (v1: two)

- `reload` — the engine reloads to pick up a deployed config, IMMEDIATELY (round 9 ruling: the first cut's 10s-of-quiet gate was dropped — you pressed the button, the remote obeys). No cache clearing is needed by design: config.json is fetched no-store and the engine rides a version-stamped URL, so a plain `location.reload()` always boots the freshly deployed pair; Fully's clear-cache button remains for true emergencies.
- `identify` — the status bar flashes the unit's name three times, so a fleet row maps to a physical remote in the hand.

The bus grammar deliberately reuses §6.7(a)'s "HA→remote command channel" shape — `open_page` and friends can join later as new verbs with zero new plumbing. This is the same mechanism, built battery-first.

## The ledger (integration)

`fleet.py` — pure stdlib, no HA imports, unit-tested like pairbook: upsert on hello, list with computed liveness (fresh ≤ 6 min = online; ≤ 24 h = asleep; older = stale), remove. Persisted in the integration's store (debounced — a hello updates memory always, disk at most every 5 min) so restarts do not amnesia the fleet. `GET /api/harmonium/fleet` (admin) lists; `DELETE /api/harmonium/fleet/<unit>` removes a stale row.

## Studio — the Remotes & keymaps page grows its missing half

"Your remotes" section ABOVE profiles: one row per unit — liveness dot, name, profile worn, workspace, engine version, battery %, last seen — with Reload and Identify per row and Reload all in the header. Save & Deploy: after a successful config POST the Studio posts `{verb: "reload", workspace}` and toasts "Reloading N remotes". Removal (✕) only offered on stale rows.

## v2 — the Fully link (ruled 2026-09-02: "link it to a Fully Kiosk profile… Does that make sense?" — yes)

A fleet row and its Fully Kiosk HA device are the same physical remote seen from two sides; v2 marries them. Each row expands (▸) to: a **Fully Kiosk device** picker (every `fully_kiosk` device in HA, with a suggestion when one's configured host equals the unit's hello ip), a **Friendly name** (defaults to the Fully device's name; the row leads with friendly → Fully name → profile), and **⟳ Refresh** (re-pulls name, battery and URL — a rename in Fully shows up on the next refresh). The link is stored on the ledger row (`friendly`, `fully_device` — Studio-owned fields a hello can NEVER touch), so it survives restarts and re-pairs. A linked unit's battery/charging come from the Fully sensors — fresh even while the remote sleeps, beating the hello's own report — and Identify flashes the friendly name (the command payload carries `label`; constant shape, like every bus field).

One honest correction to the ask: Fully's HA integration does not expose the START URL as an entity — only **Current page** — so the row shows the live URL (`showing: …`), which on a kiosk is the start URL in practice; the true setting stays in Fully's remote admin.

**Create a battery alert** (ruled: create + link out): one click POSTs a new automation pre-wired to the linked device — the installed battery-alerts blueprint (found by globbing `blueprints/automation/*/battery_alerts.yaml`, since import sources name their folder unpredictably) with the device's battery/plugged sensors and TTS/overlay notifiers, standard tiers. The existing Battery alerts panel below discovers it immediately; tuning stays in HA's blueprint form via Edit levels (the full in-Studio tier editor remains the 0.84.2 roadmap dream). A row whose battery sensor already has an alert shows "Battery alert ✓" instead.

## Deliberately NOT in v1

~~Rename~~ (shipped in v2 as the friendly name). Per-unit token revocation (that is HA's own profile page and should stay there — but the fleet row TELLS you the token name to revoke). Remote-initiated config self-refresh (DECLINED earlier and stays declined — the bus only speaks when the human deploys or presses a button). open_page/popup verbs (§6.7 follow-up). Exposing fleet rows as HA entities (§6.7(b), separate decision).

## The battery finding itself (logged, separate work)

22%/day stripped vs ~80%/day loaded is a real engine finding, not a fleet concern. Suspects to audit, in order: the 1s Now Playing progress ticker (does it run on pages without media? while hidden?), subscription breadth on busy pages (every entity diff wakes the radio), the 25s watchdog ping interval (could stretch when hidden), rAF loops that survive navigation, and Fully-side settings (brightness, screen timeout — measure before blaming the engine). The audit belongs on the 0.87+ list as its own measured pass: instrument first (message counts + wake sources per hour on a real unit), then cut. This feature adds: 1 REST POST per 5 visible minutes + 1 entity on an existing subscription — designed to be invisible in that audit.

## Fences

`tests/test-fleet.py` (pure python: upsert, liveness math, persistence round-trip, remove). `tests/probe-remote-fleet.mjs` (engine: hello fired on auth_ok with unit id + battery fields; bus diff with fresh ts + matching workspace → reload deferred while input is recent, fired after quiet; stale ts ignored; seq replay ignored; identify flashes). Studio: probe-battery-studio grows a fleet fixture (units render, Reload posts the right body, stale row shows ✕).
