# How controllers work

*Purpose: the mental model behind controllers, casts, devices and the preview — in plain English, so the Studio's choices read as obvious instead of mysterious. Audience: anyone building beyond the starter config.*

A **controller** is a screen that knows how to draw something, but doesn't know *what* until you tell it. That one sentence explains most of what you'll see in the Studio. Here's the rest.

## There are two kinds of controller

**Activity controllers** draw an activity. Music Media Player and TV Media Player are the stock ones; any custom copy you make of them is one too. Every tile on them points at a *role* — `$context.media_player`, `$context.volume`, `$context.dpad` — never at a real entity.

**Device controllers** draw one device. Media Device, Light, Climate, Fan, Cover and Switch are the stock ones (one per Home Assistant domain), and a custom copy of any of them is one too. Their tiles point at `$device` — "whichever device this page is currently showing".

(The Apps drawer and the Music Library are neither: they're pickers that pop back after a choice, not surfaces.)

## An activity's context comes from its cast

An activity's **cast** is the list of devices and entities involved. Each pre-wired device brings its roles — media player, power, volume, D-pad, source select, and so on. The **Roles** tab decides which cast member actually fills each role; the first member in the cast is the *primary*, the activity's face.

That set of filled roles is the activity's **context**, and it's what every `$context.*` reference resolves through. Now Playing shows whatever fills the media player role, the Volume band gathers every cast member that owns a volume, the group cards come from the cast's groups. Change the cast and the same controller draws differently — that's the whole point of sharing one stock surface between rooms.

## A controller shows nothing on its own

Because its tiles are references, a controller has nothing to draw until something supplies the answers. An activity controller with no activity running resolves to empty bands. A device page with no device resolves to nothing. That's why, when you open a controller in the Studio, the first thing at the top is *pick something to preview*.

## Previewing means "show me this surface with that as the input"

When you pick an activity (on an activity controller) or a device (on a device page), you're saying: *render this controller as if that were driving it*. The Studio's preview is the real engine, so what you see is what the remote will show.

The input decides more than the tiles. It decides **what the physical keys do**:

- On an activity controller, the keys follow the controller's **control target**, resolved through the activity's context — Navigation is `$context.dpad`, Power is `$context.power`, and so on.
- On a device page, the control target comes **from the device itself**: Navigation is its D-pad role, Power and Volume its power and volume roles. A device with a D-pad (a TV, a streaming stick) takes the keys, and you'll see the BACK | HOME strip at the bottom of the page. A device with no D-pad (a Sonos, a light) leaves the keys with the app, and there's no strip. This isn't something you author on the page — it's a fact about the device, set in **Pre-wired Devices**.

You can swap the preview source as often as you like. Picking a different activity or device re-renders the surface with the new input; nothing is written to your config.

## Copies are templates, not bindings

A custom copy of a device page is a **template** — any compatible device can adopt it. Which page a device opens is the device's own choice: on its card in Pre-wired Devices, pick the stock page or any custom copy. Two Samsungs can share one custom page; one of them can pin the stock page instead. The copy itself stays unbound.

(Older configs had copies bound to the device they were made for. The Studio releases those on load — the device keeps the page through its own pick — and says so in the status line.)

## You can hard-code if you really want to

Nothing stops you from putting a real entity in a tile instead of `$device` or `$context.<role>`. The engine draws it literally. Two things to know before you do: the generated bands (the Volume band, the group cards, the Devices section) still come from whatever activity is running, so only the tiles you author by hand can be pinned; and a pinned surface can't be shared the way a template can. It's the right tool for a genuinely one-off page, and the wrong one for anything you'd want twice.

## Inside an activity, the device takes over

Tap a device in an activity's Devices section and its page is the device's *own* controller — drawn as that device, keys routed to that device, BACK returning you to the activity. It used to be that the activity's key profile bled through, so standing on the Samsung's page the arrows still went to the Fire TV. Since v0.87 the device you're looking at is the one you're driving.

## Where things live

| Question | Where the answer is |
|---|---|
| What's in the activity, who's primary | Activity → **Setup** tab (the cast) |
| Who fills each role | Activity → **Roles** tab |
| Which bands the surface shows, and in what order | Activity → **Controller** tab (the ↑↓ there is the one order lever) |
| Which controller an activity lands on | Activity → **Controller** tab → *Lands on* |
| What the physical keys do on an activity surface | The controller's *Control target* panel |
| What the physical keys do on a device page | The device's roles, in **Pre-wired Devices** |
| Which page a device opens | The device's card in **Pre-wired Devices** |
| How one cast member draws (or doesn't) | The member's ⚙ in Setup → *Draws as* |
