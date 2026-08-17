# HANDOFF — start here

Written at the end of the CT session, 2026-08-09; updated 2026-08-10
(v0.70, the routing model). Read this first, then `docs/PROJECT.md`
(the living document — newest entries near the top; pre-v0.83
history lives at `archive/docs/project-history.md`), then
`archive/design/design-library-ui.md` — the library design doc,
whose §1 CORRECTS the phase-3 plan below and whose §5 reframes it.

Everything below is verified, not assumed. Where something is untested,
it says so.

---

## 1. What this is, and where it lives

Harmonium is an instant-on control frontend for Home Assistant. Three
pieces, and the split matters:

    src/                the ENGINE  — one dependency-free HTML file
    studio-src/         the STUDIO  — Svelte editor, builds to studio.html
    custom_components/  the INTEGRATION — owns config in HA, serves the
                        API, hosts the Studio panel (moved to repo root
                        in v0.83.4 — HACS requires it there)

    dist/index.html   built engine, deployed to every house
    dist/config.json  **A TEST FIXTURE. Not a deployable.** See §2.

Repo: `G:\Documents\Code 2025\repos\HA-2026\harmonium` on `neptune`,
origin `github.com/skavan/harmonium`.

---

## 2. Two houses — the rules that must not be broken

**Code is shared. Config belongs to each house's Home Assistant and is
never pushed from the repo.** `push.bat` enforces it: no mode copies
`config.json`, and it refuses unless `www/harmonium/.house` on the
target share matches the house you named. Both houses get mapped to
`H:` at different times, so the drive letter proves nothing — the
marker does.

**CT (Cat Rock) is the golden master.** `dist/config.json` is CT's
config *as a test fixture*. The suites drive the real engine against a
real config and were written against CT's ids — `porch`, `music`,
`watch_firetv`. When Jamaica swapped that file for its Bar config,
**eight of fifteen suites failed and stayed failing**; restoring CT's
took it back to 15/15 with no other change. **If half the battery is
ever red, check `dist/config.json`'s `home_screen` before debugging
anything.**

**Jamaica is frozen.** Running v0.68.7, working, untouched. Nothing
gets pushed there until it is visited in person (~Sept 2026). Its
config is preserved at `houses/jamaica/config.json`. v0.69+ is
backward compatible with it (an explicit `search` block still beats
the new role), so the jump is safe when made in person — just not
remotely.

**Never run `harmonium.reseed`.** It merges `dist/config.json` into a
workspace. That was safe when one repo served one house; now it would
overwrite a house's rooms and activities with the fixture. Config is
authored in the Studio, which writes the store and the deployed file
together. Reseed has no job left.

**`build.mjs` is RETIRED** (2026-08-17 cleanup: it lives at
`archive/yaml/build.mjs` with the yaml authoring model it compiled).
**`build-engine.mjs`** is self-contained now — the STYLES/SCRIPTS
lists live IN it and are the authority; add new engine files there.
It writes `dist/index.html` and nothing else.

---

## 3. Current state

| | |
|---|---|
| Engine | repo at **v0.83.3** (v0.83.3 deslug — cap() strips underscores for display, chips label deslugged/data raw; slider-volume center = % (mini-meter only in compact mode); volume-kind stepper rides the volume row (steprow.vol); v0.83.2 artwork theme tokens --br-art/--art-big/--app-art; v0.83.1 THE NITS ROUND — volume fat by default + optimistic nudge/drag (widget draws .sldr unless slider:false; generators' dflt "slider"); browse list rows left-aligned/base-size/ellipsized (.tile.brw.row rules incl. the #app.scr-music override) + THIRD VIEW grid2 (toggle cycles grid→list→grid2; gen-browse stamps brCols:2, render.js host honors it); ENGINE_V on the diag page now tracks releases. Earlier: (v0.81.1 diag: Tools gains Sign out & re-pair — two-tap confirm burns hakr_token, reload boots the Pair screen, host kept; v0.81 PAIRING — auth overlay leads with "Pair with Home Assistant": code display + 2s poll against the integration broker, token lands on the manual path's localStorage shelf; v0.80.5 the diag: DIAGNOSTICS virtual screen — ⓘ tap opens it, viewport/dpr ground truth + ENGINE_V on screen + build/connection/tools bands, perfInfo flash retired, core/diag.js new in build.mjs; v0.79.1 preview landings reported to the Studio — navigate posts `harmonium_screen`, PREVIEW-only, kiosks inert; v0.78.2 + live {token} status lines, universal :active press feedback, preset glow removed + default landing on the owning activity's page; press-shaped domains: button/scene/script tiles act on tap, timestamp states read as "Pressed 5 min ago"; per-member presentation everywhere the activity generates — devices, groups, controls band, VOLUMES band; `where` placement flips; present.style volume ladder; intentional-blank labels: `activity.present` map — name/icon/shows/tap per cast member and loose entity, inline controls on the Devices section, group members override the group's `shows`) — **push** (`push-engine.bat`) + Fully cache clear |
| Overnight round (2026-08-14/15; v0.83.7 TAGGED; v0.83.8 PENDING — .py changed, HA RESTART on deploy) | **2026-08-16 — v0.83.8 ROUND (s0.83.27): image upload + the Poster + apps 2-up. (42) STUDIO IMAGE UPLOAD (P1 #7 SHIPPED) — authenticated POST /api/harmonium/upload (multipart; kind image|skin; 8MB cap; png/jpg/webp/gif + magic sniff; slugified name; tmp+rename; 409 on existing name unless overwrite): files land at www/harmonium/images|skins/, /local path returned; Studio UploadBtn.svelte (button + drop target) on the Hero banner Image field and the skin map toolbar ("photo…"); 409 → confirm → overwrite retry. probe-upload-studio drives the real drop. (43) NP "POSTER" — np_style poster: stacked big centered art (72%/square), title/artist/album centered, progress bar + 0:36/4:19 clock (npClock; 1s ticker walks .poster), chassis trailing restyled FULL-WIDTH bar named after its destination (trlbl = target screen name). Same render() slots as the heroes. probe-np-poster NEW. (44) "Art wash" HIDDEN from the NP select (engine still honors it; a config on wash shows a legacy entry — never lies). (45) APPS 2-UP — STOCK_APPS_DRAWER grid.columns 2 gen 2 + GENERIC_MEDIA_CONTROLLER apps section gen 2 (healStockGen upgrades house copies); starter-config patched; generator stamps cls "app" → 38px glyph/14px label/minH 96, centered. probe-apps-grid asserts the true 2x2. (46) STRETCH ROUND 3 (recurred ON s0.83.26 — his oval play shot): Y was still COMPUTED (imgW × imgNat aspect); iframe now scales each axis to the CLIP BOX itself (bind:clientWidth/Height on the aperture div) — transform can no longer disagree with layout; >2% anamorphic skew console.warns every input (the P1 #9 protocol, automated). (53) THE CLEANUP (2026-08-17 overnight, his ask; s0.83.9 b34): archive/ created (yaml era+build.mjs, config-v1, design history, retired docs, session dumps, images source art) — NOTHING deleted; build-engine.mjs self-contained (byte-identical); PROJECT.md split (pre-v0.83 → archive/docs/project-history.md); README/CONTRIBUTING/ARCHITECTURE/cookbook/HANDOFF refreshed; ha/README new; tests/run.sh repointed off build.mjs; STATE SPLIT: stocklib.js NEW (pure stocks+normalize chain, ws as param), state.svelte.js 2290→1673 facade with unchanged import surface — smoke-studio 106/0 + 7 studio probes + battery 20/20 green. HE COMMITS IN THE MORNING (git add -A). Recommended next (supervised): ActivityCard split, __init__.py api split, git-history rewrite for clone size. (52b) TAGGED as v0.83.9-Beta (tag ≠ manifest '0.83.9' — watch for a HACS phantom update; retag plain v0.83.9 if it nags; pre-release flag hides it from HACS unless Redownload→pick version). .88 rollout: HACS update → RESTART (bundled engine deploys at setup) → hard-refresh Studio (s0.83.9 b33) → firetv dialect Wake=key:back + Save & Deploy. (52) v0.83.9 OPENED (0.83.8 tagged+released; manifest+ENGINE_V 0.83.9, STUDIO_V 0.83.9 b33) — DIALECT WAKE: dialects.<id>.wake ('key:<id>' borrows own keys catalog, else classLaunch grammar) + wake_delay (default 600); apps generator stamps tiles, firePreset fires wake→gap→launch ONLY when player reports off/idle/standby/unavailable/unknown; AppsEditor dialect card gained Wake fields; probe-wake NEW (asleep: BACK→401ms→Netflix; awake/wake-less: launch only). His setup: firetv dialect wake=key:back + Save & Deploy. (51) s0.83.8 b32 — preview tooltips name the PHYSICAL key (key ‹F1›, hold key too; ‹› because Astrion back/home keys are [ ]); Speaker Groups gained the '← back to <page>' chip (the ＋ Create group door's return trip). Console-noise report triaged: BT-UI/universal-remote-card/button-card = other HACS cards loading on every HA panel, NOT harmonium. OPEN: dialect-level wake before app launch (design proposed, awaiting his pick). (50) STAMP CONVENTION — STUDIO_V is now '<release> b<n>' (footer s0.83.8 b31; counter never resets); releasing.md documents it. (49) IMPORT CHOOSER (s0.83.30 — his: import overwrote main; full-dump import impossible; no workspace name in the json): Import parses then ASKS — single config → current draft (default) / replace another ws (immediate, stored+deployed) / new ws; bundle (All-workspaces export) → tick-list, existing replaced + missing created; single exports stamp _workspace {id,name} (stripped on import, preselects destination). ImportDialog.svelte + probe-import NEW; workspaces.md updated. POSTER CORRECTED: constant-size machinery reverted (misread) — the ask was 8-12px SHORTER with art (transport was clipped): 505→493px, artless shrinks naturally. (48) UPLOAD TARGET MOVED (his call: hero images should NOT live inside harmonium): kind image → www/images/ (/local/images/…, outside the wipe zone); kind skin stays www/harmonium/skins/; wipe doc says both out loud; .py changed → same restart. POSTER CONSTANT SIZE: ~10px trimmed; no-art placeholder square (npph music_note); empty lines + idle progress/times reserve space (ZWSP ::before + visibility vs .hidden !important); probe-np-poster bare stage: 493px == 493px. STUDIO_V 0.83.29. (47) P1 #9 SOLVED — his DevTools dig found html.nogap live on modern Chrome (compat margins stacking on working gap; play 84×84 CSS drawn 71×84). Root cause: the flex-gap boot probe read scrollHeight 0 (NO LAYOUT — engine booting behind the hidden preview pane on hard refresh) as 'gap unsupported' and latched nogap forever; ↻ reloads visible → clean. Fix: probe divs get real heights (3=works · 2=ignored · 0=no layout → RETRY, never guess) + .trow .dpbtn/.trbig flex:0 0 auto insurance. probe-nogap.mjs NEW; battery 20/20; skew strip stays as tripwire. (46b) THE SKEW STRIP (s0.83.28) — he confirmed s0.83.27 and STILL oval after hard refresh (↻ cures), console clean: red #pvSkew strip under the photo whenever scale is >2% anamorphic, from two measurements — bound (clipW/H) and drawn (iframe getBoundingClientRect, 1/s). Oval WITH strip → numbers name the input; oval WITHOUT strip → transform uniform, stretch is upstream. Probe trap learned: preview pane is display:none on the Workspace-map slice — geometry probes must click a screen first. manifest + ENGINE_V → 0.83.8; STUDIO_V 0.83.28; battery 20/20; smoke-studio 106/0; regression probes at baseline.** 2026-08-16 — RELEASE PREPPED: docs/release-notes-v0.83.7.md written; KeyMapper scripts final (USB-first, bare run = plugged-in device; three batch bugs fixed: empty-arg "ECHO is on." dot, for/f quoted-path, key_mapper.zip name; push verifies landing); tag when Suresh runs make-release.bat + git tag v0.83.7.** 2026-08-16 — STRETCH PINNED + KEYMAPPER (s0.83.26): (40) P1 #9 captured — oval play circle = non-uniform transform = the skinned preview iframe scale (engine exonerated); 340px photo-width assumption replaced with live bind:clientWidth measure; next-occurrence protocol: ↻ first. (41) pull-keymapper.bat / push-keymapper.bat — KeyMapper backup zips travel in remotes/keymapper/ (export is Back up all → Files target, then adb pull; restore = push + two taps); hardware-keys.md §Backing up KeyMapper.** 2026-08-16 — LAST TIDY-UPS (s0.83.25): (35) NP plain-card source on its own line (sub \n + pre-line). (36) volume placeholder falls back to the wired ENTITY name (loose casts). (37) grouplaunch counts on the sub line (inlineSub dropped). (38) Cast-group row shows group-name summary; band Off gates NAV CARDS only — promoted where:controls tiles survive (was hiding his promoted Receiver). (39) LOOSE ENTITIES GROUP: groupChildTile renders entity members, grouped entities leave the Devices section, Studio ticks offer extra_devices, grouped extras nest with ✕ rows, group cards render BELOW the cast rows. probe-group-loose NEW; battery 20/20; smoke-studio 106/0.** 2026-08-16 — HERO ROUND 2 (s0.83.23): np_style "wash" = the ORIGINAL full-bleed hero back as an option (panel stays default for art:true); panel trail = full-height right zone again but as a FADE-IN of the dark wash (gradient → .82, accent glyph, borderless — the 2px transparent border painted a hairline seam over the masked art; focus = inset ring); Studio select gains "Art wash — full-bleed". probe-np-styles wash stage; battery 20/20. PLUS (34) Controller-tab COLUMN DISCIPLINE — fixed columns (arrows/name/switch 88px/label slot 158px + spacer) with the label input BEFORE the row's selects; NP Auto label shortened; s0.83.24.** 2026-08-16 — ART HERO v2 (engine-only): art = right panel (npimg absolute, 58% width, mask-fade to the left) — full-tile wash + 64px thumb retired; text on clean bg at unchanged font sizes; npwrap trimmed; library trail restyled ON the art (glass bottom-right, z2) with the full-height trail column dropped on .art tiles only. probe-np-styles green, battery 20/20.** 2026-08-16 — TRUTH ROUND (s0.83.22): (29) VOL DEFAULT — unbound vol_up/vol_down route to $context.volume at the ENGINE level (input.js, the mute pattern; config bindings win); root cause of his dead volume keys = starter-config shipped without global.buttons (now added). (30) VOLUME BAND = THE VOLUME ROLE — band label hits only the wired-volume tile; volumes-cast rows bandGen unless ve===context.volume; groupChildTile/looseShowTile stamp bandGen (a band label had renamed his promoted Receiver). (31) np_style "plain" (Standard card, suppresses art:true — stock music's Standard WAS the hero); Studio options Auto/Standard/Slim/Art. (32) slim marquee (--npshift, alternate loop, re-measured on line change). (33) truthful placeholders (defaultBandLabel) + presets/devices label slots override SECTION HEADINGS ("" = none; render.js secTitle). probe-np-styles heavily extended; battery 20/20; smoke-studio 106/0; hardware-keys.md + §8 updated.** 2026-08-15 LATE — DRESSING ROUND (s0.83.21): (26) STRETCH HEDGE ×2 — engine re-renders once on document.fonts.ready (boot.js) + ↻ preview-reload button beside 📷 (engine iframe only); P1 #9 note updated (if it recurs on s0.83.21+ the fonts theory is dead). (27) BAND LABEL SLOTS — Controller-tab hints dropped (hover keeps them); single-tile bands get surface.band_labels.<band> inputs (empty = NO label, ↺ = default); engine surfDressTile() in BOTH derivations (render pipeline AND tilesOf — renderStates re-derives there); volumes generator stamps bandGen so device names survive. (28) THREE NOW-PLAYING RENDERERS — media style: standard / slim (one-liner, graphic_eq live indicator, Title — Artist, trailing intact) / art (the hero, now first-class); ladder tile.style → surface.np_style (Select on the Now Playing row). probe-np-styles NEW; probe-ctrltab extended; battery 20/20; smoke-studio 106/0.** 2026-08-15 NIGHT — THE VOLUME-ROW ROUND (s0.83.20): (22) stepper title-gap 6px (.steprow.vol padding-top). (23) grouping rows redesigned — [−][fat track, % INSIDE][+] per member (rslrow/rslpct; nudge+volume_up/down; slider volume_set); spkgrp: screen always shows them; INLINE = tap the NAME to reveal/hide (GRP_EXPANDED, session-local; collapsed joined rows keep the small %). (24) Players select gained ＋ Create group… → selectSlice("spkgroups"). (25) Cast-group cards walkthrough delivered in chat. probe-speaker-groups volrow stage + probe-grouping expand stage + probe-spkgroups-studio door stage; battery 20/20; smoke-studio 106/0.** 2026-08-15 EVE — FIRST-SIGHT FIXES (s0.83.19): (20) spkgrp screen card was ROW-mode (big left icon) → brRow:false, icon on the title line, sub inline. (21) DRAWS-AS/VOLUME-STYLE UNIFIED — "Volume − / +" removed from Draws-as (one *Volume control* entry; style picks the shape); groupChildTile/looseShowTile now honour style:stepper (was silently drawn compact); legacy shows:"stepper" honoured engine-side + swept to volume+style:stepper on Studio load (normalizePresentShows); TileRow maps stepper tiles to Volume control; .sldr.inrow 46px (the "squashed" note). probe-volstyle-unify NEW; probe-spkgroups-studio asserts the sweep. His #2 arrived truncated — asked.** 2026-08-15 PM — SPEAKER GROUPS + THE STEPPER SHAPE ("OK - do the grouping work"): (17) speaker_groups top-level block (named joinable-player sets, cast-independent); speakers band takes tile `group:`/surface.speakers_group + mode/surface.speakers_mode — LAUNCHER (grouplaunch widget: "5 available · 2 linked", lit when linked, select → generated spkgrp:<id> screen) or INLINE; group-fed defaults launcher, cast-fed stays inline. spkgrp: screen = grouping card sliders:true (per-player trim tracks, volume_set direct, master row anchored); master resolved at screen build (never bare $context — visibleTile hides unwired $context tiles) else grpMaster() fallback coordinator→playing→first, gmaster class un-sticks on master change. VOLUME LINK stays PER-DEVICE (his question — answered: that's the feature). (18) STEPPER VOLUME re-shaped per his design: "Vol n%" inline title + fat track IN the −/+ row (.sldr.inrow), no stepval/no top track, muted="Muted"+dim; other kinds untouched; wgt-stepper CSS hides only .sub:not(.subin). (19) Studio s0.83.18: Model → Speaker Groups editor (SpeakerGroupsEditor.svelte; slug-rename guarded by references, delete sweeps surface refs) + Controller-tab Speakers row Players/Card selects (setSurfKey). probe-speaker-groups + probe-stepper-vol + probe-spkgroups-studio NEW (the last one guards the new top-level key through Save & Deploy); battery 20/20, 17 probes, smoke-studio 106/0. Docs: creating-an-activity §8 Speakers paragraph + four-shapes volume-style text.** 2026-08-15 — CONTROLLER-TAB FEEDBACK ROUND (his five notes + one follow-up): (12) BAND REORDERING — ↑↓ per band row writes a.surface.band_order; engine surfOrderTiles() (context.js, called pre-expansion in render.js) permutes band tiles within their section, non-band tiles hold their slots, unlisted bands trail; probe-band-order.mjs NEW + probe-ctrltab extended (move → POSTed band_order). (13) VOLUME % SAID ONCE — slider-mode volume sub returns "" (center readout owns the number and the mute glyph); compact keeps "Vol n%"/"Muted"; probe-mute extended with compact stages. (14) PRESET PICKERS — ServicePicker prefer prop (media_player.* first) on the preset Service field; Target Entity prefers the cast (ActivityCard deviceList(), HubEditor pageCastEnts for page presets). (15) "Group cards" relabeled "Cast-group cards" (his #3 — it's the nav cards for ⊞ Add group cast groups). (16) VOLUME LINK on the grouping card (his follow-up: "a separate toggle should be to link their volume") — per-member toggle on joined rows, default linked; unlinked members keep playing but the group slider skips them and the track averages linked-only; client-side session state, master always linked; probe-grouping extended (skip/relink verified). Battery 20/20, smoke-studio 106/0, STUDIO_V 0.83.17, creating-an-activity §8 updated + activity-controller.png re-shot. NOT built: his #2 Speaker Groups building block (named groups + launcher/inline card modes) — design proposal sent, awaiting his go.** EVENING — THE CONTROLLER TAB (Suresh's paradigm call; presets folded in): a.surface carries per-activity band switches (np/transport/modes/volume+volume_style/speakers/groups/sources/presets/devices; absent=Auto, false=off) — generators gate pre-expansion, visibleTile gates fixed singletons on controller-class screens only; Studio's Presets tab became the Controller tab (strip moved from Setup, band rows derived from the target controller, presets editor folded beneath). PLUS grouping card reads loose entities (his two-raw-media_players shape). probe-ctrl-bands + probe-ctrltab + probe-grouping-loose green; battery 20/20; smoke-studio 106/0; STUDIO_V 0.83.16; deep-dive doc §8 rewritten + full reshoot (activity-controller.png new, activity-presets.png retired to _to_delete).** AFTERNOON (the queue round, unattended): (9) SPEAKER GROUPING CARD — WIDGETS.grouping (join at master / unjoin at member / delta-preserving group volume) + `speakers` generator from the running activity's cast + STOCK_MUSIC gen 2 (healStockGen upgrades non-variant copies, parent kept); probe-grouping.mjs + probe-stock-heal.mjs green; build.mjs gained widgets/grouping.js. (10) ONE-VERSION HEADER — s-stamp only, integration/engine versions in its tooltip. (11) smoke-studio SELECTOR REFRESH — the six stale falses fixed (106 true / 0 false). Battery 20/20, all 7 probes green, STUDIO_V 0.83.15. NOT built: factory-reset door (awaiting Suresh's verdict on Clear-to-a-fresh-start).** MIDDAY ADDITIONS (.87 round): (6) CONDITIONAL STOP — generated Stop clears routing only if the select still holds THIS activity (multi-activity rooms: select=focus, device truth=tiles; design note in beta-gaps). (7) handle_run missing-sequence error now explains the draft/saved seam (his #4 was an un-deployed generated Stop). (8) $device SUBSCRIBE LEAK exit-guard in entitiesFor() (found in .87 log — one bad token kills ALL updates for the page). ENGINE rebuilt (battery 20/20 after :8482 restart), STUDIO_V 0.83.13. Deploy to .87: make-release.bat → push-catrock-all.bat → RESTART HA (integration .py changed) → hard-refresh Studio (s0.83.13) → regenerate Watch Fire TV's Stop + Save & Deploy.** MORNING ADDITIONS: (4) SCOPED STOP — generated set_activity off now carries room: a.room_view (bare off = ALL-OFF workspace-wide; probe-stop-scope.mjs green). (5) ICON FONT GATE — icons hidden until Material Symbols confirmed via fonts.load(), 3s ligature-text fallback (the "font and display are messed up" flash). STUDIO_V 0.83.12, manifest already 0.83.7.** From docs/status-review.md: (1) MUTE indicator — engine volume widget, ENGINE_V 0.83.7, probe-mute.mjs, battery 20/20. (2) Soundbar Inputs row — Studio inputEnt() (any claimed media_player.* entity qualifies), STUDIO_V 0.83.11, probe-inputs-soundbar.mjs. (3) Stretched first-load preview — NO headless repro (probe-stretch.mjs kept); field diagnostic = 📷 bisect + s-stamp; logged beta-gaps P1 #9. Manifest still 0.83.6 — bump to 0.83.7 at release. Morning steps: build-engine + studio build + make-release + commit/tag v0.83.7 + HACS update .88.** |
| Docs | **creating-an-activity.md (2026-08-13, stranger-pass 08-14: Studio-sidebar grounding, ten-step route checklist, prefer-⊞ guidance, concrete reload-the-remote, HA-registry troubleshooting): the every-knob activity deep-dive, 11 real-Studio screenshots via tests/shoot-activity.mjs (re-runnable; docs/media/activity-*.png). Cross-linked from activities.md + cookbook README.** |
| Studio src | **s0.83.10 COLLAPSIBLE COLUMNS (local, pending machine build + tag): ◧/◨ header toggles fold the nav / preview columns (editor takes the width), persisted per browser, panes hidden not unmounted (⌘K + engine iframe state survive); probe-collapse.mjs green. s0.83.9 (v0.83.5) THE VIRGIN STUDIO — a fresh HACS install (empty store, nothing deployed) used to open DEAD on red "no config found"; boot()'s double-404 branch now mints `starterConfig()` as a draft with a fresh-install status pill ("Save & Deploy to create your config"), and starterConfig() gained a dangling-parent sweep (planted stock drawers carry parent controller:tv/controller:music which a blank config lacks — the first Save & Deploy would have 422'd on _validate). Probe: tests/probe-virgin.mjs (posted starter runs the real _validate → zero problems). app.virgin clears on save. NOTE: smoke-studio has six PRE-EXISTING selector-drift falses (activitiesOwned, startPicker, nameInput, added, draftBanner, pageMade) — false on the untouched baseline too, needs a selector refresh pass.** Earlier: v0.83.2 edits pending a machine build — RUN `npm i` FIRST (new dep html-to-image)**: Export dropdown (this workspace / all workspaces via exportAllConfigs + bundle guard in importConfig), wash toggle (#washTgl, hakr_studio_wash), 📷 #pvSnap screenshot (alpha-true composite at photo natural res, 2px aperture bleed, snapFontCSS beats html-to-image's cross-origin font skip); SKIN_ASTRION.screen RE-MEASURED on the shipped 814×2600 asset = 10.07/3.58/80.59/41.77 (old rect was the 1280×4084 export's — the "1px off" seam; re-apply 🖼 device photo to heal stored configs) + live 1px aperture bleed + INDEPENDENT X/Y iframe scale (height was width-derived — any rect/viewport aspect mismatch = bottom hairline) + 1px OVERSCAN (s0.83.4 — content scales to rect+1px per side, buried under the photo rim). FIELD RESOLUTION 2026-08-13: the residual "white line" on Suresh's machine was browser-zoom compositing (photo texture and transformed iframe round to device px independently) — the 📷 PNG built from the same percentages was pixel-perfect, proving map data + engine correct; he trued the rect 1-2px down in ✎ map keys, which is the intended fix. Stored rect now carries that display-specific nudge (exports sit ~1-2 source px low — invisible). s0.83.5: map-mode arrows nudge the selected rect EXACTLY 1 display px per axis (was 0.1% — a third of a px horizontally), and the toolbar shows editable x/y/w/h % fields + a source-px readout when a rect is selected — the same numbers stored at remotes.<id>.skin. s0.83.6: preset y field-trued to 3.764 (his 1px-arrow value; the alpha-scan said 3.58 — the eye on the real preview beats the scan), arrow-hint now shows WHILE a rect is selected, ⌖ nudge-all row labeled + bigger, Save & Deploy glows (ring + pulsing ●) when the draft is dirty + beforeunload guard on tab close (HA sidebar switches can't prompt — the glow is the guard there). s0.83.7 THE CLIPPED-HERO BUG: the engine's hero-jump chips call scrollIntoView, which propagates to ancestor scrollers ACROSS the iframe boundary — the overflow:hidden clip wrapper is still programmatically scrollable (iframe LAYOUT size = full viewport; transforms don't shrink layout), so chip clicks scrolled the clip itself (hero clipped, black band below). Wrapper onscroll now pins itself to 0,0. Plain mode was never affected (no wrapper). s0.83.8: 📷 captures the SCROLLED state — html-to-image renders a clone and scroll offsets are live state (clones reset to 0), so snapPreview converts each scrolled container's offset into an equivalent child transform for the capture (visually identical live; inline transforms survive cloning) and reverts after., ThemeEditor artwork knobs. Plus v0.83.1: action snippets (SNIPPET_TYPES.action, actionSnippetSeq, SequencesEditor ··· Export + ⤵ Import doors — room stamp dropped both ways), plainVp first-mount chain (borrow any profile's viewport, final fallback 349×581 — the "wrong height until photo on/off" cure). Earlier v0.75–v0.76 etc.: v0.76 per-row ⚙ presentation panel (name · icon · draws-as · tap; intelligent shows list; Children Show retired from groups; snippets carry `present`), v0.76.1 role chips on loose rows (adopted entities looked stripped; wiring was always intact), v0.76.2 presentation-panel crash fix (bind:value needs the fields to exist — editPres backfills, close-sweep cleans), v0.76.3 loose-row primary (★ = media_player wiring holder, ☆ rewires), v0.76.4 width fixes (loose rows wrap, panel flows; engine stamps inline controls as cards), v0.77 Where selects (⚙ panel + group editor), v0.77.1 Volume style select + blank-name semantics, v0.78 role guessing on loose adds + cast entities in role dropdowns + adopt-outside-picks + ONE primary definition (the media_player holder), v0.78.1 search guessed for MA players only, v0.78.2 Status line field in the ⚙, v0.79 attribute-token picker + activity destinations in Navigate To, v0.79.1 the {curly}/{token} tooltip-interpolation crash fix (the ⚙ was dead — braces in quoted attributes are Svelte expressions; string-expression titles now), '+' picker fed real attribute names (loadEntities keeps `attrs`; it only ever knew "state"), addRoleSection inserts at the liturgy slot + normalizeSectionOrder heals existing configs (Scratch's Presets-under-Devices), boot load unified onto normalizeConfig, preset snippets (SNIPPET_TYPES.preset, ⋮ Save as snippet on preset rows, ⤵ insert selects at both add sites, shared presetSnippetTile), soft-remote active-key wash (app.pvScreen from harmonium_screen; tap = accent/12 on keys the page answers, HOLD latch = accent/25 on answered _hold variants, accent/10 on merely-holdable), v0.81/v0.81.2 PAIRING Studio side — pairs state + banner in App.svelte, approvePair mints "Harmonium <name> <CODE>" (code suffix = collision-proof; duplicate client_name was field-bug #1), red error strip, pollPairs guards (no token = skip, 401 = stop — http.ban flood); v0.79.2 polish round — CardRow ··· menu position:fixed + flip-up (was clipped by overflow-hidden cards), ONE snippet grammar (⤴ Export snippet / ⤵ Import snippet… on Setup, State, both Presets doors, preset-row ··· menus, SnippetsEditor prose), the preview "Showing" strip (engine-reported screen + grouped jump select) and "Preview it" on every tile row's ··· menu, page device tiles at ⚙ parity (Draws as with presShows filtering, Volume style on the generator's mapping, token Status line with ＋ picker + ∅ no-line; power joined the type lists), ＋ picker appearance-none, IconPicker chip leading-none/overflow-hidden, v0.80 device-photo skin (remotes.<id>.skin {image, screen%, buttons%[]}; iframe behind the transparent aperture, hotspot buttons over the physical keys sharing the wash/hold/press brain; ✎ map keys drag-to-author editor; Astrion preset + placeholder PNG at skins/astrion.png — replace with the real Photoshop export, same 814×2600 frame, then copy ONCE to HA www/harmonium/skins/; v0.80.1 alpha-measured aperture 9.84/3.80/80.00/41.80 = true 480×800 + global button correction — RE-APPLY the preset after updating; ambient nav keys now wash everywhere, power/mute/vol via control_target; map mode gained the editable LCD rect, ratio meter, ⌖ nudge-all, arrow-key nudge/⇧-resize), v0.80.2 the skinned iframe renders at the device's TRUE 320×533 CSS viewport and scales into the aperture (the rect was 0.6 but the viewport was 272px — layout cramped; scrcpy comparison caught it), v0.80.3 skin.viewport {w,h} per skin — the HA100 is a TRUE 480×800 (DPR 1.0), the 320×533 guess read as slight vertical stretch; re-apply the preset to pick it up, v0.80.4 triangulated to 360×600 (DPR 1.333 tvdpi — 480×800 was too much, 320×533 too narrow; Suresh's 0.824 clip experiment measured the 600px-tall viewport), v0.80.6 GROUND TRUTH from the diag: page — the HA100 is 349×581 @ 1.38 (custom ~220dpi), preset updated; tap ⓘ on any device to read the number its skin wants, v0.80.7 plain frame renders the profile viewport 1:1 (no-photo hoists skin.viewport → profile.viewport) + keyTitle tooltips on every soft key in both modes (binding / passthrough / global / ambient + hold variant), plus  ViewEditor Layout card, castRow "on controller:" label + "☆ make primary" + understudy hint, LibraryEditor grid merge, importConfig → normalizeConfig, and the v0.75.3 legacy-cast adoption (context-driven, shared by BOTH doors — addCast AND addExtraEnt — self-healing — v0.75.1's first-cast-only version read a wrecked devices array via deviceList()'s truthy-[] short-circuit and missed the retry path). `cd studio-src && npm run build`, then the studio push, then HARD-refresh the Studio tab — never build in a sandbox |
| CT config | Porch v2, untouched by any push — 3 screens, 3 activities, `deck` workspace intact |
| Jamaica | v0.68.7, frozen |
| Deploy scripts | **RENAMED for the fork story (v0.82.1)** — build-push.bat / push-engine.bat / push-studio.bat / push-all.bat / pull-my-config.bat act on houses\default.txt (yours says `ct`); houses/example.cmd is the tracked template; personal profiles, config snapshots, .env.local, _to_delete/, _survey2/ are gitignored AND untracked. **SECURITY RESOLVED (2026-08-12): the leaked-LLAT history is GONE from public view** — full history archived to private `skavan/harmonium-alpha` (GitHub rename), public `skavan/harmonium` restarted at one clean baseline commit; the token itself was revoked by Suresh. `.gitattributes` now forces CRLF checkout for .bat/.cmd on every clone (four bats had LF blobs — cmd.exe mis-parses those for autocrlf=false forkers); `.md4h/` (editor image scratch) untracked+ignored. Local repo remotes: `origin`=harmonium (clean), `alpha`=harmonium-alpha (archive). |
| Outsider docs | **P0-3 SHIPPED (v0.83)** — README rewritten product-first (hero GIF + 4 engine stills + Studio tour GIF + map/pairing shots, HACS 3-step quick start, cookbook table; architecture demoted below the fold), docs/GETTING-STARTED.md rewritten for the HACS+pairing era (links Brad Sanders' community sideloading guide for Astrion hardware prep), docs/cookbook/ 7 task pages + index (old cookbook.md kept as deeper config recipes), CONTRIBUTING gains fork setup + PR guidelines, SECURITY.md new (trust model, pairing guardrails, self-deploy stamp, token hygiene), **LICENSE = GPL-3.0** (chosen to block closed commercial forks while staying OSI). All media generated headlessly from the REAL engine/Studio (tests/shoot-engine.mjs, tests/shoot-studio.mjs — path-hardcoded to the cloud sandbox, adjust before reuse; Material Symbols must be served locally AND the .material-symbols-outlined class rule stubbed, or icons render as ligature text). 12 assets in docs/media/ (~2.2MB). |
| Beta prep | **v0.83.6 THE BUNDLED SKIN (.88: "No photo for astrion"): custom_components/harmonium/skins/astrion.png ships in the integration; setup deploys bundled skins to www/harmonium/skins/ ONLY IF ABSENT (user photos never overwritten; non-fatal); starter-config.json astrion profile now carries the full SKIN_ASTRION block (viewport 349×581, screen y=3.764 field-trued, 23 buttons) so a fresh install's Studio lands ON the photo (probe-starter-skin.mjs green). .88 was seeded pre-skin: after the 0.83.6 restart, Preview as astrion → 🖼 device photo → Save & Deploy applies it (seed correctly never reruns). REMEMBER: seed/skin log lines are INFO — invisible in Settings→Logs (WARNING+); verify via /local/harmonium/config.json. manifest 0.83.6.** v0.83.5 THE VIRGIN STUDIO + THE SERVER-SIDE STARTER SEED (third .88 field bug + Suresh's design call): (a) Studio virgin boot mints the starter instead of dying red (s0.83.9, safety net); (b) the INTEGRATION now bundles starter-config.json and async_setup_entry seeds+deploys it when store empty AND nothing deployed — three doors: populated store→never touched, deployed config→adopted (existing path), neither→bundled starter (validated via _validate before commit, non-fatal on failure). Starter = system layer from the fixture (input policy, default+astrion profiles/keymaps, theme, 13-app master list, 3 dialects, ALL 9 stock controllers with porch parent-edges stripped) + one New Room home hub; devices/activities/sequences/entity_options empty. Verified: _validate zero problems, real-engine render probe (tests/probe-starter-engine.mjs), 4-case seed simulation. Manifest 0.83.5, STUDIO_V s0.83.9; ship = machine `cd studio-src && npm run build`, commit+push, tag v0.83.5, HACS update on .88, restart HA (seed fires at setup), HARD-refresh Studio + check s0.83.9 stamp. Expect in the .88 log: "Harmonium fresh install: starter config created and deployed". .88 stranger-path so far: HACS validated ✓, integration set up ✓, engine deployed ✓, remote loaded + pairing banner ✓; still untested on metal: the seed itself, Studio opening on the seeded config, first Save & Deploy, paired remote rendering the starter.** v0.83.4 HACS COMPLIANCE MOVE: the integration now lives at REPO-ROOT `custom_components/harmonium/` (git mv; HACS validates the git tree and requires this regardless of zip_release — first real install failed on it). zip_release retired: tree-install, release = commit + tag, no assets. make-release.bat/push.bat/finish.mjs/tests/README all repointed. VIRGIN-INSTALL FIX (v0.83.4): engine self-deploy now mkdirs www/harmonium first and is non-fatal on OSError — first real install on fresh .88 died on FileNotFoundError; tag v0.83.4 = first installable release.** P0-2 HACS SHIPPED (v0.82) — packaging.py ownership-stamped engine self-deploy, make-release.bat, engine_version {v,bundled,integration}, Studio v-chip + GitHub update strip; REMAINING: publish the repo + first release (Suresh-only), then P0-3 outsider docs. **P0-1 PAIRING SHIPPED (v0.81)** — integration pairbook.py (pure-stdlib, unit-tested) + pairing.py views (unauth pair/poll/cancel, auth pair_admin), engine Pair screen, Studio banner + auth/long_lived_access_token mint; integration .py deploy needs an HA RESTART. Remaining P0: HACS packaging, outsider docs. **docs/beta-gaps.md** (2026-08-12) — the gap analysis for publishing: P0 pairing auth (code-match via Studio-minted `auth/long_lived_access_token` + integration broker), HACS packaging, outsider docs; P1 runtime speaker-grouping card (media_player.join/unjoin — verified absent from src/), volume_step trait, UNAVAILABLE contract; competitor tricks matrix (astrion-custom ×2, mini-media-player, Unfolded Circle) |
| Tests | **20/20 green** (`smoke-preview` gained the `harmonium_screen` landing-report case; scratch-Studio probes probe-cog/probe-79x validated the v0.79.1 Studio fixes end-to-end against the real built engine) |
| Studio | built from source on the machine; never build it in a sandbox (different `node_modules` → wrong output) |

v0.70 shipped step 1 of `design-library-ui.md` §5's revised build
order — **the cast player decides**:

- **Every playable id is routed** — `brRoute`: `native` / `bridged`
  (the v0.66 spotify share-link rewrite) / `fallback` (hand-off to
  the engine's player, which evicts the cast player's queue) /
  `none` (suppressed). Items may carry `_route` — the seam the
  phase-3 index will stamp.
- **The silent queue eviction is dead.** A fallback play is a
  two-press confirm ("Takes over <speaker> — press again to play",
  red pulse) through a new generic `confirm` key in the shared
  action grammar, gating both firePreset and runAction on one key,
  and holding the drawer open while pending.
- **Fallback tiles are marked** — chassis-level `mark`, amber
  swap_horiz, bottom-left. Expandables are unmarked for drilling
  (harmless); their trailing ▶ carries the mark and the confirm.

v0.70.1 (same day, from field feedback): the fallback confirm now
pulses THE TAPPED TILE (it pulsed the grid's first tile, often
off-screen, so the first tap read as dead — "clicking doesn't do
anything"); and the drilled child screen's full-width ‹ Back split
into half Back + half Play-the-container, routed like everything
else. Deploy is `push-engine.bat` (double-click, engine
only, no restart) → Fully cache clear.

v0.69 shipped phases 1, 2 and half of 4 of
`archive/design/design-search-sources.md`:

- **Search is a role.** A bare `type: browse` tile binds
  `$context.search`; the stock `music_library` names no entity. Claimed
  per *device* in the Pre-wired library. Order: explicit
  `search.entity` → `search: false` (per-surface off switch) →
  `$context.search` → nothing.
- **`config_entry` is derived**, not authored — one cached
  `config/entity_registry/get` per entity yields both the entry id and
  the platform.
- **Scope control** — `My library` / `Everything` under the query line,
  exposing the two waves that have run since v0.68.3 and were invisible.
- **A bar fix**: `browseBar` used to early-return until the browse tree
  finished auto-descending, so the magnifier was unreachable on exactly
  the slow libraries where search is the fast way in.

Live wiring on CT: the Sonos Basement device claims
**Search → `media_player.ma_sonos_basement`**.

---

## 4. How to work

| you changed | do | restart HA? |
|---|---|---|
| **the routine deploy** | **`build-push.bat`** — builds Studio + engine, pushes both, prints the two cache rituals | no |
| `src/` (engine) | `node build-engine.mjs` → `push catrock engine` | no |
| `studio-src/` | `cd studio-src && npm run build` → `push-studio.bat` | no |
| both | `push-all.bat` | only if it says so |
| `custom_components/**.py` | `push catrock all` | **yes** |

`push.bat` probes the `.py` files with a list-only `robocopy /L` and
only asks for a restart when one actually differs. (It does not detect
a *deleted* `.py`; that also warrants a restart.)

The remote picks up a new engine on **clear cache + load start URL** —
Fully caches `/local/` hard. `npm ci` in `studio-src` is one-time;
`node_modules` is gitignored so a fresh clone has none.

**Tests:** serve `dist/` and run the suites.

    cd dist && python3 -m http.server 8482 &
    cd ../tests && for t in smoke-*.mjs; do node "$t"; done

Each prints a JSON object; `"errs": []` is the pass signal. Chromium is
at `/opt/pw-browsers/chromium`; `playwright-core` is a no-save install.

---

## 5. What's next — steps 2–4 of `design-library-ui.md` §5

The build order is the REVISED one at the end of
`archive/design/design-library-ui.md` (which corrects this file's earlier
phase-3 plan in two ways: **no Python — phase 3 is engine-side**, a
localStorage cache the engine crawls itself via browseFetch; and the
order runs routing-first so later steps change data, not layout).

1. ~~**Routing model**~~ — **DONE, v0.70.** `brRoute`, the confirm
   gate, the mark, smoke-routing.mjs. (v0.70.1: confirm pulses the
   tapped tile; ‹ Back splits with Play-the-container. v0.70.2: a
   failed call_service flashes HA's own error in the bar — the MA
   Spotify outage made silent failures' cost concrete.)
2. ~~**Search row**~~ — **DONE, v0.71.** Caret, ⌫-on-keyboard with
   hold-to-clear, exactly two row controls (⌨ + one close ✕).
3. ~~**Roots row**~~ — **DONE, v0.71.** Magnifier in band 1
   (`.brrootq`), view toggle (grid ⇄ dense list) at the strip head,
   sticky per category, persisted per remote profile
   (localStorage `hakr_views_<device>`).
4. ~~**Phase 3, engine-side**~~ — **DONE, v0.73.** brIdxCrawl /
   brIdxSearch in browse.js: per-player localStorage index with
   `built_at`, stale-on-open re-crawl, forgiving matching (the
   "mama mia" fix), instant merge into search with index-copy-wins
   dedup, survival through engine outages, tap-to-refresh age row.
   FV:/SQ: are SEARCHABLE. Native cast is now the default worth
   recommending (design-library-ui.md §5's condition is met). Index
   results are non-expandable for now (drill via the tree player is
   future polish); v0.72's amalgam remains the browse-side merge.

Also open, smaller and entirely engine-side (fully testable):

- **The mic.** A real focused `<input>` gets Android's IME *and its
  voice input* — recognition happens in the IME's process, so the page
  needs no microphone permission and no speech API. Keep the button
  grid: it is the D-pad path, not a fallback. **Hazard:** `input.js`
  deliberately ignores keys typed into `INPUT`/`TEXTAREA`, so on a
  `physical_dpad` profile a focused input kills Back/Home/Power. Never
  auto-focus there — a dedicated mic button focuses, dictates, blurs.
- Phase 4 remainder: index age in the UI, per-surface switch in the
  Studio.

---

## 6. Traps that have already cost real time

- **The fixture trap** (§2) — half the battery red means the wrong
  house's config is in `dist/`.
- **Stale snapshots.** `device_stage_files` has served day-old copies.
  Re-stage and hash-verify before asserting anything about repo state.
- **Cloud rollbacks.** The sandbox has reverted to old snapshots 14+
  times. `G:\` is ground truth; mirror every batch and verify md5.
- **Fully caches.** A remote showing old behaviour is usually a stale
  cache, not a bug. Check `sensor.astrion1_current_page` and whether
  the Fully entities are `available` before debugging the engine — if
  they are `unavailable`, HA cannot clear the cache and the device is
  running whatever it last fetched.
- **cmd parses whole `if (...)` blocks before running them**, so a
  `%VAR%` containing a bracket kills a batch script at parse time. The
  house scripts use labels, not blocks, and profile values are
  bracket-free.
- **Capability flags lie here.** Native Sonos and MA both advertise
  `SEARCH_MEDIA`; every Sonos browse node reports `can_search: false`
  on a player that returns 521 results. Gate on declaration, never on
  a flag.
- **Read what exists before adding.** Twice now a feature has been
  built that the engine already had — the warm start, and the derived
  search tabs.
- **Old controllers silently lack new generators.** Code is shared,
  CONFIG is per-house — so a controller authored in an early
  generation never grows the tiles later generations emit. Found
  2026-08-10: CT's `controller:music` is flat-tiles Porch v2 with NO
  `devices` / `volumes` / `groups` / `presets` generators, so adding
  the Onkyo to a cast rendered nothing ("it works in Jamaica!" —
  Jamaica's controller is the newer shape; the ENGINE on both houses
  supports all four). The symptom is always "the engine ignores my
  config change". **FIXED SYSTEMICALLY in v0.71.1:** stock shapes
  carry `gen` and the Studio's `healStockGen` replaces any non-variant
  copy whose gen is missing or behind (keeping `parent`; variant_of
  copies are never touched). **When you change a stock shape, BUMP
  ITS `gen`** — that is the whole contract. Requires the machine-side
  Studio build + `push-studio.bat`; first load then heals the
  house config (Save & Deploy writes it). Jamaica heals the same way
  in September.

---

## 7. Mirror discipline

Work in the container, mirror to `G:\`, verify md5 per file, and move
transport tarballs into `_to_delete\`. `S:\Documents\HA26` carries
copies of `PROJECT.md`, `HANDOFF.md`, `GETTING-STARTED.md` and the
design docs. The Claude project holds the same set for cross-session
reading.

Leftovers safe to delete whenever: `_survey\`, `_survey2\`,
`_to_delete\`, and `.git\index.lock` if it reappears (a bridge-side
`git status` can create one it cannot remove).

---

## 8. Docs map

| file | what it is |
|---|---|
| `docs/PROJECT.md` | the living document — intent, decisions log, full changelog |
| `docs/HANDOFF.md` | this file |
| `docs/beta-gaps.md` | the publishing gap analysis — what's shipped, what's open |
| `docs/screen-schema.md` | the config contract |
| `docs/cookbook/` | task-shaped guides incl. releasing.md and wipe-and-reinstall.md |
| `docs/releases/` | per-release notes (v0.83.7, v0.83.8, …) |
| `archive/` | retired material with a README index — yaml era, design docs, session dumps, pre-v0.83 changelog |
| `docs/GETTING-STARTED.md` | install + pairing, product-level |
| `CONTRIBUTING.md` | the house style: prime directives, comment doctrine, gen-bump rule |
| `tests/README.md` | the smoke battery: pattern, per-suite coverage, adding one |
| `houses/README.md` | the n-house model, the golden-master rule, the Jamaica freeze |
