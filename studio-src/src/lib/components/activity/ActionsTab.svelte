<script>
  /* ACTIONS — start/stop wiring and the generators (docs/wizard.md:
     power is never guessed). Split out of ActivityCard.svelte
     (v0.83.11). */
  import { app, setStatus, schedulePreview, beginSeqDraft } from "../../state.svelte.js";
  import Field from "../Field.svelte";
  import ActionPicker from "../ActionPicker.svelte";
  import Button from "../Button.svelte";
  import Switch from "../Switch.svelte";

  let { card } = $props();
  const a = $derived(card.a);
  const id = $derived(card.id);
  const cast = $derived(card.cast);
  const devLib = $derived(card.devLib);
  const { inputEnt, slugify, roomLabel } = card;

  /* ---- GENERATION (docs/wizard.md — the prime directive: NEVER guess
     power). Start Actions follow the proven firetv_on shape; drafts are
     ordinary editable sequences; an edited sequence is NEVER silently
     overwritten (a _v2 is minted beside it); power-off is strictly
     opt-in per device and never_off devices are untouchable. ---- */
  function buildStartActions() {
    const steps = [{ alias: "Set activity state",
      action: "harmonium.set_activity", data: { activity: id } }];
    for (const devId of cast) {
      const d = devLib[devId];
      const t = d?.traits || {};
      if (!t.wake) continue;
      steps.push({ alias: "Wake " + (d.name || devId) + " if asleep (best effort)",
        action: "homeassistant.turn_on", continue_on_error: true,
        target: { entity_id: t.wake } });
      if (t.cold_start?.length || t.wait_timeout_s || t.settle_s) {
        const then = [
          ...(t.cold_start || []).map((s) => JSON.parse(JSON.stringify(s))),
          ...(t.wait_timeout_s ? [{
            alias: "Wait for " + (d.name || devId) + " to report on (up to " + t.wait_timeout_s + "s)",
            wait_for_trigger: [{ trigger: "state", entity_id: t.wait_on || t.wake, to: "on" }],
            timeout: { seconds: t.wait_timeout_s }, continue_on_timeout: true }] : []),
          ...(t.settle_s ? [{
            alias: "Let " + (d.name || devId) + " finish waking",
            delay: { seconds: t.settle_s } }] : []),
        ];
        if (then.length)
          steps.push({ alias: "Cold start only: bring up " + (d.name || devId),
            if: [{ condition: "state", entity_id: t.wake, state: "off" }], then });
      }
    }
    for (const [devId, src] of Object.entries(a.inputs || {})) {
      if (src == null) continue;                     /* none / ignore */
      /* same entity the Inputs tab asked about (v0.83.7) */
      const ent = inputEnt(devId) ||
        (devId.includes(".") ? devId : null);        /* direct entity key */
      if (!ent) continue;
      steps.push({
        alias: "Switch " + (devLib[devId]?.name || devId) + " to " + src + " ONLY if needed",
        if: [{ condition: "not", conditions: [{ condition: "state",
          entity_id: ent, attribute: "source", state: src }] }],
        then: [{ alias: "Set input to " + src + " (best effort)",
          action: "media_player.select_source", continue_on_error: true,
          data: { source: src }, target: { entity_id: ent } }] });
    }
    return steps;
  }
  function buildStopActions() {
    /* THE STOP ENDS THIS ACTIVITY, NOT THE ROOM (v0.83.7 — Suresh:
       "a room can run MORE than one activity at a time. Listen to
       Music and Watch TV. If I long press Watch TV, I want Watch TV
       turned off. Not the whole room."). The room's select is the
       FOCUS — who owns the controller, the keys, the context — and
       it holds one activity; device truth (state rules / implied
       state) is what makes several activities read as running at
       once. So a generated Stop: turns off ITS checked devices, and
       clears the room's routing ONLY if this activity still holds
       it — if Music took the room meanwhile, ending Watch TV leaves
       Music's routing alone. (The original bug here was worse: a
       bare set_activity off is ALL-OFF, every room in the
       workspace.) The select id is the minted pattern —
       workspace-prefixed except main; duplication retargets it. */
    const selEnt = "select.harmonium_" +
      (app.workspace === "main" ? "" : app.workspace + "_") +
      (a.room_view || "") + "_activity";
    const steps = [{
      alias: "Clear the room's routing — ONLY if this activity still owns it",
      if: [{ condition: "state", entity_id: selEnt, state: id }],
      then: [{ action: "harmonium.set_activity",
        data: { activity: "off",
          ...(a.room_view ? { room: a.room_view } : {}) } }] }];
    for (const devId of a.stop_off || []) {
      const d = devLib[devId];
      if (!d || d.traits?.never_off) continue;       /* the untouchables */
      const ent = d.roles?.power || d.roles?.media_player;
      if (!ent) continue;
      steps.push({ alias: "Turn " + (d.name || devId) + " off (best effort)",
        action: "homeassistant.turn_off", continue_on_error: true,
        target: { entity_id: ent } });
    }
    return steps;
  }
  function writeGenerated(kind, steps) {
    if (!app.draft.sequences) app.draft.sequences = {};
    const seqs = app.draft.sequences;
    const sig = JSON.stringify(steps);
    const ref = a[kind] || "";
    let sid = ref.startsWith("sequence:") ? ref.slice(9) : null;
    if (sid && seqs[sid]) {
      const cur = seqs[sid];
      const untouched = cur.generated_sig &&
        JSON.stringify(cur.actions) === cur.generated_sig;
      if (!untouched) {
        /* NEVER overwrite an edited (or hand-written) sequence —
           mint a sibling and leave the original alone */
        let v = sid.replace(/_v\d+$/, ""), n = 2;
        while (seqs[v + "_v" + n]) n++;
        sid = v + "_v" + n;
      }
    } else {
      const base = slugify(roomLabel() + " " + (a.name || id) + " " + kind) || id + "_" + kind;
      sid = base;
      let n = 2;
      while (seqs[sid]) sid = base + "_" + n++;
    }
    seqs[sid] = {
      name: (a.name || id) + " — " + (kind === "start" ? "Start" : "Stop") + " (generated)",
      room: a.room_view || undefined,
      actions: steps,
      generated_sig: sig,
    };
    a[kind] = "sequence:" + sid;
    setStatus("generated " + sid + " — an ordinary editable Action, yours now", "ok");
    schedulePreview();
  }
  function toggleStopOff(devId) {
    if (!a.stop_off) a.stop_off = [];
    if (a.stop_off.includes(devId)) a.stop_off = a.stop_off.filter((x) => x !== devId);
    else a.stop_off.push(devId);
    if (!a.stop_off.length) delete a.stop_off;
  }
  /* ---- ＋ create a Start/Stop action right here ----
     Mints an auto-named DRAFT action, seeded with the doctrine's
     first step (Set activity state — "off" for stops), filed under
     the owner room — then opens the Actions editor in draft mode.
     NOTHING is linked until Confirm there; Discard deletes it and
     returns here untouched. */
  function createSeq(kind) {
    if (!app.draft.sequences) app.draft.sequences = {};
    const seqs = app.draft.sequences;
    const base = slugify(roomLabel() + " " + (a.name || id) + " " + kind) || id + "_" + kind;
    let sid = base, n = 2;
    while (seqs[sid]) sid = base + "_" + n++;
    seqs[sid] = {
      name: (a.name || id) + " — " + (kind === "start" ? "Start" : "Stop"),
      room: a.room_view || undefined,
      actions: [{
        alias: "Set activity state",
        action: "harmonium.set_activity",
        data: { activity: kind === "start" ? id : "off" },
      }],
    };
    beginSeqDraft(sid, kind, id);
  }
</script>

      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <Field label="Start action" hint="an Action (sequence), or a plain HA script — ＋ drafts one">
            <ActionPicker bind:value={a.start} oncreate={() => createSeq("start")}
              createTitle={"Create sequence “" + (a.name || id) + " — Start”"} /></Field>
          <Field label="Stop action" hint="blank = the page's hold-Power action ends it">
            <ActionPicker bind:value={a.stop} oncreate={() => createSeq("stop")}
              createTitle={"Create sequence “" + (a.name || id) + " — Stop”"} /></Field>
        </div>
        <!-- GENERATION (docs/wizard.md): drafts you own — power never guessed -->
        <div class="rounded-[10px] border border-line bg-tile p-3">
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Generate from the answers</span>
            <Button size="sm" onclick={() => writeGenerated("start", buildStartActions())}
              title="Set state → best-effort wakes → cold-start blocks → input switches (from Devices + Inputs)">⚙ Start Action</Button>
            <Button size="sm" onclick={() => writeGenerated("stop", buildStopActions())}
              title="Clears the activity state; turns off ONLY what's checked below">⚙ Stop Action</Button>
          </div>
          <p class="mt-1 mb-2 text-[11px] text-dim">
            The draft is an ordinary editable Action. Regenerating updates it
            in place only while untouched — once you've edited it, a
            <span class="font-mono">_v2</span> is minted beside it, never over it.
          </p>
          <p class="mt-0 mb-1 text-[10px] font-semibold tracking-[.08em] text-dim uppercase">When this activity ends, turn off…</p>
          <div class="flex flex-wrap gap-x-4 gap-y-1">
            {#each cast as devId (devId)}
              {@const d = devLib[devId]}
              {#if d?.traits?.never_off}
                <span class="inline-flex items-center gap-1.5 text-[12px] text-faint"
                  title="Marked never-off in the device library — a generated Stop will never touch it">🔒 {d.name || devId}<span class="text-[10px] italic">never off</span></span>
              {:else}
                <label class="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-2">
                  <input type="checkbox" checked={(a.stop_off || []).includes(devId)}
                    onchange={() => toggleStopOff(devId)} class="h-3 w-3" />
                  {d?.name || devId}
                </label>
              {/if}
            {:else}
              <span class="text-[11px] text-dim italic">cast devices appear here</span>
            {/each}
          </div>
          <p class="mt-1.5 mb-0 text-[10.5px] text-dim italic">
            nothing checked = the generated Stop only clears the activity
            state — power is never guessed (the Harmony lesson)
          </p>
        </div>
        <Switch label="Confirm before ending (press twice)"
          bind:checked={() => a.confirm_end ?? false, (v) => (a.confirm_end = v)} />
        <Switch label="Confirm before switching away (press twice)"
          bind:checked={() => a.confirm_switch ?? false, (v) => (a.confirm_switch = v)} />
        <!-- SWITCH TEARDOWN (2026-08-20 — "where in Studio do I tell
             it An activity should be turned off on a switch?"): the
             outgoing activity opts in to running its Stop when
             another activity starts. Off = the incoming Start owns
             the transition (shared devices don't flicker). -->
        <Switch label="Run my Stop when another activity starts"
          bind:checked={() => a.stop_on_switch ?? false, (v) => (a.stop_on_switch = v)} />
        {#if a.stop_on_switch}
          <p class="mt-1 mb-0 text-[10.5px] text-dim italic">
            shape this activity's Stop for hand-offs: touch only what
            no other activity shares (the incoming Start still runs)
          </p>
        {/if}
      </div>
