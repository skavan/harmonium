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
  msgCount: 0, painted: false
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
    else if (m.type === "auth_ok") { S.connected = true; dot(true); subscribeFor(S.screen); }
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
}, 25000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && S.connected) subscribeFor(S.screen);
});

function send(msg, cb) {
  if (!S.connected && msg.type !== "auth") return;
  msg.id = ++S.msgId;
  if (cb) S.pending.set(msg.id, cb);
  S.ws.send(JSON.stringify(msg));
  return msg.id;
}

function callService(domain, service, data, entityId) {
  const msg = { type: "call_service", domain, service, service_data: data || {} };
  /* harmonium.* calls route to THIS remote's workspace — the ONE
     injection point, so run/set_activity always hit the right world.
     Main omits the key (byte-identical with pre-workspace payloads). */
  if (domain === "harmonium" && WS !== "main")
    msg.service_data = Object.assign({ workspace: WS }, msg.service_data);
  if (entityId) msg.target = { entity_id: entityId };
  send(msg);
}
