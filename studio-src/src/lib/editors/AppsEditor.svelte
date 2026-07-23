<script>
  /* Apps — the house registry. An app is an IDENTITY (name/icon) +
     default source name; LAUNCH is per-device: explicit override →
     auto (source name in the device's live source_list) → hidden.
     Overrides: source string · sequence · HA action (JSON). */
  import { app, entitiesFor } from "../state.svelte.js";
  import Field from "../components/Field.svelte";
  import Input from "../components/Input.svelte";
  import Select from "../components/Select.svelte";
  import CardRow from "../components/CardRow.svelte";
  import JsonArea from "../components/JsonArea.svelte";
  import Button from "../components/Button.svelte";

  const apps = $derived(app.draft?.apps);
  const players = $derived(entitiesFor(["media_player"]));
  const seqIds = $derived(Object.keys(app.draft?.sequences || {}));
  let lastAdded = $state(null);

  /* live availability: which media_players list this app's source */
  const autoOn = (a) =>
    players.filter((p) => Array.isArray(p.source_list) && a.source &&
      p.source_list.includes(a.source)).map((p) => p.entity_id);

  const ovKind = (v) =>
    typeof v === "string" ? (v.startsWith("sequence:") ? "sequence" : "source") : "action";

  function setOvKind(a, ent, kind) {
    if (kind === "source") a.launch[ent] = "";
    else if (kind === "sequence") a.launch[ent] = "sequence:" + (seqIds[0] || "");
    else a.launch[ent] = { action: "", target: { entity_id: "" }, data: {} };
  }
  function addOverride(a, ent) {
    if (!ent) return;
    a.launch = a.launch || {};
    if (!(ent in a.launch)) a.launch[ent] = "";
  }
  function renameApp(oldId, newId) {
    newId = newId.trim();
    if (!newId || newId === oldId || apps[newId]) return;
    const rebuilt = {};
    for (const [k, v] of Object.entries(apps)) rebuilt[k === oldId ? newId : k] = v;
    app.draft.apps = rebuilt;
  }
  function addApp() {
    if (!app.draft.apps) app.draft.apps = {};
    let id = "new_app", n = 2;
    while (app.draft.apps[id]) id = "new_app_" + n++;
    app.draft.apps[id] = { name: "New App", icon: "material:apps", source: "" };
    lastAdded = id;
  }
</script>

{#if app.draft}
  <div class="space-y-3">
    <p class="m-0 text-xs text-dim">
      One registry for the whole house. The Apps drawer <b>generates</b> its
      tiles from here per device: an explicit <b>override</b> wins, else the
      default source name must appear in the device's live
      <code>source_list</code> (auto), else the app is hidden there. Overrides
      speak three dialects: a source/package string, a building-block
      sequence, or a raw HA action.
    </p>
    {#each Object.entries(apps || {}) as [id, a] (id)}
      <CardRow title={a.name || id}
        subtitle={id + " · " + (a.source || "no default source") +
          (a.launch ? " · " + Object.keys(a.launch).length + " override" + (Object.keys(a.launch).length > 1 ? "s" : "") : "")}
        open={id === lastAdded}
        ondelete={() => delete apps[id]}>
        <div class="space-y-3">
          <div class="grid grid-cols-3 gap-3">
            <Field label="Name"><Input bind:value={a.name} /></Field>
            <Field label="App id" hint="registry key">
              <input value={id} spellcheck="false"
                onchange={(e) => renameApp(id, e.target.value)}
                class="w-full rounded-[8px] border border-line bg-field px-2.5 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-accent/60" />
            </Field>
            <Field label="Icon"><Input bind:value={a.icon} class="font-mono text-[12.5px]" /></Field>
          </div>
          <Field label="Default source name" hint="matched against each device's source_list for auto-launch">
            <Input bind:value={a.source} placeholder="Netflix" />
          </Field>

          {#if a.source}
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Auto on:</span>
              {#each autoOn(a) as ent (ent)}
                <span class="rounded-full bg-ok/15 px-2 py-0.5 font-mono text-[10.5px] text-ok">✓ {ent.split(".")[1]}</span>
              {:else}
                <span class="text-xs text-dim">no device currently lists “{a.source}”</span>
              {/each}
            </div>
          {/if}

          <div class="space-y-2">
            <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Launch overrides — where reality disagrees</span>
            {#each Object.entries(a.launch || {}) as [ent, ov] (ent)}
              <div class="rounded-[8px] bg-inset p-2">
                <div class="flex items-center gap-2">
                  <span class="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink" title={ent}>{ent}</span>
                  <Select value={ovKind(ov)} class="w-32"
                    onchange={(e) => setOvKind(a, ent, e.target.value)}
                    options={[
                      { value: "source", label: "source / pkg" },
                      { value: "sequence", label: "sequence" },
                      { value: "action", label: "HA action" },
                    ]} />
                  <button class="cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-danger"
                    onclick={() => delete a.launch[ent]}>✕</button>
                </div>
                <div class="mt-1.5">
                  {#if ovKind(ov) === "source"}
                    <Input value={ov} placeholder="source name or package (com.netflix.ninja)"
                      class="font-mono text-[12.5px]"
                      oninput={(e) => (a.launch[ent] = e.target.value)} />
                  {:else if ovKind(ov) === "sequence"}
                    <Select value={ov.slice(9)} options={seqIds}
                      onchange={(e) => (a.launch[ent] = "sequence:" + e.target.value)} />
                  {:else}
                    <JsonArea value={ov} rows={5} onchange={(v) => (a.launch[ent] = v)} />
                  {/if}
                </div>
              </div>
            {/each}
            <div class="flex items-center gap-2">
              <Select value="" allowEmpty class="flex-1"
                options={players.map((p) => p.entity_id).filter((e) => !(a.launch && e in a.launch))}
                onchange={(e) => { addOverride(a, e.target.value); e.target.value = ""; }} />
              <span class="text-xs text-dim">← pick a device to override</span>
            </div>
          </div>
        </div>
      </CardRow>
    {/each}
    <Button onclick={addApp}>＋ Add app</Button>
  </div>
{/if}
