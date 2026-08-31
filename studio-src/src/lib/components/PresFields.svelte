<script>
  /* THE SHARED PRESENTATION FIELDS (entity-controls Phase 1 — design
     decision 3: "One adapter registry, one compatibility function,
     one shared presentation-fields component. Copying options into
     both PresPanel and TileRow is the disease this design exists to
     cure."). The three fields every authoring surface offers — Draws
     as, Variant (only when the adapter offers real choices), and the
     token-aware Status line — rendered from ONE component, so both
     surfaces show the same choices, in the same order, with the same
     help text. The SURFACE owns storage and layout: it hands this
     component get/set descriptors and an optional per-field wrapper
     class; Mushroom's identical appearance block on every card is
     the reference model.

     props:
       drawsAs:  { value, options, hint, set }
       variant:  { value, options, set } | null — hidden when null
       sub:      { value, placeholder, attrs, set, insert, clear? }
                 clear present = TileRow's ∅ (explicit no-line);
                 absent = the panel's blank-means-auto contract
       cardGroup:{ value, set, warn? } — Phase 3: members sharing a
                 name merge into one card (same page, same section);
                 warn = the no-row-form notice (Now Playing)
       wrap:     class applied around each field ("" = none)
       only:     "drawsAs" | "variant" | "sub" | "cardGroup" — render ONE field, so
                 a surface with its own interleaved layout (the ⚙
                 panel) still draws every field from this single
                 source; null renders all provided fields in order
       variantLabel: the Variant select's label (today "Volume style";
                 one place to rename when Phase 2 generalizes it) */
  import Field from "./Field.svelte";
  import Input from "./Input.svelte";
  import Select from "./Select.svelte";

  let { drawsAs = null, variant = null, sub = null, cardGroup = null,
    wrap = "", only = null, variantLabel = "Volume style" } = $props();
</script>

{#snippet cell(children)}
  {#if wrap}<div class={wrap}>{@render children()}</div>
  {:else}{@render children()}{/if}
{/snippet}

{#snippet fDraws()}
  <Field label="Draws as" hint="">
    <Select value={drawsAs.value} title={drawsAs.hint || ""}
      options={drawsAs.options}
      onchange={(e) => drawsAs.set(e.target.value)} />
  </Field>
{/snippet}
{#snippet fVariant()}
  <Field label={variantLabel} hint="">
    <Select value={variant.value}
      title={variant.hint || "how this control draws — the shape, never the contract"}
      options={variant.options}
      onchange={(e) => variant.set(e.target.value)} />
  </Field>
{/snippet}
{#snippet fSub()}
  <Field label="Status line" hint="">
    <div class="flex gap-1">
      <Input value={sub.value}
        title={"the tile's second line — blank = the widget's smart summary · {curly} tokens read the entity live"}
        placeholder={sub.placeholder || "auto"}
        oninput={(e) => sub.set(e.target.value)} />
      <select value="" title={"insert a live attribute — {token}s follow the entity"}
        onchange={(e) => { const v = e.target.value;
          if (v) sub.insert(v);
          e.target.value = ""; }}
        class="h-[38px] w-[30px] shrink-0 cursor-pointer appearance-none rounded-[4px] border border-line-strong bg-field text-center text-[15px] text-dim outline-none hover:text-ink">
        <option value="">＋</option>
        {#each sub.attrs as at (at)}
          <option value={at}>{at}</option>
        {/each}
      </select>
      {#if sub.clear}
        <button title="No status line at all (∅) — click again for auto"
          onclick={sub.clear.toggle}
          class={"h-[38px] w-[30px] shrink-0 cursor-pointer rounded-[4px] border text-[14px] " +
            (sub.clear.active ? "border-accent/60 bg-accent-wash text-accent-text"
              : "border-line-strong bg-field text-dim hover:text-ink")}>∅</button>
      {/if}
    </div>
  </Field>
{/snippet}

{#snippet fGroup()}
  <Field label="Card group" hint="">
    <Input value={cardGroup.value} placeholder="its own card"
      title="members with the same group name merge into ONE card — same page, same section; blank = its own card"
      oninput={(e) => cardGroup.set(e.target.value.trim())} />
    {#if cardGroup.warn}
      <div class="mt-1 text-[11px] italic text-dim">{cardGroup.warn}</div>
    {/if}
  </Field>
{/snippet}

{#if only === "drawsAs"}{@render cell(fDraws)}
{:else if only === "variant"}{@render cell(fVariant)}
{:else if only === "sub"}{@render cell(fSub)}
{:else if only === "cardGroup"}{@render cell(fGroup)}
{:else}
  {#if drawsAs}{@render cell(fDraws)}{/if}
  {#if variant}{@render cell(fVariant)}{/if}
  {#if sub}{@render cell(fSub)}{/if}
  {#if cardGroup}{@render cell(fGroup)}{/if}
{/if}
