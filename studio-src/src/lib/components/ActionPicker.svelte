<script>
  /* An ACTION REF picker: sequences are first-class (sequence:<id>),
     plain HA scripts are the 2nd-class citizen (script.<x>), blank is
     allowed, and custom free-text is the escape hatch. */
  import { app, entitiesFor, selectSlice } from "../state.svelte.js";
  let { value = $bindable(), noneLabel = "— none —", oncreate = null, createTitle = "Create a new sequence for this action" } = $props();
  const seqs = $derived(Object.entries(app.draft?.sequences || {}));
  const scripts = $derived(entitiesFor(["script"]));
  const known = $derived(
    !value || value === "__custom__" ||
    seqs.some(([id]) => "sequence:" + id === value) ||
    scripts.some((e) => e.entity_id === value),
  );
  let custom = $state(false);
  function onchange(e) {
    const v = e.target.value;
    if (v === "__custom__") { custom = true; value = ""; }
    else value = v || undefined;
  }
</script>

<div class="flex items-center gap-1.5">
  {#if custom || !known}
    <input
      bind:value
      placeholder="script.… or sequence:…"
      spellcheck="false"
      class="w-full rounded-[8px] border border-line bg-field px-2.5 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-accent/60"
    />
    <button
      class="cursor-pointer rounded-[8px] border-0 bg-tile-hi px-2 py-1.5 text-xs text-dim hover:text-ink"
      title="Pick from list" onclick={() => { custom = false; if (!known) value = ""; }}
    >▾</button>
  {:else}
    <select
      value={value ?? ""}
      {onchange}
      class="w-full cursor-pointer rounded-[8px] border border-line bg-tile-hi px-2.5 py-1.5 font-[inherit] text-sm text-ink outline-none focus:border-accent/60"
    >
      <option value="">{noneLabel}</option>
      {#if seqs.length}
        <optgroup label="Actions (sequences)">
          {#each seqs as [id, s] (id)}
            <option value={"sequence:" + id}>{s.name || id}</option>
          {/each}
        </optgroup>
      {/if}
      {#if scripts.length}
        <optgroup label="HA scripts">
          {#each scripts as e (e.entity_id)}
            <option value={e.entity_id}>{e.name}</option>
          {/each}
        </optgroup>
      {/if}
      <option value="__custom__">custom…</option>
    </select>
    {#if oncreate && !value}
      <button
        class="shrink-0 cursor-pointer rounded-[8px] border border-dashed border-line bg-transparent px-2 py-1 text-sm leading-[1.2] text-dim hover:border-accent/60 hover:text-accent"
        title={createTitle} onclick={oncreate}
      >＋</button>
    {/if}
    {#if value?.startsWith("sequence:")}
      <button
        class="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
        title="Open in Actions" onclick={() => selectSlice("sequences")}
      >edit →</button>
    {/if}
  {/if}
</div>
