# Reply — the config-pass feedback list (post with/after the v0.86.0 release)

*Audience: the beta tester whose "Minor Problems / Issues" list arrived 2026-08-30. Post to the forum thread once v0.86.0 is tagged. Tone: his list drove a release — say so.*

---

This list was gold — nearly all of it is addressed in v0.86.0, and two items changed the release's shape. Point by point:

**Volume band stuck on the fat one — your bug, confirmed and fixed.** The Controller tab's Volume style dropdown sets the activity *default*, and a per-row ⚙ style or per-member volume option silently outranked it — which is exactly the state you were in. In 0.86.0 the overrides are listed right beside the dropdown ("⚙ pinned: …"), each with a one-tap ↺ to clear. No need for the GitHub issue unless you'd like to confirm the fix.

**Fire TV sendevent — now first-class, and your ask set the design.** Platforms (the editor formerly known as Apps) can now **derive a class**: clone Fire TV into your own (say FireTV-SE), and the built-in keeps flowing underneath — new stock apps still arrive, your changes win, your removals hold. D-pad commands accept full HA actions (the `androidtv.adb_command` → `sendevent` fast path) with a proper ⚡ editor — no more Code tab, and no more `[object Object]`. The recipe and the field-measured key codes are in `docs/design-fast-dpad.md`.

**Save + Reload Astrion silent-fail — fixed.** It was hardcoded to `astrion1`-named buttons. It's now **Save + Reload Remote**: wire your remote's Fully buttons in map → Startup & Home → Remote reload, and if a button doesn't exist it fails loudly and names it. No device-naming or area gymnastics needed.

**Fully PLUS license — you're right, we now say it up front.** Getting-started and the hardware guide both flag the ~$10/device requirement (remote admin, autostart, and the battery/reload wiring all need PLUS).

**Entity renames breaking activities — real limitation, now documented.** There's no automatic entity-rename; references live in several places and delete-and-recreate is honestly the fastest path (as you found). Troubleshooting now says so.

**Music vs TV bottom buttons — by design, now documented.** TV pages hand the physical Back/Home to the device, so Harmonium pins its own touch pair there; music pages don't need it.

**Denon/Panasonic over IP — a different answer than you might expect.** Harmonium deliberately doesn't grow its own IP transports: if the receivers are set up through their HA integrations they're media_players already, and anything beyond (surround modes, zones) rides HA services — which every Harmonium action, preset, and tile can call. If a command you need isn't reachable through the HA integration, that's worth raising with that integration — and if you hit a gap where Harmonium can't *express* an HA service call you need, that we absolutely want to hear. The offer to test and document is gratefully taken up in that form.

Thanks again — Advanced-checkbox is fixed too (it was a tab in checkbox clothing). Update to v0.86.0 via HACS, restart HA, Save & Deploy once.
