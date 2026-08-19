/* The live-HA side: entity list for pickers, the entity→platform
   registry, service list — and the ⊞ device seeder that mints a
   pre-wired device from any entity via its integration siblings.
   Split out of state.svelte.js (v0.83.11 round 2). */
import { app, api, token } from "./state.svelte.js";

/* ---- entity registry for pickers (live HA states) ---- */
export async function loadEntities() {
  try {
    const r = await fetch("/api/states", { headers: { Authorization: "Bearer " + token() } });
    if (!r.ok) return;
    const states = await r.json();
    app.entities = states
      .map((s) => ({
        entity_id: s.entity_id,
        name: s.attributes?.friendly_name || s.entity_id,
        state: s.state,
        source_list: s.attributes?.source_list || null,
        /* attribute NAMES only (v0.79.1): the ⚙ Status-line "+" picker
           offers {token}s from these — values stay on the wire, the
           engine reads them live. Without this the picker knew only
           "state" (loadEntities had dropped attributes wholesale). */
        attrs: Object.keys(s.attributes || {}),
        device_class: s.attributes?.device_class || null,
      }))
      .sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  } catch { /* pickers degrade to free text */ }
}
/* THE PLATFORM FACT (v0.45.2, Suresh: "too much guesswork"): which
   integration owns an entity is the TRUE discriminator for channel
   claims (androidtv = the ADB command channel; androidtv_remote = the
   push-state twin) — never the entity NAME. /api/states doesn't carry
   platform, so fetch the entity registry once over the websocket.
   Failure degrades silently: platformOf() returns null and callers
   fall back to their old heuristics. */
export async function loadRegistry() {
  try {
    const ws = new WebSocket(
      (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/websocket");
    const done = new Promise((resolve) => {
      const bail = setTimeout(() => { try { ws.close(); } catch {} resolve(); }, 6000);
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type === "auth_required")
          ws.send(JSON.stringify({ type: "auth", access_token: token() }));
        else if (m.type === "auth_ok")
          ws.send(JSON.stringify({ id: 7, type: "config/entity_registry/list" }));
        else if (m.type === "result" && m.id === 7) {
          const map = {};
          for (const e of m.result || [])
            if (e.entity_id && e.platform) map[e.entity_id] = e.platform;
          app.registry = map;
          clearTimeout(bail);
          try { ws.close(); } catch {}
          resolve();
        }
      };
      ws.onerror = () => { clearTimeout(bail); resolve(); };
    });
    await done;
  } catch { /* no registry — heuristics carry on */ }
}
export const platformOf = (entId) => app.registry[entId] || null;

/* IMPLIED DEVICES (v0.45.2 — the library is a BYPRODUCT, not a
   prerequisite): integration siblings share the object stem
   (media_player.X + remote.X + media_player.X_adb_…). Group by stem,
   seed claims by PLATFORM FACT where the registry has one (androidtv
   = the ADB commands channel), name-regex only as the fallback. */
export function impliedStem(entId) {
  return (entId.split(".")[1] || "")
    .replace(/_adb(_\d+){0,4}$/, "").replace(/(_\d+){1,4}$/, "");
}
const isAdbEnt = (e) => {
  const pf = platformOf(e);
  return pf ? pf === "androidtv" : /_adb(_|$)/.test(e);
};
export function seedDeviceFromEntity(fromEnt) {
  const stem = impliedStem(fromEnt) || "new_device";
  const dev = { name: stem.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    icon: "material:tv", roles: {} };
  const sibs = app.entities.filter((e) => impliedStem(e.entity_id) === stem)
    .map((e) => e.entity_id);
  const list = sibs.length ? sibs : [fromEnt];
  const applyClaims = (e) => {
    const dom = e.split(".")[0];
    if (dom === "media_player") {
      dev.roles.media_player ||= e;
      dev.roles.power ||= e;
      dev.roles.volume ||= e;
      dev.roles.volume_level ||= e;
      if ((app.entities.find((x) => x.entity_id === e)?.source_list || []).length)
        dev.roles.source_select ||= e;
      dev.roles.commands ||= e;
    }
    if (dom === "remote") dev.roles.dpad ||= e;
  };
  /* preferred pass: the push-state twins (androidtv_remote, tizen, …) */
  for (const e of list.filter((e) => !isAdbEnt(e))) applyClaims(e);
  /* the ADB media_player IS the commands channel — hard assignment */
  for (const e of list.filter(isAdbEnt))
    if (e.startsWith("media_player.")) dev.roles.commands = e;
  /* gap-fill: single-integration devices (Fire TV is androidtv-only) */
  for (const e of list.filter(isAdbEnt)) applyClaims(e);
  /* (v0.48.3's MA-twin claim swap was REVERTED in v0.49 before it
     ever deployed — wrong layer. The music library now speaks the
     STANDARD media_player/browse_media + play_media contract, so the
     NATIVE player is the right claim; no ma_ name heuristics.) */
  /* SEARCH, THE ONE PLACE THE TWIN IS RIGHT (v0.69). Playback stays
     native — that is settled. But searching is the job the native
     player usually cannot do, and its Music Assistant twin can. This
     is a SUGGESTION IN AN EDITOR, not an inference in the engine:
     seeded here as a default the user can see and change, never
     guessed at runtime. That distinction is what separates it from
     the v0.49 revert. Claimed by PLATFORM (the registry knows), with
     the ma_ name only as the fallback the registry makes unnecessary. */
  if (!dev.roles.search && dev.roles.media_player) {
    const twin = app.entities
      .map((x) => x.entity_id)
      .find((e) => e.startsWith("media_player.") &&
        (platformOf(e) === "music_assistant" ||
         (!platformOf(e) && /^media_player\.ma_/.test(e))) &&
        impliedStem(e).replace(/^ma_/, "") === stem.replace(/^ma_/, ""));
    if (twin) dev.roles.search = twin;
    else if (platformOf(dev.roles.media_player) === "music_assistant")
      dev.roles.search = dev.roles.media_player;
  }
  return { stem, dev };
}
/* stem groups not yet represented in the library — the ⊞ rows the
   unified cast picker offers (≥2 members; singles cast directly) */
export function impliedGroups() {
  const lib = app.draft?.devices || {};
  const claimed = new Set();
  for (const d of Object.values(lib))
    for (const ent of Object.values(d.roles || {})) claimed.add(ent);
  const groups = {};
  for (const e of app.entities) {
    const dom = e.entity_id.split(".")[0];
    if (dom !== "media_player" && dom !== "remote") continue;
    if (claimed.has(e.entity_id)) continue;
    const stem = impliedStem(e.entity_id);
    if (!stem) continue;
    (groups[stem] ||= []).push(e.entity_id);
  }
  return Object.entries(groups).filter(([, ents]) => ents.length >= 2)
    .map(([stem, ents]) => ({ stem, ents }));
}

/* HA SERVICE CATALOG (v0.47.6 — Suresh: "can I get a drop down of
   what I can choose (with Search)?"): /api/services once at load;
   pickers degrade to free text when it's unreachable. */
export async function loadServices() {
  try {
    const r = await fetch("/api/services", { headers: { Authorization: "Bearer " + token() } });
    if (!r.ok) return;
    const doms = await r.json();
    const out = [];
    for (const d of doms)
      for (const [svc, meta] of Object.entries(d.services || {}))
        out.push({ id: d.domain + "." + svc, name: meta?.name || "" });
    app.services = out.sort((a, b) => a.id.localeCompare(b.id));
  } catch { /* free text carries on */ }
}

export function entitiesFor(domains) {
  if (!domains || !domains.length) return app.entities;
  return app.entities.filter((e) => domains.includes(e.entity_id.split(".")[0]));
}

