/* PRESET tile — icon square that fires an app/preset (warm-start:
   ensures its activity first); drawer screens pop back after firing. */
WIDGETS.preset = {
    sub: (e, t) => t.sub_label || "",
    isOn: (e, t) => !!(t.activity && isActivityActive(t.activity)),
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
      if (fired && sc.drawer) {
        flashBar(t.label);
        if (S.stack.length) navigate(S.stack.pop(), true);
        else if (sc.parent && screenOf(sc.parent)) navigate(sc.parent, true);
      }
    }
  };
