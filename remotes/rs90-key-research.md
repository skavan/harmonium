# RS90 physical keys — research + RESOLUTION (2026-08-22)

*Purpose: The full RS90 hardware-key story, from research to the
shipped fix. Audience: Suresh + the runbook.*

## ✅ RESOLVED — the four-layer fix (read this first)

The RS90 keys work, reboot-proof, as of 2026-08-22. It took four
independent layers, all required (canonical operational detail lives
in `remotes/rs90-facts.md` and `tools/ime-fix/README.md`):

1. **KISS Launcher as home** — cantata-as-home grabs keys at boot;
   a dumb FOSS launcher frees them (cantata stays, launched on demand).
2. **KeyMapper via the Input-Method path** (never Expert Mode) —
   accessibility on, KeyMapper keyboard enabled+selected, auto-switch
   ticked, DND access granted (volume/mute need it), WSS granted.
3. **The boot IME-injection race** is the real reboot-killer — the
   KeyMapper IME is selected before the pipeline is ready, so
   injected events die until the IME is re-selected once.
4. **`com.skavan.imefix` APK** (`tools/ime-fix/`) automates that
   bounce, fired by Fully's "App to Run on Start in Foreground,"
   one-shot, self-killing. This is the permanent fix.

## ⚠️ CORRECTION — the device-id theory below was WRONG

The section that follows chased KeyMapper's documented known-issue
#5 (device IDs change at reboot → set triggers to "Any device").
**It was tested and it FAILED**: triggers were already "Any device"
and keys still died after reboot. The true cause was the IME
injection race (layer 3 above), not trigger-device matching. The
research is kept for the audit trail, struck through in spirit.

## (superseded) THE THEORY THAT FAILED — KeyMapper documented issue #5

KeyMapper's own Known Issues page, verbatim:

> **Key maps stop working after device reboot** — device IDs change
> unpredictably on some devices after reboot.
> **Workaround: set the device for the trigger to "any device"** so
> Key Mapper accepts the trigger from any device.

(https://docs.keymapper.club/known-issues/)

It matches every symptom we recorded, including the ones that made no
sense last night:

- Fresh recording works: the trigger stores the keypad's CURRENT
  input-device id, which matches — until the next boot.
- After reboot: the MTK firmware re-enumerates input devices with a
  different id → triggers silently never match. Process alive ✓
  service bound ✓ settings intact ✓ — nothing is broken except an id
  comparison deep inside trigger matching, invisible to every probe
  we ran.
- Nothing revives it (app open, re-enrollment, force-stops) — except
  re-CREATING the mapping, which is exactly what each "fresh setup"
  did. We were re-recording the new device id every time.
- KeyMapper 4.2's changelog — "'Any input device' is now the default
  for triggers" — exists precisely because of this. But a trigger
  RECORDED from a physical press appears to pin the device it was
  recorded from, and every row in our generated data.json carries the
  astrion-copied pin `"deviceId": "io.github.sds100.keymapper.THIS_DEVICE"`.
- "Volume did nothing at all after reboot": with the trigger
  unmatched, keys flowed raw to Fully — whose imported Astrion
  doctrine sets `disableVolumeButtons: true`, swallowing them. Two
  configs interlocking to fake a haunting.

## Morning test (5 minutes)

0. FIRST, the theory-check: KeyMapper → the Volume Up mapping → tap
   the trigger key row → what does its **Device** dropdown currently
   say? A NAMED device (e.g. some MTK keypad descriptor) = the
   id-pin theory holds, proceed. Already "Any device" = the theory
   has a hole (note it, still run the reboot test — the dropdown and
   the stored pin have disagreed in KeyMapper before), and the
   remaining levers are Battery→Unrestricted and the Settings-UI
   accessibility toggle.
1. Set the trigger's **Device → Any device** → save.
2. Reboot. Touch nothing. Engine up → Vol Up.
3. **If it survives**: pull the backup (KeyMapper auto-backup to
   Download, then adb pull, same as before) and hand me the zip —
   the flipped row reveals the any-device serialization and I
   regenerate `data.json` for all 19 rows mechanically (the
   schema-by-example pattern that built this set; the constant
   could not be confirmed from public source tonight, so ground
   truth from the device beats a guess).
4. **If it dies again**: the id theory falls and the remaining levers
   are Battery→Unrestricted and the Settings-UI accessibility toggle
   (both still untested), then the vendor ticket.

## Consequence for the Astrion

Its data.json carries the same `THIS_DEVICE` pins — and its KeyMapper
demonstrably works... on a remote that essentially never reboots. The
Astrion may be one reboot from the same haunting (its 8.1 firmware may
also keep ids stable — unknown). Doctrine: don't fix what isn't
broken, but **after the Astrion's next reboot, test Back/volume
immediately**; if dead, the fix is the same any-device flip, not the
expert-mode archaeology we did here.

## Secondary findings (the rest of the sweep)

- **Button Mapper (flar2)** is the community answer on the RS90 — the
  recommendation comes from ccsfounder, who per the HA thread is
  Willis Desai (ccs777), the product's founder: "remap all 24 buttons
  at the Android OS level… you can bypass the Haptique app, so button
  mapping is disabled when using it."
  (https://community.haptique.io/t/useful-app-to-remap-physical-buttons/340)
  BUT its keycode-class features live behind a Play-billing Pro
  unlock — unreachable on this uncertified-GMS device. Fallback only
  if KeyMapper's any-device fix fails AND someone solves billing.
- **Fully's JavaScript API has NO hardware-button events** — no
  onVolumeUp, no key event bindings, no remap (checked docs). The
  "let Fully hand keys to the page" shortcut does not exist.
  (https://www.fully-kiosk.com/en/)
- **The stock firmware publishes all 24 buttons over MQTT** once the
  remote is paired to a broker via Haptique Config —
  github.com/daangel27/haptique_rs90 consumes them as HA device
  triggers. Not a key path for Harmonium (HA round-trip latency +
  double-fire risk beside local handling) but a genuine roadmap
  asset: hardware-key telemetry and the §6.7 HA→remote channel get a
  vendor-native transport on this device.
- **cantata acquitted**: no media session, force-stop changed
  nothing; the "launches then disappears," "steals volume," and
  "OPUS launcher" scares were all misreads of a healthy app plus our
  own Fully setting.
- **Vendor cadence**: Haptique ships frequent system/app updates
  (release-notes thread, Feb 2026: system app 3.3 — ours reads 3.7,
  newer). If a firmware ticket is ever needed they're active; if the
  any-device fix lands, there is no firmware bug to report — device
  id churn at boot is ugly but the workaround is canonical.
- **RS90x** (the Kickstarter successor) is slated for a custom AOSP
  ROM by a LineageOS team — future units may make all of this moot.

## Status of the fallback doctrine (if all else fails)

Raw keys work reboot-proof with zero interception: full d-pad + OK,
CH▲▼, F1 power, F2 home, F5 mic, F6/F7/F8, dots F9/F10/F11 (which
without KeyMapper become bindable Harmonium keys rather than
launchers). Hostages under interception-failure: volume/mute
hardware keys, Back, Menu, transport row, all hold gestures.
