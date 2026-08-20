# Removing Harmonium

*Purpose: Every step to completely remove Harmonium from a Home Assistant install — and from the remotes it ran on. Audience: users.*

**Outcome:** no Harmonium code, data, entities, tokens, automations
or device hooks left anywhere. (Testing a fresh install rather than
leaving? The maintainer-flavored twin of this page is
[Wipe & reinstall](wipe-and-reinstall.md).)

Sorry to see you go — if something drove you off, an
[issue](https://github.com/skavan/harmonium/issues) telling us what
would be a parting gift.

## 1. Remove the integration

*Settings → Devices & Services → Harmonium → ⋮ → **Delete**.*

This takes the Studio sidebar panel and the minted
`select.harmonium_*` entities with it.

## 2. Remove the code from HACS

*HACS → Harmonium → ⋮ → **Remove*** — deletes
`custom_components/harmonium/` (engine source, bundled skins and
sounds included). If you added the repo as a custom repository and
want that gone too: *HACS → ⋮ → Custom repositories → remove
`skavan/harmonium`.*

## 3. Delete the data it leaves behind

By design, uninstalling never deletes your config — an upgrade must
not eat your rooms — so this manual step is the one everyone
misses. Via File editor, Samba or SSH, delete:

- `/config/.storage/harmonium.config` — **the config store**: every
  room, activity and remote profile you built.
- `/config/www/harmonium/` — the deployed engine, `config.json`,
  skins, sounds, and (if you used the battery blueprint's local
  staging) `blueprints/`. Hero/banner images you uploaded live in
  `/config/www/images/` — outside this tree on purpose — remove
  yours by hand if you're done with them.

## 4. Battery alerts (if you set them up)

- Delete the automation(s): *Settings → Automations* → anything
  named "… battery alerts".
- Delete the blueprint: *Settings → Automations → Blueprints* →
  **Harmonium: remote battery alerts** → ⋮ → Delete.

## 5. Revoke the pairing tokens

*Your HA user profile → Security → Long-lived access tokens* —
delete anything named **"Harmonium …"**. Every paired remote minted
one.

## 6. Clean the remotes themselves

On each hardware remote / tablet / kiosk that ran Harmonium:

- **Fully Kiosk**: change (or clear) the Start URL — it points at
  the now-deleted `/local/harmonium/index.html` — and clear the web
  cache while you're in there.
- **Browser installs**: remove the bookmark; Harmonium's own
  local state (`hakr_*` keys) dies with the site data, or clear
  site data for your HA host to be thorough.
- **KeyMapper** (Astrion and kin): the key mappings are yours, not
  Harmonium's — they just emit characters. Keep them if the device
  has a next life with another dashboard, or *KeyMapper → ⋮ →
  Delete all* to zero it.
- Anything from [setup-remote.bat](../../setup-remote.bat)
  (rotation lock) and the wake-lock/launcher tweaks in
  [hardware-keys](hardware-keys.md) are device-level Android
  settings, independent of Harmonium — revert them only if the
  device is leaving service.

## 7. Restart and verify zero

Restart Home Assistant, then check:

- nothing under *Settings → Devices & Services* mentions Harmonium;
- `http://<your-ha>:8123/local/harmonium/index.html` returns 404;
- Developer tools → States has no `select.harmonium_*` (or any
  `harmonium` match);
- *Settings → Automations* and *Blueprints* show no Harmonium
  entries;
- your token list has no "Harmonium …" tokens.

That's zero trace. Reinstalling later starts from the starter
config like any stranger — unless you kept a copy of
`.storage/harmonium.config`, which drops back in exactly where you
left off.
