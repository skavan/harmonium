<script>
  /* A section's tile list — the shared chassis for every place tiles
     are edited (Hub folds, custom groups, controller sections, legacy
     flat lists): the rows, the two ARCHETYPE add buttons (device /
     nav card), and the section's Columns override. Section-specific
     chrome (labels, delete affordances) stays with the caller. */
  import TileRow from "./TileRow.svelte";
  import Button from "./Button.svelte";

  let {
    tiles,                    // the live tile array (mutated in place)
    ownerScreen = null,       // owning screen/controller key (nav-card mints parent to it)
    section = null,           // the section object — enables the Columns override
    addLabel = "＋ Add device",
    onedit = null,            // called after a structural change (columns)
    children = null,          // extra controls rendered on the button row
  } = $props();

  const rid = () => "tile_" + Math.random().toString(36).slice(2, 6);
  function addDevice() {
    /* a device STARTS with a name and an entity — everything else
       (renderer, icon, verbs, page) infers from the entity */
    tiles.push({ type: "device", id: rid(), label: "New device",
      icon: "material:devices", entity: "" });
  }
  function addNav() {
    /* the OTHER archetype: a nav card — opens another page (style
       resolves auto; its concertina links or ＋-mints the page) */
    tiles.push({ type: "nav", id: rid(), label: "New nav card",
      icon: "material:layers" });
  }
</script>

{#each tiles as tile, ti (ti)}
  <TileRow {tile} {ownerScreen} {tiles} index={ti} />
{/each}
<div class="flex items-center gap-2">
  <Button size="sm" onclick={addDevice}>{addLabel}</Button>
  <Button size="sm" onclick={addNav}>＋ Add nav card</Button>
  {#if section}
    <span class="ml-2 text-[11px] text-dim">Columns</span>
    <input type="number" min="1" max="4" value={section.columns ?? ""} placeholder="page"
      onchange={(e) => { const v = +e.target.value;
        if (v >= 1) section.columns = v; else delete section.columns; onedit?.(); }}
      class="w-16 rounded-[8px] border border-line bg-field px-2 py-1 text-xs text-ink outline-none focus:border-accent/60" />
  {/if}
  {@render children?.()}
</div>
