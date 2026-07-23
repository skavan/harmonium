<script>
  /* Activities — the harmonia Activity card: identity, Setup (context
     devices), State (declarative on-rules), navigation + confirm, with
     controls JSON as the advanced escape hatch. */
  import { app } from "../state.svelte.js";
  import Field from "../components/Field.svelte";
  import Input from "../components/Input.svelte";
  import Select from "../components/Select.svelte";
  import Switch from "../components/Switch.svelte";
  import Chips from "../components/Chips.svelte";
  import CardRow from "../components/CardRow.svelte";
  import EntityPicker from "../components/EntityPicker.svelte";
  import JsonArea from "../components/JsonArea.svelte";
  import Button from "../components/Button.svelte";

  const acts = $derived(app.draft?.activities);
  const screenIds = $derived(Object.keys(app.draft?.screens || {}));
  const entityIds = $derived(app.entities.map((e) => e.entity_id));
  const CTX_SLOTS = ["media_player", "dpad", "power", "volume", "volume_level"];
  let rawOpen = $state({});

  /* ---- state-rule helpers ---- */
  const mode = (a) => !a.state ? "none"
    : a.state.on?.any_state ? "any_state"
    : a.state.on?.any ? "any" : "all";
  function setMode(a, m) {
    if (m === "none") { delete a.state; return; }
    const prev = a.state?.on || {};
    const conds = prev.all || prev.any || [];
    a.state = a.state || { entities: [] };
    if (m === "any_state") a.state.on = { any_state: prev.any_state || ["playing", "paused"] };
    else a.state.on = { [m]: conds.length ? conds : [{ entity: "", state: "on" }] };
  }
  const conds = (a) => a.state?.on?.all || a.state?.on?.any || [];
  const op = (c) => "state" in c ? "state" : "equals" in c ? "equals" : "in" in c ? "in" : "not_in";
  function setOp(c, o) {
    const cur = op(c);
    if (cur === o) return;
    delete c.state; delete c.equals; delete c.in; delete c.not_in;
    c[o] = (o === "in" || o === "not_in") ? [] : (o === "state" ? "on" : "");
  }

  function renameActivity(oldId, newId) {
    newId = newId.trim();
    if (!newId || newId === oldId || acts[newId]) return;
    const rebuilt = {};
    for (const [k, v] of Object.entries(acts)) rebuilt[k === oldId ? newId : k] = v;
    app.draft.activities = rebuilt;
  }
  function addActivity() {
    let id = "new_activity", n = 2;
    while (acts[id]) id = "new_activity_" + n++;
    acts[id] = { name: "New Activity", icon: "material:play_circle", color: "#e89b17",
      start: "", context: {}, screen: "", confirm_end: true };
  }
</script>

{#if acts}
  <div class="space-y-3">
    {#each Object.entries(acts) as [id, a] (id)}
      <CardRow title={a.name || id} subtitle={id} accent={a.color || "#666"}
        ondelete={() => delete acts[id]}>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <Field label="Display name"><Input bind:value={a.name} /></Field>
            <Field label="Activity id" hint="renames the key everywhere in this config">
              <input value={id} spellcheck="false"
                onchange={(e) => renameActivity(id, e.target.value)}
                class="w-full rounded-[8px] border border-line bg-[#12151a] px-2.5 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-accent/60" />
            </Field>
            <Field label="Icon"><Input bind:value={a.icon} class="font-mono text-[12.5px]" /></Field>
            <Field label="Accent color">
              <div class="flex items-center gap-2">
                <input type="color" bind:value={a.color}
                  class="h-8 w-12 cursor-pointer rounded border border-line bg-transparent p-0.5" />
                <Input bind:value={a.color} class="font-mono text-[12.5px]" />
              </div>
            </Field>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <Field label="Start script" hint="HA runs the activity">
              <EntityPicker bind:value={a.start} domains={["script"]} /></Field>
            <Field label="Stop script" hint="blank = room All Off ends it">
              <EntityPicker bind:value={a.stop} domains={["script"]} /></Field>
            <Field label="Navigate to (after start)">
              <Select bind:value={a.screen} options={screenIds} allowEmpty /></Field>
            <Field label="Room view" hint="where Home lands from this activity">
              <Select bind:value={a.room_view} options={screenIds} allowEmpty /></Field>
          </div>

          <Switch bind:checked={a.confirm_end} label="Confirm before ending (press twice)" />

          <!-- SETUP: context devices -->
          <div class="rounded-[10px] border border-line bg-tile p-3">
            <div class="mb-2 text-[11px] font-bold tracking-[.07em] text-dim uppercase">Setup — devices ($context slots)</div>
            <div class="space-y-2">
              {#each CTX_SLOTS as slot (slot)}
                <div class="flex items-center gap-2">
                  <span class="w-28 shrink-0 font-mono text-[11.5px] text-dim">{slot}</span>
                  <EntityPicker
                    value={a.context?.[slot] || ""}
                    oninput={(e) => { a.context = a.context || {}; const v = e.target.value;
                      if (v) a.context[slot] = v; else delete a.context[slot]; }}
                  />
                </div>
              {/each}
              {#each Object.keys(a.context || {}).filter((k) => !CTX_SLOTS.includes(k)) as slot (slot)}
                <div class="flex items-center gap-2">
                  <span class="w-28 shrink-0 truncate font-mono text-[11.5px] text-accent" title={slot}>{slot}</span>
                  <span class="flex-1 truncate font-mono text-[11.5px] text-dim">
                    {typeof a.context[slot] === "string" ? a.context[slot] : "(map — edit in Code tab)"}
                  </span>
                  <button class="cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-danger"
                    onclick={() => delete a.context[slot]}>✕</button>
                </div>
              {/each}
            </div>
          </div>

          <!-- STATE rules -->
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
                <Chips bind:items={a.state.entities} suggestions={entityIds} placeholder="add entity…" />
              </Field>
              {#if mode(a) === "any_state"}
                <Field label="States that mean ON">
                  <Chips bind:items={a.state.on.any_state} suggestions={["playing", "paused", "buffering", "on", "idle"]} />
                </Field>
              {:else}
                <div class="space-y-2">
                  {#each conds(a) as c, i (i)}
                    <div class="grid grid-cols-[1fr_120px_110px_1fr_28px] items-center gap-2">
                      <EntityPicker bind:value={c.entity} />
                      <input bind:value={c.attribute} placeholder="attribute?" spellcheck="false"
                        class="rounded-[8px] border border-line bg-[#12151a] px-2 py-1.5 font-mono text-[11.5px] text-ink outline-none focus:border-accent/60" />
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

          <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
            onclick={() => (rawOpen[id] = !rawOpen[id])}>
            {rawOpen[id] ? "Hide" : "Show"} controls &amp; extras (JSON)</button>
          {#if rawOpen[id]}
            <JsonArea value={$state.snapshot(a)} onchange={(v) => (acts[id] = v)} rows={12} />
          {/if}
        </div>
      </CardRow>
    {/each}
    <Button onclick={addActivity}>＋ Add activity</Button>
  </div>
{/if}
