# GitHub release body — v0.85.7-beta

---

Harmonium v0.85.7

The biggest release since the beta opened. Most of it exists because beta testers keep writing things down — thank you, keep going.

⚠ Upgrading from v0.85.6 — four steps

1. **Export your config** (Studio → Export) and keep the file. It's your safety net — Import puts everything back exactly as it was.
2. **Restart Home Assistant** after the HACS update (the Python changed).
3. **Open the Studio and press Save & Deploy.** Updates to the built-in pages apply when you save.
4. **Clear the remote's cache one last time — then it maintains itself.** If ⓘ shows an engine older than 0.85.7, on the Fully device page in HA press **Clear browser cache**, then **Load Start URL**. Then set Fully's Start URL from the **Studio**: open the page the remote should boot to and copy the second link under its Name — the one ending `&device=<profile>`. That address re-checks the engine version on every boot, and from this release the engine also checks on reconnect/wake and reloads itself when a newer engine is deployed. Failsafe if a remote ever seems stuck: those same two Fully buttons. (ⓘ's "This page" row shows what the device is currently using — compare to verify.)

⚠ Breaking changes — one needs your hands on the remote

**The hold-gesture keys moved.** The engine now listens for `]` = hold-Back, `=` = hold-Home, `F12` = hold-Power (All Off). The old profiles sent `=` for hold-*Power* — so with the old rules still on your remote, hold-Power goes Home instead of All Off, and hold-Home does nothing. Fix the three rules in the Key Mapper app on the remote — output keys identical on both remotes, trigger keys mirrored (Astrion: Home=F1, Power=F2 · RS90: Power=F1, Home=F2 — never copy one remote's rules to the other): Back long-press → `]` (72), Home long-press → `=` (70), Power long-press → `F12` (142). Or restore the ready-made profile: copy `remotes/keymapper/<remote>/key_mapper.zip` to the remote (adb push or download it there), then Key Mapper → ⋮ → Restore. Full rule-by-rule maps: [Astrion](https://github.com/skavan/harmonium/blob/main/remotes/keymapper/astrion/astrion-remote-map.md) · [RS90](https://github.com/skavan/harmonium/blob/main/remotes/keymapper/rs90/rs90-remote-map.md); the release notes have a check-your-work step using the Key debug card. The Harmonium side heals itself; the rules on the device are the one part an update can't reach.

**Two behavior changes arrive on their own** (no action, but expect them): tap Back/Home now drive the TV on TV pages while the holds always drive Harmonium (the old policy sent holds to the device); and remotes with real transport keys (astrion2, rs90) lose the on-screen transport bar — the physical buttons do that job. If you edited your input policy or a controller, your copy is preserved and none of this touches it.

Highlights

**Updates can no longer eat your work — or strand you on the past.** Every built-in (controllers, device pages, dialects, key maps, skins, even the input policy) is now judged by content fingerprint against every shape ever shipped. Untouched copies silently stay current — new stock apps and fixes just arrive. Edited copies become formally *yours*: the Studio says "Your edited copy, preserved.", unlocks it, and offers ↺ Reset to built-in. Dialects you've edited get a View stock button so you can copy new stock apps across by hand. This closes the whole class of migration bugs behind the 0.85.3–0.85.5 churn, permanently.

**The keys do what the routing doc says — everywhere.** Tap Back and Home drive the TV on TV pages and Harmonium everywhere else; **long-press Back and Home always reach Harmonium** — including on installs that still carried the older policy (it heals; an edited policy stays yours). Two long-standing bugs died on the way: long-press Home was wired to hold-Power on the stock Astrion map (it was toggling your TV — sorry), and a long-press slipping past the shell's key mapping could make the Astrion reload the page; the engine now traps stray native Backs entirely. Ch± jumps sections on any page that has them. Menu opens the focused tile's own page. The on-screen back/menu/home strip finally works from the D-pad, roving like the transport row. **And we want your take on the targeting model itself** — D-pad/Back/Home drive the on-screen remote everywhere except TV pages, where taps drive the television. Does that resonate? Discussion: [issue #5](https://github.com/skavan/harmonium/issues/5).

**Start activities from outside Harmonium.** Wall switches, dashboards and automations can start an activity properly — routing *and* the Start action — with one call: `harmonium.set_activity` with `activity: <id>` and `start: true` (the item promised in the 0.85.6 notes). `activity: "off"` with `start: true` runs the running activity's Stop first; add `room:` to end one room. The owning room and workspace are found automatically — the release notes have the YAML.

**The Music Library, redesigned.** Grid views are art-forward — the artwork is the tile, held at full size even before it loads, with the name beneath and a service-colored dot (Spotify green, Deezer purple). List view is a real list: compact rows (seven per screen instead of four), square art, bold titles, a source bar, a › on rows that drill. The D-pad now climbs into the category chips and the Favorites / Library / Search row — ▲ from the first tile, ◀▶ along, OK presses, ▼ back down. And the "Loading library… forever" race at boot is fixed for real.

**Deep links and one true address.** Append `#page=<id>` to open any page by URL — bookmarkable, that load only. Every page in the Studio shows its links click-to-copy: a browser line, and a second line with `&device=<profile>` when you're previewing as a specific remote — a kiosk's complete configured URL. The ⓘ page shows the same address for the remote you're holding, plus the remote's own IP (with the Fully remote-admin door).

**Remotes update themselves now.** A running remote checks the deployed engine version whenever its connection comes back or the screen wakes, and reloads itself when a newer engine landed — Save & Deploy reaches every long-running kiosk without touching it. The Studio preview got the same treatment: it used to load through the browser's cache and could silently show — and behave like — an old engine (the excellent "Studio says 0.85.6 but the preview says 0.84.1" report, with a screenshot that diagnosed itself). If a knob ever seemed dead in the preview, this was probably why.

**A styling stack.** Card height, label position on photo cards (nine spots, default inherit), photo opacity, and raw CSS variables (font size, weight, drop shadows) — settable per card or once per section with per-card override. And the Now Playing card comes in five styles per activity — Basic, Slim row, and the Art Hero family — with pictures of each at real remote size in [docs/cookbook/now-playing-styles.md](https://github.com/skavan/harmonium/blob/main/docs/cookbook/now-playing-styles.md); Art Hero is the shipped default. The vanishing power button after a browser reopen is fixed (the engine falls back to device truth when the routing select is stale). Duplicating a nav card no longer renames the page it points at, and duplicates get unique ids.

Known, and next

An edited stock dialect no longer receives new stock apps — by design; View stock is the copy-paste door. A ⧉ duplicate whose built-in source has moved on gets no "compare?" notice yet. And if a long-press does something strange after updating, it's almost certainly the Breaking-changes item above — the remote is still sending the old keys.

Full notes: `docs/releases/release-notes-v0.85.7.md`
