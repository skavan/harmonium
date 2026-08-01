/* ================================================================
   QUEUE (v0.51 — Suresh: "One thing that would be nice for all
   music players is the queue… Each item would be a full row tile.
   Click and we jump to that song.")

   The queue is NOT part of HA's standard media_player contract, so
   this speaks per-platform services through ADAPTER PROBING — no
   name-guessing: each adapter is TRIED (a call with return_response)
   and the first that answers owns the entity from then on. Probed
   live 2026-07-31 on Suresh's HA:
     · Music Assistant — mass_queue.get_queue_items {entity,
       limit_before, limit_after} → [items]; jump =
       mass_queue.play_queue_item {entity, queue_item_id}
     · Sonos — sonos.get_queue @entity → [{media_title,
       media_artist, media_album_name, …}]; jump =
       sonos.play_queue {queue_position} (list order)
   Neither answers → "Queue not available for this player".
   ================================================================ */
S.queue = { ent: null, items: null, busy: false, err: null, adapter: {} };

const QUEUE_ADAPTERS = [
  {
    id: "ma",
    get: (e, cb) => callServiceResp("mass_queue", "get_queue_items",
      { entity: e, limit_before: 30, limit_after: 170 }, null, cb),
    map: (it, i) => ({
      title: it.media_title || it.title || it.name || "…",
      artist: it.media_artist || it.artist || "",
      album: it.media_album_name || it.album || "",
      image: it.media_image || it.image || null,
      action: { service: "mass_queue.play_queue_item",
        data: { entity: null /* stamped below */, queue_item_id:
          it.queue_item_id || it.item_id || null } },
    }),
  },
  {
    id: "sonos",
    get: (e, cb) => callServiceResp("sonos", "get_queue", {}, e, cb),
    map: (it, i) => ({
      title: it.media_title || "…",
      artist: it.media_artist || "",
      album: it.media_album_name || "",
      image: null,
      action: { service: "sonos.play_queue", target: null /* stamped */,
        data: { queue_position: i } },
    }),
  },
];

function queueFetch(ent) {
  const Q = S.queue;
  if (Q.busy) return;
  Q.busy = true; Q.err = null;
  const known = Q.adapter[ent];
  const order = known
    ? QUEUE_ADAPTERS.filter(a => a.id === known)
    : QUEUE_ADAPTERS;
  const tryAt = (i) => {
    if (i >= order.length) {
      Q.busy = false; Q.ent = ent; Q.items = [];
      Q.err = "Queue not available for this player";
      if (S.screen === "queue:" + ent) navigate(S.screen, true);
      return;
    }
    const ad = order[i];
    ad.get(ent, m => {
      if (!m.success) { tryAt(i + 1); return; }
      Q.adapter[ent] = ad.id;
      const resp = (m.result && m.result.response) || {};
      const raw = resp[ent] || [];
      Q.busy = false; Q.ent = ent;
      Q.items = raw.slice(0, 200).map((it, i2) => {
        const r = ad.map(it, i2);
        /* stamp the entity into the jump action */
        if (r.action.data && "entity" in r.action.data)
          r.action.data.entity = ent;
        if ("target" in r.action) r.action.target = ent;
        return r;
      });
      if (S.screen === "queue:" + ent) navigate(S.screen, true);
    });
  };
  tryAt(0);
}

/* the virtual QUEUE screen: full-row tiles, ▶ marks the playing one
   (matched on the player's live media_title), tap = jump */
function queueScreen(eid) {
  if (!eid) return null;
  const Q = S.queue;
  const fn = st(eid).a.friendly_name;
  const name = (fn || eid.split(".")[1].replace(/_/g, " ")) + " · Queue";
  let tiles;
  if (Q.ent !== eid || Q.items === null) {
    queueFetch(eid);
    tiles = [{ id: "q_ld", type: "preset", icon: "material:hourglass_empty",
      label: "Loading queue…", action: {} }];
  } else if (Q.err) {
    tiles = [{ id: "q_err", type: "preset", icon: "material:error_outline",
      label: Q.err, action: {} }];
  } else if (!Q.items.length) {
    tiles = [{ id: "q_mt", type: "preset", icon: "material:queue_music",
      label: "The queue is empty", action: {} }];
  } else {
    /* qrow tiles (v0.51.1 — Suresh's mock): art left · bold title ·
       "artist · album" on line two · ▶ HARD RIGHT — and the mark is
       LIVE (each row carries the player entity, so state updates
       re-evaluate isOn instead of a baked-at-build label) */
    tiles = Q.items.map((r, i) => ({
      id: "q_" + i, type: "qrow", entity: eid,
      label: r.title,
      sub_label: [r.artist, r.album].filter(Boolean).join(" · "),
      q_title: r.title, q_artist: r.artist,
      icon: "material:music_note",
      ...(r.image ? { icon_image: r.image } : {}),
      action: r.action,
    }));
  }
  const nowT = st(eid).a.media_title;
  const nowRow = tiles.find(x => x.q_title === nowT);
  return {
    name, virtual: true, class: "group", font_scope: "music",
    grid: { columns: 1 },
    tiles,
    initial_focus: (nowRow || tiles[0]).id,
  };
}
