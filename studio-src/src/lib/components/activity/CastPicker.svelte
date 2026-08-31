<script>
  /* ---- UNIFIED CAST PICKER (v0.45.2 — Suresh: the library is a
     byproduct, not a prerequisite). ONE box: library devices, then
     IMPLIED devices (⊞ stem-grouped entity clusters, minted into the
     library silently on pick), then raw entities (cast directly). ---- */
  /* One input BELOW the whole cast (v0.48 — new members append at the
     end, so the box sits where they land); the dropdown is position:
     fixed so no ancestor can clip it. Peeled out of SetupTab
     (v0.83.11 round 2); addCast/addExtraEnt stay the owner's verbs. */
  import { app, impliedGroups, seedDeviceFromEntity, setStatus } from "../../state.svelte.js";

  let { card, addCast, addExtraEnt } = $props();
  const a = $derived(card.a);
  const cast = $derived(card.cast);
  const devLib = $derived(card.devLib);

  let castQ = $state("");
  let castOpen = $state(false);
  let castEl = $state(null);
  let castRect = $state(null);   /* FIXED dropdown — no ancestor can clip */
  const placeCast = () => { castRect = castEl?.getBoundingClientRect() || null; };
  $effect(() => {
    if (!castOpen) return;
    const glue = () => placeCast();
    window.addEventListener("scroll", glue, true);   /* capture: any scroller */
    window.addEventListener("resize", glue);
    return () => {
      window.removeEventListener("scroll", glue, true);
      window.removeEventListener("resize", glue);
    };
  });
  const castHit = (txt) => !castQ.trim() ||
    txt.toLowerCase().includes(castQ.trim().toLowerCase());
  const pickLib = $derived(Object.entries(devLib)
    .filter(([k]) => !cast.includes(k))
    .filter(([k, d]) => castHit((d.name || "") + " " + k))
    .slice(0, 8));
  const pickImplied = $derived(impliedGroups()
    .filter((g) => !devLib[g.stem])
    .filter((g) => castHit(g.stem + " " + g.ents.join(" ")))
    .slice(0, 8));
  /* the UNQUERIED list ranks CONTROL domains first (2026-08-31 —
     Suresh: "only a very short list of automations and binary
     sensors": app.entities is alphabetical, and the alphabet starts
     at automation./binary_sensor. — the 12-row head was noise). A
     typed query still searches everything, unranked. */
  const ENT_DOMS = ["media_player", "remote", "select", "number",
    "light", "switch", "climate", "cover", "fan", "input_select",
    "input_number", "scene", "script", "button", "input_boolean",
    "lock", "vacuum", "humidifier", "camera", "sensor"];
  const domRank = (id) => {
    const i = ENT_DOMS.indexOf(id.split(".")[0]);
    return i < 0 ? ENT_DOMS.length : i;
  };
  const pickEnts = $derived.by(() => {
    const base = app.entities
      .filter((e) => castHit(e.entity_id + " " + (e.name || "")))
      .filter((e) => !(a.extra_devices || []).includes(e.entity_id));
    return (castQ.trim()
      ? base
      : [...base].sort((x, y) => domRank(x.entity_id) - domRank(y.entity_id)))
      .slice(0, 12);
  });
  function castLibDevice(devId) {
    addCast(devId);
    castQ = ""; castOpen = false;
  }
  function castImplied(g) {
    if (!app.draft.devices) app.draft.devices = {};
    const lib = app.draft.devices;
    const { stem, dev } = seedDeviceFromEntity(g.ents[0]);
    let id = stem, n = 2;
    while (lib[id]) id = stem + "_" + n++;
    lib[id] = dev;
    addCast(id);
    setStatus("⊞ " + (dev.name || id) + " added to your library and cast", "ok");
    castQ = ""; castOpen = false;
  }
  function castDirect(ent) {
    addExtraEnt(ent);
    castQ = ""; castOpen = false;
  }
</script>

          <div class="relative">
            <input bind:value={castQ} bind:this={castEl} spellcheck="false"
              placeholder="cast a device — or type any entity…"
              onfocus={() => { placeCast(); castOpen = true; }}
              oninput={() => { placeCast(); castOpen = true; }}
              onblur={() => setTimeout(() => (castOpen = false), 200)}
              class="h-[38px] w-full rounded-[4px] border border-line-strong bg-field px-[11px] font-[inherit] text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent" />
            {#if castOpen && castRect && (pickLib.length || pickImplied.length || pickEnts.length)}
              <div class="fixed z-50 max-h-[320px] overflow-y-auto rounded-[9px] border border-line-strong bg-surface p-[5px] [box-shadow:var(--shadow-float,0_12px_28px_rgba(0,0,0,.3))]"
                style="left:{castRect.left}px; top:{castRect.bottom + 4}px; width:{castRect.width}px">
                {#each pickLib as [k, d] (k)}
                  <button class="block w-full cursor-pointer rounded-[6px] border-0 bg-transparent px-2.5 py-[7px] text-left font-[inherit] text-xs text-ink hover:bg-sunk"
                    onmousedown={(e) => { e.preventDefault(); castLibDevice(k); }}>
                    <span class="font-semibold">⊞ {d.name || k}</span>
                    <span class="pl-1.5 text-[10.5px] text-dim">{Object.values(d.roles || {}).filter(Boolean).length} claims · in your library</span>
                  </button>
                {/each}
                {#each pickImplied as g (g.stem)}
                  <button class="block w-full cursor-pointer rounded-[6px] border-0 bg-transparent px-2.5 py-[7px] text-left font-[inherit] text-xs text-ink hover:bg-sunk"
                    onmousedown={(e) => { e.preventDefault(); castImplied(g); }}>
                    <span class="font-semibold">⊞ {g.stem.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                    <span class="pl-1.5 text-[10.5px] text-dim">{g.ents.map((e) => e.split(".")[0]).join(" + ")} · will join your library</span>
                  </button>
                {/each}
                {#each pickEnts as e (e.entity_id)}
                  <button class="block w-full cursor-pointer rounded-[6px] border-0 bg-transparent px-2.5 py-[7px] text-left font-[inherit] text-xs text-ink hover:bg-sunk"
                    onmousedown={(ev) => { ev.preventDefault(); castDirect(e.entity_id); }}>
                    <span class="font-mono text-[11.5px]">{e.entity_id}</span>
                    <span class="pl-1.5 text-[10.5px] text-dim">{e.name && e.name !== e.entity_id ? e.name + " · " : ""}cast this entity</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
