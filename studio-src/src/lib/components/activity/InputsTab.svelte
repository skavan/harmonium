<script>
  /* INPUTS — Harmony Q5/Q6: what should each device be set to?
     Feeds the generated Start Action and State detection. Split out
     of ActivityCard.svelte (v0.83.11). */
  import { app } from "../../state.svelte.js";

  let { card } = $props();
  const a = $derived(card.a);
  const inputTargets = $derived(card.inputTargets);
  const { inputAnswer } = card;

  const sourcesOf = (ent) =>
    app.entities.find((x) => x.entity_id === ent)?.source_list || [];
  let typingSrc = $state(null);   /* key currently typing a source */
  function setInput(devId, v) {
    if (!a.inputs) a.inputs = {};
    if (v === "__unset") { delete a.inputs[devId]; if (!Object.keys(a.inputs).length) delete a.inputs; }
    else a.inputs[devId] = v === "__ignore" ? null : v;
  }
</script>

      <!-- INPUTS — Harmony Q5/Q6: what should each device be set to? -->
      <div class="rounded-[10px] border border-line bg-tile p-3">
        <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Inputs — what should each device be set to?</span>
        {#if !inputTargets.length}
          <p class="mt-2 mb-0 text-xs text-dim">Nothing in the cast can switch inputs — nothing to answer here.</p>
        {:else}
          <p class="mt-1 mb-2 text-[11px] text-dim">
            Feeds the generated Start Action (switched only when not already
            there) and State detection. “Leave it alone” is always honored;
            a powered-off device hides its live list — type the source then.
          </p>
          <div class="space-y-1.5">
            {#each inputTargets as t (t.key)}
              {@const opts = sourcesOf(t.ent)}
              {@const cur = inputAnswer(t.key)}
              <div class="flex flex-wrap items-center gap-2.5">
                <span class="w-[210px] shrink-0 truncate font-[inherit] text-[12.5px] text-ink-2" title={t.ent}>{t.name}</span>
                <select value={typingSrc === t.key ? "__type" : cur}
                  onchange={(e) => { const v = e.target.value;
                    if (v === "__type") typingSrc = t.key;
                    else { typingSrc = null; setInput(t.key, v); } }}
                  class="h-[32px] w-[320px] cursor-pointer rounded-[6px] border border-line-strong bg-field px-2 text-[12px] text-ink outline-none focus:border-accent">
                  <option value="__unset">— not answered —</option>
                  <option value="__ignore">Leave it alone (none / ignore)</option>
                  {#each opts as src (src)}<option value={src}>{src}</option>{/each}
                  {#if cur !== "__unset" && cur !== "__ignore" && !opts.includes(cur)}
                    <option value={cur}>{cur}</option>
                  {/if}
                  <option value="__type">type a source…{opts.length ? "" : " (device off — list hidden)"}</option>
                </select>
                {#if typingSrc === t.key}
                  <input placeholder="exact source name…" spellcheck="false"
                    onchange={(e) => { const v = e.target.value.trim();
                      if (v) setInput(t.key, v); typingSrc = null; }}
                    class="h-[32px] w-[220px] rounded-[6px] border border-line-strong bg-field px-2 font-mono text-[12px] text-ink outline-none focus:border-accent" />
                {:else if cur === "__unset"}
                  <span class="text-[10.5px] text-dim italic">unanswered — the dot stays hollow</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
