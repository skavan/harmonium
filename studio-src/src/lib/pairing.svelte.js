/* Pairing, the Studio side (v0.81 — beta-gaps §1) and the
   version/update check (v0.82, the HACS story). Split out of
   state.svelte.js (v0.83.11 round 2). */
import { app, api, token, setStatus } from "./state.svelte.js";

/* ---- PAIRING, THE STUDIO SIDE (v0.81 — beta-gaps §1) ----
   The remote shows a code; we show the SAME code (polled from the
   integration's broker); the human compares and clicks Approve. THE
   STUDIO MINTS THE TOKEN — auth/long_lived_access_token on our own
   authenticated websocket, the documented path — so every paired
   remote is a NAMED token in this user's HA profile, individually
   revocable there. The broker only ferries it, once. */
export const pairs = $state({ pending: [], busy: "", err: "" });

/* a tab whose token is absent or revoked must NOT hammer pair_admin —
   HA's http.ban logs every 401 as a login attempt and will eventually
   BAN the IP (v0.81.2 — measured: a stale Studio tab produced a 401
   every 10s at 16:44). No token = skip; a real 401 = stop for good
   (reload after fixing the token). */
let pairPollDead = false;

export async function pollPairs() {
  if (pairPollDead || !token()) return;
  try {
    const r = await fetch("/api/harmonium/pair_admin",
      { headers: { Authorization: "Bearer " + token() }, cache: "no-store" });
    if (r.status === 401 || r.status === 403) { pairPollDead = true; return; }
    if (!r.ok) return;
    pairs.pending = (await r.json()).pending || [];
  } catch { /* offline / sandbox — banner just stays empty */ }
}

function mintPairToken(clientName) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/websocket");
    const bail = setTimeout(() => { try { ws.close(); } catch {} reject(new Error("timeout")); }, 8000);
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === "auth_required")
        ws.send(JSON.stringify({ type: "auth", access_token: token() }));
      else if (m.type === "auth_ok")
        ws.send(JSON.stringify({ id: 9, type: "auth/long_lived_access_token",
          client_name: clientName, lifespan: 3650 }));
      else if (m.type === "result" && m.id === 9) {
        clearTimeout(bail);
        try { ws.close(); } catch {}
        if (m.success && m.result) resolve(m.result);
        else reject(new Error(m.error?.message || "mint refused"));
      }
    };
    ws.onerror = () => { clearTimeout(bail); reject(new Error("websocket error")); };
  });
}

export async function approvePair(p) {
  pairs.busy = p.session; pairs.err = "";
  try {
    /* THE CODE IS THE SUFFIX (v0.81.2 — field day one: "clicking
       approve isn't doing anything", and the HA log said why four
       times over: `ValueError: Harmonium astrion already exists`.
       async_create_refresh_token refuses duplicate client_names, so
       a re-paired remote could never approve twice. The offer's code
       is random per pairing — a collision-proof, human-readable
       suffix. Retired tokens still deserve deleting in the profile,
       but they no longer BLOCK. */
    const name = "Harmonium " + (p.name || "remote") + " " + p.code;
    const minted = await mintPairToken(name);
    const r = await fetch("/api/harmonium/pair_admin", {
      method: "POST",
      headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
      body: JSON.stringify({ session: p.session, token: minted }),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    setStatus("remote paired — token “" + name + "” (revocable in your HA profile)", "ok");
  } catch (e) {
    /* loud, IN the banner — the status line whispers (v0.81.2) */
    pairs.err = "Pairing failed: " + e.message +
      (/already exists/.test(e.message)
        ? " — delete the old token in your HA profile (Security → long-lived tokens) and approve again"
        : "");
    setStatus("pairing failed: " + e.message, "err");
  }
  pairs.busy = "";
  await pollPairs();
}

export async function denyPair(p) {
  try {
    await fetch("/api/harmonium/pair_admin", {
      method: "POST",
      headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
      body: JSON.stringify({ session: p.session, deny: true }),
    });
  } catch { /* it expires on its own */ }
  await pollPairs();
}

/* kick-off DEFERRED one microtask (v0.83.11 round 2): this module now
   evaluates BEFORE state.svelte.js in the import cycle, and pollPairs
   reads token() synchronously — calling it during evaluation is a TDZ
   crash. queueMicrotask runs after the whole module graph settles;
   the first fetch was async anyway, so nothing observable moves. */
queueMicrotask(pollPairs);
setInterval(pollPairs, 10000);

/* ---- VERSION & UPDATE CHECK (v0.82 — the HACS story; the in-app
   update checker is the one trick worth stealing from the dckiller51
   fork, beta-gaps §2). The integration reports its manifest version
   on the unauthenticated engine_version endpoint; GitHub's latest
   release says whether a newer one exists. Silent on every failure —
   including "repo not published yet", which is today's state. ---- */
export const version = $state({ integration: "", engine: "", latest: "", url: "" });

function verNewer(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

export async function loadVersion() {
  try {
    const r = await fetch("/api/harmonium/engine_version", { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    version.integration = j.integration || "";
    version.engine = j.v || "";
  } catch { return; }
  if (!version.integration) return;
  try {
    const g = await fetch(
      "https://api.github.com/repos/skavan/harmonium/releases/latest",
      { headers: { Accept: "application/vnd.github+json" } });
    if (!g.ok) return;
    const rel = await g.json();
    const tag = String(rel.tag_name || "").replace(/^v/, "");
    if (tag && verNewer(tag, version.integration)) {
      version.latest = tag;
      version.url = rel.html_url || "";
    }
  } catch { /* offline or repo not public yet — say nothing */ }
}

queueMicrotask(loadVersion);   /* same deferral as pollPairs above */
