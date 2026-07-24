/* PASSTHROUGH tile — a capture surface: while focused/active the
   physical D-pad drives the device wholesale (Harmony doctrine). */
WIDGETS.passthrough = {
    sub: (e, t) => t.sub || "",
    isOn: () => false,
    selectCaptures: true, captureHint: "D-pad → device · [ sends back · home releases",
    capture: DPAD_CAPTURE
  };
