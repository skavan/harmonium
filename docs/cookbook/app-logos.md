# TV app logos

Since v0.85.8 the TV Apps drawer shows real channel logos. Harmonium ships a logo pack that covers the built-in app catalog, and every app tile renders as a uniform channel-poster card. An app with no logo shows its icon and name in the same card, so a mixed drawer still lines up.

## How it works

Harmonium deploys its bundled logos to `config/www/harmonium/apps/` when Home Assistant starts. For every app in your drawer, the remote looks for a logo file named after the app's id — for example the app with id `netflix` looks for `/local/harmonium/apps/netflix.webp`. If the file exists, it becomes the card. If it doesn't, the tile falls back to the app's icon and name. That's the whole mechanism, and it applies to your own custom apps exactly as it does to the built-in ones.

## Add a logo for your own app

1. Find the app's id in the Studio under TV Apps (the App id field — for example `f1tv`).
2. Make a logo image, 290 × 218 pixels, saved as WebP. This is the Roku channel-store shape, and the [Roku channel store](https://channelstore.roku.com) is a good place to find most services' artwork in exactly this shape.
3. Name the file after the app id — `f1tv.webp` — and copy it into `config/www/harmonium/apps/` on your Home Assistant machine.
4. Reload the remote once (a missing logo is only checked once per session). The tile is now the logo.

No configuration is needed — the file name is the wiring.

## Replace a shipped logo

Two ways:

- **Replace the file.** Overwrite the file in `config/www/harmonium/apps/` with your own. Harmonium notices the file is no longer the one it shipped and leaves it alone on future updates.
- **Point the app at any image.** In the Studio under TV Apps, set an image path on the app (the Icon field accepts a `/local/...` path). A path set here wins over the logo folder, and it can be any image format, anywhere under `/local/`.

## The shipped set

The pack covers the whole built-in catalog: Netflix, Prime Video, YouTube, YouTube TV, Peacock, Paramount+, Max, Apple TV, Hulu, Disney+, Fubo TV, ESPN, BritBox, Spotify, Plex, Pluto TV, Tubi, PBS, and Philo — plus AMC and Starz, ready for the day those apps join the catalog.

## Notes

- The automatic lookup expects `.webp` specifically. A PNG or JPG works fine through the Studio image path instead.
- Sizes other than 290 × 218 work — the card crops the image to fit — but the Roku shape fills it exactly.
- Logos render at full opacity inside the card's rounded corners. The name is not drawn over a logo (the artwork carries the brand); it returns automatically if the logo file ever fails to load.
