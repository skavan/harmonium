# Battery alerts

*Purpose: Your remote nags you before it dies — tiered beeps/announcements from HA, working even while the device sleeps. Audience: users with a battery-powered remote.*

**Outcome:** when the remote's battery runs low, it speaks up — a
chirp, a spoken announcement, and/or an on-screen banner — more
urgently as the level drops, only during waking hours, and never
while it's charging.

## Why this lives in HA, not the remote

Fully Kiosk puts the webview to sleep after about a minute to save
battery — which suspends the engine's timers exactly when a
low-battery nag matters most. The Fully Kiosk *integration*, on the
other hand, keeps reading the device's battery sensor and can beep
its media player **while the device sleeps**, at zero cost to the
battery. So the alert is an HA automation, shipped as a blueprint.

## Install the blueprint

One click:

[![Import blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fraw.githubusercontent.com%2Fskavan%2Fharmonium%2Fmain%2Fblueprints%2Fautomation%2Fharmonium%2Fbattery_alerts.yaml)

Or by hand: copy
[`blueprints/automation/harmonium/battery_alerts.yaml`](../../blueprints/automation/harmonium/battery_alerts.yaml)
into `<config>/blueprints/automation/harmonium/` and reload
automations.

## Create the automation

*Settings → Automations → + Create → from blueprint → "Harmonium:
remote battery alerts"*, then point it at your remote's Fully
entities:

| Input | Astrion example |
|---|---|
| Battery sensor | `sensor.astrion1_battery` |
| Plugged-in sensor | `binary_sensor.astrion1_plugged_in` |
| Beep player + URL | `media_player.astrion1` + `http://YOUR-HA:8123/local/harmonium/sounds/beep.mp3` |
| Text-to-speech notifier | `notify.astrion1_text_to_speech` |
| Overlay notifier | `notify.astrion1_overlay_message` |

The three alert channels are each optional — use any or all. The
beep URL must be the **full http URL** (the device fetches it
itself); Harmonium deploys the bundled chirp to
`/local/harmonium/sounds/beep.mp3` for you. The notifiers are the
new-style notify **entities** the Fully integration creates. With
the Beep player set, the alert **sets the device's media volume**
(the *Alert volume* input, default 100%) before it sounds — a nag
you can't hear is no nag; TTS rides the same volume.

## See it in the Studio

*System → Remotes & keymaps* shows your battery alerts next to the
remote profiles: current level, the tier profile, an **on/off
switch** that flips the automation right there, a **Test** button
that fires every configured channel at the current level (the
banner cleans itself up a few seconds later), and *Edit levels &
channels* which opens HA's form. (Editing the numbers in-Studio is
on the roadmap.)

One behavior worth knowing: Fully's overlay banner **persists** on
the screen until cleared — so the blueprint clears it automatically
when the battery recovers above the warn level, and the Studio's
Test button clears its own.

## The default profile

Below **20%** → alert every **60 min** · below **10%** → every
**15 min** · below **5%** → every **5 min**. The deepest tier wins.
Alerts only fire between **09:00 and 23:00**, and never while the
plugged-in sensor is on — charging is the message received. Every
number is a blueprint input; change them per remote.

## Troubleshooting

- **Nothing fires.** Check the automation's trace: if every run says
  *failed conditions*, the battery is above the warn level, it's
  plugged in, or you're outside the window — working as designed.
- **The beep 404s.** The sounds folder deploys when the integration
  (v0.84.1+) sets up — restart HA after updating, or check
  `/local/harmonium/sounds/beep.mp3` in a browser.
- **TTS/overlay errors "not found".** Use the notify *entities*
  (`notify.astrion1_text_to_speech`), not legacy service names.
