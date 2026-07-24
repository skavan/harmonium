<script>
  /* STATE RULES — when is an activity ON? (harmonia-style derived
     truth). Default: truth comes from the room's minted activity
     select. Device rules derive it live from real device state:
       all / any   — condition rows (entity · attribute? · op · value)
       any_state   — the primary entity in any of the listed states
     Compiles to activity.state {entities, on:{...}} — the engine's
     v2 state-eval reads it directly. */
  import { app } from "../state.svelte.js";
  import Field from "./Field.svelte";
  import Input from "./Input.svelte";
  import Select from "./Select.svelte";
  import Chips from "./Chips.svelte";
  import EntityPicker from "./EntityPicker.svelte";
  import Button from "./Button.svelte";

  let { a, deviceList } = $props();   // the activity object + its cast (for pickers)

  const entityIds = $derived(app.entities.map((e) => e.entity_id));
  const mode = (x) => !x.state ? "none"
    : x.state.on?.any_state ? "any_state"
    : x.state.on?.any ? "any" : "all";
  function setMode(x, m) {
    if (m === "none") { delete x.state; return; }
    const prev = x.state?.on || {};
    const conds = prev.all || prev.any || [];
    x.state = x.state || { entities: [] };
    if (m === "any_state") x.state.on = { any_state: prev.any_state || ["playing", "paused"] };
    else x.state.on = { [m]: conds.length ? conds : [{ entity: "", state: "on" }] };
  }
  const conds = (x) => x.state?.on?.all || x.state?.on?.any || [];
  const op = (c) => "state" in c ? "state" : "equals" in c ? "equals" : "in" in c ? "in" : "not_in";
  function setOp(c, o) {
    if (op(c) === o) return;
    delete c.state; delete c.equals; delete c.in; delete c.not_in;
    c[o] = (o === "in" || o === "not_in") ? [] : (o === "state" ? "on" : "");
  }
</script>

<div class="rounded-[10px] border border-line bg-tile p-3">
  <div class="mb-2 flex items-center justify-between">
    <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">State — when is this activity ON?</span>
    <Select value={mode(a)} onchange={(e) => setMode(a, e.target.value)}
      options={[
        { value: "none", label: "From activity select (default)" },
        { value: "all", label: "Device rules — ALL must match" },
        { value: "any", label: "Device rules — ANY may match" },
        { value: "any_state", label: "Primary entity in any of…" },
      ]} class="w-64" />
  </div>
  {#if a.state}
    <Field label="Watched entities" class="mb-3">
      <Chips bind:items={a.state.entities}
        suggestions={[...deviceList(), ...entityIds.filter((e) => !deviceList().includes(e))]}
        placeholder="add entity…" />
    </Field>
    {#if mode(a) === "any_state"}
      <Field label="States that mean ON">
        <Chips bind:items={a.state.on.any_state} suggestions={["playing", "paused", "buffering", "on", "idle"]} />
      </Field>
    {:else}
      <div class="space-y-2">
        {#each conds(a) as c, i (i)}
          <div class="grid grid-cols-[1fr_120px_110px_1fr_28px] items-center gap-2">
            <EntityPicker bind:value={c.entity} preferred={deviceList()} />
            <input bind:value={c.attribute} placeholder="attribute?" spellcheck="false"
              class="rounded-[8px] border border-line bg-field px-2 py-1.5 font-mono text-[11.5px] text-ink outline-none focus:border-accent/60" />
            <Select value={op(c)} onchange={(e) => setOp(c, e.target.value)}
              options={[
                { value: "state", label: "state is" },
                { value: "equals", label: "equals" },
                { value: "in", label: "in" },
                { value: "not_in", label: "not in" },
              ]} />
            {#if op(c) === "in" || op(c) === "not_in"}
              <Chips bind:items={c[op(c)]} placeholder="value…" />
            {:else}
              <Input bind:value={c[op(c)]} class="font-mono text-[12.5px]" />
            {/if}
            <button class="cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-danger"
              onclick={() => conds(a).splice(i, 1)}>✕</button>
          </div>
        {/each}
        <Button size="sm" onclick={() => conds(a).push({ entity: "", state: "on" })}>＋ Add condition</Button>
      </div>
    {/if}
  {:else}
    <p class="m-0 text-xs text-dim">Truth comes from the room's activity select. Add device rules to derive it from real device state (harmonia-style).</p>
  {/if}
</div>
