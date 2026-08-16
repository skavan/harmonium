# Wiping Harmonium completely (the virgin-install test)

**Outcome:** a Home Assistant box with zero trace of Harmonium, so
the next install is a true stranger's first hour. Use this before
testing a release on the virgin box.

Everything Harmonium leaves on a box lives in five places, and the
uninstall UI only cleans two of them. The config store *deliberately*
survives reinstalls — an upgrade must never eat your rooms — which is
exactly what you don't want when the point is a clean slate.

## 1. Remove the integration

Settings → Devices & Services → **Harmonium** → ⋮ → **Delete**.

Takes with it: the Studio sidebar panel and the minted
`select.harmonium_*` entities.

## 2. Remove the code from HACS

HACS → Harmonium → ⋮ → **Remove**. Deletes
`custom_components/harmonium/`. (The repository stays known to HACS,
so reinstalling later is a search away.)

## 3. Delete the data it leaves behind

File editor, Samba, or SSH — **this is the step everyone misses**:

- `/config/.storage/harmonium.config` — **the config store.** No
  removal hook deletes it; skip this and the reinstall "magically"
  remembers every room and activity, and the virgin test is void.
- `/config/www/harmonium/` — the whole folder: deployed engine,
  `config.json`, the `.house` marker, `skins/`. (Device-photo skins
  you uploaded from the Studio live here and go with the wipe —
  re-upload after. Hero/banner pictures do NOT: the Studio uploads
  those to `/config/www/images/`, outside Harmonium's tree, exactly
  so a wipe can't eat them.)
- If it exists from the very old days: `/config/www/remote-proto/`.

## 4. Revoke the pairing tokens

Your HA user profile → Security → Long-lived access tokens → delete
anything named **"Harmonium …"**. Every paired remote minted one; a
virgin pass should mint its own.

## 5. Restart HA and verify zero

- No Harmonium under Settings → Devices & Services.
- No Studio in the sidebar.
- Entities list shows no `select.harmonium_*`.
- `http://<box>:8123/local/harmonium/config.json` returns **404**.

## 6. Wipe the client too

The other half lives on the remote/browser: `hakr_token` and
`hakr_host` sit in localStorage and will ghost straight into the new
install, silently skipping the Pair screen you want to test.

- Browser: clear site data for the box's host (DevTools →
  Application → Clear site data, or the padlock menu).
- Astrion / Fully Kiosk: clear cache **and** website data.
- (While an install is still alive, ⓘ → Tools → **Sign out &
  re-pair** does this politely; after a wipe, clear-data is the way.)

## 7. The virgin run

1. HACS → Harmonium → **Download** → pick the release version.
   (If the box has never known Harmonium: HACS → ⋮ → **Custom
   repositories** → `https://github.com/skavan/harmonium` → type
   **Integration** → Add, then it appears in the HACS search.)
2. **Restart HA.**
3. Settings → Devices & Services → **Add integration** → Harmonium.
4. Expect the starter seed. Its log line is INFO — **invisible** in
   Settings → Logs, which shows WARNING+ — so the proof is
   `/local/harmonium/config.json` existing again.
5. Studio opens on the starter config (check the `s`-stamp in the
   header matches the release).
6. The remote boots to the **Pair** screen; pair with the code.
7. Sanity that needs no config at all: **hardware and soft volume
   keys route to the wired volume** out of the box.

That's a true stranger's first hour, end to end.
