# Harmonium — Input Routing Specification

Version 1.0 · Physical buttons, panel elements, and swipes

This document defines where every input goes on every page. It is normative:
where it says MUST, the behaviour is the rule, not a suggestion.

---

## 1. Concepts

**Page** — one activity or device being controlled. Every page has exactly one
device or activity as its subject.

**Panel** — the remote's LCD. Shows the current page.

**Focus** — at most one panel element is focused at a time. Focus is drawn as a
ring. If no ring is visible, nothing is focused.

**Claim** — a time-limited loan of the dpad to the panel on pages where the dpad
normally belongs to the device. See §6.

**The subject's screen** — a device has a *navigable UI on a television* if the
user looks at the TV, not the panel, to operate it (Fire TV, Apple TV, cable box,
Blu-ray). This is the only capability that changes button routing.

---

## 2. The four laws

1. **The dpad drives what the user is looking at.** On pages whose subject has a
   navigable UI on a television, that is the television. On every other page it is
   the panel.

2. **Back and Home belong to Harmonium** — except on television pages, where the
   device takes both physical buttons and Harmonium's own Back/Home move onto a
   pinned strip on the panel. Long-press of either physical button ALWAYS targets
   Harmonium, on every page, without exception.

3. **Ch± walks the panel.** One element at a time; section to section when the
   page is sectioned. It is the coarse counterpart to the dpad's fine movement,
   and it is never routed to the device unless the subject is a tuner (§5.6).

4. **Swipe is depth.** Left edge rightward goes up to the parent. Right edge
   leftward goes down into the detail page - if there is one (i.e. Apps or Music Library). Vertical is always scroll and never
   navigates.

---

## 3. Page capability declaration

Routing MUST be derived from declared capabilities, never hand-authored per page.
A page that declares nothing gets the defaults in §5.

```
page:
  id: porch.watch-firetv
  title: Watch Fire TV
  parent: porch                  # swipe-right target
  detail: porch.watch-firetv.apps # swipe-left target, or null
  subject:
    device: firetv-porch
    tvNavigation: true           # law 1 + law 2 hinge on this
  audio: avr-porch               # volume/mute target, or null
  media: firetv-porch            # transport target, or null
  tuner: false                   # ch± goes to the device when true
  sections: false                # ch± jumps sections when true
```

`tvNavigation: true` is the ONLY flag that moves dpad/OK/Back/Home off Harmonium.
Adding a new device type MUST NOT introduce a new routing paradigm — if a device
does not fit these flags, extend the flags, not the rules.

---

## 4. Routing table

| Input | `tvNavigation: false` (most pages) | `tvNavigation: true` (TV pages) |
|---|---|---|
| Dpad ▲▼◀▶ | Panel focus movement | Device — unless claimed (§6) |
| OK | Activate focused element | Device select — unless claimed (§6) |
| Back (short) | Harmonium back | Device back |
| Home (short) | Harmonium home | Device home |
| Back / Home (long) | Harmonium back / home | Harmonium back / home |
| Ch± | Panel walk / section jump | Panel walk / section jump, **and arms the claim** |
| Vol ± | `audio` target | `audio` target |
| Mute | `audio` target | `audio` target |
| Transport | `media` target | `media` target |
| Power (short) | Page's device or activity | Page's device or activity |
| Power (long) | Activity off / all-off macro | Activity off / all-off macro |
| Mic | Device voice service if any, else Harmonium search | Device voice service |
| Menu | Device menu if declared, else page overflow | Device menu |
| Colour keys | Existing global assignments — **out of scope, do not rebind** | Same |

### 4.1 Hard invariants

- Volume, mute and transport follow `audio` / `media`. They are NEVER affected by
  focus, by the claim, or by which page is showing. If `audio` is null, the volume
  and mute keys MUST do nothing.
- A key with no target MUST do nothing. Never repurpose transport, volume or mute
  for navigation, on any page, for any reason.
- Long-press Back and long-press Home are the unconditional escape. No page, mode,
  claim, or device may intercept them.

---

## 5. Per-input detail

### 5.1 Dpad and OK
On non-TV pages the dpad moves focus between panel elements in reading order, and
left/right additionally adjust the focused element when that element is a slider or
a ±-pair (e.g. thermostat setpoint). OK activates the focused element. This means
every panel page MUST be fully operable without touching the glass.

### 5.2 Back
Short-press routes per §4. It is the highest-frequency press on TV pages (backing
out of device menus), which is why the device gets it there.

### 5.3 Home
Short-press routes per §4. On TV pages, Harmonium's home is reachable via the
panel strip (§7) or long-press.

### 5.4 Ch±
Moves panel focus. When `sections: true`, ch± moves to the first element of the
next/previous section rather than the next element. When `sections: false`, it
steps element to element.

On TV pages, ch± additionally arms the claim (§6). This is what makes law 1 safe:
the user can move panel focus without ever taking the dpad away from the TV.

### 5.5 Volume and mute
Always `audio`. Volume ± MUST be repeat-on-hold.

### 5.6 Tuner exception
When `tuner: true`, ch± sends channel up/down to the device and does NOT walk the
panel or arm the claim. This is the only case where ch± leaves Harmonium.

---

## 6. The dpad claim (TV pages only)

On TV pages the dpad and OK belong to the television. A ch± press lends the whole
dpad — arrows and OK — to the panel for a short window.

### 6.1 State machine

```
IDLE ──ch± press──> CLAIMED ──5s idle──> DRAINING ──1s──> IDLE
                       ^                     |
                       └──any panel press────┘   (resets to CLAIMED, full 5s)

CLAIMED  ──physical Back or Home──> IDLE  (and the press goes to the device)
DRAINING ──physical Back or Home──> IDLE  (and the press goes to the device)
DRAINING ──ch± or dpad press──> CLAIMED   (re-arms, full 5s)
```

### 6.2 Rules

1. **Only ch± arms the claim.** Not volume, not mute, not power, not transport, not
   touch. One entry point.
2. **The timer is 5 seconds of idle, not 5 seconds total.** Every dpad, OK or ch±
   press while claimed resets it to a full 5 seconds. A user adjusting a slider
   MUST never be cut off mid-interaction.
3. **The final second is visibly drained**, as a depleting indicator on the focused
   element (see 6.4). Silent expiry is prohibited: the user must be able to see
   that the next press will land on the television.
4. **A press during DRAINING still goes to the panel** and re-arms to CLAIMED. The
   drain is a warning, not a dead zone.
5. **Physical Back or Home ends the claim immediately** and the press itself goes to
   the device. Rationale: the user has visibly changed their mind about what they
   are driving.
6. **On expiry, focus clears** and the ring disappears. Ring visible ⇔ claim active,
   on TV pages, with no exceptions — this equivalence is what the user reads.
7. **Volume, mute and transport are unaffected** by claim state and do not touch
   the timer.
8. Leaving the page (swipe, page jump, timeout to screensaver) ends the claim.

### 6.3 Non-TV pages
There is no claim. The dpad is permanently the panel's. Focus persists and does not
time out.

### 6.4 Visual states

| State | Ring | Panel hint | Physical hint |
|---|---|---|---|
| IDLE | none | none | — |
| CLAIMED | full-strength ring on focused element, plus a ◀ ▶ affordance inside the element when it has horizontal children | "◀ ▶ moves inside · OK presses" | — |
| DRAINING | ring at ~35% opacity | depleting bar along the element's lower edge; "handing the dpad back to Fire TV" | — |

---

## 7. The panel Back/Home strip

On pages where `tvNavigation: true`, Harmonium's Back and Home move onto the panel.

1. The strip is **Harmonium's**, not the device's, and MUST be labelled with the
   app name — the device already owns the physical pair.
2. It MUST be **pinned to the bottom of the panel viewport**, not placed at the end
   of the scrolling content. It must never scroll out of view.
3. It uses Harmonium's accent colour. It MUST NOT use the green reserved for
   connection status.
4. Its two targets are Harmonium back (up one level of app navigation) and
   Harmonium home (app root).
5. The strip is focusable by ch± and the claim like any other panel element.
6. On pages where `tvNavigation: false` the strip is absent — the physical buttons
   already do this job.

---

## 8. Swipes

| Gesture | Action |
|---|---|
| Left edge → right | Navigate to `parent`. Always available. |
| Right edge → left | Navigate to `detail`. If `detail` is null, rubber-band and stop. |
| Vertical | Scroll panel content. MUST NEVER navigate. |

1. Horizontal swipe is **depth only**. There is no sibling-carousel gesture.
2. When `detail` is non-null its name MUST be visible on the page (e.g. a right-edge
   affordance reading "Now Playing →"), so the destination is never a guess.
3. When `detail` is null the gesture MUST produce a rubber-band. Silence reads as a
   missed swipe and makes the user repeat it.
4. Swipes are always Harmonium's. No device ever receives a gesture.
5. Known trade-off, accepted deliberately: swipe-left-for-detail is the inverse of
   the photo-carousel convention. Depth consistency was chosen over that habit.
   Flag it for user testing rather than special-casing it.

---

## 9. Double-press Home

Double-pressing physical Home within 400 ms navigates to Harmonium's root, from any
page including TV pages.

Because device Home is idempotent, the first press MUST be dispatched immediately —
do not buffer for the second press. There is no latency cost, and users who never
discover the shortcut lose nothing.

---

## 10. Discoverability

1. **Key map card.** The ⓘ in the panel header opens a card listing the live
   physical mapping for the current page. Same slot on every page. This is the
   pressure valve that lets routing be contextual without being mysterious.
2. **Breadcrumb.** The header shows `Room · Page` with an up-arrow indicating the
   swipe-right destination. It is an orientation affordance, NOT the primary
   control — it is too small to be a reliable touch target and the gesture and
   long-press are the real mechanisms.
3. No mode indicator beyond the ring. Do not add a "control TV / control remote"
   toggle. The ring, the claim drain and the strip exist precisely so that no such
   toggle is ever needed.

---

## 11. Acceptance criteria

1. On a TV page, pressing dpad ▲ with no prior ch± press moves the television's
   selection and does not move panel focus.
2. On a TV page, ch− then ▶ then OK operates a panel control and never reaches the
   television.
3. On a TV page, ch− then waiting 6 s then ▲ moves the television's selection, and
   the drain was visible for the final second before that.
4. On a TV page, ch− then repeated ◀ presses at 3 s intervals keeps the claim alive
   indefinitely.
5. On a TV page, ch− then physical Back sends back to the television and clears the
   ring in the same event.
6. On any page, long-press Home reaches Harmonium's root — including while a claim
   is active, while a device menu is open, and while the panel is asleep.
7. On the music page, Back and Home are Harmonium's on a single short press, with no
   hold required and no strip present.
8. On the air-conditioner page, volume, mute and transport keys produce no action of
   any kind.
9. On the air-conditioner page, the setpoint is adjustable using only ◀ ▶ with no
   touch input.
10. On a page with `detail: null`, a right-edge leftward swipe rubber-bands and
    navigates nowhere.
11. On a sectioned page, ch+ moves from an element in "Playlists" to the first
    element of "Albums", not to the next element within "Playlists".
12. The panel Back/Home strip remains visible while the panel content is scrolled
    to the bottom and to the top.

---

## 12. Out of scope for this version

- Colour keys keep their existing global assignments. Do not rebind them per page.
- Sibling navigation between activities in a room (no gesture is assigned; use the
  parent page).
- Whether the panel strip should also appear on non-TV pages in a dimmed form. Open
  question: it would remove the only piece of conditional UI in the design, at the
  cost of vertical space on every page.
