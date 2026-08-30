# Issue #5 body — D-pad targeting discussion

Paste into https://github.com/skavan/harmonium/issues/5

---

## The problem

A hardware remote has one D-pad, one Back, one Home — and two things they could drive: the remote's own screen (pages of activities, devices, the music library), or the device showing on the television (Fire TV, Apple TV, cable box). Harmony never had to answer this because its remotes had no navigable UI of their own. Every screen remote has to answer it, and the answer shapes every button press you make.

v0.85.7 ships **Approach A** below. The full specification is [HARMONIUM-INPUT-ROUTING.md](https://github.com/skavan/harmonium/blob/main/docs/HARMONIUM-INPUT-ROUTING.md). Before this hardens into permanent muscle memory for everyone, I want to know whether it matches your instincts — or fights them.

## Approach A — context routing (what ships today)

The buttons drive whichever screen you are presumed to be looking at:

- On most pages, D-pad/OK/Back/Home drive the **panel** (the remote's own screen).
- On a **TV page** — one whose subject has a navigable UI on the television (Fire TV, Apple TV, cable box) — a tap of D-pad/OK/Back/Home drives the **television**. You're watching the TV, so the buttons drive the TV.
- **Long-press Back and Home always drive Harmonium**, on every page. That's the unconditional escape hatch.
- Need the panel back while on a TV page? **Ch▲/▼ borrows the D-pad** for the panel: a focus ring appears, every press renews a 5-second window, a visible drain warns before it hands the D-pad back to the television.
- Volume, mute and transport always follow the activity's audio path, on every page, regardless of any of the above.

Upside: no mode to manage — sit down, watch TV, the buttons just work on the TV. Downside: the same physical button does different things on different pages, and you have to know (or feel) which kind of page you're on.

## Approach B — explicit device mode (the alternative)

D-pad/Back/Home **always** drive the panel, everywhere. To drive the television you explicitly enter a *device mode* — a dedicated key, a tile on the TV page, or some gesture — with a clear on-screen indicator, and you leave it the same way (or it times out). Only TV pages would ever need the mode.

Upside: one rule with zero ambiguity — every button does the same thing on every page, always. Downside: every trip into the Fire TV's own menus costs an explicit mode switch first, and mode errors don't disappear — they move ("why is the panel dead?" instead of "why did the TV just go home?").

## An honest data point

I designed A, I use it daily, and I still catch myself using it wrong: on the Fire TV page I press the D-pad expecting the panel to respond, or tap Back expecting Harmonium. I also made the equivalent mistakes under the pre-0.85.7 policy, which routed the long-presses differently. That's one user and possibly just my own muscle memory — which is exactly why I'm asking.

## Questions

1. Which approach matches your instinct — not on day one, but after a week of daily use?
2. If A: does the Ch± borrow work for you in practice, or do you find yourself fighting it?
3. If B: what should enter and leave device mode, and how loud does the mode indicator need to be?
4. Is there an approach C? (Per-page choice in the Studio; hold-a-key-to-drive-the-TV; touch always panel / keys always TV; something else.)
5. What hardware are you using? (Astrion, RS90, a tablet, and which TV devices.)

Everything is useful here, including "A is fine, stop second-guessing it." If you've caught yourself pressing the wrong thing, say where — the specific page and the specific button is the most valuable feedback there is.

References: [input routing spec](https://github.com/skavan/harmonium/blob/main/docs/HARMONIUM-INPUT-ROUTING.md) · [v0.85.7 release notes](https://github.com/skavan/harmonium/blob/main/docs/releases/release-notes-v0.85.7.md) (the breaking-changes section describes what changed in this release).
