<script>
  /* ACTIONS — named SEQUENCES in HA action syntax, stored in the
     Harmonium config and executed HA-side by harmonium.run.
     Typed rows for the common steps; JSON for anything exotic. */
  import { app, roomIds, testSequence, setStatus, selectSlice,
    confirmSeqDraft, discardSeqDraft } from "../state.svelte.js";
  import Field from "../components/Field.svelte";
  import Input from "../components/Input.svelte";
  import Select from "../components/Select.svelte";
  import CardRow from "../components/CardRow.svelte";
  import EntityPicker from "../components/EntityPicker.svelte";
  import JsonArea from "../components/JsonArea.svelte";
  import Button from "../components/Button.svelte";

  const seqs = $derived(app.draft?.sequences);
  const rooms = $derived(roomIds());
  let lastAdded = $state(null);
  /* an in-flight ＋-minted ACTION draft opens its own card (page
     drafts belong to their page editor, not here) */
  const seqDraft = $derived(app.pending?.seqId ? app.pending : null);
  $effect(() => { if (seqDraft) lastAdded = seqDraft.seqId; });
  const backKey = $derived(
    app.prevKey && app.prevKey !== "sequences" &&
    (app.prevKey.startsWith("view.") || app.prevKey.startsWith("screens.")) ? app.prevKey : null);
  const backLabel = $derived.by(() => {
    if (!backKey) return "";
    const sid = backKey.startsWith("view.") ? backKey.slice(5) : backKey.slice(8);
    return app.draft?.screens?.[sid]?.name || sid;
  });
  /* GROUPED by free-form group name — "TV actions", "Lighting", etc.
     A sequence's room is inert metadata (authoring provenance), so the
     room name is only the DEFAULT filing when no group is chosen. */
  const roomName = (r) => r ? (app.draft?.screens?.[r]?.name || r) : "House";
  const groupOf = (s) => s.group || (s.room ? roomName(s.room) : "House");
  const groups = $derived.by(() => {
    const m = new Map();
    for (const [id, s] of Object.entries(seqs || {})) {
      const g = groupOf(s);
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(id);
    }
    return [...m.entries()];
  });
  const groupNames = $derived([...new Set([
    ...Object.values(seqs || {}).map(groupOf),
    ...rooms.map(roomName),
  ])]);
  function dupSeq(id) {
    const copy = JSON.parse(JSON.stringify($state.snapshot(seqs[id])));
    copy.name = (copy.name || id) + " copy";
    let nid = id + "_copy", n = 2;
    while (seqs[nid]) nid = id + "_copy" + n++;
    seqs[nid] = copy;
    lastAdded = nid;
  }

  const rowType = (a) =>
    a == null || typeof a !== "object" ? "json"
    : "delay" in a ? "delay"
    : "wait_for_trigger" in a ? "wait"
    : a.action === "script.turn_on" ? "script"
    : typeof a.action === "string" ? "service"
    : "json";
  const TYPE_LABEL = { service: "Call service", script: "Run script", delay: "Delay", wait: "Wait for", json: "HA action (JSON)" };
  const TEMPLATES = {
    service: () => ({ action: "", target: { entity_id: "" } }),
    script: () => ({ action: "script.turn_on", target: { entity_id: "" } }),
    delay: () => ({ delay: { seconds: 1 } }),
    wait: () => ({
      wait_for_trigger: [{ trigger: "state", entity_id: "", to: "on" }],
      timeout: { seconds: 5 }, continue_on_timeout: true,
    }),
    json: () => ({}),
  };
  const summary = (a) => {
    const t = rowType(a);
    if (t === "delay") return (a.delay?.seconds ?? "?") + "s";
    if (t === "wait") return (a.wait_for_trigger?.[0]?.entity_id || "?") + " → " + (a.wait_for_trigger?.[0]?.to ?? "?");
    if (t === "script") return a.target?.entity_id || "?";
    if (t === "service") return a.action + " → " + (a.target?.entity_id || "—");
    return "custom";
  };
  function renameSeq(oldId, newId) {
    newId = newId.trim();
    if (!newId || newId === oldId || seqs[newId]) return;
    const rebuilt = {};
    for (const [k, v] of Object.entries(seqs)) rebuilt[k === oldId ? newId : k] = v;
    app.draft.sequences = rebuilt;
    /* keep activity refs honest */
    for (const a of Object.values(app.draft.activities || {}))
      for (const slot of ["start", "stop"])
        if (a[slot] === "sequence:" + oldId) a[slot] = "sequence:" + newId;
  }
  function addSequence() {
    if (!app.draft.sequences) app.draft.sequences = {};
    let id = "new_sequence", n = 2;
    while (app.draft.sequences[id]) id = "new_sequence_" + n++;
    app.draft.sequences[id] = { name: "New Sequence", room: rooms[0] || undefined, actions: [] };
    lastAdded = id;
  }
  const usedBy = (id) =>
    Object.entries(app.draft?.activities || {})
      .filter(([, a]) => a.start === "sequence:" + id || a.stop === "sequence:" + id)
      .map(([aid]) => aid);
  /* entity pickers pin the relevant cast on top: devices of activities
     that USE this sequence (or live in its room) */
  const prefFor = (sid) => {
    const out = [];
    for (const a of Object.values(app.draft?.activities || {})) {
      const refs = a.start === "sequence:" + sid || a.stop === "sequence:" + sid;
      const sameRoom = a.room_view && a.room_view === seqs?.[sid]?.room;
      if (!refs && !sameRoom) continue;
      for (const v of [...(a.devices || []), ...Object.values(a.context || {})])
        if (typeof v === "string" && v.includes(".") && !out.includes(v)) out.push(v);
    }
    return out;
  };
</script>

{#if app.draft}
  <div class="space-y-3">
    {#if backKey && !seqDraft}
      <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
        onclick={() => selectSlice(backKey)}>← back to {backLabel}</button>
    {/if}
    {#if seqDraft}
      <div class="flex flex-wrap items-center gap-3 rounded-[10px] border border-accent/50 bg-accent/10 px-3 py-2">
        <span class="text-sm text-ink">
          Drafting <b>{seqs?.[seqDraft.seqId]?.name || seqDraft.seqId}</b> as
          <b>{app.draft.activities?.[seqDraft.activityId]?.name || seqDraft.activityId}</b>'s
          {seqDraft.kind} action — <i>nothing is linked until you confirm</i>.
        </span>
        <Button size="sm" onclick={confirmSeqDraft}>✓ Confirm &amp; link</Button>
        <Button size="sm" variant="danger" onclick={discardSeqDraft}>✕ Discard</Button>
      </div>
    {/if}
    <p class="m-0 text-xs text-dim">
      A sequence is a list of steps that run <b>top to bottom, one after
      another</b> — exactly like a Home Assistant script (each step is
      standard HA action syntax; the "HA action (JSON)" row IS a raw HA
      script step). Nothing waits unless you add a <b>Delay</b> or
      <b>Wait for</b> step. Activities pick sequences as their Start/Stop
      actions. Edits follow the usual rule: <b>Save &amp; Deploy</b> (top
      right) stores them; ▶ Test runs the last <b>saved</b> copy HA-side
      via <code>harmonium.run</code>.
    </p>
    {#each groups as [gname, ids] (gname)}
    <div class="pt-1 text-[11px] font-bold tracking-[.07em] text-dim uppercase">{gname}</div>
    {#each ids as id (id)}
      {@const seq = seqs[id]}
      <CardRow title={seq.name || id} subtitle={id +
          " · " + (seq.actions?.length ?? 0) + " actions"}
        open={id === lastAdded}
        onduplicate={() => dupSeq(id)}
        ondelete={() => {
          /* ✕ on an in-flight draft = Discard (same contract) */
          if (app.pending?.seqId === id) { discardSeqDraft(); return; }
          const u = usedBy(id);
          if (u.length) setStatus("'" + id + "' is used by: " + u.join(", ") + " — repoint them first", "err");
          else delete seqs[id];
        }}>
        <div class="space-y-4">
          <div class="grid grid-cols-3 gap-3">
            <Field label="Name"><Input bind:value={seq.name} /></Field>
            <Field label="Sequence id" hint="renames refs everywhere">
              <input value={id} spellcheck="false"
                onchange={(e) => renameSeq(id, e.target.value)}
                class="w-full rounded-[8px] border border-line bg-field px-2.5 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-accent/60" />
            </Field>
            <Field label="Group" hint="free filing — TV actions, Lighting… blank = the owner page">
              <input value={seq.group || ""} list="seqgroups" placeholder={groupOf(seq)}
                onchange={(e) => { const v = e.target.value.trim();
                  if (v) seq.group = v; else delete seq.group; }}
                class="w-full rounded-[8px] border border-line bg-field px-2.5 py-1.5 font-[inherit] text-sm text-ink outline-none focus:border-accent/60" />
              <datalist id="seqgroups">
                {#each groupNames as g (g)}<option value={g}></option>{/each}
              </datalist>
            </Field>
          </div>

          <div class="space-y-2">
            {#each seq.actions as a, i (i)}
              {@const t = rowType(a)}
              <div class="rounded-[10px] border border-line bg-tile p-2.5">
                <div class="mb-2 flex items-center gap-2">
                  <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-ink">{i + 1}</span>
                  <span class="rounded-full bg-tile-hi px-2 py-0.5 text-[10px] font-bold tracking-wide text-dim uppercase">{TYPE_LABEL[t]}</span>
                  <input
                    value={a.alias || ""}
                    placeholder="name this step…"
                    title="Step name — click to edit"
                    onchange={(e) => { if (e.target.value) a.alias = e.target.value; else delete a.alias; }}
                    class="min-w-0 flex-1 rounded-[6px] border border-transparent bg-transparent px-1 text-sm font-semibold text-ink outline-none placeholder:font-normal placeholder:text-dim/60 hover:border-line hover:bg-field focus:border-accent/60 focus:bg-field"
                  />
                  <span class="truncate font-mono text-[11px] text-dim">{summary(a)}</span>
                  <button class="cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-ink" title="Move up"
                    onclick={() => { if (i > 0) [seq.actions[i - 1], seq.actions[i]] = [seq.actions[i], seq.actions[i - 1]]; }}>↑</button>
                  <button class="cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-ink" title="Move down"
                    onclick={() => { if (i < seq.actions.length - 1) [seq.actions[i + 1], seq.actions[i]] = [seq.actions[i], seq.actions[i + 1]]; }}>↓</button>
                  <button class="cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-ink" title="Duplicate step"
                    onclick={() => seq.actions.splice(i + 1, 0, JSON.parse(JSON.stringify($state.snapshot(a))))}>⧉</button>
                  <button class="cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-danger" title="Delete step"
                    onclick={() => seq.actions.splice(i, 1)}>✕</button>
                </div>
                {#if t === "service"}
                  <div class="grid grid-cols-2 gap-2">
                    <Field label="Action (domain.service)">
                      <Input bind:value={a.action} placeholder="media_player.turn_off" class="font-mono text-[12.5px]" />
                    </Field>
                    <Field label="Target entity">
                      <EntityPicker
                        value={a.target?.entity_id || ""}
                        oninput={(e) => { a.target = a.target || {}; a.target.entity_id = e.target.value; }}
                        domains={a.action?.includes(".") ? [a.action.split(".")[0]] : null}
                        preferred={prefFor(id)}
                      />
                    </Field>
                  </div>
                  {#if a.data !== undefined || t === "service"}
                    <details class="mt-2">
                      <summary class="cursor-pointer text-xs text-dim">data {a.data ? "· " + JSON.stringify(a.data).slice(0, 40) : "(none)"}</summary>
                      <div class="mt-1">
                        <JsonArea value={a.data ?? null} rows={3}
                          onchange={(v) => { if (v == null) delete a.data; else a.data = v; }} />
                      </div>
                    </details>
                  {/if}
                {:else if t === "script"}
                  <Field label="Script">
                    <EntityPicker
                      value={a.target?.entity_id || ""}
                      oninput={(e) => { a.target = a.target || {}; a.target.entity_id = e.target.value; }}
                      domains={["script"]}
                    />
                  </Field>
                {:else if t === "delay"}
                  <Field label="Seconds">
                    <Input type="number" min="0" step="0.5" value={a.delay?.seconds ?? 1}
                      oninput={(e) => (a.delay = { seconds: Number(e.target.value) || 0 })} class="w-32" />
                  </Field>
                {:else if t === "wait"}
                  <div class="grid grid-cols-[2fr_1fr_1fr] gap-2">
                    <Field label="Entity">
                      <EntityPicker
                        value={a.wait_for_trigger?.[0]?.entity_id || ""}
                        oninput={(e) => (a.wait_for_trigger[0].entity_id = e.target.value)}
                        preferred={prefFor(id)}
                      />
                    </Field>
                    <Field label="Reaches state">
                      <Input value={a.wait_for_trigger?.[0]?.to ?? ""} class="font-mono text-[12.5px]"
                        oninput={(e) => (a.wait_for_trigger[0].to = e.target.value)} />
                    </Field>
                    <Field label="Timeout (s)">
                      <Input type="number" min="1" value={a.timeout?.seconds ?? 5}
                        oninput={(e) => (a.timeout = { seconds: Number(e.target.value) || 5 })} />
                    </Field>
                  </div>
                {:else}
                  <JsonArea value={$state.snapshot(a)} rows={6} onchange={(v) => (seq.actions[i] = v)} />
                {/if}
              </div>
            {:else}
              <p class="m-0 text-xs text-dim">No actions yet.</p>
            {/each}
            <div class="flex flex-wrap items-center gap-1.5">
              {#each Object.keys(TEMPLATES) as t (t)}
                <Button size="sm" onclick={() => seq.actions.push(TEMPLATES[t]())}>＋ {TYPE_LABEL[t]}</Button>
              {/each}
              <span class="flex-1"></span>
              {#if usedBy(id).length}
                <span class="text-[11px] text-dim">used by: {usedBy(id).join(", ")}</span>
              {/if}
              <Button size="sm" variant="primary" onclick={() => testSequence(id)}
                title="Runs the last SAVED copy via harmonium.run">▶ Test</Button>
            </div>
          </div>
        </div>
      </CardRow>
    {/each}
    {/each}
    <Button onclick={addSequence}>＋ Add action</Button>
  </div>
{/if}
