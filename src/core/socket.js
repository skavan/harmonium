/* ================================================================
   Websocket client: auth → filtered subscribe_entities → diffs.
   ================================================================ */
const S = {
  states: new Map(), ws: null, msgId: 0, pending: new Map(),
  subId: null, connected: false,
  screen: null, stack: [],
  focusId: null, captured: false,
  confirmTile: null, confirmTimer: null,
  lastAct: undefined, tileSig: null,
  msgCount: 0, painted: false,
  sendQ: []          /* messages asked for before auth_ok (v0.85.7) */
};

function haUrl() {
  const host = localStorage.getItem("hakr_host") ||
    (location.protocol.startsWith("http") ? location.host : "");
  const proto = (location.protocol === "https:") ? "wss" : "ws";
  return host ? `${proto}://${host}/api/websocket` : null;
}

function connect() {
  const url = haUrl(), token = localStorage.getItem("hakr_token");
  if (!url || !token) return showAuth("");
  const ws = new WebSocket(url);
  S.ws = ws;
  ws.onmessage = ev => {
    S.msgCount++;
    S.lastMsg = Date.now();
    const m = JSON.parse(ev.data);
    if (m.type === "auth_required") ws.send(JSON.stringify({ type: "auth", access_token: token }));
    else if (m.type === "auth_invalid") {
      const len = (token || "").length;
      localStorage.removeItem("hakr_token");
      showAuth(`Token rejected by HA (received ${len} chars — a valid token is ~180+). Recreate the token and retry.`);
    }
    else if (m.type === "auth_ok") {
      S.connected = true; dot(true); subscribeFor(S.screen);
      /* fleet hello (design-remote-fleet): every connect/reconnect
         announces this unit — the cheap moment, the socket is warm */
      if (typeof fleetHello === "function") fleetHello();
      /* flush the pre-auth queue (v0.85.7) — see send() below */
      const q = S.sendQ; S.sendQ = [];
      q.forEach(it => send(it[0], it[1]));
      /* a (re)connect is exactly when a deploy could have landed
         while this page ran — engine self-update check (boot.js;
         throttled + guarded there) */
      if (typeof engineUpdateCheck === "function") engineUpdateCheck();
    }
    else if (m.type === "result" && S.pending.has(m.id)) { S.pending.get(m.id)(m); S.pending.delete(m.id); }
    else if (m.type === "event" && m.id === S.subId) applyDiff(m.event);
  };
  ws.onclose = () => { S.connected = false; dot(false); setTimeout(connect, 1500 + Math.random() * 1500); };
  ws.onerror = () => ws.close();
}

/* STALENESS WATCHDOG (v0.33): kiosk webviews doze — the socket can die
   with no close event and the page silently freezes ("needs a refresh
   to pick up state"). Ping every 25s; a silent minute force-closes the
   socket so the reconnect loop heals it. Waking from hidden also
   resubscribes for fresh adds. */
setInterval(() => {
  if (!S.connected || !S.ws) return;
  if (Date.now() - (S.lastMsg || 0) > 60000) { try { S.ws.close(); } catch (e) {} return; }
  send({ type: "ping" });
  /* the fleet heartbeat PIGGYBACKS here — every 12th tick, visible
     only (design-remote-fleet: zero new timers, zero new wakes) */
  if (typeof fleetTick === "function") fleetTick();
}, 25000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && S.connected) subscribeFor(S.screen);
  /* waking from hidden = the other deploy-could-have-landed moment */
  if (!document.hidden && typeof engineUpdateCheck === "function")
    engineUpdateCheck();
});

function send(msg, cb) {
  /* EARLY SENDS QUEUE, NOT DROP (v0.85.7 — found by probe-library-ui:
     a browse fetch issued between the first render and auth_ok was
     silently dropped, but its busy flag stayed set — "Loading
     library…" forever, until a manual refresh cleared it. The same
     drop ate any registry lookup or service call fired that early.)
     Held bounded, flushed on auth_ok; still dropped once the socket
     is closed for good (the reconnect path re-renders anyway). */
  if (!S.connected && msg.type !== "auth") {
    if (S.sendQ.length < 64) S.sendQ.push([msg, cb]);
    return;
  }
  msg.id = ++S.msgId;
  if (cb) S.pending.set(msg.id, cb);
  S.ws.send(JSON.stringify(msg));
  return msg.id;
}

/* call_service that WANTS the response (v0.51: queue adapters probe
   platform services — sonos.get_queue, mass_queue.get_queue_items —
   and need both the payload and the failure) */
function callServiceResp(domain, service, data, entityId, cb) {
  const msg = { type: "call_service", domain, service,
    service_data: data || {}, return_response: true };
  if (entityId) msg.target = { entity_id: entityId };
  return send(msg, cb);
}

function callService(domain, service, data, entityId) {
  const msg = { type: "call_service", domain, service, service_data: data || {} };
  /* harmonium.* calls route to THIS remote's workspace — the ONE
     injection point, so run/set_activity always hit the right world.
     Main omits the key (byte-identical with pre-workspace payloads). */
  if (domain === "harmonium" && WS !== "main")
    msg.service_data = Object.assign({ workspace: WS }, msg.service_data);
  if (entityId) msg.target = { entity_id: entityId };
  /* PENDING PLAY (v0.73.3 — Suresh: "the player section sits there
     saying idle for a few seconds while the playlist is arriving. It
     feels like nothing is happening"). The gap between play_media
     leaving and the player reporting `playing` is real seconds of
     silence — so stamp the in-flight play and let the Now Playing
     hero say "Queuing …" until the state flips, the call fails, or
     a 20s timeout gives up. `S._playLabel` is set at tap time by
     whoever knows the tile's name. */
  const wasPlay = domain === "media_player" && service === "play_media" &&
    entityId;
  if (wasPlay) {
    S.pendingPlay = { e: entityId, label: S._playLabel || "", at: Date.now() };
    S._playLabel = null;
    if (typeof renderStates === "function") renderStates();
  }
  /* SAY WHEN HA SAYS NO (v0.70.2). This was fire-and-forget, so a
     failed call looked exactly like a dead tap — field case: Music
     Assistant's Spotify auth broke, every play_media raised "No
     playable item found to start playback", and the remote showed
     NOTHING while the message that named the problem sat in the HA
     log. HA always answers a call_service; a failure now flashes its
     own words in the bar. Success stays silent, as before. */
  send(msg, m => {
    if (m && m.success === false) {
      /* a FAILED play stops promising (v0.73.3) — the bar carries
         the reason, the hero goes honestly back to Idle */
      if (wasPlay && S.pendingPlay && S.pendingPlay.e === entityId) {
        S.pendingPlay = null;
        if (typeof renderStates === "function") renderStates();
      }
      if (typeof flashBar === "function")
        flashBar("⚠ " + ((m.error && m.error.message) || "Service call failed"),
          null, 5000);
    }
  });
}
