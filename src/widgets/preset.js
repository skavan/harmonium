/* PRESET tile — icon square that fires an app/preset (warm-start:
   ensures its activity first); drawer screens pop back after firing. */
WIDGETS.preset = {
    sub: (e, t) => t.sub_label || "",
    /* NO ACTIVITY GLOW (v0.79 — review: "the Discover Weekly preset
       is always highlighted! Why?"). Because v0.68.6's ownership
       stamp doubled as an ON state: every preset of a RUNNING
       activity lit up — which reads as "this playlist is playing",
       a claim nobody can back. A preset is a button, not a state;
       the stamp keeps its real job (warm-start + the new default
       landing) and stops glowing. */
    select: (e, t) => {
      /* BROWSE taps (v0.49) navigate WITHIN the drawer — stepping
         into Albums must not pop the drawer shut */
      if (t.action && t.action.browse !== undefined) {
        browseGo(t.action.browse);
        return;
      }
      const fired = firePreset(t);
      /* drawer screens (apps, music library): picking an item is a
         one-shot — fire it, announce it, and pop back to where the
         drawer was opened from (physical keys drive the UI here, so
         the user shouldn't have to Back out by hand) */
      const sc = screenOf(S.screen) || {};
      /* an explicit `navigate` (v0.68.7) IS the declared landing —
         firePreset has already gone there; popping would undo it */
      if (fired && sc.drawer && !t.navigate) {
        flashBar(t.label);
        if (S.stack.length) navigate(S.stack.pop(), true);
        else if (sc.parent && screenOf(sc.parent)) navigate(sc.parent, true);
      }
      /* THE DEFAULT LANDING (v0.79 — review: "logically, the default
         is the destination/controller of the Belongs To Activity"):
         outside a drawer, an activity-owned preset with no declared
         `navigate` lands on its activity's page — tap Discover
         Weekly on the hub, arrive at the music controller. An
         explicit `navigate` still beats it (v0.68.7 doctrine). */
      else if (fired && !sc.drawer && !t.navigate && t.activity) {
        const a2 = (CONFIG.activities || {})[t.activity];
        if (a2 && a2.screen && screenOf(a2.screen) && S.screen !== a2.screen)
          navigate(a2.screen);
      }
    }
  };
