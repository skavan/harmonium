/* ================================================================
   THE FLEET — this unit's half (docs/design-remote-fleet.md, 2026-09-02).

   Two channels, both riding traffic the engine already pays for —
   the battery constraint (Suresh: a loaded remote burns ~80%/day
   against ~22% stripped) is this file's first law:

   · UP — hello: one small POST on every auth_ok, then piggybacked
     on the EXISTING 25s staleness watchdog every 12th tick (~5 min),
     only while the page is visible. No new timers, no new sockets;
     a sleeping remote sends nothing and its fleet row reads so.
   · DOWN — the command bus: sensor.harmonium_command_bus rides the
     normal filtered subscription (subscribe_entities is open to any
     token, unlike custom-event subscriptions, which HA gates to
     admins). Commands arrive as ordinary state diffs; fleetCheck()
     runs from applyDiff.

   Replay safety is BASELINE-first, clock-second: the first bus state
   a session sees is never acted on (a remote booting hours later
   must not replay the last reload), later seq changes still require
   a fresh server timestamp (60s, generous to clock skew).
   ================================================================ */
const BUS_ENTITY = "sensor.harmonium_command_bus";

/* the persistent unit id — a PROFILE is an outfit, a unit is the
   physical remote; two units may wear one profile */
function unitId() {
  let u = null;
  try { u = localStorage.getItem("hakr_unit"); } catch (e) {}
  if (u) return u;
  u = "u";
  const abc = "abcdefghjkmnprtuvwxy346790";
  for (let i = 0; i < 5; i++) u += abc[Math.floor(Math.random() * abc.length)];
  try { localStorage.setItem("hakr_unit", u); } catch (e) {}
  return u;
}

/* ---- UP: hello -------------------------------------------------- */
let helloTicks = 0;
let helloBatt = null;   /* {battery, charging} — refreshed lazily */

function fleetHello() {
  if (typeof PREVIEW !== "undefined" && PREVIEW) return;
  const token = localStorage.getItem("hakr_token");
  if (!token) return;
  const body = {
    unit: unitId(),
    name: S.deviceName || "default",
    profile: S.deviceName || "default",
    workspace: (typeof WS !== "undefined" && WS) || "main",
    version: (typeof BOOT_V !== "undefined" && BOOT_V) || "",
    page: S.screen || "",
  };
  if (helloBatt) {
    body.battery = helloBatt.battery;
    body.charging = helloBatt.charging;
  }
  try {
    const x = new XMLHttpRequest();
    x.open("POST", "/api/harmonium/hello", true);
    x.timeout = 5000;
    x.setRequestHeader("Content-Type", "application/json");
    x.setRequestHeader("Authorization", "Bearer " + token);
    x.send(JSON.stringify(body));
  } catch (e) {}
  /* refresh the battery reading for the NEXT hello — Battery Status
     API where the webview still offers it on this origin; absent =
     the fleet view falls back to the profile's battery_sensor */
  try {
    if (navigator.getBattery) navigator.getBattery().then(b => {
      helloBatt = { battery: Math.round(b.level * 100), charging: !!b.charging };
    }, () => {});
  } catch (e) {}
}

/* called from the socket watchdog (25s cadence) — every 12th tick
   while visible ≈ one hello per 5 visible minutes */
function fleetTick() {
  if (document.hidden) return;
  helloTicks++;
  if (helloTicks >= 12) { helloTicks = 0; fleetHello(); }
}

/* ---- DOWN: the command bus -------------------------------------- */
let busSeq = null;          /* baseline: first sight is never acted on */

function fleetCheck() {
  const st = S.states.get(BUS_ENTITY);
  if (!st) return;
  const a = st.a || {};
  const seq = +st.s;
  if (!isFinite(seq)) return;
  if (busSeq === null) { busSeq = seq; return; }   /* baseline */
  if (seq === busSeq) return;
  busSeq = seq;
  /* fresh? the server stamps epoch seconds; 60s tolerates skew */
  const ts = +a.ts;
  if (!isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 60) return;
  /* addressed to this unit? target = all | unit id | profile;
     workspace, when present, must match too */
  const ws = (typeof WS !== "undefined" && WS) || "main";
  if (a.workspace && a.workspace !== ws) return;
  const t = a.target || "all";
  if (t !== "all" && t !== unitId() && t !== (S.deviceName || "default")) return;
  if (a.verb === "identify") {
    /* fleet v2: the Studio sends the FRIENDLY name along, so the
       flash matches the row the person just clicked */
    const label = "This is “" + (a.label || (S.deviceName || "default") + " · " + unitId()) + "”";
    flashBar(label, "ok", 1400);
    setTimeout(() => flashBar(label, "ok", 1400), 1800);
    setTimeout(() => flashBar(label, "ok", 1400), 3600);
  } else if (a.verb === "reload") {
    fleetReload();
  }
}

/* IMMEDIATE (round 9 ruling: "I don't think we need 10s of quiet") —
   you pressed the button; the remote obeys now. No cache clearing
   needed by design: config.json is fetched no-store and the engine
   rides a version-stamped URL, so a plain reload always boots the
   freshly deployed pair. */
function fleetReload() {
  try { sessionStorage.removeItem("hakr_upg"); } catch (e) {}
  location.reload();
}
