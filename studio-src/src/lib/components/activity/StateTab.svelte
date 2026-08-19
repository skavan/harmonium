<script>
  /* STATE — when is this activity ON? Rule editor, the two ⚙
     generators, and state snippets. Split out of ActivityCard.svelte
     (v0.83.11). */
  import { app, saveSnippet, snippetsOf, schedulePreview } from "../../state.svelte.js";
  import Field from "../Field.svelte";
  import Input from "../Input.svelte";
  import Select from "../Select.svelte";
  import Button from "../Button.svelte";
  import Chips from "../Chips.svelte";
  import EntityPicker from "../EntityPicker.svelte";

  let { card } = $props();
  const a = $derived(card.a);
  const id = $derived(card.id);
  const cast = $derived(card.cast);
  const wiring = $derived(card.wiring);
  const devLib = $derived(card.devLib);
  const { deviceList } = card;
  const entityIds = $derived(app.entities.map((e) => e.entity_id));

  /* STATE from the answers: display on + source in [input] — exactly
     the hand-built watch_firetv detection shape */
  const stateDisplay = $derived.by(() => {
    const devId = typeof wiring.source_select === "string" && devLib[wiring.source_select]
      ? wiring.source_select : null;
    if (!devId) return null;
    const src = (a.inputs || {})[devId];
    if (!src) return null;
    return { devId, ent: devLib[devId].roles.source_select, src };
  });
  /* PRIMARY-DEVICE STATE (v0.47.7 — Suresh: "State comes from the
     primary cast member"): the primary device's media_player claim in
     any on-ish state = the activity is ON. One click, editable after.
     NOT the default — the Fire TV is never off, which is why
     watch_firetv derives from the display + input instead. */
  const primaryMp = $derived(
    devLib[cast[0]]?.roles?.media_player ||
    (typeof a?.context?.media_player === "string" ? a.context.media_player : null));
  /* IMPLIED STATE witness (v0.48.1, mirrors the engine): with NO
     authored rule, truth derives live from the primary device's
     media_player — unless that device is never_off (Fire TV). */
  const impliedWitness = $derived.by(() => {
    const d = devLib[cast[0]];
    return d && !d.traits?.never_off ? d.roles?.media_player || null : null;
  });
  function generatePrimaryState() {
    if (!primaryMp) return;
    a.state = {
      entities: [primaryMp],
      on: { any_state: ["on", "playing", "paused", "buffering", "idle"] },
    };
    schedulePreview();
  }
  function generateState() {
    if (!stateDisplay) return;
    const mp = a.context?.media_player;
    a.state = {
      entities: [...new Set([mp, stateDisplay.ent].filter(Boolean))],
      on: { all: [
        { entity: stateDisplay.ent, state: "on" },
        { entity: stateDisplay.ent, attribute: "source", in: [stateDisplay.src] },
      ] },
    };
    schedulePreview();
  }
  function exportState() {
    if (!a.state) return;
    saveSnippet("state", (a.name || id) + " state", $state.snapshot(a.state));
  }
  function importState(sid) {
    const sn = snippetsOf("state").find(([k]) => k === sid)?.[1];
    if (sn) a.state = JSON.parse(JSON.stringify(sn.data));
  }
  /* ---- state-rule helpers ---- */
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

      <!-- STATE rules -->
      <div class="rounded-[10px] border border-line bg-tile p-3">
        {#snippet uploadIcon2()}
          <svg class="pointer-events-none h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 15V4m0 0L8 8m4-4 4 4" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
          </svg>
        {/snippet}
        {#snippet downloadIcon2()}
          <svg class="pointer-events-none h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 4v11m0 0-4-4m4 4 4-4" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
          </svg>
        {/snippet}
        <div class="mb-2 flex items-center gap-1.5">
          <span class="shrink-0 text-[11px] font-bold tracking-[.07em] text-dim uppercase">State — when is this activity ON?</span>
          <div class="w-72 shrink-0"><Select value={mode(a)} onchange={(e) => setMode(a, e.target.value)}
            options={[
              { value: "none", label: impliedWitness
                  ? "Implied — primary device's player (default)"
                  : "From activity select (default)" },
              { value: "all", label: "Device rules — ALL must match" },
              { value: "any", label: "Device rules — ANY may match" },
              { value: "any_state", label: "Primary entity in any of…" },
            ]} /></div>
          {#if stateDisplay}
            <Button size="sm" onclick={generateState}
              title={"From the answers: " + stateDisplay.ent + " on + source = " + stateDisplay.src}>⚙ From inputs</Button>
          {/if}
          {#if primaryMp}
            <Button size="sm" onclick={generatePrimaryState}
              title={"ON while " + primaryMp + " is on/playing/paused/idle — right for devices that genuinely power off (the projector); wrong for never-off streamers (the Fire TV)"}>⚙ From primary device</Button>
          {/if}
          <span class="min-w-0 flex-1"></span>
          {#if a.state}
            <button class="flex h-[26px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] border border-line-strong bg-surface px-2 text-[11px] font-medium text-ink-2 hover:bg-sunk"
              title="Export these state rules to Snippets" onclick={exportState}>{@render uploadIcon2()} Export snippet</button>
          {/if}
          <div class={"relative flex h-[26px] shrink-0 items-center gap-1.5 rounded-[6px] border border-line-strong px-2 text-[11px] font-medium " +
            (snippetsOf("state").length ? "bg-surface text-ink-2 hover:bg-sunk" : "bg-raised text-faint")}>
            {@render downloadIcon2()} Import snippet…
            <select value="" disabled={!snippetsOf("state").length}
              title={snippetsOf("state").length
                ? "Import from Snippets"
                : "No state snippets yet — Export snippet captures these rules"}
              onchange={(e) => { if (e.target.value) importState(e.target.value); e.target.value = ""; }}
              class="absolute inset-0 w-full cursor-pointer opacity-0 outline-none disabled:cursor-default">
              <option value=""></option>
              {#each snippetsOf("state") as [sid, sn] (sid)}<option value={sid}>{sn.name}</option>{/each}
            </select>
          </div>
        </div>
        {#if !a.state && impliedWitness}
          <p class="mt-1 mb-0 text-[11px] text-dim">
            No rule authored — the remote implies ON while
            <span class="font-mono text-[10.5px]">{impliedWitness}</span> is
            on/playing/paused/idle (a manually powered-off device can't strand
            an ON tile). Pick a mode above to override.
          </p>
        {/if}
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
          <p class="m-0 text-xs text-dim">Truth comes from the page's activity select. Add device rules to derive it from real device state (harmonia-style).</p>
        {/if}
      </div>
