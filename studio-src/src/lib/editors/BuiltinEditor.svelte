<script>
  /* BUILT-IN fixed controller: the engine GENERATES this surface per
     entity (detail:<entity> — power/steppers/chips composed from the
     device's own attributes). Nothing to lay out — but per-entity
     OPTIONS live here (e.g. a cover that runs backwards). */
  import { app } from "../state.svelte.js";
  import Switch from "../components/Switch.svelte";
  let { domain, embedded = false } = $props();
  const OPTIONS = {
    cover: [{ key: "invert_position", label: "Reverse direction (invert position %)",
      hint: "display + slider run 0↔100 flipped; services are never inverted" }],
  };
  const opts = $derived(OPTIONS[domain] || []);
  /* entities: live registry ∪ anything already carrying options */
  const ents = $derived.by(() => {
    const seen = new Set(app.entities
      .filter((e) => e.entity_id.startsWith(domain + "."))
      .map((e) => e.entity_id));
    for (const eid of Object.keys(app.draft?.entity_options || {}))
      if (eid.startsWith(domain + ".")) seen.add(eid);
    return [...seen].sort();
  });
  const name = (eid) => app.entities.find((e) => e.entity_id === eid)?.name || eid;
  const getOpt = (eid, key) => app.draft?.entity_options?.[eid]?.[key] === true;
  function setOpt(eid, key, v) {
    const d = app.draft;
    if (!d.entity_options) d.entity_options = {};
    if (v) d.entity_options[eid] = { ...(d.entity_options[eid] || {}), [key]: true };
    else if (d.entity_options[eid]) {
      delete d.entity_options[eid][key];
      if (!Object.keys(d.entity_options[eid]).length) delete d.entity_options[eid];
    }
  }
</script>

<div class="space-y-4">
  {#if !embedded}
  <div class="rounded-[10px] border border-accent/50 bg-accent/10 px-3 py-2 text-xs text-ink">
    <b>Built-in controller</b> — the engine generates this surface for every
    {domain} entity from its live attributes (options always match the
    hardware). Reach it from any device tile's ⚙ trail. There is no layout
    to edit — it can't go stale.
  </div>
  {/if}
  {#if opts.length}
    <div class="rounded-[12px] border border-line bg-tile p-3">
      <div class="mb-2 text-[11px] font-bold tracking-[.07em] text-dim uppercase">Per-device options</div>
      {#if ents.length}
        <div class="space-y-2">
          {#each ents as eid (eid)}
            <div class="flex flex-wrap items-center gap-3 rounded-[8px] bg-inset px-2 py-1.5">
              <span class="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink" title={eid}>{name(eid)} <span class="text-dim">· {eid}</span></span>
              {#each opts as o (o.key)}
                <Switch label={o.label} checked={getOpt(eid, o.key)}
                  onCheckedChange={(v) => setOpt(eid, o.key, v)} />
              {/each}
            </div>
          {/each}
        </div>
      {:else}
        <p class="m-0 text-xs text-dim">No {domain} entities visible (connect to HA to list them).</p>
      {/if}
    </div>
  {:else}
    <p class="m-0 text-xs text-dim">No per-device options for {domain} yet — they'll appear here as they're invented.</p>
  {/if}
</div>
