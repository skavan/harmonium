# Hisense SmartLaser 4K Projector — Control Reference

Everything below was verified against the physical device. Where something is inferred or untested, it says so.

**Device:** Hisense SmartLaser 4K (HVCL), Google TV on VIDAA/MediaTek, firmware `6.9.906821247`
**Network:** `192.168.1.64` · MAC `38:1b:9e:a3:fb:a9` · ADB on `:5555`
**Area:** Deck

---

## 1. Two transports, and why you need both

The projector is reachable two ways. They are not redundant — each covers the other's blind spot.

| | Android TV Remote (`androidtv_remote`) | ADB (`androidtv`) |
|---|---|---|
| Entities | `media_player.deck_hisense_projector`<br>`remote.deck_hisense_projector` | `media_player.deck_hisense_projector_adb_192_168_1_64`<br>`remote.deck_hisense_projector_adb_192_168_1_64` |
| State | **Instant push** | Polled, few seconds behind |
| Launching apps | Unreliable — see below | **Always works** |
| Settings / system UI | Impossible | **Works** |
| Keycode coverage | Partial; some silently dropped | Full |
| Returns output | No | **Yes** (`adb_response`) |
| Extra state | — | volume, mute, HDMI input, running processes |
| Setup fragility | Robust | Needs developer mode; can drop after reboot |

**Rule of thumb:** launch and command over **ADB**; read state from the **remote** entity.

### Why remote-transport launching is unreliable

The `androidtvremote2` library does this before sending anything:

```python
prefix = "" if urlparse(app_link_or_app_id).scheme else "market://launch?id="
```

An App ID with no `://` becomes `market://launch?id=<package>` — a URI owned by the **Google Play Store**. Play Store then either resolves a launch intent (app opens) or gives up and shows its own detail page. There is no third outcome, and no way to bypass it from that transport.

The protocol carries exactly one field, `app_link`. There is no package, component, or intent field to send instead.

**ADB has no such indirection.** `am start -n <package>/<activity>` goes straight to the activity. This is the single reason ADB fixes everything the remote transport couldn't do.

---

## 2. Apps

All thirteen are configured in the `androidtv_remote` options and verified launching. Exact activities harvested from the device.

| App | Package | Activity | Remote transport |
|---|---|---|---|
| Netflix | `com.netflix.ninja` | `/.MainActivity` | package ✅ |
| Prime Video | `com.amazon.amazonvideo.livingroom` | `/com.amazon.ignition.IgnitionActivity` | deep link `https://app.primevideo.com` |
| YouTube | `com.google.android.youtube.tv` | `/...tv.activity.ShellActivity` | package ✅ |
| YouTube TV | `com.google.android.youtube.tvunplugged` | `/...ChrobaltMainActivity` | package ✅ |
| Peacock | `com.peacocktv.peacockandroid` | `/com.peacock.peacocktv.GoogleMainActivity` | package ✅ |
| Paramount+ | `com.cbs.ott` | `/...SplashMediatorActivity` | package ✅ |
| Max | `com.wbd.stream` | `/com.wbd.beam.BeamActivity` | deep link `https://play.max.com` |
| Apple TV | `com.apple.atve.androidtv.appletv` | `/.MainActivity` | deep link `https://tv.apple.com` |
| Hulu | `com.hulu.livingroomplus` | `/.WKFactivity` | package ✅ |
| Disney+ | `com.disney.disneyplus` | `/com.bamtechmedia.dominguez.main.MainActivity` | package ✅ |
| Fubo TV | `com.fubo.firetv.screen` | `/tv.fubo.mobile...DispatchActivity` | package ✅ |
| ESPN | `com.espn.score_center` | `/com.espn.startup.presentation.StartupActivity` | scheme `sportscenter://x-callback-url` |
| BritBox | `com.britbox.tv` | `/axis.androidtv.sdk.app.MainActivity` | ❌ **ADB only** |

Three notes worth carrying forward:

- **BritBox has no working remote-transport route.** Package bounces, `https://www.britbox.com` opens the Hisense browser, and `britbox://` **broke the device pairing** and required a manual re-pair. It is also the *international* package, not `com.britbox.us` as public sources claim.
- **ESPN needed the app's registered custom scheme.** Registered schemes work; guessed ones are actively dangerous.
- **YouTube works by bare package**, contradicting the widely repeated claim that `vnd.youtube.launch://` is required.

### Also installed

Spotify, Tubi, Starz, NordVPN, Weather Channel, YouTube Music, Google TV movies, Play Games, plus the Hisense/VIDAA suite (Live TV, Media Center, HiShow, Single Listen, AI Sense). Full activity strings are in `projector_actions.json`.

---

## 3. Keys

Send as `adb shell input keyevent <code>`, or over the remote transport as `remote.send_command` with the bare **name** (case-sensitive; `KEYCODE_` prefix optional). **Numeric codes do not work over `remote.send_command`** — the string `"176"` becomes `KEYCODE_176` and throws.

### Verified working

| Key | Code | Where | Result |
|---|---|---|---|
| `HOME` | 3 | both | Google TV home |
| `SETTINGS` | 176 | **ADB only** | Full Settings app |
| `NOTIFICATION` | 83 | **ADB only** | Quick-settings dashboard |
| `ALL_APPS` | 284 | **ADB only** | Full apps grid |
| `TV` | 170 | **ADB only** | Hisense Live TV |
| — (`META_LEFT`) | **117** | **ADB only** | **Keyboard search page** |
| `SEARCH` | 84 | **ADB only** | Voice search — **mic goes live** |

**Search is two different things.** Keycode **117** opens `katniss`'s keyboard search page with no microphone involvement — that's the one you want behind a Search button. Keycode **84** opens the voice overlay *and activates the mic*, confirmed by systemui's `MicrophoneCaptureIndicator` window appearing next to it. Dismiss with `BACK` (4).

117 is `META_LEFT` in the standard Android table. Google TV remaps it, so reading the keycode list would never have found it.

### Searching for a term without voice

Since ADB can inject keystrokes, your app can supply the query itself — the user never types and the mic is never engaged:

```bash
adb shell input keyevent 117; sleep 6; input text outlander
```

Append `; sleep 1; input keyevent 66` to press ENTER if the app doesn't search as you type.

Verified end to end — the query was confirmed sitting in the search box on screen.

**Timing matters.** With a 4-second gap the search page had closed before the text arrived and the injection landed on the home screen. Six seconds worked, with the search activity confirmed still focused before *and* after. Build in the delay; don't fire the two back to back.

**Spaces:** `input text` treats a bare space as an argument separator — use `%s` instead (`the%scrown`). Avoid shell metacharacters in the query.

### Verified no-op

`MENU` (82) — app-dependent by design; the framework delivers it to the foreground app and the launcher ignores it. May still work inside media apps.
`APP_SWITCH` (187) · `GUIDE` (172) · `INFO` (165)

### Do not send

| Key | Why |
|---|---|
| `MUTE` (91) | Mutes the **microphone**, not the speakers. Use `VOLUME_MUTE` (164). |
| `POWER` (26), `TV_POWER` (177), `SLEEP` (223), `SOFT_SLEEP` (276) | Turn the projector off |
| `TV_INPUT` (178), `TV_INPUT_HDMI_1..4` (243–246) | Kill the picture |
| `PAIRING` (225) | Drops into Bluetooth pairing mode |
| `PROFILE_SWITCH` (288) | Changes the active Google TV profile |
| `STB_POWER` (179), `AVR_POWER` (181) | Power-cycle *other* devices over CEC |

Reassuringly: nothing in the keycode set can factory-reset the device or un-pair Home Assistant.

---

## 4. Settings — the special case

Settings defeated every route until ADB:

| Attempt | Result |
|---|---|
| `remote.send_command: SETTINGS` | Accepted by the API, silently ignored |
| Launch `com.android.tv.settings` as an app | Bounces to Play Store |
| `intent:` and `intent://` URIs | Silently ignored |
| **`adb shell am start -a android.settings.SETTINGS`** | ✅ Works |
| **`adb shell input keyevent 176`** | ✅ Works |

The same keycode is ignored over one transport and works over the other — a useful reminder that API acceptance says nothing about device behaviour.

---

## 5. Diagnostics

```bash
# What is ACTUALLY on screen — sees overlays and panels app_id cannot
adb shell dumpsys window | grep mCurrentFocus

# Complete inventory of launchable apps with exact activities, one call
adb shell cmd package query-activities --brief \
  -a android.intent.action.MAIN -c android.intent.category.LEANBACK_LAUNCHER

# Single app
adb shell cmd package resolve-activity --brief \
  -c android.intent.category.LEANBACK_LAUNCHER <package>

# Launch without knowing the activity
adb shell monkey -p <package> -c android.intent.category.LEANBACK_LAUNCHER 1
```

**`LEANBACK_LAUNCHER`, not `LAUNCHER`.** Android TV apps only register the leanback category; the phone-style one returns *"No activities found."* This is probably also why Play Store couldn't resolve launch intents for some of them.

Commands can be chained, which makes testing cheap — press a key and read the result in one round trip:

```bash
adb shell input keyevent 3; sleep 2; input keyevent 176; sleep 3; dumpsys window | grep mCurrentFocus
```

---

## 6. Known issues

**`app_id` goes stale after standby.** *(affects automations)*
After the projector wakes, `media_player.deck_hisense_projector.app_id` freezes at its pre-sleep value and never updates, while the entity still reports `state: on`. Anything keyed on the current app reads a stale value indefinitely.
**Fix:** `homeassistant.reload_config_entry` on entry `01KYMSWCPNGE5JW5QXMCBX08E9` — verified to restore live updates immediately. Worth automating on the projector transitioning to `on`.
**Detect:** compare `app_id` against `dumpsys window | grep mCurrentFocus`. Disagreement means stale.

**Phantom duplicate options.** *(cosmetic — do not chase)*
Reading the config entry with options included shows every app twice. This is **not** what's stored. Verified with Core stopped: the on-disk store contains only `{enable_ime, apps}`, and the duplicates reappear after a clean restart. It's an artifact of the options-flow probe used when reading.

**Shared ADB key.** *(operational)*
`/config/.storage/androidtv_adbkey` is shared with the Fire TV at `192.168.1.65`. Deleting it to force a fresh authorization prompt de-authorizes **both** devices.

**Cast log noise.**
pychromecast retries `192.168.1.64:8009` every 5 seconds and fails. Unrelated to this setup — something holds a stale Cast reference.

---

## 7. Icons

`app_icon` in the `androidtv_remote` options **must be an image URL**. It is passed verbatim into the media browser's `thumbnail` field and rendered as `background-image: url(...)`. There is no branch anywhere in the HA frontend that detects an icon-set name.

- ✅ `/local/media_icons/Netflix-sm.png` — served from `/config/www/`, fetched with auth
- ✅ `https://…` — any reachable image
- ❌ `mdi:castle`, `local:netflix`, `fapro:netflix` — **blank tile**, and worse, a non-empty value *suppresses* the default fallback icon. If you have no image, leave it empty.

Icon-set names work fine in Lovelace **cards** (Universal Remote Card renders any colon-containing string via `<ha-icon>`). Two different mechanisms — don't mix them up.

**Active icon sets on this instance:** `fa6-brands`, `fa6-regular`, `fa6-solid`, `local`. There is no `fapro` or `si` set. Note `www/ur_firetv.yaml` and `www/ur_samsung.yaml` reference `fapro:` names that live in `local` — those two remotes are likely showing blank icons.

---

## 8. Method note

Two conclusions in this work were wrong because they rested on a single readout of `app_id`:

1. A launch was called "bounced to the Play Store" when nothing had launched at all.
2. The projector was declared asleep and unresponsive while it was awake and obeying commands — `app_id` had simply gone stale.

The corrective is cheap. For launches, cross-check against recorder history with `significant_changes_only=false` — **the number of commands issued must equal the number of state transitions logged, in order.** For anything on-screen, use `dumpsys window`, which sees overlays that `app_id` structurally cannot.
