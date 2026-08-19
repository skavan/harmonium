<script>
  /* WHAT A PRESET DOES (§6.8) — one action shape, three doors in
     (sequence / scene / raw service), plus the warm-start activity
     and the landing. Split out of TileRow.svelte (v0.83.11
     round 2). */
  import { app, selectSlice } from "../state.svelte.js";
  import Field from "./Field.svelte";
  import Select from "./Select.svelte";
  import EntityPicker from "./EntityPicker.svelte";
  import ServicePicker from "./ServicePicker.svelte";
  import JsonArea from "./JsonArea.svelte";

  let { tile, castEnts = [] } = $props();
  const activityIds = $derived(Object.keys(app.draft?.activities || {}));
  const seqIds = $derived(Object.keys(app.draft?.sequences || {}));

  /* a preset's LANDING (v0.68.7): pages only. navScreenOptions also
     offers ws: doorways and the key-capture screen — neither is a
     sensible place for a playlist tap to leave you. */
  const presetNavOptions = $derived.by(() => {
    const pages = Object.entries(app.draft?.screens || {})
      .map(([sid, s]) => ({ value: sid, label: s.name || sid }));
    /* ACTIVITY DESTINATIONS TOO (v0.79 review: "It should let me
       navigate to the destination of an activity"): each activity's
       landing screen, labelled by both names */
    const seen = new Set(pages.map((o) => o.value));
    const acts = Object.entries(app.draft?.activities || {})
      .filter(([, a]) => a?.screen && !seen.has(a.screen))
      .map(([aid, a]) => {
        const cid = String(a.screen).replace(/^controller:/, "");
        const cname = app.draft?.controllers?.[cid]?.name ||
          app.draft?.screens?.[a.screen]?.name || a.screen;
        return { value: a.screen, label: cname + " — " + (a.name || aid) + "'s page" };
      });
    /* dedupe activities sharing a controller */
    const out = [...pages];
    const seen2 = new Set(seen);
    for (const o of acts) if (!seen2.has(o.value)) { seen2.add(o.value); out.push(o); }
    return out;
  });

  /* ---- PRESET (§6.8): "On tap" wears the paradigm; all three
     choices compile to the ONE action shape the engine already fires
     (service + entity + data — no config-model change) ---- */
  const presetMode = () => {
    /* v0.64: a preset may name a sequence DIRECTLY ({sequence: id}) —
       the same grammar activities and key bindings speak. The long
       harmonium.run spelling still reads as a sequence, so tiles
       written before the engine learned the short form keep working. */
    if (tile.action?.sequence !== undefined) return "sequence";
    const svc = tile.action?.service || "";
    if (svc === "harmonium.run") return "sequence";
    if (svc === "scene.turn_on") return "scene";
    return "service";
  };
  const presetSeq = () => tile.action?.sequence ?? tile.action?.data?.sequence ?? "";
  function setPresetMode(m) {
    if (m === presetMode()) return;
    if (m === "sequence") tile.action = { sequence: "" };
    else if (m === "scene") tile.action = { service: "scene.turn_on", entity: "" };
    else tile.action = { service: "" };
  }
  const PRESET_MODES = [
    { value: "sequence", label: "Run an action — a sequence from Building blocks" },
    { value: "scene", label: "Activate a scene" },
    { value: "service", label: "Call a service — any HA call, verbatim" },
  ];
</script>

        <!-- WHAT IT DOES (§6.8): one shape, three doors in -->
        <div class="grid grid-cols-2 gap-3">
          <Field label="On tap" hint="">
            <Select value={presetMode()} onchange={(e) => setPresetMode(e.target.value)}
              options={PRESET_MODES} />
          </Field>
          {#if presetMode() === "sequence"}
            <div class="flex items-end gap-2">
              <div class="min-w-0 flex-1">
                <Field label="Action" hint="">
                  <Select value={presetSeq()} allowEmpty
                    onchange={(e) => { tile.action = { sequence: e.target.value }; }}
                    options={seqIds} />
                </Field>
              </div>
              <button class="mb-6 shrink-0 cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
                onclick={() => selectSlice("sequences")}>edit →</button>
            </div>
          {:else if presetMode() === "scene"}
            <Field label="Scene" hint="">
              <EntityPicker domains={["scene"]} value={tile.action?.entity ?? ""}
                onchange={(e) => { tile.action = { service: "scene.turn_on", entity: e.target.value }; }} />
            </Field>
          {:else}
            <Field label="Service" hint="searchable — media players first">
              <ServicePicker value={tile.action?.service ?? ""} prefer="media_player"
                onchange={(e) => { tile.action = { ...(tile.action || {}), service: e.target.value.trim() }; }} />
            </Field>
            <Field label="Target entity" hint="who receives the call — $context.* works here">
              <!-- the engine fires action.target || action.entity — honor
                   whichever key the tile already speaks -->
              <EntityPicker value={tile.action?.target ?? tile.action?.entity ?? ""}
                preferred={castEnts}
                onchange={(e) => {
                  const k = tile.action && "target" in tile.action ? "target" : "entity";
                  tile.action = { ...(tile.action || {}), [k]: e.target.value };
                }} /></Field>
            <div class="col-span-2">
              <Field label="Service data (JSON)" hint="">
                <JsonArea value={$state.snapshot(tile.action?.data ?? {})} rows={3}
                  onchange={(v) => { tile.action = { ...(tile.action || {}), data: v }; }} />
              </Field>
            </div>
          {/if}
          <Field label="Belongs to activity" hint="warm-start: the preset makes sure this activity is running first">
            <Select value={tile.activity ?? ""} allowEmpty options={activityIds}
              onchange={(e) => { if (e.target.value) tile.activity = e.target.value; else delete tile.activity; }} />
          </Field>
          <!-- WHERE IT LEAVES YOU (v0.68.7). The action says WHAT to
               fire; `navigate` says where the tap ENDS UP — usually the
               now-playing controller. Two decisions, two fields, because
               the same preset wants a different landing on a room page
               than in a drawer. Blank = stay put. -->
          <Field label="Navigate to"
            hint={tile.activity ? "blank = its activity's page (the default landing)" : "where the tap leaves you — blank = stay on this page"}>
            <Select value={tile.navigate ?? ""} options={[
                { value: "", label: tile.activity ? "Its activity's page (default)" : "Stay on this page" },
                ...presetNavOptions]}
              onchange={(e) => { if (e.target.value) tile.navigate = e.target.value; else delete tile.navigate; }} />
          </Field>
        </div>
        {#if tile.activity || tile.navigate}
          <p class="m-0 text-[11px] text-dim">
            {#if tile.activity}
              This preset belongs to {app.draft?.activities?.[tile.activity]?.name || tile.activity} —
              tapping it starts that activity if it isn't already running, then fires.
            {/if}
            {#if tile.navigate}
              {tile.activity ? " " : ""}After the tap you land on
              <b>{app.draft?.screens?.[tile.navigate]?.name || tile.navigate}</b>{#if tile.activity}, which overrides
              the activity's own page{/if}.
            {/if}
          </p>
        {/if}
