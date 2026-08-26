<script>
  /* Apps (v0.30) — two layers:
     MASTER LIST: identity only (name + icon/image). Could be 100 items;
       nothing here launches anything.
     DIALECTS: a platform's launch dialect — its entry per app IS
       the curation (listed = offered). Entry forms: source (select_source
       on $context.media_player) · HA action · run a named Action.
     A surface picks its dialect via the ACTIVITY's context (dialect) —
     one shared Apps drawer, many dialects. */
  import { app, schedulePreview, setStatus } from "../state.svelte.js";
  import { STOCK_DIALECTS } from "../stocklib.js";
  import { unitFp } from "../ownership.js";
  import Field from "../components/Field.svelte";
  import IconPicker from "../components/IconPicker.svelte";
  import Input from "../components/Input.svelte";
  import Select from "../components/Select.svelte";
  import CardRow from "../components/CardRow.svelte";
  import SectionFold from "../components/SectionFold.svelte";
  import JsonArea from "../components/JsonArea.svelte";
  import Button from "../components/Button.svelte";

  const apps = $derived(app.draft?.apps);
  /* the buttons the engine can send, and the names it sends by default
     (mirrors DPAD_DEFAULT in src/widgets/helpers.js — keep in sync;
     tests/probe-dpad-dialect.mjs guards the pair) */
  const DPAD_KEYS = ["up", "down", "left", "right", "select",
    "back", "home", "menu", "info", "ch_up", "ch_down"];
  const DPAD_FALLBACK = {
    up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT", select: "ENTER",
    back: "BACK", home: "HOME", menu: "MENU", info: "INFO",
    ch_up: "CHANNEL_UP", ch_down: "CHANNEL_DOWN",
  };
  let cmdOpen = $state({});
  const classes = $derived(app.draft?.dialects);
  const seqOptions = $derived(Object.entries(app.draft?.sequences || {})
    .map(([sid, s]) => ({ value: sid, label: s.name || sid })));
  const edit = () => schedulePreview();
  let lastAdded = $state(null);
  let masterOpen = $state(false);
  let clsOpen = $state({});
  /* v0.85.7 dialect ownership: a stock dialect matching the shipped
     shape tracks updates; one edit and it is the user's — shown here,
     with View stock (copy-paste) and Reset to stock as the doors. */
  let stockView = $state({});
  const isStockId = (cid) => !!STOCK_DIALECTS[cid];
  const dialectEdited = (cid, c) =>
    isStockId(cid) && unitFp(c) !== unitFp(STOCK_DIALECTS[cid]);
  function resetDialect(cid) {
    app.draft.dialects[cid] = JSON.parse(JSON.stringify(STOCK_DIALECTS[cid]));
    stockView[cid] = false;
    setStatus("dialect reset to stock — updates keep it current again", "ok");
    edit();
  }

  /* which classes carry this app — shown on the master row */
  const carriedBy = (aid) =>
    Object.entries(classes || {}).filter(([, c]) => (c.apps || {})[aid] != null)
      .map(([cid, c]) => c.name || cid);
  /* which activities speak this class */
  const spokenBy = (cid) =>
    Object.values(app.draft?.activities || {})
      .filter((a) => a.context?.dialect === cid).map((a) => a.name);

  function setAppIcon(a, v) {
    v = (v || "").trim();
    delete a.icon; delete a.image;
    if (!v) return;
    if (v.startsWith("/") || v.startsWith("http")) a.image = v;
    else a.icon = v;
  }
  function renameApp(oldId, newId) {
    newId = (newId || "").trim();
    if (!newId || newId === oldId || apps[newId]) return;
    const rebuilt = {};
    for (const [k, v] of Object.entries(apps)) rebuilt[k === oldId ? newId : k] = v;
    app.draft.apps = rebuilt;
    /* class entries + include lists follow the id */
    for (const c of Object.values(classes || {}))
      if (c.apps && oldId in c.apps) {
        const r = {};
        for (const [k, v] of Object.entries(c.apps)) r[k === oldId ? newId : k] = v;
        c.apps = r;
      }
    for (const scr of Object.values(app.draft.screens || {}))
      for (const g of [scr.tiles || [], ...(scr.sections || []).map((s) => s.tiles || [])])
        for (const t of g)
          if (Array.isArray(t.include))
            t.include = t.include.map((x) => (x === oldId ? newId : x));
    edit();
  }
  function addApp() {
    if (!app.draft.apps) app.draft.apps = {};
    let id = "new_app", n = 2;
    while (app.draft.apps[id]) id = "new_app_" + n++;
    app.draft.apps[id] = { name: "New App", icon: "material:apps" };
    lastAdded = id;
    masterOpen = true;
  }
  function delApp(id) {
    const holders = carriedBy(id);
    if (holders.length) return; /* guarded in the UI */
    delete apps[id];
    edit();
  }

  /* ---- class ops ---- */
  const entryKind = (e) =>
    typeof e === "string" ? "source"
    : e?.sequence != null ? "sequence"
    : e?.source != null ? "source" : "action";
  const entrySummary = (e) => {
    if (typeof e === "string") return e;
    if (e?.source) return e.source;
    if (e?.sequence) return "action: " + e.sequence;
    return (e?.action || e?.service || "?") + (e?.data?.command ? " · " + e.data.command : "");
  };
  function setEntryKind(c, aid, kind) {
    if (kind === "source") c.apps[aid] = { source: "" };
    else if (kind === "sequence") c.apps[aid] = { sequence: seqOptions[0]?.value || "" };
    else c.apps[aid] = { action: "", data: {} };
    edit();
  }
  function addClass() {
    if (!app.draft.dialects) app.draft.dialects = {};
    let id = "new_class", n = 2;
    while (app.draft.dialects[id]) id = "new_class_" + n++;
    app.draft.dialects[id] = { name: "New Dialect", apps: {} };
    clsOpen[id] = true;
  }
  function renameClass(oldId, newId) {
    newId = (newId || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (!newId || newId === oldId || classes[newId]) return;
    const rebuilt = {};
    for (const [k, v] of Object.entries(classes)) rebuilt[k === oldId ? newId : k] = v;
    app.draft.dialects = rebuilt;
    /* activity contexts + hard-wired tiles follow */
    for (const a of Object.values(app.draft.activities || {}))
      if (a.context?.dialect === oldId) a.context.dialect = newId;
    for (const surf of [...Object.values(app.draft.screens || {}), ...Object.values(app.draft.controllers || {})])
      for (const g of [surf.tiles || [], ...(surf.sections || []).map((s) => s.tiles || [])])
        for (const t of g) if (t.class === oldId) t.class = newId; else if (t.dialect === oldId) t.dialect = newId;
    edit();
  }
  function delClass(cid) {
    if (spokenBy(cid).length) return;
    delete classes[cid];
    edit();
  }
</script>

{#if app.draft}
  <div class="space-y-4">
    <p class="m-0 text-xs text-dim">
      The <b>master list</b> is identity only — name + icon. A <b>dialect</b> is a platform's launch dialect: which apps it offers and
      how each one launches (its entry IS the curation). An activity
      picks its dialect in Setup (<b>App class</b>), so the shared Apps
      drawer speaks Fire TV for one activity and Tizen for another.
    </p>

    <!-- DIALECTS — the working layer, so they lead -->
    {#each Object.entries(classes || {}) as [cid, c] (cid)}
      <SectionFold label={(c.name || cid) + " — device class"}
        badge={Object.keys(c.apps || {}).length + " apps" +
          (spokenBy(cid).length ? " · spoken by " + spokenBy(cid).join(", ") : " · unused")}
        bind:open={() => clsOpen[cid] ?? false, (v) => (clsOpen[cid] = v)}>
        {#if isStockId(cid)}
          <div class="mb-3 flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-tile px-3 py-2">
            {#if dialectEdited(cid, c)}
              <span class="text-xs text-ink">✎ <b>Yours</b> — this dialect differs from the
                shipped one, so updates won't touch it. Peek at stock to copy what you
                need, or reset to track updates again.</span>
              <Button size="sm" onclick={() => (stockView[cid] = !stockView[cid])}>
                {stockView[cid] ? "Hide stock" : "View stock"}</Button>
              <Button size="sm" onclick={() => resetDialect(cid)}
                title="Replace this dialect with the shipped one — updates keep it current again">↺ Reset to stock</Button>
            {:else}
              <span class="text-xs text-dim">● <b>Stock</b> — untouched, so updates keep it
                current (new apps and command fixes arrive on their own). Edit anything and
                it becomes yours.</span>
            {/if}
          </div>
          {#if stockView[cid]}
            <div class="mb-3">
              <Field label={"Shipped " + (STOCK_DIALECTS[cid].name || cid) + " dialect (read-only — copy what you need)"}>
                <textarea readonly rows="14" spellcheck="false"
                  class="w-full rounded-[8px] border border-line bg-field px-2.5 py-1.5 font-mono text-[11.5px] text-ink outline-none"
                  >{JSON.stringify(STOCK_DIALECTS[cid], null, 2)}</textarea>
              </Field>
            </div>
          {/if}
        {/if}
        <div class="grid grid-cols-3 gap-3">
          <Field label="Class name"><Input bind:value={c.name} onchange={edit} /></Field>
          <Field label="Dialect id" hint="what activities and devices reference (context dialect)">
            <input value={cid} spellcheck="false"
              onchange={(e) => renameClass(cid, e.target.value)}
              class="w-full rounded-[8px] border border-line bg-field px-2.5 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-accent/60" />
          </Field>
          <div class="flex items-end pb-1">
            {#if !spokenBy(cid).length}
              <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-danger hover:underline"
                onclick={() => delClass(cid)}>delete class</button>
            {/if}
          </div>
        </div>
        <!-- WAKE (v0.83.9 — Suresh: a FireTV app launch while the box
             dozes leaves "screen remains blank or screen saver. I find
             the back button works"): fired before ANY app launch when
             the player reports off/idle/standby. "key:<id>" borrows
             this dialect's own key catalog; JSON = any HA action. -->
        <div class="grid grid-cols-3 gap-3">
          <Field label="Wake before launch"
            hint={'fires when the player is asleep — "key:back" uses this dialect\'s keys, {…} = JSON action, blank = off'}>
            <Input value={typeof c.wake === "string" ? c.wake : c.wake ? JSON.stringify(c.wake) : ""}
              placeholder="key:back" class="font-mono text-[12px]"
              onchange={(e2) => { const v = e2.target.value.trim();
                if (!v) delete c.wake;
                else if (v.startsWith("{")) { try { c.wake = JSON.parse(v); } catch { return; } }
                else c.wake = v;
                edit(); }} />
          </Field>
          <Field label="Wake → launch gap (ms)" hint="how long the screen gets to light up — blank = 600">
            <Input type="number" min="100" step="100"
              value={c.wake_delay ?? ""} placeholder="600"
              onchange={(e2) => { const n = parseInt(e2.target.value);
                if (n > 0) c.wake_delay = n; else delete c.wake_delay;
                edit(); }} />
          </Field>
        </div>
        <!-- D-PAD COMMANDS (v0.84.7 — forum report: an Apple TV
             answered "command not recognized" to every press, and the
             reporter went looking for command mapping exactly here and
             found only app launching). The engine sends Android/Fire TV
             names by default (UP/ENTER/BACK); a platform that speaks
             its own vocabulary declares it ONCE here and every device
             on this dialect is fixed. Blank = the default name. -->
        <SectionFold label="D-pad commands"
          badge={Object.keys(c.dpad_commands || {}).length
            ? Object.keys(c.dpad_commands).length + " remapped"
            : "defaults (Android / Fire TV names)"}
          bind:open={() => cmdOpen[cid] ?? false, (v) => (cmdOpen[cid] = v)}>
          <p class="m-0 mb-2 text-[11px] text-dim">
            What this platform's <b>remote.send_command</b> actually accepts.
            Leave blank to send the default name. Apple TV, for instance,
            only understands lowercase pyatv names and calls
            <code class="font-mono">UP</code> unrecognised.
          </p>
          <div class="grid grid-cols-3 gap-2">
            {#each DPAD_KEYS as k (k)}
              <Field label={k}>
                <Input value={(c.dpad_commands || {})[k] ?? ""}
                  placeholder={DPAD_FALLBACK[k]} class="font-mono text-[12px]"
                  onchange={(ev) => {
                    const v = ev.target.value.trim();
                    if (!c.dpad_commands) c.dpad_commands = {};
                    if (v) c.dpad_commands[k] = v; else delete c.dpad_commands[k];
                    if (!Object.keys(c.dpad_commands).length) delete c.dpad_commands;
                    edit();
                  }} />
              </Field>
            {/each}
          </div>
        </SectionFold>
        <div class="space-y-2">
          {#each Object.entries(c.apps || {}) as [aid, e] (aid)}
            <div class="rounded-[8px] bg-inset p-2">
              <div class="flex items-center gap-2">
                <span class="w-32 shrink-0 truncate text-xs font-bold text-ink" title={aid}>
                  {apps?.[aid]?.name || aid}</span>
                <Select value={entryKind(e)} class="w-32"
                  onchange={(ev) => setEntryKind(c, aid, ev.target.value)}
                  options={[
                    { value: "source", label: "Source / pkg" },
                    { value: "action", label: "HA action" },
                    { value: "sequence", label: "Run action" },
                  ]} />
                <div class="min-w-0 flex-1">
                  {#if entryKind(e) === "source"}
                    <Input value={typeof e === "string" ? e : e.source}
                      placeholder="source name or package (com.netflix.ninja)"
                      class="font-mono text-[12px]"
                      onchange={(ev) => { c.apps[aid] = { source: ev.target.value }; edit(); }} />
                  {:else if entryKind(e) === "sequence"}
                    <Select value={e.sequence} options={seqOptions}
                      onchange={(ev) => { c.apps[aid] = { sequence: ev.target.value }; edit(); }} />
                  {:else}
                    <span class="block truncate font-mono text-[11px] text-dim" title={JSON.stringify(e)}>
                      {entrySummary(e)}</span>
                  {/if}
                </div>
                <button class="shrink-0 cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-danger"
                  title="Remove from this class (the app stays in the master list)"
                  onclick={() => { delete c.apps[aid]; edit(); }}>✕</button>
              </div>
              {#if entryKind(e) === "action"}
                <div class="mt-1.5">
                  <JsonArea value={e} rows={4} onchange={(v) => { c.apps[aid] = v; edit(); }} />
                </div>
              {/if}
            </div>
          {/each}
          <div class="flex items-center gap-2">
            <Select value="" allowEmpty class="w-56"
              options={Object.keys(apps || {}).filter((x) => !(c.apps || {})[x])
                .map((x) => ({ value: x, label: apps[x]?.name || x }))}
              onchange={(ev) => { if (!ev.target.value) return;
                if (!c.apps) c.apps = {};
                c.apps[ev.target.value] = { source: "" };
                ev.target.value = ""; edit(); }} />
            <span class="text-xs text-dim">← add an app from the master list</span>
          </div>
        </div>
      </SectionFold>
    {/each}
    <Button size="sm" onclick={addClass}>＋ Add device class</Button>

    <!-- MASTER LIST — collapsed by default; it's a phone book -->
    <SectionFold label="Master list" badge={Object.keys(apps || {}).length + " apps — identity only"}
      bind:open={masterOpen}>
      <div class="space-y-2">
        {#each Object.entries(apps || {}) as [id, a] (id)}
          <CardRow title={a.name || id}
            subtitle={id + (carriedBy(id).length ? " · in " + carriedBy(id).join(", ") : " · in no class yet")}
            open={id === lastAdded}
            ondelete={carriedBy(id).length
              ? () => {} : () => delApp(id)}>
            <div class="grid grid-cols-3 gap-3">
              <Field label="Name"><Input bind:value={a.name} onchange={edit} /></Field>
              <Field label="App id" hint="renames refs in classes & drawers">
                <input value={id} spellcheck="false"
                  onchange={(e) => renameApp(id, e.target.value)}
                  class="w-full rounded-[8px] border border-line bg-field px-2.5 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-accent/60" />
              </Field>
              <Field label="Icon" hint="search icons · or an image path (/local/…)">
                <IconPicker value={a.image || a.icon || ""}
                  onchange={(e) => { setAppIcon(a, e.target.value); edit(); }} />
              </Field>
            </div>
            {#if carriedBy(id).length}
              <p class="mt-2 mb-0 text-[11px] text-dim">Delete is guarded — remove it from
                {carriedBy(id).join(", ")} first.</p>
            {/if}
          </CardRow>
        {/each}
        <Button size="sm" onclick={addApp}>＋ Add app</Button>
      </div>
    </SectionFold>
  </div>
{/if}
